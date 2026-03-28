import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useDashboard } from '../context/DashboardContext';
import CreateScheduleDialog from './CreateScheduleDialog';

// ── helpers ──────────────────────────────────────────────────────────
const fmt    = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtShort = (n) => n != null ? `$${Math.round(n).toLocaleString('en-US')}` : '—';
const lastThree = (num) => num ? `...${String(num).slice(-3)}` : '';
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

const PILL_COLORS = [
  { bg: '#DBEAFE', color: '#1E40AF' },
  { bg: '#E1F5EE', color: '#085041' },
  { bg: '#FAEEDA', color: '#633806' },
  { bg: '#F3E8FF', color: '#6B21A8' },
  { bg: '#FEE2E2', color: '#991B1B' },
];

const orderStatusStyle = (status) => {
  if (!status) return { background: '#F3F4F6', color: '#6B7280' };
  const s = status.toUpperCase();
  if (s === 'FILLED')   return { background: '#DCFCE7', color: '#166534' };
  if (s === 'WORKING')  return { background: '#FEF9C3', color: '#854F0B' };
  if (s === 'REJECTED' || s === 'FAILED') return { background: '#FEE2E2', color: '#991B1B' };
  return { background: '#F3F4F6', color: '#6B7280' };
};

// ── Badge ─────────────────────────────────────────────────────────────
function Badge({ connected, enabled }) {
  if (!enabled)    return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 500, background: '#F3F4F6', color: '#6B7280' }}>Disabled</span>;
  if (!connected)  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 500, background: '#FEE2E2', color: '#991B1B' }}>Token expired</span>;
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 500, background: '#DCFCE7', color: '#166534' }}>Connected</span>;
}

// ── Account card ──────────────────────────────────────────────────────
const EyeOpen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOff = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

function AccountCard({ b, onReconnect, balancesLoading, hidden }) {
  const hasData = b.connected && b.enabled && b.total_value != null;
  const lastRun = fmtDate(b.last_run);
  const dim = (val) => balancesLoading && !hasData
    ? <span style={{ color: '#D1D5DB' }}>—</span>
    : val;

  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{b.account_name}</div>
            {b.account_type && b.account_type !== b.account_name && (
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#F3F4F6', color: '#6B7280', fontWeight: 500 }}>{b.account_type}</span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
            {lastThree(b.account_number)}{lastRun ? ` · Last run ${lastRun}` : ''}{!b.enabled ? ' · Paused by you' : ''}
          </div>
        </div>
        <Badge connected={b.connected} enabled={b.enabled} />
      </div>

      <div style={{ filter: hidden ? 'blur(6px)' : 'none', userSelect: hidden ? 'none' : 'auto', transition: 'filter 0.2s ease', pointerEvents: hidden ? 'none' : 'auto' }}>
        {(!b.connected || !b.enabled) && !hasData ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 0', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
              {!b.connected ? 'Balances unavailable.\nReconnect to resume investing.' : 'Invest runs paused for this account.'}
            </div>
            {!b.connected && (
              <button onClick={onReconnect} style={{ padding: '5px 12px', background: '#DBEAFE', color: '#1E40AF', border: '0.5px solid #B5D4F4', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}>
                Reconnect Schwab →
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>Total value</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#111827' }}>{dim(fmt(b.total_value))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>Cash available</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: b.cash > 0 ? '#166534' : '#111827' }}>{dim(fmt(b.cash))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>Invested</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#111827' }}>{dim(fmt(b.invested))}</span>
            </div>
            <hr style={{ border: 'none', borderTop: '0.5px solid rgba(0,0,0,0.07)', margin: '10px 0' }} />
            <div style={{ fontSize: 22, fontWeight: 500, color: b.enabled ? '#111827' : '#9CA3AF' }}>{dim(fmtShort(b.total_value))}</div>
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{b.enabled ? 'total portfolio value' : 'invest runs paused'}</div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Rotation card ─────────────────────────────────────────────────────
function RotationCard({ accounts, rotations }) {
  if (!accounts.length) return null;
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 16, marginBottom: 22 }}>
      {accounts.map((a, i) => {
        const rot = rotations[a.account_id] || [];
        return (
          <div key={a.account_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${i === 0 ? 0 : 8}px 0 ${i === accounts.length - 1 ? 0 : 8}px`, borderBottom: i < accounts.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{a.account_type || a.account_name} {lastThree(a.account_number)}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                {a.last_run ? `Last run ${fmtDate(a.last_run)}` : 'Never run'}
              </div>
            </div>
            <span style={{ fontSize: 10, color: '#9CA3AF', background: '#F9FAFB', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 99, padding: '2px 8px', flexShrink: 0 }}>
              Run #{(a.rotation_state || 0) + 1}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
              {rot.map((sym, idx) => (
                <span key={sym} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 500, background: PILL_COLORS[idx % PILL_COLORS.length].bg, color: PILL_COLORS[idx % PILL_COLORS.length].color }}>{sym}</span>
                  {idx < rot.length - 1 && <span style={{ fontSize: 10, color: '#D1D5DB' }}>→</span>}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────────
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 };
const modalStyle   = { background: '#fff', borderRadius: 12, padding: '22px 24px', width: '100%', maxWidth: 400, border: '0.5px solid rgba(0,0,0,0.1)' };

function DryRunModal({ result, onClose, onInvest }) {
  if (!result) return null;
  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <div style={{ background: '#DBEAFE', borderRadius: 8, padding: '9px 14px', textAlign: 'center', fontSize: 12, fontWeight: 500, color: '#1E40AF', marginBottom: 14, letterSpacing: '0.02em' }}>DRY RUN — No orders were placed</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 6 }}>Simulated results</div>
        {result.map((acct, i) => (
          <div key={i}>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
              {acct.account_name} {lastFour(acct.account_number)} · {fmt(acct.cash_before)} available · Run #{(acct.rotation_used || 0) + 1}
            </div>
            {acct.error
              ? <div style={{ color: '#991B1B', fontSize: 12, marginBottom: 8 }}>{acct.error}</div>
              : acct.orders.map((o, j) => (
                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)', fontSize: 12, gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 500, color: '#111827' }}>{o.symbol}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{o.is_remainder ? 'remainder' : `${o.amount && o.price ? Math.round((o.amount / (o.price * (o.shares || 1))) * 100) : '?'}% allocation`}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#6B7280', fontSize: 11 }}>{o.shares} shares @ {o.price ? `$${o.price.toFixed(2)}` : '—'}</div>
                    <div style={{ fontWeight: 500, color: '#111827' }}>{fmt(o.amount)}</div>
                  </div>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 500, background: '#F3F4F6', color: '#6B7280', flexShrink: 0 }}>DRY RUN</span>
                </div>
              ))
            }
            {!acct.error && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 500, paddingTop: 10, marginTop: 4, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                <span>Total to invest</span>
                <span>{fmt(acct.total_invested)}</span>
              </div>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>Close</button>
          <button onClick={onInvest} style={{ flex: 1, padding: 8, background: '#2563eb', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#fff', fontWeight: 500, fontFamily: 'inherit' }}>Invest for real →</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ onCancel, onConfirm, running }) {
  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={modalStyle}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 6 }}>Place real orders?</div>
        <div style={{ background: '#FEE2E2', borderRadius: 8, padding: '9px 14px', fontSize: 12, color: '#991B1B', marginBottom: 14, lineHeight: 1.5 }}>
          This will place <strong>real orders</strong> using real money in your Schwab account. Orders execute immediately at market price and cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={onConfirm} disabled={running} style={{ flex: 1, padding: 8, background: '#dc2626', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#fff', fontWeight: 500, fontFamily: 'inherit' }}>
            {running ? 'Placing orders…' : 'Yes, invest now'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultsModal({ result, onClose }) {
  if (!result) return null;
  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 6 }}>Orders placed</div>
        {result.map((acct, i) => (
          <div key={i}>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
              {acct.account_name} {lastFour(acct.account_number)} · Run #{(acct.rotation_used || 0) + 1}
            </div>
            {acct.error
              ? <div style={{ color: '#991B1B', fontSize: 12, marginBottom: 8 }}>{acct.error}</div>
              : acct.orders.map((o, j) => (
                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)', fontSize: 12, gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 500, color: '#111827' }}>{o.symbol}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{o.shares} shares</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#6B7280', fontSize: 11 }}>@ {o.price ? `$${o.price.toFixed(2)}` : '—'}</div>
                    <div style={{ fontWeight: 500, color: '#111827' }}>{fmt(o.amount)}</div>
                  </div>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 500, flexShrink: 0, ...orderStatusStyle(o.status) }}>{o.status}</span>
                </div>
              ))
            }
            {!acct.error && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 500, paddingTop: 10, marginTop: 4, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                <span>Total invested</span>
                <span>{fmt(acct.total_invested)}</span>
              </div>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { balances, connectedAccounts, rotations, schedules, loading, balancesLoading, syncing, sync, addSchedule, removeSchedule } = useDashboard();
  const [hidden, setHidden] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  const disconnected = balances.filter((b) => b.enabled && !b.connected);

  const sectionTitle = (text) => (
    <div style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{text}</div>
  );

  if (loading) return <Layout><p style={{ padding: 20, fontSize: 13, color: '#6B7280' }}>Loading…</p></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

        {/* Warning banner */}
        {disconnected.length > 0 && (
          <div style={{ background: '#FEF9C3', border: '0.5px solid #EF9F27', borderRadius: 10, padding: '10px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#633806', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, background: '#EF9F27', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>!</div>
              <span>{disconnected.map((b) => `${b.account_type || b.account_name} ${lastThree(b.account_number)}`).join(', ')} — Schwab connection expired. Invest runs paused.</span>
            </div>
            <button onClick={() => navigate('/settings')} style={{ background: '#EF9F27', color: '#412402', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              Reconnect now
            </button>
          </div>
        )}

        {/* Next Investment Schedule */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          {sectionTitle('Next Investment Schedule')}
          <button onClick={() => setShowDialog(true)} style={{ width: 22, height: 22, borderRadius: '50%', background: '#2563eb', border: 'none', color: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 10 }}>+</button>
        </div>
        {schedules.length === 0 ? (
          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '18px 16px', marginBottom: 22, fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
            No investment scheduled
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
            {schedules.map((s) => {
              const rot = rotations[s.account_id] || s.allocations?.map(a => a.symbol) || [];
              const freqLabel = {
                weekly: `Every ${['Mon','Tue','Wed','Thu','Fri'][s.day_of_week] || ''} at`,
                biweekly_1_15: '1st & 15th at',
                biweekly_alternating: `Every other ${['Mon','Tue','Wed','Thu','Fri'][s.day_of_week] || ''} at`,
                monthly: `Monthly on the ${s.day_of_month}${['th','st','nd','rd'][(s.day_of_month||0)%10<4&&((s.day_of_month||0)<11||(s.day_of_month||0)>13)?(s.day_of_month||0)%10:0]||'th'} at`,
              }[s.frequency] || s.frequency;
              const tz = { 'America/Chicago': 'CST', 'America/New_York': 'EST', 'America/Denver': 'MST', 'America/Los_Angeles': 'PST' }[s.timezone] || s.timezone;
              const time = `${String(s.hour).padStart(2,'0')}:${String(s.minute).padStart(2,'0')} ${tz}`;
              return (
                <div key={s.id} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{s.account_name}</span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, fontWeight: 500, background: s.is_test ? '#FEF9C3' : '#DCFCE7', color: s.is_test ? '#854F0B' : '#166534' }}>{s.is_test ? 'Test run' : 'Live'}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{freqLabel} {time}</div>
                      {s.next_run && <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>Next: {new Date(s.next_run).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
                    </div>
                    <button onClick={() => removeSchedule(s.id)} style={{ fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'inherit' }}>Remove</button>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    {rot.map((sym, idx) => (
                      <span key={sym} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 500, background: PILL_COLORS[idx % PILL_COLORS.length].bg, color: PILL_COLORS[idx % PILL_COLORS.length].color }}>{sym}</span>
                        {idx < rot.length - 1 && <span style={{ fontSize: 10, color: '#D1D5DB' }}>→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Balance cards */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sectionTitle('Account balances')}
            <button onClick={() => setHidden((h) => !h)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '0 0 10px', display: 'flex', alignItems: 'center' }}>
              {hidden ? <EyeOff /> : <EyeOpen />}
            </button>
          </div>
          <button onClick={sync} disabled={syncing} style={{ padding: '4px 12px', background: '#fff', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#6B7280', fontFamily: 'inherit', marginBottom: 10 }}>
            {syncing ? 'Syncing…' : 'Sync accounts'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 22 }}>
          {balances.length === 0
            ? <p style={{ fontSize: 13, color: '#9CA3AF' }}>No accounts yet. Connect Schwab in Settings.</p>
            : balances.map((b) => <AccountCard key={b.account_id} b={b} onReconnect={() => navigate('/settings')} balancesLoading={balancesLoading} hidden={hidden} />)
          }
        </div>

      </div>
      {showDialog && (
        <CreateScheduleDialog
          accounts={balances}
          onClose={() => setShowDialog(false)}
          onSaved={(s) => addSchedule(s)}
        />
      )}
    </Layout>
  );
}
