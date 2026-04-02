import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const DashboardContext = createContext(null);
const CACHE_KEY = 'dashboard_cache';

const saveCache = (data) => sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
const loadCache = () => { try { return JSON.parse(sessionStorage.getItem(CACHE_KEY)); } catch { return null; } };
const clearCache = () => sessionStorage.removeItem(CACHE_KEY);

export async function fetchSchedules() {
  try { const r = await api.get('/schedules'); return r.data; } catch { return []; }
}

export function DashboardProvider({ children }) {
  const { user } = useAuth();
  const cache = loadCache();
  const [balances, setBalances] = useState(cache?.balances || []);
  const [connectedAccounts, setConnectedAccounts] = useState(cache?.connectedAccounts || []);
  const [rotations, setRotations] = useState(cache?.rotations || {});
  const [loading, setLoading] = useState(!cache);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [schedules, setSchedules] = useState(cache?.schedules || []);
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState(cache?.history || []);
  const initialized = useRef(!!cache);

  useEffect(() => {
    if (!user) return;
    if (initialized.current) {
      // Cache hit — accounts/balances already in state, but always refresh schedules+history
      refreshSchedules();
      return;
    }
    initialized.current = true;
    loadAccounts(true);
  }, [user]);

  // Refresh schedules, history, and account last_run; also persists to cache
  const refreshSchedules = useCallback(async () => {
    try {
      const [schedRes, histRes, acctRes] = await Promise.all([
        fetchSchedules(),
        api.get('/logs', { params: { page: 1 } }).then(r => r.data).catch(() => []),
        api.get('/accounts').then(r => r.data).catch(() => null),
      ]);
      const hist50 = histRes.slice(0, 50);
      setSchedules(schedRes);
      setHistory(hist50);
      if (acctRes) {
        setBalances(prev => {
          const updated = prev.map(b => {
            const a = acctRes.find(a => a.id === b.account_id);
            return a ? { ...b, last_run: a.last_run, connected: a.connected, enabled: a.enabled } : b;
          });
          // Persist fresh schedule/history data so the next page load isn't stale
          const cached = loadCache();
          if (cached) saveCache({ ...cached, schedules: schedRes, history: hist50, balances: updated });
          return updated;
        });
      } else {
        const cached = loadCache();
        if (cached) saveCache({ ...cached, schedules: schedRes, history: hist50 });
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(refreshSchedules, 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') refreshSchedules(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [user, refreshSchedules]);

  // ntfy subscription: refresh as soon as the ntfy notification is delivered (~5s)
  useEffect(() => {
    if (!user?.ntfy_topic) return;

    const es = new EventSource(`https://ntfy.sh/${encodeURIComponent(user.ntfy_topic)}/sse`);

    const handler = () => {
      window.dispatchEvent(new CustomEvent('hyeyield:schedule-ran'));
      refreshSchedules();
    };

    es.addEventListener('message', handler);
    return () => {
      es.removeEventListener('message', handler);
      es.close();
    };
  }, [user?.ntfy_topic, refreshSchedules]);

  // Custom SSE: fallback push from our own backend
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const base = import.meta.env.VITE_API_URL || '';
    let es = null;
    let reconnectTimer = null;

    const connect = (isReconnect = false) => {
      es = new EventSource(`${base}/events?token=${encodeURIComponent(token)}`);

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          // On reconnect, refresh immediately — we may have missed a schedule_ran event
          if (data.type === 'connected' && isReconnect) {
            refreshSchedules();
          }
          if (data.type === 'schedule_ran') {
            window.dispatchEvent(new CustomEvent('hyeyield:schedule-ran'));
            refreshSchedules();
          }
        } catch (_) {}
      };

      es.onerror = () => {
        es.close();
        reconnectTimer = setTimeout(() => connect(true), 5000);
      };
    };

    connect(false);

    return () => {
      if (es) es.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [user, refreshSchedules]);

  const loadAccounts = async (withBalances = false) => {
    try {
      const r = await api.get('/accounts');
      const accounts = r.data;

      const cards = accounts.map((a) => ({
        account_id: a.id,
        account_name: a.account_name,
        account_number: a.account_number,
        account_type: a.account_type,
        connected: a.connected,
        enabled: a.enabled,
        last_run: a.last_run,
        rotation_state: a.rotation_state,
      }));
      setBalances(cards);

      const connected = accounts.filter((a) => a.connected && a.enabled);
      setConnectedAccounts(connected);

      const allocs = await Promise.all(
        connected.map((a) =>
          api.get(`/accounts/${a.id}/allocations`)
            .then((ar) => ({ id: a.id, symbols: ar.data.map((al) => al.symbol) }))
            .catch(() => ({ id: a.id, symbols: [] }))
        )
      );
      const map = {};
      allocs.forEach(({ id, symbols }) => { map[id] = symbols; });
      setRotations(map);
      setLoading(false);

      // Load schedules and history in parallel
      const [schedRes, histRes] = await Promise.all([
        fetchSchedules(),
        api.get('/logs', { params: { page: 1 } }).then(r => r.data).catch(() => []),
      ]);
      setSchedules(schedRes);
      setHistory(histRes.slice(0, 50));

      if (withBalances) {
        setBalancesLoading(true);
        try {
          const br = await api.get('/schwab/balances');
          const balanceMap = {};
          br.data.forEach((b) => { balanceMap[b.account_id] = b; });
          setBalances((prev) => {
            const updated = prev.map((c) => ({ ...c, ...(balanceMap[c.account_id] || {}) }));
            saveCache({ balances: updated, connectedAccounts: connected, rotations: map, schedules: schedRes, history: histRes.slice(0, 50) });
            return updated;
          });
        } catch (_) {
          saveCache({ balances: cards, connectedAccounts: connected, rotations: map, schedules: schedRes, history: histRes.slice(0, 50) });
        }
        setBalancesLoading(false);
      }
    } catch (_) {
      setLoading(false);
      setBalancesLoading(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await api.post('/schwab/sync');
      await loadAccounts(true);
    } catch (_) {}
    setSyncing(false);
  };

  const addSchedule = (s) => setSchedules(prev => [...prev, s]);

  const updateSchedule = (updated) => setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));

  const removeSchedule = async (id) => {
    await api.delete(`/schedules/${id}`);
    setSchedules(prev => prev.filter(s => s.id !== id));
  };

  const reset = () => {
    clearCache();
    initialized.current = false;
    setBalances([]);
    setConnectedAccounts([]);
    setRotations({});
    setSchedules([]);
    setHistory([]);
    setLoading(true);
    setBalancesLoading(false);
  };

  return (
    <DashboardContext.Provider value={{ balances, connectedAccounts, rotations, schedules, history, loading, balancesLoading, syncing, sync, addSchedule, updateSchedule, removeSchedule, reset }}>
      {children}
    </DashboardContext.Provider>
  );

}

export function useDashboard() {
  return useContext(DashboardContext);
}
