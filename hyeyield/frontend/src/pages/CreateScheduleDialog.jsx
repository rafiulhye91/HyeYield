import { useState, useRef, useCallback } from 'react';
import api from '../api/client';

// In-memory cache: query string → results array (persists for the dialog's lifetime)
const _searchCache = new Map();

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TIMEZONES = [
  { value: 'America/Chicago',    label: 'CST / CDT (Central)' },
  { value: 'America/New_York',   label: 'EST / EDT (Eastern)' },
  { value: 'America/Denver',     label: 'MST / MDT (Mountain)' },
  { value: 'America/Los_Angeles',label: 'PST / PDT (Pacific)' },
];

const inp = {
  width: '100%', padding: '8px 10px',
  border: '1px solid #D1D5DB', borderRadius: 8,
  fontSize: 13, background: '#fff', color: '#111827',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const label = { fontSize: 11, fontWeight: 500, color: '#9CA3AF', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' };
const tabBtn = (sel) => ({
  flex: 1, padding: '8px 6px', border: '1px solid', borderRadius: 8,
  textAlign: 'center', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
  borderColor: sel ? '#2563eb' : '#D1D5DB',
  background: sel ? '#EFF6FF' : '#fff',
  color: sel ? '#1E40AF' : '#374151',
  fontWeight: sel ? 500 : 400,
});
const dayBtn = (sel) => ({
  flex: 1, minWidth: 44, padding: '8px 4px',
  border: `1px solid ${sel ? '#2563eb' : '#D1D5DB'}`,
  borderRadius: 8, background: sel ? '#2563eb' : '#fff',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
  color: sel ? '#fff' : '#374151', fontFamily: 'inherit',
});

function AllocationRow({ row, onSymbol, onPct, onDelete, canDelete }) {
  const [query, setQuery] = useState(row.symbol);
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState([]);
  const blurTimer = useRef(null);
  const debounceTimer = useRef(null);

  const search = useCallback((q) => {
    const key = q.toUpperCase();
    if (!key) { setMatches([]); return; }
    if (_searchCache.has(key)) { setMatches(_searchCache.get(key)); return; }
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        const r = await api.get('/schwab/instruments', { params: { q: key } });
        const results = r.data.map(i => ({ sym: i.symbol, name: i.description }));
        _searchCache.set(key, results);
        setMatches(results);
      } catch { setMatches([]); }
    }, 250);
  }, []);

  const pick = (sym) => {
    clearTimeout(blurTimer.current);
    setQuery(sym);
    setOpen(false);
    onSymbol(sym);
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <input
          style={{ ...inp, textTransform: 'uppercase', fontWeight: 500 }}
          value={query}
          placeholder="Symbol or name..."
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            onSymbol(v.toUpperCase());
            search(v);
          }}
          onFocus={() => { if (query) { setOpen(true); search(query); } }}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 160); }}
        />
        {open && matches.length > 0 && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, zIndex: 99, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            {matches.map(e => (
              <div key={e.sym} onMouseDown={() => pick(e.sym)} style={{ padding: '9px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 500, color: '#111827' }}>{e.sym}</span>
                <span style={{ color: '#9CA3AF', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <input
          type="number" min="1" max="100" step="1"
          style={{ ...inp, width: 58, textAlign: 'right', padding: '8px 8px' }}
          value={row.pct}
          placeholder="0"
          onChange={(e) => onPct(e.target.value)}
        />
        <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>%</span>
      </div>
      <button onClick={onDelete} disabled={!canDelete} style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: canDelete ? 'pointer' : 'default', color: canDelete ? '#D1D5DB' : '#F3F4F6', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, flexShrink: 0 }}>×</button>
    </div>
  );
}

export default function CreateScheduleDialog({ accounts, onClose, onSaved }) {
  const [accountId, setAccountId] = useState('');
  const [rows, setRows] = useState([{ id: 0, symbol: '', pct: '' }]);
  const [nextId, setNextId] = useState(1);
  const [frequency, setFrequency] = useState('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1); // Tue
  const [dayOfMonth, setDayOfMonth] = useState(15);
  const [biweeklyType, setBiweeklyType] = useState('biweekly_1_15');
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('35');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const total = Math.round(rows.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0));
  const remaining = 100 - total;

  const addRow = () => {
    setRows(r => [...r, { id: nextId, symbol: '', pct: '' }]);
    setNextId(n => n + 1);
  };
  const updateRow = (id, field, val) => setRows(r => r.map(x => x.id === id ? { ...x, [field]: val } : x));
  const deleteRow = (id) => setRows(r => r.filter(x => x.id !== id));

  const freqValue = frequency === 'biweekly_1_15' || frequency === 'biweekly_alternating'
    ? frequency : frequency === 'biweekly' ? biweeklyType : frequency;

  const preview = () => {
    const t = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const tz = TIMEZONES.find(x => x.value === timezone)?.label.split(' ')[0] || 'CST';
    if (frequency === 'weekly') return `Every ${DAYS[dayOfWeek]} at ${t} ${tz}`;
    if (frequency === 'biweekly') {
      if (biweeklyType === 'biweekly_1_15') return `1st & 15th of each month at ${t} ${tz}`;
      return `Every other ${DAYS[dayOfWeek]} at ${t} ${tz}`;
    }
    return `Monthly on the ${dayOfMonth}${['th','st','nd','rd'][dayOfMonth % 10 < 4 && (dayOfMonth < 11 || dayOfMonth > 13) ? dayOfMonth % 10 : 0] || 'th'} at ${t} ${tz}`;
  };

  const save = async (isTest) => {
    if (!accountId) { setError('Please select an account.'); return; }
    if (total !== 100) { setError(`Allocations must total 100% (currently ${total}%).`); return; }
    const validRows = rows.filter(r => r.symbol && r.pct);
    if (!validRows.length) { setError('Add at least one ETF allocation.'); return; }

    let finalFreq = frequency;
    let finalDow = null;
    let finalDom = null;
    if (frequency === 'weekly') { finalFreq = 'weekly'; finalDow = dayOfWeek; }
    else if (frequency === 'biweekly') { finalFreq = biweeklyType; if (biweeklyType === 'biweekly_alternating') finalDow = dayOfWeek; }
    else if (frequency === 'monthly') { finalFreq = 'monthly'; finalDom = dayOfMonth; }

    setSaving(true);
    setError('');
    try {
      const res = await api.post('/schedules', {
        account_id: parseInt(accountId),
        is_test: isTest,
        frequency: finalFreq,
        day_of_week: finalDow,
        day_of_month: finalDom,
        hour: parseInt(hour),
        minute: parseInt(minute),
        timezone,
        allocations: validRows.map(r => ({ symbol: r.symbol, pct: parseFloat(r.pct) })),
      });
      onSaved(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.1)', width: '100%', maxWidth: 500, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#111827' }}>Create investment schedule</div>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: '#F3F4F6', cursor: 'pointer', fontSize: 13, color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && <div style={{ fontSize: 12, color: '#991B1B', background: '#FEE2E2', border: '0.5px solid #F09595', padding: '8px 10px', borderRadius: 8 }}>{error}</div>}

          {/* Account */}
          <div>
            <label style={label}>Account</label>
            <select style={{ ...inp, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236B7280'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }}
              value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Select an account...</option>
              {accounts.filter(a => a.connected && a.enabled).map(a => (
                <option key={a.account_id} value={a.account_id}>
                  {a.account_name} ...{String(a.account_number).slice(-3)}
                </option>
              ))}
            </select>
          </div>

          {/* ETF Allocations */}
          <div>
            <label style={label}>ETF / Stock allocations</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {rows.map(row => (
                <AllocationRow key={row.id} row={row}
                  onSymbol={(v) => updateRow(row.id, 'symbol', v)}
                  onPct={(v) => updateRow(row.id, 'pct', v)}
                  onDelete={() => deleteRow(row.id)}
                  canDelete={rows.length > 1}
                />
              ))}
            </div>
            <button onClick={addRow} style={{ fontSize: 12, color: '#2563eb', cursor: 'pointer', background: 'none', border: 'none', padding: '2px 0', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>+ Add ETF or stock</button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: total === 100 ? '#16A34A' : total > 100 ? '#DC2626' : '#9CA3AF' }}>
                Total: {total}%{total > 100 ? ` (over by ${total - 100}%)` : ''}
              </span>
              {remaining > 0 && total < 100 && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{remaining}% unallocated</span>}
            </div>
            <div style={{ height: 3, borderRadius: 2, background: '#E5E7EB', marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(total, 100)}%`, background: total === 100 ? '#16A34A' : total > 100 ? '#EF4444' : '#2563eb', transition: 'width 0.2s, background 0.2s' }} />
            </div>
          </div>

          {/* Repeat */}
          <div>
            <label style={label}>Repeat</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['weekly', 'biweekly', 'monthly'].map(f => (
                <button key={f} style={tabBtn(frequency === f)} onClick={() => setFrequency(f)}>
                  {f === 'biweekly' ? 'Bi-weekly' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {frequency === 'weekly' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>Pick a day of the week</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DAYS.map((d, i) => (
                    <button key={d} style={dayBtn(dayOfWeek === i)} onClick={() => setDayOfWeek(i)}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            {frequency === 'biweekly' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {[
                  { key: 'biweekly_1_15', label: '1st & 15th', sub: 'Every month' },
                  { key: 'biweekly_alternating', label: `Every other ${DAYS[dayOfWeek]}`, sub: 'Alternating weeks' },
                ].map(opt => (
                  <div key={opt.key} onClick={() => setBiweeklyType(opt.key)} style={{ flex: 1, padding: 10, border: `1px solid ${biweeklyType === opt.key ? '#2563eb' : '#D1D5DB'}`, borderRadius: 8, cursor: 'pointer', background: biweeklyType === opt.key ? '#EFF6FF' : '#fff' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{opt.sub}</div>
                  </div>
                ))}
              </div>
            )}
            {frequency === 'biweekly' && biweeklyType === 'biweekly_alternating' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>Pick a day of the week</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DAYS.map((d, i) => (
                    <button key={d} style={dayBtn(dayOfWeek === i)} onClick={() => setDayOfWeek(i)}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            {frequency === 'monthly' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>Pick a day of the month</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textAlign: 'center', padding: '3px 0' }}>{h}</div>
                  ))}
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={`pad-${i}`} />
                  ))}
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(n => (
                    <button key={n} onClick={() => setDayOfMonth(n)} style={{ width: '100%', aspectRatio: '1', border: `1px solid ${dayOfMonth === n ? '#2563eb' : '#D1D5DB'}`, borderRadius: 6, background: dayOfMonth === n ? '#2563eb' : '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer', color: dayOfMonth === n ? '#fff' : '#374151', fontFamily: 'inherit' }}>{n}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            <div style={{ fontSize: 11, color: '#166534', background: '#F0FDF4', border: '0.5px solid #BBF7D0', padding: '6px 10px', borderRadius: 6, marginTop: 10 }}>
              {preview()}
            </div>
          </div>

          {/* Time */}
          <div>
            <label style={label}>Time</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min="0" max="23" style={{ ...inp, width: 70, textAlign: 'center' }} value={hour} onChange={(e) => setHour(e.target.value.padStart(2, '0'))} />
              <span style={{ fontSize: 14, color: '#6B7280' }}>:</span>
              <input type="number" min="0" max="59" style={{ ...inp, width: 70, textAlign: 'center' }} value={minute} onChange={(e) => setMinute(e.target.value.padStart(2, '0'))} />
              <select style={{ ...inp, flex: 1, appearance: 'none' }} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={onClose} style={{ padding: '10px 14px', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', color: '#9CA3AF', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={() => save(true)} disabled={saving} style={{ flex: 1, padding: 10, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : 'Schedule a Test Run'}
          </button>
          <button onClick={() => save(false)} disabled={saving || total !== 100 || !accountId} style={{ flex: 1, padding: 10, background: total === 100 && accountId ? '#2563eb' : '#D1D5DB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: total === 100 && accountId ? 'pointer' : 'not-allowed', color: '#fff', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : 'Schedule an Invest'}
          </button>
        </div>
      </div>
    </div>
  );
}
