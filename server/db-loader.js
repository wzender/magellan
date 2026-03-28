/**
 * PostgreSQL Data Loader
 * Same interface as csv-loader.js but reads from PostgreSQL.
 *
 * Schema
 * ------
 * leaderboard table columns:
 *   benchmark_id, benchmark_name, run_name, model_name,
 *   subtype_accuracy, subtype_f1_weighted
 *
 * Per-run tables named:  "{benchmark_id}_{sanitized(run_name)}"
 *   e.g. "1_model_v1", "3_perfect_model"
 *   columns: benchmark_id, rec_id, true_type, true_subtype,
 *            pred_type, pred_subtype, attributes, metadata
 */

const { query } = require('./db');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
}

function runTableName(benchmarkId, runName) {
  return `${benchmarkId}_${sanitize(runName)}`;
}

function parseJsonFields(row) {
  return {
    ...row,
    attributes: typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {}),
    metadata:   typeof row.metadata   === 'string' ? JSON.parse(row.metadata)   : (row.metadata   || {}),
  };
}

// ── Run index (cached) ────────────────────────────────────────────────────────
// Assigns stable synthetic run_ids (row order from leaderboard) so the rest
// of the app can use integer IDs without knowing about table names.

let _runIndex = null;

async function getRunIndex() {
  if (_runIndex) return _runIndex;

  const result = await query(
    `SELECT benchmark_id, benchmark_name, run_name, model_name,
            subtype_accuracy, subtype_f1_weighted
     FROM leaderboard
     ORDER BY benchmark_id ASC, run_name ASC`
  );

  const benchmarks = [];
  const seenBenchmarks = new Set();
  const runs = [];
  const leaderboard = [];

  result.rows.forEach((row, i) => {
    const runId       = i + 1;
    const benchmarkId = parseInt(row.benchmark_id);

    if (!seenBenchmarks.has(benchmarkId)) {
      seenBenchmarks.add(benchmarkId);
      benchmarks.push({ id: benchmarkId, name: row.benchmark_name });
    }

    runs.push({
      id:            runId,
      benchmark_id:  benchmarkId,
      run_name:      row.run_name,
      model_version: row.model_name,
    });

    leaderboard.push({
      id:                  runId,
      run_id:              runId,
      benchmark_id:        benchmarkId,
      run_name:            row.run_name,
      model_version:       row.model_name,
      subtype_accuracy:    parseFloat(row.subtype_accuracy),
      subtype_f1_weighted: parseFloat(row.subtype_f1_weighted),
    });
  });

  _runIndex = { benchmarks, runs, leaderboard };
  return _runIndex;
}

function runById(runs, id) {
  return runs.find(r => r.id === id);
}

// ── Query functions ───────────────────────────────────────────────────────────

async function getAllBenchmarks() {
  const { benchmarks } = await getRunIndex();
  return benchmarks;
}

async function getBenchmark(id) {
  const { benchmarks } = await getRunIndex();
  return benchmarks.find(b => b.id === id) || null;
}

async function getRunsByBenchmarkId(benchmarkId) {
  const { runs } = await getRunIndex();
  return runs.filter(r => r.benchmark_id === benchmarkId);
}

async function getRun(id) {
  const { runs } = await getRunIndex();
  return runById(runs, id) || null;
}

async function getLeaderboardByBenchmarkId(benchmarkId) {
  const { leaderboard, runs } = await getRunIndex();
  const rows = leaderboard.filter(l => l.benchmark_id === benchmarkId);

  // Fetch benchmark_length from each run table in parallel
  await Promise.all(rows.map(async l => {
    const run = runById(runs, l.run_id);
    const tbl = runTableName(l.benchmark_id, run.run_name);
    try {
      const r = await query(`SELECT COUNT(*) AS cnt FROM "${tbl}"`);
      l.benchmark_length = parseInt(r.rows[0].cnt);
    } catch {
      l.benchmark_length = 0;
    }
  }));

  return rows.sort((a, b) => b.subtype_f1_weighted - a.subtype_f1_weighted);
}

async function getConfusionMatrix(runId, _matrixType = 'type', incorrectOnly = false) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) return { type_matrix: { rows: [], cols: [], data: {} }, subtype_matrix: [] };

  const tbl = runTableName(run.benchmark_id, run.run_name);
  const incorrectClause = incorrectOnly ? ' AND pred_subtype != true_subtype' : '';

  const result = await query(
    `SELECT true_type, pred_type, true_subtype, pred_subtype, COUNT(*) AS cnt
     FROM "${tbl}"
     WHERE 1=1${incorrectClause}
     GROUP BY true_type, pred_type, true_subtype, pred_subtype`
  );

  const types = new Set();
  const typeMatrix = {};
  const seenPairs = new Set();
  const subtypeData = [];

  result.rows.forEach(row => {
    const tt = row.true_type, pt = row.pred_type;
    const ts = row.true_subtype, ps = row.pred_subtype;
    const cnt = parseInt(row.cnt);

    types.add(tt); types.add(pt);
    if (!typeMatrix[tt]) typeMatrix[tt] = {};
    typeMatrix[tt][pt] = (typeMatrix[tt][pt] || 0) + cnt;

    const key = `${tt}|${pt}|${ts}|${ps}`;
    if (!seenPairs.has(key)) {
      seenPairs.add(key);
      subtypeData.push({ true_type: tt, pred_type: pt, true_subtype: ts, pred_subtype: ps, count: cnt });
    }
  });

  const typeArray = Array.from(types).sort();
  typeArray.forEach(t => {
    if (!typeMatrix[t]) typeMatrix[t] = {};
    typeArray.forEach(p => { if (typeMatrix[t][p] === undefined) typeMatrix[t][p] = 0; });
  });

  return {
    type_matrix: { rows: typeArray, cols: typeArray, data: typeMatrix },
    subtype_matrix: subtypeData.sort((a, b) => b.count - a.count),
  };
}

async function getSubtypeMatrixForTypePair(runId, trueType, predType, incorrectOnly = false) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) return { rows: [], cols: [], data: {} };

  const tbl = runTableName(run.benchmark_id, run.run_name);
  const incorrectClause = incorrectOnly ? ' AND pred_subtype != true_subtype' : '';

  const result = await query(
    `SELECT true_subtype, pred_subtype, COUNT(*) AS cnt
     FROM "${tbl}"
     WHERE true_type = $1 AND pred_type = $2${incorrectClause}
     GROUP BY true_subtype, pred_subtype`,
    [trueType, predType]
  );

  const subtypes = new Set();
  const matrixData = {};

  result.rows.forEach(row => {
    const ts = row.true_subtype, ps = row.pred_subtype;
    subtypes.add(ts); subtypes.add(ps);
    if (!matrixData[ts]) matrixData[ts] = {};
    matrixData[ts][ps] = parseInt(row.cnt);
  });

  const subtypeArray = Array.from(subtypes).sort();
  subtypeArray.forEach(t => {
    if (!matrixData[t]) matrixData[t] = {};
    subtypeArray.forEach(p => { if (matrixData[t][p] === undefined) matrixData[t][p] = 0; });
  });

  return { rows: subtypeArray, cols: subtypeArray, data: matrixData };
}

async function getTransitionMatrix(runId1, runId2, minCount = 1) {
  const { runs } = await getRunIndex();
  const run1 = runById(runs, runId1);
  const run2 = runById(runs, runId2);
  if (!run1 || !run2) return { rows: [], cols: [], data: {} };

  const tbl1 = runTableName(run1.benchmark_id, run1.run_name);
  const tbl2 = runTableName(run2.benchmark_id, run2.run_name);

  // Single query: join on rec_id, group by pred pairs + true_subtype
  const result = await query(
    `SELECT r1.pred_subtype AS run1_pred,
            r2.pred_subtype AS run2_pred,
            r1.true_subtype AS true_subtype,
            COUNT(*)        AS cnt
     FROM "${tbl1}" r1
     JOIN "${tbl2}" r2 ON r1.rec_id = r2.rec_id
     WHERE r1.pred_subtype <> r2.pred_subtype
     GROUP BY r1.pred_subtype, r2.pred_subtype, r1.true_subtype`
  );

  const transitionData = {};

  result.rows.forEach(row => {
    const run1Pred = row.run1_pred;
    const run2Pred = row.run2_pred;
    const trueSub  = row.true_subtype;
    const cnt      = parseInt(row.cnt);

    if (!transitionData[run1Pred]) transitionData[run1Pred] = {};
    if (!transitionData[run1Pred][run2Pred]) {
      transitionData[run1Pred][run2Pred] = { total: 0, run1Correct: 0, run2Correct: 0, bothWrong: 0 };
    }

    const cell = transitionData[run1Pred][run2Pred];
    cell.total += cnt;
    const r1c = run1Pred === trueSub;
    const r2c = run2Pred === trueSub;
    if      (r1c && !r2c)  cell.run1Correct += cnt;
    else if (!r1c && r2c)  cell.run2Correct += cnt;
    else if (!r1c && !r2c) cell.bothWrong   += cnt;
  });

  const filteredData = {};
  const filteredSubtypes = new Set();
  Object.keys(transitionData).forEach(r1 => {
    Object.keys(transitionData[r1]).forEach(r2 => {
      if (transitionData[r1][r2].total >= minCount) {
        if (!filteredData[r1]) filteredData[r1] = {};
        filteredData[r1][r2] = transitionData[r1][r2];
        filteredSubtypes.add(r1);
        filteredSubtypes.add(r2);
      }
    });
  });

  const subtypeArray = Array.from(filteredSubtypes).sort();
  return { rows: subtypeArray, cols: subtypeArray, data: filteredData };
}

async function getRecords(filters = {}) {
  const { runs } = await getRunIndex();
  const limit  = filters.limit  || 100;
  const offset = filters.offset || 0;

  if (filters.run_id2) {
    const run1 = runById(runs, filters.run_id1 || filters.run_id);
    const run2 = runById(runs, filters.run_id2);
    if (!run1 || !run2) return { data: [], pagination: { total: 0, limit, offset, pages: 0 } };

    const tbl1 = runTableName(run1.benchmark_id, run1.run_name);
    const tbl2 = runTableName(run2.benchmark_id, run2.run_name);

    const params = [];
    let p = 1;
    let where = 'r1.pred_subtype <> r2.pred_subtype';

    if (filters.run1_pred_subtype) { where += ` AND r1.pred_subtype = $${p++}`; params.push(filters.run1_pred_subtype); }
    if (filters.run2_pred_subtype) { where += ` AND r2.pred_subtype = $${p++}`; params.push(filters.run2_pred_subtype); }
    if (filters.true_type)         { where += ` AND r1.true_type    = $${p++}`; params.push(filters.true_type); }
    if (filters.pred_type)         { where += ` AND r1.pred_type    = $${p++}`; params.push(filters.pred_type); }

    const baseSQL = `FROM "${tbl1}" r1 JOIN "${tbl2}" r2 ON r1.rec_id = r2.rec_id WHERE ${where}`;

    const [dataResult, countResult] = await Promise.all([
      query(`SELECT r1.rec_id AS record_id,
                    r1.true_type, r1.true_subtype, r1.pred_type, r1.pred_subtype,
                    r2.pred_type AS run2_pred_type, r2.pred_subtype AS run2_pred_subtype,
                    r1.attributes, r1.metadata
             ${baseSQL} ORDER BY r1.rec_id LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset]),
      query(`SELECT COUNT(*) AS total ${baseSQL}`, params),
    ]);

    const total = parseInt(countResult.rows[0].total);
    return {
      data: dataResult.rows.map(parseJsonFields),
      pagination: { total, limit, offset, pages: Math.ceil(total / limit) },
    };
  }

  // Single-run mode
  const run = runById(runs, filters.run_id);
  if (!run) return { data: [], pagination: { total: 0, limit, offset, pages: 0 } };

  const tbl = runTableName(run.benchmark_id, run.run_name);
  const params = [];
  let p = 1;
  let where = '1=1';

  if (filters.true_type)     { where += ` AND true_type    = $${p++}`; params.push(filters.true_type); }
  if (filters.pred_type)     { where += ` AND pred_type    = $${p++}`; params.push(filters.pred_type); }
  if (filters.true_subtype)  { where += ` AND true_subtype = $${p++}`; params.push(filters.true_subtype); }
  if (filters.pred_subtype)  { where += ` AND pred_subtype = $${p++}`; params.push(filters.pred_subtype); }
  if (filters.incorrectOnly) { where += ` AND pred_subtype != true_subtype`; }

  const baseSQL = `FROM "${tbl}" WHERE ${where}`;

  const [dataResult, countResult] = await Promise.all([
    query(`SELECT rec_id AS record_id, true_type, true_subtype, pred_type, pred_subtype,
                  attributes, metadata
           ${baseSQL} ORDER BY rec_id LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limit, offset]),
    query(`SELECT COUNT(*) AS total ${baseSQL}`, params),
  ]);

  const total = parseInt(countResult.rows[0].total);
  return {
    data: dataResult.rows.map(parseJsonFields),
    pagination: { total, limit, offset, pages: Math.ceil(total / limit) },
  };
}

module.exports = {
  getAllBenchmarks,
  getBenchmark,
  getRunsByBenchmarkId,
  getRun,
  getLeaderboardByBenchmarkId,
  getConfusionMatrix,
  getSubtypeMatrixForTypePair,
  getTransitionMatrix,
  getRecords,
};
