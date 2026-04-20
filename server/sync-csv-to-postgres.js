#!/usr/bin/env node
/**
 * Sync CSV data into PostgreSQL.
 * 1. Updates subtype_accuracy + nof_items in "leaderboard-table" from leaderboard.csv
 * 2. Updates pred_type + pred_subtype in each per-run table from runs/*.csv
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');
const { query, pool } = require('./db');

const DATA_DIR = path.join(__dirname, '../data');
const RUNS_DIR = path.join(DATA_DIR, 'runs');

function sanitize(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
}

async function main() {
  // ── 1. Load leaderboard CSV ───────────────────────────────────────────────
  const lbRows = csv.parse(
    fs.readFileSync(path.join(DATA_DIR, 'leaderboard.csv'), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );

  // Build benchmark_id map (mirrors csv-loader.js logic)
  const seenBenchmarks = {};
  lbRows.forEach(row => {
    const name = row.benchmark || row.run_name;
    if (!seenBenchmarks[name]) seenBenchmarks[name] = Object.keys(seenBenchmarks).length + 1;
  });

  // ── 2. Load current leaderboard-table from Postgres ───────────────────────
  const pgLeaderboard = await query(
    `SELECT run_id, description, benchmark FROM "leaderboard-table" ORDER BY run_id`
  );

  let lbUpdated = 0;
  let rowsUpdated = 0;

  for (const pgRow of pgLeaderboard.rows) {
    const pgTable      = pgRow.run_id;
    const pgDesc       = pgRow.description;   // matches CSV run_name
    const pgBenchmark  = pgRow.benchmark;

    // Find matching CSV leaderboard row
    const csvLb = lbRows.find(r =>
      (r.benchmark || r.run_name) === pgBenchmark && r.run_name === pgDesc
    );

    if (!csvLb) {
      console.log(`  ⚠ No CSV match for "${pgBenchmark}" / "${pgDesc}" — skipping`);
      continue;
    }

    // ── 2a. Update leaderboard-table accuracy ──────────────────────────────
    const newAccuracy = parseFloat(csvLb.subtype_accuracy);

    // Find the run CSV file
    const benchmarkId = seenBenchmarks[pgBenchmark];
    const runFileName = `${benchmarkId}_${sanitize(csvLb.run_name)}.csv`;
    const runFilePath = path.join(RUNS_DIR, runFileName);

    let nofItems = null;
    if (fs.existsSync(runFilePath)) {
      const runRecords = csv.parse(
        fs.readFileSync(runFilePath, 'utf-8'),
        { columns: true, skip_empty_lines: true }
      );
      nofItems = runRecords.length;

      // ── 2b. Update pred_type / pred_subtype in per-run PG table ───────────
      // Check which id column exists
      const colRes = await query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1
           AND column_name IN ('request_id','record_id')
         ORDER BY CASE column_name WHEN 'request_id' THEN 0 ELSE 1 END LIMIT 1`,
        [pgTable]
      );

      if (colRes.rows.length > 0) {
        const idCol = colRes.rows[0].column_name;

        // Batch updates in a single transaction
        await pool.query('BEGIN');
        try {
          for (const rec of runRecords) {
            const reqId = rec.request_id;
            const res = await query(
              `UPDATE "${pgTable}"
               SET pred_type = $1, pred_subtype = $2
               WHERE ${idCol} = $3
                 AND (pred_type IS DISTINCT FROM $1 OR pred_subtype IS DISTINCT FROM $2)`,
              [rec.pred_type, rec.pred_subtype, reqId]
            );
            rowsUpdated += res.rowCount;
          }
          await pool.query('COMMIT');
          console.log(`  ✓ ${pgTable}: updated predictions (${rowsUpdated} rows changed so far)`);
        } catch (err) {
          await pool.query('ROLLBACK');
          throw err;
        }
      } else {
        console.log(`  ⚠ No id column found in "${pgTable}" — skipping row updates`);
      }
    } else {
      console.log(`  ⚠ Run file not found: ${runFileName} — skipping row updates`);
    }

    // Update leaderboard accuracy + nof_items
    const updateRes = await query(
      `UPDATE "leaderboard-table"
       SET subtype_accuracy = $1 ${nofItems !== null ? ', nof_items = $3' : ''}
       WHERE run_id = $2`,
      nofItems !== null ? [newAccuracy, pgTable, nofItems] : [newAccuracy, pgTable]
    );
    if (updateRes.rowCount > 0) {
      console.log(`  ✓ leaderboard-table: "${pgTable}" accuracy → ${newAccuracy}${nofItems !== null ? `, nof_items → ${nofItems}` : ''}`);
      lbUpdated++;
    }
  }

  console.log(`\nDone. Leaderboard rows updated: ${lbUpdated}, prediction rows changed: ${rowsUpdated}`);
  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
