import { createContext, useContext, useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const { user } = useAuth();
  const [balances, setBalances] = useState([]);
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [rotations, setRotations] = useState({});
  const [loading, setLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const initialized = useRef(false);

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

      if (withBalances) {
        setBalancesLoading(true);
        try {
          const br = await api.get('/schwab/balances');
          const balanceMap = {};
          br.data.forEach((b) => { balanceMap[b.account_id] = b; });
          setBalances((prev) => prev.map((c) => ({ ...c, ...(balanceMap[c.account_id] || {}) })));
        } catch (_) {}
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

  const reset = () => {
    initialized.current = false;
    setBalances([]);
    setConnectedAccounts([]);
    setRotations({});
    setLoading(true);
    setBalancesLoading(true);
  };

  return (
    <DashboardContext.Provider value={{ balances, connectedAccounts, rotations, loading, balancesLoading, syncing, sync, reset }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  return useContext(DashboardContext);
}
