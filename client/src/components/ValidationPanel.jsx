import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import * as XLSX from 'xlsx';

const VERDICTS = [
  { value: 'justified', label: 'Justified', className: 'verdict-justified' },
  { value: 'unjustified', label: 'Not Justified', className: 'verdict-unjustified' },
  { value: 'unclear', label: 'Unclear', className: 'verdict-unclear' },
];

function ValidationPanel({ runId, runName, records, verdicts, onSetVerdict, onBulkVerdict }) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [rowHeight, setRowHeight] = useState('3');
  const [filterText, setFilterText] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('all'); // 'all' | 'unreviewed' | 'justified' | 'unjustified' | 'unclear'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [attrLang, setAttrLang] = useState('original');
  const [metaLang, setMetaLang] = useState('original');
  const [toast, setToast] = useState(null);
  const [copiedCell, setCopiedCell] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [gptAnswers, setGptAnswers] = useState({});   // request_id -> answer string
  const [gptLoading, setGptLoading] = useState({});    // request_id -> true
  const toolbarRef = useRef(null);
  const panelRef = useRef(null);

  const PAGE_SIZE_OPTIONS = [20, 50, 'All'];
  const ROW_HEIGHT_OPTIONS = ['1', '2', '3', 'Auto'];

  useLayoutEffect(() => {
    const tb = toolbarRef.current;
    const panel = panelRef.current;
    if (!tb || !panel) return;
    const h = tb.getBoundingClientRect().height;
    panel.style.setProperty('--table-toolbar-h', `${h}px`);
  });

  useEffect(() => {
    setCurrentPage(0);
    setSelectedIds(new Set());
    setGptAnswers({});
    setGptLoading({});
  }, [runId, verdictFilter, filterText]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!records || records.length === 0) {
    return <div className="validation-empty">No records for this run.</div>;
  }

  /* ── filtering & sorting ── */
  let filtered = records;
  if (filterText) {
    const q = filterText.toLowerCase();
    filtered = filtered.filter(r =>
      r.request_id.toLowerCase().includes(q) ||
      (r.pred_subtype || '').toLowerCase().includes(q) ||
      (r.pred_type || '').toLowerCase().includes(q) ||
      JSON.stringify(r.attributes || '').toLowerCase().includes(q) ||
      JSON.stringify(r.metadata || '').toLowerCase().includes(q)
    );
  }
  if (verdictFilter !== 'all') {
    if (verdictFilter === 'unreviewed') {
      filtered = filtered.filter(r => !verdicts[r.request_id]);
    } else {
      filtered = filtered.filter(r => verdicts[r.request_id] === verdictFilter);
    }
  }

  if (sortConfig.key) {
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      if (sortConfig.key === 'verdict') {
        aVal = verdicts[a.request_id] || '';
        bVal = verdicts[b.request_id] || '';
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
  const justifiedCount = records.filter(r => verdicts[r.request_id] === 'justified').length;
  const unjustifiedCount = records.filter(r => verdicts[r.request_id] === 'unjustified').length;
  const unclearCount = records.filter(r => verdicts[r.request_id] === 'unclear').length;

  /* ── bulk ── */
  const allPageSelected = pageData.length > 0 && pageData.every(r => selectedIds.has(r.request_id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageData.forEach(r => next.delete(r.request_id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageData.forEach(r => next.add(r.request_id));
        return next;
      });
    }
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

  /* ── ask GPT ── */
  const askGpt = async (record) => {
    const reqId = record.request_id;
    setGptLoading(prev => ({ ...prev, [reqId]: true }));
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
      setGptAnswers(prev => ({ ...prev, [reqId]: data.answer || data.error || '(error)' }));
    } catch (err) {
      setGptAnswers(prev => ({ ...prev, [reqId]: '(request failed)' }));
    } finally {
      setGptLoading(prev => ({ ...prev, [reqId]: false }));
    }
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
        <button
          className="copy-json-btn"
          onClick={e => { e.stopPropagation(); copyCellJson(obj, label, cellKey); }}
        >
          {copiedCell === cellKey ? 'Copied ✔' : 'Copy'}
        </button>
        <pre className="json-pretty">{display}</pre>
      </div>
    );
  };

  /* ── export ── */
  const doExport = (kind) => {
    const headers = ['request_id', 'pred_type', 'pred_subtype', 'verdict', 'attributes', 'metadata'];
    const rows = filtered.map(r => [
      r.request_id,
      r.pred_type,
      r.pred_subtype,
      verdicts[r.request_id] || '',
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
          <span className="validation-progress">{reviewed}/{total} reviewed</span>
          <span className="validation-stat verdict-justified-bg">{justifiedCount} justified</span>
          <span className="validation-stat verdict-unjustified-bg">{unjustifiedCount} not justified</span>
          <span className="validation-stat verdict-unclear-bg">{unclearCount} unclear</span>
        </div>

        {/* Filters */}
        <div className="validation-filters">
          <input
            className="validation-search"
            type="text"
            placeholder="Search records…"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
          <select
            className="validation-verdict-filter"
            value={verdictFilter}
            onChange={e => setVerdictFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="justified">Justified</option>
            <option value="unjustified">Not Justified</option>
            <option value="unclear">Unclear</option>
          </select>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="validation-bulk">
            <span className="validation-bulk-count">{selectedIds.size} selected</span>
            {VERDICTS.map(v => (
              <button
                key={v.value}
                className={`validation-bulk-btn ${v.className}`}
                onClick={() => handleBulkVerdict(v.value)}
              >
                {v.label}
              </button>
            ))}
            <button className="validation-bulk-btn validation-bulk-clear" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        )}

        {/* Row height, language, export */}
        <div className="validation-controls">
          <div className="row-height-control">
            <span className="row-height-label">Row height:</span>
            {ROW_HEIGHT_OPTIONS.map(opt => (
              <button
                key={opt}
                className={`row-height-btn${rowHeight === opt ? ' active' : ''}`}
                onClick={() => setRowHeight(opt)}
              >{opt}</button>
            ))}
          </div>
          <button className="export-csv-btn" onClick={() => doExport('csv')}>CSV</button>
          <button className="export-csv-btn" onClick={() => doExport('excel')}>Excel</button>
        </div>
      </div>

      {/* Table */}
      <div className="validation-table-wrap">
        <table className="validation-table records-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
              </th>
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
              <th style={{ width: 200, cursor: 'pointer' }} onClick={() => handleSort('verdict')}>
                Verdict{sortIndicator('verdict')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((r, idx) => {
              const verdict = verdicts[r.request_id] || '';
              const attrData = attrLang === 'en' ? (r.en_attributes || r.attributes) : r.attributes;
              const metaData = metaLang === 'en' ? (r.en_metadata || r.metadata) : r.metadata;

              return (
                <tr key={r.request_id} className={verdict ? `validation-row-${verdict}` : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.request_id)}
                      onChange={() => toggleSelect(r.request_id)}
                    />
                  </td>
                  <td className="cell-request-id">{r.request_id}</td>
                  <td><strong>{r.pred_subtype}</strong></td>
                  <td className="cell-json">
                    {renderPrettyJson(attrData, `attr-${r.request_id}`, 'Attributes')}
                  </td>
                  <td className="cell-json">
                    {renderPrettyJson(metaData, `meta-${r.request_id}`, 'Metadata')}
                  </td>
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
                      <button
                        className={`verdict-btn verdict-gpt${gptLoading[r.request_id] ? ' loading' : ''}`}
                        onClick={() => askGpt(r)}
                        disabled={gptLoading[r.request_id]}
                        title="Ask GPT"
                      >
                        {gptLoading[r.request_id] ? '…' : '🤖'}
                      </button>
                    </div>
                    {gptAnswers[r.request_id] && (
                      <div className="gpt-answer">{gptAnswers[r.request_id]}</div>
                    )}
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
            <button
              key={opt}
              className={`page-size-btn${pageSize === opt ? ' active' : ''}`}
              onClick={() => { setPageSize(opt); setCurrentPage(0); }}
            >{opt}</button>
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
