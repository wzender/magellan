import React, { useState, useEffect, useMemo } from 'react';
import RowLevelTable from './RowLevelTable';

function TransitionMatrixPanel({ data, selectedCell, onCellClick, loading, recordsData, selectedRunNames = [], onExportAll }) {
  const [indicatorFilter, setIndicatorFilter] = useState(null);
  const [persistentFilter, setPersistentFilter] = useState(null);

  useEffect(() => {
    setIndicatorFilter(null);
    setPersistentFilter(null);
  }, [data]);

  const displayRecords = useMemo(() => {
    if (!recordsData?.data) return recordsData;
    let rows = recordsData.data;
    if (indicatorFilter) {
      rows = rows.filter(row => {
        const r1Correct = row.pred_subtype === row.true_subtype;
        const r2Correct = row.run2_pred_subtype === row.true_subtype;
        if (indicatorFilter === 'run1-correct') return r1Correct && !r2Correct;
        if (indicatorFilter === 'run2-correct') return r2Correct && !r1Correct;
        if (indicatorFilter === 'both-wrong') return !r1Correct && !r2Correct;
        return true;
      });
    }
    if (persistentFilter) {
      rows = rows.filter(row =>
        row.true_subtype === persistentFilter &&
        row.pred_subtype !== row.true_subtype &&
        row.run2_pred_subtype !== row.true_subtype
      );
    }
    return { ...recordsData, data: rows, pagination: { ...recordsData.pagination, total: rows.length } };
  }, [recordsData, indicatorFilter, persistentFilter]);

  // #9: persistent errors — true subtypes most frequently wrong in both models
  const persistentErrors = useMemo(() => {
    if (!recordsData?.data) return [];
    const counts = {};
    recordsData.data.forEach(r => {
      if (r.pred_subtype !== r.true_subtype && r.run2_pred_subtype !== r.true_subtype) {
        counts[r.true_subtype] = (counts[r.true_subtype] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [recordsData]);

  if (loading) return <div className="loading">Loading transition matrix...</div>;
  if (!data || !data.data) return <div className="no-data">No data available</div>;

  const allRows = data.rows || [];
  const cols = data.cols || [];
  const matrixData = data.data || {};

  const getCorrectnessCssClass = (cell) => {
    if (!cell?.total) return '';
    const { run2Correct = 0, run1Correct = 0, bothWrong = 0 } = cell;
    if (run2Correct > 0 && run1Correct === 0 && bothWrong === 0) return 'correctness-run2-only';
    if (run1Correct > 0 && run2Correct === 0 && bothWrong === 0) return 'correctness-run1-only';
    if (bothWrong > 0 && run1Correct === 0 && run2Correct === 0) return 'correctness-both-wrong';
    if (run2Correct > run1Correct) return 'correctness-run2-mostly';
    if (run1Correct > run2Correct) return 'correctness-run1-mostly';
    return '';
  };

  const getCellIndicatorType = (cell) => {
    if (!cell?.total) return null;
    const { run2Correct = 0, run1Correct = 0, bothWrong = 0 } = cell;
    if (run2Correct > 0 && run1Correct === 0 && bothWrong === 0) return 'run2-correct';
    if (run1Correct > 0 && run2Correct === 0 && bothWrong === 0) return 'run1-correct';
    if (bothWrong > 0 && run1Correct === 0 && run2Correct === 0) return 'both-wrong';
    return null;
  };

  const indicatorTotals = { run1Correct: 0, run2Correct: 0, bothWrong: 0, total: 0 };
  allRows.forEach(row => cols.forEach(col => {
    const cell = matrixData[row]?.[col];
    if (!cell?.total) return;
    indicatorTotals.run1Correct += cell.run1Correct || 0;
    indicatorTotals.run2Correct += cell.run2Correct || 0;
    indicatorTotals.bothWrong  += cell.bothWrong  || 0;
    indicatorTotals.total      += cell.total;
  }));

  const maxTotal = Math.max(1, ...allRows.flatMap(row => cols.map(col => matrixData[row]?.[col]?.total || 0)));

  const getTransitionCellStyle = (cell, row, col, isSelected) => {
    const total = cell?.total || 0;
    if (isSelected || total === 0 || getCorrectnessCssClass(cell)) return {};
    const alpha = Math.min(0.08 + (total / maxTotal) * 0.45, 0.55);
    return { backgroundColor: row === col ? `rgba(40,167,69,${alpha})` : `rgba(0,102,204,${alpha})` };
  };

  const rows = allRows.filter(row => {
    if (!matrixData[row]) return false;
    return cols.some(col => {
      const cell = matrixData[row][col];
      if (!(cell?.total > 0)) return false;
      return indicatorFilter ? getCellIndicatorType(cell) === indicatorFilter : true;
    });
  });

  const runNameLeft = selectedRunNames[0] || '—';
  const runNameRight = selectedRunNames[1] || '—';

  return (
    <div className="matrix-view">

      {/* ── Transition Matrix Panel ── */}
      <div className="matrix-panel">
        <div className="matrix-panel-header">
          <div className="matrix-panel-title-row">
            <span className="matrix-panel-title">Subtype Transition Matrix — {runNameLeft} → {runNameRight}</span>
            {indicatorTotals.total > 0 && (() => {
              const delta = indicatorTotals.run2Correct - indicatorTotals.run1Correct;
              const cls = delta > 0 ? 'net-positive' : delta < 0 ? 'net-negative' : 'net-neutral';
              const label = delta > 0 ? `▲ +${delta} net improvement` : delta < 0 ? `▼ ${delta} net regression` : '= no net change';
              const title = `${runNameRight} correct: ${indicatorTotals.run2Correct}, ${runNameLeft} correct: ${indicatorTotals.run1Correct}`;
              return <span className={`net-delta-badge ${cls}`} title={title}>{label}</span>;
            })()}
          </div>
          <div className="correctness-legend inline-legend">
            <span className={`legend-item ${indicatorFilter === null ? 'indicator-active' : ''}`} onClick={() => setIndicatorFilter(null)}>
              All ({indicatorTotals.total})
            </span>
            <span className={`legend-item ${indicatorFilter === 'run1-correct' ? 'indicator-active' : ''}`} onClick={() => setIndicatorFilter(indicatorFilter === 'run1-correct' ? null : 'run1-correct')}>
              <span className="correctness-badge badge-correct legend-badge" /><span className="correctness-badge badge-incorrect legend-badge" />{selectedRunNames[0] || 'Run A'} ({indicatorTotals.run1Correct})
            </span>
            <span className={`legend-item ${indicatorFilter === 'run2-correct' ? 'indicator-active' : ''}`} onClick={() => setIndicatorFilter(indicatorFilter === 'run2-correct' ? null : 'run2-correct')}>
              <span className="correctness-badge badge-incorrect legend-badge" /><span className="correctness-badge badge-correct legend-badge" />{selectedRunNames[1] || 'Run B'} ({indicatorTotals.run2Correct})
            </span>
            <span className={`legend-item ${indicatorFilter === 'both-wrong' ? 'indicator-active' : ''}`} onClick={() => setIndicatorFilter(indicatorFilter === 'both-wrong' ? null : 'both-wrong')}>
              <span className="correctness-badge badge-incorrect legend-badge" /><span className="correctness-badge badge-incorrect legend-badge" />Both wrong ({indicatorTotals.bothWrong})
            </span>
          </div>
        </div>
        <div className="matrix-panel-body">
          {rows.length === 0 ? (
            <div className="no-selection-message compact">
              No transitions found. Try reducing the minimum changed records threshold.
            </div>
          ) : (
            <table className="transition-matrix">
              <thead>
                <tr>
                  <th>{runNameLeft} \ {runNameRight}</th>
                  {cols.map(col => (
                    <th key={col}>
                      <span className="matrix-th-label" data-tooltip={col}>
                        {col.length > 8 ? col.substring(0, 8) + '…' : col}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isRowSelected = selectedCell?.run1 === row && !selectedCell?.run2;
                  return (
                  <tr key={row} className={isRowSelected ? 'row-selected' : ''}>
                    <th
                      className="matrix-row-header clickable"
                      onClick={() => onCellClick(row, null)}
                      title={`Show all records where ${runNameLeft} predicted: ${row}`}
                    >
                      <span className="matrix-th-label" data-tooltip={row}>
                        {row.length > 8 ? row.substring(0, 8) + '…' : row}
                      </span>
                    </th>
                    {cols.map(col => {
                      const cell = matrixData[row]?.[col];
                      const total = cell?.total || cell || 0;
                      const isSelected = selectedCell?.run1 === row && selectedCell?.run2 === col;
                      return (
                        <td
                          key={`${row}-${col}`}
                          className={`matrix-cell ${isSelected ? 'selected' : ''} ${total > 0 ? 'populated' : 'empty'} ${getCorrectnessCssClass(cell)} ${row === col ? 'diagonal-cell' : ''}`}
                          onClick={() => total > 0 && onCellClick(row, col)}
                          style={getTransitionCellStyle(cell, row, col, isSelected)}
                          title={cell ? `${runNameLeft}: ${cell.run1Correct || 0} correct, ${runNameRight}: ${cell.run2Correct || 0} correct, Both wrong: ${cell.bothWrong || 0}` : ''}
                        >
                          <div className="cell-content"><div className="cell-total">{total}</div></div>
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Records section (full-height, below drawer) ── */}
      {recordsData && (
        <div className="records-section">
          {persistentErrors.length > 0 && (
            <div className="persistent-errors-bar">
              <span className="persistent-errors-label">Persistent failures (both models):</span>
              {persistentErrors.map(([subtype, count]) => (
                <span
                  key={subtype}
                  className={`persistent-errors-badge ${persistentFilter === subtype ? 'persistent-errors-active' : ''}`}
                  title={persistentFilter === subtype ? 'Click to clear filter' : `Click to inspect ${count} records where both models failed on "${subtype}"`}
                  onClick={() => setPersistentFilter(persistentFilter === subtype ? null : subtype)}
                >
                  {subtype} ({count})
                </span>
              ))}
              {persistentFilter && (
                <span className="persistent-errors-clear" onClick={() => setPersistentFilter(null)}>✕ clear</span>
              )}
            </div>
          )}
          <div className="records-section-header">
            <span className="records-section-title">Record Details</span>
            {(selectedCell || indicatorFilter || persistentFilter) && (
              <span className="drawer-filter">
                {selectedCell ? `${selectedCell.run1}${selectedCell.run2 ? ` → ${selectedCell.run2}` : ''}` : ''}
                {indicatorFilter === 'run1-correct' && ` · ${selectedRunNames[0] || 'Run 1'} correct only`}
                {indicatorFilter === 'run2-correct' && ` · ${selectedRunNames[1] || 'Run 2'} correct only`}
                {indicatorFilter === 'both-wrong' && ' · both wrong'}
                {persistentFilter && ` · persistent: ${persistentFilter}`}
              </span>
            )}
          </div>
          <RowLevelTable
            key={`${selectedCell?.run1 || 'none'}-${selectedCell?.run2 || 'none'}-${indicatorFilter || 'all'}-${persistentFilter || ''}`}
            data={displayRecords}
            showRun2Columns={true}
            selectedCell={selectedCell}
            run1Name={selectedRunNames[0] || 'Run 1'}
            run2Name={selectedRunNames[1] || 'Run 2'}
            onExport={onExportAll ? async () => {
              let result = await onExportAll();
              let rows = result.data || [];
              if (indicatorFilter) {
                rows = rows.filter(row => {
                  const r1Correct = row.pred_subtype === row.true_subtype;
                  const r2Correct = row.run2_pred_subtype === row.true_subtype;
                  if (indicatorFilter === 'run1-correct') return r1Correct && !r2Correct;
                  if (indicatorFilter === 'run2-correct') return r2Correct && !r1Correct;
                  if (indicatorFilter === 'both-wrong') return !r1Correct && !r2Correct;
                  return true;
                });
              }
              if (persistentFilter) {
                rows = rows.filter(row =>
                  row.true_subtype === persistentFilter &&
                  row.pred_subtype !== row.true_subtype &&
                  row.run2_pred_subtype !== row.true_subtype
                );
              }
              return { ...result, data: rows };
            } : undefined}
          />
        </div>
      )}

    </div>
  );
}

export default TransitionMatrixPanel;
