import React, { useState, useEffect } from 'react';

/* ── helpers ─────────────────────────────────────────────── */
function pct(n) { return (n * 100).toFixed(0) + '%'; }
function pctNum(n) { return (n * 100).toFixed(1); }

function severityClass(f1, crossTypeRate) {
  if (crossTypeRate > 0.3) return 'severity-critical';
  if (f1 >= 0.5)           return 'severity-good';
  if (f1 >= 0.2)           return 'severity-warn';
  return 'severity-bad';
}

function DeltaBadge({ delta }) {
  if (delta === null || delta === undefined) return null;
  const d = (delta * 100).toFixed(1);
  if (Math.abs(delta) < 0.005) return <span className="delta delta-flat">= no change</span>;
  if (delta > 0) return <span className="delta delta-up">▲ +{d}%</span>;
  return <span className="delta delta-down">▼ {d}%</span>;
}

/* ── SubtypeBadge ────────────────────────────────────────── */
function SubtypeBadge({ st, delta, isActive, isDimmed, onViewRecords }) {
  const correctPct  = (st.correct / st.total) * 100;
  const crossPct    = (st.cross_type / st.total) * 100;
  const samePct     = Math.max(0, 100 - correctPct - crossPct);

  return (
    <button
      className={`subtype-badge ${isActive ? 'subtype-badge-active' : ''} ${isDimmed ? 'subtype-badge-dimmed' : ''}`}
      onClick={() => onViewRecords(st.subtype)}
      title={`${st.subtype} · ${st.total} records · F1: ${pctNum(st.f1)}%`}
    >
      <div className="sbadge-top">
        <span className="sbadge-name">{st.subtype}</span>
        <span className="sbadge-acc">{pctNum(st.f1)}%</span>
        {delta !== undefined && <DeltaBadge delta={delta} />}
      </div>
      <div className="sbadge-count">{st.total.toLocaleString()} records</div>
      <div className="sbadge-bar">
        <div className="bar-correct"    style={{ width: `${correctPct}%` }} />
        <div className="bar-same-type"  style={{ width: `${samePct}%` }} />
        <div className="bar-cross-type" style={{ width: `${crossPct}%` }} />
      </div>
    </button>
  );
}

/* ── SubtypeConfusionMatrix ──────────────────────────────── */
function cellIntensity(count, rowTotal) {
  if (!count || rowTotal === 0) return 0;
  return count / rowTotal;
}

/* ── StaticSubtypeConfusionMatrix (client-side, for Unknowns) ── */
function StaticSubtypeConfusionMatrix({ typeData, onViewRecords }) {
  const [showPct, setShowPct] = useState(false);
  const subtypes = typeData.subtypes || [];

  if (subtypes.length === 0) return <div className="matrix-empty">No data</div>;

  // Build column set: true subtypes (diagonal) + all predicted subtypes from confused_to
  const colMap = {};
  subtypes.forEach(st => {
    colMap[st.subtype] = { subtype: st.subtype, pred_type: typeData.type, isCrossType: false };
  });
  subtypes.forEach(st => {
    (st.confused_to || []).forEach(c => {
      if (!colMap[c.pred_subtype]) {
        colMap[c.pred_subtype] = { subtype: c.pred_subtype, pred_type: c.pred_type, isCrossType: c.pred_type !== typeData.type };
      }
    });
  });

  // Sort: diagonal (true subtypes) first, then same-type, then cross-type
  const trueSubtypeSet = new Set(subtypes.map(s => s.subtype));
  const columns = Object.values(colMap).sort((a, b) => {
    const ai = trueSubtypeSet.has(a.subtype) ? 0 : a.isCrossType ? 2 : 1;
    const bi = trueSubtypeSet.has(b.subtype) ? 0 : b.isCrossType ? 2 : 1;
    if (ai !== bi) return ai - bi;
    return a.subtype.localeCompare(b.subtype);
  });

  const firstCrossIdx = columns.findIndex(c => c.isCrossType);

  const rows = subtypes.map(st => {
    const preds = {};
    if (st.correct > 0) preds[st.subtype] = st.correct;
    (st.confused_to || []).forEach(c => { preds[c.pred_subtype] = c.count; });
    return { true_subtype: st.subtype, total: st.total, preds };
  });

  return (
    <div className="subtype-confusion-wrap">
      <div className="subtype-confusion-toolbar">
        <button
          className={`scm-toggle ${showPct ? 'active' : ''}`}
          onClick={() => setShowPct(p => !p)}
        >
          {showPct ? '% of row' : '# count'}
        </button>
        {firstCrossIdx > -1 && (
          <span className="scm-legend">
            <span className="scm-legend-swatch scm-swatch-same" /> same-type
            <span className="scm-legend-swatch scm-swatch-cross" /> cross-type
          </span>
        )}
      </div>
      <div className="subtype-confusion-scroll">
        <table className="subtype-confusion-table">
          <thead>
            <tr>
              <th className="scm-corner">True ↓ / Pred →</th>
              {columns.map((c, i) => (
                <th
                  key={c.subtype}
                  className={`scm-col-head ${c.isCrossType ? 'scm-col-cross' : ''} ${i === firstCrossIdx ? 'scm-col-first-cross' : ''}`}
                  title={c.isCrossType ? `${c.subtype} (${c.pred_type})` : c.subtype}
                >
                  {c.subtype}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.true_subtype}>
                <td className="scm-row-head" title={row.true_subtype}>
                  <button className="scm-row-label" onClick={() => onViewRecords(row.true_subtype, null, null, null)}>
                    {row.true_subtype}
                  </button>
                </td>
                {columns.map((col, i) => {
                  const count = row.preds[col.subtype] || 0;
                  const isDiag = col.subtype === row.true_subtype;
                  const intensity = cellIntensity(count, row.total);
                  const display = showPct
                    ? (count ? (intensity * 100).toFixed(0) + '%' : '')
                    : (count || '');
                  const bgColor = isDiag
                    ? `rgba(34,197,94,${0.15 + intensity * 0.7})`
                    : col.isCrossType
                      ? `rgba(239,68,68,${0.15 + intensity * 0.75})`
                      : `rgba(245,158,11,${0.15 + intensity * 0.75})`;
                  return (
                    <td
                      key={col.subtype}
                      className={`scm-cell ${isDiag ? 'scm-diag' : count > 0 ? 'scm-err' : ''} ${count > 0 ? 'scm-cell-clickable' : ''} ${col.isCrossType ? 'scm-cell-cross' : ''} ${i === firstCrossIdx ? 'scm-col-first-cross' : ''}`}
                      style={count > 0 ? { background: bgColor } : {}}
                      title={count > 0 ? `${row.true_subtype} → ${col.subtype}${col.isCrossType ? ` (${col.pred_type})` : ''}: ${count}` : ''}
                      onClick={count > 0 ? () => onViewRecords(row.true_subtype, isDiag ? null : col.subtype, null, null) : undefined}
                    >
                      {display}
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

function SubtypeConfusionMatrix({ runId, trueType, correctnessFilter, onViewRecords }) {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPct, setShowPct] = useState(false);

  useEffect(() => {
    setLoading(true);
    let url = `/api/subtype-confusion?run_id=${runId}&true_type=${encodeURIComponent(trueType)}`;
    if (correctnessFilter && correctnessFilter.size > 0) {
      url += `&filter=${[...correctnessFilter].join(',')}`;
    }
    fetch(url)
      .then(r => r.json())
      .then(d => { setMatrix(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [runId, trueType, correctnessFilter]);

  if (loading) return <div className="matrix-loading">Loading matrix…</div>;
  if (!matrix || matrix.rows.length === 0) return <div className="matrix-empty">No data</div>;

  const { columns, rows } = matrix;
  const firstCrossIdx = columns.findIndex(c => c.isCrossType);

  return (
    <div className="subtype-confusion-wrap">
      <div className="subtype-confusion-toolbar">
        <button
          className={`scm-toggle ${showPct ? 'active' : ''}`}
          onClick={() => setShowPct(p => !p)}
        >
          {showPct ? '% of row' : '# count'}
        </button>
        {firstCrossIdx > -1 && (
          <span className="scm-legend">
            <span className="scm-legend-swatch scm-swatch-same" /> same-type
            <span className="scm-legend-swatch scm-swatch-cross" /> cross-type
          </span>
        )}
      </div>
      <div className="subtype-confusion-scroll">
        <table className="subtype-confusion-table">
          <thead>
            <tr>
              <th className="scm-corner">True ↓ / Pred →</th>
              {columns.map((c, i) => (
                <th
                  key={c.subtype}
                  className={`scm-col-head ${c.isCrossType ? 'scm-col-cross' : ''} ${i === firstCrossIdx ? 'scm-col-first-cross' : ''}`}
                  title={c.isCrossType ? `${c.subtype} (${c.pred_type})` : c.subtype}
                >
                  {c.subtype}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.true_subtype}>
                <td className="scm-row-head" title={row.true_subtype}>
                  <button className="scm-row-label" onClick={() => onViewRecords(row.true_subtype, null, null, null)}>
                    {row.true_subtype}
                  </button>
                </td>
                {columns.map((col, i) => {
                  const count = row.preds[col.subtype] || 0;
                  const isDiag = col.subtype === row.true_subtype;
                  const intensity = cellIntensity(count, row.total);
                  const display = showPct
                    ? (count ? (intensity * 100).toFixed(0) + '%' : '')
                    : (count || '');
                  const bgColor = isDiag
                    ? `rgba(34,197,94,${0.15 + intensity * 0.7})`
                    : col.isCrossType
                      ? `rgba(239,68,68,${0.15 + intensity * 0.75})`
                      : `rgba(245,158,11,${0.15 + intensity * 0.75})`;
                  return (
                    <td
                      key={col.subtype}
                      className={`scm-cell ${isDiag ? 'scm-diag' : count > 0 ? 'scm-err' : ''} ${count > 0 ? 'scm-cell-clickable' : ''} ${col.isCrossType ? 'scm-cell-cross' : ''} ${i === firstCrossIdx ? 'scm-col-first-cross' : ''}`}
                      style={count > 0 ? { background: bgColor } : {}}
                      title={count > 0 ? `${row.true_subtype} → ${col.subtype}${col.isCrossType ? ` (${col.pred_type})` : ''}: ${count} — click to view` : ''}
                      onClick={count > 0 ? () => onViewRecords(row.true_subtype, isDiag ? null : col.subtype, null, null) : undefined}
                    >
                      {display}
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

/* ── TypeTransitionMatrix ────────────────────────────────── */
function TypeTransitionMatrix({ runId1, runId2, run1Name, run2Name, onCellClick }) {
  const [matrixData, setMatrixData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/type-transition?run_id1=${runId1}&run_id2=${runId2}`)
      .then(r => r.json())
      .then(d => { setMatrixData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [runId1, runId2]);

  if (loading) return <div className="matrix-loading">Loading type transition…</div>;
  if (!matrixData || !matrixData.rows || matrixData.rows.length === 0) return <div className="matrix-empty">No data</div>;

  const { rows, cols, data } = matrixData;
  const maxTotal = Math.max(1, ...rows.flatMap(r => cols.map(c => data[r]?.[c]?.total || 0)));

  const getCellStyle = (cell, row, col) => {
    const total = cell?.total || 0;
    if (total === 0) return {};
    const alpha = Math.min(0.1 + (total / maxTotal) * 0.5, 0.65);
    if (row === col) return { backgroundColor: `rgba(34,197,94,${alpha})` };
    const { run1Correct = 0, run2Correct = 0 } = cell;
    if (run2Correct > run1Correct) return { backgroundColor: `rgba(6,182,212,${alpha})` };
    if (run1Correct > run2Correct) return { backgroundColor: `rgba(249,115,22,${alpha})` };
    return { backgroundColor: `rgba(148,163,184,${alpha})` };
  };

  return (
    <div className="type-transition-matrix-wrap">
      <div className="subtype-confusion-toolbar">
        <span className="scm-legend">
          <span className="scm-legend-swatch" style={{ background: 'rgba(34,197,94,0.55)' }} /> same type
          <span className="scm-legend-swatch stm-swatch-r2win" /> {run2Name || 'Run 2'} better
          <span className="scm-legend-swatch stm-swatch-r1win" /> {run1Name || 'Run 1'} better
          <span className="scm-legend-swatch" style={{ background: 'rgba(148,163,184,0.55)' }} /> both wrong
        </span>
      </div>
      <div className="subtype-confusion-scroll">
        <table className="subtype-confusion-table">
          <thead>
            <tr>
              <th className="scm-corner stm-corner">
                <span className="stm-run1-label">{run1Name || 'Run 1'} ↓</span>
                <span className="stm-run2-label">{run2Name || 'Run 2'} →</span>
              </th>
              {cols.map(col => (
                <th key={col} className="scm-col-head" title={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row}>
                <td className="scm-row-head">
                  <span className="scm-row-label" style={{ cursor: 'default' }}>{row}</span>
                </td>
                {cols.map(col => {
                  const cell = data[row]?.[col];
                  const total = cell?.total || 0;
                  return (
                    <td
                      key={col}
                      className={`scm-cell ${total > 0 ? 'scm-cell-clickable' : ''} ${row === col ? 'scm-diag' : total > 0 ? 'scm-err' : ''}`}
                      style={total > 0 ? getCellStyle(cell, row, col) : {}}
                      title={total > 0 ? `${run1Name || 'Run 1'}: ${row} → ${run2Name || 'Run 2'}: ${col}: ${total} records` : ''}
                      onClick={total > 0 ? () => onCellClick(row, col) : undefined}
                    >
                      {total || ''}
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

/* ── SubtypeTransitionMatrix ─────────────────────────────── */
function SubtypeTransitionMatrix({ runId1, runId2, trueType, compareFilter, run1Name, run2Name, onViewRecords }) {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minCount, setMinCount] = useState(1);
  const [showPct, setShowPct] = useState(false);

  useEffect(() => {
    setLoading(true);
    let url = `/api/subtype-transition?run_id1=${runId1}&run_id2=${runId2}&true_type=${encodeURIComponent(trueType)}`;
    if (compareFilter) url += `&compare_filter=${compareFilter}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setMatrix(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [runId1, runId2, trueType, compareFilter]);

  if (loading) return <div className="matrix-loading">Loading transition matrix…</div>;
  if (!matrix || matrix.rows.length === 0) return <div className="matrix-empty">No data for this filter</div>;

  const { columns, rows } = matrix;
  // Helper: extract total from cell (which is now { total, run1Correct, run2Correct, bothWrong })
  const cellTotal = (row, sub) => {
    const c = row.preds[sub];
    return (typeof c === 'object' && c !== null) ? (c.total || 0) : (c || 0);
  };
  // Off-diagonal only helper, excluding both-wrong (neither run dominant)
  const offDiagTotal = (row, sub) => {
    if (sub === row.run1_pred) return 0;
    const c = row.preds[sub];
    if (c && typeof c === 'object') {
      const { run1Correct = 0, run2Correct = 0 } = c;
      if (run1Correct === 0 && run2Correct === 0) return 0;
      if (run1Correct === run2Correct) return 0;
    }
    return cellTotal(row, sub);
  };

  const maxCount = Math.max(...rows.flatMap(r => columns.map(c => offDiagTotal(r, c.subtype))));

  // Filter to cells that have count >= minCount (off-diagonal only)
  const hasAnyVisible = rows.some(r =>
    columns.some(c => offDiagTotal(r, c.subtype) >= minCount)
  );

  return (
    <div className="subtype-confusion-wrap">
      <div className="subtype-confusion-toolbar">
        <button
          className={`scm-toggle ${showPct ? 'active' : ''}`}
          onClick={() => setShowPct(p => !p)}
        >
          {showPct ? '% of row' : '# count'}
        </button>
        <div className="stm-stepper">
          <span className="stm-stepper-label">Min cells</span>
          <button
            className="stm-stepper-btn stm-stepper-minus"
            disabled={minCount <= 1}
            onClick={() => setMinCount(c => Math.max(1, c - 1))}
            title="Decrease"
          >−</button>
          <span className="stm-stepper-val">{minCount}</span>
          <button
            className="stm-stepper-btn stm-stepper-plus"
            disabled={minCount >= maxCount}
            onClick={() => setMinCount(c => Math.min(maxCount, c + 1))}
            title="Increase"
          >+</button>
        </div>
        <span className="scm-legend">
          <span className="scm-legend-swatch stm-swatch-r1win" /> {run1Name || 'Run 1'} better
          <span className="scm-legend-swatch stm-swatch-r2win" /> {run2Name || 'Run 2'} better
        </span>
      </div>
      {!hasAnyVisible && (
        <div className="matrix-empty">No cells ≥ {minCount} records — tap − to lower</div>
      )}
      {hasAnyVisible && (
        <div className="subtype-confusion-scroll">
          <table className="subtype-confusion-table">
            <thead>
              <tr>
                <th className="scm-corner stm-corner">
                  <span className="stm-run1-label">{run1Name || 'Run 1'} ↓</span>
                  <span className="stm-run2-label">{run2Name || 'Run 2'} →</span>
                </th>
                {columns.filter(c => rows.some(row => offDiagTotal(row, c.subtype) >= minCount)).map(c => (
                  <th key={c.subtype} className="scm-col-head stm-col-head" title={c.subtype}>
                    {c.subtype}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const rowHasVisible = columns.some(c => offDiagTotal(row, c.subtype) >= minCount);
                if (!rowHasVisible) return null;
                return (
                  <tr key={row.run1_pred}>
                    <td className="scm-row-head" title={row.run1_pred}>
                      <button className="scm-row-label" onClick={() => onViewRecords(row.run1_pred, null)}>
                        {row.run1_pred}
                      </button>
                    </td>
                    {columns.filter(c => rows.some(r => offDiagTotal(r, c.subtype) >= minCount)).map(col => {
                      if (col.subtype === row.run1_pred) return <td key={col.subtype} className="scm-cell stm-cell-empty" />;
                      const cell = row.preds[col.subtype];
                      const count = offDiagTotal(row, col.subtype);
                      if (count < minCount) return <td key={col.subtype} className="scm-cell stm-cell-empty" />;
                      const isDiag = false;
                      const intensity = maxCount > 0 ? count / maxCount : 0;
                      const display = showPct
                        ? (count ? (count / row.total * 100).toFixed(0) + '%' : '')
                        : count;

                      // Color based on correctness breakdown
                      let bgColor;
                      const r1c = (cell && typeof cell === 'object') ? (cell.run1Correct || 0) : 0;
                      const r2c = (cell && typeof cell === 'object') ? (cell.run2Correct || 0) : 0;
                      if (r1c > r2c) {
                        bgColor = `rgba(249,115,22,${0.15 + intensity * 0.55})`;
                      } else if (r2c > r1c) {
                        bgColor = `rgba(6,182,212,${0.15 + intensity * 0.55})`;
                      } else {
                        bgColor = `rgba(148,163,184,${0.15 + intensity * 0.6})`;
                      }

                      // Build tooltip with correctness breakdown
                      let tooltip = `${run1Name || 'Run 1'}: ${row.run1_pred} → ${run2Name || 'Run 2'}: ${col.subtype}: ${count}`;
                      if (r1c > 0 || r2c > 0) {
                        tooltip += `\n${run1Name || 'Run 1'} correct: ${r1c}, ${run2Name || 'Run 2'} correct: ${r2c}`;
                      }

                      return (
                        <td
                          key={col.subtype}
                          className={`scm-cell stm-cell ${isDiag ? 'stm-diag' : 'stm-diff'} ${count > 0 ? 'scm-cell-clickable' : ''}`}
                          style={count > 0 ? { background: bgColor } : {}}
                          title={tooltip}
                          onClick={() => onViewRecords(row.run1_pred, col.subtype)}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── TypeDetailPanel ─────────────────────────────────────── */

/* ── SubtypeChangesList (compare mode — flattened transition list) ── */
function SubtypeChangesList({ runId1, runId2, trueType, compareFilter, run1Name, run2Name, onViewRecords }) {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let url = `/api/subtype-transition?run_id1=${runId1}&run_id2=${runId2}&true_type=${encodeURIComponent(trueType)}`;
    if (compareFilter) url += `&compare_filter=${compareFilter}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setMatrix(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [runId1, runId2, trueType, compareFilter]);

  if (loading) return <div className="matrix-loading">Loading changes…</div>;
  if (!matrix || matrix.rows.length === 0) return <div className="matrix-empty">No data for this filter</div>;

  // Build list of changes from off-diagonal cells
  const changes = [];
  matrix.rows.forEach(row => {
    Object.entries(row.preds).forEach(([run2Pred, cell]) => {
      if (run2Pred === row.run1_pred) return; // skip diagonal
      const total = (typeof cell === 'object' && cell !== null) ? (cell.total || 0) : (cell || 0);
      if (total === 0) return;
      const run1Correct = (typeof cell === 'object') ? (cell.run1Correct || 0) : 0;
      const run2Correct = (typeof cell === 'object') ? (cell.run2Correct || 0) : 0;
      const bothWrong   = (typeof cell === 'object') ? (cell.bothWrong || 0) : 0;
      // Only keep transitions where one run is clearly better
      if (run1Correct > run2Correct || run2Correct > run1Correct) {
        changes.push({ from: row.run1_pred, to: run2Pred, total, run1Correct, run2Correct, bothWrong });
      }
    });
  });

  // Sort: largest changes first
  changes.sort((a, b) => b.total - a.total);

  if (changes.length === 0) return <div className="matrix-empty">No subtype changes between runs</div>;

  const maxTotal = Math.max(...changes.map(c => c.total));

  // Group by which run is better
  const run1Changes = changes.filter(ch => ch.run1Correct > ch.run2Correct);
  const run2Changes = changes.filter(ch => ch.run2Correct > ch.run1Correct);

  const renderItem = (ch, i, tintClass) => {
    const barPct = maxTotal > 0 ? (ch.total / maxTotal) * 100 : 0;
    return (
      <button
        key={`${ch.from}-${ch.to}-${i}`}
        className={`stcl-item ${tintClass}`}
        onClick={() => onViewRecords(ch.from, ch.to)}
        title={`${ch.from} → ${ch.to}: ${ch.total} records\n${run1Name || 'Run 1'} correct: ${ch.run1Correct}, ${run2Name || 'Run 2'} correct: ${ch.run2Correct}`}
      >
        <span className="stcl-label">{ch.from} <span className="stcl-arrow">→</span> {ch.to}</span>
        <span className="stcl-count">{ch.total}</span>
        <span className="stcl-bar-track">
          <span className="stcl-bar" style={{ width: `${barPct}%` }} />
        </span>
      </button>
    );
  };

  return (
    <div className="stcl-list">
      {run1Changes.length > 0 && (
        <div className="stcl-group stcl-group-run1">
          <div className="stcl-group-header stcl-group-header-run1">
            <span className="stcl-group-swatch" />
            {run1Name || 'Run 1'} better
            <span className="stcl-group-count">{run1Changes.length}</span>
          </div>
          {run1Changes.map((ch, i) => renderItem(ch, i, 'stcl-run1'))}
        </div>
      )}
      {run2Changes.length > 0 && (
        <div className="stcl-group stcl-group-run2">
          <div className="stcl-group-header stcl-group-header-run2">
            <span className="stcl-group-swatch" />
            {run2Name || 'Run 2'} better
            <span className="stcl-group-count">{run2Changes.length}</span>
          </div>
          {run2Changes.map((ch, i) => renderItem(ch, i, 'stcl-run2'))}
        </div>
      )}
    </div>
  );
}

/* ── TypeDetailPanel ─────────────────────────────────────── */
function TypeDetailPanel({ typeData, typeData2, runId, runId2, run1Name, run2Name, compareFilter, onViewRecords, onClose, activeSubtype, badgeMatchesFilter }) {
  const isCompare = !!runId2;
  const [view, setView] = useState(isCompare ? 'matrix' : 'badges');

  const subtypeMap2 = {};
  if (typeData2) {
    typeData2.subtypes.forEach(st => { subtypeMap2[st.subtype] = st; });
  }

  return (
    <div className="type-detail-panel">
      <div className="type-detail-header">
        <div className="type-detail-title">
          <span className="type-detail-typename">{typeData.type}</span>
          <span className="type-detail-stats">
            {typeData.total} records &nbsp;·&nbsp;
            <span className="stat-correct">F1 {pctNum(typeData.f1)}%</span>
            {typeData.cross_type_wrong > 0 && (
              <span className="stat-critical"> &nbsp;·&nbsp; ⚠ {pct(typeData.cross_type_rate)} cross-type</span>
            )}
          </span>
          <span className="type-detail-desc">
            {isCompare
              ? 'Transition matrix shows how predictions shifted between runs'
              : 'Subtype breakdown — click a badge to view records, switch to confusion matrix for error patterns'}
          </span>
        </div>
        <div className="type-detail-actions">
          <div className="view-toggle">
            {!isCompare && (
              <button className={`view-toggle-btn ${view === 'badges' ? 'active' : ''}`} onClick={() => setView('badges')}>Subtypes</button>
            )}
            <button className={`view-toggle-btn ${view === 'matrix' ? 'active' : ''}`} onClick={() => setView('matrix')}>
              {isCompare ? 'Transition matrix' : 'Confusion matrix'}
            </button>
          </div>
          <button className="btn-view-records" onClick={() => onViewRecords(null, null, null, null)}>
            All {typeData.type} records
          </button>
          <button className="btn-close-detail" onClick={onClose}>✕</button>
        </div>
      </div>

      {view === 'badges' && !isCompare && (
        <div className="subtype-badge-list">
          {typeData.subtypes.map(st => {
            const st2   = subtypeMap2[st.subtype];
            const delta = st2 ? st2.f1 - st.f1 : undefined;
            return (
              <SubtypeBadge
                key={st.subtype}
                st={st}
                delta={typeData2 ? delta : undefined}
                isActive={activeSubtype === st.subtype}
                isDimmed={badgeMatchesFilter ? !badgeMatchesFilter(st) : false}
                onViewRecords={(subtype) => onViewRecords(subtype, null, null, null)}
              />
            );
          })}
        </div>
      )}

      {view === 'matrix' && !isCompare && (
        <SubtypeConfusionMatrix
          runId={runId}
          trueType={typeData.type}
          onViewRecords={(subtype, predSubtype) => onViewRecords(subtype, predSubtype, null, null)}
        />
      )}

      {view === 'matrix' && isCompare && (
        <SubtypeTransitionMatrix
          runId1={runId}
          runId2={runId2}
          trueType={typeData.type}
          compareFilter={compareFilter}
          run1Name={run1Name}
          run2Name={run2Name}
          onViewRecords={(run1Pred, run2Pred) => onViewRecords(null, null, run1Pred, run2Pred)}
        />
      )}
    </div>
  );
}

/* ── TypeHealthRow (single mode — bar layout) ────────────── */
function TypeHealthRow({ typeData, maxTotal, isExpanded, isDimmed, correctnessFilter, onToggle, onViewRecords, runId, activeSubtype, badgeMatchesFilter, isUnknowns }) {
  const { accuracy, cross_type_rate, total, correct, cross_type_wrong, same_type_wrong } = typeData;
  const f1 = typeData.f1 ?? accuracy;
  const sev = severityClass(f1, cross_type_rate);

  const correctPct = (correct / total) * 100;
  const samePct    = (same_type_wrong / total) * 100;
  const crossPct   = (cross_type_wrong / total) * 100;
  const barScale   = maxTotal > 0 ? (total / maxTotal) * 100 : 100;

  const barTip = `Correct: ${correct.toLocaleString()} (${correctPct.toFixed(1)}%) · Same-type wrong: ${same_type_wrong.toLocaleString()} (${samePct.toFixed(1)}%) · Cross-type: ${cross_type_wrong.toLocaleString()} (${crossPct.toFixed(1)}%)`;

  const [view, setView] = useState('bars');

  const maxSubtypeTotal = Math.max(...typeData.subtypes.map(st => st.total), 1);

  const noFilter = !correctnessFilter || correctnessFilter.size === 0;
  const opacityFor = (key) => noFilter || correctnessFilter.has(key) ? 1 : 0.15;

  return (
    <div className={`th-row ${sev} ${isExpanded ? 'th-row-expanded' : ''} ${isDimmed ? 'th-row-dimmed' : ''}`}>
      <button className="th-row-header" onClick={onToggle}>
        <span className="th-row-expand" title="Click to explore subtypes">{isExpanded ? '▾' : '▸'}</span>
        <span className="th-row-name" title={typeData.type}>{typeData.type}</span>
        <span className="th-row-f1">{pctNum(f1)}%</span>
        <span className="th-row-count">{total.toLocaleString()}</span>
        <div className="th-row-bar-track" title={barTip}>
          <div className="th-row-bar" style={{ width: `${barScale}%` }}>
            <div className="bar-correct"    style={{ width: `${correctPct}%`,  opacity: opacityFor('correct') }} />
            <div className="bar-same-type"  style={{ width: `${samePct}%`,     opacity: opacityFor('same_type') }} />
            <div className="bar-cross-type" style={{ width: `${crossPct}%`,    opacity: opacityFor('cross_type') }} />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="th-row-detail">
          <div className="th-row-toolbar">
            <div className="view-toggle">
              <button className={`view-toggle-btn ${view === 'bars' ? 'active' : ''}`} onClick={() => setView('bars')}>Subtypes</button>
              <button className={`view-toggle-btn ${view === 'matrix' ? 'active' : ''}`} onClick={() => setView('matrix')}>Confusion matrix</button>
            </div>
            <button className="btn-view-records" onClick={() => onViewRecords(typeData.type, null, null, null, null)}>
              All {typeData.type} records
            </button>
          </div>

          {view === 'bars' && (
            <div className="th-subtype-list">
              {typeData.subtypes.map(st => {
                const stF1 = st.f1 ?? st.accuracy;
                const stCorrectPct = (st.correct / st.total) * 100;
                const stCrossPct   = (st.cross_type / st.total) * 100;
                const stSameWrong  = st.total - st.correct - st.cross_type;
                const stSamePct    = Math.max(0, (stSameWrong / st.total) * 100);
                const stBarScale   = (st.total / maxSubtypeTotal) * 100;
                const stTip = `${st.subtype} · ${st.total.toLocaleString()} records\nCorrect: ${st.correct.toLocaleString()} (${stCorrectPct.toFixed(1)}%)\nSame-type wrong: ${stSameWrong.toLocaleString()} (${stSamePct.toFixed(1)}%)\nCross-type: ${st.cross_type.toLocaleString()} (${stCrossPct.toFixed(1)}%)`;
                const isActive = activeSubtype === st.subtype;
                const dim = badgeMatchesFilter ? !badgeMatchesFilter(st) : false;
                return (
                  <button
                    key={st.subtype}
                    className={`th-subrow ${isActive ? 'th-subrow-active' : ''} ${dim ? 'th-subrow-dimmed' : ''}`}
                    onClick={() => onViewRecords(typeData.type, st.subtype, null, null, null)}
                    title={stTip}
                  >
                    <span className="th-subrow-name">{st.subtype}</span>
                    <span className="th-subrow-f1">{pctNum(stF1)}%</span>
                    <span className="th-subrow-count">{st.total.toLocaleString()}</span>
                    <div className="th-subrow-bar-track">
                      <div className="th-subrow-bar" style={{ width: `${stBarScale}%` }}>
                        <div className="bar-correct"    style={{ width: `${stCorrectPct}%`, opacity: opacityFor('correct') }} />
                        <div className="bar-same-type"  style={{ width: `${stSamePct}%`,    opacity: opacityFor('same_type') }} />
                        <div className="bar-cross-type" style={{ width: `${stCrossPct}%`,   opacity: opacityFor('cross_type') }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {view === 'matrix' && (
            isUnknowns
              ? <StaticSubtypeConfusionMatrix
                  typeData={typeData}
                  onViewRecords={(subtype, predSubtype) => onViewRecords(typeData.type, subtype, predSubtype, null, null)}
                />
              : <SubtypeConfusionMatrix
                  runId={runId}
                  trueType={typeData.type}
                  correctnessFilter={correctnessFilter}
                  onViewRecords={(subtype, predSubtype) => onViewRecords(typeData.type, subtype, predSubtype, null, null)}
                />
          )}
        </div>
      )}
    </div>
  );
}

/* ── TypeHealthRowCompare (compare mode — bar layout) ─────── */
function TypeHealthRowCompare({ typeData, typeData2, compareData, maxTotal, isExpanded, isDimmed, compareFilter, onToggle, onViewRecords, runId, runId2, run1Name, run2Name }) {
  const { type } = typeData;
  const [view, setView] = useState('matrix');
  const f1 = typeData.f1 ?? typeData.accuracy;
  const delta = typeData2 ? (typeData2.f1 ?? typeData2.accuracy) - f1 : null;
  const sev = severityClass(f1, typeData.cross_type_rate);

  const bc  = compareData ? compareData.both_correct : 0;
  const r1  = compareData ? compareData.run1_only    : 0;
  const r2  = compareData ? compareData.run2_only    : 0;
  const bw  = compareData ? compareData.both_wrong   : 0;
  const tot = compareData ? (bc + r1 + r2 + bw) : typeData.total;

  const bcPct = tot > 0 ? (bc / tot) * 100 : 0;
  const r1Pct = tot > 0 ? (r1 / tot) * 100 : 0;
  const r2Pct = tot > 0 ? (r2 / tot) * 100 : 0;
  const bwPct = tot > 0 ? (bw / tot) * 100 : 0;
  const barScale = maxTotal > 0 ? (tot / maxTotal) * 100 : 100;

  const opacityFor = (key) => !compareFilter || compareFilter === key ? 1 : 0.15;

  const barTip = `Both correct: ${bc.toLocaleString()} (${bcPct.toFixed(1)}%) · ${run1Name || 'Run 1'} only: ${r1.toLocaleString()} (${r1Pct.toFixed(1)}%) · ${run2Name || 'Run 2'} only: ${r2.toLocaleString()} (${r2Pct.toFixed(1)}%) · Both wrong: ${bw.toLocaleString()} (${bwPct.toFixed(1)}%)`;

  const hasTransitions = r1 > 0 || r2 > 0;
  const noTransitions = !hasTransitions;
  const netChange = r2 - r1;
  const dirClass = netChange > 0 ? 'th-row-dir-up' : netChange < 0 ? 'th-row-dir-down' : '';

  return (
    <div className={`th-row ${sev} ${isExpanded ? 'th-row-expanded' : ''} ${isDimmed ? 'th-row-dimmed' : ''} ${noTransitions ? 'th-row-no-transitions' : ''} ${dirClass}`}>
      <button className="th-row-header th-row-header-cmp" onClick={hasTransitions ? onToggle : undefined} style={noTransitions ? { cursor: 'default' } : undefined}>
        <span className="th-row-expand" title={hasTransitions ? 'Click to explore subtypes' : undefined}>{isExpanded ? '▾' : hasTransitions ? '▸' : ' '}</span>
        <span className="th-row-name" title={type}>{type}</span>
        <span className="th-row-f1">{pctNum(f1)}%{delta !== null && <DeltaBadge delta={delta} />}</span>
        <span className="th-row-change-pills">
          {r2 > 0 && <span className="change-pill pill-improved" title={`${r2} records improved (${run2Name} newly correct)`}>▲{r2}</span>}
          {r1 > 0 && <span className="change-pill pill-regressed" title={`${r1} records regressed (${run1Name} was correct)`}>▼{r1}</span>}
          {bw > 0 && <span className="change-pill pill-both-wrong" title={`${bw} records both wrong`}>={bw}</span>}
        </span>
        <span className="th-row-count">{tot.toLocaleString()}</span>
        <div className="th-row-bar-track" title={barTip}>
          <div className="th-row-bar" style={{ width: `${barScale}%` }}>
            <div className="bar-cmp-both-correct" style={{ width: `${bcPct}%`, opacity: opacityFor('both_correct') }} />
            <div className="bar-cmp-run1-only"    style={{ width: `${r1Pct}%`, opacity: opacityFor('run1_only') }} />
            <div className="bar-cmp-run2-only"    style={{ width: `${r2Pct}%`, opacity: opacityFor('run2_only') }} />
            <div className="bar-cmp-both-wrong"   style={{ width: `${bwPct}%`, opacity: opacityFor('both_wrong') }} />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="th-row-detail">
          <div className="th-row-toolbar">
            <div className="view-toggle">
              <button className={`view-toggle-btn ${view === 'changes' ? 'active' : ''}`} onClick={() => setView('changes')}>Subtypes</button>
              <button className={`view-toggle-btn ${view === 'matrix' ? 'active' : ''}`} onClick={() => setView('matrix')}>Transition matrix</button>
            </div>
            <button className="btn-view-records" onClick={() => onViewRecords(type, null, null, null, null)}>
              All {type} records
            </button>
          </div>
          {view === 'changes' && (
            <SubtypeChangesList
              runId1={runId}
              runId2={runId2}
              trueType={type}
              compareFilter={compareFilter}
              run1Name={run1Name}
              run2Name={run2Name}
              onViewRecords={(run1Pred, run2Pred) => onViewRecords(type, null, null, run1Pred, run2Pred)}
            />
          )}
          {view === 'matrix' && (
            <SubtypeTransitionMatrix
              runId1={runId}
              runId2={runId2}
              trueType={type}
              compareFilter={compareFilter}
              run1Name={run1Name}
              run2Name={run2Name}
              onViewRecords={(run1Pred, run2Pred) => onViewRecords(type, null, null, run1Pred, run2Pred)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── CompareScoreboard ────────────────────────────────────── */
function CompareScoreboard({ typeHealth, typeHealth2, compareTypeHealth, run1Name, run2Name, compareFilter, onCompareFilter, onViewRecords }) {
  if (!typeHealth2 || !compareTypeHealth) return null;

  const total1   = typeHealth.reduce((s, t) => s + t.total, 0);
  const correct1 = typeHealth.reduce((s, t) => s + t.correct, 0);
  const acc1     = total1 > 0 ? correct1 / total1 : 0;

  const total2   = typeHealth2.reduce((s, t) => s + t.total, 0);
  const correct2 = typeHealth2.reduce((s, t) => s + t.correct, 0);
  const acc2     = total2 > 0 ? correct2 / total2 : 0;

  const delta     = acc2 - acc1;
  const deltaAbs  = Math.abs(delta * 100).toFixed(2);
  const deltaSign = delta > 0.0005 ? '+' : delta < -0.0005 ? '' : '';
  const deltaDir  = delta > 0.0005 ? 'up' : delta < -0.0005 ? 'down' : 'flat';

  const improved  = compareTypeHealth.reduce((s, t) => s + (t.run2_only || 0), 0);
  const regressed = compareTypeHealth.reduce((s, t) => s + (t.run1_only || 0), 0);
  const bothCorrect = compareTypeHealth.reduce((s, t) => s + (t.both_correct || 0), 0);
  const bothWrong   = compareTypeHealth.reduce((s, t) => s + (t.both_wrong || 0), 0);
  const net = improved - regressed;

  return (
    <div className="cmp-scoreboard">
      <div className="cmp-score-card">
        <span className="cmp-score-label">{run1Name || 'Run 1'}</span>
        <span className="cmp-score-value">{pctNum(acc1)}%</span>
      </div>
      <div className={`cmp-score-delta cmp-score-delta-${deltaDir}`}>
        <span className="cmp-score-delta-arrow">{deltaDir === 'up' ? '▲' : deltaDir === 'down' ? '▼' : '='}</span>
        <span className="cmp-score-delta-num">{deltaSign}{deltaAbs}%</span>
        <span className="cmp-score-delta-label">net accuracy</span>
      </div>
      <div className="cmp-score-card">
        <span className="cmp-score-label">{run2Name || 'Run 2'}</span>
        <span className="cmp-score-value">{pctNum(acc2)}%</span>
      </div>
      <div className="cmp-score-divider" />
      <div className="cmp-score-stats">
        <button
          className={`cmp-stat cmp-stat-improved${compareFilter === 'run2_only' ? ' cmp-stat-active' : ''}`}
          title={`${run2Name} newly correct — click to filter`}
          onClick={() => { onCompareFilter('run2_only'); onViewRecords(null, null, null, null, null); }}
        >
          <span className="cmp-stat-icon">▲</span>
          <span className="cmp-stat-num">{improved.toLocaleString()}</span>
          <span className="cmp-stat-label">improved</span>
        </button>
        <button
          className={`cmp-stat cmp-stat-regressed${compareFilter === 'run1_only' ? ' cmp-stat-active' : ''}`}
          title={`${run1Name} correct, ${run2Name} regressed — click to filter`}
          onClick={() => { onCompareFilter('run1_only'); onViewRecords(null, null, null, null, null); }}
        >
          <span className="cmp-stat-icon">▼</span>
          <span className="cmp-stat-num">{regressed.toLocaleString()}</span>
          <span className="cmp-stat-label">regressed</span>
        </button>
        <span className={`cmp-stat-net ${net > 0 ? 'cmp-stat-net-up' : net < 0 ? 'cmp-stat-net-down' : 'cmp-stat-net-flat'}`}>
          {net > 0 ? `+${net}` : net} net
        </span>
      </div>
    </div>
  );
}

/* ── TypeHealthGrid ──────────────────────────────────────── */
function TypeHealthGrid({
  typeHealth, typeHealth2, compareTypeHealth,
  runId, runId2, run1Name, run2Name,
  onViewRecords, activeSubtype,
  correctnessFilter, onCorrectnessFilter,
  compareFilter, onCompareFilter,
  isUnknowns,
}) {
  const [expandedType, setExpandedType] = useState(null);
  const [transitionView, setTransitionView] = useState('type-transition');
  const isCompare = !!runId2;

  useEffect(() => {
    if (isCompare) setTransitionView('type-transition');
  }, [isCompare, runId2]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeMap2 = {};
  if (typeHealth2) {
    typeHealth2.forEach(t => { typeMap2[t.type] = t; });
  }

  const compareMap = {};
  if (compareTypeHealth) {
    compareTypeHealth.forEach(t => { compareMap[t.type] = t; });
  }

  const handleCardClick = (typeName) => {
    setExpandedType(prev => prev === typeName ? null : typeName);
  };

  const expandedData  = typeHealth.find(t => t.type === expandedType);
  const expandedData2 = typeMap2[expandedType] || null;

  /* dim cards that have zero records in the active filter category (single mode) */
  function cardMatchesFilter(t) {
    if (!correctnessFilter || correctnessFilter.size === 0) return true;
    if (correctnessFilter.has('correct')    && t.correct > 0) return true;
    if (correctnessFilter.has('same_type')  && t.same_type_wrong > 0) return true;
    if (correctnessFilter.has('cross_type') && t.cross_type_wrong > 0) return true;
    return false;
  }

  /* dim cards in compare mode */
  function cardMatchesCompareFilter(t) {
    if (!compareFilter) return true;
    const cd = compareMap[t.type];
    if (!cd) return false;
    if (compareFilter === 'both_correct') return cd.both_correct > 0;
    if (compareFilter === 'run1_only')    return cd.run1_only > 0;
    if (compareFilter === 'run2_only')    return cd.run2_only > 0;
    if (compareFilter === 'both_wrong')   return cd.both_wrong > 0;
    return true;
  }

  function badgeMatchesFilter(st) {
    if (!correctnessFilter || correctnessFilter.size === 0) return true;
    if (correctnessFilter.has('correct')    && st.correct > 0) return true;
    if (correctnessFilter.has('same_type')  && (st.total - st.correct - st.cross_type) > 0) return true;
    if (correctnessFilter.has('cross_type') && st.cross_type > 0) return true;
    return false;
  }

  const maxTotal = Math.max(...typeHealth.map(t => {
    if (isCompare) {
      const cd = compareMap[t.type];
      return cd ? (cd.both_correct + cd.run1_only + cd.run2_only + cd.both_wrong) : t.total;
    }
    return t.total;
  }), 1);

  const LEGEND_SINGLE = [
    { key: 'correct',    label: 'Correct',             cls: 'swatch-correct' },
    { key: 'same_type',  label: 'Same-type wrong',     cls: 'swatch-same-type' },
    { key: 'cross_type', label: 'Cross-type (severe)', cls: 'swatch-cross-type' },
  ];

  const LEGEND_COMPARE = [
    { key: 'both_correct', label: 'Both correct',              cls: 'swatch-cmp-both-correct' },
    { key: 'run1_only',    label: `${run1Name || 'Run 1'} only`,  cls: 'swatch-cmp-run1-only' },
    { key: 'run2_only',    label: `${run2Name || 'Run 2'} only`,  cls: 'swatch-cmp-run2-only' },
    { key: 'both_wrong',   label: 'Both wrong',                cls: 'swatch-cmp-both-wrong' },
  ];


  return (
    <div className="type-health-section">
      {isCompare && (
        <CompareScoreboard
          typeHealth={typeHealth}
          typeHealth2={typeHealth2}
          compareTypeHealth={compareTypeHealth}
          run1Name={run1Name}
          run2Name={run2Name}
          compareFilter={compareFilter}
          onCompareFilter={onCompareFilter}
          onViewRecords={onViewRecords}
        />
      )}

      {isCompare && (
        <div className="type-transition-toggle">
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${transitionView === 'type-transition' ? 'active' : ''}`}
              onClick={() => setTransitionView('type-transition')}
            >Type Transition</button>
            <button
              className={`view-toggle-btn ${transitionView === 'breakdown' ? 'active' : ''}`}
              onClick={() => setTransitionView('breakdown')}
            >Breakdown</button>
          </div>
        </div>
      )}

      {isCompare && transitionView === 'type-transition' && (
        <TypeTransitionMatrix
          runId1={runId}
          runId2={runId2}
          run1Name={run1Name}
          run2Name={run2Name}
          onCellClick={(r1Type, r2Type) => onViewRecords(null, null, null, null, null, r1Type, r2Type)}
        />
      )}

      {(!isCompare || transitionView === 'breakdown') && (
      <>
      <div className="th-sticky-header">
        <div className="type-section-header">
          <div className="type-section-title-block">
            <span className="type-section-label">
              {isCompare ? 'Type Comparison' : 'Type Accuracy'}
            </span>
            <span className="type-section-desc">
              {isCompare
                ? 'Side-by-side breakdown per type — see where each run improved or regressed'
                : 'F1 score per classification type. Click a type to explore subtypes and confusion patterns.'}
            </span>
          </div>
          <div className="type-grid-legend">
            {isCompare
              ? LEGEND_COMPARE.map(l => (
                  <button
                    key={l.key}
                    className={`legend-btn ${compareFilter === l.key ? 'legend-btn-active' : ''}`}
                    onClick={() => onCompareFilter(l.key)}
                  >
                    <span className={`legend-swatch ${l.cls}`} />
                    {l.label}
                  </button>
                ))
              : LEGEND_SINGLE.map(l => (
                  <button
                    key={l.key}
                    className={`legend-btn ${correctnessFilter && correctnessFilter.has(l.key) ? 'legend-btn-active' : ''}`}
                    onClick={() => onCorrectnessFilter(l.key)}
                  >
                    <span className={`legend-swatch ${l.cls}`} />
                    {l.label}
                  </button>
                ))
            }
          </div>
        </div>

        <div className={`th-col-header${isCompare ? ' th-col-header-cmp' : ''}`}>
          <span className="th-col-expand" />
          <span className="th-col-label">True Type</span>
          {isCompare ? (
            <>
              <span className="th-col-f1">F1</span>
              <span className="th-col-changes">Changes</span>
              <span className="th-col-count">#</span>
            </>
          ) : (
            <>
              <span className="th-col-f1">F1</span>
              <span className="th-col-count">#</span>
            </>
          )}
          <span className="th-col-bar">Breakdown</span>
        </div>
      </div>

      <div className="th-list">
        {typeHealth.map(t => {
          if (isCompare) {
            const cd = compareMap[t.type];
            return (
              <TypeHealthRowCompare
                key={t.type}
                typeData={t}
                typeData2={typeMap2[t.type] || null}
                compareData={cd || null}
                maxTotal={maxTotal}
                isExpanded={expandedType === t.type}
                isDimmed={!cardMatchesCompareFilter(t)}
                compareFilter={compareFilter}
                onToggle={() => handleCardClick(t.type)}
                onViewRecords={onViewRecords}
                runId={runId}
                runId2={runId2}
                run1Name={run1Name}
                run2Name={run2Name}
              />
            );
          }
          return (
            <TypeHealthRow
              key={t.type}
              typeData={t}
              maxTotal={maxTotal}
              isExpanded={expandedType === t.type}
              isDimmed={!cardMatchesFilter(t)}
              correctnessFilter={correctnessFilter}
              onToggle={() => handleCardClick(t.type)}
              onViewRecords={onViewRecords}
              runId={runId}
              activeSubtype={activeSubtype}
              badgeMatchesFilter={badgeMatchesFilter}
              isUnknowns={isUnknowns}
            />
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

export default TypeHealthGrid;
