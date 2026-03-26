import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

export default function Settings() {
  const [cron, setCron] = useState('');
  const [ntfyTopic, setNtfyTopic] = useState('');
  const [cronMsg, setCronMsg] = useState('');
  const [ntfyMsg, setNtfyMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/invest/schedule').then((r) => setCron(r.data.schedule_cron || '')),
      api.get('/auth/me').then((r) => setNtfyTopic(r.data.ntfy_topic || '')),
    ]).finally(() => setLoading(false));
  }, []);

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

      <section style={{ maxWidth: '400px' }}>
        <h3>Push Notifications (ntfy.sh)</h3>
        <form onSubmit={saveNtfy}>
          <label>ntfy Topic</label><br />
          <input value={ntfyTopic} onChange={(e) => setNtfyTopic(e.target.value)} placeholder="my-hyeyield-topic" style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', marginBottom: '0.75rem' }} />
          {ntfyMsg && <p style={{ color: ntfyMsg.includes('Failed') ? 'red' : 'green' }}>{ntfyMsg}</p>}
          <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
        </form>
      </section>
    </Layout>
  );
}
