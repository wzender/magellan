import React, { useState } from 'react';

/* ── helpers ─────────────────────────────────────────────── */
function pct(n) { return (n * 100).toFixed(0) + '%'; }
function pctNum(n) { return (n * 100).toFixed(1); }

function severityClass(accuracy, crossTypeRate) {
  if (crossTypeRate > 0.3) return 'severity-critical';
  if (accuracy >= 0.5)     return 'severity-good';
  if (accuracy >= 0.2)     return 'severity-warn';
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
      title={`${st.subtype} · ${st.total} records · ${pctNum(st.accuracy)}% correct`}
    >
      <div className="sbadge-top">
        <span className="sbadge-name">{st.subtype}</span>
        <span className="sbadge-acc">{pctNum(st.accuracy)}%</span>
        {delta !== undefined && <DeltaBadge delta={delta} />}
      </div>
      <div className="sbadge-bar">
        <div className="bar-correct"    style={{ width: `${correctPct}%` }} />
        <div className="bar-same-type"  style={{ width: `${samePct}%` }} />
        <div className="bar-cross-type" style={{ width: `${crossPct}%` }} />
      </div>
    </button>
  );
}

/* ── TypeDetailPanel ─────────────────────────────────────── */
function TypeDetailPanel({ typeData, typeData2, onViewRecords, onClose, activeSubtype, badgeMatchesFilter }) {
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
            <span className="stat-correct">{pct(typeData.accuracy)} correct</span>
            {typeData.cross_type_wrong > 0 && (
              <span className="stat-critical"> &nbsp;·&nbsp; ⚠ {pct(typeData.cross_type_rate)} cross-type</span>
            )}
          </span>
        </div>
        <div className="type-detail-actions">
          <button className="btn-view-records" onClick={() => onViewRecords(null)}>
            All {typeData.type} records
          </button>
          <button className="btn-close-detail" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="subtype-badge-list">
        {typeData.subtypes.map(st => {
          const st2   = subtypeMap2[st.subtype];
          const delta = st2 ? st2.accuracy - st.accuracy : undefined;
          return (
            <SubtypeBadge
              key={st.subtype}
              st={st}
              delta={typeData2 ? delta : undefined}
              isActive={activeSubtype === st.subtype}
              isDimmed={badgeMatchesFilter ? !badgeMatchesFilter(st) : false}
              onViewRecords={(subtype) => onViewRecords(subtype)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── TypeCard ────────────────────────────────────────────── */
function TypeCard({ typeData, typeData2, isExpanded, isDimmed, onClick }) {
  const { accuracy, cross_type_rate, total, correct, cross_type_wrong, same_type_wrong } = typeData;
  const sev = severityClass(accuracy, cross_type_rate);

  const correctPct   = (correct / total) * 100;
  const samePct      = (same_type_wrong / total) * 100;
  const crossPct     = (cross_type_wrong / total) * 100;

  const delta = typeData2 ? typeData2.accuracy - accuracy : null;

  return (
    <button
      className={`type-card ${sev} ${isExpanded ? 'expanded' : ''} ${isDimmed ? 'type-card-dimmed' : ''}`}
      onClick={onClick}
    >
      <div className="type-card-name">{typeData.type}</div>

      <div className="type-card-accuracy">
        {pctNum(accuracy)}%
        {typeData2 && <DeltaBadge delta={delta} />}
      </div>

      <div className="type-card-bar" title={`Correct: ${pct(accuracy)} · Same-type wrong: ${pct(same_type_wrong/total)} · Cross-type: ${pct(cross_type_rate)}`}>
        <div className="bar-correct"   style={{ width: `${correctPct}%` }} />
        <div className="bar-same-type" style={{ width: `${samePct}%` }} />
        <div className="bar-cross-type" style={{ width: `${crossPct}%` }} />
      </div>

      <div className="type-card-meta">
        <span>{total} records</span>
        {cross_type_wrong > 0 && <span className="type-card-cross-flag">⚠ cross-type</span>}
      </div>
    </button>
  );
}

/* ── TypeHealthGrid ──────────────────────────────────────── */
function TypeHealthGrid({ typeHealth, typeHealth2, onViewRecords, activeSubtype, correctnessFilter, onCorrectnessFilter }) {
  const [expandedType, setExpandedType] = useState(null);

  const typeMap2 = {};
  if (typeHealth2) {
    typeHealth2.forEach(t => { typeMap2[t.type] = t; });
  }

  const handleCardClick = (typeName) => {
    setExpandedType(prev => prev === typeName ? null : typeName);
  };

  const expandedData  = typeHealth.find(t => t.type === expandedType);
  const expandedData2 = typeMap2[expandedType] || null;

  /* dim cards that have zero records in the active filter category */
  function cardMatchesFilter(t) {
    if (!correctnessFilter) return true;
    if (correctnessFilter === 'correct')    return t.correct > 0;
    if (correctnessFilter === 'same_type')  return t.same_type_wrong > 0;
    if (correctnessFilter === 'cross_type') return t.cross_type_wrong > 0;
    return true;
  }

  /* dim badges that have zero records in the active filter category */
  function badgeMatchesFilter(st) {
    if (!correctnessFilter) return true;
    if (correctnessFilter === 'correct')    return st.correct > 0;
    if (correctnessFilter === 'same_type')  return (st.total - st.correct - st.cross_type) > 0;
    if (correctnessFilter === 'cross_type') return st.cross_type > 0;
    return true;
  }

  const LEGEND = [
    { key: 'correct',    label: 'Correct',          cls: 'swatch-correct' },
    { key: 'same_type',  label: 'Same-type wrong',  cls: 'swatch-same-type' },
    { key: 'cross_type', label: 'Cross-type (severe)', cls: 'swatch-cross-type' },
  ];

  return (
    <div className="type-health-section">
      <div className="type-grid-legend">
        {LEGEND.map(l => (
          <button
            key={l.key}
            className={`legend-btn ${correctnessFilter === l.key ? 'legend-btn-active' : ''}`}
            onClick={() => onCorrectnessFilter(l.key)}
          >
            <span className={`legend-swatch ${l.cls}`} />
            {l.label}
          </button>
        ))}
      </div>

      <div className="type-grid">
        {typeHealth.map(t => (
          <TypeCard
            key={t.type}
            typeData={t}
            typeData2={typeMap2[t.type] || null}
            isExpanded={expandedType === t.type}
            isDimmed={!cardMatchesFilter(t)}
            onClick={() => handleCardClick(t.type)}
          />
        ))}
      </div>

      {expandedData && (
        <TypeDetailPanel
          typeData={expandedData}
          typeData2={expandedData2}
          onViewRecords={(subtype) => onViewRecords(expandedType, subtype)}
          onClose={() => setExpandedType(null)}
          activeSubtype={activeSubtype}
          badgeMatchesFilter={badgeMatchesFilter}
        />
      )}
    </div>
  );
}

export default TypeHealthGrid;
