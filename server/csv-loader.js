/**
 * CSV Data Loader
 * Replaces PostgreSQL database with CSV files
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

const DATA_DIR = path.join(__dirname, '../data');

// Cache for loaded data
let dataCache = null;

function loadData() {
  if (dataCache) return dataCache;

  const data = {
    benchmarks: [],
    runs: [],
    leaderboard: [],
    run_results: [],
  };

  try {
    // Load benchmarks
    const benchmarksFile = fs.readFileSync(path.join(DATA_DIR, 'benchmarks.csv'), 'utf-8');
    data.benchmarks = csv.parse(benchmarksFile, {
      columns: true,
      skip_empty_lines: true,
    }).map(row => ({
      ...row,
      id: parseInt(row.id),
    }));

    // Load runs
    const runsFile = fs.readFileSync(path.join(DATA_DIR, 'runs.csv'), 'utf-8');
    data.runs = csv.parse(runsFile, {
      columns: true,
      skip_empty_lines: true,
    }).map(row => ({
      ...row,
      id: parseInt(row.id),
      benchmark_id: parseInt(row.benchmark_id),
    }));

    // Load leaderboard
    const leaderboardFile = fs.readFileSync(path.join(DATA_DIR, 'leaderboard.csv'), 'utf-8');
    data.leaderboard = csv.parse(leaderboardFile, {
      columns: true,
      skip_empty_lines: true,
    }).map(row => ({
      ...row,
      id: parseInt(row.id),
      run_id: parseInt(row.run_id),
      benchmark_id: parseInt(row.benchmark_id),
      benchmark_length: parseInt(row.benchmark_length),
      subtype_accuracy: parseFloat(row.subtype_accuracy),
      subtype_f1_weighted: parseFloat(row.subtype_f1_weighted),
      type_f1_weighted: parseFloat(row.type_f1_weighted),
    }));

    // Load run_results
    const resultsFile = fs.readFileSync(path.join(DATA_DIR, 'run_results.csv'), 'utf-8');
    data.run_results = csv.parse(resultsFile, {
      columns: true,
      skip_empty_lines: true,
    }).map(row => ({
      ...row,
      id: parseInt(row.id),
      run_id: parseInt(row.run_id),
    }));

    dataCache = data;
    console.log('✓ CSV data loaded successfully');
  } catch (error) {
    console.error('Error loading CSV data:', error.message);
    throw error;
  }

  return data;
}

// Query functions matching database API

function getAllBenchmarks() {
  const data = loadData();
  return data.benchmarks;
}

function getBenchmark(id) {
  const data = loadData();
  return data.benchmarks.find(b => b.id === id);
}

function getRunsByBenchmarkId(benchmarkId) {
  const data = loadData();
  return data.runs.filter(r => r.benchmark_id === benchmarkId);
}

function getRun(id) {
  const data = loadData();
  return data.runs.find(r => r.id === id);
}

function getLeaderboardByBenchmarkId(benchmarkId) {
  const data = loadData();
  return data.leaderboard
    .filter(l => l.benchmark_id === benchmarkId)
    .map(l => {
      const run = data.runs.find(r => r.id === l.run_id);
      return {
        ...l,
        run_name: run?.run_name,
        model_version: run?.model_version,
      };
    })
    .sort((a, b) => parseFloat(b.subtype_f1_weighted) - parseFloat(a.subtype_f1_weighted));
}

function getConfusionMatrix(runId) {
  const data = loadData();
  const results = data.run_results.filter(r => r.run_id === runId);

  // Build type matrix
  const types = new Set();
  results.forEach(r => {
    types.add(r.true_type);
    types.add(r.pred_type);
  });
  const typeArray = Array.from(types).sort();

  const typeMatrix = {};
  typeArray.forEach(t => {
    typeMatrix[t] = {};
    typeArray.forEach(p => {
      typeMatrix[t][p] = results.filter(r => r.true_type === t && r.pred_type === p).length;
    });
  });

  // Build subtype data with type information
  const subtypeData = [];
  const subtype_pairs = new Set();
  results.forEach(r => {
    const key = `${r.true_type}|${r.pred_type}|${r.true_subtype}|${r.pred_subtype}`;
    if (!subtype_pairs.has(key)) {
      subtype_pairs.add(key);
      subtypeData.push({
        true_type: r.true_type,
        pred_type: r.pred_type,
        true_subtype: r.true_subtype,
        pred_subtype: r.pred_subtype,
        count: results.filter(
          x => x.true_type === r.true_type && x.pred_type === r.pred_type && x.true_subtype === r.true_subtype && x.pred_subtype === r.pred_subtype
        ).length,
      });
    }
  });

  return {
    type_matrix: {
      rows: typeArray,
      cols: typeArray,
      data: typeMatrix,
    },
    subtype_matrix: subtypeData.sort((a, b) => b.count - a.count),
  };
}

function getTransitionMatrix(runId1, runId2, minCount = 1) {
  const data = loadData();
  const results1 = data.run_results.filter(r => r.run_id === runId1);
  const results2 = data.run_results.filter(r => r.run_id === runId2);

  const recordMap = {};
  results1.forEach(r => {
    recordMap[r.record_id] = {
      pred_subtype: r.pred_subtype,
      true_subtype: r.true_subtype,
      isCorrect: r.pred_subtype === r.true_subtype
    };
  });

  const transitionData = {};
  const subtypes = new Set();

  results2.forEach(r => {
    const run1Data = recordMap[r.record_id];
    if (run1Data && run1Data.pred_subtype !== r.pred_subtype) {
      const run1Pred = run1Data.pred_subtype;
      const run2Pred = r.pred_subtype;
      const trueSubtype = run1Data.true_subtype;

      if (!transitionData[run1Pred]) transitionData[run1Pred] = {};
      if (!transitionData[run1Pred][run2Pred]) {
        transitionData[run1Pred][run2Pred] = {
          total: 0,
          run1Correct: 0,    // run1 prediction matches true
          run2Correct: 0,    // run2 prediction matches true
          bothWrong: 0       // both predictions are wrong
        };
      }

      const cell = transitionData[run1Pred][run2Pred];
      cell.total++;

      const run1IsCorrect = run1Pred === trueSubtype;
      const run2IsCorrect = run2Pred === trueSubtype;

      if (run1IsCorrect && !run2IsCorrect) {
        cell.run1Correct++;
      } else if (!run1IsCorrect && run2IsCorrect) {
        cell.run2Correct++;
      } else if (!run1IsCorrect && !run2IsCorrect) {
        cell.bothWrong++;
      }
      // Both correct is impossible in a transition matrix

      subtypes.add(run1Pred);
      subtypes.add(run2Pred);
    }
  });

  // Filter out transitions with count < minCount
  const filteredTransitionData = {};
  const filteredSubtypes = new Set();

  Object.keys(transitionData).forEach(run1Subtype => {
    Object.keys(transitionData[run1Subtype]).forEach(run2Subtype => {
      const cell = transitionData[run1Subtype][run2Subtype];
      if (cell.total >= minCount) {
        if (!filteredTransitionData[run1Subtype]) {
          filteredTransitionData[run1Subtype] = {};
        }
        filteredTransitionData[run1Subtype][run2Subtype] = cell;
        filteredSubtypes.add(run1Subtype);
        filteredSubtypes.add(run2Subtype);
      }
    });
  });

  const subtypeArray = Array.from(filteredSubtypes).sort();

  return {
    rows: subtypeArray,
    cols: subtypeArray,
    data: filteredTransitionData,
  };
}

function getRecords(filters = {}) {
  const data = loadData();
  let results = data.run_results;

  if (filters.run_id) results = results.filter(r => r.run_id === filters.run_id);
  if (filters.true_type) results = results.filter(r => r.true_type === filters.true_type);
  if (filters.pred_type) results = results.filter(r => r.pred_type === filters.pred_type);
  if (filters.true_subtype)
    results = results.filter(r => r.true_subtype === filters.true_subtype);
  if (filters.pred_subtype)
    results = results.filter(r => r.pred_subtype === filters.pred_subtype);

  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  return {
    data: results.slice(offset, offset + limit),
    pagination: {
      total: results.length,
      limit,
      offset,
      pages: Math.ceil(results.length / limit),
    },
  };
}

module.exports = {
  loadData,
  getAllBenchmarks,
  getBenchmark,
  getRunsByBenchmarkId,
  getRun,
  getLeaderboardByBenchmarkId,
  getConfusionMatrix,
  getTransitionMatrix,
  getRecords,
};
