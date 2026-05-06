/**
 * One-time migration: copy data/validation.json retag values into PostgreSQL run tables.
 * Run once: node migrate-validation-to-postgres.js
 */
require('dotenv').config();
const { pool } = require('./server/db');
const fs   = require('fs');
const path = require('path');

const VALIDATION_FILE = path.join(__dirname, 'data', 'validation.json');

async function main() {
  const verdicts = JSON.parse(fs.readFileSync(VALIDATION_FILE, 'utf-8'));

  // Get runs in order (same logic as getRunIndex in db-loader.js)
  const result = await pool.query(
    `SELECT run_id, nof_items, description, benchmark
     FROM "leaderboard-table"
     ORDER BY run_id ASC`
  );

  const runs = result.rows.map((row, i) => ({
    syntheticId: i + 1,
    tableName: row.run_id,
  }));

  // For each run that has verdicts, find the id column and update rows
  for (const run of runs) {
    const runVerdicts = verdicts[String(run.syntheticId)];
    if (!runVerdicts || Object.keys(runVerdicts).length === 0) continue;

    const entries = Object.entries(runVerdicts).filter(([, v]) => v);
    if (entries.length === 0) continue;

    // Find the request id column
    const colRes = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1
         AND column_name IN ('request_id', 'record_id')
       ORDER BY CASE column_name WHEN 'request_id' THEN 0 ELSE 1 END LIMIT 1`,
      [run.tableName]
    );
    if (colRes.rows.length === 0) {
      console.warn(`No id column for table "${run.tableName}", skipping`);
      continue;
    }
    const idCol = colRes.rows[0].column_name;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let updated = 0;
      for (const [requestId, trueSubtype] of entries) {
        const r = await client.query(
          `UPDATE "${run.tableName}" SET true_subtype = $1 WHERE ${idCol} = $2`,
          [trueSubtype, requestId]
        );
        updated += r.rowCount || 0;
      }
      await client.query('COMMIT');
      console.log(`Updated "${run.tableName}" (run ${run.syntheticId}): ${updated} rows`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Failed for run ${run.syntheticId} (${run.tableName}):`, err.message);
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log('PostgreSQL migration done.');
}

main().catch(err => { console.error(err); process.exit(1); });
