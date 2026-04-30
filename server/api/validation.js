/**
 * Validation API
 * Persists Unknowns retagging directly to the source run data (true_subtype column).
 */

const express = require('express');
const router = express.Router();
const dbLoader = require('../loader');

/**
 * GET /api/validation?run_id=10
 * Returns all true_subtype values for the given run as an object: { request_id: true_subtype }
 */
router.get('/validation', async (req, res) => {
  const { run_id } = req.query;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });

  try {
    const values = await dbLoader.getValidationValues(parseInt(run_id, 10));
    res.json(values || {});
  } catch (error) {
    console.error('Failed to load validation values:', error);
    res.status(500).json({ error: 'Failed to load validation values' });
  }
});

/**
 * PUT /api/validation
 * Set true_subtype value(s) for one or more records in a run.
 * Body: { run_id, verdicts: { request_id: true_subtype, ... } }
 */
router.put('/validation', async (req, res) => {
  const { run_id, verdicts } = req.body;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });
  if (!verdicts || typeof verdicts !== 'object') {
    return res.status(400).json({ error: 'verdicts object is required' });
  }

  try {
    const runId = parseInt(run_id, 10);
    const updates = Object.fromEntries(
      Object.entries(verdicts).map(([requestId, trueSubtype]) => [requestId, trueSubtype || ''])
    );
    const changed = await dbLoader.updateTrueSubtypes(runId, updates);
    res.json({ ok: true, updated: changed });
  } catch (error) {
    console.error('Failed to persist validation values:', error);
    res.status(500).json({ error: 'Failed to persist validation values' });
  }
});

module.exports = router;
