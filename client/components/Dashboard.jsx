import React, { useState, useEffect } from 'react';
import './styles.css';
import BenchmarkDropdown from './BenchmarkDropdown';
import RunSelector from './RunSelector';
import LeaderboardWidget from './LeaderboardWidget';
import ConfusionMatrixPanel from './ConfusionMatrixPanel';
import TransitionMatrixPanel from './TransitionMatrixPanel';
import CalibrationPerTypePanel from './CalibrationPerTypePanel';
import RowLevelTable from './RowLevelTable';

/**
 * Main Dashboard Component
 * Single-page application for classification evaluation and analysis
 */
function Dashboard() {
  const [benchmarks, setBenchmarks] = useState([]);
  const [selectedBenchmark, setSelectedBenchmark] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedRun2, setSelectedRun2] = useState(null);
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState('confusion'); // 'confusion' or 'transition'
  const [selectedCell, setSelectedCell] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [confusionMatrixData, setConfusionMatrixData] = useState(null);
  const [transitionMatrixData, setTransitionMatrixData] = useState(null);
  const [calibrationPerTypeData, setCalibrationPerTypeData] = useState([]);
  const [recordsData, setRecordsData] = useState(null);
  const [minCount, setMinCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load benchmarks on mount
  useEffect(() => {
    const fetchBenchmarks = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/benchmarks');
        const data = await response.json();
        setBenchmarks(data);
        if (data.length > 0) {
          setSelectedBenchmark(data[0].id);
        }
      } catch (err) {
        setError('Failed to load benchmarks');
        console.error('Error loading benchmarks:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBenchmarks();
  }, []);

  // Load runs when benchmark changes
  useEffect(() => {
    if (!selectedBenchmark) return;

    const fetchRuns = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/runs?benchmark_id=${selectedBenchmark}`);
        const data = await response.json();
        setRuns(data);
        setSelectedRun(data.length > 0 ? data[0].id : null);
        setSelectedRun2(data.length > 1 ? data[1].id : null);
      } catch (err) {
        setError('Failed to load runs');
        console.error('Error loading runs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRuns();
  }, [selectedBenchmark]);

  // Load leaderboard when benchmark changes
  useEffect(() => {
    if (!selectedBenchmark) return;

    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(`/api/leaderboard?benchmark_id=${selectedBenchmark}`);
        const data = await response.json();
        setLeaderboardData(data);
      } catch (err) {
        console.error('Error loading leaderboard:', err);
      }
    };
    fetchLeaderboard();
  }, [selectedBenchmark]);

  // Load confusion matrix when run or filter changes
  useEffect(() => {
    if (!selectedRun) return;

    const fetchConfusionMatrix = async () => {
      try {
        setLoading(true);
        let url = `/api/confusion-matrix?run_id=${selectedRun}`;
        if (filter === 'incorrect') {
          url += '&filter=incorrect';
        }
        const response = await fetch(url);
        const data = await response.json();
        setConfusionMatrixData(data);
        setSelectedCell(null);
      } catch (err) {
        setError('Failed to load confusion matrix');
        console.error('Error loading confusion matrix:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfusionMatrix();
  }, [selectedRun, filter]);

  // Load calibration per type when run changes
  useEffect(() => {
    if (!selectedRun) return;

    const fetchCalibrationPerType = async () => {
      try {
        const response = await fetch(`/api/calibration-per-type?run_id=${selectedRun}`);
        const data = await response.json();
        setCalibrationPerTypeData(data);
      } catch (err) {
        console.error('Error loading calibration per type:', err);
      }
    };
    fetchCalibrationPerType();
  }, [selectedRun]);

  // Load transition matrix when runs change
  useEffect(() => {
    if (!selectedRun || !selectedRun2 || viewMode !== 'transition') return;

    const fetchTransitionMatrix = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/transition-matrix?run_id1=${selectedRun}&run_id2=${selectedRun2}&min_count=${minCount}`
        );
        const data = await response.json();
        setTransitionMatrixData(data);
        setSelectedCell(null);
      } catch (err) {
        setError('Failed to load transition matrix');
        console.error('Error loading transition matrix:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransitionMatrix();
  }, [selectedRun, selectedRun2, viewMode, minCount]);

  // Handle confusion matrix cell click
  const handleCellClick = async (trueVal, predVal) => {
    setSelectedCell({ true: trueVal, pred: predVal });
    try {
      const response = await fetch(
        `/api/records?run_id=${selectedRun}&true_type=${trueVal}&pred_type=${predVal}&limit=100`
      );
      const data = await response.json();
      setRecordsData(data);
    } catch (err) {
      console.error('Error loading records:', err);
    }
  };

  // Handle subtype confusion matrix cell click
  const handleSubtypeCellClick = async (trueSubtype, predSubtype) => {
    setSelectedCell({ trueSubtype, predSubtype });
    try {
      const response = await fetch(
        `/api/records?run_id=${selectedRun}&true_subtype=${trueSubtype}&pred_subtype=${predSubtype}&limit=100`
      );
      const data = await response.json();
      setRecordsData(data);
    } catch (err) {
      console.error('Error loading records:', err);
    }
  };

  // Handle transition matrix cell click
  const handleTransitionCellClick = async (run1Val, run2Val) => {
    setSelectedCell({ run1: run1Val, run2: run2Val });
    try {
      const response = await fetch(
        `/api/records?run_id=${selectedRun}&pred_subtype=${run1Val}&limit=100`
      );
      const data = await response.json();
      setRecordsData(data);
    } catch (err) {
      console.error('Error loading records:', err);
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Classification Evaluation & Analysis System</h1>
      </header>

      <div className="dashboard-controls">
        <BenchmarkDropdown
          benchmarks={benchmarks}
          selectedBenchmark={selectedBenchmark}
          onSelect={setSelectedBenchmark}
        />

        <RunSelector
          runs={runs}
          selectedRun={selectedRun}
          selectedRun2={selectedRun2}
          onRunSelect={setSelectedRun}
          onRun2Select={setSelectedRun2}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        <div className="filter-controls">
          <label>Filter: </label>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All Predictions</option>
            <option value="incorrect">Incorrect Only</option>
          </select>
        </div>

        {viewMode === 'transition' && (
          <div className="transition-controls">
            <label>Min Changed Records: </label>
            <input
              type="range"
              min="1"
              max="50"
              value={minCount}
              onChange={e => setMinCount(parseInt(e.target.value))}
            />
            <span>{minCount}</span>
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      <LeaderboardWidget data={leaderboardData} />

      {calibrationPerTypeData.length > 0 && (
        <CalibrationPerTypePanel
          data={calibrationPerTypeData}
          runName={selectedRun ? runs.find(r => r.id === selectedRun)?.run_name : ''}
        />
      )}

      <div className="main-content">
        <div className="visualization-panel">
          {viewMode === 'confusion' ? (
            <ConfusionMatrixPanel
              data={confusionMatrixData}
              selectedCell={selectedCell}
              onCellClick={handleCellClick}
              onSubtypeCellClick={handleSubtypeCellClick}
              loading={loading}
            />
          ) : (
            <TransitionMatrixPanel
              data={transitionMatrixData}
              selectedCell={selectedCell}
              onCellClick={handleTransitionCellClick}
              loading={loading}
            />
          )}
        </div>

        {recordsData && (
          <div className="records-panel">
            <RowLevelTable data={recordsData} />
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
