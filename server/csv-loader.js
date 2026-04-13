/**
 * CSV Data Loader
 * Reads leaderboard.csv and per-run CSVs from data/runs/
 */

const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');

const DATA_DIR                    = path.join(__dirname, '../data');
const RUNS_DIR                    = path.join(DATA_DIR, 'runs');
const TRANSLATIONS_FILE           = path.join(DATA_DIR, 'translations.json');
const METADATA_TRANSLATIONS_FILE  = path.join(DATA_DIR, 'metadata-translations.json');

let dataCache = null;

function loadTranslationsFile() {
  if (!fs.existsSync(TRANSLATIONS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf-8')); } catch { return {}; }
}

function saveTranslationsFile(translations) {
  fs.writeFileSync(TRANSLATIONS_FILE, JSON.stringify(translations, null, 2), 'utf-8');
}

function loadMetadataTranslationsFile() {
  if (!fs.existsSync(METADATA_TRANSLATIONS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(METADATA_TRANSLATIONS_FILE, 'utf-8')); } catch { return {}; }
}

function saveMetadataTranslationsFile(translations) {
  fs.writeFileSync(METADATA_TRANSLATIONS_FILE, JSON.stringify(translations, null, 2), 'utf-8');
}

function tryParseJson(value) {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch { return value; }
}

function sanitize(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
}

function runFileName(benchmarkId, runName) {
  return `${benchmarkId}_${sanitize(runName)}.csv`;
}

function loadData() {
  if (dataCache) return dataCache;

  const lbFile = fs.readFileSync(path.join(DATA_DIR, 'leaderboard.csv'), 'utf-8');
  const lbRows = csv.parse(lbFile, { columns: true, skip_empty_lines: true });

  const benchmarks = [];
  const seenBenchmarks = {};
  const runs = [];
  const leaderboard = [];

  lbRows.forEach((row, i) => {
    const runId       = i + 1;
    const benchmarkName = row.benchmark || row.run_name;

    if (!seenBenchmarks[benchmarkName]) {
      const newId = Object.keys(seenBenchmarks).length + 1;
      seenBenchmarks[benchmarkName] = newId;
      benchmarks.push({ id: newId, name: benchmarkName });
    }

    const benchmarkId = seenBenchmarks[benchmarkName];

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
      benchmark_length:    0,
    });
  });

  const run_results = [];
  runs.forEach(run => {
    const fname = runFileName(run.benchmark_id, run.run_name);
    const fpath = path.join(RUNS_DIR, fname);
    if (!fs.existsSync(fpath)) {
      console.warn(`\u26a0 Missing run file: ${fname}`);
      return;
    }
    const records = csv.parse(fs.readFileSync(fpath, 'utf-8'), { columns: true, skip_empty_lines: true });

    const lbEntry = leaderboard.find(l => l.run_id === run.id);
    if (lbEntry) lbEntry.benchmark_length = records.length;

    records.forEach((r, idx) => {
      run_results.push({
        id:           run.id * 100000 + idx,
        run_id:       run.id,
        request_id:    r.request_id,
        true_type:    r.true_type,
        true_subtype: r.true_subtype,
        pred_type:    r.pred_type,
        pred_subtype: r.pred_subtype,
        attributes:    tryParseJson(r.attributes),
        en_attributes: tryParseJson(r.en_attributes),
        metadata:      tryParseJson(r.metadata),
        en_metadata:   tryParseJson(r.en_metadata),
      });
    });
  });

  // Merge persisted attribute translations into the cache.
  const translations = loadTranslationsFile();
  if (Object.keys(translations).length > 0) {
    run_results.forEach(r => {
      if (translations[r.request_id]) r.en_attributes = translations[r.request_id];
    });
  }

  // Merge persisted metadata translations into the cache.
  const metaTranslations = loadMetadataTranslationsFile();
  if (Object.keys(metaTranslations).length > 0) {
    run_results.forEach(r => {
      if (metaTranslations[r.request_id]) r.en_metadata = metaTranslations[r.request_id];
    });
  }

  dataCache = { benchmarks, runs, leaderboard, run_results };
  console.log(`\u2713 CSV data loaded: ${runs.length} runs, ${run_results.length} records`);
  return dataCache;
}

// ── Query functions ───────────────────────────────────────────────────────────

function getAllBenchmarks() {
  return loadData().benchmarks;
}

function getBenchmark(id) {
  return loadData().benchmarks.find(b => b.id === id);
}

function getRunsByBenchmarkId(benchmarkId) {
  return loadData().runs.filter(r => r.benchmark_id === benchmarkId);
}

function getRun(id) {
  return loadData().runs.find(r => r.id === id);
}

function getLeaderboardByBenchmarkId(benchmarkId) {
  return loadData().leaderboard
    .filter(l => l.benchmark_id === benchmarkId)
    .sort((a, b) => b.subtype_f1_weighted - a.subtype_f1_weighted);
}

function getConfusionMatrix(runId, matrixType = 'type', incorrectOnly = false) {
  const data = loadData();
  let results = data.run_results.filter(r => r.run_id === runId);
  if (incorrectOnly) results = results.filter(r => r.pred_subtype !== r.true_subtype);

  const types = Array.from(new Set(results.flatMap(r => [r.true_type, r.pred_type]))).sort();
  const typeMatrix = {};
  types.forEach(t => { typeMatrix[t] = {}; types.forEach(p => { typeMatrix[t][p] = 0; }); });
  results.forEach(r => { typeMatrix[r.true_type][r.pred_type]++; });

  const seenPairs = new Set();
  const subtypeData = [];
  results.forEach(r => {
    const key = `${r.true_type}|${r.pred_type}|${r.true_subtype}|${r.pred_subtype}`;
    if (!seenPairs.has(key)) {
      seenPairs.add(key);
      subtypeData.push({
        true_type:    r.true_type,
        pred_type:    r.pred_type,
        true_subtype: r.true_subtype,
        pred_subtype: r.pred_subtype,
        count: results.filter(x =>
          x.true_type === r.true_type && x.pred_type === r.pred_type &&
          x.true_subtype === r.true_subtype && x.pred_subtype === r.pred_subtype
        ).length,
      });
    }
  });

  return {
    type_matrix: { rows: types, cols: types, data: typeMatrix },
    subtype_matrix: subtypeData.sort((a, b) => b.count - a.count),
  };
}

function getSubtypeMatrixForTypePair(runId, trueType, predType, incorrectOnly = false) {
  const data = loadData();
  let results = data.run_results.filter(r =>
    r.run_id === runId && r.true_type === trueType && r.pred_type === predType
  );
  if (incorrectOnly) results = results.filter(r => r.pred_subtype !== r.true_subtype);

  const subtypes = Array.from(new Set(results.flatMap(r => [r.true_subtype, r.pred_subtype]))).sort();
  const matrixData = {};
  subtypes.forEach(t => { matrixData[t] = {}; subtypes.forEach(p => { matrixData[t][p] = 0; }); });
  results.forEach(r => { matrixData[r.true_subtype][r.pred_subtype]++; });

  return { rows: subtypes, cols: subtypes, data: matrixData };
}

function getTransitionMatrix(runId1, runId2, minCount = 1) {
  const data = loadData();
  const run1Map = {};
  data.run_results.filter(r => r.run_id === runId1).forEach(r => {
    run1Map[r.request_id] = { pred_subtype: r.pred_subtype, true_subtype: r.true_subtype };
  });

  const transitionData = {};
  data.run_results.filter(r => r.run_id === runId2).forEach(r => {
    const r1 = run1Map[r.request_id];
    if (!r1 || r1.pred_subtype === r.pred_subtype) return;

    const run1Pred    = r1.pred_subtype;
    const run2Pred    = r.pred_subtype;
    const trueSubtype = r1.true_subtype;

    if (!transitionData[run1Pred]) transitionData[run1Pred] = {};
    if (!transitionData[run1Pred][run2Pred]) {
      transitionData[run1Pred][run2Pred] = { total: 0, run1Correct: 0, run2Correct: 0, bothWrong: 0 };
    }
    const cell = transitionData[run1Pred][run2Pred];
    cell.total++;
    const r1c = run1Pred === trueSubtype;
    const r2c = run2Pred === trueSubtype;
    if      (r1c && !r2c) cell.run1Correct++;
    else if (!r1c && r2c) cell.run2Correct++;
    else if (!r1c && !r2c) cell.bothWrong++;
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

function getRecords(filters = {}) {
  const data = loadData();

  if (filters.run_id2) {
    const runId1 = filters.run_id1 || filters.run_id;
    const runId2 = filters.run_id2;

    const run2Map = {};
    data.run_results.filter(r => r.run_id === runId2).forEach(r => { run2Map[r.request_id] = r; });

    let combined = data.run_results
      .filter(r => r.run_id === runId1)
      .map(r1 => {
        const r2 = run2Map[r1.request_id];
        if (!r2) return null;
        return { ...r1, run2_pred_type: r2.pred_type, run2_pred_subtype: r2.pred_subtype };
      })
      .filter(Boolean)
      .filter(r => r.pred_subtype !== r.run2_pred_subtype);

    if (filters.run1_pred_subtype)  combined = combined.filter(r => r.pred_subtype       === filters.run1_pred_subtype);
    if (filters.run2_pred_subtype)  combined = combined.filter(r => r.run2_pred_subtype   === filters.run2_pred_subtype);
    if (filters.true_type)          combined = combined.filter(r => r.true_type           === filters.true_type);
    if (filters.pred_type)          combined = combined.filter(r => r.pred_type           === filters.pred_type);

    const limit  = filters.limit  || 100;
    const offset = filters.offset || 0;
    return {
      data: combined.slice(offset, offset + limit),
      pagination: { total: combined.length, limit, offset, pages: Math.ceil(combined.length / limit) },
    };
  }

  let results = data.run_results;
  if (filters.run_id)        results = results.filter(r => r.run_id        === filters.run_id);
  if (filters.true_type)     results = results.filter(r => r.true_type     === filters.true_type);
  if (filters.pred_type)     results = results.filter(r => r.pred_type     === filters.pred_type);
  if (filters.true_subtype)  results = results.filter(r => r.true_subtype  === filters.true_subtype);
  if (filters.pred_subtype)  results = results.filter(r => r.pred_subtype  === filters.pred_subtype);
  if (filters.incorrectOnly) results = results.filter(r => r.pred_subtype  !== r.true_subtype);

  const limit  = filters.limit  || 100;
  const offset = filters.offset || 0;
  return {
    data: results.slice(offset, offset + limit),
    pagination: { total: results.length, limit, offset, pages: Math.ceil(results.length / limit) },
  };
}

/**
 * Persist a translated en_attributes for a given request_id.
 * Updates the in-memory cache (all runs sharing the same request_id) and
 * writes to data/translations.json so it survives server restarts.
 */
function updateTranslation(requestId, attrsEn) {
  const data = loadData();
  data.run_results
    .filter(r => r.request_id === requestId)
    .forEach(r => { r.en_attributes = attrsEn; });

  const translations = loadTranslationsFile();
  translations[requestId] = attrsEn;
  saveTranslationsFile(translations);
}

function updateMetadataTranslation(requestId, metaEn) {
  const data = loadData();
  data.run_results
    .filter(r => r.request_id === requestId)
    .forEach(r => { r.en_metadata = metaEn; });

  const translations = loadMetadataTranslationsFile();
  translations[requestId] = metaEn;
  saveMetadataTranslationsFile(translations);
}

function getTypeHealthSummary(runId) {
  const data = loadData();
  const results = data.run_results.filter(r => r.run_id === runId);

  const typeMap = {};
  results.forEach(r => {
    if (!typeMap[r.true_type]) {
      typeMap[r.true_type] = { type: r.true_type, total: 0, correct: 0, cross_type_wrong: 0, same_type_wrong: 0, subtypeMap: {}, confusionMap: {} };
    }
    const t = typeMap[r.true_type];
    t.total++;

    const isCorrect   = r.pred_subtype === r.true_subtype;
    const isCrossType = r.pred_type    !== r.true_type;

    if      (isCorrect)   t.correct++;
    else if (isCrossType) t.cross_type_wrong++;
    else                  t.same_type_wrong++;

    if (!t.subtypeMap[r.true_subtype]) {
      t.subtypeMap[r.true_subtype] = { subtype: r.true_subtype, total: 0, correct: 0, cross_type: 0, confusionMap: {} };
    }
    const st = t.subtypeMap[r.true_subtype];
    st.total++;
    if (isCorrect) {
      st.correct++;
    } else {
      if (isCrossType) st.cross_type++;
      const key = `${r.pred_subtype}|||${r.pred_type}`;
      st.confusionMap[key] = (st.confusionMap[key] || 0) + 1;
    }

    if (!isCorrect) {
      const key = `${r.pred_subtype}|||${r.pred_type}`;
      t.confusionMap[key] = (t.confusionMap[key] || 0) + 1;
    }
  });

  return Object.values(typeMap).map(t => {
    const topConfused = Object.entries(t.confusionMap)
      .map(([key, count]) => { const [pred_subtype, pred_type] = key.split('|||'); return { pred_subtype, pred_type, count }; })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const subtypes = Object.values(t.subtypeMap).map(st => {
      const topConfused = Object.entries(st.confusionMap)
        .map(([key, count]) => { const [pred_subtype, pred_type] = key.split('|||'); return { pred_subtype, pred_type, count }; })
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      return {
        subtype:       st.subtype,
        total:         st.total,
        correct:       st.correct,
        cross_type:    st.cross_type,
        accuracy:      st.correct / st.total,
        top_confused_to: topConfused,
      };
    }).sort((a, b) => a.accuracy - b.accuracy);

    return {
      type:             t.type,
      total:            t.total,
      correct:          t.correct,
      cross_type_wrong: t.cross_type_wrong,
      same_type_wrong:  t.same_type_wrong,
      accuracy:         t.correct / t.total,
      cross_type_rate:  t.cross_type_wrong / t.total,
      top_confused_to:  topConfused,
      subtypes,
    };
  }).sort((a, b) => a.accuracy - b.accuracy);
}

module.exports = {
  loadData,
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
  getTypeHealthSummary,
};
