/**
 * GPT Results API
 * Persists GPT verdict+reasoning for Unknowns benchmark records.
 * Storage: data/gpt-results.json  { "<run_id>": { "<request_id>": { verdict, reasoning } } }
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const GPT_RESULTS_FILE = path.join(__dirname, '../../data/gpt-results.json');

function load() {
  if (!fs.existsSync(GPT_RESULTS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(GPT_RESULTS_FILE, 'utf-8')); } catch { return {}; }
}

function save(data) {
  fs.writeFileSync(GPT_RESULTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/** GET /api/gpt-results?run_id=X — returns { request_id: { verdict, reasoning } } */
router.get('/gpt-results', (req, res) => {
  const { run_id } = req.query;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });
  const data = load();
  res.json(data[run_id] || {});
});

/** PUT /api/gpt-results — body: { run_id, results: { request_id: { verdict, reasoning } } } */
router.put('/gpt-results', (req, res) => {
  const { run_id, results } = req.body;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });
  if (!results || typeof results !== 'object') return res.status(400).json({ error: 'results object is required' });

  const data = load();
  if (!data[run_id]) data[run_id] = {};
  Object.assign(data[run_id], results);
  save(data);
  res.json({ ok: true });
});

module.exports = router;
