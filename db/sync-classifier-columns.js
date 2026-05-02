#!/usr/bin/env node
/**
 * Syncs pred_subtype_1, pred_subtype_2, missing_output columns from CSV files
 * into the corresponding Postgres per-run tables.
 *
 * Usage: node db/sync-classifier-columns.js
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');
const { Client } = require('pg');

const DATA_DIR = path.join(__dirname, '../data/runs');
const DB_SCHEMA = process.env.DB_SCHEMA || 'magellan';

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`SET search_path = ${DB_SCHEMA}`);

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));

  for (const file of files) {
    const tableName = file.replace('.csv', '');
    const filePath  = path.join(DATA_DIR, file);

    // Check the table exists
    const existsRes = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [DB_SCHEMA, tableName]
    );
    if (existsRes.rows.length === 0) {
      console.log(`  skip: table "${tableName}" not found in Postgres`);
      continue;
    }

    // Read CSV
    const raw     = fs.readFileSync(filePath, 'utf-8');
    const records = csv.parse(raw, { columns: true, skip_empty_lines: true });

    // Only process files that have the new columns
    const sample = records[0] || {};
    const hasCols = 'pred_subtype_1' in sample || 'pred_subtype_2' in sample || 'missing_output' in sample;
    if (!hasCols) {
      console.log(`  skip: ${file} has no classifier columns`);
      continue;
    }

    console.log(`syncing ${file} → "${tableName}" (${records.length} rows)`);

    // Add columns if missing
    for (const col of ['pred_subtype_1', 'pred_subtype_2', 'missing_output']) {
      await client.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS ${col} TEXT`);
    }

    // Detect id column
    const idRes = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
         AND column_name IN ('request_id', 'record_id')
       ORDER BY CASE column_name WHEN 'request_id' THEN 0 ELSE 1 END LIMIT 1`,
      [DB_SCHEMA, tableName]
    );
    if (idRes.rows.length === 0) {
      console.warn(`  warning: no request_id/record_id column in "${tableName}", skipping`);
      continue;
    }
    const idCol = idRes.rows[0].column_name;

    // Upsert each row: insert new rows, update classifier columns on conflict
    let upserted = 0;
    for (const r of records) {
      const sub1    = r.pred_subtype_1  || null;
      const sub2    = r.pred_subtype_2  || null;
      const missing = r.missing_output  || null;
      const rid     = r.request_id || r.record_id;

      const exists = await client.query(
        `SELECT 1 FROM "${tableName}" WHERE ${idCol} = $1 LIMIT 1`, [rid]
      );

      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO "${tableName}" (${idCol}, true_type, true_subtype, pred_type, pred_subtype,
             attributes, en_attributes, metadata, en_metadata, confidence,
             pred_subtype_1, pred_subtype_2, missing_output)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            rid,
            r.true_type    || null,
            r.true_subtype || null,
            r.pred_type    || null,
            r.pred_subtype || null,
            r.attributes   || null,
            r.en_attributes|| null,
            r.metadata     || null,
            r.en_metadata  || null,
            r.confidence   ? parseFloat(r.confidence) : null,
            sub1, sub2, missing,
          ]
        );
      } else {
        await client.query(
          `UPDATE "${tableName}" SET pred_subtype_1 = $1, pred_subtype_2 = $2, missing_output = $3 WHERE ${idCol} = $4`,
          [sub1, sub2, missing, rid]
        );
      }
      upserted++;
    }
    console.log(`  upserted ${upserted} rows`);
  }

  await client.end();
  console.log('done');
}

main().catch(err => { console.error(err); process.exit(1); });
