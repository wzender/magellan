/**
 * Ask-GPT API
 * Sends attributes + metadata to OpenAI; returns a yes/no verdict and reasoning.
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const OPENAI_MODEL      = process.env.OPENAI_MODEL      || 'gpt-4o-mini';
const OPENAI_API_URL    = process.env.OPENAI_API_URL    || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 200;
const TIMEOUT_MS        = 20000;

/**
 * POST /api/ask-gpt
 * Body: { attributes, metadata, suggested_subtype, suggested_type }
 * Returns: { verdict: "yes"|"no", reasoning: "..." }
 */
router.post('/ask-gpt', async (req, res) => {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-key-here') {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  const { attributes, metadata, suggested_subtype, suggested_type } = req.body;
  if (!attributes && !metadata) {
    return res.status(400).json({ error: 'attributes or metadata required' });
  }

  const prompt = `Based ONLY on the attributes and metadata below, is classifying this record as subtype "${suggested_subtype}" (type: "${suggested_type}") justified?

Attributes:
${JSON.stringify(attributes, null, 2)}

Metadata:
${JSON.stringify(metadata, null, 2)}

Respond with a JSON object only — no markdown, no extra text:
{"verdict": "yes" or "no", "reasoning": "1-2 sentence explanation"}`;

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
        max_tokens: OPENAI_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err}`);
    }

    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    console.log(`[ask-gpt] model=${data.model} tokens=${data.usage?.total_tokens}`);

    try {
      const parsed = JSON.parse(raw);
      res.json({ verdict: parsed.verdict || 'no', reasoning: parsed.reasoning || raw });
    } catch {
      const isYes = /\byes\b/i.test(raw);
      res.json({ verdict: isYes ? 'yes' : 'no', reasoning: raw });
    }
  } catch (err) {
    console.error('[ask-gpt] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
