import React, { useState, useEffect } from 'react';
import './styles.css';
import LeaderboardWidget from './LeaderboardWidget';
import ConfusionMatrixPanel from './ConfusionMatrixPanel';
import TransitionMatrixPanel from './TransitionMatrixPanel';
import RowLevelTable from './RowLevelTable';

/**
 * Main Dashboard Component
 * Single-page application for classification evaluation and analysis
 */
function Dashboard() {
  const [benchmarks, setBenchmarks] = useState([]);
  const [selectedBenchmark, setSelectedBenchmark] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRuns, setSelectedRuns] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedTypePair, setSelectedTypePair] = useState(null);
  const [selectedSubtypePair, setSelectedSubtypePair] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [selectedRunNames, setSelectedRunNames] = useState([]);
  const [confusionMatrixData, setConfusionMatrixData] = useState(null);
  const [transitionMatrixData, setTransitionMatrixData] = useState(null);
  const [subtypeMatrixData, setSubtypeMatrixData] = useState(null);
  const [allRecordsData, setAllRecordsData] = useState(null);
  const [filteredRecordsData, setFilteredRecordsData] = useState(null);
  const [minCount, setMinCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isConfusionMode = selectedRuns.length === 1;
  const isTransitionMode = selectedRuns.length === 2;

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
        // Auto-select first run if available
        if (data.length > 0 && selectedRuns.length === 0) {
          setSelectedRuns([data[0].id]);
        }
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

  // Load confusion matrix when run changes (single run mode)
  useEffect(() => {
    if (selectedRuns.length !== 1) {
      setConfusionMatrixData(null);
      return;
    }

    const fetchConfusionMatrix = async () => {
      try {
        setLoading(true);
        let url = `/api/confusion-matrix?run_id=${selectedRuns[0]}`;
        if (filter === 'incorrect') url += '&filter=incorrect';
        const response = await fetch(url);
        const data = await response.json();
        setConfusionMatrixData(data);
        // Reset drill-down state so stale subtype/record data doesn't linger
        setSelectedCell(null);
        setSelectedTypePair(null);
        setSelectedSubtypePair(null);
        setFilteredRecordsData(null);
      } catch (err) {
        setError('Failed to load confusion matrix');
        console.error('Error loading confusion matrix:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfusionMatrix();
  }, [selectedRuns, filter]);

  // Load subtype confusion matrix when type pair changes
  useEffect(() => {
    if (selectedRuns.length !== 1 || !selectedTypePair) {
      setSubtypeMatrixData(null);
      return;
    }

    const fetchSubtypeMatrix = async () => {
      try {
        setLoading(true);
        let url = `/api/confusion-matrix/subtype?run_id=${selectedRuns[0]}&true_type=${encodeURIComponent(selectedTypePair.true)}&pred_type=${encodeURIComponent(selectedTypePair.pred)}`;
        if (filter === 'incorrect') url += '&filter=incorrect';
        const response = await fetch(url);
        const data = await response.json();
        setSubtypeMatrixData(data.matrix);
      } catch (err) {
        console.error('Error loading subtype matrix:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSubtypeMatrix();
  }, [selectedRuns, selectedTypePair, filter]);

  // Load all records when selected runs change (single run or transition mode)
  useEffect(() => {
    if (selectedRuns.length === 0) return;

    const fetchAllRecords = async () => {
      try {
        let url;
        if (isTransitionMode && selectedRuns.length === 2) {
          url = `/api/records?run_id1=${selectedRuns[0]}&run_id2=${selectedRuns[1]}&limit=1000`;
        } else {
          url = `/api/records?run_id=${selectedRuns[0]}&limit=1000`;
        }

        const response = await fetch(url);
        const data = await response.json();
        setAllRecordsData(data);
        setFilteredRecordsData(data); // Initially show all
        setSelectedTypePair(null);
        setSelectedSubtypePair(null);
      } catch (err) {
        console.error('Error loading all records:', err);
      }
    };

    fetchAllRecords();
  }, [selectedRuns, isTransitionMode]);

  // Fetch filtered records from API when type/subtype selection changes
  useEffect(() => {
    if (selectedRuns.length === 0 || !isConfusionMode) return;

    const fetchFilteredRecords = async () => {
      try {
        let url = `/api/records?run_id=${selectedRuns[0]}&limit=1000`;

        if (filter === 'incorrect') url += '&filter=incorrect';

        if (selectedTypePair) {
          url += `&true_type=${encodeURIComponent(selectedTypePair.true)}&pred_type=${encodeURIComponent(selectedTypePair.pred)}`;
        }

        if (selectedSubtypePair) {
          url += `&true_subtype=${encodeURIComponent(selectedSubtypePair.true_subtype)}&pred_subtype=${encodeURIComponent(selectedSubtypePair.pred_subtype)}`;
        }

        const response = await fetch(url);
        const data = await response.json();
        setFilteredRecordsData(data);
      } catch (err) {
        console.error('Error fetching filtered records:', err);
      }
    };

    fetchFilteredRecords();
  }, [selectedTypePair, selectedSubtypePair, selectedRuns, isConfusionMode, filter]);
  useEffect(() => {
    if (selectedRuns.length !== 2 || minCount < 1) return;

    const fetchTransitionMatrix = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/transition-matrix?run_id1=${selectedRuns[0]}&run_id2=${selectedRuns[1]}&min_count=${minCount}`
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
  }, [selectedRuns, minCount]);

  // Handle run selection by clicking a leaderboard row (single-run confusion mode)
  const handleLeaderboardRunSelect = (runId) => {
    if (selectedRuns.length === 1 && selectedRuns[0] === runId) {
      // keep selected 1 run; no toggle off (maintain at least one active run)
      return;
    }

    setSelectedRuns([runId]);
    setSelectedCell(null);
    setSelectedTypePair(null);
    setSelectedSubtypePair(null);
  };

  // Handle run toggle from checkboxes (selection column, 1-2 runs)
  const handleRunToggle = (runId) => {
    if (selectedRuns.includes(runId)) {
      setSelectedRuns(selectedRuns.filter(id => id !== runId));
    } else if (selectedRuns.length < 2) {
      setSelectedRuns([...selectedRuns, runId]);
    }
    setSelectedCell(null);
    setSelectedTypePair(null);
    setSelectedSubtypePair(null);
  };

  // Track run names for selected run IDs.
  useEffect(() => {
    const selectedNames = selectedRuns
      .map(runId => {
        const match = runs.find(r => String(r.id) === String(runId));
        return match ? match.run_name : null;
      })
      .filter(name => !!name);
    setSelectedRunNames(selectedNames);
  }, [selectedRuns, runs]);

  // Handle confusion matrix type cell click (toggle)
  const handleCellClick = (trueVal, predVal) => {
    if (!trueVal && !predVal) {
      setSelectedCell(null);
      setSelectedTypePair(null);
      setSelectedSubtypePair(null);
      return;
    }

    const isCurrentlySelected =
      selectedTypePair &&
      selectedTypePair.true === trueVal &&
      selectedTypePair.pred === predVal;

    if (isCurrentlySelected) {
      setSelectedCell(null);
      setSelectedTypePair(null);
      setSelectedSubtypePair(null);
    } else {
      setSelectedCell({ true: trueVal, pred: predVal });
      setSelectedTypePair({ true: trueVal, pred: predVal });
      setSelectedSubtypePair(null); // Reset subtype filter when selecting a type
    }
  };

  // Handle subtype confusion matrix cell click (toggle within selected type)
  const handleSubtypeCellClick = (trueSubtype, predSubtype) => {
    if (
      selectedSubtypePair &&
      selectedSubtypePair.true_subtype === trueSubtype &&
      selectedSubtypePair.pred_subtype === predSubtype
    ) {
      setSelectedSubtypePair(null);
      if (selectedTypePair) {
        setSelectedCell({ true: selectedTypePair.true, pred: selectedTypePair.pred });
      } else {
        setSelectedCell(null);
      }
      return;
    }

    setSelectedCell({ trueSubtype, predSubtype });
    setSelectedSubtypePair({ true_subtype: trueSubtype, pred_subtype: predSubtype });
  };

  // Handle transition matrix cell click
  const handleTransitionCellClick = (run1Val, run2Val) => {
    setSelectedCell({ run1: run1Val, run2: run2Val });
    // For transition matrix, show records for the first run value
    setSelectedTypePair(null);
    setSelectedSubtypePair(null);
  };

  // Fetch filtered records for transition mode
  useEffect(() => {
    if (selectedRuns.length !== 2 || !isTransitionMode || !selectedCell) return;

    const fetchTransitionRecords = async () => {
      try {
        let url = `/api/records?run_id1=${selectedRuns[0]}&run_id2=${selectedRuns[1]}&limit=1000`;

        if (selectedCell?.run1) {
          url += `&run1_pred_subtype=${encodeURIComponent(selectedCell.run1)}`;
        }
        if (selectedCell?.run2) {
          url += `&run2_pred_subtype=${encodeURIComponent(selectedCell.run2)}`;
        }

        const response = await fetch(url);
        let data = await response.json();

        // Enforce transition cell filter as a fallback guard
        if (selectedCell?.run1 || selectedCell?.run2) {
          const filteredRows = (data.data || []).filter(row => {
            const run1Match = selectedCell?.run1 ? row.pred_subtype === selectedCell.run1 : true;
            const run2Match = selectedCell?.run2 ? row.run2_pred_subtype === selectedCell.run2 : true;
            return run1Match && run2Match;
          });

          const total = filteredRows.length;
          data = {
            ...data,
            data: filteredRows,
            pagination: {
              ...data.pagination,
              total,
              pages: Math.ceil(total / (data.pagination.limit || 100)),
            },
          };
        }

        setFilteredRecordsData(data);
      } catch (err) {
        console.error('Error fetching transition records:', err);
      }
    };

    fetchTransitionRecords();
  }, [selectedCell, selectedRuns, isTransitionMode]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Classification Evaluation & Analysis System</h1>
      </header>

      <div className="toolbar-row">
        <div className="benchmark-buttons">
          {benchmarks.map(b => (
            <button
              key={b.id}
              className={`benchmark-btn ${selectedBenchmark === b.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedBenchmark(b.id);
                setSelectedRuns([]);
                setSelectedCell(null);
                setSelectedTypePair(null);
                setSelectedSubtypePair(null);
              }}
            >
              {b.name || b.id}
            </button>
          ))}
        </div>

        <div className="toolbar-controls">
          {isConfusionMode && (
            <div className="filter-controls">
              <label>Filter:</label>
              <select value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="all">All Predictions</option>
                <option value="incorrect">Incorrect Only</option>
              </select>
            </div>
          )}

          {isTransitionMode && (
            <div className="transition-controls">
              <label>Min Changed:</label>
              <input
                type="range"
                min="1"
                max="50"
                value={minCount}
                onChange={e => setMinCount(parseInt(e.target.value))}
              />
              <span className="slider-value">{minCount}</span>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <LeaderboardWidget 
        data={leaderboardData} 
        onRunSelect={handleLeaderboardRunSelect}
        onRunToggle={handleRunToggle}
        selectedRuns={selectedRuns}
      />

      <div className="main-content">
        <div className="visualization-panel">
          {isConfusionMode ? (
            <ConfusionMatrixPanel
              data={confusionMatrixData}
              subtypeMatrixData={subtypeMatrixData}
              selectedCell={selectedCell}
              selectedTypePair={selectedTypePair}
              onCellClick={handleCellClick}
              onSubtypeCellClick={handleSubtypeCellClick}
              loading={loading}
              recordsData={filteredRecordsData}
            />
          ) : isTransitionMode ? (
            <TransitionMatrixPanel
              data={transitionMatrixData}
              selectedCell={selectedCell}
              onCellClick={handleTransitionCellClick}
              loading={loading}
              recordsData={filteredRecordsData}
              selectedRunNames={selectedRunNames}
            />
          ) : (
            <div className="no-selection">Please select 1 or 2 runs to view matrices</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;