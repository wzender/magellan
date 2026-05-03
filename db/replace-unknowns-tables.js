#!/usr/bin/env node
/**
 * Replaces Postgres tables for the Unknowns benchmark (benchmark_id = 4)
 * with the full contents of their corresponding CSV files.
 *
 * Each unknowns run in runs.csv maps:
 *   CSV file  → data/runs/4_{run_name}.csv
 *   PG table  → {run_name}   (the run_name column, not the filename)
 *
 * The script DROPs and re-CREATEs each table so that rows added to the CSV
 * after the original DB import are picked up.
 *
 * Usage:
 *   node db/replace-unknowns-tables.js
 *
 * Env vars (via .env):
 *   DATABASE_URL   — Postgres connection string
 *   DB_SCHEMA      — schema name (default: magellan)
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');
const { Client } = require('pg');

const DATA_DIR        = path.join(__dirname, '../data/runs');
const LEADERBOARD_FILE = path.join(__dirname, '../data/leaderboard.csv');
const DB_SCHEMA = process.env.DB_SCHEMA || 'magellan';
const UNKNOWNS_BENCHMARK_ID = '4';

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`SET search_path = ${DB_SCHEMA}`);
  console.log(`Connected. Schema: ${DB_SCHEMA}\n`);

  // Read leaderboard.csv to find unknowns runs (benchmark = 'Unknowns')
  const lbRaw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
  const allRows = csv.parse(lbRaw, { columns: true, skip_empty_lines: true });
  const unknownsRuns = allRows.filter(r => r.benchmark === 'Unknowns');

  if (unknownsRuns.length === 0) {
    console.error(`No runs found with benchmark='Unknowns' in leaderboard.csv`);
    process.exit(1);
  }

  console.log(`Found ${unknownsRuns.length} unknowns run(s): ${unknownsRuns.map(r => r.run_name).join(', ')}\n`);

  for (const run of unknownsRuns) {
    const tableName = run.run_name;
    const csvFile   = path.join(DATA_DIR, `${UNKNOWNS_BENCHMARK_ID}_${tableName}.csv`);

    if (!fs.existsSync(csvFile)) {
      console.warn(`  skip: CSV not found at ${csvFile}`);
      continue;
    }

    const raw     = fs.readFileSync(csvFile, 'utf-8');
    const records = csv.parse(raw, { columns: true, skip_empty_lines: true });

    if (records.length === 0) {
      console.warn(`  skip: ${csvFile} is empty`);
      continue;
    }

    console.log(`Processing "${tableName}" ← ${path.basename(csvFile)} (${records.length} rows)`);

    // Drop and recreate the table
    await client.query(`DROP TABLE IF EXISTS "${tableName}"`);
    await client.query(`
      CREATE TABLE "${tableName}" (
        request_id         TEXT,
        true_type          TEXT,
        true_subtype       TEXT,
        pred_type          TEXT,
        pred_subtype       TEXT,
        attributes         TEXT,
        metadata           TEXT,
        en_attributes      TEXT,
        en_metadata        TEXT,
        confidence         FLOAT,
        pred_subtype_1     TEXT,
        pred_subtype_2     TEXT,
        missing_subtype    TEXT,
        decision_status    TEXT,
        decision_mapped_to TEXT,
        gpt_verdict        TEXT,
        gpt_reasoning      TEXT
      )
    `);
    console.log(`  table "${tableName}" recreated`);

    // Insert all rows
    let inserted = 0;
    for (const r of records) {
      await client.query(
        `INSERT INTO "${tableName}"
           (request_id, true_type, true_subtype, pred_type, pred_subtype,
            attributes, metadata, en_attributes, confidence,
            pred_subtype_1, pred_subtype_2, missing_subtype,
            decision_status, decision_mapped_to)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          r.request_id         || null,
          r.true_type          || null,
          r.true_subtype       || null,
          r.pred_type          || null,
          r.pred_subtype       || null,
          r.attributes         || null,
          r.metadata           || null,
          r.en_attributes      || null,
          r.confidence         ? parseFloat(r.confidence) : null,
          r.pred_subtype_1     || null,
          r.pred_subtype_2     || null,
          r.missing_subtype    || null,
          r.decision_status    || null,
          r.decision_mapped_to || null,
        ]
      );
      inserted++;
    }
    console.log(`  inserted ${inserted} rows\n`);
  }

  await client.end();
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
