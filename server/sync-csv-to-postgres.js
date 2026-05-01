#!/usr/bin/env node
/**
 * Align PostgreSQL with CSV (CSV is source of truth).
 * - Rebuilds/updates "leaderboard-table" rows from data/leaderboard.csv
 * - Rebuilds per-run tables from data/runs/*.csv
 * - Ensures confidence and other CSV columns are copied
 * - Removes stale Postgres run tables not present in CSV leaderboard
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');
const { query, pool, getClient } = require('./db');

const DATA_DIR = path.join(__dirname, '../data');
const RUNS_DIR = path.join(DATA_DIR, 'runs');

function sanitize(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
}

function qident(id) {
  return `"${String(id).replace(/"/g, '""')}"`;
}

function toJsonOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toNumOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

async function ensureLeaderboardTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS "leaderboard-table" (
      run_id           TEXT PRIMARY KEY,
      nof_items        INTEGER,
      subtype_accuracy NUMERIC(10, 6),
      subtype_weighted_f1 NUMERIC(10, 6),
      type_weighted_f1 NUMERIC(10, 6),
      description      TEXT,
      benchmark        TEXT
    )
  `);

  // Ensure required columns exist for older installs.
  await query(`ALTER TABLE "leaderboard-table" ADD COLUMN IF NOT EXISTS benchmark TEXT`);
  await query(`ALTER TABLE "leaderboard-table" ADD COLUMN IF NOT EXISTS subtype_weighted_f1 NUMERIC(10, 6)`);
  await query(`ALTER TABLE "leaderboard-table" ADD COLUMN IF NOT EXISTS type_weighted_f1 NUMERIC(10, 6)`);
}

async function recreateRunTable(tableName) {
  const qt = qident(tableName);
  await query(`DROP TABLE IF EXISTS ${qt}`);
  await query(`
    CREATE TABLE ${qt} (
      request_id    TEXT,
      true_type     TEXT,
      true_subtype  TEXT,
      pred_type     TEXT,
      pred_subtype  TEXT,
      attributes    JSONB,
      en_attributes JSONB,
      metadata      JSONB,
      en_metadata   JSONB,
      confidence    DOUBLE PRECISION,
      gpt_verdict   TEXT,
      gpt_reasoning TEXT
    )
  `);
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

  await ensureLeaderboardTable();

  const expectedTables = new Set();
  let runTablesSynced = 0;
  let totalRowsInserted = 0;

  for (const csvLb of lbRows) {
    const benchmark = csvLb.benchmark || csvLb.run_name;
    const benchmarkId = seenBenchmarks[benchmark];
    const runFileName = `${benchmarkId}_${sanitize(csvLb.run_name)}.csv`;
    const runFilePath = path.join(RUNS_DIR, runFileName);

    if (!fs.existsSync(runFilePath)) {
      console.log(`  ⚠ Run file not found: ${runFileName} — skipping`);
      continue;
    }

    const runTable = runFileName.replace(/\.csv$/i, '');
    expectedTables.add(runTable);

    const runRecords = csv.parse(
      fs.readFileSync(runFilePath, 'utf-8'),
      { columns: true, skip_empty_lines: true }
    );

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const qt = qident(runTable);
      await client.query(`DROP TABLE IF EXISTS ${qt}`);
      await client.query(`
        CREATE TABLE ${qt} (
          request_id    TEXT,
          true_type     TEXT,
          true_subtype  TEXT,
          pred_type     TEXT,
          pred_subtype  TEXT,
          attributes    JSONB,
          en_attributes JSONB,
          metadata      JSONB,
          en_metadata   JSONB,
          confidence    DOUBLE PRECISION,
          gpt_verdict   TEXT,
          gpt_reasoning TEXT
        )
      `);

      for (const rec of runRecords) {
        await client.query(
          `INSERT INTO ${qt}
           (request_id, true_type, true_subtype, pred_type, pred_subtype, attributes, en_attributes, metadata, en_metadata, confidence, gpt_verdict, gpt_reasoning)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12)`,
          [
            rec.request_id || null,
            rec.true_type || null,
            rec.true_subtype || null,
            rec.pred_type || null,
            rec.pred_subtype || null,
            JSON.stringify(toJsonOrNull(rec.attributes)),
            JSON.stringify(toJsonOrNull(rec.en_attributes)),
            JSON.stringify(toJsonOrNull(rec.metadata)),
            JSON.stringify(toJsonOrNull(rec.en_metadata)),
            toNumOrNull(rec.confidence),
            rec.gpt_verdict || null,
            rec.gpt_reasoning || null,
          ]
        );
      }

      await client.query(
        `INSERT INTO "leaderboard-table" (run_id, nof_items, subtype_accuracy, subtype_weighted_f1, type_weighted_f1, description, benchmark)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (run_id) DO UPDATE
           SET nof_items = EXCLUDED.nof_items,
               subtype_accuracy = EXCLUDED.subtype_accuracy,
               subtype_weighted_f1 = EXCLUDED.subtype_weighted_f1,
               type_weighted_f1 = EXCLUDED.type_weighted_f1,
               description = EXCLUDED.description,
               benchmark = EXCLUDED.benchmark`,
        [
          runTable,
          runRecords.length,
          toNumOrNull(csvLb.subtype_accuracy),
          toNumOrNull(csvLb.subtype_weighted_f1),
          toNumOrNull(csvLb.type_weighted_f1),
          csvLb.run_name,
          benchmark,
        ]
      );

      await client.query('COMMIT');
      runTablesSynced++;
      totalRowsInserted += runRecords.length;
      console.log(`  ✓ ${runTable}: ${runRecords.length} rows synced (benchmark=${benchmark}, run=${csvLb.run_name})`);
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  }

  // Remove stale leaderboard rows/tables not present in CSV anymore.
  const existing = await query(`SELECT run_id FROM "leaderboard-table"`);
  for (const row of existing.rows) {
    if (expectedTables.has(row.run_id)) continue;
    await query(`DELETE FROM "leaderboard-table" WHERE run_id = $1`, [row.run_id]);
    await query(`DROP TABLE IF EXISTS ${qident(row.run_id)}`);
    console.log(`  ✓ Removed stale run/table: ${row.run_id}`);
  }

  console.log(`\nDone. Synced run tables: ${runTablesSynced}, rows inserted: ${totalRowsInserted}, benchmarks: ${Object.keys(seenBenchmarks).join(', ')}`);
  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
