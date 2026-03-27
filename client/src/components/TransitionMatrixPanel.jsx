import React, { useState } from 'react';
import RowLevelTable from './RowLevelTable';

function TransitionMatrixPanel({ data, selectedCell, onCellClick, loading, recordsData, selectedRunNames = [] }) {
  if (loading) return <div className="loading">Loading transition matrix...</div>;
  if (!data || !data.data) return <div className="no-data">No data available</div>;

  const [indicatorFilter, setIndicatorFilter] = useState(null); // 'run1-correct'|'run2-correct'|'both-wrong'|null

  // Build matrix structure
  const allRows = data.rows || [];
  const cols = data.cols || [];
  const matrixData = data.data || {};
  
  console.log('TransitionMatrixPanel data:', JSON.stringify({ 
    rowsLength: allRows.length, 
    colsLength: cols.length, 
    dataKeys: Object.keys(matrixData).length,
    sample: Object.keys(matrixData)[0] ? { key: Object.keys(matrixData)[0], value: matrixData[Object.keys(matrixData)[0]] } : null
  }, null, 2));

  const getCorrectnessCssClass = (cell) => {
    if (!cell || !cell.total) return '';
    
    const run2Correct = cell.run2Correct || 0;
    const run1Correct = cell.run1Correct || 0;
    const bothWrong = cell.bothWrong || 0;

    if (run2Correct > 0 && run1Correct === 0 && bothWrong === 0) {
      return 'correctness-run2-only';
    } else if (run1Correct > 0 && run2Correct === 0 && bothWrong === 0) {
      return 'correctness-run1-only';
    } else if (bothWrong > 0 && run1Correct === 0 && run2Correct === 0) {
      return 'correctness-both-wrong';
    } else if (run2Correct > run1Correct) {
      return 'correctness-run2-mostly';
    } else if (run1Correct > run2Correct) {
      return 'correctness-run1-mostly';
    }
    return '';
  };

  const getCellIndicatorType = (cell) => {
    if (!cell || !cell.total) return null;
    const run2Correct = cell.run2Correct || 0;
    const run1Correct = cell.run1Correct || 0;
    const bothWrong = cell.bothWrong || 0;

    if (run2Correct > 0 && run1Correct === 0 && bothWrong === 0) return 'run2-correct';
    if (run1Correct > 0 && run2Correct === 0 && bothWrong === 0) return 'run1-correct';
    if (bothWrong > 0 && run1Correct === 0 && run2Correct === 0) return 'both-wrong';
    return null;
  };

  const cellMatchesIndicatorFilter = (cell) => {
    if (!indicatorFilter) return true;
    return getCellIndicatorType(cell) === indicatorFilter;
  };

  const indicatorTotals = { run1Correct: 0, run2Correct: 0, bothWrong: 0, mixed: 0, total: 0 };
  allRows.forEach((row) => {
    cols.forEach((col) => {
      const cell = matrixData[row]?.[col];
      if (!cell || !cell.total) return;
      const total = cell.total || 0;
      const type = getCellIndicatorType(cell);
      if (type === 'run1-correct') indicatorTotals.run1Correct += total;
      else if (type === 'run2-correct') indicatorTotals.run2Correct += total;
      else if (type === 'both-wrong') indicatorTotals.bothWrong += total;
      else indicatorTotals.mixed += total;
      indicatorTotals.total += total;
    });
  });

  const renderCellContent = (row, col) => {
    const cell = matrixData[row]?.[col];
    if (!cell) return 0;

    const total = cell.total !== undefined ? cell.total : cell;
    const run1Correct = cell.run1Correct || 0;
    const run2Correct = cell.run2Correct || 0;
    const bothWrong = cell.bothWrong || 0;

    if (total === 0) return 0;

    return (
      <div className="cell-content">
        <div className="cell-total">{total}</div>
      </div>
    );
  };

  // Filter out rows that are all zeros/NaN (and optionally filter by indicator type)
  const rows = allRows.filter(row => {
    if (!matrixData[row]) return false;
    const rowValues = cols.map(col => {
      const cell = matrixData[row][col];
      const cellTotal = cell?.total || 0;
      if (cellTotal === 0) return false;
      return indicatorFilter ? cellMatchesIndicatorFilter(cell) : true;
    });
    return rowValues.some(value => value);
  });

  console.log('Filtered rows:', { allRowsLength: allRows.length, filteredRowsLength: rows.length });

  // Check if we have any data to display
  if (rows.length === 0) {
    return (
      <div className="transition-matrix-panel">
        <h2>Subtype Transition Matrix (Run 1 → Run 2)</h2>
        <div className="no-transitions">
          No transitions found with the current minimum count threshold.
          Try reducing the minimum changed records value.
        </div>
      </div>
    );
  }

  const runNameLeft = selectedRunNames[0] || '—';
  const runNameRight = selectedRunNames[1] || '—';

  return (
    <div className="transition-matrix-panel">
      <h2>
        Subtype Transition Matrix ({runNameLeft} → {runNameRight})
      </h2>
      
      <div className="correctness-legend">
        <span className={`legend-item ${indicatorFilter === 'run1-correct' ? 'indicator-active' : ''}`} onClick={() => setIndicatorFilter(indicatorFilter === 'run1-correct' ? null : 'run1-correct')}>
          <span className="legend-box legend-run1">✓₁</span> {selectedRunNames[0] || 'Run A'} correct ({indicatorTotals.run1Correct})
        </span>
        <span className={`legend-item ${indicatorFilter === 'run2-correct' ? 'indicator-active' : ''}`} onClick={() => setIndicatorFilter(indicatorFilter === 'run2-correct' ? null : 'run2-correct')}>
          <span className="legend-box legend-run2">✓₂</span> {selectedRunNames[1] || 'Run B'} correct ({indicatorTotals.run2Correct})
        </span>
        <span className={`legend-item ${indicatorFilter === 'both-wrong' ? 'indicator-active' : ''}`} onClick={() => setIndicatorFilter(indicatorFilter === 'both-wrong' ? null : 'both-wrong')}>
          <span className="legend-box legend-both">✗</span> Both wrong ({indicatorTotals.bothWrong})
        </span>
        <span className="legend-item" onClick={() => setIndicatorFilter(null)}>
          <span className="legend-box legend-clear">●</span> Show all ({indicatorTotals.total})
        </span>
      </div>

      <div className="matrix-container">
        <div className="matrix-scroll">
          <table className="transition-matrix">
            <thead>
              <tr>
                <th>{runNameLeft} \ {runNameRight}</th>
                {cols.map(col => (
                  <th key={col} title={col}>
                    {col.substring(0, 8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row}>
                  <th title={row}>{row.substring(0, 8)}</th>
                  {cols.map(col => {
                    const cell = matrixData[row]?.[col];
                    const total = cell?.total || cell || 0;
                    const isSelected =
                      selectedCell && selectedCell.run1 === row && selectedCell.run2 === col;
                    const correctnessClass = getCorrectnessCssClass(cell);

                    return (
                      <td
                        key={`${row}-${col}`}
                        className={`matrix-cell ${isSelected ? 'selected' : ''} ${total > 0 ? 'populated' : 'empty'} ${correctnessClass}`}
                        onClick={() => total > 0 && onCellClick(row, col)}
                        title={cell ? `Run1: ${cell.run1Correct || 0} correct, Run2: ${cell.run2Correct || 0} correct, Both wrong: ${cell.bothWrong || 0}` : ''}
                      >
                        {renderCellContent(row, col)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Details */}
      {recordsData && (
        <div className="records-panel">
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