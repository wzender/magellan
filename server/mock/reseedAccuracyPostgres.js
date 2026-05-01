/**
 * Reseed specific runs in PostgreSQL with target subtype accuracy rates.
 * Mirrors the logic in reseedAccuracy.js but operates on the DB instead of CSVs.
 *
 * Usage: node server/mock/reseedAccuracyPostgres.js
 */

require('dotenv').config();
const { query, getClient, closePool } = require('../db');

const TARGETS = [
  { benchmarkName: 'Benchmark Q1 2026', runName: 'model_v2', subtypeAccuracy: 0.85 },
  { benchmarkName: 'Benchmark Q1 2026', runName: 'model_v3', subtypeAccuracy: 0.82 },
  { benchmarkName: 'Test Benchmark',    runName: 'model_v3', subtypeAccuracy: 0.87 },
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function wrongPrediction(trueType, trueSubtype, subtypeMap) {
  const types = Object.keys(subtypeMap);
  if (Math.random() < 0.7) {
    const siblings = subtypeMap[trueType].filter(s => s !== trueSubtype);
    return { predType: trueType, predSubtype: siblings.length ? rand(siblings) : trueSubtype };
  } else {
    const wrongType = rand(types.filter(t => t !== trueType));
    return { predType: wrongType, predSubtype: rand(subtypeMap[wrongType]) };
  }
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
  const accuracy = correct / records.length;
  const classMap = {};
  records.forEach(r => {
    if (!classMap[r.true_subtype]) classMap[r.true_subtype] = { tp: 0, total: 0 };
    classMap[r.true_subtype].total++;
    if (r.pred_subtype === r.true_subtype) classMap[r.true_subtype].tp++;
  });
  let f1 = 0;
  Object.values(classMap).forEach(m => { f1 += (m.tp / (m.total || 1)) * m.total / records.length; });
  return { accuracy: parseFloat(accuracy.toFixed(4)), f1: parseFloat(Math.min(f1, 1).toFixed(4)) };
}

async function reseedRun({ benchmarkName, runName, subtypeAccuracy }) {
  // Resolve run_id
  const runRes = await query(
    `SELECT r.id AS run_id
     FROM runs r
     JOIN benchmarks b ON b.id = r.benchmark_id
     WHERE b.name = $1 AND r.run_name = $2
     LIMIT 1`,
    [benchmarkName, runName]
  );
  if (!runRes.rows.length) {
    console.warn(`⚠ Not found in DB: ${benchmarkName} / ${runName}`);
    return;
  }
  const runId = runRes.rows[0].run_id;

  // Fetch all records for this run
  const recRes = await query(
    'SELECT id, true_type, true_subtype FROM run_results WHERE run_id = $1',
    [runId]
  );
  const rows = recRes.rows;
  if (!rows.length) { console.warn(`⚠ No records for run_id=${runId}`); return; }

  // Build subtype map and generate new predictions
  const subtypeMap = buildSubtypeMap(rows);
  const updated = rows.map(r => {
    if (Math.random() < subtypeAccuracy) {
      return { id: r.id, pred_type: r.true_type, pred_subtype: r.true_subtype, true_subtype: r.true_subtype };
    } else {
      const { predType, predSubtype } = wrongPrediction(r.true_type, r.true_subtype, subtypeMap);
      return { id: r.id, pred_type: predType, pred_subtype: predSubtype, true_subtype: r.true_subtype };
    }
  });

  // Batch-update run_results
  const BATCH = 200;
  for (let i = 0; i < updated.length; i += BATCH) {
    const batch = updated.slice(i, i + BATCH);
    // Build a single UPDATE with CASE WHEN for efficiency
    const ids      = batch.map(r => r.id);
    const typeCase = batch.map((r, j) => `WHEN $${j * 3 + 1} THEN $${j * 3 + 2}`).join(' ');
    const subCase  = batch.map((r, j) => `WHEN $${j * 3 + 1} THEN $${j * 3 + 3}`).join(' ');
    const params   = batch.flatMap(r => [r.id, r.pred_type, r.pred_subtype]);
    const idPlaceholders = ids.map((_, j) => `$${batch.length * 3 + j + 1}`).join(', ');

    await query(
      `UPDATE run_results SET
         pred_type    = CASE id ${typeCase} END,
         pred_subtype = CASE id ${subCase}  END
       WHERE id IN (${idPlaceholders})`,
      [...params, ...ids]
    );
  }

  // Recompute and update leaderboard
  const { accuracy, f1 } = calculateMetrics(updated);
  await query(
    `UPDATE leaderboard SET
       subtype_accuracy    = $1,
       subtype_weighted_f1 = $2,
       benchmark_length    = $3
     WHERE run_id = $4`,
    [accuracy, f1, updated.length, runId]
  );

  console.log(`✓ ${benchmarkName} / ${runName}: accuracy=${accuracy}  f1=${f1}  (target=${subtypeAccuracy})`);
}

(async () => {
  try {
    for (const target of TARGETS) {
      await reseedRun(target);
    }
    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await closePool();
  }
})();
