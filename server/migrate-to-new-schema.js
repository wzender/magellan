/**
 * Migration: old schema → new schema
 *
 * Old: benchmarks, runs, leaderboard, run_results (flat)
 * New: "leaderboard-table" + one table per run named YYYYMMDD-{run_id:04d}-benchmark_slug
 *
 * Usage:  node server/migrate-to-new-schema.js
 */

require('dotenv').config();
const { query, pool } = require('./db');

function slugify(name) {
  return name.trim().replace(/\s+/g, '-');
}

function runTableName(runId, createdAt, benchmarkName) {
  const d = new Date(createdAt);
  const date = d.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const id   = String(runId).padStart(4, '0');
  return `${date}-${id}-${slugify(benchmarkName)}`;
}

async function migrate() {
  console.log('Fetching existing data...');

  const runsResult = await query(`
    SELECT r.id, r.run_name, r.model_version, r.created_at,
           b.name AS benchmark_name,
           l.subtype_accuracy, l.benchmark_length
    FROM runs r
    JOIN benchmarks b ON r.benchmark_id = b.id
    JOIN leaderboard l ON l.run_id = r.id
    ORDER BY r.id
  `);

  const runs = runsResult.rows;
  console.log(`Found ${runs.length} runs`);

  // ── Create "leaderboard-table" ──────────────────────────────────────────────
  await query(`DROP TABLE IF EXISTS "leaderboard-table"`);
  await query(`
    CREATE TABLE "leaderboard-table" (
      run_id           TEXT PRIMARY KEY,
      nof_items        INTEGER,
      subtype_accuracy NUMERIC(6,4),
      description      TEXT
    )
  `);
  console.log('Created "leaderboard-table"');

  // ── For each run: create per-run table and migrate records ──────────────────
  for (const run of runs) {
    const tbl = runTableName(run.id, run.created_at, run.benchmark_name);
    console.log(`  Migrating run ${run.id} → "${tbl}"`);

    // Drop if leftover from a previous migration attempt
    await query(`DROP TABLE IF EXISTS "${tbl}"`);

    await query(`
      CREATE TABLE "${tbl}" (
        request_id    TEXT,
        true_type     TEXT,
        true_subtype  TEXT,
        pred_type     TEXT,
        pred_subtype  TEXT,
        attributes    JSONB,
        attributes_en JSONB,
        metadata      JSONB
      )
    `);

    // Bulk-insert from run_results
    await query(`
      INSERT INTO "${tbl}" (request_id, true_type, true_subtype, pred_type, pred_subtype, attributes, attributes_en, metadata)
      SELECT request_id, true_type, true_subtype, pred_type, pred_subtype, attributes, attributes_en, metadata
      FROM run_results
      WHERE run_id = $1
      ORDER BY request_id
    `, [run.id]);

    // Insert leaderboard row
    await query(`
      INSERT INTO "leaderboard-table" (run_id, nof_items, subtype_accuracy, description)
      VALUES ($1, $2, $3, $4)
    `, [tbl, run.benchmark_length, run.subtype_accuracy, run.run_name]);
  }

  console.log('\nMigration complete.');
  console.log('Old tables (benchmarks, runs, leaderboard, run_results) have been left intact.');
  console.log('Set DATA_SOURCE=postgres in .env to use the new schema.');

  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
