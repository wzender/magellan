/**
 * Syncs the en_attributes sample-clear to Postgres.
 * Reads which request_ids have blank en_attributes in the CSVs and
 * NULLs en_attributes for those ids in all per-run tables + run_results.
 *
 * Usage: node server/mock/clearAttributesEnSamplePostgres.js
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');
const { query, pool } = require('../db');

const RUNS_DIR = path.join(__dirname, '../../data/runs');

// Collect all request_ids that have no en_attributes across all run CSVs
const cleared = new Set();
fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.csv')).forEach(fname => {
  const rows = csv.parse(
    fs.readFileSync(path.join(RUNS_DIR, fname), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );
  rows.forEach(r => { if (!r.en_attributes) cleared.add(r.request_id); });
});

const ids = Array.from(cleared);
console.log(`Found ${ids.length} request_ids with blank en_attributes in CSVs`);

async function run() {
  // 1. run_results (old-style schema)
  try {
    const res = await query(
      `UPDATE run_results SET en_attributes = NULL WHERE record_id = ANY($1)`,
      [ids]
    );
    console.log(`✓ run_results: ${res.rowCount} rows cleared`);
  } catch (err) {
    if (err.code === '42P01') console.log('  run_results not found, skipping');
    else throw err;
  }

  // 2. Per-run tables from leaderboard-table
  let runRows;
  try {
    const r = await query(`SELECT run_id FROM "leaderboard-table" ORDER BY run_id`);
    runRows = r.rows;
  } catch (err) {
    if (err.code === '42P01') { console.log('"leaderboard-table" not found — done'); await pool.end(); return; }
    throw err;
  }

  console.log(`Clearing ${runRows.length} per-run tables…`);
  for (const { run_id: tbl } of runRows) {
    try {
      // detect id column
      const colRes = await query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1
           AND column_name IN ('request_id','record_id')
         ORDER BY CASE column_name WHEN 'request_id' THEN 0 ELSE 1 END LIMIT 1`,
        [tbl]
      );
      if (colRes.rows.length === 0) { console.warn(`  ⚠ No id column for "${tbl}", skipping`); continue; }
      const idCol = colRes.rows[0].column_name;
      const res = await query(
        `UPDATE "${tbl}" SET en_attributes = NULL WHERE ${idCol} = ANY($1)`,
        [ids]
      );
      console.log(`  ✓ "${tbl}": ${res.rowCount} rows cleared`);
    } catch (err) {
      if (err.code === '42P01') console.warn(`  ⚠ Table "${tbl}" not found, skipping`);
      else throw err;
    }
  }

  console.log('\nDone.');
  await pool.end();
}

run().catch(err => { console.error('Failed:', err); process.exit(1); });
