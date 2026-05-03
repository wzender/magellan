const express = require('express');
const router = express.Router();
const dbLoader = require('../loader');

// GET /api/missing-subtypes?run_id=10
// Returns grouped candidates: [{ candidate, count, records: [{ ...record, decision }] }]
router.get('/missing-subtypes', async (req, res) => {
  const { run_id } = req.query;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });
  try {
    const groups = await dbLoader.getMissingSubtypeGroups(parseInt(run_id, 10));
    res.json(groups);
  } catch (error) {
    console.error('Error fetching missing subtypes:', error);
    res.status(500).json({ error: 'Failed to fetch missing subtypes' });
  }
});

// PUT /api/missing-subtypes
// Body: { run_id, request_id, true_subtype }
// true_subtype: any allowed subtype string, 'Missing', or null (to clear)
router.put('/missing-subtypes', async (req, res) => {
  const { run_id, request_id, true_subtype } = req.body;
  if (!run_id || !request_id) return res.status(400).json({ error: 'run_id and request_id are required' });
  try {
    await dbLoader.updateMissingSubtypeDecision(parseInt(run_id, 10), request_id, true_subtype);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating missing subtype decision:', error);
    res.status(500).json({ error: 'Failed to update missing subtype decision' });
  }
});

module.exports = router;
