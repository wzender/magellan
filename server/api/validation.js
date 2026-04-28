/**
 * Validation API
 * Persists human verdicts for "Unknowns" benchmark records.
 *
 * Each record in an Unknowns run gets a ternary verdict:
 *   "justified" | "unjustified" | "unclear" | "" (unreviewed)
 *
 * Storage schema (data/validation.json):
 * {
 *   "<run_id>": {
 *     "<request_id>": "justified" | "unjustified" | "unclear"
 *   }
 * }
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const VALIDATION_FILE = path.join(__dirname, '../../data/validation.json');
const VALID_VERDICTS = null; // accepts any string — used for both verdicts and retag subtypes

function load() {
  if (!fs.existsSync(VALIDATION_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(VALIDATION_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(VALIDATION_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * GET /api/validation?run_id=10
 * Returns all verdicts for the given run as an object: { request_id: verdict }
 */
router.get('/validation', (req, res) => {
  const { run_id } = req.query;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });

  const data = load();
  const verdicts = data[run_id] || {};
  res.json(verdicts);
});

/**
 * PUT /api/validation
 * Set verdict(s) for one or more records in a run.
 * Body: { run_id, verdicts: { request_id: verdict, ... } }
 */
router.put('/validation', (req, res) => {
  const { run_id, verdicts } = req.body;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });
  if (!verdicts || typeof verdicts !== 'object') {
    return res.status(400).json({ error: 'verdicts object is required' });
  }

const data = load();
  if (!data[run_id]) data[run_id] = {};
  Object.assign(data[run_id], verdicts);

  // Remove empty verdicts (un-marking)
  for (const [reqId, v] of Object.entries(data[run_id])) {
    if (!v) delete data[run_id][reqId];
  }

  save(data);
  res.json({ ok: true, count: Object.keys(data[run_id]).length });
});

module.exports = router;
