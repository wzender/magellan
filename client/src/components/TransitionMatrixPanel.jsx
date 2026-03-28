import React, { useState } from 'react';
import RowLevelTable from './RowLevelTable';

function TransitionMatrixPanel({ data, selectedCell, onCellClick, loading, recordsData, selectedRunNames = [] }) {
  const [matrixOpen, setMatrixOpen] = useState(true);
  const [indicatorFilter, setIndicatorFilter] = useState(null);

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

  const indicatorTotals = { run1Correct: 0, run2Correct: 0, bothWrong: 0, mixed: 0, total: 0 };
  allRows.forEach(row => cols.forEach(col => {
    const cell = matrixData[row]?.[col];
    if (!cell?.total) return;
    const type = getCellIndicatorType(cell);
    if (type === 'run1-correct') indicatorTotals.run1Correct += cell.total;
    else if (type === 'run2-correct') indicatorTotals.run2Correct += cell.total;
    else if (type === 'both-wrong') indicatorTotals.bothWrong += cell.total;
    else indicatorTotals.mixed += cell.total;
    indicatorTotals.total += cell.total;
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

      {/* ── Matrix drawer ── */}
      <div className="panel-stack">
        <div className="matrix-drawer">
          <div className="matrix-drawer-handle" onClick={() => setMatrixOpen(o => !o)}>
            <span className="drawer-chevron">{matrixOpen ? '▾' : '▸'}</span>
            <span>Subtype Transition Matrix — {runNameLeft} → {runNameRight}</span>
            <div className="correctness-legend inline-legend" onClick={e => e.stopPropagation()}>
              <span className={`legend-item ${indicatorFilter === 'run1-correct' ? 'indicator-active' : ''}`} onClick={() => setIndicatorFilter(indicatorFilter === 'run1-correct' ? null : 'run1-correct')}>
                <span className="legend-box legend-run1">✓₁</span>{selectedRunNames[0] || 'Run A'} ({indicatorTotals.run1Correct})
              </span>
              <span className={`legend-item ${indicatorFilter === 'run2-correct' ? 'indicator-active' : ''}`} onClick={() => setIndicatorFilter(indicatorFilter === 'run2-correct' ? null : 'run2-correct')}>
                <span className="legend-box legend-run2">✓₂</span>{selectedRunNames[1] || 'Run B'} ({indicatorTotals.run2Correct})
              </span>
              <span className={`legend-item ${indicatorFilter === 'both-wrong' ? 'indicator-active' : ''}`} onClick={() => setIndicatorFilter(indicatorFilter === 'both-wrong' ? null : 'both-wrong')}>
                <span className="legend-box legend-both">✗</span>Both wrong ({indicatorTotals.bothWrong})
              </span>
              <span className="legend-item" onClick={() => setIndicatorFilter(null)}>
                <span className="legend-box legend-clear">●</span>All ({indicatorTotals.total})
              </span>
            </div>
          </div>
          {matrixOpen && (
            <div className="matrix-drawer-body">
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
                    {rows.map(row => (
                      <tr key={row}>
                        <th>
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
                              title={cell ? `Run1: ${cell.run1Correct || 0} correct, Run2: ${cell.run2Correct || 0} correct, Both wrong: ${cell.bothWrong || 0}` : ''}
                            >
                              <div className="cell-content"><div className="cell-total">{total}</div></div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Records section (full-height, below drawer) ── */}
      {recordsData && (
        <div className="records-section">
          <div className="records-section-header">
            <span className="records-section-title">Record Details</span>
            {selectedCell && (
              <span className="drawer-filter">{selectedCell.run1} → {selectedCell.run2}</span>
            )}
          </div>
          <RowLevelTable
            key={`${selectedCell?.run1 || 'none'}-${selectedCell?.run2 || 'none'}`}
            data={recordsData}
            showRun2Columns={true}
            selectedCell={selectedCell}
            run1Name={selectedRunNames[0] || 'Run 1'}
            run2Name={selectedRunNames[1] || 'Run 2'}
          />
        </div>
      )}

    </div>
  );
}

export default TransitionMatrixPanel;
