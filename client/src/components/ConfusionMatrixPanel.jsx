import React, { useState, useEffect } from 'react';
import RowLevelTable from './RowLevelTable';

function ConfusionMatrixPanel({ data, subtypeMatrixData, selectedCell, selectedTypePair, onCellClick, onSubtypeCellClick, loading, recordsData }) {
  const [typeOpen, setTypeOpen] = useState(true);
  const [subtypeOpen, setSubtypeOpen] = useState(false);

  useEffect(() => {
    if (selectedTypePair) setSubtypeOpen(true);
  }, [selectedTypePair]);

  if (loading) return <div className="loading">Loading confusion matrix...</div>;
  if (!data) return <div className="no-data">No data available</div>;

  const handleTypeClick = (trueType, predType) => {
    const isSame = selectedTypePair?.true === trueType && selectedTypePair?.pred === predType;
    onCellClick(isSame ? null : trueType, isSame ? null : predType);
  };

  const buildSubtypeMatrix = () => {
    if (!subtypeMatrixData?.rows?.length) return null;
    const nonEmptyRows = subtypeMatrixData.rows.filter(row =>
      subtypeMatrixData.cols.some(col => (subtypeMatrixData.data[row]?.[col] ?? 0) > 0)
    );
    const nonEmptyCols = subtypeMatrixData.cols.filter(col =>
      subtypeMatrixData.rows.some(row => (subtypeMatrixData.data[row]?.[col] ?? 0) > 0)
    );
    return { rows: nonEmptyRows, cols: nonEmptyCols, data: subtypeMatrixData.data };
  };

  const subtypeMatrix = buildSubtypeMatrix();

  const typeMaxValue = Math.max(1, ...data.type_matrix.rows.flatMap(row =>
    data.type_matrix.cols.map(col => data.type_matrix.data[row]?.[col] ?? 0)
  ));
  const subtypeMaxValue = subtypeMatrix
    ? Math.max(1, ...subtypeMatrix.rows.flatMap(row =>
        subtypeMatrix.cols.map(col => subtypeMatrix.data[row]?.[col] ?? 0)))
    : 1;

  const getCellStyle = (value, row, col, isSelected, maxVal) => {
    if (isSelected || value === 0) return { cursor: value > 0 ? 'pointer' : 'default' };
    const alpha = Math.min(0.1 + (value / maxVal) * 0.55, 0.65);
    return { cursor: 'pointer', backgroundColor: row === col ? `rgba(40,167,69,${alpha})` : `rgba(0,102,204,${alpha})` };
  };

  return (
    <div className="matrix-view">

      {/* ── Matrix drawers ── */}
      <div className="panel-stack">

        {/* Type Confusion Matrix */}
        <div className="matrix-drawer">
          <div className="matrix-drawer-handle" onClick={() => setTypeOpen(o => !o)}>
            <span className="drawer-chevron">{typeOpen ? '▾' : '▸'}</span>
            <span>Type Confusion Matrix</span>
          </div>
          {typeOpen && (
            <div className="matrix-drawer-body">
              <table className="confusion-matrix">
                <thead>
                  <tr>
                    <th>True \ Pred</th>
                    {data.type_matrix.cols.map(col => (
                      <th key={col}>
                        <span className="matrix-th-label" data-tooltip={col}>
                          {col.length > 10 ? col.substring(0, 10) + '…' : col}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.type_matrix.rows.map(row => (
                    <tr key={row}>
                      <th>
                        <span className="matrix-th-label" data-tooltip={row}>
                          {row.length > 10 ? row.substring(0, 10) + '…' : row}
                        </span>
                      </th>
                      {data.type_matrix.cols.map(col => {
                        const value = data.type_matrix.data[row][col];
                        const isSelected = selectedTypePair?.true === row && selectedTypePair?.pred === col;
                        return (
                          <td
                            key={`${row}-${col}`}
                            className={`matrix-cell ${isSelected ? 'selected' : ''} ${value > 0 ? 'populated' : 'empty'} ${row === col ? 'diagonal-cell' : ''}`}
                            onClick={() => value > 0 && handleTypeClick(row, col)}
                            style={getCellStyle(value, row, col, isSelected, typeMaxValue)}
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
          )}
        </div>

        {/* Subtype Confusion Matrix */}
        <div className="matrix-drawer">
          <div className="matrix-drawer-handle" onClick={() => setSubtypeOpen(o => !o)}>
            <span className="drawer-chevron">{subtypeOpen ? '▾' : '▸'}</span>
            <span>Subtype Confusion Matrix</span>
            {selectedTypePair && (
              <span className="drawer-filter">
                {selectedTypePair.true} → {selectedTypePair.pred}
                <button className="clear-selection-btn inline" onClick={e => { e.stopPropagation(); onCellClick(null, null); }}>✕</button>
              </span>
            )}
          </div>
          {subtypeOpen && (
            <div className="matrix-drawer-body">
              {!selectedTypePair ? (
                <div className="no-selection-message compact">
                  Click a cell in the Type Confusion Matrix above to view subtypes.
                </div>
              ) : subtypeMatrix?.rows.length > 0 ? (
                <table className="confusion-matrix subtype-confusion-matrix">
                  <thead>
                    <tr>
                      <th>True \ Pred</th>
                      {subtypeMatrix.cols.map(col => (
                        <th key={col}>
                          <span className="matrix-th-label" data-tooltip={col}>
                            {col.length > 15 ? col.substring(0, 15) + '…' : col}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subtypeMatrix.rows.map(row => (
                      <tr key={row}>
                        <th>
                          <span className="matrix-th-label" data-tooltip={row}>
                            {row.length > 15 ? row.substring(0, 15) + '…' : row}
                          </span>
                        </th>
                        {subtypeMatrix.cols.map(col => {
                          const value = subtypeMatrix.data[row][col];
                          const isSelected = selectedCell?.trueSubtype === row && selectedCell?.predSubtype === col;
                          return (
                            <td
                              key={`${row}-${col}`}
                              className={`matrix-cell ${isSelected ? 'selected' : ''} ${value > 0 ? 'populated' : 'empty'} ${row === col ? 'diagonal-cell' : ''}`}
                              onClick={() => value > 0 && onSubtypeCellClick(row, col)}
                              style={getCellStyle(value, row, col, isSelected, subtypeMaxValue)}
                            >
                              {value}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="no-selection-message compact">No subtype data for this type pair.</div>
              )}
            </div>
          )}
        </div>

      </div>{/* end panel-stack */}

      {/* ── Records section (full-height, below drawers) ── */}
      {recordsData && (
        <div className="records-section">
          <div className="records-section-header">
            <span className="records-section-title">Record Details</span>
            {selectedCell && (
              <span className="drawer-filter">{selectedCell.trueSubtype} → {selectedCell.predSubtype}</span>
            )}
          </div>
          <RowLevelTable data={recordsData} showRun2Columns={false} selectedCell={selectedCell} />
        </div>
      )}

    </div>
  );
}

export default ConfusionMatrixPanel;
