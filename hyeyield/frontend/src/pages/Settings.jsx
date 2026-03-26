import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const PLACEHOLDER = '••••••••••••••••';

export default function Settings() {
  const [cron, setCron] = useState('');
  const [ntfyTopic, setNtfyTopic] = useState('');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [hasCredentials, setHasCredentials] = useState(false);
  const [hasConnected, setHasConnected] = useState(false);
  const [cronMsg, setCronMsg] = useState('');
  const [ntfyMsg, setNtfyMsg] = useState('');
  const [schwabMsg, setSchwabMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/invest/schedule').then((r) => setCron(r.data.schedule_cron || '')),
      api.get('/auth/me').then((r) => {
        setNtfyTopic(r.data.ntfy_topic || '');
        setHasCredentials(r.data.has_schwab_credentials);
        setHasConnected(r.data.has_schwab_connected);
      }),
    ]).finally(() => setLoading(false));
  }, []);

  const connectSchwab = async () => {
    try {
      const res = await api.get('/schwab/auth-url');
      window.location.href = res.data.auth_url;
    } catch (err) {
      setSchwabMsg(err.response?.data?.detail || 'Could not get auth URL.');
    }
  };

  const saveCron = async (e) => {
    e.preventDefault();
    setCronMsg('');
    try {
      await api.put('/invest/schedule', { schedule_cron: cron });
      setCronMsg('Schedule saved.');
    } catch (err) {
      setCronMsg(err.response?.data?.detail || 'Failed');
    }
  };

  const saveNtfy = async (e) => {
    e.preventDefault();
    setNtfyMsg('');
    try {
      await api.put('/auth/me', { ntfy_topic: ntfyTopic });
      setNtfyMsg('Notifications saved.');
    } catch (err) {
      setNtfyMsg(err.response?.data?.detail || 'Failed');
    }
  };

  const saveSchwab = async (e) => {
    e.preventDefault();
    setSchwabMsg('');
    const payload = {};
    if (appKey) payload.app_key = appKey;
    if (appSecret) payload.app_secret = appSecret;
    if (!payload.app_key && !payload.app_secret) {
      setSchwabMsg('Enter a new value to update.');
      return;
    }
    try {
      await api.put('/auth/me', payload);
      setAppKey('');
      setAppSecret('');
      setHasCredentials(true);
      setSchwabMsg('Credentials saved. Redirecting to Schwab…');
      const res = await api.get('/schwab/auth-url');
      window.location.href = res.data.auth_url;
    } catch (err) {
      setSchwabMsg(err.response?.data?.detail || 'Failed');
    }
  };

  if (loading) return <Layout><p>Loading…</p></Layout>;

  return (
    <Layout>
      <h2>Settings</h2>

      <section style={{ marginBottom: '2rem', maxWidth: '400px' }}>
        <h3>Investment Schedule</h3>
        <form onSubmit={saveCron}>
          <label>Cron Expression</label><br />
          <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * 1" style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', marginBottom: '0.5rem' }} />
          <small style={{ color: '#888', display: 'block', marginBottom: '0.75rem' }}>Format: minute hour day month weekday (America/New_York)</small>
          {cronMsg && <p style={{ color: cronMsg.includes('Failed') ? 'red' : 'green' }}>{cronMsg}</p>}
          <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save Schedule</button>
        </form>
      </section>

      <section style={{ marginBottom: '2rem', maxWidth: '400px' }}>
        <h3>Push Notifications (ntfy.sh)</h3>
        <form onSubmit={saveNtfy}>
          <label>ntfy Topic</label><br />
          <input value={ntfyTopic} onChange={(e) => setNtfyTopic(e.target.value)} placeholder="my-hyeyield-topic" style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', marginBottom: '0.75rem' }} />
          {ntfyMsg && <p style={{ color: ntfyMsg.includes('Failed') ? 'red' : 'green' }}>{ntfyMsg}</p>}
          <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
        </form>
      </section>

      <section style={{ maxWidth: '400px' }}>
        <h3>Schwab Configuration</h3>
        <form onSubmit={saveSchwab}>
          <div style={{ marginBottom: '1rem' }}>
            <label>App Key</label><br />
            <input
              type="password"
              value={appKey}
              onChange={(e) => setAppKey(e.target.value)}
              placeholder={hasCredentials ? PLACEHOLDER : 'Enter App Key'}
              style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
            />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>App Secret</label><br />
            <input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={hasCredentials ? PLACEHOLDER : 'Enter App Secret'}
              style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
            />
          </div>
          <small style={{ color: '#888', display: 'block', marginBottom: '0.75rem' }}>
            {hasCredentials ? 'Credentials are set. Type new values to replace them.' : 'No credentials saved yet.'}
          </small>
          {hasCredentials && (
            <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Status:{' '}
              <strong style={{ color: hasConnected ? 'green' : '#cc7700' }}>
                {hasConnected ? 'Connected to Schwab' : 'Not connected'}
              </strong>
            </p>
          )}
          {schwabMsg && <p style={{ color: schwabMsg.includes('Failed') || schwabMsg.includes('failed') ? 'red' : 'green' }}>{schwabMsg}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Update Credentials
            </button>
            {hasCredentials && (
              <button type="button" onClick={connectSchwab} style={{ padding: '0.5rem 1rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {hasConnected ? 'Re-connect Schwab' : 'Connect Schwab'}
              </button>
            )}
          </div>
        </form>
      </section>
    </Layout>
  );
}
