/**
 * Reseed specific run CSVs with target subtype accuracy rates.
 * Reads existing true labels, regenerates predictions, rewrites CSV + leaderboard.
 *
 * Usage: node server/mock/reseedAccuracy.js
 */

const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');

const DATA_DIR  = path.join(__dirname, '../../data');
const RUNS_DIR  = path.join(DATA_DIR, 'runs');
const LB_FILE   = path.join(DATA_DIR, 'leaderboard.csv');

const TARGETS = [
  { file: '1_model_v2.csv', subtypeAccuracy: 0.85 },
  { file: '1_model_v3.csv', subtypeAccuracy: 0.82 },
  { file: '3_model_v3.csv', subtypeAccuracy: 0.87 },
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Given a record's true_type and true_subtype, generate a prediction that is
 * wrong in a realistic way: 70% same-type wrong subtype, 30% cross-type error.
 */
function wrongPrediction(trueType, trueSubtype, subtypeMap) {
  const types = Object.keys(subtypeMap);
  if (Math.random() < 0.7) {
    // Same-type, wrong subtype
    const siblings = subtypeMap[trueType].filter(s => s !== trueSubtype);
    return { pred_type: trueType, pred_subtype: siblings.length ? rand(siblings) : trueSubtype };
  } else {
    // Cross-type error
    const wrongType = rand(types.filter(t => t !== trueType));
    return { pred_type: wrongType, pred_subtype: rand(subtypeMap[wrongType]) };
  }
}

function buildSubtypeMap(records) {
  const map = {};
  records.forEach(r => {
    if (!map[r.true_type]) map[r.true_type] = new Set();
    map[r.true_type].add(r.true_subtype);
  });
  const result = {};
  Object.entries(map).forEach(([t, s]) => { result[t] = Array.from(s); });
  return result;
}

function escapeCell(v) {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function recordsToCsv(headers, records) {
  const lines = [headers.join(',')];
  records.forEach(r => lines.push(headers.map(h => escapeCell(r[h])).join(',')));
  return lines.join('\n') + '\n';
}

function calculateMetrics(records) {
  const correct = records.filter(r => r.pred_subtype === r.true_subtype).length;
  const accuracy = correct / records.length;
  // Weighted F1 approximation (precision per class, weighted by support)
  const classMap = {};
  records.forEach(r => {
    if (!classMap[r.true_subtype]) classMap[r.true_subtype] = { tp: 0, total: 0 };
    classMap[r.true_subtype].total++;
    if (r.pred_subtype === r.true_subtype) classMap[r.true_subtype].tp++;
  });
  let f1 = 0;
  Object.values(classMap).forEach(m => {
    f1 += (m.tp / (m.total || 1)) * m.total / records.length;
  });
  return { accuracy: accuracy.toFixed(4), f1: Math.min(f1, 1).toFixed(4) };
}

// ── process each target ────────────────────────────────────────────────────

TARGETS.forEach(({ file, subtypeAccuracy }) => {
  const fpath = path.join(RUNS_DIR, file);
  if (!fs.existsSync(fpath)) { console.warn(`⚠ Not found: ${file}`); return; }

  const raw = csv.parse(fs.readFileSync(fpath, 'utf-8'), { columns: true, skip_empty_lines: true });
  const subtypeMap = buildSubtypeMap(raw);
  const headers = Object.keys(raw[0]);

  const updated = raw.map(r => {
    const isCorrect = Math.random() < subtypeAccuracy;
    if (isCorrect) {
      return { ...r, pred_type: r.true_type, pred_subtype: r.true_subtype };
    } else {
      const { pred_type, pred_subtype } = wrongPrediction(r.true_type, r.true_subtype, subtypeMap);
      return { ...r, pred_type, pred_subtype };
    }
  });

  fs.writeFileSync(fpath, recordsToCsv(headers, updated), 'utf-8');
  const { accuracy, f1 } = calculateMetrics(updated);
  console.log(`✓ ${file}: accuracy=${accuracy}  f1=${f1}  (target=${subtypeAccuracy})`);

  // Update leaderboard.csv row matching this file
  // File name format: {benchmarkId}_{sanitized_run_name}.csv
  const [benchmarkId, ...rest] = file.replace('.csv', '').split('_');
  const sanitizedRunName = rest.join('_');

  const lbRaw = fs.readFileSync(LB_FILE, 'utf-8');
  const lbRows = csv.parse(lbRaw, { columns: true, skip_empty_lines: true });
  const lbHeaders = Object.keys(lbRows[0]);

  // Find the leaderboard row: benchmark_id matches and sanitize(run_name) matches
  function sanitize(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
  }

  // We need to know which benchmark name corresponds to benchmarkId.
  // Re-derive: iterate leaderboard rows in order, assign IDs as csv-loader does.
  const seenBenchmarks = {};
  lbRows.forEach(row => {
    const bName = row.benchmark || row.run_name;
    if (!seenBenchmarks[bName]) seenBenchmarks[bName] = Object.keys(seenBenchmarks).length + 1;
  });

  let matched = false;
  const updatedLb = lbRows.map(row => {
    const bName = row.benchmark || row.run_name;
    const bId = String(seenBenchmarks[bName]);
    if (bId === benchmarkId && sanitize(row.run_name) === sanitizedRunName) {
      matched = true;
      return { ...row, subtype_weighted_f1: f1 };
    }
    return row;
  });

  if (!matched) { console.warn(`⚠ No leaderboard row found for ${file}`); return; }

  const lbCsv = [lbHeaders.join(','), ...updatedLb.map(r => lbHeaders.map(h => escapeCell(r[h])).join(','))].join('\n') + '\n';
  fs.writeFileSync(LB_FILE, lbCsv, 'utf-8');
  console.log(`  leaderboard updated`);
});
