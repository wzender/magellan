/**
 * Migration: add en_metadata JSONB column to all existing per-run tables
 * and to run_results (if it exists).
 *
 * Usage:  node server/migrate-add-en-metadata.js
 */

require('dotenv').config();
const { query, pool } = require('./db');

async function migrate() {
  // 1. Add to run_results if it exists
  try {
    await query(`ALTER TABLE run_results ADD COLUMN IF NOT EXISTS en_metadata JSONB`);
    console.log('✓ run_results.en_metadata added (or already existed)');
  } catch (err) {
    if (err.code === '42P01') {
      console.log('  run_results table not found, skipping');
    } else {
      throw err;
    }
  }

  // 2. Find all per-run tables from leaderboard-table
  let runRows;
  try {
    const result = await query(`SELECT run_id FROM "leaderboard-table" ORDER BY run_id`);
    runRows = result.rows;
  } catch (err) {
    if (err.code === '42P01') {
      console.log('  "leaderboard-table" not found — nothing more to do');
      await pool.end();
      return;
    }
    throw err;
  }

  console.log(`Found ${runRows.length} per-run tables to migrate`);

  for (const { run_id: tbl } of runRows) {
    try {
      await query(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS en_metadata JSONB`);
      console.log(`  ✓ "${tbl}".en_metadata added`);
    } catch (err) {
      if (err.code === '42P01') {
        console.warn(`  ⚠ Table "${tbl}" not found, skipping`);
      } else {
        throw err;
      }
    }
  }

  console.log('\nMigration complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
