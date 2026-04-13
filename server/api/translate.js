/**
 * Translation API
 *
 * POST /api/translate
 *   Body: { records: [{ request_id, attributes }] }
 *   Response: Server-Sent Events stream
 *     data: { done, total, request_id, attrsEn }   — progress per record
 *     data: { done, total, finished: true }         — final event
 *
 * Translates each record's attributes JSON (keys + string values) from the
 * original language to English using Claude.  Results are persisted to
 * data/translations.json and merged into the in-memory cache immediately,
 * so subsequent /api/records calls return the translated en_attributes.
 */

const router = require('express').Router();
const fetch  = require('node-fetch');

const loader = process.env.DATA_SOURCE === 'postgres'
  ? require('../db-loader')
  : require('../csv-loader');
const { updateTranslation, updateMetadataTranslation } = loader;

const OPENAI_API_KEY   = process.env.OPENAI_API_KEY;
const OPENAI_MODEL     = process.env.OPENAI_MODEL     || 'gpt-4o-mini';
const OPENAI_API_URL   = process.env.OPENAI_API_URL   || 'https://api.openai.com/v1/chat/completions';
if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-key-here') {
  console.warn('⚠ OPENAI_API_KEY is not set — /api/translate will fail');
}

/**
 * Translate all non-English string keys and values in an attributes object
 * to English using OpenAI chat completions, preserving the JSON structure.
 */
const CONCURRENCY = parseInt(process.env.OPENAI_CONCURRENCY) || 10;
const TIMEOUT_MS  = 20000; // 20 s per request

async function translateAttributes(attrs) {
  const prompt = `Translate this JSON object to English.
Translate every non-English string — both keys and string values — to English.
Keep numbers, booleans, arrays, and nested object structure exactly as-is.
Return ONLY the translated JSON object, no explanation, no markdown fences.

${JSON.stringify(attrs, null, 2)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
  }

  const data = await response.json();
  const { usage, model, id, choices } = data;
  console.log(`[translate] id=${id} model=${model} prompt=${usage?.prompt_tokens} completion=${usage?.completion_tokens} total=${usage?.total_tokens} finish=${choices?.[0]?.finish_reason}`);

  const text = choices[0].message.content.trim();
  const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(jsonText);
}

/** Run tasks with a bounded concurrency pool, calling onDone after each. */
async function withConcurrency(items, concurrency, task, onDone) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      const result = await task(items[i], i);
      onDone(i, result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

router.post('/translate', async (req, res) => {
  const { records, field = 'attributes' } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records array is required' });
  }
  if (field !== 'attributes' && field !== 'metadata') {
    return res.status(400).json({ error: 'field must be "attributes" or "metadata"' });
  }

  // Disable compression for this SSE response so chunks aren't buffered.
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    // Flush the chunk immediately through any compression middleware.
    if (typeof res.flush === 'function') res.flush();
  };

  const total = records.length;
  let done = 0;

  await withConcurrency(records, CONCURRENCY, async (record) => {
    const { request_id } = record;
    try {
      const input = field === 'metadata' ? record.metadata : record.attributes;
      const translated = await translateAttributes(input);
      if (field === 'metadata') {
        updateMetadataTranslation(request_id, translated);
      } else {
        updateTranslation(request_id, translated);
      }
      return { request_id, attrsEn: translated };
    } catch (err) {
      console.error(`Translation failed for ${request_id}:`, err.message);
      return { request_id, error: err.message };
    }
  }, (_, result) => {
    done++;
    send({ done, total, ...result });
  });

  send({ done: total, total, finished: true });
  res.end();
});

module.exports = router;
