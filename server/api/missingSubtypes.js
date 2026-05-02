const express = require('express');
const router = express.Router();
const dbLoader = require('../loader');

// GET /api/missing-subtypes?run_id=10
// Returns grouped candidates: [{ candidate, count, records, decision }]
router.get('/missing-subtypes', (req, res) => {
  const { run_id } = req.query;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });
  try {
    const groups = dbLoader.getMissingSubtypeGroups(parseInt(run_id, 10));
    res.json(groups);
  } catch (error) {
    console.error('Error fetching missing subtypes:', error);
    res.status(500).json({ error: 'Failed to fetch missing subtypes' });
  }
});

// PUT /api/missing-subtypes
// Body: { run_id, candidate, status, mapped_to? }
// status: 'accepted' | 'mapped' | 'rejected' | null (to clear)
router.put('/missing-subtypes', (req, res) => {
  const { run_id, candidate, status, mapped_to } = req.body;
  if (!run_id || !candidate) return res.status(400).json({ error: 'run_id and candidate are required' });
  try {
    dbLoader.updateMissingSubtypeDecision(parseInt(run_id, 10), candidate, status, mapped_to);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating missing subtype decision:', error);
    res.status(500).json({ error: 'Failed to update missing subtype decision' });
  }
});

module.exports = router;
