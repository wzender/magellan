import React, { useState, useRef, useEffect } from 'react';

function RowLevelTable({ data, showRun2Columns = false, selectedCell = null, run1Name = 'Run 1', run2Name = 'Run 2' }) {
  const [currentPage, setCurrentPage] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [pageSize, setPageSize] = useState(20);
  const PAGE_SIZE_OPTIONS = [20, 50, 'All'];

  const toggleRow = (id) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getDefaultColumns = (showRun2, run1Label, run2Label) => {
    if (showRun2) {
      // Two-line header structure for transition mode
      return {
        headerRows: [
          // First header row - group headers
          [
            { label: '', colspan: 1, isGroup: false },
            { label: '', colspan: 1, isGroup: false },
            { label: 'True', colspan: 2, isGroup: true },
            { label: run1Label, colspan: 2, isGroup: true },
            { label: run2Label, colspan: 2, isGroup: true }
          ],
          // Second header row - individual column headers
          [
            { key: '_expand', label: '', width: 32, isGroup: false },
            { key: 'record_id', label: 'Record ID', width: 100, isGroup: false },
            { key: 'true_type', label: 'True Type', width: 100, isGroup: false },
            { key: 'true_subtype', label: 'True Subtype', width: 120, isGroup: false },
            { key: 'pred_type', label: 'Pred Type', width: 100, isGroup: false },
            { key: 'pred_subtype', label: 'Pred Subtype', width: 120, isGroup: false },
            { key: 'run2_pred_type', label: 'Pred Type', width: 100, isGroup: false },
            { key: 'run2_pred_subtype', label: 'Pred Subtype', width: 120, isGroup: false }
          ]
        ],
        columns: [
          { key: '_expand', label: '', width: 32 },
          { key: 'record_id', label: 'Record ID', width: 100 },
          { key: 'true_type', label: 'True Type', width: 100 },
          { key: 'true_subtype', label: 'True Subtype', width: 120 },
          { key: 'pred_type', label: 'Pred Type', width: 100 },
          { key: 'pred_subtype', label: 'Pred Subtype', width: 120 },
          { key: 'run2_pred_type', label: 'Pred Type', width: 100 },
          { key: 'run2_pred_subtype', label: 'Pred Subtype', width: 120 }
        ]
      };
    } else {
      // Single-line header for confusion mode
      return {
        headerRows: [
          [
            { key: '_expand', label: '', width: 32, isGroup: false },
            { key: 'record_id', label: 'Record ID', width: 100, isGroup: false },
            { key: 'true_type', label: 'True Type', width: 100, isGroup: false },
            { key: 'pred_type', label: 'Pred Type', width: 100, isGroup: false },
            { key: 'true_subtype', label: 'True Subtype', width: 120, isGroup: false },
            { key: 'pred_subtype', label: 'Pred Subtype', width: 120, isGroup: false }
          ]
        ],
        columns: [
          { key: '_expand', label: '', width: 32 },
          { key: 'record_id', label: 'Record ID', width: 100 },
          { key: 'true_type', label: 'True Type', width: 100 },
          { key: 'pred_type', label: 'Pred Type', width: 100 },
          { key: 'true_subtype', label: 'True Subtype', width: 120 },
          { key: 'pred_subtype', label: 'Pred Subtype', width: 120 }
        ]
      };
    }
  };

  const [columns, setColumns] = useState(getDefaultColumns(showRun2Columns, run1Name, run2Name));

  useEffect(() => {
    setColumns(getDefaultColumns(showRun2Columns, run1Name, run2Name));
  }, [showRun2Columns, run1Name, run2Name]);

  // Reset pagination, sorting, and expanded rows when data changes
  useEffect(() => {
    setCurrentPage(0);
    setSortConfig({ key: null, direction: 'asc' });
    setExpandedRows(new Set());
    setPageSize(20);
  }, [data]);

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

  const sortedData = getSortedData();
  const effectivePageSize = pageSize === 'All' ? sortedData.length : pageSize;
  const pageData = sortedData.slice(currentPage * effectivePageSize, (currentPage + 1) * effectivePageSize);
  const totalPages = pageSize === 'All' ? 1 : Math.ceil(sortedData.length / effectivePageSize);

  const moveColumn = (fromIndex, toIndex) => {
    setColumns(prev => {
      const newColumns = [...prev.columns];
      if (fromIndex < 0 || fromIndex >= newColumns.length || toIndex < 0 || toIndex >= newColumns.length) {
        return prev;
      }
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

  const setColumnWidth = (index, width) => {
    setColumns(prev => {
      const newColumns = [...prev.columns];
      newColumns[index] = { ...newColumns[index], width: parseInt(width) || 100 };
      return { ...prev, columns: newColumns };
    });
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
      setColumnWidth(resizingColumnIndex, newWidth);
      setResizeStartX(event.clientX);
    };

    const handleMouseUp = () => {
      setResizingColumnIndex(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumnIndex, resizeStartX, columns]);

  const renderJsonPreview = obj => {
    if (!obj) return '(empty)';
    const str = JSON.stringify(obj).substring(0, 100);
    return str.length > 100 ? str + '...' : str;
  };

  const copyToClipboard = (obj) => {
    const jsonString = JSON.stringify(obj, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      setToast('JSON copied to clipboard!');
    }).catch(() => {
      setToast('Failed to copy JSON');
    });
  };

  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  const renderPrettyJson = obj => {
    if (!obj || Object.keys(obj).length === 0) {
      return <div className="json-empty">(empty)</div>;
    }
    return (
      <pre className="json-pretty">{JSON.stringify(obj, null, 2)}</pre>
    );
  };

  const copyCellJsonToClipboard = (jsonObject, label, cellKey = null) => {
    const jsonString = JSON.stringify(jsonObject, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      setToast(`${label} copied to clipboard!`);
      if (cellKey) {
        setCopiedCell(cellKey);
        setTimeout(() => setCopiedCell(null), 1000);
      }
    }).catch(() => {
      setToast(`Failed to copy ${label}`);
    });
  };

  const tableTitle = showRun2Columns 
    ? (selectedCell 
        ? `Transition Record Details: ${selectedCell.run1 || '—'} → ${selectedCell.run2 || '—'}`
        : 'Transition Record Details')
    : 'Record Details';

  return (
    <div className="row-level-table-panel">
      <h3>{tableTitle} ({data.pagination.total} total)</h3>
      <div className="table-wrapper" ref={tableRef}>
        {toast && <div className="toast-message">{toast}</div>}
          <table className="records-table">
          <thead>
            {columns.headerRows.map((headerRow, rowIndex) => (
              <tr key={rowIndex}>
                {headerRow.map((col, index) => {
                  const actualIndex = rowIndex === columns.headerRows.length - 1 ? 
                    columns.headerRows.slice(0, -1).reduce((sum, row) => sum + row.length, 0) + index : 
                    index;
                  
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
                      onDragOver={!col.isGroup && rowIndex === columns.headerRows.length - 1 && handleDragOver}
                      onDrop={event => !col.isGroup && rowIndex === columns.headerRows.length - 1 && handleDrop(actualIndex, event)}
                      onClick={() => {
                        if (!col.isGroup && rowIndex === columns.headerRows.length - 1 && col.key) {
                          setSortConfig(prev => {
                            if (prev.key === col.key) {
                              return { key: col.key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                            }
                            return { key: col.key, direction: 'asc' };
                          });
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
                          onMouseDown={(e) => handleResizeStart(actualIndex, e)}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {pageData.map(record => {
              const isExpanded = expandedRows.has(record.id);
              const colSpan = columns.columns.length;
              return (
              <React.Fragment key={record.id}>
                <tr className={`record-row${isExpanded ? ' record-row-expanded' : ''}`}>
                  {columns.columns.map(col => {
                    switch (col.key) {
                      case '_expand':
                        return (
                          <td key={`${record.id}-expand`} className="expand-toggle-cell">
                            <button
                              className={`expand-toggle${isExpanded ? ' expanded' : ''}`}
                              onClick={() => toggleRow(record.id)}
                              title={isExpanded ? 'Collapse details' : 'Expand details'}
                            >
                              {isExpanded ? '▾' : '▸'}
                            </button>
                          </td>
                        );
                      case 'record_id': {
                        const run1Correct = record.true_type === record.pred_type && record.true_subtype === record.pred_subtype;
                        const run2Correct = record.true_type === record.run2_pred_type && record.true_subtype === record.run2_pred_subtype;
                        return (
                          <td key={`${record.id}-${col.key}`}>
                            <div className="record-id-cell">
                              {showRun2Columns ? (
                                <>
                                  <span
                                    className={`correctness-badge ${run1Correct ? 'badge-correct' : 'badge-incorrect'}`}
                                    title={`Run 1: ${run1Correct ? 'Correct' : 'Incorrect'}`}
                                  />
                                  <span
                                    className={`correctness-badge ${run2Correct ? 'badge-correct' : 'badge-incorrect'}`}
                                    title={`Run 2: ${run2Correct ? 'Correct' : 'Incorrect'}`}
                                  />
                                </>
                              ) : (
                                <span
                                  className={`correctness-badge ${run1Correct ? 'badge-correct' : 'badge-incorrect'}`}
                                  title={run1Correct ? 'Correct' : 'Incorrect'}
                                />
                              )}
                              <span>{record.record_id}</span>
                            </div>
                          </td>
                        );
                      }
                      case 'true_type':
                        return <td key={`${record.id}-${col.key}`}>{record.true_type}</td>;
                      case 'pred_type':
                        return <td key={`${record.id}-${col.key}`}>{record.pred_type}</td>;
                      case 'true_subtype':
                        return <td key={`${record.id}-${col.key}`}>{record.true_subtype}</td>;
                      case 'pred_subtype':
                        return <td key={`${record.id}-${col.key}`}>{record.pred_subtype}</td>;
                      case 'run2_pred_type':
                        return <td key={`${record.id}-${col.key}`}>{record.run2_pred_type || '-'}</td>;
                      case 'run2_pred_subtype':
                        return <td key={`${record.id}-${col.key}`}>{record.run2_pred_subtype || '-'}</td>;
                      default:
                        return <td key={`${record.id}-${col.key}`}>-</td>;
                    }
                  })}
                </tr>
                {isExpanded && (
                  <tr className="record-detail-row">
                    <td colSpan={colSpan} className="record-detail-cell">
                      <div className="record-detail-grid">
                        <div className="record-detail-section">
                          <div className="record-detail-header">
                            <span>Attributes</span>
                            <button
                              className="copy-json-btn"
                              onClick={() => copyCellJsonToClipboard(record.attributes, 'Attributes', `${record.id}-attributes`)}
                            >
                              {copiedCell === `${record.id}-attributes` ? 'Copied ✔' : 'Copy'}
                            </button>
                          </div>
                          {renderPrettyJson(record.attributes)}
                        </div>
                        <div className="record-detail-section">
                          <div className="record-detail-header">
                            <span>Metadata</span>
                            <button
                              className="copy-json-btn"
                              onClick={() => copyCellJsonToClipboard(record.metadata, 'Metadata', `${record.id}-metadata`)}
                            >
                              {copiedCell === `${record.id}-metadata` ? 'Copied ✔' : 'Copy'}
                            </button>
                          </div>
                          {renderPrettyJson(record.metadata)}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button
          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0 || pageSize === 'All'}
        >
          ‹ Prev
        </button>
        <span className="pagination-info">
          {pageSize === 'All'
            ? `${sortedData.length} rows`
            : `${currentPage * effectivePageSize + 1}–${Math.min((currentPage + 1) * effectivePageSize, sortedData.length)} of ${sortedData.length}`}
        </span>
        <button
          onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
          disabled={currentPage >= totalPages - 1 || pageSize === 'All'}
        >
          Next ›
        </button>
        <div className="page-size-controls">
          {PAGE_SIZE_OPTIONS.map(opt => (
            <button
              key={opt}
              className={`page-size-btn${pageSize === opt ? ' active' : ''}`}
              onClick={() => { setPageSize(opt); setCurrentPage(0); }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RowLevelTable;