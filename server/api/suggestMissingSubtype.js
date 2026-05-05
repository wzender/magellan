/**
 * Suggest Missing Subtype API
 * Given a record and the benchmark's known subtype vocabulary, asks OpenAI to
 * propose a new subtype label that is NOT already in the vocabulary.
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL   = process.env.OPENAI_MODEL   || 'gpt-oss';
const OPENAI_API_URL = process.env.OPENAI_API_URL  || 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS     = 20000;

/**
 * POST /api/suggest-missing-subtype
 * Body: { attributes, metadata, pred_type, pred_subtype, existing_subtypes: string[] }
 * Returns: { subtype: "SuggestedName" }
 */
router.post('/suggest-missing-subtype', async (req, res) => {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-key-here') {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  const { attributes, metadata, pred_type, pred_subtype, existing_subtypes } = req.body;
  if (!attributes && !metadata) {
    return res.status(400).json({ error: 'attributes or metadata required' });
  }

  const vocabList = (existing_subtypes || []).join(', ');

  const prompt = `You are a classification expert. A record has been classified by a model but its true label may not exist in the current subtype vocabulary.

Your task: suggest ONE new subtype category that naturally describes this record AND is NOT in the existing vocabulary.

Existing vocabulary (do NOT use any of these):
${vocabList}

Record attributes:
${JSON.stringify(attributes, null, 2)}

Record metadata:
${JSON.stringify(metadata, null, 2)}

Model predicted: ${pred_type} / ${pred_subtype}

Rules:
- 1–3 words, Title Case
- Must not match any existing vocabulary item
- Should be specific enough to be a meaningful category

Respond with JSON only, no markdown:
{"subtype": "Your Suggestion"}`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: 30,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err}`);
    }

    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    console.log(`[suggest-missing-subtype] model=${data.model} tokens=${data.usage?.total_tokens}`);

    try {
      const parsed = JSON.parse(raw);
      res.json({ subtype: String(parsed.subtype || '').trim() });
    } catch {
      const match = raw.match(/["']([^"'\n]+)["']/) || raw.match(/:\s*(.+)/);
      res.json({ subtype: (match ? match[1] : raw.split('\n')[0]).trim() });
    }
  } catch (err) {
    console.error('[suggest-missing-subtype] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
