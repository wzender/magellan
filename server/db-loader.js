/**
 * PostgreSQL Data Loader
 * Same interface as csv-loader.js but reads from PostgreSQL.
 *
 * Schema
 * ------
 * "leaderboard-table" columns:
 *   run_id (text, the actual run table name), nof_items, subtype_accuracy,
 *   description, benchmark (text, explicit benchmark name)
 *
 * Per-run tables named: "{YYYYMMDD}-{HHMM}-{benchmark_name}"
 *   e.g. "20261230-1445-Test-benchmark"
 *   columns: request_id or record_id, true_type, true_subtype, pred_type,
 *            pred_subtype,
 *            attributes, metadata
 *
 * Benchmarks are read directly from the "benchmark" column in leaderboard-table.
 */

const { query, pool } = require('./db');
const idColumnCache = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function tryParseJson(value) {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch { return value; }
}

function parseJsonFields(row) {
  return {
    ...row,
    attributes:    tryParseJson(row.attributes),
    en_attributes: tryParseJson(row.en_attributes),
    metadata:      tryParseJson(row.metadata),
    en_metadata:   tryParseJson(row.en_metadata),
  };
}

// Returns true for PostgreSQL "relation does not exist" (42P01)
function isTableMissing(err) {
  return err.code === '42P01';
}

async function getIdColumn(tableName) {
  if (idColumnCache.has(tableName)) return idColumnCache.get(tableName);

  const result = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = $1
       AND column_name IN ('request_id', 'record_id')
     ORDER BY CASE column_name WHEN 'request_id' THEN 0 ELSE 1 END
     LIMIT 1`,
    [tableName]
  );

  if (result.rows.length === 0) {
    throw new Error(`No request identifier column found for table "${tableName}"`);
  }

  const columnName = result.rows[0].column_name;
  idColumnCache.set(tableName, columnName);
  return columnName;
}

// ── Run index (cached) ────────────────────────────────────────────────────────
// Assigns stable synthetic run_ids (row order from leaderboard) so the rest
// of the app can use integer IDs without knowing about table names.

async function getRunIndex() {

  const [result, tablesResult] = await Promise.all([
    query(
      `SELECT run_id, nof_items, subtype_accuracy, description, benchmark
       FROM "leaderboard-table"
       ORDER BY run_id ASC`
    ),
    query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema()`
    ),
  ]);

  const existingTables = new Set(tablesResult.rows.map(r => r.table_name));

  const benchmarks = [];
  const seenBenchmarks = new Map(); // benchmark_name -> id
  const runs = [];
  const leaderboard = [];

  result.rows.forEach((row, i) => {
    const syntheticRunId = i + 1;
    const tableName      = row.run_id;
    const benchmarkName  = row.benchmark || row.run_id.replace(/^\d{8}-\d{4}-/, '').replace(/-/g, ' ');

    if (!seenBenchmarks.has(benchmarkName)) {
      const newId = seenBenchmarks.size + 1;
      seenBenchmarks.set(benchmarkName, newId);
      benchmarks.push({ id: newId, name: benchmarkName });
    }

    const benchmarkId = seenBenchmarks.get(benchmarkName);

    runs.push({
      id:            syntheticRunId,
      benchmark_id:  benchmarkId,
      run_name:      tableName,
      model_version: row.description || '',
    });

    leaderboard.push({
      id:                  syntheticRunId,
      run_id:              syntheticRunId,
      benchmark_id:        benchmarkId,
      run_name:            tableName,
      model_version:       row.description || '',
      subtype_accuracy:    parseFloat(row.subtype_accuracy) || 0,
      subtype_f1_weighted: parseFloat(row.subtype_accuracy) || 0, // use accuracy as proxy
      benchmark_length:    parseInt(row.nof_items) || 0,
      table_exists:        existingTables.has(tableName),
    });
  });

  return { benchmarks, runs, leaderboard };
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
  const { leaderboard } = await getRunIndex();
  const rows = leaderboard.filter(l => l.benchmark_id === benchmarkId);
  // benchmark_length already populated from nof_items; no extra query needed
  return rows.sort((a, b) => b.subtype_accuracy - a.subtype_accuracy);
}

async function getConfusionMatrix(runId, _matrixType = 'type', incorrectOnly = false) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) return { type_matrix: { rows: [], cols: [], data: {} }, subtype_matrix: [] };

  const tbl = run.run_name;
  const incorrectClause = incorrectOnly ? ' AND pred_subtype != true_subtype' : '';

  let result;
  try {
    result = await query(
      `SELECT true_type, pred_type, true_subtype, pred_subtype, COUNT(*) AS cnt
       FROM "${tbl}"
       WHERE 1=1${incorrectClause}
       GROUP BY true_type, pred_type, true_subtype, pred_subtype`
    );
  } catch (err) {
    if (isTableMissing(err)) { console.warn(`⚠ Table not found: ${tbl}`); return { type_matrix: { rows: [], cols: [], data: {} }, subtype_matrix: [] }; }
    throw err;
  }

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

  const tbl = run.run_name;
  const incorrectClause = incorrectOnly ? ' AND pred_subtype != true_subtype' : '';

  let result;
  try {
    result = await query(
      `SELECT true_subtype, pred_subtype, COUNT(*) AS cnt
       FROM "${tbl}"
       WHERE true_type = $1 AND pred_type = $2${incorrectClause}
       GROUP BY true_subtype, pred_subtype`,
      [trueType, predType]
    );
  } catch (err) {
    if (isTableMissing(err)) { console.warn(`⚠ Table not found: ${tbl}`); return { rows: [], cols: [], data: {} }; }
    throw err;
  }

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

  const tbl1 = run1.run_name;
  const tbl2 = run2.run_name;
  const [idCol1, idCol2] = await Promise.all([getIdColumn(tbl1), getIdColumn(tbl2)]);

  let result;
  try {
    result = await query(
      `SELECT r1.pred_subtype AS run1_pred,
              r2.pred_subtype AS run2_pred,
              r1.true_subtype AS true_subtype,
              COUNT(*)        AS cnt
       FROM "${tbl1}" r1
       JOIN "${tbl2}" r2 ON r1.${idCol1} = r2.${idCol2}
       WHERE r1.pred_subtype <> r2.pred_subtype
       GROUP BY r1.pred_subtype, r2.pred_subtype, r1.true_subtype`
    );
  } catch (err) {
    if (isTableMissing(err)) { console.warn(`⚠ Table not found: ${tbl1} or ${tbl2}`); return { rows: [], cols: [], data: {} }; }
    throw err;
  }

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

    const tbl1 = run1.run_name;
    const tbl2 = run2.run_name;
    const [idCol1, idCol2] = await Promise.all([getIdColumn(tbl1), getIdColumn(tbl2)]);

    const params = [];
    let p = 1;
    let where = 'r1.pred_subtype <> r2.pred_subtype';

    if (filters.run1_pred_subtype) { where += ` AND r1.pred_subtype = $${p++}`; params.push(filters.run1_pred_subtype); }
    if (filters.run2_pred_subtype) { where += ` AND r2.pred_subtype = $${p++}`; params.push(filters.run2_pred_subtype); }
    if (filters.true_type)         { where += ` AND r1.true_type    = $${p++}`; params.push(filters.true_type); }
    if (filters.pred_type)         { where += ` AND r1.pred_type    = $${p++}`; params.push(filters.pred_type); }

    const baseSQL = `FROM "${tbl1}" r1 JOIN "${tbl2}" r2 ON r1.${idCol1} = r2.${idCol2} WHERE ${where}`;

    let dataResult, countResult;
    try {
      [dataResult, countResult] = await Promise.all([
        query(`SELECT r1.${idCol1} AS request_id,
                      r1.true_type, r1.true_subtype, r1.pred_type, r1.pred_subtype,
                      r2.pred_type AS run2_pred_type, r2.pred_subtype AS run2_pred_subtype,
                      r1.attributes, r1.en_attributes, r1.metadata, r1.en_metadata
               ${baseSQL} ORDER BY r1.${idCol1} LIMIT $${p} OFFSET $${p + 1}`,
          [...params, limit, offset]),
        query(`SELECT COUNT(*) AS total ${baseSQL}`, params),
      ]);
    } catch (err) {
      if (isTableMissing(err)) { console.warn(`⚠ Table not found: ${tbl1} or ${tbl2}`); return { data: [], pagination: { total: 0, limit, offset, pages: 0 } }; }
      if (err.code === '42703') {
        // en_metadata column not yet added — fall back without it
        [dataResult, countResult] = await Promise.all([
          query(`SELECT r1.${idCol1} AS request_id,
                        r1.true_type, r1.true_subtype, r1.pred_type, r1.pred_subtype,
                        r2.pred_type AS run2_pred_type, r2.pred_subtype AS run2_pred_subtype,
                        r1.attributes, r1.en_attributes, r1.metadata
                 ${baseSQL} ORDER BY r1.${idCol1} LIMIT $${p} OFFSET $${p + 1}`,
            [...params, limit, offset]),
          query(`SELECT COUNT(*) AS total ${baseSQL}`, params),
        ]);
      } else {
        throw err;
      }
    }

    const total = parseInt(countResult.rows[0].total);
    return {
      data: dataResult.rows.map(parseJsonFields),
      pagination: { total, limit, offset, pages: Math.ceil(total / limit) },
    };
  }

  // Single-run mode
  const run = runById(runs, filters.run_id);
  if (!run) return { data: [], pagination: { total: 0, limit, offset, pages: 0 } };

  const tbl = run.run_name;
  const idCol = await getIdColumn(tbl);
  const params = [];
  let p = 1;
  let where = '1=1';

  if (filters.true_type)     { where += ` AND true_type    = $${p++}`; params.push(filters.true_type); }
  if (filters.pred_type)     { where += ` AND pred_type    = $${p++}`; params.push(filters.pred_type); }
  if (filters.true_subtype)  { where += ` AND true_subtype = $${p++}`; params.push(filters.true_subtype); }
  if (filters.pred_subtype)  { where += ` AND pred_subtype = $${p++}`; params.push(filters.pred_subtype); }
  if (filters.incorrectOnly) { where += ` AND pred_subtype != true_subtype`; }

  const baseSQL = `FROM "${tbl}" WHERE ${where}`;

  let dataResult, countResult;
  try {
    [dataResult, countResult] = await Promise.all([
      query(`SELECT ${idCol} AS request_id, true_type, true_subtype, pred_type, pred_subtype,
                    attributes, en_attributes, metadata, en_metadata
             ${baseSQL} ORDER BY ${idCol} LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset]),
      query(`SELECT COUNT(*) AS total ${baseSQL}`, params),
    ]);
  } catch (err) {
    if (isTableMissing(err)) { console.warn(`⚠ Table not found: ${tbl}`); return { data: [], pagination: { total: 0, limit, offset, pages: 0 } }; }
    if (err.code === '42703') {
      // en_metadata column not yet added — fall back without it
      [dataResult, countResult] = await Promise.all([
        query(`SELECT ${idCol} AS request_id, true_type, true_subtype, pred_type, pred_subtype,
                      attributes, en_attributes, metadata
               ${baseSQL} ORDER BY ${idCol} LIMIT $${p} OFFSET $${p + 1}`,
          [...params, limit, offset]),
        query(`SELECT COUNT(*) AS total ${baseSQL}`, params),
      ]);
    } else {
      throw err;
    }
  }

  const total = parseInt(countResult.rows[0].total);
  return {
    data: dataResult.rows.map(parseJsonFields),
    pagination: { total, limit, offset, pages: Math.ceil(total / limit) },
  };
}

/**
 * Persist a translated en_attributes for a given request_id to all
 * per-run tables (and run_results if it exists).
 */
async function updateTranslation(requestId, attrsEn) {
  const json = JSON.stringify(attrsEn);

  // Per-run tables
  let runRows;
  try {
    const r = await query(`SELECT run_id FROM "leaderboard-table" ORDER BY run_id`);
    runRows = r.rows;
  } catch (err) {
    if (err.code !== '42P01') throw err;
    runRows = [];
  }

  await Promise.all(runRows.map(async ({ run_id: tbl }) => {
    try {
      const colRes = await query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1
           AND column_name IN ('request_id','record_id')
         ORDER BY CASE column_name WHEN 'request_id' THEN 0 ELSE 1 END LIMIT 1`,
        [tbl]
      );
      if (colRes.rows.length === 0) return;
      const idCol = colRes.rows[0].column_name;
      await query(`UPDATE "${tbl}" SET en_attributes = $1 WHERE ${idCol} = $2`, [json, requestId]);
    } catch (err) {
      if (err.code !== '42P01') throw err;
    }
  }));

  // Legacy run_results table (best-effort — silence missing-table noise)
  try {
    await pool.query(`UPDATE run_results SET en_attributes = $1 WHERE record_id = $2`, [json, requestId]);
  } catch { /* table may not exist in this schema */ }
}

async function updateMetadataTranslation(requestId, metaEn) {
  const json = JSON.stringify(metaEn);

  let runRows;
  try {
    const r = await query(`SELECT run_id FROM "leaderboard-table" ORDER BY run_id`);
    runRows = r.rows;
  } catch (err) {
    if (err.code !== '42P01') throw err;
    runRows = [];
  }

  await Promise.all(runRows.map(async ({ run_id: tbl }) => {
    try {
      const colRes = await query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1
           AND column_name IN ('request_id','record_id')
         ORDER BY CASE column_name WHEN 'request_id' THEN 0 ELSE 1 END LIMIT 1`,
        [tbl]
      );
      if (colRes.rows.length === 0) return;
      const idCol = colRes.rows[0].column_name;
      await query(`UPDATE "${tbl}" SET en_metadata = $1 WHERE ${idCol} = $2`, [json, requestId]);
    } catch (err) {
      if (err.code !== '42P01') throw err;
    }
  }));

  try {
    await pool.query(`UPDATE run_results SET en_metadata = $1 WHERE record_id = $2`, [json, requestId]);
  } catch { /* table may not exist in this schema */ }
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
  updateTranslation,
  updateMetadataTranslation,
};
