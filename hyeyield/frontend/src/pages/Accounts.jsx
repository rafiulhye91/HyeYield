import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Accounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [redirectUrl, setRedirectUrl] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const load = () => api.get('/accounts').then((r) => setAccounts(r.data));
  useEffect(() => { load(); }, []);

  const startConnect = async () => {
    try {
      const res = await api.get('/schwab/auth-url');
      setAuthUrl(res.data.auth_url);
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not get auth URL. Make sure Schwab credentials are configured in Settings.');
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    try {
      await api.post('/schwab/connect', { redirect_url: redirectUrl });
      setAuthUrl('');
      setRedirectUrl('');
      setSyncMsg('Connected! Accounts discovered and synced.');
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Connect failed');
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

      {authUrl && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '2rem', borderRadius: '8px', maxWidth: '520px', width: '90%' }}>
            <h3 style={{ marginTop: 0 }}>Connect to Schwab</h3>
            <p>1. <a href={authUrl} target="_blank" rel="noreferrer">Open Schwab authorization page</a></p>
            <p>2. After authorizing, Schwab will redirect you to a page that fails to load — that's expected. Copy the full URL from your browser's address bar and paste it below.</p>
            <form onSubmit={handleConnect}>
              <input
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                required
                placeholder="https://hyeyield.duckdns.org/redirect?code=..."
                style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Connect
                </button>
                <button type="button" onClick={() => { setAuthUrl(''); setRedirectUrl(''); }} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
