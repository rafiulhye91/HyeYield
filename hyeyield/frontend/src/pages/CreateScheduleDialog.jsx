import { useState, useRef, useCallback } from 'react';
import api from '../api/client';
import { useTheme } from '../context/ThemeContext';

// In-memory cache: query string → results array (persists for the dialog's lifetime)
const _searchCache = new Map();

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TIMEZONES = [
  { value: 'America/Chicago',    label: 'CST / CDT (Central)' },
  { value: 'America/New_York',   label: 'EST / EDT (Eastern)' },
  { value: 'America/Denver',     label: 'MST / MDT (Mountain)' },
  { value: 'America/Los_Angeles',label: 'PST / PDT (Pacific)' },
];

function AllocationRow({ row, onSymbol, onPct, onDelete, canDelete, inp }) {
  const [query, setQuery] = useState(row.symbol);
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState([]);
  const blurTimer = useRef(null);
  const debounceTimer = useRef(null);
  const { t } = useTheme();

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
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: t.cardBg, border: `1px solid ${t.inputBorderLight}`, borderRadius: 8, zIndex: 99, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            {matches.map(e => (
              <div key={e.sym} onMouseDown={() => pick(e.sym)} style={{ padding: '9px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 500, color: t.textPrimary }}>{e.sym}</span>
                <span style={{ color: t.textFaint, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
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
        <span style={{ fontSize: 13, color: t.textMuted, fontWeight: 500 }}>%</span>
      </div>
      <button onClick={onDelete} disabled={!canDelete} style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: canDelete ? 'pointer' : 'default', color: canDelete ? t.inputBorderLight : t.cardBorder, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, flexShrink: 0 }}>×</button>
    </div>
  );
}

export default function CreateScheduleDialog({ accounts, onClose, onSaved, editSchedule }) {
  const isEdit = !!editSchedule;
  const endDateExpired = !!editSchedule?.paused_by_end_date;
  const { t, isDark } = useTheme();

  const minEndDate = (() => {
    if (!endDateExpired) {
      const d = new Date();
      return d.toISOString().slice(0, 10);
    }
    // Compute the next run date based on current frequency settings,
    // then set min to the day after so that run can still fire.
    const eff = frequency === 'biweekly' ? biweeklyType : frequency;
    const next = new Date();
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + 1); // start from tomorrow

    if (eff === 'weekly' || eff === 'biweekly_alternating') {
      // backend day_of_week: 0=Mon…4=Fri → JS getDay(): Mon=1…Fri=5
      const target = dayOfWeek + 1;
      while (next.getDay() !== target) next.setDate(next.getDate() + 1);
    } else if (eff === 'biweekly_1_15') {
      while (next.getDate() !== 1 && next.getDate() !== 15) next.setDate(next.getDate() + 1);
    } else if (eff === 'monthly') {
      if (next.getDate() > dayOfMonth) next.setMonth(next.getMonth() + 1);
      next.setDate(dayOfMonth);
    }
    // min = day after next run so the run fires before the schedule expires
    next.setDate(next.getDate() + 1);
    return next.toISOString().slice(0, 10);
  })();

  const inp = {
    width: '100%', padding: '8px 10px',
    border: `1px solid ${t.inputBorderLight}`, borderRadius: 8,
    fontSize: 13, background: t.inputBg, color: t.textPrimary,
    fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 11, fontWeight: 500, color: t.textFaint, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' };
  const tabBtn = (sel) => ({
    flex: 1, padding: '8px 6px', border: '1px solid', borderRadius: 8,
    textAlign: 'center', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
    borderColor: sel ? '#2563eb' : t.inputBorderLight,
    background: sel ? '#EFF6FF' : t.cardBg,
    color: sel ? '#1E40AF' : t.textSecondary,
    fontWeight: sel ? 500 : 400,
  });
  const dayBtn = (sel) => ({
    flex: 1, minWidth: 44, padding: '8px 4px',
    border: `1px solid ${sel ? '#2563eb' : t.inputBorderLight}`,
    borderRadius: 8, background: sel ? '#2563eb' : t.cardBg,
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
    color: sel ? '#fff' : t.textSecondary, fontFamily: 'inherit',
  });

  const initFreq = () => {
    if (!editSchedule) return 'weekly';
    if (editSchedule.frequency === 'biweekly_1_15' || editSchedule.frequency === 'biweekly_alternating') return 'biweekly';
    return editSchedule.frequency;
  };
  const initBiweekly = () => {
    if (!editSchedule) return 'biweekly_1_15';
    if (editSchedule.frequency === 'biweekly_1_15' || editSchedule.frequency === 'biweekly_alternating') return editSchedule.frequency;
    return 'biweekly_1_15';
  };

  const [name, setName] = useState(editSchedule?.name || '');
  const [accountId, setAccountId] = useState(editSchedule ? String(editSchedule.account_id) : '');
  const [rows, setRows] = useState(
    editSchedule?.allocations?.length
      ? editSchedule.allocations.map((a, i) => ({ id: i, symbol: a.symbol, pct: String(a.pct) }))
      : [{ id: 0, symbol: '', pct: '' }]
  );
  const [nextId, setNextId] = useState(editSchedule?.allocations?.length || 1);
  const [frequency, setFrequency] = useState(initFreq());
  const [dayOfWeek, setDayOfWeek] = useState(editSchedule?.day_of_week ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(editSchedule?.day_of_month ?? 15);
  const [biweeklyType, setBiweeklyType] = useState(initBiweekly());
  const [hour, setHour] = useState(editSchedule ? String(editSchedule.hour).padStart(2, '0') : '09');
  const [minute, setMinute] = useState(editSchedule ? String(editSchedule.minute).padStart(2, '0') : '35');
  const [timezone, setTimezone] = useState(editSchedule?.timezone || 'America/Chicago');
  const [isTest, setIsTest] = useState(editSchedule ? editSchedule.is_test : true);
  const [endDate, setEndDate] = useState(endDateExpired ? '' : (editSchedule?.end_date || ''));
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

  const preview = () => {
    const tv = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const tz = TIMEZONES.find(x => x.value === timezone)?.label.split(' ')[0] || 'CST';
    let base;
    if (frequency === 'weekly') base = `Every ${DAYS[dayOfWeek]} at ${tv} ${tz}`;
    else if (frequency === 'biweekly') {
      base = biweeklyType === 'biweekly_1_15'
        ? `1st & 15th of each month at ${tv} ${tz}`
        : `Every other ${DAYS[dayOfWeek]} at ${tv} ${tz}`;
    } else {
      base = `Monthly on the ${dayOfMonth}${['th','st','nd','rd'][dayOfMonth % 10 < 4 && (dayOfMonth < 11 || dayOfMonth > 13) ? dayOfMonth % 10 : 0] || 'th'} at ${tv} ${tz}`;
    }
    if (endDate) {
      const d = new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      base += ` · ends ${d}`;
    }
    return base;
  };

  const save = async (isTestVal) => {
    if (!name.trim()) { setError('Please enter a schedule name.'); return; }
    if (!accountId) { setError('Please select an account.'); return; }
    if (endDateExpired && !endDate) { setError('Please pick a new end date to resume this schedule.'); return; }
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
    const payload = {
      account_id: parseInt(accountId),
      name: name.trim() || null,
      is_test: isTestVal,
      frequency: finalFreq,
      day_of_week: finalDow,
      day_of_month: finalDom,
      hour: parseInt(hour),
      minute: parseInt(minute),
      timezone,
      end_date: endDate || null,
      allocations: validRows.map(r => ({ symbol: r.symbol, pct: parseFloat(r.pct) })),
    };
    try {
      const res = isEdit
        ? await api.put(`/schedules/${editSchedule.id}`, payload)
        : await api.post('/schedules', payload);
      onSaved(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: t.modalOverlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div style={{ background: t.modalBg, borderRadius: 14, border: `0.5px solid ${t.cardBorder}`, width: '100%', maxWidth: 500, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: `0.5px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: t.textPrimary }}>{isEdit ? 'Edit schedule' : 'Create investment schedule'}</div>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: t.toggleBg, cursor: 'pointer', fontSize: 13, color: t.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && <div style={{ fontSize: 12, color: '#991B1B', background: '#FEE2E2', border: '0.5px solid #F09595', padding: '8px 10px', borderRadius: 8 }}>{error}</div>}

          {/* Name */}
          <div>
            <label style={labelStyle}>Schedule name</label>
            <input
              style={inp}
              value={name}
              placeholder="e.g. Monthly ETF buy"
              onChange={e => setName(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Account */}
          <div>
            <label style={labelStyle}>Account</label>
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
            <label style={labelStyle}>ETF / Stock allocations</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {rows.map(row => (
                <AllocationRow key={row.id} row={row} inp={inp}
                  onSymbol={(v) => updateRow(row.id, 'symbol', v)}
                  onPct={(v) => updateRow(row.id, 'pct', v)}
                  onDelete={() => deleteRow(row.id)}
                  canDelete={rows.length > 1}
                />
              ))}
            </div>
            <button onClick={addRow} style={{ fontSize: 12, color: '#2563eb', cursor: 'pointer', background: 'none', border: 'none', padding: '2px 0', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>+ Add ETF or stock</button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: total === 100 ? '#16A34A' : total > 100 ? '#DC2626' : t.textFaint }}>
                Total: {total}%{total > 100 ? ` (over by ${total - 100}%)` : ''}
              </span>
              {remaining > 0 && total < 100 && <span style={{ fontSize: 11, color: t.textFaint }}>{remaining}% unallocated</span>}
            </div>
            <div style={{ height: 3, borderRadius: 2, background: t.toggleBg, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(total, 100)}%`, background: total === 100 ? '#16A34A' : total > 100 ? '#EF4444' : '#2563eb', transition: 'width 0.2s, background 0.2s' }} />
            </div>
          </div>

          {/* Repeat */}
          <div>
            <label style={labelStyle}>Repeat</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['weekly', 'biweekly', 'monthly'].map(f => (
                <button key={f} style={tabBtn(frequency === f)} onClick={() => setFrequency(f)}>
                  {f === 'biweekly' ? 'Bi-weekly' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {frequency === 'weekly' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>Pick a day of the week</div>
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
                  <div key={opt.key} onClick={() => setBiweeklyType(opt.key)} style={{ flex: 1, padding: 10, border: `1px solid ${biweeklyType === opt.key ? '#2563eb' : t.inputBorderLight}`, borderRadius: 8, cursor: 'pointer', background: biweeklyType === opt.key ? '#EFF6FF' : t.cardBg }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: t.textPrimary }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: t.textFaint, marginTop: 2 }}>{opt.sub}</div>
                  </div>
                ))}
              </div>
            )}
            {frequency === 'biweekly' && biweeklyType === 'biweekly_alternating' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>Pick a day of the week</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DAYS.map((d, i) => (
                    <button key={d} style={dayBtn(dayOfWeek === i)} onClick={() => setDayOfWeek(i)}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            {frequency === 'monthly' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>Pick a day of the month</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 600, color: t.textMuted, textAlign: 'center', padding: '4px 0 6px' }}>{h}</div>
                  ))}
                  {(() => {
                    const now = new Date();
                    const firstDow = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
                    const cells = [];
                    for (let i = 0; i < firstDow; i++) {
                      cells.push(<div key={`pad-${i}`} style={{ height: 32 }} />);
                    }
                    for (let n = 1; n <= 28; n++) {
                      const sel = dayOfMonth === n;
                      cells.push(
                        <button key={n} onClick={() => setDayOfMonth(n)} style={{
                          width: '100%', height: 32, border: `1px solid ${sel ? '#2563eb' : t.inputBorderLight}`,
                          borderRadius: 6, background: sel ? '#2563eb' : t.cardBg,
                          fontSize: 12, fontWeight: 500, cursor: 'pointer',
                          color: sel ? '#fff' : t.textSecondary, fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.12s', minWidth: 0,
                        }}
                        onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor='#2563eb'; e.currentTarget.style.color='#2563eb'; e.currentTarget.style.background='#EFF6FF'; }}}
                        onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor=t.inputBorderLight; e.currentTarget.style.color=t.textSecondary; e.currentTarget.style.background=t.cardBg; }}}
                        >{n}</button>
                      );
                    }
                    return cells;
                  })()}
                </div>
              </div>
            )}

          </div>

          {/* Time */}
          <div>
            <label style={labelStyle}>Time</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min="0" max="23" style={{ ...inp, width: 70, textAlign: 'center' }} value={hour} onChange={(e) => setHour(e.target.value.padStart(2, '0'))} />
              <span style={{ fontSize: 14, color: t.textMuted }}>:</span>
              <input type="number" min="0" max="59" style={{ ...inp, width: 70, textAlign: 'center' }} value={minute} onChange={(e) => setMinute(e.target.value.padStart(2, '0'))} />
              <select style={{ ...inp, flex: 1, appearance: 'none' }} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: `0.5px solid ${t.cardBorder}` }}>

          {/* End Date */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0, flexShrink: 0 }}>End date</label>
              <input
                type="date"
                style={{ ...inp, flex: 1, fontSize: 12, padding: '5px 8px', height: 'auto', colorScheme: isDark ? 'dark' : 'light', ...(endDateExpired && !endDate ? { borderColor: '#EF4444', boxShadow: '0 0 0 2px rgba(239,68,68,0.2)' } : {}) }}
                value={endDate}
                min={minEndDate}
                onChange={e => setEndDate(e.target.value)}
              />
              {endDate && (
                <button onClick={() => setEndDate('')} style={{ padding: '4px 8px', background: 'none', border: `0.5px solid ${t.inputBorderLight}`, borderRadius: 6, fontSize: 11, cursor: 'pointer', color: t.textMuted, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Preview */}
          <div style={{ fontSize: 11, color: '#166534', background: '#F0FDF4', border: '0.5px solid #BBF7D0', padding: '6px 10px', borderRadius: 6, marginBottom: 12 }}>
            {preview()}
          </div>

          {/* Test Run / Live Invest toggle */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 12, background: t.toggleBg, borderRadius: 8, padding: 3 }}>
            {[{ label: 'Test Run', val: true }, { label: 'Live Invest', val: false }].map(opt => (
              <button key={String(opt.val)} onClick={() => setIsTest(opt.val)} style={{
                flex: 1, padding: '7px 0', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                background: isTest === opt.val ? t.cardBg : 'transparent',
                color: isTest === opt.val ? (opt.val ? '#854F0B' : '#1E40AF') : t.textMuted,
                boxShadow: isTest === opt.val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{opt.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '8px 14px', background: 'none', border: '0.5px solid #FCA5A5', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#DC2626', fontFamily: 'inherit', fontWeight: 500 }}>Cancel</button>
            <button onClick={() => save(isTest)} disabled={saving || total !== 100 || !accountId || !name.trim() || (endDateExpired && !endDate)} style={{ padding: '8px 20px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: total === 100 && accountId && name.trim() && !(endDateExpired && !endDate) ? 'pointer' : 'not-allowed', background: total === 100 && accountId && name.trim() && !(endDateExpired && !endDate) ? '#2563eb' : '#D1D5DB', color: '#fff' }}>
              {saving ? 'Saving…' : isEdit ? 'Update Schedule' : 'Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
