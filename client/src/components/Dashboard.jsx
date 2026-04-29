import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import './styles.css';
import BenchmarkGallery from './BenchmarkGallery';
import LeaderboardWidget from './LeaderboardWidget';
import TypeHealthGrid from './TypeHealthGrid';
import RowLevelTable from './RowLevelTable';
import ValidationPanel from './ValidationPanel';

const UNKNOWNS_BENCHMARK_NAME = 'Unknowns';
const NOT_RETAGGED_LABEL = 'Not retagged';
const EMPTY_UNKNOWNS_GRID_FILTER = { trueType: null, trueSubtype: null, predSubtype: null };

/* ── helpers ─────────────────────────────────────────────── */
function pctNum(n) { return (n * 100).toFixed(1); }

/* ── Unknowns type-health (client-side, mirrors csv-loader getTypeHealthSummary) ── */
function computeUnknownsTypeHealth(records, verdicts, countrySubtypes) {
  const subtypeToType = Object.fromEntries((countrySubtypes || []).map(o => [o.subtype, o.type]));
  const typeMap = {};

  records.forEach(r => {
    const rawSubtype = verdicts[r.request_id];
    const trueSubtype = rawSubtype === undefined || rawSubtype === null ? '' : rawSubtype;
    const trueType = trueSubtype === ''
      ? NOT_RETAGGED_LABEL
      : (subtypeToType[trueSubtype] || 'Unknown');
    const predType   = r.pred_type;
    const predSubtype = r.pred_subtype;

    if (!typeMap[trueType]) typeMap[trueType] = { type: trueType, total: 0, correct: 0, cross_type_wrong: 0, same_type_wrong: 0, subtypeMap: {}, confusionMap: {} };
    const t = typeMap[trueType];
    t.total++;

    const isCorrect   = predSubtype === trueSubtype;
    const isCrossType = predType    !== trueType;

    if      (isCorrect)   t.correct++;
    else if (isCrossType) t.cross_type_wrong++;
    else                  t.same_type_wrong++;

    if (!t.subtypeMap[trueSubtype]) t.subtypeMap[trueSubtype] = { subtype: trueSubtype, total: 0, correct: 0, cross_type: 0, confusionMap: {} };
    const st = t.subtypeMap[trueSubtype];
    st.total++;
    if (isCorrect) { st.correct++; } else {
      if (isCrossType) st.cross_type++;
      const k = `${predSubtype}|||${predType}`;
      st.confusionMap[k] = (st.confusionMap[k] || 0) + 1;
    }
    if (!isCorrect) {
      const k = `${predSubtype}|||${predType}`;
      t.confusionMap[k] = (t.confusionMap[k] || 0) + 1;
    }
  });

  return Object.values(typeMap).map(t => {
    const fmt = obj => Object.entries(obj)
      .map(([k, count]) => { const [pred_subtype, pred_type] = k.split('|||'); return { pred_subtype, pred_type, count }; })
      .sort((a, b) => b.count - a.count);

    const subtypes = Object.values(t.subtypeMap).map(st => ({
      subtype: st.subtype, total: st.total, correct: st.correct, cross_type: st.cross_type,
      accuracy: st.correct / st.total,
      confused_to: fmt(st.confusionMap),
      top_confused_to: fmt(st.confusionMap).slice(0, 3),
    })).sort((a, b) => a.accuracy - b.accuracy);

    return {
      type: t.type, total: t.total, correct: t.correct,
      cross_type_wrong: t.cross_type_wrong, same_type_wrong: t.same_type_wrong,
      accuracy: t.correct / t.total,
      cross_type_rate: t.cross_type_wrong / t.total,
      top_confused_to: fmt(t.confusionMap).slice(0, 5),
      subtypes,
    };
  }).sort((a, b) => a.accuracy - b.accuracy);
}

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
  const [confidenceQuality, setConfidenceQuality] = useState(null);
  const [typeHealth2, setTypeHealth2]   = useState(null);
  const [compareTypeHealth, setCompareTypeHealth] = useState(null); // compare mode: per-type 4-outcome counts
  const [compareFilter, setCompareFilter] = useState(null); // null|'both_correct'|'run1_only'|'run2_only'|'both_wrong'
  const [recordQuery, setRecordQuery]     = useState(null);
  const [recordsData, setRecordsData]     = useState(null); // { data, pagination }
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsExpanded, setRecordsExpanded] = useState(true);
  const [loading, setLoading]           = useState(false);
  const [correctnessFilter, setCorrectnessFilter] = useState(new Set()); // Set of 'correct' | 'same_type' | 'cross_type'

  /* ── Unknowns validation state ── */
  const [validationRecords, setValidationRecords] = useState([]);
  const [validationVerdicts, setValidationVerdicts] = useState({});
  const [validationLoading, setValidationLoading] = useState(false);
  const [countrySubtypes, setCountrySubtypes] = useState([]);
  const [unknownsGridFilter, setUnknownsGridFilter] = useState(EMPTY_UNKNOWNS_GRID_FILTER);

  const isUnknownsBenchmark = selectedBenchmark?.name === UNKNOWNS_BENCHMARK_NAME;

  /* derive country name from run_name (spain → Spain) */
  const _unknownsRun = leaderboard.find(r => r.run_id === selectedRunIds[0]);
  const unknownsCountry = isUnknownsBenchmark && _unknownsRun
    ? _unknownsRun.run_name.charAt(0).toUpperCase() + _unknownsRun.run_name.slice(1)
    : null;

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
    setConfidenceQuality(null);
    setTypeHealth2(null);
    setRecordQuery(null);
    setRecordsData(null);
    setRecordsExpanded(true);
    setValidationRecords([]);
    setValidationVerdicts({});
    setUnknownsGridFilter(EMPTY_UNKNOWNS_GRID_FILTER);
    setScreen('benchmark');
    if (champion) {
      setSelectedRunIds([champion.run_id]);
      if (benchmark.name !== UNKNOWNS_BENCHMARK_NAME) {
        // Always re-fetch — useEffect won't fire if the same run_id was already selected
        const res  = await fetch(`/api/type-health?run_id=${champion.run_id}`);
        const data = await res.json();
        setTypeHealth(data);
      }
    } else {
      setSelectedRunIds([]);
    }
  }, [allLeaderboards]);

  /* ── load type health when run 1 changes (skip for Unknowns) ── */
  useEffect(() => {
    if (selectedRunIds.length === 0 || isUnknownsBenchmark) return;
    const load = async () => {
      const res  = await fetch(`/api/type-health?run_id=${selectedRunIds[0]}`);
      const data = await res.json();
      setTypeHealth(data);
    };
    load();
  }, [selectedRunIds[0], isUnknownsBenchmark]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Unknowns: fetch country-specific subtypes when run changes ── */
  useEffect(() => {
    if (!unknownsCountry) return;
    fetch(`/api/subtypes-by-country?country=${encodeURIComponent(unknownsCountry)}`)
      .then(r => r.json())
      .then(data => setCountrySubtypes(Array.isArray(data) ? data : []))
      .catch(() => setCountrySubtypes([]));
  }, [unknownsCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Unknowns: load validation records + verdicts when run changes ── */
  useEffect(() => {
    if (!isUnknownsBenchmark || selectedRunIds.length === 0) return;
    const runId = selectedRunIds[0];
    setUnknownsGridFilter(EMPTY_UNKNOWNS_GRID_FILTER);
    const load = async () => {
      setValidationLoading(true);
      try {
        const [recRes, verdRes] = await Promise.all([
          fetch(`/api/records?run_id=${runId}&limit=999999`),
          fetch(`/api/validation?run_id=${runId}`),
        ]);
        const recData  = await recRes.json();
        const verdData = await verdRes.json();
        setValidationRecords(recData.data || []);
        setValidationVerdicts(verdData || {});
      } finally {
        setValidationLoading(false);
      }
    };
    load();
  }, [selectedRunIds[0], isUnknownsBenchmark]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Unknowns: set single verdict ── */
  const handleSetVerdict = useCallback(async (requestId, verdict) => {
    const runId = selectedRunIds[0];
    setValidationVerdicts(prev => {
      const next = { ...prev };
      if (verdict) next[requestId] = verdict;
      else delete next[requestId];
      return next;
    });
    await fetch('/api/validation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: String(runId), verdicts: { [requestId]: verdict } }),
    });
  }, [selectedRunIds]);

  /* ── Unknowns: bulk verdict ── */
  const handleBulkVerdict = useCallback(async (verdictMap) => {
    const runId = selectedRunIds[0];
    setValidationVerdicts(prev => {
      const next = { ...prev };
      for (const [reqId, v] of Object.entries(verdictMap)) {
        if (v) next[reqId] = v;
        else delete next[reqId];
      }
      return next;
    });
    await fetch('/api/validation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: String(runId), verdicts: verdictMap }),
    });
  }, [selectedRunIds]);

  /* ── Unknowns: drill-down from TypeHealthGrid using client-side filtered data ── */
  const handleViewRecordsForUnknowns = useCallback((trueType, trueSubtype, predSubtype) => {
    setUnknownsGridFilter({
      trueType: trueType ?? null,
      trueSubtype: trueSubtype === undefined ? null : trueSubtype,
      predSubtype: predSubtype ?? null,
    });
  }, []);

  /* ── compare type health: fetch when 2 runs selected, clear otherwise ── */
  useEffect(() => {
    if (selectedRunIds.length < 2) {
      setTypeHealth2(null);
      setCompareTypeHealth(null);
      setCompareFilter(null);
      return;
    }
    const [id1, id2] = selectedRunIds;
    const load = async () => {
      const [th2, cth] = await Promise.all([
        fetch(`/api/type-health?run_id=${id2}`).then(r => r.json()),
        fetch(`/api/compare-type-health?run_id1=${id1}&run_id2=${id2}`).then(r => r.json()),
      ]);
      setTypeHealth2(th2);
      setCompareTypeHealth(cth);
    };
    load();
  }, [selectedRunIds[0], selectedRunIds[1]]);

  /* ── confidence quality (single-run only) ── */
  useEffect(() => {
    if (selectedRunIds.length !== 1 || !selectedRunIds[0]) {
      setConfidenceQuality(null);
      return;
    }
    const runId = selectedRunIds[0];
    fetch(`/api/confidence-quality?run_id=${runId}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) setConfidenceQuality(data);
        else setConfidenceQuality(null);
      })
      .catch(() => setConfidenceQuality(null));
  }, [selectedRunIds[0], selectedRunIds[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── row click: switch to this run as the only selected run ── */
  const handleRunSelect = (runId) => {
    setSelectedRunIds(prev => prev[0] === runId ? prev : [runId]);
    setTypeHealth2(null);
    setRecordQuery(null);
    setRecordsData(null);
    setRecordsExpanded(true);
    setUnknownsGridFilter(EMPTY_UNKNOWNS_GRID_FILTER);
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
    setRecordsExpanded(true);
    setUnknownsGridFilter(EMPTY_UNKNOWNS_GRID_FILTER);
  };

  /* ── auto-show all records when a single run is selected (skip for Unknowns) ── */
  useEffect(() => {
    if (selectedRunIds.length !== 1 || !selectedRunIds[0] || isUnknownsBenchmark) return;
    const runId = selectedRunIds[0];
    const load = async () => {
      setRecordQuery({ runId, runId2: null, trueType: null, trueSubtype: null, predSubtype: null, run1PredSubtype: null, run2PredSubtype: null });
      setRecordsLoading(true);
      setRecordsData(null);
      try {
        const data = await fetchRecords(runId, null, null, 50, correctnessFilter.size > 0 ? correctnessFilter : null);
        setRecordsData(data);
      } finally {
        setRecordsLoading(false);
      }
    };
    load();
  }, [selectedRunIds[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── record fetch ── */
  // run1PredSubtype / run2PredSubtype are for compare-mode transition matrix cell filtering
  const fetchRecords = useCallback(async (runId1, trueType, trueSubtype, limit = 50, filter = null, runId2 = null, predSubtype = null, cmpFilter = null, run1PredSubtype = null, run2PredSubtype = null, run1PredType = null, run2PredType = null) => {
    // filter can be a Set or a string
    const filterStr = filter instanceof Set ? [...filter].join(',') : filter;
    let url = runId2
      ? `/api/records?run_id1=${runId1}&run_id2=${runId2}&limit=${limit}`
      : `/api/records?run_id=${runId1}&limit=${limit}`;
    if (trueType)         url += `&true_type=${encodeURIComponent(trueType)}`;
    if (trueSubtype)      url += `&true_subtype=${encodeURIComponent(trueSubtype)}`;
    if (run1PredSubtype)  url += `&run1_pred_subtype=${encodeURIComponent(run1PredSubtype)}`;
    if (run2PredSubtype)  url += `&run2_pred_subtype=${encodeURIComponent(run2PredSubtype)}`;
    if (run1PredType)     url += `&run1_pred_type=${encodeURIComponent(run1PredType)}`;
    if (run2PredType)     url += `&run2_pred_type=${encodeURIComponent(run2PredType)}`;
    if (!runId2 && predSubtype) {
      // '__cross_type__' is a sentinel meaning filter=cross_type
      const resolvedFilter = predSubtype === '__cross_type__' ? 'cross_type' : filterStr;
      url += `&pred_subtype=${encodeURIComponent(predSubtype)}`;
      if (resolvedFilter) url += `&filter=${resolvedFilter}`;
    } else if (!runId2 && filterStr) {
      url += `&filter=${filterStr}`;
    }
    if (cmpFilter) url += `&compare_filter=${cmpFilter}`;
    const res = await fetch(url);
    return res.json();
  }, []);

  const handleViewRecords = useCallback(async (trueType, trueSubtype, predSubtype = null, run1PredSubtype = null, run2PredSubtype = null, run1PredType = null, run2PredType = null) => {
    const runId1 = selectedRunIds[0];
    const runId2 = selectedRunIds[1] ?? null;
    const isCompare = !!runId2;
    const isTypeLookup = !!(run1PredType || run2PredType);
    setRecordQuery({ runId: runId1, runId2, trueType, trueSubtype, predSubtype, run1PredSubtype, run2PredSubtype, run1PredType, run2PredType });
    setRecordsExpanded(true);
    setRecordsLoading(true);
    setRecordsData(null);
    try {
      const data = await fetchRecords(
        runId1, trueType, trueSubtype, 50,
        isCompare ? null : (correctnessFilter.size > 0 ? correctnessFilter : null),
        runId2, isCompare ? null : predSubtype,
        (isCompare && !isTypeLookup) ? compareFilter : null,
        isCompare ? run1PredSubtype : null,
        isCompare ? run2PredSubtype : null,
        isCompare ? run1PredType : null,
        isCompare ? run2PredType : null,
      );
      setRecordsData(data);
    } finally {
      setRecordsLoading(false);
    }
    // scroll to records after async render
    setTimeout(() => recordsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [selectedRunIds, fetchRecords, correctnessFilter, compareFilter]);

  /* for RowLevelTable export: fetch all records without limit */
  const handleExportRecords = useCallback(async () => {
    if (!recordQuery) return { data: [], pagination: { total: 0 } };
    const isCompare = !!recordQuery.runId2;
    const isTypeLookup = !!(recordQuery.run1PredType || recordQuery.run2PredType);
    return fetchRecords(
      recordQuery.runId, recordQuery.trueType, recordQuery.trueSubtype, 999999,
      isCompare ? null : (correctnessFilter.size > 0 ? correctnessFilter : null),
      recordQuery.runId2 ?? null,
      isCompare ? null : (recordQuery.predSubtype ?? null),
      (isCompare && !isTypeLookup) ? compareFilter : null,
      isCompare ? (recordQuery.run1PredSubtype ?? null) : null,
      isCompare ? (recordQuery.run2PredSubtype ?? null) : null,
      isCompare ? (recordQuery.run1PredType ?? null) : null,
      isCompare ? (recordQuery.run2PredType ?? null) : null,
    );
  }, [recordQuery, fetchRecords, correctnessFilter, compareFilter]);

  /* re-fetch when correctness filter changes while in single-run mode */
  useEffect(() => {
    if (!recordQuery || recordQuery.runId2) return;
    const refetch = async () => {
      setRecordsLoading(true);
      setRecordsData(null);
      try {
        const data = await fetchRecords(recordQuery.runId, recordQuery.trueType, recordQuery.trueSubtype, 50, correctnessFilter.size > 0 ? correctnessFilter : null, null, recordQuery.predSubtype ?? null, null);
        setRecordsData(data);
      } finally {
        setRecordsLoading(false);
      }
    };
    refetch();
  }, [correctnessFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* re-fetch when compare filter changes while in compare mode (skip type-level cell queries) */
  useEffect(() => {
    if (!recordQuery || !recordQuery.runId2) return;
    if (recordQuery.run1PredType || recordQuery.run2PredType) return;
    const refetch = async () => {
      setRecordsLoading(true);
      setRecordsData(null);
      try {
        const data = await fetchRecords(
          recordQuery.runId, recordQuery.trueType, recordQuery.trueSubtype, 50, null,
          recordQuery.runId2,
          null, compareFilter,
          recordQuery.run1PredSubtype ?? null,
          recordQuery.run2PredSubtype ?? null,
        );
        setRecordsData(data);
      } finally {
        setRecordsLoading(false);
      }
    };
    refetch();
  }, [compareFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── run names for summary bar ── */
  const run1Entry = leaderboard.find(e => e.run_id === selectedRunIds[0]);
  const run2Entry = leaderboard.find(e => e.run_id === selectedRunIds[1]);
  const run1Name  = run1Entry?.run_name ?? '';
  const run2Name  = run2Entry?.run_name ?? '';

  /* derived: for Unknowns, compute live from verdicts; for others use API-fetched state */
  const displayTypeHealth = isUnknownsBenchmark
    ? computeUnknownsTypeHealth(validationRecords, validationVerdicts, countrySubtypes)
    : typeHealth;

  const recordsRef = useRef(null);
  const recordsHeaderRef = useRef(null);

  /* measure records-section-header height and expose as CSS var */
  useLayoutEffect(() => {
    const el = recordsHeaderRef.current;
    const container = recordsRef.current;
    if (!el || !container) return;
    const h = el.getBoundingClientRect().height;
    container.style.setProperty('--records-header-h', `${h}px`);
  });

  const recordsTitle = recordQuery
    ? (() => {
        // Type transition matrix cell click
        if (recordQuery.run1PredType || recordQuery.run2PredType) {
          const r1 = recordQuery.run1PredType || '…';
          const r2 = recordQuery.run2PredType || '…';
          return `${run1Name || 'Run 1'}: ${r1} → ${run2Name || 'Run 2'}: ${r2} (type)`;
        }
        // Compare mode with subtype transition matrix preds
        if (recordQuery.run1PredSubtype || recordQuery.run2PredSubtype) {
          const typeLabel = recordQuery.trueType ? `${recordQuery.trueType} › ` : '';
          const r1 = recordQuery.run1PredSubtype || '…';
          const r2 = recordQuery.run2PredSubtype || '…';
          return `${typeLabel}${run1Name || 'Run 1'}: ${r1} / ${run2Name || 'Run 2'}: ${r2}`;
        }
        const base = recordQuery.trueSubtype
          ? `${recordQuery.trueType} › ${recordQuery.trueSubtype}`
          : recordQuery.trueType
            ? `All ${recordQuery.trueType} records`
            : 'All records';
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
            onRunToggle={isUnknownsBenchmark ? undefined : handleRunToggle}
          />

          {displayTypeHealth.length > 0 && (
            <TypeHealthGrid
              typeHealth={displayTypeHealth}
              confidenceQuality={confidenceQuality}
              typeHealth2={typeHealth2}
              compareTypeHealth={compareTypeHealth}
              runId={selectedRunIds[0]}
              runId2={selectedRunIds[1] ?? null}
              run1Name={run1Name}
              run2Name={run2Name}
              onViewRecords={isUnknownsBenchmark ? handleViewRecordsForUnknowns : handleViewRecords}
              activeSubtype={isUnknownsBenchmark ? unknownsGridFilter.trueSubtype : (recordQuery?.trueSubtype ?? null)}
              correctnessFilter={correctnessFilter}
              onCorrectnessFilter={v => setCorrectnessFilter(prev => {
                const next = new Set(prev);
                if (next.has(v)) next.delete(v); else next.add(v);
                return next;
              })}
              compareFilter={compareFilter}
              onCompareFilter={v => setCompareFilter(prev => prev === v ? null : v)}
              isUnknowns={isUnknownsBenchmark}
            />
          )}

          {isUnknownsBenchmark && selectedRunIds.length > 0 && (
            <div className="validation-section">
              <h3 className="validation-section-title">
                {unknownsCountry ?? run1Name} — Prediction Validation
              </h3>
              {validationLoading && <div className="viewer-loading">Loading records…</div>}
              {!validationLoading && (
                <ValidationPanel
                  runId={selectedRunIds[0]}
                  runName={run1Name}
                  country={unknownsCountry}
                  countrySubtypes={countrySubtypes}
                  records={validationRecords}
                  verdicts={validationVerdicts}
                  gridFilter={unknownsGridFilter}
                  onClearGridFilter={() => setUnknownsGridFilter(EMPTY_UNKNOWNS_GRID_FILTER)}
                  onSetVerdict={handleSetVerdict}
                  onBulkVerdict={handleBulkVerdict}
                />
              )}
            </div>
          )}

          {!isUnknownsBenchmark && (recordQuery || recordsLoading) && (
            <section className={`collapsible-section records-section ${recordsExpanded ? 'is-open' : 'is-closed'}`} ref={recordsRef}>
              <button
                className="collapsible-section-header records-section-collapse-header"
                ref={recordsHeaderRef}
                onClick={() => setRecordsExpanded(prev => !prev)}
                aria-expanded={recordsExpanded}
              >
                <span className="collapsible-section-titlewrap">
                  <span className="collapsible-section-title">Record Details</span>
                  <span className="collapsible-section-subtitle">Individual classified records — expand a row to see full attributes and metadata</span>
                </span>
                <span className="collapsible-section-icon" aria-hidden="true">{recordsExpanded ? '▾' : '▸'}</span>
              </button>
              {recordsExpanded && (
                <div className="collapsible-section-body records-section-body">
                  <div className="records-section-toolbar">
                    <div className="records-section-titleblock">
                      <span className="records-section-kicker">{recordsTitle}</span>
                    </div>
                    <button className="btn-close-viewer" onClick={() => {
                      setCorrectnessFilter(new Set());
                      setRecordQuery(null);
                      setRecordsData(null);
                      setRecordsExpanded(true);
                      if (!isUnknownsBenchmark) {
                        const runId1 = selectedRunIds[0];
                        const runId2 = selectedRunIds[1] ?? null;
                        setRecordQuery({ runId: runId1, runId2, trueType: null, trueSubtype: null, predSubtype: null, run1PredSubtype: null, run2PredSubtype: null });
                        setRecordsLoading(true);
                        fetchRecords(runId1, null, null, 50, null, runId2)
                          .then(data => setRecordsData(data))
                          .finally(() => setRecordsLoading(false));
                      }
                    }}>
                      ↺ Show All
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
                    />
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
