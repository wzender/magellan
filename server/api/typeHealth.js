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
 * GET /compare-type-health?run_id1=...&run_id2=...
 * Returns per-type 4-outcome breakdown for a run pair.
 */
router.get('/compare-type-health', async (req, res) => {
  try {
    const { run_id1, run_id2 } = req.query;
    if (!run_id1 || !run_id2) return res.status(400).json({ error: 'run_id1 and run_id2 are required' });
    const data = await dbLoader.getCompareTypeHealth(parseInt(run_id1), parseInt(run_id2));
    res.json(data);
  } catch (error) {
    console.error('Error fetching compare type health:', error);
    res.status(500).json({ error: 'Failed to fetch compare type health' });
  }
});

/**
 * GET /confidence-quality?run_id=...&bins=10
 * Returns confidence calibration KPIs for one run.
 */
router.get('/confidence-quality', async (req, res) => {
  try {
    const { run_id, bins } = req.query;
    if (!run_id) return res.status(400).json({ error: 'run_id is required' });
    const data = await dbLoader.getConfidenceQuality(parseInt(run_id), bins ? parseInt(bins) : 10);
    res.json(data);
  } catch (error) {
    console.error('Error fetching confidence quality:', error);
    res.status(500).json({ error: 'Failed to fetch confidence quality' });
  }
});

/**
 * GET /calibration-per-type?run_id=...&bins=10
 * Returns per-type calibration metrics (ECE, Brier, etc.) for one run.
 */
router.get('/calibration-per-type', async (req, res) => {
  try {
    const { run_id, bins } = req.query;
    if (!run_id) return res.status(400).json({ error: 'run_id is required' });
    const data = await dbLoader.getCalibrationPerType(parseInt(run_id), bins ? parseInt(bins) : 10);
    res.json(data);
  } catch (error) {
    console.error('Error fetching calibration per type:', error);
    res.status(500).json({ error: 'Failed to fetch calibration per type' });
  }
});

/**
 * GET /subtype-transition?run_id1=...&run_id2=...&true_type=...&compare_filter=...
 * Returns subtype transition matrix for a run pair scoped to one type.
 */
router.get('/subtype-transition', async (req, res) => {
  try {
    const { run_id1, run_id2, true_type, compare_filter } = req.query;
    if (!run_id1 || !run_id2 || !true_type) return res.status(400).json({ error: 'run_id1, run_id2 and true_type are required' });
    const data = await dbLoader.getSubtypeTransitionMatrix(parseInt(run_id1), parseInt(run_id2), true_type, compare_filter || null);
    res.json(data);
  } catch (error) {
    console.error('Error fetching subtype transition matrix:', error);
    res.status(500).json({ error: 'Failed to fetch subtype transition matrix' });
  }
});

/**
 * GET /subtype-confusion?run_id=...&true_type=...
 * Returns full subtype confusion matrix scoped to one type.
 */
router.get('/subtype-confusion', async (req, res) => {
  try {
    const { run_id, true_type, filter } = req.query;
    if (!run_id || !true_type) return res.status(400).json({ error: 'run_id and true_type are required' });
    const data = await dbLoader.getSubtypeConfusionMatrix(parseInt(run_id), true_type, filter || null);
    res.json(data);
  } catch (error) {
    console.error('Error fetching subtype confusion matrix:', error);
    res.status(500).json({ error: 'Failed to fetch subtype confusion matrix' });
  }
});

module.exports = router;
