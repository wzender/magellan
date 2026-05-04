import React, { useEffect, useMemo, useState } from 'react';

const PS2_UNKNOWN = 'unknown';

function pickChampionBySubtypeWeightedF1(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return null;

  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  runs.forEach((run) => {
    const score = Number(run?.subtype_weighted_f1);
    if (Number.isFinite(score) && score > bestScore) {
      best = run;
      bestScore = score;
    }
  });

  return best || runs[0];
}

function computeRealUnknownStats(records, validationValuesByRequestId) {
  const rows = Array.isArray(records) ? records : [];
  const validation = validationValuesByRequestId && typeof validationValuesByRequestId === 'object'
    ? validationValuesByRequestId
    : {};

  const unknownRows = rows.filter(r => String(r.pred_subtype_2 || '').trim().toLowerCase() === PS2_UNKNOWN);
  const totalUnknown = unknownRows.length;

  if (totalUnknown === 0) {
    return { totalUnknown: 0, reviewed: 0, realUnknown: 0, rate: null };
  }

  let reviewed = 0;
  let realUnknown = 0;

  unknownRows.forEach((r) => {
    const verdict = String(validation[r.request_id] || '').trim().toLowerCase();
    if (!verdict) return;
    reviewed++;
    if (verdict === PS2_UNKNOWN) realUnknown++;
  });

  return {
    totalUnknown,
    reviewed,
    realUnknown,
    rate: realUnknown / totalUnknown,
  };
}

function pickUnknownsChampion(runs, unknownStatsByRunId) {
  if (!Array.isArray(runs) || runs.length === 0) return null;

  let best = null;
  let bestRate = Number.NEGATIVE_INFINITY;

  runs.forEach((run) => {
    const stats = unknownStatsByRunId[run.run_id];
    const score = Number(stats?.rate);
    if (Number.isFinite(score) && score > bestRate) {
      best = run;
      bestRate = score;
    }
  });

  return best || pickChampionBySubtypeWeightedF1(runs);
}

function BenchmarkGallery({ benchmarks, allLeaderboards, onSelect }) {
  const [unknownStatsByRunId, setUnknownStatsByRunId] = useState({});

  const unknownsBenchmark = useMemo(
    () => benchmarks.find(b => String(b.name || '').toLowerCase() === 'unknowns') || null,
    [benchmarks]
  );

  const regularBenchmarks = useMemo(
    () => benchmarks.filter(b => String(b.name || '').toLowerCase() !== 'unknowns'),
    [benchmarks]
  );

  useEffect(() => {
    if (!unknownsBenchmark) {
      setUnknownStatsByRunId({});
      return;
    }

    const unknownRuns = allLeaderboards[unknownsBenchmark.id] || [];
    if (unknownRuns.length === 0) {
      setUnknownStatsByRunId({});
      return;
    }

    let cancelled = false;

    const loadUnknownStats = async () => {
      const entries = await Promise.all(unknownRuns.map(async (run) => {
        try {
          const [recRes, validationRes] = await Promise.all([
            fetch(`/api/records?run_id=${run.run_id}&limit=999999`),
            fetch(`/api/validation?run_id=${run.run_id}`),
          ]);
          const recData = await recRes.json();
          const validationData = await validationRes.json();
          const stats = computeRealUnknownStats(recData.data || [], validationData || {});
          return [run.run_id, stats];
        } catch {
          return [run.run_id, null];
        }
      }));

      if (cancelled) return;

      const next = {};
      entries.forEach(([runId, stats]) => {
        if (stats) next[runId] = stats;
      });
      setUnknownStatsByRunId(next);
    };

    loadUnknownStats();
    return () => { cancelled = true; };
  }, [unknownsBenchmark?.id, allLeaderboards]);

  const unknownRuns = unknownsBenchmark ? (allLeaderboards[unknownsBenchmark.id] || []) : [];
  const unknownChampion = pickUnknownsChampion(unknownRuns, unknownStatsByRunId);
  const unknownChampionStats = unknownChampion ? unknownStatsByRunId[unknownChampion.run_id] : null;
  const realUnknownRate = Number.isFinite(Number(unknownChampionStats?.rate))
    ? (Number(unknownChampionStats.rate) * 100).toFixed(1)
    : null;

  return (
    <div className="gallery-screen">
      <div className="gallery-hero">
        <h2 className="gallery-title">Classification Benchmarks</h2>
        <p className="gallery-subtitle">Select a benchmark to explore model performance</p>
      </div>
      <div className="gallery-grid">
        {regularBenchmarks.map(b => {
          const runs = allLeaderboards[b.id] || [];
          const champion = pickChampionBySubtypeWeightedF1(runs);
          const champWeightedF1 = champion ? (Number(champion.subtype_weighted_f1) * 100).toFixed(1) : null;
          return (
            <button key={b.id} className="benchmark-card" onClick={() => onSelect(b)}>
              <div className="benchmark-card-top">
                <span className="benchmark-card-name">{b.name}</span>
                <span className="benchmark-card-run-count">{runs.length} run{runs.length !== 1 ? 's' : ''}</span>
              </div>
              {champion && (
                <div className="benchmark-card-champion">
                  <span className="badge badge-gold">Champion</span>
                  <span className="champion-accuracy">{champWeightedF1}%</span>
                </div>
              )}
              {champion && (
                <div className="benchmark-card-bar-wrap">
                  <div
                    className="benchmark-card-bar-fill"
                    style={{ width: `${Math.max(Number(champWeightedF1), 2)}%` }}
                  />
                </div>
              )}
              <div className="benchmark-card-footer">
                {champion && (
                  <span className="benchmark-card-records">
                    {champion.benchmark_length?.toLocaleString()} records
                  </span>
                )}
                <span className="benchmark-card-cta">Explore &rarr;</span>
              </div>
            </button>
          );
        })}
      </div>

      {unknownsBenchmark && (
        <div className="gallery-unknowns-section">
          <div className="gallery-unknowns-label">Workflow</div>
          <button className="benchmark-card benchmark-card-unknowns" onClick={() => onSelect(unknownsBenchmark)}>
            <div className="benchmark-card-top">
              <span className="benchmark-card-name">Unknowns Review</span>
              <span className="benchmark-card-run-count">{unknownRuns.length} run{unknownRuns.length !== 1 ? 's' : ''}</span>
            </div>
            <p className="benchmark-card-unknowns-subtitle">
              Human-in-the-loop validation for unknown and missing subtype decisions.
            </p>
            {unknownChampion && (
              <div className="benchmark-card-champion">
                <span className="badge badge-gold">Best Real Unknown Rate</span>
                <span className="champion-accuracy">{realUnknownRate != null ? `${realUnknownRate}%` : '—'}</span>
              </div>
            )}
            {unknownChampion && (
              <div className="benchmark-card-bar-wrap">
                <div
                  className="benchmark-card-bar-fill benchmark-card-bar-fill-unknowns"
                  style={{ width: `${Math.max(Number(realUnknownRate || 0), 2)}%` }}
                />
              </div>
            )}
            <div className="benchmark-card-footer">
              {unknownChampion && unknownChampionStats && (
                <span className="benchmark-card-records">
                  {unknownChampionStats.realUnknown.toLocaleString()} / {unknownChampionStats.totalUnknown.toLocaleString()} real unknown
                </span>
              )}
              <span className="benchmark-card-cta">Open Review &rarr;</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

export default BenchmarkGallery;
