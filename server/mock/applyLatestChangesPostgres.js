/**
 * Apply latest mock-data changes to PostgreSQL:
 *  - Benchmark Q2 2026 / model_v1 → 83% accuracy
 *  - Remove "perfect model" run from Test Benchmark
 *
 * Usage: node server/mock/applyLatestChangesPostgres.js
 */

require('dotenv').config();
const { query, closePool } = require('../db');

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function wrongPrediction(trueType, trueSubtype, subtypeMap) {
  const types = Object.keys(subtypeMap);
  if (Math.random() < 0.7) {
    const siblings = subtypeMap[trueType].filter(s => s !== trueSubtype);
    return { predType: trueType, predSubtype: siblings.length ? rand(siblings) : trueSubtype };
  }
  const wrongType = rand(types.filter(t => t !== trueType));
  return { predType: wrongType, predSubtype: rand(subtypeMap[wrongType]) };
}

function buildSubtypeMap(records) {
  const map = {};
  records.forEach(r => {
    if (!map[r.true_type]) map[r.true_type] = new Set();
    map[r.true_type].add(r.true_subtype);
  });
  const result = {};
  Object.entries(map).forEach(([t, s]) => { result[t] = Array.from(s); });
  return result;
}

function calculateMetrics(records) {
  const correct = records.filter(r => r.pred_subtype === r.true_subtype).length;
  const acc = correct / records.length;
  const cm = {};
  records.forEach(r => {
    if (!cm[r.true_subtype]) cm[r.true_subtype] = { tp: 0, total: 0 };
    cm[r.true_subtype].total++;
    if (r.pred_subtype === r.true_subtype) cm[r.true_subtype].tp++;
  });
  let f1 = 0;
  Object.values(cm).forEach(m => { f1 += (m.tp / (m.total || 1)) * m.total / records.length; });
  return { accuracy: parseFloat(acc.toFixed(4)), f1: parseFloat(Math.min(f1, 1).toFixed(4)) };
}

async function reseedRun(benchmarkName, runName, targetAccuracy) {
  const runRes = await query(
    `SELECT r.id FROM runs r JOIN benchmarks b ON b.id = r.benchmark_id
     WHERE b.name = $1 AND r.run_name = $2 LIMIT 1`,
    [benchmarkName, runName]
  );
  if (!runRes.rows.length) { console.warn(`⚠ Not found: ${benchmarkName} / ${runName}`); return; }
  const runId = runRes.rows[0].id;

  const recRes = await query('SELECT id, true_type, true_subtype FROM run_results WHERE run_id = $1', [runId]);
  const rows = recRes.rows;
  if (!rows.length) { console.warn(`⚠ No records for run_id=${runId}`); return; }

  const subtypeMap = buildSubtypeMap(rows);
  const updated = rows.map(r => {
    if (Math.random() < targetAccuracy) {
      return { id: r.id, pred_type: r.true_type, pred_subtype: r.true_subtype, true_subtype: r.true_subtype };
    }
    const { predType, predSubtype } = wrongPrediction(r.true_type, r.true_subtype, subtypeMap);
    return { id: r.id, pred_type: predType, pred_subtype: predSubtype, true_subtype: r.true_subtype };
  });

  const BATCH = 200;
  for (let i = 0; i < updated.length; i += BATCH) {
    const batch = updated.slice(i, i + BATCH);
    const typeCase = batch.map((_, j) => `WHEN $${j * 3 + 1} THEN $${j * 3 + 2}`).join(' ');
    const subCase  = batch.map((_, j) => `WHEN $${j * 3 + 1} THEN $${j * 3 + 3}`).join(' ');
    const params   = batch.flatMap(r => [r.id, r.pred_type, r.pred_subtype]);
    const idPlaceholders = batch.map((_, j) => `$${batch.length * 3 + j + 1}`).join(', ');
    await query(
      `UPDATE run_results SET pred_type = CASE id ${typeCase} END, pred_subtype = CASE id ${subCase} END WHERE id IN (${idPlaceholders})`,
      [...params, ...batch.map(r => r.id)]
    );
  }

  const { accuracy, f1 } = calculateMetrics(updated);
  await query(
    'UPDATE leaderboard SET subtype_accuracy = $1, subtype_weighted_f1 = $2 WHERE run_id = $3',
    [accuracy, f1, runId]
  );
  console.log(`✓ ${benchmarkName} / ${runName}: accuracy=${accuracy}  f1=${f1}  (target=${targetAccuracy})`);
}

async function deletePerfectModel() {
  const runRes = await query(
    `SELECT r.id FROM runs r JOIN benchmarks b ON b.id = r.benchmark_id
     WHERE b.name = 'Test Benchmark' AND r.run_name = 'perfect model' LIMIT 1`
  );
  if (!runRes.rows.length) { console.log('ℹ perfect model not found in DB, skipping'); return; }
  const runId = runRes.rows[0].id;
  await query('DELETE FROM run_results WHERE run_id = $1', [runId]);
  await query('DELETE FROM leaderboard  WHERE run_id = $1', [runId]);
  await query('DELETE FROM runs         WHERE id     = $1', [runId]);
  console.log('✓ Deleted "perfect model" run from Test Benchmark');
}

(async () => {
  try {
    await reseedRun('Benchmark Q2 2026', 'model_v1', 0.83);
    await deletePerfectModel();
    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await closePool();
  }
})();
