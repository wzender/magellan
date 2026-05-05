import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import * as XLSX from 'xlsx';

const JSON_KEYS = ['attributes', 'en_attributes', 'metadata', 'en_metadata'];
const NON_FILTER_SORT_KEYS = new Set(['ask_gpt']);

function RowLevelTable({ data, showRun2Columns = false, selectedCell = null, run1Name = 'Run 1', run2Name = 'Run 2', onExport, onAddToRetag, retagIds, runId = null }) {
  const [currentPage, setCurrentPage] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [pageSize, setPageSize] = useState(20);
  const [rowHeight, setRowHeight] = useState('3');
  const [expandedJsonCells, setExpandedJsonCells] = useState({});
  const PAGE_SIZE_OPTIONS = [20, 50, 'All'];
  const ROW_HEIGHT_OPTIONS = ['1', '2', '3', 'Auto'];

  const getDefaultColumns = (showRun2, run1Label, run2Label) => {
    if (showRun2) {
      return {
        headerRows: [
          [
            { label: '', colspan: 1, isGroup: false },
            { label: 'Actual', colspan: 2, isGroup: true },
            { label: run1Label, colspan: 2, isGroup: true },
            { label: run2Label, colspan: 2, isGroup: true },
            { label: 'Details', colspan: 2, isGroup: true },
            { label: 'LLM', colspan: 1, isGroup: true }
          ],
          [
            { key: 'request_id', label: 'Request ID', width: 100, isGroup: false },
            { key: 'true_type', label: 'Type', width: 100, isGroup: false },
            { key: 'true_subtype', label: 'Subtype', width: 120, isGroup: false },
            { key: 'pred_type', label: 'Type', width: 100, isGroup: false },
            { key: 'pred_subtype', label: 'Subtype', width: 120, isGroup: false },
            { key: 'run2_pred_type', label: 'Type', width: 100, isGroup: false },
            { key: 'run2_pred_subtype', label: 'Subtype', width: 120, isGroup: false },
            { key: 'attributes', label: 'Attributes', width: '25vw', isGroup: false },
            { key: 'metadata', label: 'Metadata', width: '25vw', isGroup: false },
            { key: 'ask_gpt', label: 'Ask GPT', width: 260, isGroup: false }
          ]
        ],
        columns: [
          { key: 'request_id', label: 'Request ID', width: 100 },
          { key: 'true_type', label: 'Actual Type', width: 100 },
          { key: 'true_subtype', label: 'Actual Subtype', width: 120 },
          { key: 'pred_type', label: 'Predicted Type', width: 100 },
          { key: 'pred_subtype', label: 'Predicted Subtype', width: 120 },
          { key: 'run2_pred_type', label: 'Predicted Type', width: 100 },
          { key: 'run2_pred_subtype', label: 'Predicted Subtype', width: 120 },
          { key: 'attributes', label: 'Attributes', width: '25vw' },
          { key: 'metadata', label: 'Metadata', width: '25vw' },
          { key: 'ask_gpt', label: 'Ask GPT', width: 260 }
        ]
      };
    } else {
      return {
        headerRows: [
          [
            { label: '', colspan: 1, isGroup: false },
            { label: 'Actual', colspan: 2, isGroup: true },
            { label: 'Predicted', colspan: 2, isGroup: true },
            { label: 'Details', colspan: 2, isGroup: true },
            { label: 'LLM', colspan: 1, isGroup: true }
          ],
          [
            { key: 'request_id', label: 'Request ID', width: 100, isGroup: false },
            { key: 'true_type', label: 'Type', width: 100, isGroup: false },
            { key: 'true_subtype', label: 'Subtype', width: 120, isGroup: false },
            { key: 'pred_type', label: 'Type', width: 100, isGroup: false },
            { key: 'pred_subtype', label: 'Subtype', width: 120, isGroup: false },
            { key: 'attributes', label: 'Attributes', width: '25vw', isGroup: false },
            { key: 'metadata', label: 'Metadata', width: '25vw', isGroup: false },
            { key: 'ask_gpt', label: 'Ask GPT', width: 260, isGroup: false }
          ]
        ],
        columns: [
          { key: 'request_id', label: 'Request ID', width: 100 },
          { key: 'true_type', label: 'Actual Type', width: 100 },
          { key: 'true_subtype', label: 'Actual Subtype', width: 120 },
          { key: 'pred_type', label: 'Predicted Type', width: 100 },
          { key: 'pred_subtype', label: 'Predicted Subtype', width: 120 },
          { key: 'attributes', label: 'Attributes', width: '25vw' },
          { key: 'metadata', label: 'Metadata', width: '25vw' },
          { key: 'ask_gpt', label: 'Ask GPT', width: 260 }
        ]
      };
    }
  };

  const [columns, setColumns] = useState(getDefaultColumns(showRun2Columns, run1Name, run2Name));

  useEffect(() => {
    setColumns(getDefaultColumns(showRun2Columns, run1Name, run2Name));
  }, [showRun2Columns, run1Name, run2Name]);

  useEffect(() => {
    setCurrentPage(0);
    setSortConfig({ key: null, direction: 'asc' });
    setPageSize(20);
    setColumnFilters({});
    setExpandedJsonCells({});
  }, [data]);

  useEffect(() => {
    if (!runId) {
      setAskGptByRequest({});
      return;
    }
    fetch(`/api/gpt-results?run_id=${runId}`)
      .then(r => r.json())
      .then(saved => {
        const mapped = {};
        Object.entries(saved || {}).forEach(([requestId, value]) => {
          mapped[requestId] = {
            text: '',
            subtype: value?.verdict || null,
            reason: value?.reasoning || null,
            error: null,
          };
        });
        setAskGptByRequest(mapped);
      })
      .catch(() => setAskGptByRequest({}));
  }, [runId]);

  const [attrLang, setAttrLang] = useState('original');
  const [metaLang, setMetaLang] = useState('original');
  const [columnFilters, setColumnFilters] = useState({});
  const [dragColumnIndex, setDragColumnIndex] = useState(null);
  const [resizingColumnIndex, setResizingColumnIndex] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [toast, setToast] = useState(null);
  const [copiedCell, setCopiedCell] = useState(null);
  const [exporting, setExporting] = useState(false); // 'csv' | 'excel' | false
  const [addingAllToRetag, setAddingAllToRetag] = useState(false);
  const [askGptByRequest, setAskGptByRequest] = useState({});
  const [askGptLoading, setAskGptLoading] = useState({});
  const tableRef = useRef(null);
  const toolbarRef = useRef(null);
  const panelRef = useRef(null);

  /* expose toolbar height as CSS custom property for sticky thead stacking */
  useLayoutEffect(() => {
    const tb = toolbarRef.current;
    const panel = panelRef.current;
    if (!tb || !panel) return;
    const h = tb.getBoundingClientRect().height;
    panel.style.setProperty('--table-toolbar-h', `${h}px`);
  });

  if (!data || !data.data) return <div>No records</div>;

  const mergedData = data.data;

  const getSortedData = () => {
    if (!sortConfig.key) return [...mergedData];
    return [...mergedData].sort((a, b) => {
      const aValue = a[sortConfig.key] ?? '';
      const bValue = b[sortConfig.key] ?? '';
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const sortedData = getSortedData().filter(record =>
    Object.entries(columnFilters).every(([key, val]) =>
      !val || String(record[key] ?? '').toLowerCase().includes(val.toLowerCase())
    )
  );
  const effectivePageSize = pageSize === 'All' ? sortedData.length : pageSize;
  const pageData = sortedData.slice(currentPage * effectivePageSize, (currentPage + 1) * effectivePageSize);
  const totalPages = pageSize === 'All' ? 1 : Math.ceil(sortedData.length / effectivePageSize);

  const moveColumn = (fromIndex, toIndex) => {
    setColumns(prev => {
      const newColumns = [...prev.columns];
      if (fromIndex < 0 || fromIndex >= newColumns.length || toIndex < 0 || toIndex >= newColumns.length) return prev;
      const [moved] = newColumns.splice(fromIndex, 1);
      newColumns.splice(toIndex, 0, moved);
      return { ...prev, columns: newColumns };
    });
  };

  const handleDragStart = (index, event) => {
    setDragColumnIndex(index);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (index, event) => {
    event.preventDefault();
    if (dragColumnIndex === null || dragColumnIndex === index) return;
    moveColumn(dragColumnIndex, index);
    setDragColumnIndex(null);
  };

  const handleResizeStart = (index, event) => {
    setResizingColumnIndex(index);
    setResizeStartX(event.clientX);
    event.preventDefault();
  };

  React.useEffect(() => {
    if (resizingColumnIndex === null) return;
    const handleMouseMove = (event) => {
      const delta = event.clientX - resizeStartX;
      const currentWidth = columns.columns[resizingColumnIndex].width;
      const newWidth = Math.max(100, currentWidth + delta);
      setColumns(prev => {
        const newColumns = [...prev.columns];
        newColumns[resizingColumnIndex] = { ...newColumns[resizingColumnIndex], width: newWidth };
        return { ...prev, columns: newColumns };
      });
      setResizeStartX(event.clientX);
    };
    const handleMouseUp = () => setResizingColumnIndex(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumnIndex, resizeStartX, columns]);

  const copyCellJson = (obj, label, cellKey) => {
    const text = JSON.stringify(obj, null, 2);
    const doFallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        setToast(`${label} copied!`);
        setCopiedCell(cellKey);
        setTimeout(() => setCopiedCell(null), 1000);
      } catch {
        setToast(`Failed to copy ${label}`);
      }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        setToast(`${label} copied!`);
        setCopiedCell(cellKey);
        setTimeout(() => setCopiedCell(null), 1000);
      }).catch(doFallback);
    } else {
      doFallback();
    }
  };

  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  const parseJsonValue = (raw) => {
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      try {
        return JSON.parse(raw.replace(/'/g, '"'));
      } catch {
        return raw;
      }
    }
  };

  const isEmptyJsonValue = (value) => {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.every(isEmptyJsonValue);
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  };

  const filterEmptyJsonValues = (value) => {
    if (Array.isArray(value)) {
      const filtered = value
        .map(filterEmptyJsonValues)
        .filter(item => !isEmptyJsonValue(item));
      return filtered;
    }
    if (value && typeof value === 'object') {
      return Object.entries(value).reduce((acc, [key, entryValue]) => {
        const filteredValue = filterEmptyJsonValues(entryValue);
        if (!isEmptyJsonValue(filteredValue)) {
          acc[key] = filteredValue;
        }
        return acc;
      }, {});
    }
    return value;
  };

  const renderPrettyJson = (raw, cellKey, label, options = {}) => {
    const { filterEmpty = false } = options;
    const obj = parseJsonValue(raw);
    const isEmpty = !obj || (typeof obj === 'object' ? Object.keys(obj).length === 0 : String(obj).trim() === '');
    if (isEmpty) {
      return <div className="json-empty">(empty)</div>;
    }
    const filteredObj = filterEmpty ? filterEmptyJsonValues(obj) : obj;
    const hasFilteredValues = filterEmpty && typeof obj === 'object' && JSON.stringify(filteredObj) !== JSON.stringify(obj);
    const isExpanded = !!expandedJsonCells[cellKey];
    const displayValue = hasFilteredValues && !isExpanded ? filteredObj : obj;
    const display = typeof displayValue === 'object' ? JSON.stringify(displayValue, null, 2) : String(displayValue);
    return (
      <div className="json-cell-wrapper">
        <div className="json-cell-actions">
          {hasFilteredValues && (
            <button
              className="toggle-json-btn"
              onClick={e => {
                e.stopPropagation();
                setExpandedJsonCells(prev => ({ ...prev, [cellKey]: !prev[cellKey] }));
              }}
            >
              {isExpanded ? 'Show less' : 'Show all'}
            </button>
          )}
          <button
            className="copy-json-btn"
            onClick={e => { e.stopPropagation(); copyCellJson(obj, label, cellKey); }}
          >
            {copiedCell === cellKey ? 'Copied ✔' : 'Copy'}
          </button>
        </div>
        <pre className="json-pretty">{display}</pre>
      </div>
    );
  };

  const tableTitle = showRun2Columns
    ? (selectedCell
        ? `Transition Record Details: ${selectedCell.run1 || '—'} → ${selectedCell.run2 || '—'}`
        : 'Transition Record Details')
    : 'Record Details';

  const getExportData = async (kind) => {
    let exportData = sortedData;
    if (onExport) {
      setExporting(kind);
      try {
        const result = await onExport();
        exportData = (result.data || []).filter(record =>
          Object.entries(columnFilters).every(([key, val]) =>
            !val || String(record[key] ?? '').toLowerCase().includes(val.toLowerCase())
          )
        );
        if (sortConfig.key) {
          exportData = [...exportData].sort((a, b) => {
            const aVal = a[sortConfig.key] ?? '';
            const bVal = b[sortConfig.key] ?? '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
          });
        }
      } catch (e) {
        console.error('Export failed', e);
        setExporting(false);
        return null;
      }
      setExporting(false);
    }
    return exportData;
  };

  const getExportColumns = () => {
    const cols = [...columns.columns];
    const attrIdx = cols.findIndex(c => c.key === 'attributes');
    if (attrIdx !== -1 && !cols.find(c => c.key === 'en_attributes')) {
      cols.splice(attrIdx + 1, 0, { key: 'en_attributes', label: 'Attributes (EN)', width: 220 });
    }
    return cols;
  };

  const exportToCsv = async () => {
    const cols = getExportColumns();
    const exportData = await getExportData('csv');
    if (!exportData) return;
    const headers = cols.map(col => col.label);
    const rows = exportData.map(record =>
      cols.map(col => {
        const val = record[col.key];
        if (JSON_KEYS.includes(col.key)) return JSON.stringify(val ?? '');
        const str = String(val ?? '');
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"` : str;
      })
    );
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToExcel = async () => {
    const cols = getExportColumns();
    const exportData = await getExportData('excel');
    if (!exportData) return;
    const headers = cols.map(col => col.label);
    const rows = exportData.map(record =>
      cols.map(col => {
        const val = record[col.key];
        return JSON_KEYS.includes(col.key) ? JSON.stringify(val ?? '') : (val ?? '');
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Records');
    XLSX.writeFile(wb, `${tableTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xlsx`);
  };

  const getAskText = (requestId) => {
    const v = askGptByRequest[requestId];
    if (!v) return 'Prompt output will appear here';
    if (v.error) return `Error: ${v.error}`;
    if (v.subtype) {
      const subtype = v.subtype ? `SUBTYPE: ${v.subtype}` : '';
      const reason = v.reason ? `REASON: ${v.reason}` : '';
      return [subtype, reason].filter(Boolean).join(' | ');
    }
    if (v.reason) return v.reason;
    return v.text || 'No response text';
  };

  const handleAskGpt = async (record) => {
    const requestId = record.request_id;
    setAskGptLoading(prev => ({ ...prev, [requestId]: true }));
    try {
      const res = await fetch('/api/ask-gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: record.attributes,
          metadata: record.metadata,
        }),
      });
      const payload = await res.json();
      if (!res.ok || payload.error) {
        throw new Error(payload.error || `Request failed (${res.status})`);
      }
      setAskGptByRequest(prev => ({
        ...prev,
        [requestId]: {
          text: payload.text || '',
          subtype: payload.subtype || null,
          reason: payload.reason || null,
          error: null,
        },
      }));

      if (runId) {
        const persisted = {
          verdict: payload.subtype || '',
          reasoning: payload.reason || payload.text || '',
        };
        fetch('/api/gpt-results', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_id: runId, results: { [requestId]: persisted } }),
        }).catch(() => {});
      }
    } catch (err) {
      setAskGptByRequest(prev => ({
        ...prev,
        [requestId]: {
          text: '',
          subtype: null,
          reason: null,
          error: err.message || 'Failed to ask GPT',
        },
      }));
    } finally {
      setAskGptLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  return (
    <div className="row-level-table-panel" ref={panelRef}>
      <div className="table-toolbar" ref={toolbarRef}>
        <h3>{tableTitle} ({Object.values(columnFilters).some(v => v) ? `${sortedData.length} of ${data.pagination.total}` : data.pagination.total} total)</h3>
        {onAddToRetag && (
          <button
            className="add-all-to-retag-btn"
            disabled={addingAllToRetag}
            title="Add all records (beyond current page) to retag list"
            onClick={async () => {
              setAddingAllToRetag(true);
              try {
                const allData = await getExportData('_retag');
                if (allData) allData.forEach(r => onAddToRetag(r));
              } finally {
                setAddingAllToRetag(false);
              }
            }}
          >
            {addingAllToRetag ? 'Adding…' : '+ Add All to Retag'}
          </button>
        )}
        <button className="export-csv-btn" onClick={exportToCsv} disabled={!!exporting} title="Export all filtered rows to CSV">
          {exporting === 'csv' ? 'Exporting…' : 'Export to CSV'}
        </button>
        <button className="export-csv-btn" onClick={exportToExcel} disabled={!!exporting} title="Export all filtered rows to Excel">
          {exporting === 'excel' ? 'Exporting…' : 'Export to Excel'}
        </button>
        <div className="row-height-control">
          <span className="row-height-label">Row height:</span>
          {ROW_HEIGHT_OPTIONS.map(opt => (
            <button
              key={opt}
              className={`row-height-btn${rowHeight === opt ? ' active' : ''}`}
              onClick={() => setRowHeight(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrapper" ref={tableRef}>
        {toast && <div className="toast-message">{toast}</div>}
        <table className={`records-table row-height-${rowHeight.toLowerCase()}`}>
          <thead>
            {columns.headerRows.map((headerRow, rowIndex) => (
              <tr key={rowIndex}>
                {headerRow.map((col, index) => {
                  const actualIndex = index;
                  return (
                    <th
                      key={`${rowIndex}-${index}`}
                      colSpan={col.colspan || 1}
                      style={{
                        width: col.isGroup ? 'auto' : col.width,
                        position: col.isGroup ? 'static' : 'relative',
                        textAlign: col.isGroup ? 'center' : 'left'
                      }}
                      draggable={!col.isGroup && rowIndex === columns.headerRows.length - 1}
                      onDragStart={event => !col.isGroup && rowIndex === columns.headerRows.length - 1 && handleDragStart(actualIndex, event)}
                      onDragOver={!col.isGroup && rowIndex === columns.headerRows.length - 1 ? handleDragOver : undefined}
                      onDrop={event => !col.isGroup && rowIndex === columns.headerRows.length - 1 && handleDrop(actualIndex, event)}
                      onClick={() => {
                        if (!col.isGroup && rowIndex === columns.headerRows.length - 1 && col.key && !JSON_KEYS.includes(col.key) && !NON_FILTER_SORT_KEYS.has(col.key)) {
                          setSortConfig(prev => ({
                            key: col.key,
                            direction: prev.key === col.key && prev.direction === 'asc' ? 'desc' : 'asc'
                          }));
                        }
                      }}
                      className={col.isGroup ? 'group-header' : ''}
                    >
                      <div className="header-cell">
                        <div>
                          {col.label}
                          {!col.isGroup && sortConfig.key === col.key && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                        </div>
                        {col.key === 'attributes' && (
                          <div className="attr-lang-toggle" onClick={e => e.stopPropagation()}>
                            <button className={`attr-lang-btn${attrLang === 'original' ? ' active' : ''}`} onClick={() => setAttrLang('original')}>orig</button>
                            <button className={`attr-lang-btn${attrLang === 'en' ? ' active' : ''}`} onClick={() => setAttrLang('en')}>EN</button>
                          </div>
                        )}
                        {col.key === 'metadata' && (
                          <div className="attr-lang-toggle" onClick={e => e.stopPropagation()}>
                            <button className={`attr-lang-btn${metaLang === 'original' ? ' active' : ''}`} onClick={() => setMetaLang('original')}>orig</button>
                            <button className={`attr-lang-btn${metaLang === 'en' ? ' active' : ''}`} onClick={() => setMetaLang('en')}>EN</button>
                          </div>
                        )}
                      </div>
                      {!col.isGroup && rowIndex === columns.headerRows.length - 1 && actualIndex < columns.columns.length - 1 && (
                        <div
                          className={`resize-handle ${resizingColumnIndex === actualIndex ? 'resizing' : ''}`}
                          onMouseDown={e => handleResizeStart(actualIndex, e)}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
            <tr className="column-filter-row">
              {columns.columns.map((col, i) => (
                <th key={`filter-${i}`}>
                  {col.key && !JSON_KEYS.includes(col.key) && !NON_FILTER_SORT_KEYS.has(col.key) ? (
                    <input
                      className="column-filter-input"
                      type="text"
                      placeholder="filter…"
                      value={columnFilters[col.key] || ''}
                      onChange={e => {
                        setCurrentPage(0);
                        setColumnFilters(prev => ({ ...prev, [col.key]: e.target.value }));
                      }}
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map(record => (
              <tr key={record.id} className="record-row">
                {columns.columns.map(col => {
                  switch (col.key) {
                    case 'request_id': {
                      const run1CorrectnessCls = record.true_subtype === record.pred_subtype ? 'badge-correct' : record.true_type !== record.pred_type ? 'badge-incorrect' : 'badge-same-type';
                      const run2CorrectnessCls = record.true_subtype === record.run2_pred_subtype ? 'badge-correct' : record.true_type !== record.run2_pred_type ? 'badge-incorrect' : 'badge-same-type';
                      const run1Correct = record.true_type === record.pred_type && record.true_subtype === record.pred_subtype;
                      const run2Correct = record.true_type === record.run2_pred_type && record.true_subtype === record.run2_pred_subtype;
                      const alreadyRetagged = retagIds && retagIds.has(record.request_id);
                      return (
                        <td key={`${record.id}-request_id`}>
                          <div className="record-id-cell">
                            {showRun2Columns ? (
                              <>
                                <span className={`correctness-badge ${run1CorrectnessCls}`} title={`${run1Name}: ${run1CorrectnessCls === 'badge-correct' ? 'Correct' : run1CorrectnessCls === 'badge-same-type' ? 'Same-type wrong' : 'Cross-type wrong'}`} />
                                <span className={`correctness-badge ${run2CorrectnessCls}`} title={`${run2Name}: ${run2CorrectnessCls === 'badge-correct' ? 'Correct' : run2CorrectnessCls === 'badge-same-type' ? 'Same-type wrong' : 'Cross-type wrong'}`} />
                              </>
                            ) : (
                              <span className={`correctness-badge ${run1CorrectnessCls}`} title={run1CorrectnessCls === 'badge-correct' ? 'Correct' : run1CorrectnessCls === 'badge-same-type' ? 'Same-type wrong' : 'Cross-type wrong'} />
                            )}
                            <span>{record.request_id}</span>
                            {onAddToRetag && (
                              <button
                                className={`add-to-retag-btn${alreadyRetagged ? ' add-to-retag-btn--tagged' : ''}`}
                                onClick={e => { e.stopPropagation(); onAddToRetag(record); }}
                                title={alreadyRetagged ? 'Already in retag list' : 'Add to retag list'}
                              >
                                {alreadyRetagged ? '✓ Retagged' : '+ Retag'}
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    }
                    case 'true_type':      return <td key={`${record.id}-true_type`}>{record.true_type}</td>;
                    case 'pred_type':      return <td key={`${record.id}-pred_type`}>{record.pred_type}</td>;
                    case 'true_subtype':   return <td key={`${record.id}-true_subtype`}>{record.true_subtype}</td>;
                    case 'pred_subtype':   return <td key={`${record.id}-pred_subtype`}>{record.pred_subtype}</td>;
                    case 'run2_pred_type': return <td key={`${record.id}-run2_pred_type`}>{record.run2_pred_type || '-'}</td>;
                    case 'run2_pred_subtype': return <td key={`${record.id}-run2_pred_subtype`}>{record.run2_pred_subtype || '-'}</td>;
                    case 'attributes': {
                      const attrsObj = attrLang === 'en' ? record.en_attributes : record.attributes;
                      return <td key={`${record.id}-attributes`} className="json-td">{renderPrettyJson(attrsObj, `${record.id}-attributes`, 'Attributes', { filterEmpty: true })}</td>;
                    }
                    case 'metadata': {
                      const metaObj = metaLang === 'en' ? record.en_metadata : record.metadata;
                      return <td key={`${record.id}-metadata`} className="json-td">{renderPrettyJson(metaObj, `${record.id}-metadata`, 'Metadata', { filterEmpty: true })}</td>;
                    }
                    case 'ask_gpt': {
                      const loading = !!askGptLoading[record.request_id];
                      return (
                        <td key={`${record.id}-ask_gpt`} className="ask-gpt-td">
                          <div className="ask-gpt-cell">
                            <div className="ask-gpt-placeholder">{getAskText(record.request_id)}</div>
                            <button
                              className="ask-gpt-row-btn"
                              disabled={loading}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAskGpt(record);
                              }}
                            >
                              {loading ? 'Asking…' : 'Ask GPT'}
                            </button>
                          </div>
                        </td>
                      );
                    }
                    default:
                      return <td key={`${record.id}-${col.key}`}>-</td>;
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button onClick={() => setCurrentPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0 || pageSize === 'All'}>‹ Prev</button>
        <span className="pagination-info">
          {pageSize === 'All'
            ? `${sortedData.length} rows`
            : `${currentPage * effectivePageSize + 1}–${Math.min((currentPage + 1) * effectivePageSize, sortedData.length)} of ${sortedData.length}`}
        </span>
        <button onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1 || pageSize === 'All'}>Next ›</button>
        <div className="page-size-controls">
          {PAGE_SIZE_OPTIONS.map(opt => (
            <button key={opt} className={`page-size-btn${pageSize === opt ? ' active' : ''}`} onClick={() => { setPageSize(opt); setCurrentPage(0); }}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RowLevelTable;
