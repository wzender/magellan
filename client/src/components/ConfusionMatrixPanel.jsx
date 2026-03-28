import React, { useState, useMemo } from 'react';
import RowLevelTable from './RowLevelTable';

function ConfusionMatrixPanel({ data, subtypeMatrixData, selectedCell, selectedTypePair, onCellClick, onSubtypeCellClick, loading, recordsData }) {
  const [shameFilter, setShameFilter] = useState(null);

  const shameList = useMemo(() => {
    if (!recordsData?.data) return [];
    const counts = {};
    recordsData.data.forEach(r => {
      if (r.pred_subtype !== r.true_subtype) {
        counts[r.true_subtype] = (counts[r.true_subtype] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [recordsData]);

  const displayRecords = useMemo(() => {
    if (!shameFilter || !recordsData?.data) return recordsData;
    const rows = recordsData.data.filter(r =>
      r.true_subtype === shameFilter && r.pred_subtype !== r.true_subtype
    );
    return { ...recordsData, data: rows, pagination: { ...recordsData.pagination, total: rows.length } };
  }, [recordsData, shameFilter]);

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

  const LOW_SUPPORT = 10;

  const getRowTotal = (matrixData, row, cols) =>
    cols.reduce((sum, col) => sum + (matrixData[row]?.[col] ?? 0), 0);

  const isAsymmetric = (matrixData, row, col) => {
    if (row === col) return false;
    const fwd = matrixData[row]?.[col] ?? 0;
    const rev = matrixData[col]?.[row] ?? 0;
    return fwd >= 3 && fwd > rev * 2;
  };

  return (
    <div className="matrix-view">

      {/* ── Type Confusion Matrix Panel ── */}
      <div className="matrix-panel">
        <div className="matrix-panel-header">
          <span className="matrix-panel-title">Type Confusion Matrix</span>
        </div>
        <div className="matrix-panel-body">
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
              {data.type_matrix.rows.map(row => {
                const rowTotal = getRowTotal(data.type_matrix.data, row, data.type_matrix.cols);
                const lowSupport = rowTotal > 0 && rowTotal < LOW_SUPPORT;
                return (
                <tr key={row}>
                  <th title={lowSupport ? `Low support: only ${rowTotal} samples` : undefined}>
                    <span className="matrix-th-label" data-tooltip={row}>
                      {row.length > 10 ? row.substring(0, 10) + '…' : row}
                    </span>
                    {lowSupport && <span className="low-support-warn" title={`Low support: only ${rowTotal} samples`}>⚠</span>}
                  </th>
                  {data.type_matrix.cols.map(col => {
                    const value = data.type_matrix.data[row][col];
                    const isSelected = selectedTypePair?.true === row && selectedTypePair?.pred === col;
                    const asymmetric = isAsymmetric(data.type_matrix.data, row, col);
                    return (
                      <td
                        key={`${row}-${col}`}
                        className={`matrix-cell ${isSelected ? 'selected' : ''} ${value > 0 ? 'populated' : 'empty'} ${row === col ? 'diagonal-cell' : ''}`}
                        onClick={() => value > 0 && handleTypeClick(row, col)}
                        style={getCellStyle(value, row, col, isSelected, typeMaxValue)}
                        title={asymmetric ? `Asymmetric: ${value} (${row}→${col}) vs ${data.type_matrix.data[col]?.[row] ?? 0} (${col}→${row})` : undefined}
                      >
                        {value}
                        {asymmetric && <span className="asymmetry-arrow">→</span>}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Subtype Confusion Matrix Panel ── */}
      <div className="matrix-panel">
        <div className="matrix-panel-header">
          <span className="matrix-panel-title">Subtype Confusion Matrix</span>
          {selectedTypePair && (
            <span className="drawer-filter">
              {selectedTypePair.true} → {selectedTypePair.pred}
              <button className="clear-selection-btn inline" onClick={e => { e.stopPropagation(); onCellClick(null, null); }}>✕</button>
            </span>
          )}
        </div>
        <div className="matrix-panel-body">
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
                {subtypeMatrix.rows.map(row => {
                  const rowTotal = getRowTotal(subtypeMatrix.data, row, subtypeMatrix.cols);
                  const lowSupport = rowTotal > 0 && rowTotal < LOW_SUPPORT;
                  return (
                  <tr key={row}>
                    <th title={lowSupport ? `Low support: only ${rowTotal} samples` : undefined}>
                      <span className="matrix-th-label" data-tooltip={row}>
                        {row.length > 15 ? row.substring(0, 15) + '…' : row}
                      </span>
                      {lowSupport && <span className="low-support-warn" title={`Low support: only ${rowTotal} samples`}>⚠</span>}
                    </th>
                    {subtypeMatrix.cols.map(col => {
                      const value = subtypeMatrix.data[row][col];
                      const isSelected = selectedCell?.trueSubtype === row && selectedCell?.predSubtype === col;
                      const asymmetric = isAsymmetric(subtypeMatrix.data, row, col);
                      return (
                        <td
                          key={`${row}-${col}`}
                          className={`matrix-cell ${isSelected ? 'selected' : ''} ${value > 0 ? 'populated' : 'empty'} ${row === col ? 'diagonal-cell' : ''}`}
                          onClick={() => value > 0 && onSubtypeCellClick(row, col)}
                          style={getCellStyle(value, row, col, isSelected, subtypeMaxValue)}
                          title={asymmetric ? `Asymmetric: ${value} (${row}→${col}) vs ${subtypeMatrix.data[col]?.[row] ?? 0} (${col}→${row})` : undefined}
                        >
                          {value}
                          {asymmetric && <span className="asymmetry-arrow">→</span>}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="no-selection-message compact">No subtype data for this type pair.</div>
          )}
        </div>
      </div>

      {/* ── Records section ── */}
      {recordsData && (
        <div className="records-section">
          {shameList.length > 0 && (
            <div className="persistent-errors-bar">
              <span className="persistent-errors-label">Most misclassified:</span>
              {shameList.map(([subtype, count]) => (
                <span
                  key={subtype}
                  className={`persistent-errors-badge ${shameFilter === subtype ? 'persistent-errors-active' : ''}`}
                  title={shameFilter === subtype ? 'Click to clear filter' : `Click to see ${count} misclassified "${subtype}" records`}
                  onClick={() => setShameFilter(shameFilter === subtype ? null : subtype)}
                >
                  {subtype} ({count})
                </span>
              ))}
              {shameFilter && (
                <span className="persistent-errors-clear" onClick={() => setShameFilter(null)}>✕ clear</span>
              )}
            </div>
          )}
          <div className="records-section-header">
            <span className="records-section-title">Record Details</span>
            {(selectedCell || shameFilter) && (
              <span className="drawer-filter">
                {selectedCell ? `${selectedCell.trueSubtype} → ${selectedCell.predSubtype}` : ''}
                {shameFilter && ` · misclassified: ${shameFilter}`}
              </span>
            )}
          </div>
          <RowLevelTable
            key={`${selectedCell?.trueSubtype || 'none'}-${shameFilter || ''}`}
            data={displayRecords}
            showRun2Columns={false}
            selectedCell={selectedCell}
          />
        </div>
      )}

    </div>
  );
}

export default ConfusionMatrixPanel;
