/**
 * Retag API
 * Persists tagger-assigned retag_subtype overrides to data/retag.json.
 *
 * Retag corrects the ground-truth label (true_subtype), which is shared across
 * all runs of the same benchmark.  Entries are therefore keyed by benchmark_id,
 * not run_id.  Each entry stores a full record snapshot so the Retag tab can
 * display attributes/metadata even when the record is not in the current
 * 1000-row allRecordsData slice.
 *
 * Storage schema (data/retag.json):
 * {
 *   "<benchmark_id>": {
 *     "<request_id>": {
 *       "retag_subtype": "...",
 *       "record": { request_id, true_type, true_subtype, pred_type, pred_subtype, attributes, metadata }
 *     }
 *   }
 * }
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const RETAG_FILE = path.join(__dirname, '../../data/retag.json');

function load() {
  if (!fs.existsSync(RETAG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(RETAG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(RETAG_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * GET /api/retag?benchmark_id=1
 * Returns all retag entries for the given benchmark as an array:
 * [{ request_id, retag_subtype, record }]
 */
router.get('/retag', (req, res) => {
  const { benchmark_id } = req.query;
  if (!benchmark_id) return res.status(400).json({ error: 'benchmark_id is required' });

  const data = load();
  const entries = data[benchmark_id] || {};
  const result = Object.entries(entries).map(([request_id, entry]) => ({
    request_id,
    retag_subtype: entry.retag_subtype || '',
    record: entry.record || null,
  }));
  res.json(result);
});

/**
 * PUT /api/retag
 * Replaces all retag entries for a benchmark.
 * Body: { benchmark_id, entries: [{ request_id, retag_subtype, record }] }
 */
router.put('/retag', (req, res) => {
  const { benchmark_id, entries } = req.body;
  if (!benchmark_id) return res.status(400).json({ error: 'benchmark_id is required' });

  const data = load();
  data[benchmark_id] = {};
  (entries || []).forEach(e => {
    data[benchmark_id][e.request_id] = {
      retag_subtype: e.retag_subtype || '',
      record: e.record || null,
    };
  });
  save(data);
  res.json({ ok: true, count: (entries || []).length });
});

module.exports = router;
