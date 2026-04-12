import React, { useState, useMemo, useEffect, useCallback } from 'react';
import RowLevelTable from './RowLevelTable';
import RetagPanel from './RetagPanel';

function ConfusionMatrixPanel({ data, subtypeMatrixData, selectedCell, selectedTypePair, onCellClick, onSubtypeCellClick, loading, recordsData, allRecordsData, onExportAll, benchmarkId, onTranslated }) {
  const [viewMode, setViewMode] = useState('matrix'); // 'matrix' | 'errors' | 'retag'
  const [retagList, setRetagList] = useState([]); // [{ record, retag_subtype: '' }]
  const [expandedGroup, setExpandedGroup] = useState(null);         // trueSubtype (within-type section)
  const [expandedPair, setExpandedPair] = useState(null);           // predSubtype within expandedGroup
  const [expandedCrossGroupKey, setExpandedCrossGroupKey] = useState(null); // "trueType|||predType"
  const [expandedCrossPairKey, setExpandedCrossPairKey] = useState(null);   // "trueSubtype|||predSubtype"
  const [shameFilter, setShameFilter] = useState(null);
  const [severityFilter, setSeverityFilter] = useState(null); // null | 'both' | 'subtype'
  // ── Error Explorer: compute error pairs from all records ──────────────────
  const errorPairs = useMemo(() => {
    if (!allRecordsData?.data) return [];

    const buckets = {};
    allRecordsData.data.forEach(r => {
      if (r.pred_subtype !== r.true_subtype) {
        const key = `${r.true_subtype}|||${r.pred_subtype}`;
        if (!buckets[key]) buckets[key] = { trueSubtype: r.true_subtype, predSubtype: r.pred_subtype, trueType: r.true_type, predType: r.pred_type, records: [] };
        buckets[key].records.push(r);
      }
    });

    const totalErrors = Object.values(buckets).reduce((s, p) => s + p.records.length, 0);

    return Object.values(buckets)
      .map(p => {
        const typeMismatchCount = p.records.filter(r => r.true_type !== r.pred_type).length;
        const typeMismatch = typeMismatchCount > p.records.length / 2;
        const count = p.records.length;
        const pctErrors = totalErrors > 0 ? count / totalErrors : 0;
        return { ...p, count, pctErrors, typeMismatch };
      })
      .sort((a, b) => {
        if (a.typeMismatch !== b.typeMismatch) return a.typeMismatch ? -1 : 1;
        return b.count - a.count;
      });
  }, [allRecordsData]);

  const totalErrors = errorPairs.reduce((s, p) => s + p.count, 0);
  const typeAndSubtypeErrors = errorPairs.filter(p => p.typeMismatch).reduce((s, p) => s + p.count, 0);
  const maxCount = Math.max(1, ...errorPairs.map(p => p.count));

  // ── Retag state helpers ───────────────────────────────────────────────────
  const retagIds = useMemo(() => new Set(retagList.map(r => r.record.request_id)), [retagList]);

  const allSubtypes = useMemo(() => {
    if (!allRecordsData?.data) return [];
    const s = new Set();
    allRecordsData.data.forEach(r => {
      if (r.true_subtype) s.add(r.true_subtype);
      if (r.pred_subtype) s.add(r.pred_subtype);
    });
    return [...s].sort();
  }, [allRecordsData]);

  // ── Persist retag to server ───────────────────────────────────────────────
  const saveRetag = useCallback(async (list) => {
    if (!benchmarkId) return;
    try {
      await fetch('/api/retag', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          benchmark_id: benchmarkId,
          entries: list.map(({ record, retag_subtype }) => ({
            request_id: record.request_id,
            retag_subtype: retag_subtype || '',
            record,
          })),
        }),
      });
    } catch (err) {
      console.error('Failed to save retag data', err);
    }
  }, [benchmarkId]);

  // Load saved retag entries whenever the benchmark changes
  useEffect(() => {
    if (!benchmarkId) { setRetagList([]); return; }
    fetch(`/api/retag?benchmark_id=${benchmarkId}`)
      .then(r => r.json())
      .then(entries => {
        if (!Array.isArray(entries)) return;
        setRetagList(
          entries
            .filter(e => e.record)
            .map(e => ({ record: e.record, retag_subtype: e.retag_subtype || '' }))
        );
      })
      .catch(err => console.error('Failed to load retag data', err));
  }, [benchmarkId]);

  const handleAddToRetag = (record) => {
    setRetagList(prev => {
      if (prev.some(r => r.record.request_id === record.request_id)) return prev;
      const next = [...prev, { record, retag_subtype: '' }];
      saveRetag(next);
      return next;
    });
  };

  const handleSetRetagSubtype = (request_id, subtype) => {
    setRetagList(prev => {
      const next = prev.map(r =>
        r.record.request_id === request_id ? { ...r, retag_subtype: subtype } : r
      );
      saveRetag(next);
      return next;
    });
  };

  const handleRemoveFromRetag = (request_id) => {
    setRetagList(prev => {
      const next = prev.filter(r => r.record.request_id !== request_id);
      saveRetag(next);
      return next;
    });
  };

  // ── Shame list (matrix view) ──────────────────────────────────────────────
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

  // ── Error Explorer: cross-type groups (TypeA→TypeB) ─────────────────────
  const crossTypeGroups = useMemo(() => {
    const groups = {};
    errorPairs.filter(p => p.typeMismatch).forEach(pair => {
      const key = `${pair.trueType}|||${pair.predType}`;
      if (!groups[key]) groups[key] = { key, trueType: pair.trueType, predType: pair.predType, pairs: [], totalCount: 0 };
      groups[key].pairs.push(pair);
      groups[key].totalCount += pair.count;
    });
    return Object.values(groups).sort((a, b) => b.totalCount - a.totalCount);
  }, [errorPairs]);

  // ── Error Explorer: within-type groups (same type, wrong subtype) ─────────
  const withinTypeGroups = useMemo(() => {
    const groups = {};
    errorPairs.filter(p => !p.typeMismatch).forEach(pair => {
      if (!groups[pair.trueSubtype]) {
        groups[pair.trueSubtype] = { trueSubtype: pair.trueSubtype, trueType: pair.trueType, pairs: [], totalCount: 0 };
      }
      groups[pair.trueSubtype].pairs.push(pair);
      groups[pair.trueSubtype].totalCount += pair.count;
    });
    return Object.values(groups).sort((a, b) => b.totalCount - a.totalCount);
  }, [errorPairs]);

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

  const sortedTypeLabels = sortByF1(data.type_matrix.rows, data.type_matrix.data);

  const sortedSubtypeRowLabels = subtypeMatrix
    ? [...subtypeMatrix.rows].sort((a, b) => {
        const fa = computeF1(subtypeMatrix.data, a, subtypeMatrix.rows, subtypeMatrix.cols)?.f1 ?? -1;
        const fb = computeF1(subtypeMatrix.data, b, subtypeMatrix.rows, subtypeMatrix.cols)?.f1 ?? -1;
        return fb - fa;
      })
    : [];
  const sortedSubtypeColLabels = subtypeMatrix
    ? [
        ...sortedSubtypeRowLabels.filter(l => subtypeMatrix.cols.includes(l)),
        ...[...subtypeMatrix.cols]
          .filter(l => !subtypeMatrix.rows.includes(l))
          .sort((a, b) => {
            const fa = computeF1(subtypeMatrix.data, a, subtypeMatrix.rows, subtypeMatrix.cols)?.f1 ?? -1;
            const fb = computeF1(subtypeMatrix.data, b, subtypeMatrix.rows, subtypeMatrix.cols)?.f1 ?? -1;
            return fb - fa;
          }),
      ]
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


  // ── Error Explorer renderer ───────────────────────────────────────────────
  const renderErrorExplorer = () => {
    if (errorPairs.length === 0) {
      return <div className="error-explorer-empty">No errors found — this run is perfect!</div>;
    }

    const showCrossType = severityFilter !== 'subtype';
    const showWithinType = severityFilter !== 'both';

    return (
      <div className="error-explorer">
        <div className="error-explorer-summary-bar">
          <span className="error-explorer-stat">
            <strong>{totalErrors}</strong> total errors
          </span>
          <span className="error-explorer-divider">·</span>
          <button
            className={`error-filter-chip severity-both-chip${severityFilter === 'both' ? ' active' : ''}`}
            onClick={() => setSeverityFilter(severityFilter === 'both' ? null : 'both')}
          >
            <strong>{typeAndSubtypeErrors}</strong> cross-type
          </button>
          <span className="error-explorer-divider">·</span>
          <button
            className={`error-filter-chip severity-subtype-chip${severityFilter === 'subtype' ? ' active' : ''}`}
            onClick={() => setSeverityFilter(severityFilter === 'subtype' ? null : 'subtype')}
          >
            <strong>{totalErrors - typeAndSubtypeErrors}</strong> within-type
          </button>
        </div>

        <div className="error-groups-list">

          {/* ── Cross-type errors (type AND subtype wrong) ── */}
          {showCrossType && crossTypeGroups.length > 0 && (
            <div className="error-section">
              <div className="error-section-header error-section-cross">
                <span className="error-section-icon">&#9888;</span>
                Cross-type errors
                <span className="error-section-badge error-section-badge-cross">{typeAndSubtypeErrors}</span>
                <span className="error-section-hint">type and subtype both wrong</span>
              </div>
              {crossTypeGroups.map(group => {
                const isOpen = expandedCrossGroupKey === group.key;
                const activePair = isOpen
                  ? group.pairs.find(p => `${p.trueSubtype}|||${p.predSubtype}` === expandedCrossPairKey)
                  : null;
                const activeRecords = isOpen
                  ? activePair ? activePair.records : group.pairs.flatMap(p => p.records)
                  : null;
                const crossRecordsData = activeRecords
                  ? { data: activeRecords, pagination: { total: activeRecords.length, page: 0, limit: activeRecords.length, pages: 1 } }
                  : null;

                return (
                  <div key={group.key} className={`error-group-row error-group-row-cross${isOpen ? ' error-group-open' : ''}`}>
                    <div className="error-group-label">
                      <span
                        className={`error-type-pair${isOpen ? ' active' : ''}`}
                        onClick={() => {
                          if (isOpen) { setExpandedCrossGroupKey(null); setExpandedCrossPairKey(null); }
                          else { setExpandedCrossGroupKey(group.key); setExpandedGroup(null); setExpandedPair(null); setExpandedCrossPairKey(null); }
                        }}
                        title={isOpen ? 'Click to collapse' : 'Click to show records'}
                      >
                        <span className="error-type-label error-type-true">{group.trueType}</span>
                        <span className="error-type-arrow">→</span>
                        <span className="error-type-label error-type-pred">{group.predType}</span>
                      </span>
                      <span className="error-group-total error-group-total-cross">{group.totalCount}</span>
                    </div>
                    {isOpen && (
                      <div className="error-group-preds">
                        {group.pairs.map((pair) => {
                          const pairKey = `${pair.trueSubtype}|||${pair.predSubtype}`;
                          const isActive = expandedCrossPairKey === pairKey;
                          return (
                            <button
                              key={pairKey}
                              className={`error-pred-badge pred-badge-both${isActive ? ' active' : ''}`}
                              onClick={() => {
                                if (expandedCrossPairKey === pairKey) {
                                  setExpandedCrossPairKey(null);
                                } else {
                                  setExpandedCrossPairKey(pairKey);
                                }
                              }}
                              title={`${pair.trueSubtype} predicted as ${pair.predSubtype}`}
                            >
                              <span className="badge-subtype-true">{pair.trueSubtype}</span>
                              <span className="badge-arrow">→</span>
                              <span className="badge-subtype-pred">{pair.predSubtype}</span>
                              <span className="pred-badge-count">{pair.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {crossRecordsData && (
                      <div className="error-pair-records error-pair-records-cross">
                        <RowLevelTable
                          key={`cross:${group.key}|||${expandedCrossPairKey || '*'}`}
                          data={crossRecordsData}
                          showRun2Columns={false}
                          selectedCell={activePair ? { trueSubtype: activePair.trueSubtype, predSubtype: activePair.predSubtype } : null}
                          onAddToRetag={handleAddToRetag}
                          retagIds={retagIds}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Within-type errors (type correct, subtype wrong) ── */}
          {showWithinType && withinTypeGroups.length > 0 && (
            <div className="error-section">
              <div className="error-section-header error-section-within">
                Same-type, wrong subtype
                <span className="error-section-badge error-section-badge-within">{totalErrors - typeAndSubtypeErrors}</span>
                <span className="error-section-hint">type correct, subtype wrong</span>
              </div>
              {withinTypeGroups.map(group => {
                const isGroupOpen = expandedGroup === group.trueSubtype;
                const activeRecords = isGroupOpen
                  ? expandedPair
                    ? group.pairs.find(p => p.predSubtype === expandedPair)?.records ?? []
                    : group.pairs.flatMap(p => p.records)
                  : null;
                const withinRecordsData = activeRecords
                  ? { data: activeRecords, pagination: { total: activeRecords.length, page: 0, limit: activeRecords.length, pages: 1 } }
                  : null;

                return (
                  <div key={group.trueSubtype} className={`error-group-row${isGroupOpen ? ' error-group-open' : ''}`}>
                    <div className="error-group-label">
                      <span className="error-group-type-hint">{group.trueType}</span>
                      <span
                        className={`error-group-true${isGroupOpen ? ' active' : ''}`}
                        onClick={() => {
                          if (isGroupOpen) { setExpandedGroup(null); setExpandedPair(null); }
                          else { setExpandedGroup(group.trueSubtype); setExpandedCrossGroupKey(null); setExpandedCrossPairKey(null); setExpandedPair(null); }
                        }}
                        title={isGroupOpen ? 'Click to collapse' : 'Click to show all misclassified records'}
                      >
                        {group.trueSubtype}
                      </span>
                      <span className="error-group-total">{group.totalCount}</span>
                    </div>
                    {isGroupOpen && (
                      <div className="error-group-preds">
                        {group.pairs.map((pair) => {
                          const isActive = expandedPair === pair.predSubtype;
                          return (
                            <button
                              key={pair.predSubtype}
                              className={`error-pred-badge pred-badge-subtype${isActive ? ' active' : ''}`}
                              onClick={() => {
                                if (expandedPair === pair.predSubtype) {
                                  setExpandedPair(null);
                                } else {
                                  setExpandedPair(pair.predSubtype);
                                }
                              }}
                            >
                              {pair.predSubtype}
                              <span className="pred-badge-count">{pair.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {withinRecordsData && (
                      <div className="error-pair-records">
                        <RowLevelTable
                          key={`within:${group.trueSubtype}|||${expandedPair || '*'}`}
                          data={withinRecordsData}
                          showRun2Columns={false}
                          selectedCell={expandedPair ? { trueSubtype: group.trueSubtype, predSubtype: expandedPair } : null}
                          onAddToRetag={handleAddToRetag}
                          retagIds={retagIds}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    );
  };

  return (
    <div className="matrix-view">

      {/* ── View mode toggle ── */}
      <div className="view-mode-bar">
        <div className="view-mode-toggle">
          <button
            className={`view-mode-btn${viewMode === 'matrix' ? ' active' : ''}`}
            onClick={() => setViewMode('matrix')}
          >
            Matrix View
          </button>
          <button
            className={`view-mode-btn${viewMode === 'errors' ? ' active' : ''}`}
            onClick={() => setViewMode('errors')}
          >
            Error Explorer
            {totalErrors > 0 && (
              <span className={`view-mode-pill${viewMode === 'errors' ? ' active' : ''}`}>
                {totalErrors}
              </span>
            )}
          </button>
          <button
            className={`view-mode-btn${viewMode === 'retag' ? ' active' : ''}`}
            onClick={() => setViewMode('retag')}
          >
            Retag
            {retagList.length > 0 && (
              <span className={`view-mode-pill${viewMode === 'retag' ? ' active' : ''}`}>
                {retagList.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {viewMode === 'retag' ? (
        <RetagPanel
          retagList={retagList}
          allSubtypes={allSubtypes}
          onSetSubtype={handleSetRetagSubtype}
          onRemove={handleRemoveFromRetag}
          onClear={() => { setRetagList([]); saveRetag([]); }}
        />
      ) : viewMode === 'errors' ? renderErrorExplorer() : (
        <>
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
                      {sortedSubtypeColLabels.map(col => (
                        <th key={col}>
                          <span className="matrix-th-label" data-tooltip={col}>
                            {col.length > 15 ? col.substring(0, 15) + '…' : col}
                          </span>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className="f1-row-header">F1</th>
                      {sortedSubtypeColLabels.map(col => {
                        const f1Result = computeF1(subtypeMatrix.data, col, sortedSubtypeColLabels, sortedSubtypeColLabels);
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
                    {sortedSubtypeRowLabels.map(row => {
                      const rowTotal = getRowTotal(subtypeMatrix.data, row, sortedSubtypeColLabels);
                      const lowSupport = rowTotal > 0 && rowTotal < LOW_SUPPORT;
                      return (
                      <tr key={row}>
                        <th title={lowSupport ? `Low support: only ${rowTotal} samples` : undefined}>
                          <span className="matrix-th-label" data-tooltip={row}>
                            {row.length > 15 ? row.substring(0, 15) + '…' : row}
                          </span>
                          {lowSupport && <span className="low-support-warn" title={`Low support: only ${rowTotal} samples`}>⚠</span>}
                        </th>
                        {sortedSubtypeColLabels.map(col => {
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
                onAddToRetag={handleAddToRetag}
                retagIds={retagIds}
                onExport={onExportAll ? async () => {
                  const result = await onExportAll();
                  if (!shameFilter) return result;
                  const rows = (result.data || []).filter(r =>
                    r.true_subtype === shameFilter && r.pred_subtype !== r.true_subtype
                  );
                  return { ...result, data: rows };
                } : undefined}
                onTranslated={onTranslated}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ConfusionMatrixPanel;
