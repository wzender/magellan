import React, { useState, useEffect } from 'react';

function parseRunDate(runName) {
  const m = runName && runName.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
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

function LeaderboardWidget({ data, onRunSelect, onRunToggle, selectedRuns = [] }) {
  const [columns, setColumns] = useState([
    { key: 'select', label: 'Compare', width: 70 },
    { key: 'rank', label: 'Rank', width: 70 },
    { key: 'run_name', label: 'Run', width: 220 },
    { key: 'model_version', label: 'Model Version', width: 180 },
    { key: 'run_date', label: 'Date', width: 160 },
    { key: 'subtype_accuracy', label: 'Detail Accuracy', width: 140 },
    { key: 'subtype_f1_weighted', label: 'Detail Score', width: 160 },
    { key: 'type_f1_weighted', label: 'Category Score', width: 150 },
    { key: 'benchmark_length', label: 'Benchmark Size', width: 120 },
  ]);
  const [dragColumnIndex, setDragColumnIndex] = useState(null);
  const [resizingColumnIndex, setResizingColumnIndex] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' });

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
      const aValue = sortConfig.key === 'rank'
        ? rowData.indexOf(a) + 1
        : a[sortConfig.key] ?? '';
      const bValue = sortConfig.key === 'rank'
        ? rowData.indexOf(b) + 1
        : b[sortConfig.key] ?? '';

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
      <h2>Leaderboard</h2>
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
          {sortedData.map((row, idx) => (
            <tr
              key={row.run_id}
              onClick={() => row.table_exists !== false && onRunSelect && onRunSelect(row.run_id)}
              className={[
                selectedRuns.includes(row.run_id) ? 'selected' : '',
                row.table_exists === false ? 'table-missing' : '',
              ].filter(Boolean).join(' ')}
              style={{ cursor: row.table_exists === false ? 'not-allowed' : onRunSelect ? 'pointer' : 'default' }}
              title={row.table_exists === false ? `Table "${row.run_name}" not found in the database` : undefined}
            >
              {columns.map(col => {
                switch (col.key) {
                  case 'select': {
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
                  case 'rank':
                    return <td key={`${row.run_id}-${col.key}`}>{idx + 1}</td>;
                  case 'run_name':
                    return <td key={`${row.run_id}-${col.key}`}>{row.run_name}</td>;
                  case 'model_version':
                    return <td key={`${row.run_id}-${col.key}`}>{row.model_version || '-'}</td>;
                  case 'run_date': {
                    const d = parseRunDate(row.run_name);
                    if (!d) return <td key={`${row.run_id}-${col.key}`} className="run-date-cell">—</td>;
                    const formatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
                    const relative = timeAgo(d);
                    return (
                      <td key={`${row.run_id}-${col.key}`} className="run-date-cell" title={d.toISOString()}>
                        <span className="run-date-abs">{formatted}</span>
                        <span className="run-date-rel">{relative}</span>
                      </td>
                    );
                  }
                  case 'subtype_accuracy':
                    return <td key={`${row.run_id}-${col.key}`} className="metric">{(parseFloat(row.subtype_accuracy) * 100).toFixed(1)}%</td>;
                  case 'subtype_f1_weighted':
                    return <td key={`${row.run_id}-${col.key}`} className="metric">{(parseFloat(row.subtype_f1_weighted) * 100).toFixed(1)}%</td>;
                  case 'type_f1_weighted':
                    return <td key={`${row.run_id}-${col.key}`} className="metric">{(parseFloat(row.type_f1_weighted) * 100).toFixed(1)}%</td>;
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
      <div className="leaderboard-hint">
        Click a row to view its <strong>Accuracy Breakdown</strong>. Use the <strong>Compare</strong> checkboxes to select 2 runs and see <strong>What Changed</strong> between them.
      </div>
    </div>
  );
}

export default LeaderboardWidget;
