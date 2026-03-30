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

  const computeF1 = (matrixData, label, rows, cols) => {
    const tp = matrixData[label]?.[label] ?? 0;
    const fn = cols.reduce((s, c) => s + (c !== label ? (matrixData[label]?.[c] ?? 0) : 0), 0);
    const fp = rows.reduce((s, r) => s + (r !== label ? (matrixData[r]?.[label] ?? 0) : 0), 0);
    if (tp + fp + fn === 0) return null;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall);
    return { f1, precision, recall };
  };

  const sortByF1 = (labels, matrixData) =>
    [...labels].sort((a, b) => {
      const fa = computeF1(matrixData, a, labels, labels)?.f1 ?? -1;
      const fb = computeF1(matrixData, b, labels, labels)?.f1 ?? -1;
      return fb - fa;
    });

  // Both rows and cols use the same labels; sort once and apply to both axes
  // so the diagonal is preserved and classes are ordered best→worst by F1.
  const sortedTypeLabels = sortByF1(data.type_matrix.rows, data.type_matrix.data);
  const sortedSubtypeLabels = subtypeMatrix
    ? sortByF1(subtypeMatrix.rows, subtypeMatrix.data)
    : [];

  const getF1CellStyle = (result) => {
    if (!result) return { background: '#f1f5f9', color: '#94a3b8' };
    const { f1 } = result;
    if (f1 >= 0.8) return { background: `rgba(40,167,69,${0.12 + f1 * 0.30})`, color: '#14532d' };
    if (f1 >= 0.5) return { background: `rgba(245,158,11,${0.12 + (f1 - 0.5) * 0.40})`, color: '#78350f' };
    return { background: `rgba(239,68,68,${0.15 + (0.5 - f1) * 0.50})`, color: '#7f1d1d' };
  };

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
                {sortedTypeLabels.map(col => (
                  <th key={col}>
                    <span className="matrix-th-label" data-tooltip={col}>
                      {col.length > 10 ? col.substring(0, 10) + '…' : col}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                <th className="f1-row-header">F1</th>
                {sortedTypeLabels.map(col => {
                  const f1Result = computeF1(data.type_matrix.data, col, sortedTypeLabels, sortedTypeLabels);
                  return (
                    <td
                      key={col}
                      className="f1-cell"
                      style={getF1CellStyle(f1Result)}
                      title={f1Result ? `Precision: ${(f1Result.precision * 100).toFixed(1)}%  ·  Recall: ${(f1Result.recall * 100).toFixed(1)}%` : 'No data'}
                    >
                      {f1Result ? `${(f1Result.f1 * 100).toFixed(0)}%` : '—'}
                    </td>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedTypeLabels.map(row => {
                const rowTotal = getRowTotal(data.type_matrix.data, row, sortedTypeLabels);
                const lowSupport = rowTotal > 0 && rowTotal < LOW_SUPPORT;
                return (
                <tr key={row}>
                  <th title={lowSupport ? `Low support: only ${rowTotal} samples` : undefined}>
                    <span className="matrix-th-label" data-tooltip={row}>
                      {row.length > 10 ? row.substring(0, 10) + '…' : row}
                    </span>
                    {lowSupport && <span className="low-support-warn" title={`Low support: only ${rowTotal} samples`}>⚠</span>}
                  </th>
                  {sortedTypeLabels.map(col => {
                    const value = data.type_matrix.data[row]?.[col] ?? 0;
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
                  {sortedSubtypeLabels.map(col => (
                    <th key={col}>
                      <span className="matrix-th-label" data-tooltip={col}>
                        {col.length > 15 ? col.substring(0, 15) + '…' : col}
                      </span>
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="f1-row-header">F1</th>
                  {sortedSubtypeLabels.map(col => {
                    const f1Result = computeF1(subtypeMatrix.data, col, sortedSubtypeLabels, sortedSubtypeLabels);
                    return (
                      <td
                        key={col}
                        className="f1-cell"
                        style={getF1CellStyle(f1Result)}
                        title={f1Result ? `Precision: ${(f1Result.precision * 100).toFixed(1)}%  ·  Recall: ${(f1Result.recall * 100).toFixed(1)}%` : 'No data'}
                      >
                        {f1Result ? `${(f1Result.f1 * 100).toFixed(0)}%` : '—'}
                      </td>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedSubtypeLabels.map(row => {
                  const rowTotal = getRowTotal(subtypeMatrix.data, row, sortedSubtypeLabels);
                  const lowSupport = rowTotal > 0 && rowTotal < LOW_SUPPORT;
                  return (
                  <tr key={row}>
                    <th title={lowSupport ? `Low support: only ${rowTotal} samples` : undefined}>
                      <span className="matrix-th-label" data-tooltip={row}>
                        {row.length > 15 ? row.substring(0, 15) + '…' : row}
                      </span>
                      {lowSupport && <span className="low-support-warn" title={`Low support: only ${rowTotal} samples`}>⚠</span>}
                    </th>
                    {sortedSubtypeLabels.map(col => {
                      const value = subtypeMatrix.data[row]?.[col] ?? 0;
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
