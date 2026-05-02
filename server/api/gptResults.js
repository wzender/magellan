/**
 * GPT Results API
 * Persists GPT verdict + reasoning directly into the run's own storage.
 *
 * CSV mode      → gpt_verdict / gpt_reasoning columns written into the run CSV file
 * Postgres mode → gpt_verdict / gpt_reasoning columns in the per-run table (added if missing)
 */

require('dotenv').config();
const express = require('express');
const router  = express.Router();

const usePostgres = (process.env.DATA_SOURCE || 'postgres').toLowerCase() === 'postgres'
                 && !!process.env.DATABASE_URL;

const { query }                       = usePostgres ? require('../db') : {};
const { getRun, getIdColumn }         = usePostgres ? require('../db-loader') : {};
const { getGptResults, updateGptResults } = usePostgres ? {} : require('../csv-loader');

async function ensureGptColumns(tbl) {
  await query(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS gpt_verdict TEXT`);
  await query(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS gpt_reasoning TEXT`);
}

/** GET /api/gpt-results?run_id=X — returns { request_id: { verdict, reasoning } } */
router.get('/gpt-results', async (req, res) => {
  const run_id = parseInt(req.query.run_id, 10);
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });

  try {
    if (usePostgres) {
      const run = await getRun(run_id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      const tbl   = run.run_name;
      const idCol = await getIdColumn(tbl);
      await ensureGptColumns(tbl);
      const result = await query(
        `SELECT ${idCol} AS request_id, gpt_verdict, gpt_reasoning
         FROM "${tbl}"
         WHERE gpt_verdict IS NOT NULL AND gpt_verdict <> ''`
      );
      const out = {};
      result.rows.forEach(r => {
        out[r.request_id] = { verdict: r.gpt_verdict, reasoning: r.gpt_reasoning };
      });
      return res.json(out);
    } else {
      return res.json(getGptResults(run_id));
    }
  } catch (err) {
    console.error('[gpt-results GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/gpt-results — body: { run_id, results: { request_id: { verdict, reasoning } } } */
router.put('/gpt-results', async (req, res) => {
  const run_id  = parseInt(req.body.run_id, 10);
  const results = req.body.results;
  if (!run_id)  return res.status(400).json({ error: 'run_id is required' });
  if (!results || typeof results !== 'object') return res.status(400).json({ error: 'results object is required' });

  try {
    if (usePostgres) {
      const run = await getRun(run_id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      const tbl   = run.run_name;
      const idCol = await getIdColumn(tbl);
      await ensureGptColumns(tbl);
      for (const [request_id, { verdict, reasoning }] of Object.entries(results)) {
        await query(
          `UPDATE "${tbl}" SET gpt_verdict = $1, gpt_reasoning = $2 WHERE ${idCol} = $3`,
          [verdict, reasoning, request_id]
        );
      }
    } else {
      updateGptResults(run_id, results);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[gpt-results PUT]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
