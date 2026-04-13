/**
 * Migration: rename column attributes_en → en_attributes in run_results,
 * all per-run tables, and the GIN index.
 *
 * Usage:  node server/migrate-rename-en-attributes.js
 */

require('dotenv').config();
const { query, pool } = require('./db');

async function renameColumn(tbl, from, to) {
  // Check whether the old column still exists
  const check = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = $1
       AND column_name = $2`,
    [tbl, from]
  );
  if (check.rows.length === 0) {
    console.log(`  "${tbl}".${from} not found (already renamed or missing), skipping`);
    return;
  }
  await query(`ALTER TABLE "${tbl}" RENAME COLUMN ${from} TO ${to}`);
  console.log(`  ✓ "${tbl}": ${from} → ${to}`);
}

async function migrate() {
  // 1. run_results (new-style schema)
  try {
    await renameColumn('run_results', 'attributes_en', 'en_attributes');
  } catch (err) {
    if (err.code === '42P01') console.log('  run_results not found, skipping');
    else throw err;
  }

  // 2. Per-run tables listed in leaderboard-table (old-style schema)
  let runRows = [];
  try {
    const r = await query(`SELECT run_id FROM "leaderboard-table" ORDER BY run_id`);
    runRows = r.rows;
  } catch (err) {
    if (err.code !== '42P01') throw err;
    console.log('  "leaderboard-table" not found — skipping per-run tables');
  }

  console.log(`Renaming column in ${runRows.length} per-run tables…`);
  for (const { run_id: tbl } of runRows) {
    try {
      await renameColumn(tbl, 'attributes_en', 'en_attributes');
    } catch (err) {
      if (err.code === '42P01') console.warn(`  ⚠ Table "${tbl}" not found, skipping`);
      else throw err;
    }
  }

  // 3. Rename the GIN index on run_results (best-effort)
  try {
    await query(`ALTER INDEX IF EXISTS idx_run_results_attributes_en RENAME TO idx_run_results_en_attributes`);
    console.log('  ✓ index idx_run_results_attributes_en → idx_run_results_en_attributes');
  } catch (err) {
    console.warn('  ⚠ Could not rename index:', err.message);
  }

  console.log('\nMigration complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
