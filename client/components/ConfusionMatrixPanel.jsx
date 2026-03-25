import React, { useState } from 'react';

function ConfusionMatrixPanel({ data, selectedCell, onCellClick, onSubtypeCellClick, loading }) {
  const [displayMode, setDisplayMode] = useState('type'); // 'type' or 'subtype'
  const [selectedTypePair, setSelectedTypePair] = useState(null);

  if (loading) return <div className="loading">Loading confusion matrix...</div>;
  if (!data) return <div className="no-data">No data available</div>;

  const handleTypeClick = (trueType, predType) => {
    setSelectedTypePair({ true: trueType, pred: predType });
    setDisplayMode('subtype');
  };

  const handleBackToType = () => {
    setDisplayMode('type');
    setSelectedTypePair(null);
  };

  if (displayMode === 'type') {
    return (
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
                      selectedCell && selectedCell.true === row && selectedCell.pred === col;
                    return (
                      <td
                        key={`${row}-${col}`}
                        className={`matrix-cell ${isSelected ? 'selected' : ''} ${value > 0 ? 'populated' : 'empty'}`}
                        onClick={() => value > 0 && handleTypeClick(row, col)}
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
    );
  }

  // Subtype confusion matrix view
  if (selectedTypePair) {
    const subtypeData = data.subtype_matrix.data.filter(
      d =>
        (d.true_subtype &&
          d.pred_subtype &&
          data.type_matrix.data[selectedTypePair.true] &&
          data.type_matrix.data[selectedTypePair.true][selectedTypePair.pred]) ||
        false
    );

    return (
      <div className="confusion-matrix-panel">
        <button className="back-button" onClick={handleBackToType}>
          ← Back to Type Matrix
        </button>
        <h2>
          Subtype Confusion Matrix: {selectedTypePair.true} → {selectedTypePair.pred}
        </h2>
        <div className="table-container">
          <table className="subtype-matrix">
            <thead>
              <tr>
                <th>True Subtype</th>
                <th>Pred Subtype</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {subtypeData.slice(0, 50).map((row, idx) => (
                <tr
                  key={idx}
                  className={
                    selectedCell &&
                    selectedCell.trueSubtype === row.true_subtype &&
                    selectedCell.predSubtype === row.pred_subtype
                      ? 'selected'
                      : ''
                  }
                  onClick={() =>
                    onSubtypeCellClick(row.true_subtype, row.pred_subtype)
                  }
                >
                  <td>{row.true_subtype}</td>
                  <td>{row.pred_subtype}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="confusion-matrix-panel">
      <p>Click on a cell in the type matrix to view subtypes</p>
    </div>
  );
}

export default ConfusionMatrixPanel;
