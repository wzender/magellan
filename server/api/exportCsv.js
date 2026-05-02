const express = require('express');
const router  = express.Router();
const loader  = require('../loader');

/** GET /api/export-csv?run_id=X  — streams the full run as a CSV download */
router.get('/export-csv', async (req, res) => {
  const run_id = parseInt(req.query.run_id, 10);
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });

  try {
    const { rows, filename } = await loader.exportRunCsv(run_id);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'No data for this run' });

    const headers = Object.keys(rows[0]);
    const escape  = (v) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
    ].join('\n') + '\n';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[export-csv]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
