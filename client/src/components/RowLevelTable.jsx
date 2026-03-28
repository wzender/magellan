import React, { useState, useRef, useEffect } from 'react';

const JSON_KEYS = ['attributes', 'metadata'];

function RowLevelTable({ data, showRun2Columns = false, selectedCell = null, run1Name = 'Run 1', run2Name = 'Run 2' }) {
  const [currentPage, setCurrentPage] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [pageSize, setPageSize] = useState(20);
  const [rowHeight, setRowHeight] = useState('3');
  const PAGE_SIZE_OPTIONS = [20, 50, 'All'];
  const ROW_HEIGHT_OPTIONS = ['1', '2', '3', 'Auto'];

  const getDefaultColumns = (showRun2, run1Label, run2Label) => {
    if (showRun2) {
      return {
        headerRows: [
          [
            { label: '', colspan: 1, isGroup: false },
            { label: 'True', colspan: 2, isGroup: true },
            { label: run1Label, colspan: 2, isGroup: true },
            { label: run2Label, colspan: 2, isGroup: true },
            { label: 'Details', colspan: 2, isGroup: true }
          ],
          [
            { key: 'record_id', label: 'Record ID', width: 100, isGroup: false },
            { key: 'true_type', label: 'True Type', width: 100, isGroup: false },
            { key: 'true_subtype', label: 'True Subtype', width: 120, isGroup: false },
            { key: 'pred_type', label: 'Pred Type', width: 100, isGroup: false },
            { key: 'pred_subtype', label: 'Pred Subtype', width: 120, isGroup: false },
            { key: 'run2_pred_type', label: 'Pred Type', width: 100, isGroup: false },
            { key: 'run2_pred_subtype', label: 'Pred Subtype', width: 120, isGroup: false },
            { key: 'attributes', label: 'Attributes', width: 220, isGroup: false },
            { key: 'metadata', label: 'Metadata', width: 220, isGroup: false }
          ]
        ],
        columns: [
          { key: 'record_id', label: 'Record ID', width: 100 },
          { key: 'true_type', label: 'True Type', width: 100 },
          { key: 'true_subtype', label: 'True Subtype', width: 120 },
          { key: 'pred_type', label: 'Pred Type', width: 100 },
          { key: 'pred_subtype', label: 'Pred Subtype', width: 120 },
          { key: 'run2_pred_type', label: 'Pred Type', width: 100 },
          { key: 'run2_pred_subtype', label: 'Pred Subtype', width: 120 },
          { key: 'attributes', label: 'Attributes', width: 220 },
          { key: 'metadata', label: 'Metadata', width: 220 }
        ]
      };
    } else {
      return {
        headerRows: [
          [
            { key: 'record_id', label: 'Record ID', width: 100, isGroup: false },
            { key: 'true_type', label: 'True Type', width: 100, isGroup: false },
            { key: 'pred_type', label: 'Pred Type', width: 100, isGroup: false },
            { key: 'true_subtype', label: 'True Subtype', width: 120, isGroup: false },
            { key: 'pred_subtype', label: 'Pred Subtype', width: 120, isGroup: false },
            { key: 'attributes', label: 'Attributes', width: 220, isGroup: false },
            { key: 'metadata', label: 'Metadata', width: 220, isGroup: false }
          ]
        ],
        columns: [
          { key: 'record_id', label: 'Record ID', width: 100 },
          { key: 'true_type', label: 'True Type', width: 100 },
          { key: 'pred_type', label: 'Pred Type', width: 100 },
          { key: 'true_subtype', label: 'True Subtype', width: 120 },
          { key: 'pred_subtype', label: 'Pred Subtype', width: 120 },
          { key: 'attributes', label: 'Attributes', width: 220 },
          { key: 'metadata', label: 'Metadata', width: 220 }
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
  }, [data]);

  const [columnFilters, setColumnFilters] = useState({});
  const [dragColumnIndex, setDragColumnIndex] = useState(null);
  const [resizingColumnIndex, setResizingColumnIndex] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [toast, setToast] = useState(null);
  const [copiedCell, setCopiedCell] = useState(null);
  const tableRef = useRef(null);

  if (!data || !data.data) return <div>No records</div>;

  const getSortedData = () => {
    if (!sortConfig.key) return [...data.data];
    return [...data.data].sort((a, b) => {
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
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2)).then(() => {
      setToast(`${label} copied!`);
      setCopiedCell(cellKey);
      setTimeout(() => setCopiedCell(null), 1000);
    }).catch(() => setToast(`Failed to copy ${label}`));
  };

  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  const renderPrettyJson = (obj, cellKey, label) => {
    if (!obj || Object.keys(obj).length === 0) {
      return <div className="json-empty">(empty)</div>;
    }
    return (
      <div className="json-cell-wrapper">
        <button
          className="copy-json-btn"
          onClick={e => { e.stopPropagation(); copyCellJson(obj, label, cellKey); }}
        >
          {copiedCell === cellKey ? 'Copied ✔' : 'Copy'}
        </button>
        <pre className="json-pretty">{JSON.stringify(obj, null, 2)}</pre>
      </div>
    );
  };

  const tableTitle = showRun2Columns
    ? (selectedCell
        ? `Transition Record Details: ${selectedCell.run1 || '—'} → ${selectedCell.run2 || '—'}`
        : 'Transition Record Details')
    : 'Record Details';

  return (
    <div className="row-level-table-panel">
      <div className="table-toolbar">
        <h3>{tableTitle} ({data.pagination.total} total)</h3>
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
                  const actualIndex = rowIndex === columns.headerRows.length - 1
                    ? columns.headerRows.slice(0, -1).reduce((sum, row) => sum + row.length, 0) + index
                    : index;
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
                        if (!col.isGroup && rowIndex === columns.headerRows.length - 1 && col.key && !JSON_KEYS.includes(col.key)) {
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
                  {col.key && !JSON_KEYS.includes(col.key) ? (
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
                    case 'record_id': {
                      const run1Correct = record.true_type === record.pred_type && record.true_subtype === record.pred_subtype;
                      const run2Correct = record.true_type === record.run2_pred_type && record.true_subtype === record.run2_pred_subtype;
                      return (
                        <td key={`${record.id}-record_id`}>
                          <div className="record-id-cell">
                            {showRun2Columns ? (
                              <>
                                <span className={`correctness-badge ${run1Correct ? 'badge-correct' : 'badge-incorrect'}`} title={`${run1Name}: ${run1Correct ? 'Correct' : 'Incorrect'}`} />
                                <span className={`correctness-badge ${run2Correct ? 'badge-correct' : 'badge-incorrect'}`} title={`${run2Name}: ${run2Correct ? 'Correct' : 'Incorrect'}`} />
                              </>
                            ) : (
                              <span className={`correctness-badge ${run1Correct ? 'badge-correct' : 'badge-incorrect'}`} title={run1Correct ? 'Correct' : 'Incorrect'} />
                            )}
                            <span>{record.record_id}</span>
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
                    case 'attributes':
                      return <td key={`${record.id}-attributes`} className="json-td">{renderPrettyJson(record.attributes, `${record.id}-attributes`, 'Attributes')}</td>;
                    case 'metadata':
                      return <td key={`${record.id}-metadata`} className="json-td">{renderPrettyJson(record.metadata, `${record.id}-metadata`, 'Metadata')}</td>;
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
