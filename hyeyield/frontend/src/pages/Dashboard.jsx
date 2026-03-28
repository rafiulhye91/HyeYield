import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import Layout from '../components/Layout';
import { useDashboard } from '../context/DashboardContext';
import CreateScheduleDialog from './CreateScheduleDialog';

// ── helpers ──────────────────────────────────────────────────────────
const fmt       = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtShort  = (n) => n != null ? `$${Math.round(n).toLocaleString('en-US')}` : '—';
const lastThree = (num) => num ? `...${String(num).slice(-3)}` : '';
const fmtDate   = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
const fmtCST    = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
  return `${date} · ${time} CT`;
};

const PILL_COLORS = [
  { bg: '#DBEAFE', color: '#1E40AF' },
  { bg: '#DCFCE7', color: '#166534' },
  { bg: '#FEF9C3', color: '#854F0B' },
  { bg: '#EDE9FE', color: '#5B21B6' },
  { bg: '#FEE2E2', color: '#991B1B' },
];
const DOT_COLORS = ['#2563eb', '#16A34A', '#D97706', '#7C3AED', '#DC2626'];

const freqLabel = (s) => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  if (s.frequency === 'weekly') return `Weekly ${days[s.day_of_week] || ''}`;
  if (s.frequency === 'biweekly_1_15') return '1st & 15th';
  if (s.frequency === 'biweekly_alternating') return `Bi-weekly ${days[s.day_of_week] || ''}`;
  if (s.frequency === 'monthly') {
    const d = s.day_of_month || 1;
    const sfx = ['th','st','nd','rd'][d % 10 < 4 && (d < 11 || d > 13) ? d % 10 : 0] || 'th';
    return `Monthly ${d}${sfx}`;
  }
  return s.frequency;
};

const schedTime = (s) => {
  const tzLabel = { 'America/Chicago': 'CT', 'America/New_York': 'ET', 'America/Denver': 'MT', 'America/Los_Angeles': 'PT' }[s.timezone] || '';
  const h = s.hour % 12 || 12;
  const ampm = s.hour >= 12 ? 'PM' : 'AM';
  return `${h}:${String(s.minute).padStart(2, '0')} ${ampm} ${tzLabel}`;
};

const countdownLabel = (nextRun) => {
  if (!nextRun) return '';
  const run  = new Date(nextRun);
  const now  = new Date();
  const todayStr     = now.toDateString();
  const tomorrowStr  = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toDateString();
  if (run.toDateString() === todayStr)    return 'today';
  if (run.toDateString() === tomorrowStr) return 'tomorrow';
  const days = Math.round((run - now) / 86400000);
  return `in ${days} days`;
};

// ── Icons ─────────────────────────────────────────────────────────────
const PlaySVG = ({ color = 'currentColor' }) => (
  <svg width="10" height="10" viewBox="0 0 12 12"><polygon points="2,1 10,6 2,11" fill={color} /></svg>
);
const PauseSVG = ({ color = '#94b8d4' }) => (
  <svg width="10" height="10" viewBox="0 0 12 12">
    <rect x="2" y="1" width="3" height="10" rx="1" fill={color} />
    <rect x="7" y="1" width="3" height="10" rx="1" fill={color} />
  </svg>
);
const TrashSVG = ({ color = '#EF4444' }) => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
    <path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
const EyeOpen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOff = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

// ── Badge ─────────────────────────────────────────────────────────────
function Badge({ connected, enabled }) {
  if (!enabled)   return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 500, background: '#F3F4F6', color: '#6B7280' }}>Disabled</span>;
  if (!connected) return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 500, background: '#FEE2E2', color: '#991B1B' }}>Token expired</span>;
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 500, background: '#DCFCE7', color: '#166534' }}>Connected</span>;
}

// ── Account card ──────────────────────────────────────────────────────
function AccountCard({ b, onReconnect, balancesLoading, hidden }) {
  const hasData   = b.connected && b.enabled && b.total_value != null;
  const lastRun   = fmtDate(b.last_run);
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

// ── Hero card ──────────────────────────────────────────────────────────
function HeroCard({ s, balance, onToggle, onDelete, toggling }) {
  const allocs    = s.allocations || [];
  const cash      = balance?.cash;
  const nextDate  = s.next_run ? fmtDate(s.next_run) : '—';
  const countdown = s.next_run ? countdownLabel(s.next_run) : '';

  const haBtn = (onClick, children, danger = false, disabled = false) => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 13px', border: '0.5px solid rgba(255,255,255,0.18)', borderRadius: 7,
      background: 'rgba(255,255,255,0.07)', fontSize: 11, fontWeight: 500, cursor: disabled ? 'default' : 'pointer',
      color: danger ? '#f87171' : '#fff', fontFamily: 'inherit',
      display: 'flex', alignItems: 'center', gap: 5,
    }}>{children}</button>
  );

  return (
    <div style={{ background: '#1e3a5f', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '20px 22px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#7eb8f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.enabled ? '#34D399' : '#9CA3AF', flexShrink: 0 }} />
            {s.enabled ? `Next run · ${countdown}` : 'Paused'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#fff', marginBottom: 2 }}>
            {s.account_name} {lastThree(s.account_number)}
          </div>
          <div style={{ fontSize: 12, color: '#94b8d4', marginBottom: 10 }}>
            {freqLabel(s)} · {s.is_test ? 'Test run' : 'Live'}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {allocs.map(a => (
              <span key={a.symbol} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, fontWeight: 500, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)' }}>
                {a.symbol} {a.pct}%
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 600, color: s.enabled ? '#fff' : '#94b8d4', lineHeight: 1 }}>{nextDate}</div>
          <div style={{ fontSize: 11, color: '#94b8d4', marginTop: 3 }}>{schedTime(s)}</div>
        </div>
      </div>
      <div style={{ padding: '12px 22px', borderTop: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#94b8d4' }}>
          {cash != null
            ? <>Cash available <span style={{ color: '#fff', fontWeight: 500 }}>{fmt(cash)}</span></>
            : 'Balance loading…'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {haBtn(() => onToggle(s.id), [s.enabled ? <PauseSVG key="p" /> : <PlaySVG key="pl" color="#94b8d4" />, s.enabled ? 'Pause' : 'Resume'], false, toggling)}
          {haBtn(() => onDelete(s.id), 'Delete', true)}
        </div>
      </div>
    </div>
  );
}

// ── Schedule timeline row ──────────────────────────────────────────────
function ScheduleRow({ s, dotColor, onToggle, onDelete, toggling }) {
  const [hovered, setHovered] = useState(false);
  const allocs   = s.allocations || [];
  const nextDate = s.next_run ? fmtDate(s.next_run) : '—';
  const showActions = hovered || !s.enabled;

  const taBtn = (onClick, children, title, colorClass, disabled = false) => (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      width: 24, height: 24, border: `0.5px solid ${colorClass}`, borderRadius: 6,
      background: '#fff', cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
    }}>{children}</button>
  );

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ padding: '11px 16px', borderBottom: '0.5px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 10, background: hovered ? '#FAFBFC' : '#fff', transition: 'background 0.12s' }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 2, background: s.enabled ? dotColor : '#9CA3AF' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: s.enabled ? '#111827' : '#9CA3AF' }}>
          {s.account_name} {lastThree(s.account_number)}
          {!s.enabled && <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 400, marginLeft: 4 }}>Paused</span>}
          {s.is_test && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 99, background: '#FEF9C3', color: '#854F0B', fontWeight: 500, marginLeft: 5 }}>Test</span>}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{freqLabel(s)}</div>
        <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
          {allocs.map((a, idx) => (
            <span key={a.symbol} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 500, background: PILL_COLORS[idx % PILL_COLORS.length].bg, color: PILL_COLORS[idx % PILL_COLORS.length].color }}>
              {a.symbol} {a.pct}%
            </span>
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: s.enabled ? '#374151' : '#9CA3AF' }}>{nextDate}</div>
        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>{schedTime(s)}</div>
      </div>
      <div style={{ display: 'flex', gap: 3, opacity: showActions ? 1 : 0, transition: 'opacity 0.15s', flexShrink: 0 }}>
        {s.enabled
          ? taBtn(() => onToggle(s.id), <PauseSVG color="#D97706" />, 'Pause', '#D97706', toggling)
          : taBtn(() => onToggle(s.id), <PlaySVG color="#16A34A" />, 'Resume', '#16A34A', toggling)
        }
        {taBtn(() => onDelete(s.id), <TrashSVG />, 'Delete', '#EF4444')}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { balances, schedules, history, loading, balancesLoading, syncing, sync, addSchedule, updateSchedule, removeSchedule } = useDashboard();
  const [hidden, setHidden]       = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [toggling, setToggling]   = useState(false);

  const disconnected = balances.filter((b) => b.enabled && !b.connected);

  // Sort: enabled first, then by next_run
  const sorted = [...schedules].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    if (!a.next_run) return 1;
    if (!b.next_run) return -1;
    return new Date(a.next_run) - new Date(b.next_run);
  });

  // Assign dot colors to each schedule
  let activeIdx = 0;
  const dotColorOf = {};
  sorted.forEach(s => {
    dotColorOf[s.id] = s.enabled ? DOT_COLORS[activeIdx++ % DOT_COLORS.length] : '#9CA3AF';
  });

  const hero    = sorted[0] || null;
  const heroBal = hero ? balances.find(b => b.account_id === hero.account_id) : null;

  const handleToggle = async (id) => {
    setToggling(true);
    try {
      const res = await api.patch(`/schedules/${id}/toggle`);
      updateSchedule(res.data);
    } catch (_) {}
    setToggling(false);
  };

  const handleDelete = async (id) => {
    await removeSchedule(id);
  };

  const sectionLabel = (text) => (
    <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{text}</span>
  );

  if (loading) return <Layout><p style={{ padding: 20, fontSize: 13, color: '#6B7280' }}>Loading…</p></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

        {/* Token expiry warning */}
        {disconnected.length > 0 && (
          <div style={{ background: '#FEF9C3', border: '0.5px solid #EF9F27', borderRadius: 10, padding: '10px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#633806', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, background: '#EF9F27', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>!</div>
              <span>{disconnected.map((b) => `${b.account_type || b.account_name} ${lastThree(b.account_number)}`).join(', ')} — Schwab connection expired.</span>
            </div>
            <button onClick={() => navigate('/settings')} style={{ background: '#EF9F27', color: '#412402', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              Reconnect now
            </button>
          </div>
        )}

        {/* ── Investment Schedules ── */}
        <div style={{ marginBottom: 10 }}>
          {sectionLabel('Investment Schedules')}
        </div>

        {schedules.length === 0 ? (
          /* Empty state */
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 28 }}>
            <div onClick={() => setShowDialog(true)} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F8F9FF'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <div style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px dashed #D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 14, flexShrink: 0 }}>+</div>
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>Add new schedule</span>
            </div>
          </div>
        ) : (
          <>
            {/* Hero card — next upcoming */}
            <HeroCard s={hero} balance={heroBal} onToggle={handleToggle} onDelete={handleDelete} toggling={toggling} />

            {/* Spacer */}
            <div style={{ height: 16 }} />

            {/* Timeline list — all schedules */}
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 28 }}>
              {sorted.map(s => (
                <ScheduleRow key={s.id} s={s} dotColor={dotColorOf[s.id]} onToggle={handleToggle} onDelete={handleDelete} toggling={toggling} />
              ))}
              <div onClick={() => setShowDialog(true)} style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderTop: '0.5px solid #F3F4F6' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8F9FF'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px dashed #D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 14, flexShrink: 0 }}>+</div>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>Add new schedule</span>
              </div>
            </div>
          </>
        )}

        {/* ── Recent Invest Runs ── */}
        {(() => {
          const groups = {};
          history.forEach(log => {
            const d = new Date(log.created_at);
            const key = `${log.account_id}_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}_${d.getHours()}_${d.getMinutes()}`;
            if (!groups[key]) groups[key] = {
              key, accountName: log.account_name, accountNumber: log.account_number,
              date: log.created_at, orders: [], total: 0, anyFailed: false, anyPartial: false, isDryRun: log.dry_run,
            };
            groups[key].orders.push(log);
            groups[key].total += log.amount || 0;
            if (log.status === 'FAILED' || log.status === 'REJECTED') groups[key].anyFailed = true;
            if (log.status !== 'FILLED' && log.status !== 'FAILED' && log.status !== 'REJECTED') groups[key].anyPartial = true;
          });
          const runs = Object.values(groups)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);
          if (!runs.length) return null;
          // each row ~44px tall, show 5 rows
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                {sectionLabel('Recent Invest Runs')}
                <button onClick={() => navigate('/history')} style={{ padding: '4px 12px', background: '#fff', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#6B7280', fontFamily: 'inherit' }}>
                  View all
                </button>
              </div>
              <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 28 }}>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {runs.map(run => {
                    const st = run.anyFailed ? 'failed' : run.anyPartial ? 'partial' : 'ok';
                    const icon  = { ok: { bg: '#DCFCE7', color: '#16A34A', ch: '✓' }, partial: { bg: '#FEF9C3', color: '#D97706', ch: '~' }, failed: { bg: '#FEE2E2', color: '#DC2626', ch: '✕' } }[st];
                    const badge = { ok: { bg: '#DCFCE7', color: '#166534', lbl: run.isDryRun ? 'Test' : 'Filled' }, partial: { bg: '#FEF9C3', color: '#854F0B', lbl: 'Partial' }, failed: { bg: '#FEE2E2', color: '#991B1B', lbl: 'Failed' } }[st];
                    const orderSummary = run.orders.map(o => `${o.symbol}${o.shares ? ` ×${Math.round(o.shares)}` : ''}`).join(' · ');
                    return (
                      <div key={run.key} style={{ padding: '10px 16px', borderBottom: '0.5px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 7, background: icon.bg, color: icon.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{icon.ch}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{run.accountName} {lastThree(run.accountNumber)}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{orderSummary}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{run.total > 0 ? fmt(run.total) : '—'}</div>
                          <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>{fmtCST(run.date)}</div>
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, fontWeight: 500, display: 'inline-block', marginTop: 2, background: badge.bg, color: badge.color }}>{badge.lbl}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          );
        })()}

        {/* ── Account Balances ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sectionLabel('Account Balances')}
            <button onClick={() => setHidden(h => !h)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex', alignItems: 'center' }}>
              {hidden ? <EyeOff /> : <EyeOpen />}
            </button>
          </div>
          <button onClick={sync} disabled={syncing} style={{ padding: '4px 12px', background: '#fff', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#6B7280', fontFamily: 'inherit' }}>
            {syncing ? 'Syncing…' : 'Sync accounts'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 22 }}>
          {balances.length === 0
            ? <p style={{ fontSize: 13, color: '#9CA3AF' }}>No accounts yet. Connect Schwab in Settings.</p>
            : balances.map(b => <AccountCard key={b.account_id} b={b} onReconnect={() => navigate('/settings')} balancesLoading={balancesLoading} hidden={hidden} />)
          }
        </div>

      </div>

      {showDialog && (
        <CreateScheduleDialog
          accounts={balances}
          onClose={() => setShowDialog(false)}
          onSaved={s => addSchedule(s)}
        />
      )}
    </Layout>
  );
}
