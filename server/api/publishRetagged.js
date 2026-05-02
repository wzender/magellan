const express = require('express');
const router  = express.Router();
const loader  = require('../loader');

/** POST /api/publish-retagged  body: { run_id }
 *  Creates (or replaces) a {run_name}_retagged table in Postgres. */
router.post('/publish-retagged', async (req, res) => {
  const run_id = parseInt(req.body.run_id, 10);
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });

  try {
    const table = await loader.publishRetagged(run_id);
    res.json({ ok: true, table });
  } catch (err) {
    console.error('[publish-retagged]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
