/**
 * PostgreSQL Data Loader
 * Same interface as csv-loader.js but reads from PostgreSQL.
 *
 * Schema
 * ------
 * "leaderboard-table" columns:
 *   run_id (text, the actual run table name), nof_items, subtype_accuracy,
 *   subtype_weighted_f1,
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

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const PS2_UNKNOWN = (process.env.PRED_SUBTYPE2_UNKNOWN || 'unknown').toLowerCase();
const PS2_MISSING = (process.env.PRED_SUBTYPE2_MISSING || 'missing').toLowerCase();
const { query, pool } = require('./db');
const idColumnCache = new Map();
const SUBTYPES_FILE = path.join(__dirname, '../data/Subtypes.xlsx');
const SUBTYPES_COUNTRIES_COLUMN = process.env.SUBTYPES_COUNTRIES_COLUMN || 'Countries';
let subtypeVocabCache = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function tryParseJson(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch {
    try { return JSON.parse(value.replace(/'/g, '"')); } catch { return value; }
  }
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

function normalizeCountry(value) {
  return String(value || '').trim().toLowerCase();
}

function countriesTextMatchesCountry(countriesValue, country) {
  const text = normalizeCountry(countriesValue);
  const normalizedCountry = normalizeCountry(country);
  if (!text || !normalizedCountry) return false;

  if (text.includes(normalizedCountry)) return true;

  const baseCountry = normalizedCountry.split('_')[0];
  return Boolean(baseCountry) && baseCountry !== normalizedCountry && text.includes(baseCountry);
}

function loadSubtypeVocabs() {
  if (subtypeVocabCache) return subtypeVocabCache;
  if (!fs.existsSync(SUBTYPES_FILE)) {
    subtypeVocabCache = { all: new Set(), rows: [] };
    return subtypeVocabCache;
  }

  const wb = XLSX.readFile(SUBTYPES_FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const all = new Set();
  const normalizedRows = [];

  for (const row of rows) {
    const subtype = String(row.subType || row.Subtype || '').toLowerCase();
    if (!subtype) continue;
    all.add(subtype);
    normalizedRows.push({ subtype, countriesText: String(row[SUBTYPES_COUNTRIES_COLUMN] || '') });
  }

  subtypeVocabCache = { all, rows: normalizedRows };
  return subtypeVocabCache;
}

function candidateUnknownsCountries(run) {
  const candidates = [];
  const add = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    const normalized = normalizeCountry(text);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);

    const stripped = normalized.replace(/^\d{8}-\d{4}-/, '');
    if (stripped && !candidates.includes(stripped)) candidates.push(stripped);

    stripped.split(/[-_\s]+/).filter(Boolean).forEach(token => {
      if (!candidates.includes(token)) candidates.push(token);
    });
  };

  add(run?.run_name);
  add(run?.model_version);
  return candidates;
}

function getUnknownsSubtypeMeta(run) {
  const { all: allSubtypes, rows: subtypeRows } = loadSubtypeVocabs();
  if (allSubtypes.size === 0) return null;

  const candidates = candidateUnknownsCountries(run);
  for (const country of candidates) {
    const validSet = new Set(
      subtypeRows
        .filter(row => countriesTextMatchesCountry(row.countriesText, country))
        .map(row => row.subtype)
    );

    if (validSet.size > 0) {
      const validSubtypes = Array.from(validSet).sort();
      const invalidSubtypes = Array.from(allSubtypes).filter(s => !validSet.has(s)).sort();
      return { validSubtypes, invalidSubtypes };
    }
  }

  return null;
}

function isCountryValidSubtype(validSubtypes, subtype) {
  if (!subtype) return false;
  const norm = String(subtype).trim().toLowerCase();
  if (!norm) return false;
  return new Set((validSubtypes || []).map(s => String(s).trim().toLowerCase())).has(norm);
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
  let result;
  let columnMapping = { subtype: 'subtype_weighted_f1', type: 'type_weighted_f1' };
  
  try {
    // Try new column names first
    result = await query(
      `SELECT run_id, nof_items, subtype_accuracy, subtype_weighted_f1, type_weighted_f1, description, benchmark
       FROM "leaderboard-table"
       ORDER BY run_id ASC`
    );
  } catch (err) {
    if (err.code !== '42703') throw err;
    
    try {
      // Try old column names with type_f1_weighted
      columnMapping = { subtype: 'subtype_f1_weighted', type: 'type_f1_weighted' };
      result = await query(
        `SELECT run_id, nof_items, subtype_accuracy, subtype_f1_weighted, type_f1_weighted, description, benchmark
         FROM "leaderboard-table"
         ORDER BY run_id ASC`
      );
    } catch (err2) {
      if (err2.code !== '42703') throw err2;
      
      // Final fallback: old column names without type_f1_weighted
      columnMapping = { subtype: 'subtype_f1_weighted', type: null };
      result = await query(
        `SELECT run_id, nof_items, subtype_accuracy, subtype_f1_weighted, description, benchmark
         FROM "leaderboard-table"
         ORDER BY run_id ASC`
      );
    }
  }

  const tablesResult = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema()`
  );

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
      benchmark_name: benchmarkName,
      run_name:      tableName,
      model_version: row.description || '',
    });

    // Map old column names to new column names for compatibility
    const subtypeWeightedF1 = parseFloat(row[columnMapping.subtype]) || 0;
    const typeWeightedF1 = columnMapping.type ? parseFloat(row[columnMapping.type]) || 0 : 0;

    leaderboard.push({
      id:                  syntheticRunId,
      run_id:              syntheticRunId,
      benchmark_id:        benchmarkId,
      run_name:            tableName,
      model_version:       row.description || '',
      subtype_accuracy:    parseFloat(row.subtype_accuracy) || 0,
      subtype_weighted_f1: subtypeWeightedF1,
      type_weighted_f1:    typeWeightedF1,
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
  const { leaderboard, benchmarks, runs } = await getRunIndex();
  const rows = leaderboard.filter(l => l.benchmark_id === benchmarkId);

  const benchmark = benchmarks.find(b => b.id === benchmarkId);
  if (benchmark && benchmark.name.toLowerCase() === 'unknowns') {
    await Promise.all(rows.map(async (row) => {
      const run = runs.find(r => r.id === row.run_id);
      if (!run) return;
      try {
        const result = await query(
          `SELECT COUNT(*) AS cnt FROM "${run.run_name}" WHERE LOWER(TRIM(COALESCE(pred_subtype_2,''))) = '${PS2_UNKNOWN}'`
        );
        row.benchmark_length = parseInt(result.rows[0].cnt) || 0;
      } catch (err) {
        if (!isTableMissing(err)) throw err;
      }
    }));
  }

  return rows.sort((a, b) => b.subtype_weighted_f1 - a.subtype_weighted_f1);
}

async function getConfusionMatrix(runId, _matrixType = 'type', incorrectOnly = false) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) return { type_matrix: { rows: [], cols: [], data: {} }, subtype_matrix: [] };

  const tbl = run.run_name;
  const incorrectClause = incorrectOnly ? ' AND pred_subtype != true_subtype' : '';
  const unknownsClause = (run.benchmark_name || '').toLowerCase() === 'unknowns'
    ? ` AND (pred_subtype_2 IS NULL OR LOWER(TRIM(pred_subtype_2)) IN ('${PS2_UNKNOWN}', '${PS2_MISSING}'))`
    : '';

  let result;
  try {
    result = await query(
      `SELECT true_type, pred_type, true_subtype, pred_subtype, COUNT(*) AS cnt
       FROM "${tbl}"
       WHERE 1=1${incorrectClause}${unknownsClause}
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

async function getTypeTransitionMatrix(runId1, runId2) {
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
      `SELECT r1.pred_type AS run1_pred,
              r2.pred_type AS run2_pred,
              r1.true_type AS true_type,
              COUNT(*)     AS cnt
       FROM "${tbl1}" r1
       JOIN "${tbl2}" r2 ON r1.${idCol1} = r2.${idCol2}
       GROUP BY r1.pred_type, r2.pred_type, r1.true_type`
    );
  } catch (err) {
    if (isTableMissing(err)) { console.warn(`⚠ Table not found: ${tbl1} or ${tbl2}`); return { rows: [], cols: [], data: {} }; }
    throw err;
  }

  const matrixData = {};
  const predTypes = new Set();

  result.rows.forEach(row => {
    const run1Pred = row.run1_pred;
    const run2Pred = row.run2_pred;
    const trueType = row.true_type;
    const cnt = parseInt(row.cnt);

    predTypes.add(run1Pred);
    predTypes.add(run2Pred);

    if (!matrixData[run1Pred]) matrixData[run1Pred] = {};
    if (!matrixData[run1Pred][run2Pred]) {
      matrixData[run1Pred][run2Pred] = { total: 0, run1Correct: 0, run2Correct: 0, bothWrong: 0 };
    }

    const cell = matrixData[run1Pred][run2Pred];
    cell.total += cnt;

    const r1c = run1Pred === trueType;
    const r2c = run2Pred === trueType;
    if      (r1c && !r2c) cell.run1Correct += cnt;
    else if (!r1c && r2c) cell.run2Correct += cnt;
    else if (!r1c && !r2c) cell.bothWrong += cnt;
  });

  const typeArray = Array.from(predTypes).sort();
  return { rows: typeArray, cols: typeArray, data: matrixData };
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
    let where = '1=1';

    if (filters.run1_pred_subtype) { where += ` AND r1.pred_subtype = $${p++}`; params.push(filters.run1_pred_subtype); }
    if (filters.run2_pred_subtype) { where += ` AND r2.pred_subtype = $${p++}`; params.push(filters.run2_pred_subtype); }
    if (filters.true_type)         { where += ` AND r1.true_type    = $${p++}`; params.push(filters.true_type); }
    if (filters.true_subtype)      { where += ` AND r1.true_subtype = $${p++}`; params.push(filters.true_subtype); }
    if (filters.pred_type)         { where += ` AND r1.pred_type    = $${p++}`; params.push(filters.pred_type); }
    if (filters.compareFilter === 'both_correct') { where += ` AND r1.pred_subtype = r1.true_subtype AND r2.pred_subtype = r1.true_subtype`; }
    if (filters.compareFilter === 'run1_only')    { where += ` AND r1.pred_subtype = r1.true_subtype AND r2.pred_subtype != r1.true_subtype`; }
    if (filters.compareFilter === 'run2_only')    { where += ` AND r1.pred_subtype != r1.true_subtype AND r2.pred_subtype = r1.true_subtype`; }
    if (filters.compareFilter === 'both_wrong')   { where += ` AND r1.pred_subtype != r1.true_subtype AND r2.pred_subtype != r1.true_subtype`; }

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
  if (filters.incorrectOnly)  { where += ` AND pred_subtype != true_subtype`; }
  if (filters.correctOnly)    { where += ` AND pred_subtype = true_subtype`; }
  if (filters.sameTypeOnly)   { where += ` AND pred_subtype != true_subtype AND pred_type = true_type`; }
  if (filters.crossTypeOnly)  { where += ` AND pred_type != true_type`; }

  if ((run.benchmark_name || '').toLowerCase() === 'unknowns') {
    where += ` AND (pred_subtype_2 IS NULL OR LOWER(TRIM(pred_subtype_2)) IN ('${PS2_UNKNOWN}', '${PS2_MISSING}'))`;
  }

  const baseSQL = `FROM "${tbl}" WHERE ${where}`;

  let dataResult, countResult;
  try {
    [dataResult, countResult] = await Promise.all([
      query(`SELECT ${idCol} AS request_id, true_type, true_subtype, pred_type, pred_subtype,
                    attributes, en_attributes, metadata, en_metadata, pred_subtype_1,
                    pred_subtype_2, missing_subtype
             ${baseSQL} ORDER BY ${idCol} LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset]),
      query(`SELECT COUNT(*) AS total ${baseSQL}`, params),
    ]);
  } catch (err) {
    if (isTableMissing(err)) { console.warn(`⚠ Table not found: ${tbl}`); return { data: [], pagination: { total: 0, limit, offset, pages: 0 } }; }
    if (err.code === '42703') {
      // pred_subtype_1 or en_metadata column missing — try without pred_subtype_1
      try {
        [dataResult, countResult] = await Promise.all([
          query(`SELECT ${idCol} AS request_id, true_type, true_subtype, pred_type, pred_subtype,
                        attributes, en_attributes, metadata, en_metadata
                 ${baseSQL} ORDER BY ${idCol} LIMIT $${p} OFFSET $${p + 1}`,
            [...params, limit, offset]),
          query(`SELECT COUNT(*) AS total ${baseSQL}`, params),
        ]);
      } catch (err2) {
        if (err2.code === '42703') {
          // en_metadata also missing — fall back to base columns only
          [dataResult, countResult] = await Promise.all([
            query(`SELECT ${idCol} AS request_id, true_type, true_subtype, pred_type, pred_subtype,
                          attributes, en_attributes, metadata
                   ${baseSQL} ORDER BY ${idCol} LIMIT $${p} OFFSET $${p + 1}`,
              [...params, limit, offset]),
            query(`SELECT COUNT(*) AS total ${baseSQL}`, params),
          ]);
        } else {
          throw err2;
        }
      }
    } else {
      throw err;
    }
  }

  const total = parseInt(countResult.rows[0].total);
  let parsedData = dataResult.rows.map(parseJsonFields);

  if ((run.benchmark_name || '').toLowerCase() === 'unknowns') {
    const subtypeMeta = getUnknownsSubtypeMeta(run);
    parsedData = parsedData.map((row, idx) => {
      const predSubtype2Raw = row.pred_subtype_2 ? String(row.pred_subtype_2).trim().toLowerCase() || null : null;
      const csvMissingSubtype = row.missing_subtype ? String(row.missing_subtype).trim() : null;
      const predSubtype2 = predSubtype2Raw || (csvMissingSubtype ? PS2_MISSING : null);
      const missingSubtype = csvMissingSubtype || null;

      const predSubtype1 = row.pred_subtype_1 != null
        ? row.pred_subtype_1
        : (subtypeMeta?.invalidSubtypes?.length
          ? subtypeMeta.invalidSubtypes[idx % subtypeMeta.invalidSubtypes.length]
          : null);
      const fewshots = subtypeMeta?.validSubtypes?.length
        ? [0, 1, 2].map(step => subtypeMeta.validSubtypes[(idx + step) % subtypeMeta.validSubtypes.length])
        : [];

      return {
        ...row,
        pred_subtype_1: predSubtype1,
        pred_subtype_2: predSubtype2,
        fewshots,
        feshots: fewshots,
        pred_type: predSubtype2 || row.pred_type,
        pred_subtype: predSubtype1 || row.pred_subtype,
        missing_subtype: missingSubtype,
        missing_subtype_is_valid: missingSubtype
          ? isCountryValidSubtype(subtypeMeta?.validSubtypes || [], missingSubtype)
          : null,
      };
    });
  }

  return {
    data: parsedData,
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

async function getValidationValues(runId) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const tbl = run.run_name;
  const idCol = await getIdColumn(tbl);
  const result = await query(`SELECT ${idCol} AS request_id, true_subtype FROM "${tbl}"`, []);

  const out = {};
  result.rows.forEach(r => {
    const v = String(r.true_subtype || '').trim();
    if (v !== '' && v !== 'Unknown') {
      out[String(r.request_id)] = r.true_subtype;
    }
  });
  return out;
}

async function updateTrueSubtypes(runId, updates) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const entries = Object.entries(updates || {});
  if (entries.length === 0) return 0;

  const tbl = run.run_name;
  const idCol = await getIdColumn(tbl);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;
    for (const [requestId, trueSubtype] of entries) {
      const result = await client.query(
        `UPDATE "${tbl}" SET true_subtype = $1 WHERE ${idCol} = $2`,
        [trueSubtype || '', requestId]
      );
      updated += result.rowCount || 0;
    }
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getTypeHealthSummary(runId) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) return [];

  const tbl = run.run_name;
  let rows;
  try {
    const result = await query(
      `SELECT true_type, true_subtype, pred_type, pred_subtype, COUNT(*) AS cnt
       FROM "${tbl}"
       GROUP BY true_type, true_subtype, pred_type, pred_subtype`,
      []
    );
    rows = result.rows;
  } catch (err) {
    if (isTableMissing(err)) return [];
    throw err;
  }

  // Aggregate in JS
  const typeMap = {};
  rows.forEach(r => {
    const count = parseInt(r.cnt);
    if (!typeMap[r.true_type]) {
      typeMap[r.true_type] = { type: r.true_type, total: 0, correct: 0, cross_type_wrong: 0, same_type_wrong: 0, subtypeMap: {}, fpMap: {}, confusionMap: {} };
    }
    const t = typeMap[r.true_type];
    t.total += count;
    const isCorrect   = r.pred_subtype === r.true_subtype;
    const isCrossType = r.pred_type    !== r.true_type;
    if      (isCorrect)   t.correct          += count;
    else if (isCrossType) t.cross_type_wrong  += count;
    else                  t.same_type_wrong   += count;

    if (!t.subtypeMap[r.true_subtype]) {
      t.subtypeMap[r.true_subtype] = { subtype: r.true_subtype, total: 0, correct: 0, cross_type: 0, confusionMap: {} };
    }
    const st = t.subtypeMap[r.true_subtype];
    st.total += count;
    if (isCorrect) {
      st.correct += count;
    } else {
      if (isCrossType) st.cross_type += count;
      const key = `${r.pred_subtype}|||${r.pred_type}`;
      st.confusionMap[key] = (st.confusionMap[key] || 0) + count;
      // This row is a false positive for pred_subtype within this type
      t.fpMap[r.pred_subtype] = (t.fpMap[r.pred_subtype] || 0) + count;
    }
    if (!isCorrect) {
      const key = `${r.pred_subtype}|||${r.pred_type}`;
      t.confusionMap[key] = (t.confusionMap[key] || 0) + count;
    }
  });

  // Weighted F1: for each subtype s, F1_s = 2*TP / (2*TP + FP + FN)
  // weighted_f1 = sum(support_s * F1_s) / total_support
  function subtypeF1(tp, fp, fn) {
    const denom = 2 * tp + fp + fn;
    return denom === 0 ? 0 : (2 * tp) / denom;
  }

  return Object.values(typeMap).map(t => {
    const topConfused = Object.entries(t.confusionMap)
      .map(([key, count]) => { const [pred_subtype, pred_type] = key.split('|||'); return { pred_subtype, pred_type, count }; })
      .sort((a, b) => b.count - a.count).slice(0, 5);

    const subtypes = Object.values(t.subtypeMap).map(st => {
      const tp = st.correct;
      const fn = st.total - st.correct;
      const fp = t.fpMap[st.subtype] || 0;
      const f1 = subtypeF1(tp, fp, fn);
      const topConfused = Object.entries(st.confusionMap)
        .map(([key, count]) => { const [pred_subtype, pred_type] = key.split('|||'); return { pred_subtype, pred_type, count }; })
        .sort((a, b) => b.count - a.count).slice(0, 3);
      return { subtype: st.subtype, total: st.total, correct: st.correct, cross_type: st.cross_type, f1, accuracy: st.correct / st.total, top_confused_to: topConfused };
    }).sort((a, b) => a.f1 - b.f1);

    // Weighted F1 across subtypes
    const weightedF1 = t.total > 0
      ? subtypes.reduce((sum, st) => sum + st.f1 * st.total, 0) / t.total
      : 0;

    return {
      type: t.type, total: t.total, correct: t.correct,
      cross_type_wrong: t.cross_type_wrong, same_type_wrong: t.same_type_wrong,
      f1: weightedF1, accuracy: t.correct / t.total, cross_type_rate: t.cross_type_wrong / t.total,
      top_confused_to: topConfused, subtypes,
    };
  }).sort((a, b) => a.f1 - b.f1);
}

async function getCompareTypeHealth(runId1, runId2) {
  const { runs } = await getRunIndex();
  const run1 = runById(runs, runId1);
  const run2 = runById(runs, runId2);
  if (!run1 || !run2) return [];
  const tbl1 = run1.run_name;
  const tbl2 = run2.run_name;
  const [idCol1, idCol2] = await Promise.all([getIdColumn(tbl1), getIdColumn(tbl2)]);

  const result = await query(
    `SELECT r1.true_type,
            COUNT(*)::int AS total,
            SUM(CASE WHEN r1.pred_subtype = r1.true_subtype AND r2.pred_subtype = r1.true_subtype THEN 1 ELSE 0 END)::int AS both_correct,
            SUM(CASE WHEN r1.pred_subtype = r1.true_subtype AND r2.pred_subtype != r1.true_subtype THEN 1 ELSE 0 END)::int AS run1_only,
            SUM(CASE WHEN r1.pred_subtype != r1.true_subtype AND r2.pred_subtype = r1.true_subtype THEN 1 ELSE 0 END)::int AS run2_only,
            SUM(CASE WHEN r1.pred_subtype != r1.true_subtype AND r2.pred_subtype != r1.true_subtype THEN 1 ELSE 0 END)::int AS both_wrong
     FROM "${tbl1}" r1
     JOIN "${tbl2}" r2 ON r1.${idCol1} = r2.${idCol2}
     GROUP BY r1.true_type
     ORDER BY r1.true_type`
  );

  return result.rows.map(r => ({
    type:         r.true_type,
    total:        r.total,
    both_correct: r.both_correct,
    run1_only:    r.run1_only,
    run2_only:    r.run2_only,
    both_wrong:   r.both_wrong,
  }));
}

async function getSubtypeTransitionMatrix(runId1, runId2, trueType, compareFilter = null) {
  const { runs } = await getRunIndex();
  const run1 = runById(runs, runId1);
  const run2 = runById(runs, runId2);
  if (!run1 || !run2) return { trueType, columns: [], rows: [] };
  const tbl1 = run1.run_name;
  const tbl2 = run2.run_name;
  const [idCol1, idCol2] = await Promise.all([getIdColumn(tbl1), getIdColumn(tbl2)]);

  let filterClause = '';
  if (compareFilter === 'both_correct') filterClause = ` AND r1.pred_subtype = r1.true_subtype AND r2.pred_subtype = r1.true_subtype`;
  if (compareFilter === 'run1_only')    filterClause = ` AND r1.pred_subtype = r1.true_subtype AND r2.pred_subtype != r1.true_subtype`;
  if (compareFilter === 'run2_only')    filterClause = ` AND r1.pred_subtype != r1.true_subtype AND r2.pred_subtype = r1.true_subtype`;
  if (compareFilter === 'both_wrong')   filterClause = ` AND r1.pred_subtype != r1.true_subtype AND r2.pred_subtype != r1.true_subtype`;

  const result = await query(
    `SELECT r1.pred_subtype AS run1_pred, r1.pred_type AS run1_pred_type,
            r2.pred_subtype AS run2_pred, r2.pred_type AS run2_pred_type,
            COUNT(*)::int AS count,
            SUM(CASE WHEN r1.pred_subtype = r1.true_subtype AND r2.pred_subtype != r1.true_subtype THEN 1 ELSE 0 END)::int AS run1_correct,
            SUM(CASE WHEN r1.pred_subtype != r1.true_subtype AND r2.pred_subtype = r1.true_subtype THEN 1 ELSE 0 END)::int AS run2_correct,
            SUM(CASE WHEN r1.pred_subtype != r1.true_subtype AND r2.pred_subtype != r1.true_subtype THEN 1 ELSE 0 END)::int AS both_wrong
     FROM "${tbl1}" r1
     JOIN "${tbl2}" r2 ON r1.${idCol1} = r2.${idCol2}
     WHERE r1.true_type = $1${filterClause}
     GROUP BY r1.pred_subtype, r1.pred_type, r2.pred_subtype, r2.pred_type
     ORDER BY count DESC`,
    [trueType]
  );

  const rowMap = {};
  const colMeta = {};

  result.rows.forEach(r => {
    if (!rowMap[r.run1_pred]) rowMap[r.run1_pred] = { pred_type: r.run1_pred_type, preds: {}, total: 0 };
    if (!rowMap[r.run1_pred].preds[r.run2_pred]) {
      rowMap[r.run1_pred].preds[r.run2_pred] = { total: 0, run1Correct: 0, run2Correct: 0, bothWrong: 0 };
    }
    const cell = rowMap[r.run1_pred].preds[r.run2_pred];
    cell.total += r.count;
    cell.run1Correct += r.run1_correct;
    cell.run2Correct += r.run2_correct;
    cell.bothWrong += r.both_wrong;
    rowMap[r.run1_pred].total += r.count;
    if (!colMeta[r.run2_pred]) colMeta[r.run2_pred] = { pred_type: r.run2_pred_type, total: 0 };
    colMeta[r.run2_pred].total += r.count;
  });

  // Align rows and columns so shared subtypes produce a diagonal
  const allSubtypes = Array.from(new Set([...Object.keys(rowMap), ...Object.keys(colMeta)]))
    .sort((a, b) => {
      const at = (rowMap[a]?.total || 0) + (colMeta[a]?.total || 0);
      const bt = (rowMap[b]?.total || 0) + (colMeta[b]?.total || 0);
      return bt - at;
    });

  const rows = allSubtypes
    .filter(s => rowMap[s])
    .map(s => ({ run1_pred: s, pred_type: rowMap[s].pred_type, total: rowMap[s].total, preds: rowMap[s].preds }));

  const columns = allSubtypes
    .filter(s => colMeta[s])
    .map(s => ({ subtype: s, pred_type: colMeta[s].pred_type }));

  return { trueType, columns, rows };
}

async function getSubtypeConfusionMatrix(runId, trueType, filter = null) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  const tbl = run.run_name;

  let whereClause = 'WHERE true_type = $1';
  if (filter) {
    const parts = filter.split(',').map(f => f.trim());
    const conds = [];
    if (parts.includes('correct'))    conds.push('pred_subtype = true_subtype');
    if (parts.includes('same_type'))  conds.push('(pred_subtype != true_subtype AND pred_type = true_type)');
    if (parts.includes('cross_type')) conds.push('(pred_subtype != true_subtype AND pred_type != true_type)');
    if (conds.length > 0) whereClause += ` AND (${conds.join(' OR ')})`;
  }

  const result = await query(
    `SELECT true_subtype, pred_subtype, pred_type, COUNT(*)::int AS count
     FROM "${tbl}"
     ${whereClause}
     GROUP BY true_subtype, pred_subtype, pred_type
     ORDER BY true_subtype, count DESC`,
    [trueType]
  );

  // Build rowMap: true_subtype -> { preds: { predSubtype -> count }, total }
  // Track all pred columns with their type so we can mark cross-type ones
  const rowMap = {};
  const colMeta = {}; // predSubtype -> { total, isCrossType, pred_type }

  result.rows.forEach(r => {
    if (!rowMap[r.true_subtype]) rowMap[r.true_subtype] = { preds: {}, total: 0 };
    const row = rowMap[r.true_subtype];
    row.total += r.count;
    row.preds[r.pred_subtype] = (row.preds[r.pred_subtype] || 0) + r.count;

    if (!colMeta[r.pred_subtype]) {
      colMeta[r.pred_subtype] = { total: 0, isCrossType: r.pred_type !== trueType, pred_type: r.pred_type };
    }
    colMeta[r.pred_subtype].total += r.count;
  });

  // Rows sorted by total descending
  const rows = Object.entries(rowMap)
    .map(([subtype, data]) => ({ true_subtype: subtype, total: data.total, preds: data.preds }))
    .sort((a, b) => b.total - a.total);

  // Same-type columns ordered to match row order → produces a diagonal
  // Rows subtypes that also appear as predicted columns go first (in row order),
  // then any predicted-only same-type subtypes appended by volume.
  const rowOrder = rows.map(r => r.true_subtype);
  const sameTypePredSet = new Set(
    Object.keys(colMeta).filter(k => !colMeta[k].isCrossType)
  );
  const sameTypeCols = [
    ...rowOrder.filter(s => sameTypePredSet.has(s)),
    ...Object.keys(colMeta)
      .filter(k => !colMeta[k].isCrossType && !rowOrder.includes(k))
      .sort((a, b) => colMeta[b].total - colMeta[a].total),
  ].map(subtype => ({ subtype, isCrossType: false, pred_type: colMeta[subtype].pred_type }));

  const crossTypeCols = Object.entries(colMeta)
    .filter(([, m]) => m.isCrossType)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([subtype, m]) => ({ subtype, isCrossType: true, pred_type: m.pred_type }));

  const columns = [...sameTypeCols, ...crossTypeCols];

  return { trueType, columns, rows };
}

async function getConfidenceQuality(runId, bins = 10) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) return null;

  const tbl = run.run_name;
  const validBins = Number.isFinite(bins) ? Math.max(2, Math.min(20, Math.floor(bins))) : 10;

  let rows;
  try {
    const result = await query(
      `SELECT true_subtype, pred_subtype, confidence
       FROM "${tbl}"
       WHERE confidence IS NOT NULL`,
      []
    );
    rows = result.rows;
  } catch (err) {
    // confidence column may not exist in older schemas
    if (err.code === '42703' || isTableMissing(err)) return null;
    throw err;
  }

  if (!rows || rows.length === 0) return null;

  const total = rows.length;
  const bucket = Array.from({ length: validBins }, (_, i) => ({
    index: i,
    start: i / validBins,
    end: (i + 1) / validBins,
    count: 0,
    confSum: 0,
    correctSum: 0,
  }));

  let confSum = 0;
  let correctSum = 0;
  let brierSum = 0;

  rows.forEach(r => {
    const raw = parseFloat(r.confidence);
    if (!Number.isFinite(raw)) return;
    const conf = Math.max(0, Math.min(1, raw));
    const y = r.pred_subtype === r.true_subtype ? 1 : 0;
    const idx = Math.min(validBins - 1, Math.floor(conf * validBins));
    const b = bucket[idx];
    b.count++;
    b.confSum += conf;
    b.correctSum += y;
    confSum += conf;
    correctSum += y;
    brierSum += (conf - y) * (conf - y);
  });

  const effectiveTotal = bucket.reduce((s, b) => s + b.count, 0);
  if (effectiveTotal === 0) return null;

  let ece = 0;
  let maxGap = 0;
  let worstBin = null;
  let overMass = 0;
  let underMass = 0;

  const binsOut = bucket.filter(b => b.count > 0).map(b => {
    const avgConfidence = b.confSum / b.count;
    const accuracy = b.correctSum / b.count;
    const gap = Math.abs(accuracy - avgConfidence);
    const weight = b.count / effectiveTotal;
    ece += weight * gap;
    if (gap > maxGap) {
      maxGap = gap;
      worstBin = b;
    }
    if (avgConfidence > accuracy) overMass += weight;
    if (avgConfidence < accuracy) underMass += weight;
    return {
      index: b.index,
      start: b.start,
      end: b.end,
      count: b.count,
      avg_confidence: avgConfidence,
      accuracy,
      gap,
    };
  });

  const worstRange = worstBin
    ? `${worstBin.start.toFixed(1)}-${worstBin.end.toFixed(1)}`
    : null;

  let status = 'moderate';
  if (ece < 0.03) status = 'good';
  else if (ece >= 0.07) status = 'poor';

  return {
    n: effectiveTotal,
    avg_confidence: confSum / effectiveTotal,
    accuracy: correctSum / effectiveTotal,
    ece,
    brier: brierSum / effectiveTotal,
    max_gap: maxGap,
    worst_bin: worstRange,
    overconfident_mass: overMass,
    underconfident_mass: underMass,
    status,
    bins: binsOut,
  };
}

async function getCalibrationPerType(runId, bins = 10) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) return [];

  const tbl = run.run_name;
  const validBins = Number.isFinite(bins) ? Math.max(2, Math.min(20, Math.floor(bins))) : 10;

  let rows;
  try {
    const result = await query(
      `SELECT true_type, true_subtype, pred_subtype, confidence
       FROM "${tbl}"
       WHERE confidence IS NOT NULL`,
      []
    );
    rows = result.rows;
  } catch (err) {
    // confidence column may not exist in older schemas
    if (err.code === '42703' || isTableMissing(err)) return [];
    throw err;
  }

  if (!rows || rows.length === 0) return [];

  const typeMap = {};

  rows.forEach(r => {
    const raw = parseFloat(r.confidence);
    if (!Number.isFinite(raw)) return;
    const conf = Math.max(0, Math.min(1, raw));
    if (!typeMap[r.true_type]) typeMap[r.true_type] = [];
    typeMap[r.true_type].push({
      confidence: conf,
      isCorrect: r.pred_subtype === r.true_subtype,
    });
  });

  return Object.entries(typeMap)
    .map(([type, typeResults]) => {
      const n = typeResults.length;
      const correctCount = typeResults.filter(r => r.isCorrect).length;
      const accuracy = correctCount / n;

      const bucket = Array.from({ length: validBins }, (_, i) => ({
        index: i,
        start: i / validBins,
        end: (i + 1) / validBins,
        count: 0,
        confSum: 0,
        correctSum: 0,
      }));

      let confSum = 0;
      let brierSum = 0;

      typeResults.forEach(r => {
        const conf = r.confidence;
        const y = r.isCorrect ? 1 : 0;
        const idx = Math.min(validBins - 1, Math.floor(conf * validBins));
        const b = bucket[idx];
        b.count++;
        b.confSum += conf;
        b.correctSum += y;

        confSum += conf;
        brierSum += (conf - y) * (conf - y);
      });

      let ece = 0;
      let maxGap = 0;
      let overconfidentMass = 0;
      let underconfidentMass = 0;

      bucket.forEach(b => {
        if (b.count > 0) {
          const avgConfidence = b.confSum / b.count;
          const binAccuracy = b.correctSum / b.count;
          const gap = Math.abs(binAccuracy - avgConfidence);
          const weight = b.count / n;
          ece += weight * gap;
          maxGap = Math.max(maxGap, gap);

          if (avgConfidence > binAccuracy) overconfidentMass += weight;
          if (avgConfidence < binAccuracy) underconfidentMass += weight;
        }
      });

      let status = 'moderate';
      if (ece < 0.03) status = 'good';
      else if (ece >= 0.07) status = 'poor';

      return {
        type,
        n,
        accuracy,
        avg_confidence: confSum / n,
        ece,
        brier: brierSum / n,
        max_gap: maxGap,
        overconfident_mass: overconfidentMass,
        underconfident_mass: underconfidentMass,
        status,
      };
    })
    .sort((a, b) => a.ece - b.ece);
}

/* ── Missing Subtype Decisions (stored in run table columns) ── */

async function updateMissingSubtypeDecision(runId, requestId, trueSubtype) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  const tbl = run.run_name;
  const idCol = await getIdColumn(tbl);
  await query(
    `UPDATE "${tbl}" SET true_subtype = $1 WHERE ${idCol} = $2`,
    [trueSubtype || '', String(requestId)]
  );
}

async function publishRetagged(runId) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const src = run.run_name;
  const dst = `${src}_retagged`;
  await query(`DROP TABLE IF EXISTS "${dst}"`);
  await query(`CREATE TABLE "${dst}" AS SELECT * FROM "${src}"`);
  return dst;
}

async function exportRunCsv(runId) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const tbl    = run.run_name;
  const idCol  = await getIdColumn(tbl);
  const result = await query(`SELECT * FROM "${tbl}" ORDER BY ${idCol}`);
  const filename = `${tbl}.csv`;
  return { rows: result.rows, filename };
}

async function getMissingSubtypeGroups(runId) {
  const { runs } = await getRunIndex();
  const run = runById(runs, runId);
  if (!run) return [];

  const tbl = run.run_name;
  const idCol = await getIdColumn(tbl);

  const colCheck = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'missing_subtype'`,
    [tbl]
  );
  if (colCheck.rows.length === 0) {
    console.warn(`[missing-subtypes] No missing_subtype column found in table "${tbl}"`);
    return [];
  }
  const missingCol = colCheck.rows[0].column_name;

  const columnsRes = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
    [tbl]
  );
  const columns = new Set(columnsRes.rows.map(r => r.column_name));
  const enAttributesSelect = columns.has('en_attributes')
    ? 'en_attributes'
    : (columns.has('attributes_en') ? 'attributes_en AS en_attributes' : 'NULL::jsonb AS en_attributes');
  const enMetadataSelect   = columns.has('en_metadata')
    ? 'en_metadata'
    : (columns.has('metadata_en') ? 'metadata_en AS en_metadata' : 'NULL::jsonb AS en_metadata');

  const result = await query(
    `SELECT ${idCol} AS request_id, pred_subtype_1, pred_subtype_2, ${missingCol} AS missing_subtype, attributes, ${enAttributesSelect}, metadata, ${enMetadataSelect}, true_subtype
     FROM "${tbl}"
     WHERE ${missingCol} IS NOT NULL AND ${missingCol} != ''`,
    []
  );

  const groups = {};

  result.rows.forEach(r => {
    const candidate = r.missing_subtype;
    if (!candidate) return;
    if (!groups[candidate]) groups[candidate] = { candidate, records: [] };
    let attrs = r.attributes;
    let attrsEn = r.en_attributes;
    let meta  = r.metadata;
    let metaEn = r.en_metadata;
    try { if (typeof attrs === 'string') attrs = JSON.parse(attrs); } catch {}
    try { if (typeof attrsEn === 'string') attrsEn = JSON.parse(attrsEn); } catch {}
    try { if (typeof meta  === 'string') meta  = JSON.parse(meta);  } catch {}
    try { if (typeof metaEn === 'string') metaEn = JSON.parse(metaEn); } catch {}
    groups[candidate].records.push({
      request_id:     String(r.request_id),
      pred_subtype_1: r.pred_subtype_1,
      pred_subtype_2: r.pred_subtype_2 ? String(r.pred_subtype_2).trim().toLowerCase() || null : null,
      missing_subtype: r.missing_subtype,
      attributes:     attrs,
      en_attributes:  attrsEn,
      metadata:       meta,
      en_metadata:    metaEn,
      true_subtype:   r.true_subtype || null,
    });
  });

  return Object.values(groups)
    .map(g => ({
      candidate: g.candidate,
      count:     g.records.length,
      records:   g.records,
    }))
    .sort((a, b) => b.count - a.count);
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
  getTypeTransitionMatrix,
  getRecords,
  getIdColumn,
  updateTranslation,
  updateMetadataTranslation,
  getValidationValues,
  updateTrueSubtypes,
  getTypeHealthSummary,
  getSubtypeConfusionMatrix,
  getCompareTypeHealth,
  getSubtypeTransitionMatrix,
  getConfidenceQuality,
  getCalibrationPerType,
  getMissingSubtypeGroups,
  updateMissingSubtypeDecision,
  exportRunCsv,
  publishRetagged,
};
