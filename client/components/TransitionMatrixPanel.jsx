import React from 'react';

function TransitionMatrixPanel({ data, selectedCell, onCellClick, loading }) {
  if (loading) return <div className="loading">Loading transition matrix...</div>;
  if (!data || !data.data) return <div className="no-data">No data available</div>;

  // Build matrix structure
  const rows = data.rows || [];
  const cols = data.cols || [];
  const matrixData = data.data || {};

  return (
    <div className="transition-matrix-panel">
      <h2>Subtype Transition Matrix (Run 1 → Run 2)</h2>
      <div className="matrix-container">
        <div className="matrix-scroll">
          <table className="transition-matrix">
            <thead>
              <tr>
                <th>Run 1 \ Run 2</th>
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
                    const value = matrixData[row] ? matrixData[row][col] : 0;
                    const isSelected =
                      selectedCell && selectedCell.run1 === row && selectedCell.run2 === col;
                    return (
                      <td
                        key={`${row}-${col}`}
                        className={`matrix-cell ${isSelected ? 'selected' : ''} ${value > 0 ? 'populated' : 'empty'}`}
                        onClick={() => value > 0 && onCellClick(row, col)}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default TransitionMatrixPanel;
