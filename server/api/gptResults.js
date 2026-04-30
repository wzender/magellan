/**
 * GPT Results API
 * Persists GPT verdict + reasoning for Unknowns benchmark records.
 *
 * Storage:
 *   CSV mode      → gpt_verdict / gpt_reasoning columns written directly into the run CSV file
 *   Postgres mode → gpt_results table  (run_id INTEGER, request_id TEXT) — no FK so it works
 *                   with both the seedDatabase schema and the db-loader per-run-table schema
 */

require('dotenv').config();
const express = require('express');
const router  = express.Router();

const usePostgres = (process.env.DATA_SOURCE || 'postgres').toLowerCase() === 'postgres'
                 && !!process.env.DATABASE_URL;

const { query }         = usePostgres ? require('../db') : {};
const { getGptResults, updateGptResults } = usePostgres ? {} : require('../csv-loader');

let postgresStoreReady = false;

async function ensurePostgresStore() {
  if (!usePostgres || postgresStoreReady) return;

  // Create table/constraint once so behavior matches CSV persistence (works out of the box).
  await query(`
    CREATE TABLE IF NOT EXISTS gpt_results (
      run_id INTEGER NOT NULL,
      request_id TEXT NOT NULL,
      verdict TEXT,
      reasoning TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (run_id, request_id)
    )
  `);

  postgresStoreReady = true;
}

/** GET /api/gpt-results?run_id=X — returns { request_id: { verdict, reasoning } } */
router.get('/gpt-results', async (req, res) => {
  const run_id = parseInt(req.query.run_id, 10);
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });

  try {
    if (usePostgres) {
      await ensurePostgresStore();
      const result = await query(
        'SELECT request_id, verdict, reasoning FROM gpt_results WHERE run_id = $1 AND COALESCE(verdict, \'\') <> \'\'',
        [run_id]
      );
      const out = {};
      result.rows.forEach(r => { out[r.request_id] = { verdict: r.verdict, reasoning: r.reasoning }; });
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
      await ensurePostgresStore();
      for (const [request_id, { verdict, reasoning }] of Object.entries(results)) {
        await query(
          `INSERT INTO gpt_results (run_id, request_id, verdict, reasoning, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (run_id, request_id) DO UPDATE
             SET verdict = EXCLUDED.verdict, reasoning = EXCLUDED.reasoning, updated_at = NOW()`,
          [run_id, request_id, verdict, reasoning]
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
