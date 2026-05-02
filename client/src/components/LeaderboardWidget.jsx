import React, { useState, useEffect } from 'react';

function parseRunDate(runName) {
  const m = runName && runName.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function extractCountryName(runName) {
  if (!runName) return runName;
  // strip datetime prefix like "20261230-1445-"
  let s = runName.replace(/^\d{8}-\d{4}-/, '');
  // strip leading "N_" or "N-" numeric prefix
  s = s.replace(/^\d+[-_]/, '');
  // capitalise first letter
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeAgo(date) {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)          return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60)          return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)         return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)           return `${days} day${days !== 1 ? 's' : ''} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5)          return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12)        return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(days / 365.25);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

function LeaderboardWidget({ data, onRunSelect, onRunToggle, selectedRuns = [], isUnknowns = false }) {
  // Define columns based on benchmark type
  const getDefaultColumns = () => {
    if (isUnknowns) {
      return [
        { key: 'run_name', label: 'Run', width: 160 },
        { key: 'model_version', label: 'Model', width: 120 },
        { key: 'benchmark_length', label: 'Total', width: 80 },
        { key: 'unknowns_count', label: 'Unknowns', width: 80 },
        { key: 'missing_count', label: 'Missing', width: 80 },
        { key: 'real_unknown_count', label: 'Real Unknown', width: 100 },
        { key: 'real_missing_count', label: 'Real Missing', width: 100 },
        { key: 'false_unknown_count', label: 'False Unknown', width: 110 },
        { key: 'false_missing_count', label: 'False Missing', width: 110 },
        { key: 'reviewed_count', label: 'Reviewed', width: 80 },
      ];
    }
    return [
      { key: 'select', label: 'Compare', width: 70 },
      { key: 'run_name', label: 'Run', width: 220 },
      { key: 'model_version', label: 'Model Version', width: 180 },
      { key: 'subtype_weighted_f1', label: 'Subtype Weighted F1', width: 140 },
      { key: 'type_weighted_f1', label: 'Type Weighted F1', width: 140 },
      { key: 'benchmark_length', label: 'Benchmark Size', width: 120 },
    ];
  };

  const [columns, setColumns] = useState(getDefaultColumns());
  const [dragColumnIndex, setDragColumnIndex] = useState(null);
  const [resizingColumnIndex, setResizingColumnIndex] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'subtype_weighted_f1', direction: 'desc' });

  const rowData = Array.isArray(data)
    ? data
    : data && Array.isArray(data.data)
      ? data.data
      : [];

  useEffect(() => {
    if (resizingColumnIndex === null) return;

    const handleMouseMove = (event) => {
      const delta = event.clientX - resizeStartX;
      const currentWidth = columns[resizingColumnIndex].width;
      const newWidth = Math.max(60, currentWidth + delta);
      setColumns(prev => {
        const newColumns = [...prev];
        newColumns[resizingColumnIndex] = { ...newColumns[resizingColumnIndex], width: newWidth };
        return newColumns;
      });
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

  if (!rowData || rowData.length === 0) {
    return <div className="leaderboard-widget">No leaderboard data available</div>;
  }

  const getSortedData = () => {
    if (!sortConfig.key) return [...rowData];

    return [...rowData].sort((a, b) => {
      const aValue = a[sortConfig.key] ?? '';
      const bValue = b[sortConfig.key] ?? '';

      const aNum = Number(aValue);
      const bNum = Number(bValue);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      const aStr = String(aValue);
      const bStr = String(bValue);
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const sortedData = getSortedData();

  const moveColumn = (fromIndex, toIndex) => {
    setColumns(prev => {
      const newColumns = [...prev];
      if (fromIndex < 0 || fromIndex >= newColumns.length || toIndex < 0 || toIndex >= newColumns.length) {
        return newColumns;
      }
      const [moved] = newColumns.splice(fromIndex, 1);
      newColumns.splice(toIndex, 0, moved);
      return newColumns;
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
      const newColumns = [...prev];
      newColumns[index] = { ...newColumns[index], width: parseInt(width, 10) || 70 };
      return newColumns;
    });
  };

  const handleResizeStart = (index, event) => {
    setResizingColumnIndex(index);
    setResizeStartX(event.clientX);
    event.preventDefault();
  };

  return (
    <div className="leaderboard-widget">
      <div className="leaderboard-title-block">
        <h2>Leaderboard</h2>
        <span className="leaderboard-desc">Ranked model runs by weighted F1. Click a row to inspect, check two to compare.</span>
      </div>
      <div className="leaderboard-table-wrapper">
      {isUnknowns ? (
        <table className="leaderboard-table unknowns-leaderboard-table">
          <thead>
            <tr className="unknowns-leaderboard-group-row">
              <th rowSpan={2} style={{ width: 180 }}>Country</th>
              <th colSpan={6} className="unknowns-leaderboard-group-header unknowns-group-validation">Unknown Validation</th>
              <th colSpan={5} className="unknowns-leaderboard-group-header unknowns-group-missing">Missing Subtypes</th>
            </tr>
            <tr>
              <th style={{ width: 70 }}>Total</th>
              <th style={{ width: 90 }}>Reviewed</th>
              <th style={{ width: 90 }}>Retagged</th>
              <th style={{ width: 100 }}>Truly Unknown</th>
              <th style={{ width: 100 }}>Wrong Subtype</th>
              <th style={{ width: 90 }}>Mappable</th>
              <th style={{ width: 70 }}>Total</th>
              <th style={{ width: 90 }}>Unreviewed</th>
              <th style={{ width: 80 }}>Accepted</th>
              <th style={{ width: 70 }}>Mapped</th>
              <th style={{ width: 80 }}>Rejected</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map(row => {
              const date = parseRunDate(row.run_name);
              const country = extractCountryName(row.run_name);
              const total = row.benchmark_length || 0;
              const reviewed = row.reviewed_count || 0;
              const isSelected = selectedRuns[0] === row.run_id;
              return (
                <tr
                  key={row.run_id}
                  onClick={() => row.table_exists !== false && onRunSelect && onRunSelect(row.run_id)}
                  className={[
                    isSelected ? 'selected selected-run1' : '',
                    row.table_exists === false ? 'table-missing' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ cursor: row.table_exists === false ? 'not-allowed' : 'pointer' }}
                >
                  <td className="unknowns-country-cell">
                    <span className="unknowns-country-name">{country}</span>
                    {date && <span className="unknowns-run-date">{date.toISOString().slice(0, 10)}</span>}
                  </td>
                  <td className="metric">{total}</td>
                  <td className="metric">{reviewed}<span className="metric-of">/{total}</span></td>
                  <td className="metric">{row.retagged_count || 0}<span className="metric-of">/{total}</span></td>
                  <td className="metric">{row.truly_unknown_count || 0}</td>
                  <td className="metric">{row.wrong_subtype_count || 0}</td>
                  <td className="metric">{row.mappable_count || 0}</td>
                  <td className="metric">{row.missing_candidates_total ?? '—'}</td>
                  <td className={`metric${(row.missing_candidates_unreviewed || 0) > 0 ? ' metric-warning' : ''}`}>
                    {row.missing_candidates_unreviewed ?? '—'}
                  </td>
                  <td className="metric">{row.missing_candidates_accepted ?? '—'}</td>
                  <td className="metric">{row.missing_candidates_mapped ?? '—'}</td>
                  <td className="metric">{row.missing_candidates_rejected ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              {columns.map((col, index) => (
                <th
                  key={col.key}
                  style={{ width: col.width, position: 'relative' }}
                  draggable
                  onDragStart={event => handleDragStart(index, event)}
                  onDragOver={handleDragOver}
                  onDrop={event => handleDrop(index, event)}
                  onClick={() => {
                    setSortConfig(prev => {
                      if (prev.key === col.key) {
                        return { key: col.key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                      }
                      return { key: col.key, direction: 'asc' };
                    });
                  }}
                >
                  <div className="header-cell">
                    {col.label}
                    {sortConfig.key === col.key && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                  </div>
                  {index < columns.length - 1 && (
                    <div
                      className={`resize-handle ${resizingColumnIndex === index ? 'resizing' : ''}`}
                      onMouseDown={(e) => handleResizeStart(index, e)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row) => (
              <tr
                key={row.run_id}
                onClick={() => row.table_exists !== false && onRunSelect && onRunSelect(row.run_id)}
                className={[
                  selectedRuns[0] === row.run_id ? 'selected selected-run1' :
                  selectedRuns[1] === row.run_id ? 'selected selected-run2' : '',
                  row.table_exists === false ? 'table-missing' : '',
                ].filter(Boolean).join(' ')}
                style={{ cursor: row.table_exists === false ? 'not-allowed' : onRunSelect ? 'pointer' : 'default' }}
                title={row.table_exists === false ? `Table "${row.run_name}" not found in the database` : undefined}
              >
                {columns.map(col => {
                  switch (col.key) {
                    case 'select': {
                      if (!onRunToggle) return <td key={`${row.run_id}-${col.key}`} />;
                      const isChecked = selectedRuns.includes(row.run_id);
                      const isDisabled = (selectedRuns.length >= 2 && !isChecked) || row.table_exists === false;
                      return (
                        <td
                          key={`${row.run_id}-${col.key}`}
                          className={`select-cell ${isDisabled ? 'select-cell-disabled' : ''}`}
                          title={isDisabled ? 'Uncheck one of the selected runs first — comparison is limited to 2 runs' : undefined}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isDisabled) onRunToggle && onRunToggle(row.run_id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            readOnly
                            tabIndex={-1}
                          />
                        </td>
                      );
                    }
                    case 'run_name':
                      return <td key={`${row.run_id}-${col.key}`}>{row.run_name}</td>;
                    case 'model_version':
                      return <td key={`${row.run_id}-${col.key}`}>{row.model_version || '-'}</td>;
                    case 'subtype_weighted_f1':
                      return <td key={`${row.run_id}-${col.key}`} className="metric">{(parseFloat(row.subtype_weighted_f1) * 100).toFixed(1)}%</td>;
                    case 'type_weighted_f1':
                      return <td key={`${row.run_id}-${col.key}`} className="metric">{(parseFloat(row.type_weighted_f1 ?? 0) * 100).toFixed(1)}%</td>;
                    case 'benchmark_length':
                      return <td key={`${row.run_id}-${col.key}`} className="benchmark-size">{row.benchmark_length}</td>;
                    default:
                      return <td key={`${row.run_id}-${col.key}`}>-</td>;
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
      <div className="leaderboard-hint">
        {isUnknowns
          ? 'Click a row to review records and manage missing subtype decisions for that country.'
          : <>
              Click a row to view its <strong>Accuracy Breakdown</strong>. Use the <strong>Compare</strong> checkboxes to select 2 runs and see <strong>What Changed</strong> between them.
            </>
        }
      </div>
    </div>
  );
}

export default LeaderboardWidget;
