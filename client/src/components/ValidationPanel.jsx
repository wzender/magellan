import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import * as XLSX from 'xlsx';

/* ── SubtypeCombobox ──────────────────────────────────────────────────────── */
// options: [{ subtype, type }] — only subtype names are shown / filtered
function SubtypeCombobox({ value, options, onChange }) {
  const [query, setQuery]     = useState('');
  const [open, setOpen]       = useState(false);
  const [focused, setFocused] = useState(0);
  const wrapperRef = useRef(null);
  const inputRef   = useRef(null);
  const listRef    = useRef(null);

  const subtypes = Array.from(new Set(options.map(o => String(o.subtype || '').trim())));
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const filtered = normalizedQuery
    ? subtypes.filter(s => s.toLowerCase().includes(normalizedQuery))
    : subtypes;

  // Close on click outside — no blur/focus involved so typing can't accidentally close
  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (!wrapperRef.current?.contains(e.target)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  // Focus the input whenever the dropdown opens
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const commit = (subtype) => { onChange(subtype); setQuery(''); setOpen(false); };

  const toggle = () => setOpen(o => { if (o) setQuery(''); return !o; });

  const handleKey = (e) => {
    if (!open) return;
    if      (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    else if (e.key === 'Enter')     { e.preventDefault(); if (filtered[focused]) commit(filtered[focused]); }
    else if (e.key === 'Escape')    { setOpen(false); setQuery(''); }
  };

  useEffect(() => { setFocused(0); }, [query]);

  useEffect(() => {
    listRef.current?.querySelectorAll('.subtype-combobox-option')[focused]
      ?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  return (
    <div className="subtype-combobox" ref={wrapperRef}>
      <div className={`subtype-combobox-input-wrap${open ? ' open' : ''}`} onClick={toggle}>
        <input
          ref={inputRef}
          className="subtype-combobox-search"
          placeholder={value || '— select subtype —'}
          value={open ? query : ''}
          readOnly={!open}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          onClick={e => e.stopPropagation()}
        />
        <span className="subtype-combobox-arrow">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <ul ref={listRef} className="subtype-combobox-list">
          {value && (
            <li className="subtype-combobox-clear" onMouseDown={e => { e.preventDefault(); commit(''); }}>
              ✕ Clear
            </li>
          )}
          {filtered.map((s, i) => (
            <li
              key={s}
              className={`subtype-combobox-option${i === focused ? ' focused' : ''}${s === value ? ' selected' : ''}`}
              onMouseDown={e => { e.preventDefault(); commit(s); }}
              onMouseEnter={() => setFocused(i)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const VERDICTS = [
  { value: 'justified', label: 'Justified', className: 'verdict-justified' },
  { value: 'unjustified', label: 'Not Justified', className: 'verdict-unjustified' },
  { value: 'unclear', label: 'Unclear', className: 'verdict-unclear' },
];

const EMPTY_COL_FILTERS = { request_id: '', pred_subtype: '', attributes: '', metadata: '', gpt_verdict: '', gpt_reasoning: '' };

function ValidationPanel({ runId, runName, country, countrySubtypes, records, verdicts, onSetVerdict, onBulkVerdict }) {
  const isRetag = Boolean(country && countrySubtypes && countrySubtypes.length > 0);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [rowHeight, setRowHeight] = useState('3');
  const [colFilters, setColFilters] = useState(EMPTY_COL_FILTERS);
  const [verdictFilter, setVerdictFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [attrLang, setAttrLang] = useState('original');
  const [metaLang, setMetaLang] = useState('original');
  const [toast, setToast] = useState(null);
  const [copiedCell, setCopiedCell] = useState(null);
  const [gptResults, setGptResults] = useState({});   // request_id -> { verdict, reasoning }
  const [gptRunning, setGptRunning] = useState(false);
  const [gptProgress, setGptProgress] = useState({ done: 0, total: 0 });
  const gptCancelledRef = useRef(false);
  const toolbarRef = useRef(null);
  const panelRef = useRef(null);

  const PAGE_SIZE_OPTIONS = [20, 50, 'All'];
  const ROW_HEIGHT_OPTIONS = ['1', '2', '3', 'Auto'];

  useLayoutEffect(() => {
    const tb = toolbarRef.current;
    const panel = panelRef.current;
    if (!tb || !panel) return;
    panel.style.setProperty('--table-toolbar-h', `${tb.getBoundingClientRect().height}px`);
  });

  useEffect(() => {
    setCurrentPage(0);
    setSelectedIds(new Set());
    setGptResults({});
    setGptRunning(false);
    setColFilters(EMPTY_COL_FILTERS);
    if (runId) {
      fetch(`/api/gpt-results?run_id=${runId}`)
        .then(r => r.json())
        .then(data => setGptResults(data && typeof data === 'object' ? data : {}))
        .catch(() => {});
    }
  }, [runId]);

  useEffect(() => {
    setCurrentPage(0);
  }, [verdictFilter, JSON.stringify(colFilters)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!records || records.length === 0) {
    return <div className="validation-empty">No records for this run.</div>;
  }

  /* ── filtering ── */
  let filtered = records;
  if (colFilters.request_id)   filtered = filtered.filter(r => r.request_id.toLowerCase().includes(colFilters.request_id.toLowerCase()));
  if (colFilters.pred_subtype) filtered = filtered.filter(r => (r.pred_subtype || '').toLowerCase().includes(colFilters.pred_subtype.toLowerCase()));
  if (colFilters.attributes)   filtered = filtered.filter(r => JSON.stringify(r.attributes || '').toLowerCase().includes(colFilters.attributes.toLowerCase()));
  if (colFilters.metadata)     filtered = filtered.filter(r => JSON.stringify(r.metadata || '').toLowerCase().includes(colFilters.metadata.toLowerCase()));
  if (colFilters.gpt_verdict)  filtered = filtered.filter(r => (gptResults[r.request_id]?.verdict || '').toLowerCase().includes(colFilters.gpt_verdict.toLowerCase()));
  if (colFilters.gpt_reasoning) filtered = filtered.filter(r => (gptResults[r.request_id]?.reasoning || '').toLowerCase().includes(colFilters.gpt_reasoning.toLowerCase()));
  if (verdictFilter !== 'all') {
    if (verdictFilter === 'unreviewed') filtered = filtered.filter(r => !verdicts[r.request_id]);
    else filtered = filtered.filter(r => verdicts[r.request_id] === verdictFilter);
  }

  /* ── sorting ── */
  if (sortConfig.key) {
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      if (sortConfig.key === 'verdict') {
        aVal = verdicts[a.request_id] || '';
        bVal = verdicts[b.request_id] || '';
      } else if (sortConfig.key === 'gpt_verdict') {
        aVal = gptResults[a.request_id]?.verdict || '';
        bVal = gptResults[b.request_id]?.verdict || '';
      } else if (sortConfig.key === 'gpt_reasoning') {
        aVal = gptResults[a.request_id]?.reasoning || '';
        bVal = gptResults[b.request_id]?.reasoning || '';
      } else {
        aVal = a[sortConfig.key] ?? '';
        bVal = b[sortConfig.key] ?? '';
      }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const effectivePageSize = pageSize === 'All' ? filtered.length : pageSize;
  const pageData = filtered.slice(currentPage * effectivePageSize, (currentPage + 1) * effectivePageSize);
  const totalPages = pageSize === 'All' ? 1 : Math.ceil(filtered.length / effectivePageSize);

  /* ── stats ── */
  const total = records.length;
  const reviewed = records.filter(r => verdicts[r.request_id]).length;
  const justifiedCount   = records.filter(r => verdicts[r.request_id] === 'justified').length;
  const unjustifiedCount = records.filter(r => verdicts[r.request_id] === 'unjustified').length;
  const unclearCount     = records.filter(r => verdicts[r.request_id] === 'unclear').length;
  const retaggedCount    = reviewed; // in retag mode, any selection counts as reviewed

  /* ── bulk ── */
  const allPageSelected = pageData.length > 0 && pageData.every(r => selectedIds.has(r.request_id));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) pageData.forEach(r => next.delete(r.request_id));
      else pageData.forEach(r => next.add(r.request_id));
      return next;
    });
  };

  const toggleSelect = (requestId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  };

  const handleBulkVerdict = (verdict) => {
    if (selectedIds.size === 0) return;
    const bulk = {};
    selectedIds.forEach(id => { bulk[id] = verdict; });
    onBulkVerdict(bulk);
    setSelectedIds(new Set());
  };

  /* ── sort ── */
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortIndicator = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  /* ── col filter helper ── */
  const setColFilter = (col, val) => setColFilters(prev => ({ ...prev, [col]: val }));

  /* ── ask GPT (filtered records only) ── */
  const askGptAll = async (recordsToProcess) => {
    gptCancelledRef.current = false;
    const pending = recordsToProcess.filter(r => !gptResults[r.request_id]);
    if (pending.length === 0) return;
    setGptRunning(true);
    setGptProgress({ done: 0, total: pending.length });
    for (const record of pending) {
      if (gptCancelledRef.current) break;
      let result;
      try {
        const res = await fetch('/api/ask-gpt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attributes: record.attributes,
            metadata: record.metadata,
            suggested_type: record.pred_type,
            suggested_subtype: record.pred_subtype,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        result = { verdict: data.verdict, reasoning: data.reasoning };
      } catch (err) {
        result = { verdict: '?', reasoning: err.message || '(error)' };
      }
      setGptResults(prev => ({ ...prev, [record.request_id]: result }));
      fetch('/api/gpt-results', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, results: { [record.request_id]: result } }),
      }).catch(() => {});
      setGptProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }
    setGptRunning(false);
  };

  /* ── json rendering ── */
  const copyCellJson = (obj, label, cellKey) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2)).then(() => {
      setToast(`${label} copied!`);
      setCopiedCell(cellKey);
      setTimeout(() => setCopiedCell(null), 1000);
    }).catch(() => setToast(`Failed to copy ${label}`));
  };

  const renderPrettyJson = (raw, cellKey, label) => {
    let obj = raw;
    if (typeof raw === 'string') {
      try { obj = JSON.parse(raw); } catch { /* leave as string */ }
    }
    const isEmpty = !obj || (typeof obj === 'object' ? Object.keys(obj).length === 0 : String(obj).trim() === '');
    if (isEmpty) return <div className="json-empty">(empty)</div>;
    const display = typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj);
    return (
      <div className="json-cell-wrapper">
        <button className="copy-json-btn" onClick={e => { e.stopPropagation(); copyCellJson(obj, label, cellKey); }}>
          {copiedCell === cellKey ? 'Copied ✔' : 'Copy'}
        </button>
        <pre className="json-pretty">{display}</pre>
      </div>
    );
  };

  /* ── export ── */
  const doExport = (kind) => {
    const headers = ['request_id', 'pred_type', 'pred_subtype', 'verdict', 'gpt_verdict', 'gpt_reasoning', 'attributes', 'metadata'];
    const rows = filtered.map(r => [
      r.request_id,
      r.pred_type,
      r.pred_subtype,
      verdicts[r.request_id] || '',
      gptResults[r.request_id]?.verdict || '',
      gptResults[r.request_id]?.reasoning || '',
      JSON.stringify(r.attributes ?? ''),
      JSON.stringify(r.metadata ?? ''),
    ]);

    if (kind === 'csv') {
      const csv = [headers.join(','), ...rows.map(r =>
        r.map(v => {
          const s = String(v ?? '');
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')
      )].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `validation_${runName || runId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Validation');
      XLSX.writeFile(wb, `validation_${runName || runId}.xlsx`);
    }
  };

  return (
    <div className={`validation-panel row-level-table-panel row-height-${rowHeight}`} ref={panelRef}>
      {toast && <div className="copy-toast">{toast}</div>}

      <div className="validation-toolbar" ref={toolbarRef}>
        {/* Progress stats */}
        <div className="validation-stats">
          {isRetag ? (
            <>
              <span className="validation-progress">{retaggedCount}/{total} retagged</span>
              <span className="validation-stat" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                {total - retaggedCount} pending
              </span>
            </>
          ) : (
            <>
              <span className="validation-progress">{reviewed}/{total} reviewed</span>
              <span className="validation-stat verdict-justified-bg">{justifiedCount} justified</span>
              <span className="validation-stat verdict-unjustified-bg">{unjustifiedCount} not justified</span>
              <span className="validation-stat verdict-unclear-bg">{unclearCount} unclear</span>
            </>
          )}
        </div>

        {/* Filter */}
        <div className="validation-filters">
          <select
            className="validation-verdict-filter"
            value={verdictFilter}
            onChange={e => setVerdictFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="unreviewed">{isRetag ? 'Not retagged' : 'Unreviewed'}</option>
            {!isRetag && <option value="justified">Justified</option>}
            {!isRetag && <option value="unjustified">Not Justified</option>}
            {!isRetag && <option value="unclear">Unclear</option>}
          </select>
        </div>

        {/* Bulk actions — only for verdict mode */}
        {!isRetag && selectedIds.size > 0 && (
          <div className="validation-bulk">
            <span className="validation-bulk-count">{selectedIds.size} selected</span>
            {VERDICTS.map(v => (
              <button key={v.value} className={`validation-bulk-btn ${v.className}`} onClick={() => handleBulkVerdict(v.value)}>
                {v.label}
              </button>
            ))}
            <button className="validation-bulk-btn validation-bulk-clear" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        )}

        {/* Row height, export, ask gpt */}
        <div className="validation-controls">
          <div className="row-height-control">
            <span className="row-height-label">Row height:</span>
            {ROW_HEIGHT_OPTIONS.map(opt => (
              <button key={opt} className={`row-height-btn${rowHeight === opt ? ' active' : ''}`} onClick={() => setRowHeight(opt)}>{opt}</button>
            ))}
          </div>
          <button className="export-csv-btn" onClick={() => doExport('csv')}>CSV</button>
          <button className="export-csv-btn" onClick={() => doExport('excel')}>Excel</button>
          <button
            className={`export-csv-btn ask-gpt-btn${gptRunning ? ' loading' : ''}`}
            onClick={() => askGptAll(filtered)}
            disabled={gptRunning}
          >
            {gptRunning ? `GPT ${gptProgress.done}/${gptProgress.total}…` : 'Ask GPT'}
          </button>
          {gptRunning && (
            <button className="export-csv-btn ask-gpt-cancel-btn" onClick={() => { gptCancelledRef.current = true; }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="validation-table-wrap">
        <table className="validation-table records-table">
          <thead>
            {/* Column headers */}
            <tr>
              {!isRetag && (
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
                </th>
              )}
              <th style={{ width: 120, cursor: 'pointer' }} onClick={() => handleSort('request_id')}>
                Request ID{sortIndicator('request_id')}
              </th>
              <th style={{ width: 150, cursor: 'pointer' }} onClick={() => handleSort('pred_subtype')}>
                Suggested Subtype{sortIndicator('pred_subtype')}
              </th>
              <th style={{ width: 250 }}>
                <div className="header-cell">
                  Attributes
                  <div className="attr-lang-toggle" onClick={e => e.stopPropagation()}>
                    <button className={`attr-lang-btn${attrLang === 'original' ? ' active' : ''}`} onClick={() => setAttrLang('original')}>orig</button>
                    <button className={`attr-lang-btn${attrLang === 'en' ? ' active' : ''}`} onClick={() => setAttrLang('en')}>EN</button>
                  </div>
                </div>
              </th>
              <th style={{ width: 250 }}>
                <div className="header-cell">
                  Metadata
                  <div className="attr-lang-toggle" onClick={e => e.stopPropagation()}>
                    <button className={`attr-lang-btn${metaLang === 'original' ? ' active' : ''}`} onClick={() => setMetaLang('original')}>orig</button>
                    <button className={`attr-lang-btn${metaLang === 'en' ? ' active' : ''}`} onClick={() => setMetaLang('en')}>EN</button>
                  </div>
                </div>
              </th>
              {isRetag ? (
                <th style={{ width: 200, cursor: 'pointer' }} onClick={() => handleSort('verdict')}>
                  Retag{sortIndicator('verdict')}
                </th>
              ) : (
                <th style={{ width: 160, cursor: 'pointer' }} onClick={() => handleSort('verdict')}>
                  Verdict{sortIndicator('verdict')}
                </th>
              )}
              <th style={{ width: 80, cursor: 'pointer' }} onClick={() => handleSort('gpt_verdict')}>
                GPT Verdict{sortIndicator('gpt_verdict')}
              </th>
              <th style={{ width: 260, cursor: 'pointer' }} onClick={() => handleSort('gpt_reasoning')}>
                GPT Reasoning{sortIndicator('gpt_reasoning')}
              </th>
            </tr>
            {/* Column filters */}
            <tr className="col-filter-row">
              {!isRetag && <th />}
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.request_id} onChange={e => setColFilter('request_id', e.target.value)} /></th>
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.pred_subtype} onChange={e => setColFilter('pred_subtype', e.target.value)} /></th>
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.attributes} onChange={e => setColFilter('attributes', e.target.value)} /></th>
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.metadata} onChange={e => setColFilter('metadata', e.target.value)} /></th>
              <th />
              <th><input className="col-filter-input" placeholder="yes/no" value={colFilters.gpt_verdict} onChange={e => setColFilter('gpt_verdict', e.target.value)} /></th>
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.gpt_reasoning} onChange={e => setColFilter('gpt_reasoning', e.target.value)} /></th>
            </tr>
          </thead>
          <tbody>
            {pageData.map(r => {
              const verdict = verdicts[r.request_id] || '';
              const gpt = gptResults[r.request_id];
              const attrData = attrLang === 'en' ? (r.en_attributes || r.attributes) : r.attributes;
              const metaData = metaLang === 'en' ? (r.en_metadata || r.metadata) : r.metadata;
              const effectiveSubtypeOptions = countrySubtypes;

              return (
                <tr key={r.request_id} className={verdict ? (isRetag ? 'retag-row-tagged' : `validation-row-${verdict}`) : ''}>
                  {!isRetag && (
                    <td>
                      <input type="checkbox" checked={selectedIds.has(r.request_id)} onChange={() => toggleSelect(r.request_id)} />
                    </td>
                  )}
                  <td className="cell-request-id">{r.request_id}</td>
                  <td><strong>{r.pred_subtype}</strong></td>
                  <td className="cell-json">{renderPrettyJson(attrData, `attr-${r.request_id}`, 'Attributes')}</td>
                  <td className="cell-json">{renderPrettyJson(metaData, `meta-${r.request_id}`, 'Metadata')}</td>
                  {isRetag ? (
                    <td className="cell-verdict cell-retag">
                      <SubtypeCombobox
                        value={verdict}
                        options={effectiveSubtypeOptions}
                        onChange={val => onSetVerdict(r.request_id, val)}
                      />
                    </td>
                  ) : (
                    <td className="cell-verdict">
                      <div className="verdict-buttons">
                        {VERDICTS.map(v => (
                          <button
                            key={v.value}
                            className={`verdict-btn ${v.className}${verdict === v.value ? ' active' : ''}`}
                            onClick={() => onSetVerdict(r.request_id, verdict === v.value ? '' : v.value)}
                            title={v.label}
                          >
                            {v.value === 'justified' ? '✓' : v.value === 'unjustified' ? '✗' : '?'}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                  <td className={`cell-gpt-verdict${gpt ? ` gpt-verdict-${gpt.verdict}` : ''}`}>
                    {gpt ? gpt.verdict : ''}
                  </td>
                  <td className="cell-gpt-reasoning">
                    {gpt?.reasoning || ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <div className="page-size-control">
          <span className="page-size-label">Per page:</span>
          {PAGE_SIZE_OPTIONS.map(opt => (
            <button key={opt} className={`page-size-btn${pageSize === opt ? ' active' : ''}`} onClick={() => { setPageSize(opt); setCurrentPage(0); }}>{opt}</button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="page-nav">
            <button disabled={currentPage === 0} onClick={() => setCurrentPage(0)}>«</button>
            <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>‹</button>
            <span className="page-info">Page {currentPage + 1} of {totalPages}</span>
            <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}>›</button>
            <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(totalPages - 1)}>»</button>
          </div>
        )}
        <span className="page-total">{filtered.length} records</span>
      </div>
    </div>
  );
}

export default ValidationPanel;
