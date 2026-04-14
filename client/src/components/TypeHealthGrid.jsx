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

function SubtypeConfusionMatrix({ runId, trueType, onViewRecords }) {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPct, setShowPct] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/subtype-confusion?run_id=${runId}&true_type=${encodeURIComponent(trueType)}`)
      .then(r => r.json())
      .then(d => { setMatrix(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [runId, trueType]);

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
                      className={`scm-cell ${isDiag ? 'scm-diag' : count > 0 ? 'scm-err scm-cell-clickable' : ''} ${col.isCrossType ? 'scm-cell-cross' : ''} ${i === firstCrossIdx ? 'scm-col-first-cross' : ''}`}
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
  const maxCount = Math.max(...rows.flatMap(r => columns.map(c => r.preds[c.subtype] || 0)));

  // Filter to cells that have count >= minCount (for off-diagonal)
  const hasAnyVisible = rows.some(r =>
    columns.some(c => {
      const count = r.preds[c.subtype] || 0;
      return count >= minCount;
    })
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
        <label className="stm-slider-label">
          Min cells:
          <input
            type="range"
            className="stm-slider"
            min={1}
            max={Math.max(1, maxCount)}
            value={minCount}
            onChange={e => setMinCount(parseInt(e.target.value))}
          />
          <span className="stm-slider-val">{minCount}</span>
        </label>
        <span className="scm-legend">
          <span className="scm-legend-swatch stm-swatch-agree" /> both same
          <span className="scm-legend-swatch stm-swatch-r1win" /> {run1Name || 'Run 1'} better
          <span className="scm-legend-swatch stm-swatch-r2win" /> {run2Name || 'Run 2'} better
          <span className="scm-legend-swatch stm-swatch-disagree" /> both wrong
        </span>
      </div>
      {!hasAnyVisible && (
        <div className="matrix-empty">No cells ≥ {minCount} records — lower the slider</div>
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
                {columns.map(c => (
                  <th key={c.subtype} className="scm-col-head stm-col-head" title={c.subtype}>
                    {c.subtype}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const rowHasVisible = columns.some(c => (row.preds[c.subtype] || 0) >= minCount);
                if (!rowHasVisible) return null;
                return (
                  <tr key={row.run1_pred}>
                    <td className="scm-row-head" title={row.run1_pred}>
                      <button className="scm-row-label" onClick={() => onViewRecords(row.run1_pred, null)}>
                        {row.run1_pred}
                      </button>
                    </td>
                    {columns.map(col => {
                      const count = row.preds[col.subtype] || 0;
                      if (count < minCount) return <td key={col.subtype} className="scm-cell stm-cell-empty" />;
                      const isDiag = col.subtype === row.run1_pred;
                      const intensity = maxCount > 0 ? count / maxCount : 0;
                      const display = showPct
                        ? (count ? (count / row.total * 100).toFixed(0) + '%' : '')
                        : count;
                      // Diagonal: both predict same subtype. Is it correct? Check via subtype name vs trueType context - we don't have that here,
                      // so color by outcome: diagonal cells = agreement, off-diagonal = disagreement
                      // Color: diagonal = green if on run1 true-subtype matches, but we don't know true_subtype here...
                      // Use a simpler heuristic: diagonal = agreement (gray-green), off-diagonal = disagreement (orange/teal)
                      const bgColor = isDiag
                        ? `rgba(100,180,120,${0.15 + intensity * 0.65})`
                        : `rgba(200,120,60,${0.15 + intensity * 0.65})`;
                      return (
                        <td
                          key={col.subtype}
                          className={`scm-cell stm-cell ${isDiag ? 'stm-diag' : 'stm-diff scm-cell-clickable'}`}
                          style={count > 0 ? { background: bgColor } : {}}
                          title={`${run1Name || 'Run 1'}: ${row.run1_pred} → ${run2Name || 'Run 2'}: ${col.subtype}: ${count} — click to view`}
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

/* ── TypeCard (single mode) ──────────────────────────────── */
function TypeCard({ typeData, typeData2, isExpanded, isDimmed, correctnessFilter, onClick, widthPx }) {
  const { f1, accuracy, cross_type_rate, total, correct, cross_type_wrong, same_type_wrong } = typeData;
  const sev = severityClass(f1, cross_type_rate);

  const correctPct   = (correct / total) * 100;
  const samePct      = (same_type_wrong / total) * 100;
  const crossPct     = (cross_type_wrong / total) * 100;

  const delta = typeData2 ? typeData2.f1 - f1 : null;

  const filteredCount = correctnessFilter === 'correct'    ? correct
                      : correctnessFilter === 'same_type'  ? same_type_wrong
                      : correctnessFilter === 'cross_type' ? cross_type_wrong
                      : null;
  const filteredPct   = filteredCount !== null ? (filteredCount / total) * 100 : null;

  return (
    <button
      className={`type-card ${sev} ${isExpanded ? 'expanded' : ''} ${isDimmed ? 'type-card-dimmed' : ''}`}
      style={{ width: `${widthPx}px` }}
      onClick={onClick}
    >
      <div className="type-card-name">{typeData.type}</div>

      <div className="type-card-accuracy">
        {filteredPct !== null
          ? <><span className={`type-card-filtered-pct pct-${correctnessFilter}`}>{filteredPct.toFixed(1)}%</span><span className="type-card-filtered-of"> of {total}</span></>
          : <>{pctNum(f1)}%{typeData2 && <DeltaBadge delta={delta} />}</>
        }
      </div>

      <div className="type-card-bar" title={`F1: ${pctNum(f1)}% · Correct: ${pct(accuracy)} · Same-type wrong: ${pct(same_type_wrong/total)} · Cross-type: ${pct(cross_type_rate)}`}>
        <div className="bar-correct"   style={{ width: `${correctPct}%`,  opacity: !correctnessFilter || correctnessFilter === 'correct'    ? 1 : 0.15 }} />
        <div className="bar-same-type" style={{ width: `${samePct}%`,     opacity: !correctnessFilter || correctnessFilter === 'same_type'  ? 1 : 0.15 }} />
        <div className="bar-cross-type" style={{ width: `${crossPct}%`,   opacity: !correctnessFilter || correctnessFilter === 'cross_type' ? 1 : 0.15 }} />
      </div>

      <div className="type-card-meta">
        <span>{filteredCount !== null ? `${filteredCount.toLocaleString()} / ${total.toLocaleString()}` : total.toLocaleString()} records</span>
        {cross_type_wrong > 0 && !correctnessFilter && <span className="type-card-cross-flag">⚠ cross-type</span>}
      </div>
    </button>
  );
}

/* ── TypeCardCompare ─────────────────────────────────────── */
function TypeCardCompare({ typeData, compareData, isExpanded, isDimmed, compareFilter, onClick, widthPx }) {
  const { type, f1, total } = typeData;
  const sev = severityClass(f1, typeData.cross_type_rate);

  const bc  = compareData ? compareData.both_correct  : 0;
  const r1  = compareData ? compareData.run1_only      : 0;
  const r2  = compareData ? compareData.run2_only      : 0;
  const bw  = compareData ? compareData.both_wrong     : 0;
  const tot = compareData ? (bc + r1 + r2 + bw) : total;

  const bcPct = tot > 0 ? (bc / tot) * 100 : 0;
  const r1Pct = tot > 0 ? (r1 / tot) * 100 : 0;
  const r2Pct = tot > 0 ? (r2 / tot) * 100 : 0;
  const bwPct = tot > 0 ? (bw / tot) * 100 : 0;

  const filteredCount = compareFilter === 'both_correct' ? bc
                      : compareFilter === 'run1_only'    ? r1
                      : compareFilter === 'run2_only'    ? r2
                      : compareFilter === 'both_wrong'   ? bw
                      : null;
  const filteredPct = filteredCount !== null ? (filteredCount / tot) * 100 : null;

  const opacityFor = (key) => !compareFilter || compareFilter === key ? 1 : 0.15;

  return (
    <button
      className={`type-card ${sev} ${isExpanded ? 'expanded' : ''} ${isDimmed ? 'type-card-dimmed' : ''}`}
      style={{ width: `${widthPx}px` }}
      onClick={onClick}
    >
      <div className="type-card-name">{type}</div>

      <div className="type-card-accuracy">
        {filteredPct !== null
          ? <><span className={`type-card-filtered-pct cmp-pct-${compareFilter}`}>{filteredPct.toFixed(1)}%</span><span className="type-card-filtered-of"> of {tot}</span></>
          : <>{pctNum(f1)}%</>
        }
      </div>

      <div className="type-card-bar" title={`F1: ${pctNum(f1)}% · Both correct: ${bcPct.toFixed(0)}% · Run1 only: ${r1Pct.toFixed(0)}% · Run2 only: ${r2Pct.toFixed(0)}% · Both wrong: ${bwPct.toFixed(0)}%`}>
        <div className="bar-cmp-both-correct" style={{ width: `${bcPct}%`, opacity: opacityFor('both_correct') }} />
        <div className="bar-cmp-run1-only"    style={{ width: `${r1Pct}%`, opacity: opacityFor('run1_only') }} />
        <div className="bar-cmp-run2-only"    style={{ width: `${r2Pct}%`, opacity: opacityFor('run2_only') }} />
        <div className="bar-cmp-both-wrong"   style={{ width: `${bwPct}%`, opacity: opacityFor('both_wrong') }} />
      </div>

      <div className="type-card-meta">
        <span>{filteredCount !== null ? `${filteredCount.toLocaleString()} / ${tot.toLocaleString()}` : tot.toLocaleString()} records</span>
      </div>
    </button>
  );
}

/* ── TypeHealthGrid ──────────────────────────────────────── */
function TypeHealthGrid({
  typeHealth, typeHealth2, compareTypeHealth,
  runId, runId2, run1Name, run2Name,
  onViewRecords, activeSubtype,
  correctnessFilter, onCorrectnessFilter,
  compareFilter, onCompareFilter,
}) {
  const [expandedType, setExpandedType] = useState(null);
  const isCompare = !!runId2;

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
    if (!correctnessFilter) return true;
    if (correctnessFilter === 'correct')    return t.correct > 0;
    if (correctnessFilter === 'same_type')  return t.same_type_wrong > 0;
    if (correctnessFilter === 'cross_type') return t.cross_type_wrong > 0;
    return true;
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
    if (!correctnessFilter) return true;
    if (correctnessFilter === 'correct')    return st.correct > 0;
    if (correctnessFilter === 'same_type')  return (st.total - st.correct - st.cross_type) > 0;
    if (correctnessFilter === 'cross_type') return st.cross_type > 0;
    return true;
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
                className={`legend-btn ${correctnessFilter === l.key ? 'legend-btn-active' : ''}`}
                onClick={() => onCorrectnessFilter(l.key)}
              >
                <span className={`legend-swatch ${l.cls}`} />
                {l.label}
              </button>
            ))
        }
      </div>

      <div className="type-grid">
        {typeHealth.map(t => {
          const tot = isCompare
            ? (() => { const cd = compareMap[t.type]; return cd ? (cd.both_correct + cd.run1_only + cd.run2_only + cd.both_wrong) : t.total; })()
            : t.total;
          const widthPx = Math.round(100 + (tot / maxTotal) * 140);
          return isCompare
            ? <TypeCardCompare
                key={t.type}
                typeData={t}
                compareData={compareMap[t.type] || null}
                isExpanded={expandedType === t.type}
                isDimmed={!cardMatchesCompareFilter(t)}
                compareFilter={compareFilter}
                onClick={() => handleCardClick(t.type)}
                widthPx={widthPx}
              />
            : <TypeCard
                key={t.type}
                typeData={t}
                typeData2={typeMap2[t.type] || null}
                isExpanded={expandedType === t.type}
                isDimmed={!cardMatchesFilter(t)}
                correctnessFilter={correctnessFilter}
                onClick={() => handleCardClick(t.type)}
                widthPx={widthPx}
              />;
        })}
      </div>

      {expandedData && (
        <TypeDetailPanel
          typeData={expandedData}
          typeData2={expandedData2}
          runId={runId}
          runId2={isCompare ? runId2 : null}
          run1Name={run1Name}
          run2Name={run2Name}
          compareFilter={compareFilter}
          onViewRecords={(subtype, predSubtype, run1PredSubtype, run2PredSubtype) => {
            onViewRecords(expandedType, subtype, predSubtype, run1PredSubtype, run2PredSubtype);
          }}
          onClose={() => setExpandedType(null)}
          activeSubtype={activeSubtype}
          badgeMatchesFilter={badgeMatchesFilter}
        />
      )}
    </div>
  );
}

export default TypeHealthGrid;
