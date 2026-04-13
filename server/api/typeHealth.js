const express = require('express');
const router = express.Router();
const dbLoader = require('../loader');

/**
 * GET /type-health?run_id=...
 * Returns per-type accuracy health summary for a run.
 */
router.get('/type-health', async (req, res) => {
  try {
    const { run_id } = req.query;
    if (!run_id) return res.status(400).json({ error: 'run_id is required' });
    const data = await dbLoader.getTypeHealthSummary(parseInt(run_id));
    res.json(data);
  } catch (error) {
    console.error('Error fetching type health:', error);
    res.status(500).json({ error: 'Failed to fetch type health' });
  }
});

/**
 * GET /subtype-confusion?run_id=...&true_type=...
 * Returns full subtype confusion matrix scoped to one type.
 */
router.get('/subtype-confusion', async (req, res) => {
  try {
    const { run_id, true_type } = req.query;
    if (!run_id || !true_type) return res.status(400).json({ error: 'run_id and true_type are required' });
    const data = await dbLoader.getSubtypeConfusionMatrix(parseInt(run_id), true_type);
    res.json(data);
  } catch (error) {
    console.error('Error fetching subtype confusion matrix:', error);
    res.status(500).json({ error: 'Failed to fetch subtype confusion matrix' });
  }
});

module.exports = router;
