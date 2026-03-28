import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

export default function History() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = (p) => {
    setLoading(true);
    api.get(`/logs?page=${p}`)
      .then((r) => { setLogs(r.data.items); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  const totalPages = Math.ceil(total / 50);

  return (
    <Layout>
      <h2>Trade History</h2>
      {loading ? <p>Loading…</p> : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f4f4f4' }}>
                {['Time', 'Account', 'Symbol', 'Shares', 'Price', 'Total', 'Status', 'Note'].map((h) => (
                  <th key={h} style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ padding: '0.4rem' }}>{l.account_name || l.account_id}</td>
                  <td style={{ padding: '0.4rem' }}>{l.symbol}</td>
                  <td style={{ padding: '0.4rem' }}>{l.shares ?? '—'}</td>
                  <td style={{ padding: '0.4rem' }}>{l.price != null ? `$${l.price.toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '0.4rem' }}>{l.total_cost != null ? `$${l.total_cost.toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '0.4rem', color: l.status === 'FAILED' ? 'red' : l.status === 'DRY_RUN' ? '#888' : 'green' }}>{l.status}</td>
                  <td style={{ padding: '0.4rem', color: '#888' }}>{l.message || ''}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '1rem', textAlign: 'center', color: '#888' }}>No trade history.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => setPage(page - 1)} disabled={page <= 1} style={{ padding: '0.3rem 0.7rem', cursor: 'pointer' }}>Prev</button>
            <span>Page {page} of {totalPages || 1}</span>
            <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} style={{ padding: '0.3rem 0.7rem', cursor: 'pointer' }}>Next</button>
          </div>
        </>
      )}
    </Layout>
  );
}
