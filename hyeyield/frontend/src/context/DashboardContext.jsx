import { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  const initialized = useRef(!!cache);

  useEffect(() => {
    if (!user) return;
    if (initialized.current) return;
    initialized.current = true;
    loadAccounts(true);
  }, [user]);

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

      // Load schedules in parallel
      const schedRes = await fetchSchedules();
      setSchedules(schedRes);

      if (withBalances) {
        setBalancesLoading(true);
        try {
          const br = await api.get('/schwab/balances');
          const balanceMap = {};
          br.data.forEach((b) => { balanceMap[b.account_id] = b; });
          setBalances((prev) => {
            const updated = prev.map((c) => ({ ...c, ...(balanceMap[c.account_id] || {}) }));
            saveCache({ balances: updated, connectedAccounts: connected, rotations: map, schedules: schedRes });
            return updated;
          });
        } catch (_) {
          saveCache({ balances: cards, connectedAccounts: connected, rotations: map, schedules: schedRes });
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

  const addSchedule = (s) => setSchedules(prev => {
    const filtered = prev.filter(x => x.account_id !== s.account_id);
    return [...filtered, s];
  });

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
    setLoading(true);
    setBalancesLoading(false);
  };

  return (
    <DashboardContext.Provider value={{ balances, connectedAccounts, rotations, schedules, loading, balancesLoading, syncing, sync, addSchedule, updateSchedule, removeSchedule, reset }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  return useContext(DashboardContext);
}
