import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Accounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const load = () => api.get('/accounts').then((r) => setAccounts(r.data));
  useEffect(() => { load(); }, []);

  const startConnect = async () => {
    try {
      const res = await api.get('/schwab/auth-url');
      window.open(res.data.auth_url, '_blank');
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not get auth URL. Make sure Schwab credentials are configured in Settings.');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await api.post('/schwab/sync');
      setSyncMsg(`Sync complete — ${res.data.synced} new account(s) added.`);
      load();
    } catch (err) {
      setSyncMsg(err.response?.data?.detail || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggle = async (account) => {
    await api.put(`/accounts/${account.id}`, { enabled: !account.enabled });
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this account?')) return;
    await api.delete(`/accounts/${id}`);
    load();
  };

  const isConnected = user?.has_schwab_connected;

  return (
    <Layout>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Accounts</h2>
        <button
          onClick={startConnect}
          style={{ padding: '0.5rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          {isConnected ? 'Re-connect Schwab' : 'Connect Schwab'}
        </button>
        {isConnected && (
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ padding: '0.5rem 1rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {syncing ? 'Syncing…' : 'Sync Accounts'}
          </button>
        )}
        {syncMsg && <span style={{ fontSize: '0.85rem', color: '#555' }}>{syncMsg}</span>}
      </div>

      {!isConnected && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Not connected to Schwab. Click <strong>Connect Schwab</strong> to authorize and automatically discover your accounts.
        </div>
      )}

      {accounts.length === 0 ? (
        <p style={{ color: '#888' }}>No accounts yet. Connect Schwab to auto-discover your accounts.</p>
      ) : (
        accounts.map((a) => (
          <div key={a.id} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <strong>{a.account_name}</strong>
              <span style={{ fontSize: '0.8rem', color: '#888' }}>{a.account_number} · {a.account_type}</span>
              <span style={{ fontSize: '0.8rem', color: a.connected ? 'green' : '#888' }}>{a.connected ? 'Connected' : 'Not connected'}</span>
              <span style={{ fontSize: '0.8rem', color: a.enabled ? 'green' : '#888' }}>{a.enabled ? 'Enabled' : 'Disabled'}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => handleToggle(a)} style={{ padding: '0.3rem 0.7rem', cursor: 'pointer' }}>
                  {a.enabled ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => handleDelete(a.id)} style={{ padding: '0.3rem 0.7rem', color: 'red', cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))
      )}

    </Layout>
  );
}
