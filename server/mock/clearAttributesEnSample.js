/**
 * Clears en_attributes for 100 random records per benchmark so the
 * Translate button has something to actually translate.
 *
 * Usage: node server/mock/clearAttributesEnSample.js
 */

const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');

const RUNS_DIR         = path.join(__dirname, '../../data/runs');
const TRANSLATIONS_FILE = path.join(__dirname, '../../data/translations.json');
const SAMPLE_SIZE      = 100;

function escape(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(filePath, rows) {
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(','))
  ];
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Group CSV files by benchmark id (the numeric prefix before the first '_')
const files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.csv'));
const byBenchmark = {};
files.forEach(f => {
  const benchmarkId = f.split('_')[0];
  if (!byBenchmark[benchmarkId]) byBenchmark[benchmarkId] = [];
  byBenchmark[benchmarkId].push(f);
});

// Load translations.json
let translations = {};
if (fs.existsSync(TRANSLATIONS_FILE)) {
  try { translations = JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf-8')); } catch {}
}

let totalCleared = 0;

Object.entries(byBenchmark).forEach(([benchmarkId, runFiles]) => {
  // Pick 100 random request_ids from the first run file in this benchmark
  const firstFile = path.join(RUNS_DIR, runFiles[0]);
  const rows = csv.parse(fs.readFileSync(firstFile, 'utf-8'), { columns: true, skip_empty_lines: true });
  const allIds = rows.map(r => r.request_id);
  const sampled = new Set(shuffle([...allIds]).slice(0, SAMPLE_SIZE));

  console.log(`Benchmark ${benchmarkId}: clearing ${sampled.size} records across ${runFiles.length} run file(s)`);

  // Clear en_attributes in every run file for this benchmark
  runFiles.forEach(fname => {
    const fpath = path.join(RUNS_DIR, fname);
    const runRows = csv.parse(fs.readFileSync(fpath, 'utf-8'), { columns: true, skip_empty_lines: true });
    const updated = runRows.map(r => sampled.has(r.request_id) ? { ...r, en_attributes: '' } : r);
    writeCsv(fpath, updated);
    console.log(`  ✓ ${fname}`);
  });

  // Remove those request_ids from translations.json
  sampled.forEach(id => delete translations[id]);
  totalCleared += sampled.size;
});

// Save updated translations.json
fs.writeFileSync(TRANSLATIONS_FILE, JSON.stringify(translations, null, 2), 'utf-8');

console.log(`\nDone. Cleared en_attributes for ${totalCleared} unique request_ids (${SAMPLE_SIZE} per benchmark).`);
console.log('Restart the server to reload the CSV cache.');
