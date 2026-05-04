import React, { useState, useEffect } from 'react';

/* ── helpers ─────────────────────────────────────────────── */
function pct(n) { return (n * 100).toFixed(0) + '%'; }
function pctNum(n) { return (n * 100).toFixed(1); }
function pctMetric(n, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}
function subtypeLabel(name) {
  return String(name || '').trim() === '' ? 'Not retagged' : name;
}

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

function CollapsibleSection({ title, subtitle, expanded, onToggle, children, extraClassName = '' }) {
  return (
    <section className={`collapsible-section ${expanded ? 'is-open' : 'is-closed'} ${extraClassName}`.trim()}>
      <button className="collapsible-section-header" onClick={onToggle}>
        <span className="collapsible-section-titlewrap">
          <span className="collapsible-section-title">{title}</span>
          {subtitle && <span className="collapsible-section-subtitle">{subtitle}</span>}
        </span>
        <span className="collapsible-section-icon" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && <div className="collapsible-section-body">{children}</div>}
    </section>
  );
}

/* ── SubtypeBadge ────────────────────────────────────────── */
function SubtypeBadge({ st, delta, isActive, isDimmed, onViewRecords }) {
  const subtypeName = subtypeLabel(st.subtype);
  const correctPct  = (st.correct / st.total) * 100;
  const crossPct    = (st.cross_type / st.total) * 100;
  const samePct     = Math.max(0, 100 - correctPct - crossPct);

  return (
    <button
      className={`subtype-badge ${isActive ? 'subtype-badge-active' : ''} ${isDimmed ? 'subtype-badge-dimmed' : ''}`}
      onClick={() => onViewRecords(st.subtype)}
      title={`${subtypeName} · ${st.total} records · F1: ${pctNum(st.f1)}%`}
    >
      <div className="sbadge-top">
        <span className="sbadge-name">{subtypeName}</span>
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
                  title={c.isCrossType ? `${subtypeLabel(c.subtype)} (${c.pred_type})` : subtypeLabel(c.subtype)}
                >
                  {subtypeLabel(c.subtype)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.true_subtype}>
                <td className="scm-row-head" title={subtypeLabel(row.true_subtype)}>
                  <button className="scm-row-label" onClick={() => onViewRecords(row.true_subtype, null, null, null)}>
                    {subtypeLabel(row.true_subtype)}
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
                      title={count > 0 ? `${subtypeLabel(row.true_subtype)} → ${subtypeLabel(col.subtype)}${col.isCrossType ? ` (${col.pred_type})` : ''}: ${count}` : ''}
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
                  title={c.isCrossType ? `${subtypeLabel(c.subtype)} (${c.pred_type})` : subtypeLabel(c.subtype)}
                >
                  {subtypeLabel(c.subtype)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.true_subtype}>
                <td className="scm-row-head" title={subtypeLabel(row.true_subtype)}>
                  <button className="scm-row-label" onClick={() => onViewRecords(row.true_subtype, null, null, null)}>
                    {subtypeLabel(row.true_subtype)}
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
                      title={count > 0 ? `${subtypeLabel(row.true_subtype)} → ${subtypeLabel(col.subtype)}${col.isCrossType ? ` (${col.pred_type})` : ''}: ${count} — click to view` : ''}
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
                  <th key={c.subtype} className="scm-col-head stm-col-head" title={subtypeLabel(c.subtype)}>
                    {subtypeLabel(c.subtype)}
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
                    <td className="scm-row-head" title={subtypeLabel(row.run1_pred)}>
                      <button className="scm-row-label" onClick={() => onViewRecords(row.run1_pred, null)}>
                        {subtypeLabel(row.run1_pred)}
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
                      let tooltip = `${run1Name || 'Run 1'}: ${subtypeLabel(row.run1_pred)} → ${run2Name || 'Run 2'}: ${subtypeLabel(col.subtype)}: ${count}`;
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
        <span className="stcl-label">{subtypeLabel(ch.from)} <span className="stcl-arrow">→</span> {subtypeLabel(ch.to)}</span>
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
function TypeHealthRow({ typeData, maxTotal, isExpanded, isDimmed, correctnessFilter, onToggle, onViewRecords, runId, activeSubtype, badgeMatchesFilter, isUnknowns, calibration }) {
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
        {calibration ? (
          <span
            className={`th-row-ece th-row-ece-${calibration.status}`}
            title={`ECE: ${(calibration.ece * 100).toFixed(1)}% · Brier: ${(calibration.brier * 100).toFixed(1)}% · Avg conf: ${(calibration.avg_confidence * 100).toFixed(1)}%`}
          >
            {(calibration.ece * 100).toFixed(1)}%
          </span>
        ) : (
          <span className="th-row-ece" />
        )}
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
                const stName = subtypeLabel(st.subtype);
                const stCorrectPct = (st.correct / st.total) * 100;
                const stCrossPct   = (st.cross_type / st.total) * 100;
                const stSameWrong  = st.total - st.correct - st.cross_type;
                const stSamePct    = Math.max(0, (stSameWrong / st.total) * 100);
                const stBarScale   = (st.total / maxSubtypeTotal) * 100;
                const stTip = `${stName} · ${st.total.toLocaleString()} records\nCorrect: ${st.correct.toLocaleString()} (${stCorrectPct.toFixed(1)}%)\nSame-type wrong: ${stSameWrong.toLocaleString()} (${stSamePct.toFixed(1)}%)\nCross-type: ${st.cross_type.toLocaleString()} (${stCrossPct.toFixed(1)}%)`;
                const isActive = activeSubtype === st.subtype;
                const dim = badgeMatchesFilter ? !badgeMatchesFilter(st) : false;
                return (
                  <button
                    key={st.subtype}
                    className={`th-subrow ${isActive ? 'th-subrow-active' : ''} ${dim ? 'th-subrow-dimmed' : ''}`}
                    onClick={() => onViewRecords(typeData.type, st.subtype, null, null, null)}
                    title={stTip}
                  >
                    <span className="th-subrow-name">{stName}</span>
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

/* ── ConfidenceScoreboard (single run) ───────────────────── */
function ConfidenceScoreboard({ confidenceQuality }) {
  if (!confidenceQuality || !confidenceQuality.n) return null;

  const ece           = confidenceQuality.ece ?? 0;
  const avgConfidence = confidenceQuality.avg_confidence ?? 0;
  const accuracy      = confidenceQuality.accuracy ?? 0;
  const maxGap        = confidenceQuality.max_gap ?? 0;
  const worstBin      = confidenceQuality.worst_bin || 'n/a';
  const n             = confidenceQuality.n || 0;
  const bins          = Array.isArray(confidenceQuality.bins) ? confidenceQuality.bins : [];

  // Bias: positive = overconfident, negative = underconfident
  const bias = avgConfidence - accuracy;

  // StdGap: std deviation of per-bin gaps (weighted by bin count)
  let stdGap = 0;
  if (bins.length > 0) {
    const totalCount = bins.reduce((s, b) => s + b.count, 0);
    if (totalCount > 0) {
      const variance = bins.reduce((s, b) => {
        const w = b.count / totalCount;
        return s + w * Math.pow(b.gap - ece, 2);
      }, 0);
      stdGap = Math.sqrt(variance);
    }
  }

  const status   = confidenceQuality.status || (ece < 0.03 ? 'good' : ece >= 0.07 ? 'poor' : 'moderate');
  const statusCls = { good: 'up', moderate: 'flat', poor: 'down' }[status] ?? 'flat';
  const statusLabel = { good: 'Calibrated', moderate: 'Moderate calibration', poor: 'Needs calibration' }[status] ?? '';

  const biasLabel   = Math.abs(bias) < 0.005 ? 'neutral'
    : bias > 0 ? 'overconfident' : 'underconfident';
  const biasCls     = Math.abs(bias) < 0.005 ? '' : bias > 0 ? 'confq-metric-over' : 'confq-metric-under';
  const biasSign    = bias > 0.005 ? '+' : '';

  return (
    <div className="confq-profile-strip">
      <div className="confq-profile-metric" title="Expected Calibration Error — weighted average |accuracy − confidence| across bins. Lower is better.">
        <span className="confq-profile-label">ECE</span>
        <span className="confq-profile-value">{pctMetric(ece)}</span>
        <span className={`confq-profile-tag confq-tag-${status}`}>{statusLabel}</span>
      </div>

      <div className="confq-profile-divider" />

      <div className={`confq-profile-metric ${biasCls}`} title={`Bias = avg confidence − accuracy. Positive = model is overconfident, negative = underconfident.`}>
        <span className="confq-profile-label">Bias</span>
        <span className="confq-profile-value">{biasSign}{pctMetric(bias)}</span>
        <span className="confq-profile-tag">{biasLabel}</span>
      </div>

      <div className="confq-profile-divider" />

      <div className="confq-profile-metric" title="StdGap — standard deviation of per-bin calibration gaps. High = error concentrated in a few bins; low = evenly spread.">
        <span className="confq-profile-label">StdGap</span>
        <span className="confq-profile-value">{pctMetric(stdGap)}</span>
        <span className="confq-profile-tag">{stdGap > ece ? 'concentrated' : 'spread'}</span>
      </div>

      <div className="confq-profile-divider" />

      <div className="confq-profile-metric" title={`MaxGap — worst-case calibration error in a single bin (bin ${worstBin}). This is where the biggest problem is hiding.`}>
        <span className="confq-profile-label">MaxGap</span>
        <span className="confq-profile-value">{pctMetric(maxGap)}</span>
        <span className="confq-profile-tag">bin {worstBin}</span>
      </div>

      <div className="confq-profile-divider" />

      <div className="confq-profile-meta">
        <span className="confq-profile-meta-item">{n.toLocaleString()} scored</span>
        <span className="confq-profile-meta-item">avg conf {(avgConfidence * 100).toFixed(1)}%</span>
        <span className="confq-profile-meta-item">acc {(accuracy * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

function ReliabilityPlot({ bins, activeHint }) {
  const chartBins = Array.isArray(bins) ? bins : [];
  if (chartBins.length === 0) return <div className="matrix-empty">No confidence bins</div>;

  const width = 500;
  const height = 250;
  const padLeft = 66;
  const padRight = 22;
  const padTop = 14;
  const padBottom = 52;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const x = (v) => padLeft + v * innerW;
  const y = (v) => padTop + (1 - v) * innerH;
  const sortedBins = [...chartBins].sort((a, b) => a.avg_confidence - b.avg_confidence);
  const reliabilityPath = sortedBins
    .map((bin, i) => `${i === 0 ? 'M' : 'L'} ${x(bin.avg_confidence).toFixed(2)} ${y(bin.accuracy).toFixed(2)}`)
    .join(' ');

  const maxCount = Math.max(...chartBins.map(b => b.count), 1);
  const totalCount = Math.max(chartBins.reduce((s, b) => s + b.count, 0), 1);
  const ece = chartBins.reduce((s, b) => s + (b.count / totalCount) * Math.abs(b.accuracy - b.avg_confidence), 0);
  const worstBin = chartBins.reduce((w, b) =>
    Math.abs(b.accuracy - b.avg_confidence) > Math.abs(w.accuracy - w.avg_confidence) ? b : w
  , chartBins[0]);
  const weightedBias = chartBins.reduce((s, b) => s + (b.count / totalCount) * (b.avg_confidence - b.accuracy), 0);
  const maxAbsGap = Math.max(...chartBins.map(b => Math.abs(b.accuracy - b.avg_confidence)), 0.0001);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const biasIsNeutral = Math.abs(weightedBias) < 0.005;
  const biasIsOver = weightedBias > 0.005;
  const bandSteps = 40;
  const eceBandTop = [];
  const eceBandBottom = [];
  for (let i = 0; i <= bandSteps; i += 1) {
    const v = i / bandSteps;
    eceBandTop.push(`${x(v).toFixed(2)} ${y(clamp01(v + ece)).toFixed(2)}`);
    eceBandBottom.push(`${x(v).toFixed(2)} ${y(clamp01(v - ece)).toFixed(2)}`);
  }
  const eceBandPath = `M ${eceBandTop.join(' L ')} L ${eceBandBottom.reverse().join(' L ')} Z`;
  const bottomLeft = `${x(0).toFixed(2)} ${y(0).toFixed(2)}`;
  const topLeft = `${x(0).toFixed(2)} ${y(1).toFixed(2)}`;
  const topRight = `${x(1).toFixed(2)} ${y(1).toFixed(2)}`;
  const bottomRight = `${x(1).toFixed(2)} ${y(0).toFixed(2)}`;
  const underBiasRegionPath = `M ${bottomLeft} L ${topLeft} L ${topRight} Z`;
  const overBiasRegionPath = `M ${bottomLeft} L ${bottomRight} L ${topRight} Z`;

  return (
    <div className="confq-card confq-reliability-card">
      <div className="confq-card-header">
        <span className="confq-card-title">Reliability</span>
        <span className="confq-card-subtitle">Each dot = a confidence bin (x: avg confidence, y: actual accuracy). On the diagonal = perfect calibration; below = overconfident; above = underconfident.</span>
      </div>
      <div className="confq-plot-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="confq-plot" role="img" aria-label="Confidence reliability plot">
          {activeHint === 'bias' && (
            <>
              <path
                d={underBiasRegionPath}
                style={{
                  fill: 'rgba(16,185,129,0.12)',
                  opacity: weightedBias < -0.005 ? 0.9 : 0.35,
                }}
              />
              <path
                d={overBiasRegionPath}
                style={{
                  fill: 'rgba(239,68,68,0.12)',
                  opacity: weightedBias > 0.005 ? 0.9 : 0.35,
                }}
              />
            </>
          )}
          <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="confq-diagonal" />
          
          {/* Zone watermarks */}
          <text
            x={padLeft + 6}
            y={padTop + 12}
            textAnchor="start"
            dominantBaseline="hanging"
            className="confq-zone-stamp confq-zone-stamp-info"
            style={{ fontSize: '16px', opacity: 0.35 }}
          >Underconfident</text>
          <text
            x={width - padRight - 6}
            y={height - padBottom - 6}
            textAnchor="end"
            dominantBaseline="baseline"
            className="confq-zone-stamp confq-zone-stamp-warn"
            style={{ fontSize: '16px', opacity: 0.35 }}
          >Overconfident</text>
          
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line x1={x(0)} y1={y(tick)} x2={x(1)} y2={y(tick)} className="confq-gridline" />
              <text x={padLeft - 8} y={y(tick) + 4} textAnchor="end" className="confq-axis-label">{Math.round(tick * 100)}%</text>
              <text
                x={tick === 0 ? x(tick) + 2 : tick === 1 ? x(tick) - 2 : x(tick)}
                y={height - padBottom + 16}
                textAnchor={tick === 0 ? 'start' : tick === 1 ? 'end' : 'middle'}
                className="confq-axis-label"
              >
                {Math.round(tick * 100)}%
              </text>
            </g>
          ))}
          
          {/* Axis titles */}
          <text x={10} y={(padTop + height - padBottom) / 2} textAnchor="middle" className="confq-axis-title" transform={`rotate(-90 10 ${(padTop + height - padBottom) / 2})`}>
            Accuracy (%)
          </text>
          <text x={width / 2} y={height - 6} textAnchor="middle" className="confq-axis-title">
            Confidence (%)
          </text>

          {activeHint === 'ece' && (
            <path
              d={eceBandPath}
              style={{
                fill: 'rgba(59,130,246,0.12)',
                stroke: 'rgba(59,130,246,0.32)',
                strokeWidth: 1,
              }}
            >
              <title>{`Global ECE band: ±${(ece * 100).toFixed(1)}% around perfect calibration`}</title>
            </path>
          )}
          
          <path d={reliabilityPath} className="confq-reliability-line" />
          {chartBins.map((bin) => {
            const centerX = x(bin.avg_confidence);
            const centerY = y(bin.accuracy);
            const refY = y(bin.avg_confidence);
            const absGap = Math.abs(bin.accuracy - bin.avg_confidence);
            const isOver = bin.accuracy < bin.avg_confidence;
            const isWorst = !!worstBin && bin.start === worstBin.start;
            let lineOpacity = 0.4;
            let dotOpacity = 1;
            let lineStroke = 'rgba(148,163,184,0.75)';
            let lineStrokeWidth = activeHint === 'ece' ? 2.4 : 2;
            let dotStyle = { opacity: dotOpacity };

            if (activeHint === 'max') {
              lineOpacity = isWorst ? 1 : 0.15;
              dotOpacity = isWorst ? 1 : 0.2;
            } else if (activeHint === 'bias') {
              const targetIsOver = weightedBias >= 0;
              const inBiasDirection = targetIsOver ? isOver : !isOver;
              lineOpacity = inBiasDirection ? 1 : 0.18;
              dotOpacity = inBiasDirection ? 1 : 0.25;
            } else if (activeHint === 'std') {
              const heatRatio = absGap / maxAbsGap;
              const heatRed = Math.round(148 + (249 - 148) * heatRatio);
              const heatGreen = Math.round(163 + (115 - 163) * heatRatio);
              const heatBlue = Math.round(184 + (22 - 184) * heatRatio);
              lineOpacity = 0.3 + 0.7 * heatRatio;
              dotOpacity = 0.45 + 0.55 * heatRatio;
              lineStroke = `rgba(${heatRed},${heatGreen},${heatBlue},0.95)`;
              lineStrokeWidth = 1.6 + 2.4 * heatRatio;
              dotStyle = {
                opacity: dotOpacity,
                fill: `rgba(${heatRed},${heatGreen},${heatBlue},0.95)`,
                stroke: 'rgba(255,255,255,0.95)',
                strokeWidth: 0.8 + 1.2 * heatRatio,
              };
            } else if (activeHint === 'ece') {
              lineOpacity = 1;
              dotOpacity = 0.9;
            }

            if (activeHint !== 'std') {
              dotStyle = { opacity: dotOpacity };
            }

            return (
              <g key={`${bin.start}-${bin.end}`}>
                <line
                  x1={centerX}
                  y1={refY}
                  x2={centerX}
                  y2={centerY}
                  style={{
                    opacity: lineOpacity,
                    strokeWidth: lineStrokeWidth,
                    stroke: lineStroke,
                    strokeDasharray: '3 2',
                  }}
                >
                  <title>{`${bin.start.toFixed(1)}-${bin.end.toFixed(1)} | n=${bin.count} | conf ${(bin.avg_confidence * 100).toFixed(1)}% | acc ${(bin.accuracy * 100).toFixed(1)}%`}</title>
                </line>
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={(Math.max(2.5, Math.min(8, 2.5 + (bin.count / maxCount) * 5.5))).toFixed(2)}
                  className={`confq-bin-dot${activeHint === 'max' && worstBin && bin.start === worstBin.start ? ' confq-bin-dot-worst' : ''}`}
                  style={dotStyle}
                >
                  <title>{`${bin.start.toFixed(1)}-${bin.end.toFixed(1)} | n=${bin.count} | conf ${(bin.avg_confidence * 100).toFixed(1)}% | acc ${(bin.accuracy * 100).toFixed(1)}%${activeHint === 'max' && worstBin && bin.start === worstBin.start ? ' ← worst bin' : ''}`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function ConfidenceCalibrationCard({ confidenceQuality, activeHint, onMetricHover, onMetricLeave }) {
  if (!confidenceQuality || !confidenceQuality.n) return null;

  const bins = Array.isArray(confidenceQuality?.bins) ? confidenceQuality.bins : [];
  const ece = confidenceQuality.ece ?? 0;
  const avgConfidence = confidenceQuality.avg_confidence ?? 0;
  const accuracy = confidenceQuality.accuracy ?? 0;
  const maxGap = confidenceQuality.max_gap ?? 0;
  const worstBin = confidenceQuality.worst_bin || 'n/a';
  const bias = avgConfidence - accuracy;
  const status = confidenceQuality.status || (ece < 0.03 ? 'good' : ece >= 0.07 ? 'poor' : 'moderate');
  const statusLabel = { good: 'Calibrated', moderate: 'Moderate', poor: 'Needs calibration' }[status] ?? '';
  const biasCls = Math.abs(bias) < 0.005 ? '' : bias > 0 ? 'confq-metric-over' : 'confq-metric-under';
  const biasSign = bias > 0.005 ? '+' : '';

  let stdGap = 0;
  if (bins.length > 0) {
    const totalCount = bins.reduce((s, b) => s + b.count, 0);
    if (totalCount > 0) {
      const variance = bins.reduce((s, b) => {
        const w = b.count / totalCount;
        return s + w * Math.pow(b.gap - ece, 2);
      }, 0);
      stdGap = Math.sqrt(variance);
    }
  }

  // Dynamic sub-labels
  const eceSub = ece < 0.03 ? 'Well calibrated' : ece < 0.07 ? 'Moderate drift' : 'Poorly calibrated';
  const biasSub = Math.abs(bias) < 0.005 ? 'Neutral' : bias > 0 ? 'Overconfident' : 'Underconfident';
  const stdSub = stdGap < 0.04 ? 'Consistent' : stdGap < 0.08 ? 'Uneven' : 'Highly uneven';
  const maxSub = `Worst bin: ${worstBin}`;

  // Scenario detection
  const eceHigh = ece >= 0.07;
  const eceMod = ece >= 0.03 && ece < 0.07;
  const eceLow = ece < 0.03;
  const biasPos = bias > 0.02;
  const biasNeg = bias < -0.02;
  const stdHigh = stdGap >= 0.06;
  const maxHigh = maxGap >= 0.1;

  let scenario, scenarioCls, scenarioDesc;
  if (eceLow && !biasPos && !biasNeg && !stdHigh && !maxHigh) {
    scenario = 'Well calibrated';
    scenarioCls = 'confq-scenario-good';
    scenarioDesc = 'Confidence closely tracks accuracy across all ranges. Safe to use thresholds for auto-approval.';
  } else if ((eceHigh || eceMod) && biasPos && !stdHigh) {
    scenario = 'Uniformly overconfident';
    scenarioCls = 'confq-scenario-warn';
    scenarioDesc = 'Model is systematically too confident. Errors will slip through if you rely on its confidence score.';
  } else if ((eceHigh || eceMod) && biasNeg && !stdHigh) {
    scenario = 'Uniformly underconfident';
    scenarioCls = 'confq-scenario-warn';
    scenarioDesc = 'Model is systematically too conservative with confidence. You\'re rejecting items you should accept.';
  } else if (!eceHigh && stdHigh && maxHigh) {
    scenario = 'Locally broken';
    scenarioCls = 'confq-scenario-warn';
    scenarioDesc = 'ECE looks acceptable, but one confidence range is badly miscalibrated. Check the Reliability chart.';
  } else if (biasPos && stdHigh && maxHigh) {
    scenario = 'Overconfident in high range';
    scenarioCls = 'confq-scenario-danger';
    scenarioDesc = 'High-confidence predictions are the least reliable — the most dangerous pattern for auto-approval.';
  } else if (biasNeg && stdHigh) {
    scenario = 'Underconfident in low range';
    scenarioCls = 'confq-scenario-info';
    scenarioDesc = 'Low-confidence bins are overly pessimistic; raising the threshold would recover coverage safely.';
  } else if (eceHigh && stdHigh) {
    scenario = 'Broadly miscalibrated';
    scenarioCls = 'confq-scenario-danger';
    scenarioDesc = 'Both global error and variance are high. Confidence is unreliable as a routing signal.';
  } else {
    scenario = 'Mixed calibration';
    scenarioCls = 'confq-scenario-info';
    scenarioDesc = 'Some metrics are within range, but the combination suggests caution before relying on confidence thresholds.';
  }

  const eceTip = `ECE — Expected Calibration Error\nWeighted average gap between confidence and actual accuracy across all bins.\n\nGood (< 3%): Safe to set auto-approval thresholds.\nModerate (3–7%): Use thresholds cautiously.\nPoor (> 7%): Confidence is unreliable as a routing signal.`;
  const biasTip = `Bias = avg confidence − accuracy\nDirection of systematic miscalibration.\n\nPositive → Overconfident: model says 80%, gets 60% right.\nNegative → Underconfident: model says 50%, gets 70% right.\n~0 → Neutral: no systematic direction.`;
  const stdTip = `StdGap — Standard deviation of per-bin calibration gaps\nMeasures consistency of calibration across confidence ranges.\n\nLow: Error is uniform — predictable behaviour.\nHigh: Some ranges badly off while others are fine.\nInsidious: ECE can look OK while one slice is wildly overconfident.`;
  const maxTip = `MaxGap — Largest single-bin calibration error\nThe worst confidence bucket (${worstBin}).\n\nEven if ECE looks fine, a high MaxGap means one band is a blind spot.\nCheck the Reliability chart at this range to understand who is affected.`;

  return (
    <div className="confq-card confq-calibration-card">
      <div className="confq-card-header">
        <div className="confq-card-title-row">
          <span className="confq-card-title">Calibration Summary</span>
          <span className={`confq-inline-tag confq-tag-${status}`}>{statusLabel}</span>
        </div>
        <span className="confq-card-subtitle">ECE, bias, dispersion, and worst gap</span>
      </div>
      <div className="confq-metrics-grid">
        <div
          className="confq-metric-tile confq-has-tooltip"
          data-tooltip={eceTip}
          onMouseEnter={() => onMetricHover && onMetricHover('ece')}
          onMouseLeave={() => onMetricLeave && onMetricLeave()}
          style={activeHint === 'ece' ? { boxShadow: 'inset 0 0 0 2px rgba(59,130,246,0.5)' } : {}}
        >
          <span className="confq-metric-tile-label">ECE</span>
          <span className="confq-metric-tile-value">{pctMetric(ece)}</span>
          <span className="confq-metric-tile-sub">{eceSub}</span>
        </div>
        <div
          className={`confq-metric-tile confq-has-tooltip ${biasCls}`}
          data-tooltip={biasTip}
          onMouseEnter={() => onMetricHover && onMetricHover('bias')}
          onMouseLeave={() => onMetricLeave && onMetricLeave()}
          style={activeHint === 'bias' ? { boxShadow: 'inset 0 0 0 2px rgba(59,130,246,0.5)' } : {}}
        >
          <span className="confq-metric-tile-label">Bias</span>
          <span className="confq-metric-tile-value">{biasSign}{pctMetric(bias)}</span>
          <span className="confq-metric-tile-sub">{biasSub}</span>
        </div>
        <div
          className="confq-metric-tile confq-has-tooltip"
          data-tooltip={stdTip}
          onMouseEnter={() => onMetricHover && onMetricHover('std')}
          onMouseLeave={() => onMetricLeave && onMetricLeave()}
          style={activeHint === 'std' ? { boxShadow: 'inset 0 0 0 2px rgba(59,130,246,0.5)' } : {}}
        >
          <span className="confq-metric-tile-label">StdGap</span>
          <span className="confq-metric-tile-value">{pctMetric(stdGap)}</span>
          <span className="confq-metric-tile-sub">{stdSub}</span>
        </div>
        <div
          className="confq-metric-tile confq-has-tooltip"
          data-tooltip={maxTip}
          onMouseEnter={() => onMetricHover && onMetricHover('max')}
          onMouseLeave={() => onMetricLeave && onMetricLeave()}
          style={activeHint === 'max' ? { boxShadow: 'inset 0 0 0 2px rgba(59,130,246,0.5)' } : {}}
        >
          <span className="confq-metric-tile-label">MaxGap</span>
          <span className="confq-metric-tile-value">{pctMetric(maxGap)}</span>
          <span className="confq-metric-tile-sub">{maxSub}</span>
        </div>
      </div>
      <div className={`confq-scenario ${scenarioCls}`}>
        <span className="confq-scenario-label">{scenario}</span>
        <span className="confq-scenario-desc">{scenarioDesc}</span>
      </div>
    </div>
  );
}

function ConfidenceDecisionFrontier({ confidenceQuality }) {
  const bins = Array.isArray(confidenceQuality?.bins) ? confidenceQuality.bins : [];
  if (bins.length === 0) return <div className="matrix-empty">No threshold data</div>;

  const total = confidenceQuality.n || bins.reduce((sum, bin) => sum + bin.count, 0);
  const thresholds = [0.3, 0.5, 0.7, 0.9];
  const points = thresholds.map((threshold) => {
    const coveredBins = bins.filter((bin) => bin.avg_confidence >= threshold);
    const coveredCount = coveredBins.reduce((sum, bin) => sum + bin.count, 0);
    const weightedAcc = coveredCount > 0
      ? coveredBins.reduce((sum, bin) => sum + bin.accuracy * bin.count, 0) / coveredCount
      : 0;
    const manualLoad = total > 0 ? 1 - (coveredCount / total) : 0;
    return {
      threshold,
      coverage: total > 0 ? coveredCount / total : 0,
      accuracy: weightedAcc,
      manualLoad,
      coveredCount,
    };
  });

  const width = 620;
  const height = 480;
  const padLeft = 56;
  const padRight = 22;
  const padTop = 30;
  const padBottom = 44;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const x = (v) => padLeft + v * innerW;
  const y = (v) => height - padBottom - v * innerH;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.manualLoad).toFixed(2)} ${y(p.accuracy).toFixed(2)}`)
    .join(' ');

  // Recommended operating point: minimize review load while staying close to perfect accuracy.
  const recommended = points.reduce((best, p) => {
    const score = Math.hypot(p.manualLoad, 1 - p.accuracy);
    if (!best || score < best.score) return { ...p, score };
    return best;
  }, null);

  return (
    <div className="confq-card">
      <div className="confq-card-header">
        <span className="confq-card-title">Decision Frontier</span>
        <span className="confq-card-subtitle">Human review % vs accepted-set accuracy — per confidence threshold</span>
      </div>
      <div className="confq-plot-wrap confq-plot-wrap-fill">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="confq-plot" role="img" aria-label="Threshold decision frontier chart">
          <rect
            x={x(0)}
            y={y(1)}
            width={x(0.65) - x(0)}
            height={y(0.65) - y(1)}
            className="confq-zone-tradeoff"
          />
          <rect
            x={x(0)}
            y={y(1)}
            width={x(0.4) - x(0)}
            height={y(0.85) - y(1)}
            className="confq-zone-good"
          />
          <rect
            x={x(0.65)}
            y={y(0.7)}
            width={x(1) - x(0.65)}
            height={y(0) - y(0.7)}
            className="confq-zone-risk"
          />

          {/* Zone stamp labels — centered in each region */}
          <text
            x={(x(0) + x(0.4)) / 2}
            y={(y(1) + y(0.85)) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="confq-zone-stamp confq-zone-stamp-good"
            style={{ fontSize: '16px', opacity: 0.35 }}
          >Optimal</text>
          <text
            x={(x(0) + x(0.65)) / 2}
            y={y(0.72)}
            textAnchor="middle"
            dominantBaseline="middle"
            className="confq-zone-stamp confq-zone-stamp-tradeoff"
            style={{ fontSize: '16px', opacity: 0.35 }}
          >Tradeoff</text>
          <text
            x={(x(0.65) + x(1)) / 2}
            y={(y(0.7) + y(0)) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="confq-zone-stamp confq-zone-stamp-risk"
            style={{ fontSize: '16px', opacity: 0.35 }}
          >Risk</text>

          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line x1={x(0)} y1={y(tick)} x2={x(1)} y2={y(tick)} className="confq-gridline" />
              <line x1={x(tick)} y1={y(0)} x2={x(tick)} y2={y(1)} className="confq-gridline" />
              <text x={padLeft - 8} y={y(tick) + 4} textAnchor="end" className="confq-axis-label">{Math.round(tick * 100)}%</text>
              <text
                x={tick === 0 ? x(tick) + 2 : tick === 1 ? x(tick) - 2 : x(tick)}
                y={y(0) + 24}
                textAnchor={tick === 0 ? 'start' : tick === 1 ? 'end' : 'middle'}
                className="confq-axis-label"
              >
                {Math.round(tick * 100)}%
              </text>
            </g>
          ))}

          <text x={14} y={(padTop + height - padBottom) / 2} textAnchor="middle" className="confq-axis-title" transform={`rotate(-90 14 ${(padTop + height - padBottom) / 2})`}>
            Accuracy (%)
          </text>
          <text x={width / 2} y={height - 4} textAnchor="middle" className="confq-axis-title">
            Human review %
          </text>

          <path d={pathD} className="confq-frontier-line" />

          {recommended && (
            <g>
              <line
                x1={x(recommended.manualLoad)}
                y1={y(recommended.accuracy)}
                x2={x(recommended.manualLoad)}
                y2={y(0)}
                className="confq-reco-guide"
              />
              <line
                x1={x(0)}
                y1={y(recommended.accuracy)}
                x2={x(recommended.manualLoad)}
                y2={y(recommended.accuracy)}
                className="confq-reco-guide"
              />
            </g>
          )}

          {points.map((p) => {
            const isRecommended = recommended && p.threshold === recommended.threshold;
            const labelY = padTop - 6 - ((Math.round(p.threshold * 10) % 3) * 14);
            return (
              <g key={p.threshold}>
                <line
                  x1={x(p.manualLoad)}
                  y1={padTop}
                  x2={x(p.manualLoad)}
                  y2={y(0)}
                  className="confq-drop-line"
                  strokeDasharray="3 2"
                />
                <text
                  x={x(p.manualLoad)}
                  y={labelY}
                  textAnchor="middle"
                  className="confq-frontier-label"
                >
                  t={Math.round(p.threshold * 100)}%
                </text>
                <circle
                  cx={x(p.manualLoad)}
                  cy={y(p.accuracy)}
                  r="5"
                  className="confq-frontier-dot"
                />
                {isRecommended && (
                  <circle
                    cx={x(p.manualLoad)}
                    cy={y(p.accuracy)}
                    r="9"
                    className="confq-frontier-dot-recommended"
                  />
                )}
                <title>{`Threshold ${p.threshold.toFixed(1)} | coverage ${(p.coverage * 100).toFixed(1)}% | human review ${(p.manualLoad * 100).toFixed(1)}% | accuracy ${(p.accuracy * 100).toFixed(1)}% | error ${((1 - p.accuracy) * 100).toFixed(1)}% | n=${p.coveredCount}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="confq-frontier-legend">
        <span><span className="confq-frontier-swatch confq-frontier-swatch-line" /> frontier</span>
        <span><span className="confq-frontier-swatch confq-frontier-swatch-dot" /> threshold points</span>
        <span><span className="confq-frontier-swatch confq-frontier-swatch-reco" /> recommended</span>
      </div>
    </div>
  );
}

function ConfidenceQualityPanel({ confidenceQuality }) {
  if (!confidenceQuality || !confidenceQuality.n) return null;

  const [activeHint, setActiveHint] = useState(null);

  return (
    <div className="confq-panel">
      <div className="confq-panel-row">
        <div className="confq-col confq-col-50">
          <div className="confq-left-col">
            <ConfidenceCalibrationCard
              confidenceQuality={confidenceQuality}
              activeHint={activeHint}
              onMetricHover={setActiveHint}
              onMetricLeave={() => setActiveHint(null)}
            />
            <ReliabilityPlot bins={confidenceQuality.bins} activeHint={activeHint} />
          </div>
        </div>
        <div className="confq-col confq-col-50">
          <ConfidenceDecisionFrontier confidenceQuality={confidenceQuality} />
        </div>
      </div>
    </div>
  );
}

function ConfidenceInlineSummary({ confidenceQuality, onOpenDetails }) {
  if (!confidenceQuality || !confidenceQuality.n) return null;

  const bins = Array.isArray(confidenceQuality.bins) ? confidenceQuality.bins : [];
  const total = confidenceQuality.n || bins.reduce((sum, bin) => sum + bin.count, 0);
  const ece = confidenceQuality.ece ?? 0;
  const status = confidenceQuality.status || (ece < 0.03 ? 'good' : ece >= 0.07 ? 'poor' : 'moderate');
  const statusText = {
    good: 'Calibration: Good',
    moderate: 'Calibration: Moderate',
    poor: 'Calibration: Needs work',
  }[status] || 'Calibration: Moderate';

  const thresholds = [0.3, 0.5, 0.7, 0.9];
  const points = thresholds.map((threshold) => {
    const coveredBins = bins.filter((bin) => bin.avg_confidence >= threshold);
    const coveredCount = coveredBins.reduce((sum, bin) => sum + bin.count, 0);
    const weightedAcc = coveredCount > 0
      ? coveredBins.reduce((sum, bin) => sum + bin.accuracy * bin.count, 0) / coveredCount
      : 0;
    const manualLoad = total > 0 ? 1 - (coveredCount / total) : 0;
    return { threshold, accuracy: weightedAcc, manualLoad };
  });

  const advised = points.reduce((best, p) => {
    const score = Math.hypot(p.manualLoad, 1 - p.accuracy);
    return !best || score < best.score ? { ...p, score } : best;
  }, null);

  return (
    <div className="confq-inline-summary" role="region" aria-label="Confidence quality summary">
      <span className={`confq-inline-pill confq-inline-pill-${status}`}>{statusText}</span>
      <span className="confq-inline-item" title="Average gap between confidence and accuracy. Lower is better.">
        ECE: {pctMetric(ece)}
      </span>
      <span className="confq-inline-sep">|</span>
      <span className="confq-inline-item" title="Threshold that best balances model error and manual review load.">
        Advised threshold: {Math.round((advised?.threshold ?? 0) * 100)}%
      </span>
      <span className="confq-inline-sep">|</span>
      <span className="confq-inline-item" title="Share of records sent to manual review at the advised threshold.">
        Human review: {Math.round((advised?.manualLoad ?? 0) * 100)}%
      </span>
      <button className="confq-inline-btn" onClick={onOpenDetails}>Calibration details</button>
    </div>
  );
}

/* ── TypeHealthGrid ──────────────────────────────────────── */
function TypeHealthGrid({
  typeHealth, confidenceQuality, calibrationPerType, typeHealth2, compareTypeHealth,
  runId, runId2, run1Name, run2Name,
  onViewRecords, activeSubtype,
  correctnessFilter, onCorrectnessFilter,
  compareFilter, onCompareFilter,
  isUnknowns,
}) {
  const [expandedType, setExpandedType] = useState(null);
  const [transitionView, setTransitionView] = useState('type-transition');
  const [confidenceModalOpen, setConfidenceModalOpen] = useState(false);
  const [typeSectionExpanded, setTypeSectionExpanded] = useState(true);
  const [sortCol, setSortCol] = useState('f1');
  const [sortDir, setSortDir] = useState('asc');
  const isCompare = !!runId2;

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const sortArrow = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  // Build calibration map: type -> { ece, status }
  const calibrationMap = {};
  if (Array.isArray(calibrationPerType)) {
    calibrationPerType.forEach(c => { calibrationMap[c.type] = c; });
  }

  useEffect(() => {
    if (isCompare) setTransitionView('type-transition');
  }, [isCompare, runId2]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setConfidenceModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  const sortedTypeHealth = [...typeHealth].sort((a, b) => {
    let av, bv;
    if (sortCol === 'type') { av = a.type || ''; bv = b.type || ''; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
    if (sortCol === 'f1')  { av = a.f1 ?? a.accuracy ?? -1; bv = b.f1 ?? b.accuracy ?? -1; }
    if (sortCol === 'ece') { av = calibrationMap[a.type]?.ece ?? 999; bv = calibrationMap[b.type]?.ece ?? 999; }
    return sortDir === 'asc' ? av - bv : bv - av;
  });

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
      {!isCompare && (
        <>
          <ConfidenceInlineSummary
            confidenceQuality={confidenceQuality}
            onOpenDetails={() => setConfidenceModalOpen(true)}
          />

          {confidenceModalOpen && (
            <div className="confq-modal-backdrop" onClick={() => setConfidenceModalOpen(false)} role="presentation">
              <div className="confq-modal" role="dialog" aria-modal="true" aria-label="Confidence quality details" onClick={(e) => e.stopPropagation()}>
                <div className="confq-modal-header">
                  <div>
                    <div className="confq-modal-title">Confidence Quality</div>
                    <div className="confq-modal-subtitle">Deep dive: calibration, reliability, and threshold tradeoff</div>
                  </div>
                  <button className="confq-modal-close" onClick={() => setConfidenceModalOpen(false)} aria-label="Close confidence details">Close</button>
                </div>
                <ConfidenceQualityPanel confidenceQuality={confidenceQuality} />
              </div>
            </div>
          )}
        </>
      )}

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

      <CollapsibleSection
        title={isCompare ? 'Type Comparison' : 'Type Accuracy'}
        subtitle={isCompare ? 'Compare type-level outcomes across runs' : 'Explore per-type accuracy, confusion, and subtype detail'}
        expanded={typeSectionExpanded}
        onToggle={() => setTypeSectionExpanded(prev => !prev)}
        extraClassName="type-main-section"
      >
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
                      ))}
                </div>
              </div>

              <div className={`th-col-header${isCompare ? ' th-col-header-cmp' : ''}`}>
                <span className="th-col-expand" />
                <span className="th-col-label th-col-sortable" onClick={() => !isCompare && handleSort('type')} style={!isCompare ? { cursor: 'pointer' } : {}}>
                  True Type{!isCompare && sortArrow('type')}
                </span>
                {isCompare ? (
                  <>
                    <span className="th-col-f1">F1</span>
                    <span className="th-col-changes">Changes</span>
                    <span className="th-col-count">#</span>
                  </>
                ) : (
                  <>
                    <span className="th-col-f1 th-col-sortable" onClick={() => handleSort('f1')} style={{ cursor: 'pointer' }} title="Sort by F1">
                      F1{sortArrow('f1')}
                    </span>
                    <span className="th-col-ece th-col-sortable" onClick={() => handleSort('ece')} style={{ cursor: 'pointer' }} title="Expected Calibration Error — lower is better">
                      ECE{sortArrow('ece')}
                    </span>
                    <span className="th-col-count">#</span>
                  </>
                )}
                <span className="th-col-bar">Breakdown</span>
              </div>
            </div>

            <div className="th-list">
              {sortedTypeHealth.map(t => {
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
                    calibration={calibrationMap[t.type] || null}
                  />
                );
              })}
            </div>
          </>
        )}
      </CollapsibleSection>
    </div>
  );
}

export default TypeHealthGrid;
