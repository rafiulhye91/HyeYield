import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

// ── helpers ──────────────────────────────────────────────────────────
const fmt = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtShort = (n) => n != null ? `$${Math.round(n).toLocaleString('en-US')}` : '—';
const lastFour = (num) => num ? `...${String(num).slice(-3)}` : '';

const PILL_COLORS = [
  { bg: '#DBEAFE', color: '#1E40AF' },
  { bg: '#E1F5EE', color: '#085041' },
  { bg: '#FAEEDA', color: '#633806' },
  { bg: '#F3E8FF', color: '#6B21A8' },
  { bg: '#FEE2E2', color: '#991B1B' },
];

// ── sub-components ───────────────────────────────────────────────────
function Badge({ connected, enabled }) {
  if (!enabled) return <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', fontWeight: 500, background: '#F3F4F6', color: '#6B7280' }}>Disabled</span>;
  if (!connected) return <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', fontWeight: 500, background: '#FEE2E2', color: '#991B1B' }}>Disconnected</span>;
  return <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', fontWeight: 500, background: '#DCFCE7', color: '#166534' }}>Connected</span>;
}

function StatRow({ label, value, green }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
      <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: '11px', fontWeight: 500, color: green ? '#166534' : 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
}

function AccountCard({ b }) {
  const hasData = b.connected && b.enabled && b.total_value != null;
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{b.account_name} {lastFour(b.account_number)}</span>
        <Badge connected={b.connected} enabled={b.enabled} />
      </div>
      <StatRow label="Total value" value={hasData ? fmt(b.total_value) : '—'} />
      <StatRow label="Cash available" value={hasData ? fmt(b.cash) : '—'} green={hasData && b.cash > 0} />
      <StatRow label={b.enabled ? 'Invested' : 'Status'} value={b.enabled ? (hasData ? fmt(b.invested) : '—') : 'Paused by you'} />
      {hasData && (
        <>
          <div style={{ fontSize: '20px', fontWeight: 500, marginTop: '8px' }}>{fmtShort(b.total_value)}</div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>total portfolio value</div>
        </>
      )}
    </div>
  );
}

function RotationCard({ accounts, rotations }) {
  if (!accounts.length) return null;
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', padding: '14px 16px', marginBottom: '20px' }}>
      {accounts.map((a, i) => {
        const rot = rotations[a.account_id] || [];
        return (
          <div key={a.account_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: i < accounts.length - 1 ? '8px' : 0, marginBottom: i < accounts.length - 1 ? '8px' : 0, borderBottom: i < accounts.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 500 }}>{a.account_name} {lastFour(a.account_number)}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>
                Run #{a.rotation_state + 1}{a.last_run ? ` · Last run ${new Date(a.last_run).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${new Date(a.last_run).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {rot.map((sym, idx) => (
                <span key={sym}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: 500, background: PILL_COLORS[idx % PILL_COLORS.length].bg, color: PILL_COLORS[idx % PILL_COLORS.length].color }}>{sym}</span>
                  {idx < rot.length - 1 && <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', margin: '0 2px' }}>→</span>}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DryRunModal({ result, onClose, onInvest }) {
  if (!result) return null;
  return (
    <div style={{ background: 'rgba(0,0,0,0.45)', borderRadius: 'var(--border-radius-lg)', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
      <div style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--border-radius-lg)', padding: '20px', width: '340px', border: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ background: '#DBEAFE', borderRadius: 'var(--border-radius-md)', padding: '8px 12px', textAlign: 'center', fontSize: '11px', fontWeight: 500, color: '#1E40AF', marginBottom: '12px' }}>DRY RUN — No orders were placed</div>
        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Simulated results</div>
        {result.map((acct, i) => (
          <div key={i}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
              {acct.account_name} {lastFour(acct.account_number)} · {fmt(acct.cash_before)} available · Run #{acct.rotation_used + 1}
            </div>
            {acct.error
              ? <div style={{ color: '#991B1B', fontSize: '12px', marginBottom: '8px' }}>{acct.error}</div>
              : acct.orders.map((o, j) => (
                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '12px' }}>
                  <span style={{ fontWeight: 500 }}>{o.symbol}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{o.shares} share{o.shares !== 1 ? 's' : ''} @ {o.price ? `$${o.price.toFixed(2)}` : '—'}</span>
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', fontWeight: 500, background: '#DCFCE7', color: '#166534' }}>{o.status}</span>
                </div>
              ))
            }
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '7px', border: '0.5px solid var(--color-border-secondary)', background: 'none', borderRadius: 'var(--border-radius-md)', fontSize: '12px', cursor: 'pointer' }}>Close</button>
          <button onClick={onInvest} style={{ flex: 1, padding: '7px', background: '#2563eb', border: 'none', borderRadius: 'var(--border-radius-md)', fontSize: '12px', color: '#fff', fontWeight: 500, cursor: 'pointer' }}>Invest for real →</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ onCancel, onConfirm, running }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.45)', borderRadius: 'var(--border-radius-lg)', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
      <div style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--border-radius-lg)', padding: '20px', width: '340px', border: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Place real orders?</div>
        <div style={{ background: '#FEE2E2', borderRadius: 'var(--border-radius-md)', padding: '8px 12px', fontSize: '11px', color: '#991B1B', marginBottom: '12px' }}>
          This will place REAL orders using real money in your Schwab account. This cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '7px', border: '0.5px solid var(--color-border-secondary)', background: 'none', borderRadius: 'var(--border-radius-md)', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={running} style={{ flex: 1, padding: '7px', background: '#dc2626', border: 'none', borderRadius: 'var(--border-radius-md)', fontSize: '12px', color: '#fff', fontWeight: 500, cursor: 'pointer' }}>
            {running ? 'Investing…' : 'Yes, invest now'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────
export default function Dashboard() {
  const [balances, setBalances] = useState([]);
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [rotations, setRotations] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'dry' | 'confirm' | 'result'
  const [dryResult, setDryResult] = useState(null);
  const [liveResult, setLiveResult] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.get('/accounts').then(async (r) => {
      const accounts = r.data;

      // Fetch balances — merge by account_id, fall back gracefully on error
      let balanceMap = {};
      try {
        const br = await api.get('/schwab/balances');
        br.data.forEach((b) => { balanceMap[b.account_id] = b; });
      } catch (_) {}

      // Build unified card data from accounts list (source of truth)
      const cards = accounts.map((a) => ({
        account_id: a.id,
        account_name: a.account_name,
        account_number: a.account_number,
        connected: a.connected,
        enabled: a.enabled,
        ...(balanceMap[a.id] || {}),
      }));
      setBalances(cards);

      // Rotation data for connected+enabled accounts
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
    }).finally(() => setLoading(false));
  }, []);

  const disconnected = balances.filter((b) => b.enabled && !b.connected);

  const runDry = async () => {
    setRunning(true);
    try {
      const res = await api.post('/invest/dry-run');
      setDryResult(res.data);
      setModal('dry');
    } catch (err) {
      alert(err.response?.data?.detail || 'Dry run failed');
    } finally {
      setRunning(false);
    }
  };

  const runLive = async () => {
    setRunning(true);
    try {
      const res = await api.post('/invest/live', {}, { headers: { 'X-Confirm-Live': 'true' } });
      setLiveResult(res.data);
      setModal('result');
    } catch (err) {
      alert(err.response?.data?.detail || 'Live invest failed');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <Layout><p style={{ color: 'var(--color-text-secondary)' }}>Loading…</p></Layout>;

  return (
    <Layout>
      {disconnected.length > 0 && (
        <div style={{ background: '#FEF9C3', border: '0.5px solid #EF9F27', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#633806' }}>
          <span>{disconnected.map((b) => `${b.account_name} ${lastFour(b.account_number)}`).join(', ')} — Schwab connection needs renewal. Token expired.</span>
          <a href="/accounts" style={{ background: '#EF9F27', color: '#412402', border: 'none', borderRadius: 'var(--border-radius-md)', padding: '4px 10px', fontSize: '11px', fontWeight: 500, textDecoration: 'none' }}>Reconnect now</a>
        </div>
      )}

      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account balances</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {balances.length === 0
          ? <p style={{ color: 'var(--color-text-tertiary)', fontSize: '13px' }}>No accounts found. Add one in Accounts.</p>
          : balances.map((b) => <AccountCard key={b.account_id} b={b} />)
        }
      </div>

      {connectedAccounts.length > 0 && (
        <>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Next run order</div>
          <RotationCard accounts={connectedAccounts} rotations={rotations} />
        </>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={runDry} disabled={running} style={{ flex: 1, padding: '10px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
          {running && modal === null ? 'Running…' : 'Run dry run'}
        </button>
        <button onClick={() => setModal('confirm')} disabled={running} style={{ flex: 1, padding: '10px', background: '#2563eb', border: 'none', borderRadius: 'var(--border-radius-md)', fontSize: '13px', fontWeight: 500, color: '#fff', cursor: 'pointer' }}>
          Invest now (live)
        </button>
      </div>

      {modal === 'dry' && (
        <DryRunModal
          result={dryResult}
          onClose={() => setModal(null)}
          onInvest={() => setModal('confirm')}
        />
      )}

      {modal === 'confirm' && (
        <ConfirmModal
          onCancel={() => setModal(null)}
          onConfirm={runLive}
          running={running}
        />
      )}

      {modal === 'result' && liveResult && (
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', padding: '20px', marginBottom: '8px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '12px' }}>Orders placed</div>
          {liveResult.map((acct, i) => (
            <div key={i} style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>{acct.account_name}</div>
              {acct.error
                ? <div style={{ color: '#991B1B', fontSize: '12px' }}>{acct.error}</div>
                : acct.orders.map((o, j) => (
                  <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '12px' }}>
                    <span style={{ fontWeight: 500 }}>{o.symbol}</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{o.shares} shares @ ${o.price?.toFixed(2)}</span>
                    <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', fontWeight: 500, background: '#DCFCE7', color: '#166534' }}>{o.status}</span>
                  </div>
                ))
              }
            </div>
          ))}
          <button onClick={() => setModal(null)} style={{ marginTop: '8px', padding: '7px 14px', border: '0.5px solid var(--color-border-secondary)', background: 'none', borderRadius: 'var(--border-radius-md)', fontSize: '12px', cursor: 'pointer' }}>Close</button>
        </div>
      )}
    </Layout>
  );
}
