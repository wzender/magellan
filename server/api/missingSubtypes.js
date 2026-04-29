const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../../data/missing-subtypes.json');

function load() {
  if (!fs.existsSync(FILE)) return {};
  try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); } catch { return {}; }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// GET /api/missing-subtypes?run_id=10
router.get('/missing-subtypes', (req, res) => {
  const { run_id } = req.query;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });
  res.json(load()[run_id] || {});
});

// PUT /api/missing-subtypes
// Body: { run_id, subtypes: { request_id: subtype_text, ... } }
router.put('/missing-subtypes', (req, res) => {
  const { run_id, subtypes } = req.body;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });
  if (!subtypes || typeof subtypes !== 'object') {
    return res.status(400).json({ error: 'subtypes object is required' });
  }
  const data = load();
  if (!data[run_id]) data[run_id] = {};
  Object.assign(data[run_id], subtypes);
  for (const [id, v] of Object.entries(data[run_id])) {
    if (!v) delete data[run_id][id];
  }
  save(data);
  res.json({ ok: true });
});

module.exports = router;
