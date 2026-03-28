import { useEffect, useState, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import { useDashboard } from '../context/DashboardContext';
import api from '../api/client';

const fmtCT = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
  return `${date} · ${time}`;
};

const fmtISO = (iso) => {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
};

const fmt$ = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

const STATUS_BADGE = {
  FILLED:   { bg: '#DCFCE7', color: '#166534' },
  WORKING:  { bg: '#DBEAFE', color: '#1E40AF' },
  PARTIAL:  { bg: '#FEF9C3', color: '#854F0B' },
  REJECTED: { bg: '#FEE2E2', color: '#991B1B' },
  CANCELED: { bg: '#FEE2E2', color: '#991B1B' },
  DRY_RUN:  { bg: '#F3F4F6', color: '#6B7280' },
  FAILED:   { bg: '#FEE2E2', color: '#991B1B' },
};

function Badge({ label, style }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 500,
      display: 'inline-block', ...style,
    }}>{label}</span>
  );
}

const COLS = [
  { key: 'created_at', label: 'Date',    width: 155 },
  { key: 'account',    label: 'Account', width: 145 },
  { key: 'symbol',     label: 'Symbol',  width: 80  },
  { key: 'shares',     label: 'Shares',  width: 70, right: true },
  { key: 'price',      label: 'Price',   width: 80, right: true },
  { key: 'amount',     label: 'Amount',  width: 95, right: true },
  { key: 'status',     label: 'Status',  width: 95 },
  { key: 'type',       label: 'Type',    width: 80 },
];

export default function History() {
  const { connectedAccounts } = useDashboard();

  const [allLogs, setAllLogs]     = useState([]);
  const [loading, setLoading]     = useState(true);

  // Filters
  const [fFrom,   setFFrom]   = useState('');
  const [fTo,     setFTo]     = useState('');
  const [fAcct,   setFAcct]   = useState('');
  const [fSym,    setFSym]    = useState('');
  const [fType,   setFType]   = useState('');
  const [fStatus, setFStatus] = useState('');

  // Applied filters (only update on Apply click)
  const [applied, setApplied] = useState({});

  // Sort
  const [sortCol, setSortCol]   = useState('created_at');
  const [sortDir, setSortDir]   = useState(-1);

  // Pagination
  const [perPage,  setPerPage]  = useState(50);
  const [curPage,  setCurPage]  = useState(1);

  // Fetch all logs (up to 1000)
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/logs', { params: { page: 1, per_page: 1000 } });
      setAllLogs(r.data.items || []);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const applyFilters = () => {
    setApplied({ fFrom, fTo, fAcct, fSym: fSym.trim().toUpperCase(), fType, fStatus });
    setCurPage(1);
  };

  const resetFilters = () => {
    setFFrom(''); setFTo(''); setFAcct(''); setFSym(''); setFType(''); setFStatus('');
    setApplied({});
    setCurPage(1);
  };

  const activeTags = useMemo(() => {
    const tags = [];
    if (applied.fFrom)   tags.push({ id: 'fFrom',   label: `From: ${applied.fFrom}` });
    if (applied.fTo)     tags.push({ id: 'fTo',     label: `To: ${applied.fTo}` });
    if (applied.fAcct)   tags.push({ id: 'fAcct',   label: applied.fAcct });
    if (applied.fSym)    tags.push({ id: 'fSym',    label: applied.fSym });
    if (applied.fType)   tags.push({ id: 'fType',   label: applied.fType === 'live' ? 'Live only' : 'Dry run only' });
    if (applied.fStatus) tags.push({ id: 'fStatus', label: applied.fStatus });
    return tags;
  }, [applied]);

  const removeTag = (id) => {
    const next = { ...applied, [id]: '' };
    setApplied(next);
    if (id === 'fFrom')   setFFrom('');
    if (id === 'fTo')     setFTo('');
    if (id === 'fAcct')   setFAcct('');
    if (id === 'fSym')    setFSym('');
    if (id === 'fType')   setFType('');
    if (id === 'fStatus') setFStatus('');
    setCurPage(1);
  };

  const filtered = useMemo(() => {
    return allLogs.filter(r => {
      const iso = fmtISO(r.created_at);
      if (applied.fFrom   && iso < applied.fFrom)                  return false;
      if (applied.fTo     && iso > applied.fTo)                    return false;
      if (applied.fAcct   && `${r.account_name} ...${String(r.account_number || '').slice(-3)}` !== applied.fAcct) return false;
      if (applied.fSym    && r.symbol !== applied.fSym)            return false;
      if (applied.fType === 'live' && r.dry_run)                   return false;
      if (applied.fType === 'dry'  && !r.dry_run)                  return false;
      if (applied.fStatus && r.status !== applied.fStatus)         return false;
      return true;
    });
  }, [allLogs, applied]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av, bv;
      if (sortCol === 'created_at') { av = new Date(a.created_at); bv = new Date(b.created_at); }
      else if (sortCol === 'account') { av = a.account_name || ''; bv = b.account_name || ''; }
      else if (sortCol === 'symbol')  { av = a.symbol || ''; bv = b.symbol || ''; }
      else { av = a[sortCol] ?? 0; bv = b[sortCol] ?? 0; }
      return av > bv ? sortDir : av < bv ? -sortDir : 0;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const pageSlice  = sorted.slice((curPage - 1) * perPage, curPage * perPage);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d * -1);
    else { setSortCol(col); setSortDir(-1); }
  };

  // Stats
  const stats = useMemo(() => ({
    filled:   filtered.filter(r => r.status === 'FILLED').length,
    partial:  filtered.filter(r => r.status === 'PARTIAL').length,
    rejected: filtered.filter(r => r.status === 'REJECTED' || r.status === 'CANCELED').length,
    total:    filtered.filter(r => !r.dry_run && r.status === 'FILLED').reduce((s, r) => s + (r.amount || 0), 0),
  }), [filtered]);

  // Account options for dropdown
  const accountOptions = useMemo(() => {
    const seen = new Set();
    return allLogs
      .filter(r => r.account_name && r.account_number)
      .map(r => `${r.account_name} ...${String(r.account_number).slice(-3)}`)
      .filter(v => { if (seen.has(v)) return false; seen.add(v); return true; });
  }, [allLogs]);

  const exportCSV = () => {
    const rows = [['Date', 'Account', 'Symbol', 'Shares', 'Price', 'Amount', 'Status', 'Type']];
    sorted.forEach(r => rows.push([
      fmtCT(r.created_at),
      r.account_name ? `${r.account_name} ...${String(r.account_number || '').slice(-3)}` : r.account_id,
      r.symbol, r.shares ?? '', r.price != null ? r.price.toFixed(2) : '',
      r.amount != null ? r.amount.toFixed(2) : '',
      r.status, r.dry_run ? 'Dry run' : 'Live',
    ]));
    const csv = rows.map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'hye-yield-history.csv';
    a.click();
  };

  // Pagination button list
  const pageButtons = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [1];
    if (curPage > 3) pages.push('…');
    for (let i = Math.max(2, curPage - 1); i <= Math.min(totalPages - 1, curPage + 1); i++) pages.push(i);
    if (curPage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
    return pages;
  }, [totalPages, curPage]);

  const inp = { padding: '7px 10px', border: '0.5px solid #D1D5DB', borderRadius: 8, fontSize: 12, background: '#fff', color: '#111827', fontFamily: 'inherit', height: 32 };
  const sel = { ...inp, appearance: 'none', paddingRight: 24, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236B7280'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' };

  return (
    <Layout>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#111827' }}>Trade history</div>
        <button onClick={exportCSV} style={{ padding: '6px 14px', border: '0.5px solid #D1D5DB', background: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
          Export CSV
        </button>
      </div>

      {/* Filter card */}
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.07)', padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>From</div>
            <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={{ ...inp, width: 130, borderColor: fFrom ? '#2563eb' : '#D1D5DB', background: fFrom ? '#EFF6FF' : '#fff', color: fFrom ? '#1E40AF' : '#111827' }} />
          </div>

          <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: '32px' }}>—</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>To</div>
            <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={{ ...inp, width: 130, borderColor: fTo ? '#2563eb' : '#D1D5DB', background: fTo ? '#EFF6FF' : '#fff', color: fTo ? '#1E40AF' : '#111827' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Account</div>
            <select value={fAcct} onChange={e => setFAcct(e.target.value)} style={{ ...sel, minWidth: 150, borderColor: fAcct ? '#2563eb' : '#D1D5DB', background: fAcct ? '#EFF6FF' : '#fff', color: fAcct ? '#1E40AF' : '#111827' }}>
              <option value="">All accounts</option>
              {accountOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Symbol</div>
            <input type="text" value={fSym} onChange={e => setFSym(e.target.value.toUpperCase())} placeholder="e.g. SPUS" style={{ ...inp, width: 100, borderColor: fSym ? '#2563eb' : '#D1D5DB', background: fSym ? '#EFF6FF' : '#fff', color: fSym ? '#1E40AF' : '#111827' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</div>
            <select value={fType} onChange={e => setFType(e.target.value)} style={{ ...sel, minWidth: 110, borderColor: fType ? '#2563eb' : '#D1D5DB', background: fType ? '#EFF6FF' : '#fff', color: fType ? '#1E40AF' : '#111827' }}>
              <option value="">All types</option>
              <option value="live">Live only</option>
              <option value="dry">Dry run only</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</div>
            <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ ...sel, minWidth: 110, borderColor: fStatus ? '#2563eb' : '#D1D5DB', background: fStatus ? '#EFF6FF' : '#fff', color: fStatus ? '#1E40AF' : '#111827' }}>
              <option value="">All statuses</option>
              <option value="FILLED">Filled</option>
              <option value="WORKING">Working</option>
              <option value="PARTIAL">Partial</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELED">Canceled</option>
              <option value="DRY_RUN">Dry run</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <button onClick={applyFilters} style={{ padding: '0 16px', height: 32, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Apply</button>
            <button onClick={resetFilters} style={{ padding: '0 12px', height: 32, background: 'none', border: '0.5px solid #D1D5DB', borderRadius: 8, fontSize: 12, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
          </div>
        </div>

        {/* Active filter tags */}
        {activeTags.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '0.5px solid #F3F4F6' }}>
            <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0, marginRight: 2 }}>Active filters</span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
              {activeTags.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#EFF6FF', border: '0.5px solid #BFDBFE', borderRadius: 99, padding: '3px 10px', fontSize: 11, color: '#1D4ED8', fontWeight: 500 }}>
                  {t.label}
                  <span onClick={() => removeTag(t.id)} style={{ cursor: 'pointer', color: '#93C5FD', fontSize: 14, lineHeight: 1 }}>×</span>
                </div>
              ))}
            </div>
            <span onClick={resetFilters} style={{ fontSize: 11, color: '#9CA3AF', cursor: 'pointer', flexShrink: 0 }}>Clear all</span>
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#6B7280' }}>
          Showing <strong style={{ color: '#111827', fontWeight: 500 }}>
            {sorted.length ? `${(curPage - 1) * perPage + 1}–${Math.min(curPage * perPage, sorted.length)}` : '0'}
          </strong> of <strong style={{ color: '#111827', fontWeight: 500 }}>{sorted.length}</strong> trades
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { label: `Filled: ${stats.filled}`,     bg: '#DCFCE7', color: '#166534' },
            { label: `Partial: ${stats.partial}`,   bg: '#FEF9C3', color: '#854F0B' },
            { label: `Rejected: ${stats.rejected}`, bg: '#FEE2E2', color: '#991B1B' },
            { label: `Total: ${fmt$(stats.total)}`, bg: '#F3F4F6', color: '#374151' },
          ].map(s => (
            <span key={s.label} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 500, background: s.bg, color: s.color }}>{s.label}</span>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 12 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
            <thead style={{ background: '#F9FAFB', borderBottom: '0.5px solid #E5E7EB' }}>
              <tr>
                {COLS.map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)} style={{
                    textAlign: col.right ? 'right' : 'left', padding: '9px 12px',
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', width: col.width,
                    color: sortCol === col.key ? '#2563eb' : '#9CA3AF',
                  }}>
                    {col.label}{sortCol === col.key ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageSlice.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9CA3AF', padding: 40, fontSize: 13 }}>No trades match your filters</td></tr>
              ) : pageSlice.map(r => {
                const acctLabel = r.account_name ? `${r.account_name} ...${String(r.account_number || '').slice(-3)}` : (r.account_id || '—');
                const badge = STATUS_BADGE[r.status] || { bg: '#F3F4F6', color: '#6B7280' };
                return (
                  <tr key={r.id} style={{ borderBottom: '0.5px solid #F3F4F6' }}
                    onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = '#FAFBFC')}
                    onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = '')}>
                    <td style={{ padding: '9px 12px', fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtCT(r.created_at)}</td>
                    <td style={{ padding: '9px 12px', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acctLabel}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.symbol}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>{r.shares ?? '—'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>{r.price != null ? fmt$(r.price) : '—'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 500 }}>{r.amount != null ? fmt$(r.amount) : '—'}</td>
                    <td style={{ padding: '9px 12px' }}><Badge label={r.status.replace('_', ' ')} style={badge} /></td>
                    <td style={{ padding: '9px 12px' }}><Badge label={r.dry_run ? 'Dry run' : 'Live'} style={r.dry_run ? { bg: '#F3F4F6', color: '#6B7280' } : { bg: '#DCFCE7', color: '#166534' }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280' }}>
          Rows per page
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setCurPage(1); }} style={{ ...sel, padding: '4px 20px 4px 8px', fontSize: 12 }}>
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: '#6B7280' }}>
          Page <strong style={{ color: '#111827', fontWeight: 500 }}>{curPage}</strong> of <strong style={{ color: '#111827', fontWeight: 500 }}>{totalPages}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <PgBtn disabled={curPage === 1} onClick={() => setCurPage(p => p - 1)}>‹</PgBtn>
          {pageButtons.map((p, i) =>
            p === '…'
              ? <span key={`e${i}`} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#9CA3AF' }}>…</span>
              : <PgBtn key={p} active={p === curPage} onClick={() => setCurPage(p)}>{p}</PgBtn>
          )}
          <PgBtn disabled={curPage === totalPages} onClick={() => setCurPage(p => p + 1)}>›</PgBtn>
        </div>
      </div>
    </Layout>
  );
}

function PgBtn({ children, onClick, disabled, active }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 32, height: 32, border: `0.5px solid ${active ? '#2563eb' : '#D1D5DB'}`,
      borderRadius: 8, background: active ? '#2563eb' : '#fff',
      fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: active ? '#fff' : '#374151', fontFamily: 'inherit',
      fontWeight: active ? 500 : 400, opacity: disabled ? 0.35 : 1,
    }}>{children}</button>
  );
}
