/**
 * Ask-GPT API
 * Sends attributes + metadata to OpenAI and asks for a subtype classification opinion.
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL   = process.env.OPENAI_MODEL   || 'gpt-4o-mini';
const OPENAI_API_URL = process.env.OPENAI_API_URL  || 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS     = 20000;

/**
 * POST /api/ask-gpt
 * Body: { attributes, metadata, suggested_subtype, suggested_type }
 * Returns: { answer: "short text" }
 */
router.post('/ask-gpt', async (req, res) => {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-key-here') {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  const { attributes, metadata, suggested_subtype, suggested_type } = req.body;
  if (!attributes && !metadata) {
    return res.status(400).json({ error: 'attributes or metadata required' });
  }

  const prompt = `Based ONLY on the attributes and metadata below, what classification subtype would you assign to this record? Reply in 10 words or less.

Attributes:
${JSON.stringify(attributes, null, 2)}

Metadata:
${JSON.stringify(metadata, null, 2)}`;

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
        max_tokens: 60,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err}`);
    }

    const data = await response.json();
    const answer = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim() || '(no answer)';
    console.log(`[ask-gpt] model=${data.model} tokens=${data.usage && data.usage.total_tokens}`);
    res.json({ answer });
  } catch (err) {
    console.error('[ask-gpt] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
