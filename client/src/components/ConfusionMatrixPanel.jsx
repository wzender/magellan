import React, { useState } from 'react';
import RowLevelTable from './RowLevelTable';

function ConfusionMatrixPanel({ data, subtypeMatrixData, selectedCell, selectedTypePair, onCellClick, onSubtypeCellClick, loading, recordsData }) {
  if (loading) return <div className="loading">Loading confusion matrix...</div>;
  if (!data) return <div className="no-data">No data available</div>;

  const handleTypeClick = (trueType, predType) => {
    const isCurrentlySelected =
      selectedTypePair &&
      selectedTypePair.true === trueType &&
      selectedTypePair.pred === predType;

    if (isCurrentlySelected) {
      onCellClick(null, null);
    } else {
      onCellClick(trueType, predType);
    }
  };

  // Build subtype matrix from API data
  // Filter out empty rows and columns for cleaner display
  const buildSubtypeMatrix = () => {
    if (!subtypeMatrixData || !subtypeMatrixData.rows) return null;

    const data = subtypeMatrixData;

    if (data.rows.length === 0) {
      return null;
    }

    // Filter out empty rows (rows with all zeros)
    const nonEmptyRows = data.rows.filter(row => {
      return data.cols.some(col => (data.data[row]?.[col] ?? 0) > 0);
    });

    // Filter out empty columns (columns with all zeros)
    const nonEmptyCols = data.cols.filter(col => {
      return data.rows.some(row => (data.data[row]?.[col] ?? 0) > 0);
    });

    return {
      rows: nonEmptyRows,
      cols: nonEmptyCols,
      data: data.data
    };
  };

  const subtypeMatrix = buildSubtypeMatrix();

  return (
    <div className="confusion-matrix-container">
      {/* Type Confusion Matrix */}
      <div className="confusion-matrix-panel">
        <h2>Type Confusion Matrix</h2>
        <div className="matrix-container">
          <table className="confusion-matrix">
            <thead>
              <tr>
                <th>True \ Pred</th>
                {data.type_matrix.cols.map(col => (
                  <th key={col} title={col}>
                    {col.substring(0, 10)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.type_matrix.rows.map(row => (
                <tr key={row}>
                  <th title={row}>{row.substring(0, 10)}</th>
                  {data.type_matrix.cols.map(col => {
                    const value = data.type_matrix.data[row][col];
                    const isSelected =
                      selectedTypePair && selectedTypePair.true === row && selectedTypePair.pred === col;
                    return (
                      <td
                        key={`${row}-${col}`}
                        className={`matrix-cell ${isSelected ? 'selected' : ''} ${value > 0 ? 'populated' : 'empty'}`}
                        onClick={() => value > 0 && handleTypeClick(row, col)}
                        style={{ cursor: value > 0 ? 'pointer' : 'default' }}
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

      {/* Subtype Confusion Matrix */}
      <div className="subtype-confusion-panel">
        <h2>Subtype Confusion Matrix</h2>
        {!selectedTypePair ? (
          <div className="no-selection-message">
            <p>No type cell was selected</p>
            <p className="hint">Click on a cell in the Type Confusion Matrix above to view subtypes</p>
          </div>
        ) : (
          <>
            <p className="selection-info">
              Showing subtypes for: <strong>{selectedTypePair.true}</strong> → <strong>{selectedTypePair.pred}</strong>
              <button
                className="clear-selection-btn"
                onClick={() => {
                  onCellClick(null, null);
                }}
              >
                ✕ Clear
              </button>
            </p>
            {subtypeMatrix && subtypeMatrix.rows.length > 0 ? (
              <div className="matrix-container">
                <table className="confusion-matrix subtype-confusion-matrix">
                  <thead>
                    <tr>
                      <th>True \ Pred</th>
                      {subtypeMatrix.cols.map(col => (
                        <th key={col} title={col}>
                          {col.substring(0, 15)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subtypeMatrix.rows.map(row => (
                      <tr key={row}>
                        <th title={row}>{row.substring(0, 15)}</th>
                        {subtypeMatrix.cols.map(col => {
                          const value = subtypeMatrix.data[row][col];
                          const isSelected =
                            selectedCell &&
                            selectedCell.trueSubtype === row &&
                            selectedCell.predSubtype === col;
                          return (
                            <td
                              key={`${row}-${col}`}
                              className={`matrix-cell ${isSelected ? 'selected' : ''} ${value > 0 ? 'populated' : 'empty'}`}
                              onClick={() => value > 0 && onSubtypeCellClick(row, col)}
                              style={{ cursor: value > 0 ? 'pointer' : 'default' }}
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
            ) : (
              <div className="no-selection-message">
                <p>No subtype data available for this type pair</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Record Details */}
      {recordsData ? (
        <div className="records-panel">
          <RowLevelTable data={recordsData} showRun2Columns={false} selectedCell={selectedCell} />
        </div>
      ) : (
        <div className="records-panel">
          <div className="no-selection-message">
            <p>No records to display. Click on a cell in the matrix above.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConfusionMatrixPanel;