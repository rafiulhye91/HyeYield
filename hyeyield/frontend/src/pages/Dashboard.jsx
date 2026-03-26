import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

export default function Dashboard() {
  const [balances, setBalances] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/schwab/balances').then((r) => setBalances(r.data)),
      api.get('/invest/schedule').then((r) => setSchedule(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  const runDryRun = async () => {
    setRunning(true);
    setDryRunResult(null);
    try {
      const res = await api.post('/invest/dry-run');
      setDryRunResult(res.data);
    } catch (err) {
      setDryRunResult({ error: err.response?.data?.detail || 'Failed' });
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <Layout><p>Loading…</p></Layout>;

  return (
    <Layout>
      <h2>Dashboard</h2>

      <section style={{ marginBottom: '2rem' }}>
        <h3>Account Balances</h3>
        {balances.length === 0 && <p style={{ color: '#888' }}>No connected accounts.</p>}
        {balances.map((b) => (
          <div key={b.account_id} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', marginBottom: '0.75rem' }}>
            <strong>{b.account_name}</strong>
            {b.error
              ? <p style={{ color: 'red' }}>Error: {b.error}</p>
              : <pre style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{JSON.stringify(b.data, null, 2)}</pre>}
          </div>
        ))}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h3>Schedule</h3>
        {schedule
          ? <p>Cron: <code>{schedule.schedule_cron}</code></p>
          : <p style={{ color: '#888' }}>No schedule set.</p>}
      </section>

      <section>
        <h3>Dry Run</h3>
        <button onClick={runDryRun} disabled={running} style={{ padding: '0.6rem 1.2rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {running ? 'Running…' : 'Run Dry Run'}
        </button>
        {dryRunResult && (
          <pre style={{ marginTop: '1rem', fontSize: '0.8rem', background: '#f4f4f4', padding: '1rem', borderRadius: '4px' }}>
            {JSON.stringify(dryRunResult, null, 2)}
          </pre>
        )}
      </section>
    </Layout>
  );
}
