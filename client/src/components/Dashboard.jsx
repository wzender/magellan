import React, { useState, useEffect, useCallback, useRef } from 'react';
import './styles.css';
import BenchmarkGallery from './BenchmarkGallery';
import LeaderboardWidget from './LeaderboardWidget';
import TypeHealthGrid from './TypeHealthGrid';
import RowLevelTable from './RowLevelTable';

/* ── helpers ─────────────────────────────────────────────── */
function pctNum(n) { return (n * 100).toFixed(1); }

/* ── SummaryBar ──────────────────────────────────────────── */
function SummaryBar({ typeHealth, typeHealth2, run1Name, run2Name }) {
  if (!typeHealth || typeHealth.length === 0) return null;

  const total    = typeHealth.reduce((s, t) => s + t.total, 0);
  const correct  = typeHealth.reduce((s, t) => s + t.correct, 0);
  const crossType = typeHealth.reduce((s, t) => s + t.cross_type_wrong, 0);
  const sameType  = typeHealth.reduce((s, t) => s + t.same_type_wrong, 0);
  const acc       = correct / total;
  const crossRate = crossType / total;

  if (typeHealth2) {
    const total2   = typeHealth2.reduce((s, t) => s + t.total, 0);
    const correct2 = typeHealth2.reduce((s, t) => s + t.correct, 0);
    const acc2     = correct2 / total2;
    const delta    = acc2 - acc;
    const deltaStr = (delta >= 0 ? '+' : '') + pctNum(delta) + '%';
    const deltaClass = delta > 0 ? 'stat-delta-up' : delta < 0 ? 'stat-delta-down' : 'stat-delta-flat';

    return (
      <div className="summary-bar summary-bar-compare">
        <div className="summary-stat">
          <span className="summary-run-name">{run1Name}</span>
          <span className="summary-big-num">{pctNum(acc)}%</span>
          <span className="summary-label">accuracy</span>
        </div>
        <div className={`summary-delta ${deltaClass}`}>
          <span className="summary-delta-num">{deltaStr}</span>
          <span className="summary-label">vs {run2Name}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-run-name">{run2Name}</span>
          <span className="summary-big-num">{pctNum(acc2)}%</span>
          <span className="summary-label">accuracy</span>
        </div>
      </div>
    );
  }

  return (
    <div className="summary-bar">
      <div className="summary-stat summary-stat-main">
        <span className="summary-big-num">{pctNum(acc)}%</span>
        <span className="summary-label">Overall accuracy</span>
      </div>
      <div className="summary-divider" />
      <div className="summary-stat summary-stat-warn">
        <span className="summary-big-num">{pctNum(1 - acc - crossRate)}%</span>
        <span className="summary-label">Same-type wrong</span>
        <span className="summary-sublabel">minor error</span>
      </div>
      <div className="summary-divider" />
      <div className="summary-stat summary-stat-danger">
        <span className="summary-big-num">{pctNum(crossRate)}%</span>
        <span className="summary-label">Cross-type wrong</span>
        <span className="summary-sublabel">severe error</span>
      </div>
      <div className="summary-divider" />
      <div className="summary-stat summary-stat-neutral">
        <span className="summary-big-num">{total.toLocaleString()}</span>
        <span className="summary-label">Total records</span>
      </div>
    </div>
  );
}

/* ── Dashboard ───────────────────────────────────────────── */
function Dashboard() {
  const [screen, setScreen]             = useState('gallery');
  const [benchmarks, setBenchmarks]     = useState([]);
  const [allLeaderboards, setAllLeaderboards] = useState({});
  const [selectedBenchmark, setSelectedBenchmark] = useState(null);
  const [leaderboard, setLeaderboard]   = useState([]);
  const [selectedRunIds, setSelectedRunIds] = useState([]);
  const [typeHealth, setTypeHealth]     = useState([]);
  const [typeHealth2, setTypeHealth2]   = useState(null);
  const [recordQuery, setRecordQuery]     = useState(null);
  const [recordsData, setRecordsData]     = useState(null); // { data, pagination }
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [correctnessFilter, setCorrectnessFilter] = useState(null); // null | 'correct' | 'same_type' | 'cross_type'

  /* ── initial load: benchmarks + all leaderboards ── */
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const bRes  = await fetch('/api/benchmarks');
        const bData = await bRes.json();
        setBenchmarks(bData);

        const lbMap = {};
        await Promise.all(bData.map(async b => {
          const lRes  = await fetch(`/api/leaderboard?benchmark_id=${b.id}`);
          const lData = await lRes.json();
          lbMap[b.id] = lData;
        }));
        setAllLeaderboards(lbMap);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  /* ── when benchmark selected: set leaderboard + auto-select champion ── */
  const handleBenchmarkSelect = useCallback(async (benchmark) => {
    setSelectedBenchmark(benchmark);
    const lb = allLeaderboards[benchmark.id] || [];
    setLeaderboard(lb);
    const champion = lb[0];
    setTypeHealth([]);
    setTypeHealth2(null);
    setRecordQuery(null);
    setRecordsData(null);
    setScreen('benchmark');
    if (champion) {
      setSelectedRunIds([champion.run_id]);
      // Always re-fetch — useEffect won't fire if the same run_id was already selected
      const res  = await fetch(`/api/type-health?run_id=${champion.run_id}`);
      const data = await res.json();
      setTypeHealth(data);
    } else {
      setSelectedRunIds([]);
    }
  }, [allLeaderboards]);

  /* ── load type health when run 1 changes ── */
  useEffect(() => {
    if (selectedRunIds.length === 0) return;
    const load = async () => {
      const res  = await fetch(`/api/type-health?run_id=${selectedRunIds[0]}`);
      const data = await res.json();
      setTypeHealth(data);
    };
    load();
  }, [selectedRunIds[0]]);

  /* ── load type health for run 2 when comparing ── */
  useEffect(() => {
    if (selectedRunIds.length < 2) { setTypeHealth2(null); return; }
    const load = async () => {
      const res  = await fetch(`/api/type-health?run_id=${selectedRunIds[1]}`);
      const data = await res.json();
      setTypeHealth2(data);
    };
    load();
  }, [selectedRunIds[1]]);

  /* ── row click: switch to this run as the only selected run ── */
  const handleRunSelect = (runId) => {
    setSelectedRunIds(prev => prev[0] === runId ? prev : [runId]);
    setTypeHealth2(null);
    setRecordQuery(null);
    setRecordsData(null);
  };

  /* ── compare checkbox toggle (up to 2 runs) ── */
  const handleRunToggle = (runId) => {
    setSelectedRunIds(prev => {
      if (prev.includes(runId)) {
        const next = prev.filter(id => id !== runId);
        return next.length > 0 ? next : prev; // always keep at least 1
      }
      if (prev.length < 2) return [...prev, runId];
      return prev;
    });
    setRecordQuery(null);
    setRecordsData(null);
  };

  /* ── record fetch ── */
  const fetchRecords = useCallback(async (runId1, trueType, trueSubtype, limit = 50, filter = null, runId2 = null, predSubtype = null) => {
    let url = runId2
      ? `/api/records?run_id1=${runId1}&run_id2=${runId2}&limit=${limit}`
      : `/api/records?run_id=${runId1}&limit=${limit}`;
    if (trueType)    url += `&true_type=${encodeURIComponent(trueType)}`;
    if (trueSubtype) url += `&true_subtype=${encodeURIComponent(trueSubtype)}`;
    if (predSubtype) url += `&pred_subtype=${encodeURIComponent(predSubtype)}`;
    // '__cross_type__' is a sentinel meaning filter=cross_type
    const resolvedFilter = predSubtype === '__cross_type__' ? 'cross_type' : filter;
    if (resolvedFilter) url += `&filter=${resolvedFilter}`;
    const res = await fetch(url);
    return res.json();
  }, []);

  const handleViewRecords = useCallback(async (trueType, trueSubtype, predSubtype = null) => {
    const runId1 = selectedRunIds[0];
    const runId2 = selectedRunIds[1] ?? null;
    setRecordQuery({ runId: runId1, runId2, trueType, trueSubtype, predSubtype });
    setRecordsLoading(true);
    setRecordsData(null);
    try {
      const data = await fetchRecords(runId1, trueType, trueSubtype, 50, correctnessFilter, runId2, predSubtype);
      setRecordsData(data);
    } finally {
      setRecordsLoading(false);
    }
  }, [selectedRunIds, fetchRecords, correctnessFilter]);

  /* for RowLevelTable export: fetch all records without limit */
  const handleExportRecords = useCallback(async () => {
    if (!recordQuery) return { data: [], pagination: { total: 0 } };
    return fetchRecords(recordQuery.runId, recordQuery.trueType, recordQuery.trueSubtype, 999999, correctnessFilter, recordQuery.runId2 ?? null, recordQuery.predSubtype ?? null);
  }, [recordQuery, fetchRecords, correctnessFilter]);

  /* re-fetch when correctness filter changes while a query is active */
  useEffect(() => {
    if (!recordQuery) return;
    const refetch = async () => {
      setRecordsLoading(true);
      setRecordsData(null);
      try {
        const data = await fetchRecords(recordQuery.runId, recordQuery.trueType, recordQuery.trueSubtype, 50, correctnessFilter, recordQuery.runId2 ?? null, recordQuery.predSubtype ?? null);
        setRecordsData(data);
      } finally {
        setRecordsLoading(false);
      }
    };
    refetch();
  }, [correctnessFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* re-fetch after translation */
  const handleTranslated = useCallback(async () => {
    if (!recordQuery) return;
    const data = await fetchRecords(recordQuery.runId, recordQuery.trueType, recordQuery.trueSubtype, 50, correctnessFilter, recordQuery.runId2 ?? null, recordQuery.predSubtype ?? null);
    setRecordsData(data);
  }, [recordQuery, fetchRecords, correctnessFilter]);

  /* ── run names for summary bar ── */
  const run1Entry = leaderboard.find(e => e.run_id === selectedRunIds[0]);
  const run2Entry = leaderboard.find(e => e.run_id === selectedRunIds[1]);
  const run1Name  = run1Entry?.run_name ?? '';
  const run2Name  = run2Entry?.run_name ?? '';

  const recordsRef = useRef(null);
  useEffect(() => {
    if (!recordsLoading && recordsData) {
      recordsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [recordsLoading, recordsData]);

  const recordsTitle = recordQuery
    ? (() => {
        const base = recordQuery.trueSubtype
          ? `${recordQuery.trueType} › ${recordQuery.trueSubtype}`
          : `All ${recordQuery.trueType} records`;
        if (!recordQuery.predSubtype) return base;
        if (recordQuery.predSubtype === '__cross_type__') return `${base} → cross-type`;
        return `${base} → ${recordQuery.predSubtype}`;
      })()
    : '';

  /* ── render ── */
  if (loading && benchmarks.length === 0) {
    return <div className="app-loading">Loading…</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-logo">Magellan</span>
          {screen === 'benchmark' && selectedBenchmark && (
            <>
              <span className="app-header-sep">/</span>
              <button className="app-header-back" onClick={() => setScreen('gallery')}>
                Benchmarks
              </button>
              <span className="app-header-sep">/</span>
              <span className="app-header-current">{selectedBenchmark.name}</span>
            </>
          )}
        </div>
      </header>

      {screen === 'gallery' && (
        <BenchmarkGallery
          benchmarks={benchmarks}
          allLeaderboards={allLeaderboards}
          onSelect={handleBenchmarkSelect}
        />
      )}

      {screen === 'benchmark' && (
        <div className="benchmark-screen">
          <LeaderboardWidget
            data={leaderboard}
            selectedRuns={selectedRunIds}
            onRunSelect={handleRunSelect}
            onRunToggle={handleRunToggle}
          />

          {typeHealth.length > 0 && (
            <TypeHealthGrid
              typeHealth={typeHealth}
              typeHealth2={typeHealth2}
              runId={selectedRunIds[0]}
              onViewRecords={handleViewRecords}
              activeSubtype={recordQuery?.trueSubtype ?? null}
              correctnessFilter={correctnessFilter}
              onCorrectnessFilter={v => setCorrectnessFilter(prev => prev === v ? null : v)}
            />
          )}

          {(recordQuery || recordsLoading) && (
            <div className="records-section" ref={recordsRef}>
              <div className="records-section-header">
                <div className="records-section-title">
                  <span>{recordsTitle}</span>
                </div>
                <button className="btn-close-viewer" onClick={() => { setRecordQuery(null); setRecordsData(null); }}>
                  ✕ Clear
                </button>
              </div>
              {recordsLoading && <div className="viewer-loading">Loading records…</div>}
              {!recordsLoading && recordsData && (
                <RowLevelTable
                  data={recordsData}
                  run1Name={run1Name}
                  run2Name={run2Name}
                  showRun2Columns={!!recordQuery?.runId2}
                  onExport={handleExportRecords}
                  onTranslated={handleTranslated}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
