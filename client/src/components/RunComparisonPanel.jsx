import React, { useState, useMemo } from 'react';
import RowLevelTable from './RowLevelTable';

function DirectionCounts({ improved, regressed, lateral }) {
  return (
    <span className="direction-counts">
      {improved > 0 && <span className="dir-improved" title="Run 2 newly correct">↑{improved}</span>}
      {regressed > 0 && <span className="dir-regressed" title="Run 1 correct, run 2 regressed">↓{regressed}</span>}
      {lateral > 0 && <span className="dir-lateral" title="Both wrong, differently">↔{lateral}</span>}
    </span>
  );
}

function RunComparisonPanel({ allRecordsData, selectedRunNames, loading }) {
  const [expandedCrossKey, setExpandedCrossKey] = useState(null);
  const [expandedCrossPair, setExpandedCrossPair] = useState(null);
  const [expandedWithinKey, setExpandedWithinKey] = useState(null);
  const [expandedWithinPair, setExpandedWithinPair] = useState(null);
  const [sectionFilter, setSectionFilter] = useState(null); // null | 'cross' | 'within'
  const [dirFilter, setDirFilter] = useState(null);         // null | 'improved' | 'regressed' | 'lateral'

  const runA = selectedRunNames[0] || 'Run A';
  const runB = selectedRunNames[1] || 'Run B';

  const { withinTypeGroups, crossTypeGroups, summary } = useMemo(() => {
    if (!allRecordsData?.data) {
      return { withinTypeGroups: [], crossTypeGroups: [], summary: { total: 0, improved: 0, regressed: 0, lateral: 0 } };
    }

    const crossMap = {};
    const withinMap = {};
    let totalImproved = 0, totalRegressed = 0, totalLateral = 0;

    allRecordsData.data.forEach(r => {
      const run1Sub  = r.pred_subtype;
      const run2Sub  = r.run2_pred_subtype;
      const run1Type = r.pred_type;
      const run2Type = r.run2_pred_type;
      const trueSub  = r.true_subtype;

      const improved  = run2Sub === trueSub && run1Sub !== trueSub;
      const regressed = run1Sub === trueSub && run2Sub !== trueSub;
      const dir = improved ? 'improved' : regressed ? 'regressed' : 'lateral';

      if (improved) totalImproved++;
      else if (regressed) totalRegressed++;
      else totalLateral++;

      const subKey = `${run1Sub}|||${run2Sub}`;

      if (run1Type === run2Type) {
        if (!withinMap[run1Type]) {
          withinMap[run1Type] = { type: run1Type, transitions: {}, total: 0, improved: 0, regressed: 0, lateral: 0 };
        }
        const g = withinMap[run1Type];
        if (!g.transitions[subKey]) {
          g.transitions[subKey] = { run1Sub, run2Sub, total: 0, improved: 0, regressed: 0, lateral: 0, records: [] };
        }
        const t = g.transitions[subKey];
        t.total++; t.records.push(r); t[dir]++;
        g.total++; g[dir]++;
      } else {
        const typeKey = `${run1Type}|||${run2Type}`;
        if (!crossMap[typeKey]) {
          crossMap[typeKey] = { run1Type, run2Type, transitions: {}, total: 0, improved: 0, regressed: 0, lateral: 0 };
        }
        const g = crossMap[typeKey];
        if (!g.transitions[subKey]) {
          g.transitions[subKey] = { run1Sub, run2Sub, total: 0, improved: 0, regressed: 0, lateral: 0, records: [] };
        }
        const t = g.transitions[subKey];
        t.total++; t.records.push(r); t[dir]++;
        g.total++; g[dir]++;
      }
    });

    return {
      withinTypeGroups: Object.values(withinMap)
        .map(g => ({ ...g, transitions: Object.values(g.transitions).sort((a, b) => b.total - a.total) }))
        .sort((a, b) => b.total - a.total),
      crossTypeGroups: Object.values(crossMap)
        .map(g => ({ ...g, transitions: Object.values(g.transitions).sort((a, b) => b.total - a.total) }))
        .sort((a, b) => b.total - a.total),
      summary: {
        total: allRecordsData.data.length,
        improved: totalImproved,
        regressed: totalRegressed,
        lateral: totalLateral,
      },
    };
  }, [allRecordsData]);

  const filterTransitions = (transitions) =>
    dirFilter ? transitions.filter(t => t[dirFilter] > 0) : transitions;

  const filterRecords = (records) => {
    if (!dirFilter) return records;
    return records.filter(r => {
      const improved  = r.run2_pred_subtype === r.true_subtype && r.pred_subtype !== r.true_subtype;
      const regressed = r.pred_subtype       === r.true_subtype && r.run2_pred_subtype !== r.true_subtype;
      if (dirFilter === 'improved')  return improved;
      if (dirFilter === 'regressed') return regressed;
      return !improved && !regressed; // lateral
    });
  };

  if (loading && !allRecordsData) return <div className="loading">Loading comparison...</div>;
  if (!allRecordsData?.data) return <div className="no-data">No comparison data available</div>;

  const visibleCrossGroups  = dirFilter ? crossTypeGroups.filter(g => g[dirFilter] > 0)  : crossTypeGroups;
  const visibleWithinGroups = dirFilter ? withinTypeGroups.filter(g => g[dirFilter] > 0) : withinTypeGroups;
  const totalCross  = visibleCrossGroups.reduce((s, g)  => s + (dirFilter ? g[dirFilter] : g.total), 0);
  const totalWithin = visibleWithinGroups.reduce((s, g) => s + (dirFilter ? g[dirFilter] : g.total), 0);
  const net = summary.improved - summary.regressed;
  const showCross  = sectionFilter !== 'within';
  const showWithin = sectionFilter !== 'cross';

  const makeRecordsPayload = (records) =>
    ({ data: records, pagination: { total: records.length, page: 0, limit: records.length, pages: 1 } });

  return (
    <div className="run-comparison-panel">

      {/* ── Summary bar ── */}
      <div className="comparison-summary-bar">
        <span className="comparison-title">{runA} → {runB}</span>
        <span className="comparison-stat-divider">·</span>
        <span className="comparison-stat">{summary.total} changed</span>
        {net !== 0 && (
          <span className={`net-delta-badge ${net > 0 ? 'net-positive' : 'net-negative'}`}>
            {net > 0 ? `▲ +${net}` : `▼ ${net}`} net
          </span>
        )}
        <span className="comparison-stat-divider">·</span>
        <button
          className={`error-filter-chip severity-both-chip${sectionFilter === 'cross' ? ' active' : ''}`}
          onClick={() => setSectionFilter(sectionFilter === 'cross' ? null : 'cross')}
        >
          <strong>{totalCross}</strong> cross-type
        </button>
        <span className="comparison-stat-divider">·</span>
        <button
          className={`error-filter-chip severity-subtype-chip${sectionFilter === 'within' ? ' active' : ''}`}
          onClick={() => setSectionFilter(sectionFilter === 'within' ? null : 'within')}
        >
          <strong>{totalWithin}</strong> within-type
        </button>
        <span className="comparison-stat-divider">·</span>
        <span className="direction-counts">
          {summary.improved > 0 && (
            <span
              className={`dir-improved dir-filter-btn${dirFilter === 'improved' ? ' dir-filter-active' : ''}`}
              title="Filter: run 2 newly correct"
              onClick={() => setDirFilter(dirFilter === 'improved' ? null : 'improved')}
            >↑{summary.improved}</span>
          )}
          {summary.regressed > 0 && (
            <span
              className={`dir-regressed dir-filter-btn${dirFilter === 'regressed' ? ' dir-filter-active' : ''}`}
              title="Filter: run 1 correct, run 2 regressed"
              onClick={() => setDirFilter(dirFilter === 'regressed' ? null : 'regressed')}
            >↓{summary.regressed}</span>
          )}
          {summary.lateral > 0 && (
            <span
              className={`dir-lateral dir-filter-btn${dirFilter === 'lateral' ? ' dir-filter-active' : ''}`}
              title="Filter: both wrong, differently"
              onClick={() => setDirFilter(dirFilter === 'lateral' ? null : 'lateral')}
            >↔{summary.lateral}</span>
          )}
        </span>
      </div>

      <div className="error-groups-list">

        {/* ── Cross-type shifts (type changed between runs) ── */}
        {showCross && visibleCrossGroups.length > 0 && (
          <div className="error-section">
            <div className="error-section-header error-section-cross">
              <span className="error-section-icon">⇄</span>
              Cross-type shifts
              <span className="error-section-badge error-section-badge-cross">{totalCross}</span>
              <span className="error-section-hint">type changed between {runA} and {runB}</span>
            </div>

            {visibleCrossGroups.map(group => {
              const groupKey = `${group.run1Type}|||${group.run2Type}`;
              const isOpen = expandedCrossKey === groupKey;
              const visibleCrossTrans = filterTransitions(group.transitions);
              const activeTrans = isOpen && expandedCrossPair
                ? visibleCrossTrans.find(t => `${t.run1Sub}|||${t.run2Sub}` === expandedCrossPair)
                : null;
              const activeRecords = isOpen
                ? filterRecords(activeTrans ? activeTrans.records : visibleCrossTrans.flatMap(t => t.records))
                : null;

              return (
                <div key={groupKey} className={`error-group-row error-group-row-cross${isOpen ? ' error-group-open' : ''}`}>
                  <div className="error-group-label">
                    <span
                      className={`error-type-pair${isOpen ? ' active' : ''}`}
                      onClick={() => {
                        if (isOpen) { setExpandedCrossKey(null); setExpandedCrossPair(null); }
                        else { setExpandedCrossKey(groupKey); setExpandedWithinKey(null); setExpandedCrossPair(null); setExpandedWithinPair(null); }
                      }}
                    >
                      <span className="error-type-label error-type-true">{group.run1Type}</span>
                      <span className="error-type-arrow">→</span>
                      <span className="error-type-label error-type-pred">{group.run2Type}</span>
                    </span>
                    <span className="error-group-total error-group-total-cross">{group.total}</span>
                    <DirectionCounts improved={group.improved} regressed={group.regressed} lateral={group.lateral} />
                  </div>

                  {isOpen && (
                    <div className="error-group-preds">
                      {visibleCrossTrans.map(t => {
                        const pairKey = `${t.run1Sub}|||${t.run2Sub}`;
                        const isActive = expandedCrossPair === pairKey;
                        const pairNet = t.improved - t.regressed;
                        return (
                          <button
                            key={pairKey}
                            className={`comparison-transition-badge${isActive ? ' active' : ''} ${pairNet > 0 ? 'badge-net-positive' : pairNet < 0 ? 'badge-net-negative' : 'badge-net-neutral'}`}
                            onClick={() => setExpandedCrossPair(isActive ? null : pairKey)}
                            title={`↑${t.improved} improved  ↓${t.regressed} regressed  ↔${t.lateral} lateral`}
                          >
                            <span className="badge-subtype-true">{t.run1Sub}</span>
                            <span className={`badge-arrow ${pairNet > 0 ? 'arrow-positive' : pairNet < 0 ? 'arrow-negative' : ''}`}>→</span>
                            <span className="badge-subtype-pred">{t.run2Sub}</span>
                            <span className="pred-badge-count">{t.total}</span>
                            <DirectionCounts improved={t.improved} regressed={t.regressed} lateral={t.lateral} />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {activeRecords && (
                    <div className="error-pair-records error-pair-records-cross">
                      <RowLevelTable
                        key={`cross:${groupKey}|||${expandedCrossPair || '*'}`}
                        data={makeRecordsPayload(activeRecords)}
                        showRun2Columns={true}
                        run1Name={runA}
                        run2Name={runB}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Within-type shifts (same type, subtype changed) ── */}
        {showWithin && visibleWithinGroups.length > 0 && (
          <div className="error-section">
            <div className="error-section-header error-section-within">
              Same-type shifts
              <span className="error-section-badge error-section-badge-within">{totalWithin}</span>
              <span className="error-section-hint">type unchanged, subtype changed between {runA} and {runB}</span>
            </div>

            {visibleWithinGroups.map(group => {
              const isOpen = expandedWithinKey === group.type;
              const visibleWithinTrans = filterTransitions(group.transitions);
              const activeTrans = isOpen && expandedWithinPair
                ? visibleWithinTrans.find(t => `${t.run1Sub}|||${t.run2Sub}` === expandedWithinPair)
                : null;
              const activeRecords = isOpen
                ? filterRecords(activeTrans ? activeTrans.records : visibleWithinTrans.flatMap(t => t.records))
                : null;

              return (
                <div key={group.type} className={`error-group-row${isOpen ? ' error-group-open' : ''}`}>
                  <div className="error-group-label">
                    <span
                      className={`error-group-true${isOpen ? ' active' : ''}`}
                      onClick={() => {
                        if (isOpen) { setExpandedWithinKey(null); setExpandedWithinPair(null); }
                        else { setExpandedWithinKey(group.type); setExpandedCrossKey(null); setExpandedWithinPair(null); setExpandedCrossPair(null); }
                      }}
                    >
                      {group.type}
                    </span>
                    <span className="error-group-total">{group.total}</span>
                    <DirectionCounts improved={group.improved} regressed={group.regressed} lateral={group.lateral} />
                  </div>

                  {isOpen && (
                    <div className="error-group-preds">
                      {visibleWithinTrans.map(t => {
                        const pairKey = `${t.run1Sub}|||${t.run2Sub}`;
                        const isActive = expandedWithinPair === pairKey;
                        const pairNet = t.improved - t.regressed;
                        return (
                          <button
                            key={pairKey}
                            className={`comparison-transition-badge${isActive ? ' active' : ''} ${pairNet > 0 ? 'badge-net-positive' : pairNet < 0 ? 'badge-net-negative' : 'badge-net-neutral'}`}
                            onClick={() => setExpandedWithinPair(isActive ? null : pairKey)}
                            title={`↑${t.improved} improved  ↓${t.regressed} regressed  ↔${t.lateral} lateral`}
                          >
                            <span className="badge-subtype-true">{t.run1Sub}</span>
                            <span className={`badge-arrow ${pairNet > 0 ? 'arrow-positive' : pairNet < 0 ? 'arrow-negative' : ''}`}>→</span>
                            <span className="badge-subtype-pred">{t.run2Sub}</span>
                            <span className="pred-badge-count">{t.total}</span>
                            <DirectionCounts improved={t.improved} regressed={t.regressed} lateral={t.lateral} />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {activeRecords && (
                    <div className="error-pair-records">
                      <RowLevelTable
                        key={`within:${group.type}|||${expandedWithinPair || '*'}`}
                        data={makeRecordsPayload(activeRecords)}
                        showRun2Columns={true}
                        run1Name={runA}
                        run2Name={runB}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {visibleWithinGroups.length === 0 && visibleCrossGroups.length === 0 && (
          <div className="no-selection-message compact">No prediction changes found between these runs.</div>
        )}

      </div>
    </div>
  );
}

export default RunComparisonPanel;
