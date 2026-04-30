/**
 * One-time migration: copy data/validation.json retag values into the run CSVs.
 * Run once: node migrate-validation-to-csv.js
 */
const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');

const DATA_DIR        = path.join(__dirname, 'data');
const RUNS_DIR        = path.join(DATA_DIR, 'runs');
const VALIDATION_FILE = path.join(DATA_DIR, 'validation.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.csv');

function sanitize(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
}

function csvEscapeCell(v) {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const verdicts = JSON.parse(fs.readFileSync(VALIDATION_FILE, 'utf-8'));
const lbRows   = csv.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf-8'), { columns: true, skip_empty_lines: true });

const benchmarks = {};

lbRows.forEach((row, i) => {
  const runId = i + 1;
  const bname = row.benchmark || row.run_name;

  if (!benchmarks[bname]) {
    const newId = Object.keys(benchmarks).length + 1;
    benchmarks[bname] = newId;
  }

  const benchId = benchmarks[bname];
  const fname   = benchId + '_' + sanitize(row.run_name) + '.csv';
  const fpath   = path.join(RUNS_DIR, fname);

  const runVerdicts = verdicts[String(runId)];
  if (!runVerdicts || Object.keys(runVerdicts).length === 0) return;
  if (!fs.existsSync(fpath)) { console.log('MISSING:', fname); return; }

  const records = csv.parse(fs.readFileSync(fpath, 'utf-8'), { columns: true, skip_empty_lines: true });
  const baseHeaders = Object.keys(records[0] || {});
  const headers = baseHeaders.includes('true_subtype') ? baseHeaders : [...baseHeaders, 'true_subtype'];

  let changed = 0;
  const updated = records.map(r => {
    const v = runVerdicts[r.request_id];
    if (!v) return r;
    changed++;
    return Object.assign({}, r, { true_subtype: v });
  });

  if (changed > 0) {
    const csvContent = [
      headers.join(','),
      ...updated.map(r => headers.map(h => csvEscapeCell(r[h])).join(','))
    ].join('\n') + '\n';
    fs.writeFileSync(fpath, csvContent, 'utf-8');
    console.log('Updated', fname + ':', changed, 'records');
  }
});

console.log('Migration done.');
