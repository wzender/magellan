/**
 * Translation API
 *
 * POST /api/translate
 *   Body: { records: [{ request_id, attributes }] }
 *   Response: Server-Sent Events stream
 *     data: { done, total, request_id, attrsEn }   — progress per record
 *     data: { done, total, finished: true }         — final event
 *
 * Translates each record's attributes JSON string values from the
 * original language to English using Claude.  Results are persisted to
 * data/translations.json and merged into the in-memory cache immediately,
 * so subsequent /api/records calls return the translated en_attributes.
 */

const router = require('express').Router();
const fetch  = require('node-fetch');
const fs = require('fs');
const path = require('path');

const loader = process.env.DATA_SOURCE === 'postgres'
  ? require('../db-loader')
  : require('../csv-loader');
const { updateTranslation, updateMetadataTranslation } = loader;

const OPENAI_API_KEY   = process.env.OPENAI_API_KEY;
const OPENAI_MODEL     = process.env.OPENAI_MODEL     || 'gpt-4o-mini';
const OPENAI_API_URL   = process.env.OPENAI_API_URL   || 'https://api.openai.com/v1/chat/completions';
const TRANSLATE_GPT_MODEL = process.env.TRANSLATE_GPT_MODEL || OPENAI_MODEL;
const TRANSLATE_GPT_URL = process.env.TRANSLATE_GPT_URL || OPENAI_API_URL;
const TRANSLATE_DESTINATION_LANGUAGE = process.env.TRANSLATE_DESTINATION_LANGUAGE || 'English';
const VALUE_TRANSLATION_CACHE_FILE = path.join(__dirname, '../../data/value-translation-cache.json');
if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-key-here') {
  console.warn('⚠ OPENAI_API_KEY is not set — /api/translate will fail');
}

let valueTranslationCache = null;
const inFlightValueTranslations = new Map();

function loadValueTranslationCache() {
  if (valueTranslationCache) return valueTranslationCache;
  if (!fs.existsSync(VALUE_TRANSLATION_CACHE_FILE)) {
    valueTranslationCache = {};
    return valueTranslationCache;
  }
  try {
    valueTranslationCache = JSON.parse(fs.readFileSync(VALUE_TRANSLATION_CACHE_FILE, 'utf-8'));
  } catch {
    valueTranslationCache = {};
  }
  return valueTranslationCache;
}

function saveValueTranslationCache(cache) {
  fs.writeFileSync(VALUE_TRANSLATION_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

function translationCacheKey(text) {
  return `${String(TRANSLATE_DESTINATION_LANGUAGE).toLowerCase()}::${text}`;
}

function isUuidLike(text) {
  return /^(?:\{)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}(?:\})?$/i.test(text)
    || /^urn:uuid:[0-9a-f-]{36}$/i.test(text);
}

function isUrlLike(text) {
  return /^(?:https?:\/\/|www\.)\S+$/i.test(text);
}

function isLongNumericId(text) {
  return /^\d{7,}$/.test(text);
}

function isOpaqueMixedId(text) {
  if (text.length < 7) return false;
  if (/\s/.test(text)) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return false;
  return /[A-Za-z]/.test(text) && /\d/.test(text);
}

function isHexLikeId(text) {
  return /^[0-9a-f]{8,}$/i.test(text);
}

function shouldIgnoreForTranslation(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (text.toLowerCase() === 'none') return true;
  return isUuidLike(text)
    || isUrlLike(text)
    || isLongNumericId(text)
    || isOpaqueMixedId(text)
    || isHexLikeId(text);
}

/**
 * Translate string values in an object to English using OpenAI chat
 * completions, preserving keys and JSON structure exactly as-is.
 */
const CONCURRENCY = parseInt(process.env.OPENAI_CONCURRENCY) || 10;
const TIMEOUT_MS  = 20000; // 20 s per request

function parseExistingTranslation(value) {
  if (value === null || value === undefined) return { parsed: null, valid: false };
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return { parsed: null, valid: false };
    try {
      return { parsed: JSON.parse(trimmed), valid: true };
    } catch {
      return { parsed: null, valid: false };
    }
  }
  return { parsed: value, valid: true };
}

function hasMeaningfulJson(value) {
  const { parsed, valid } = parseExistingTranslation(value);
  if (!valid) return false;

  value = parsed;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function hasExistingTranslationForInput(existing, input) {
  const parsedInput = parseJsonIfPossible(input);
  const sourceIsJson = parsedInput.parsed || (input !== null && typeof input === 'object');

  if (sourceIsJson) {
    // Strict validation: invalid translated JSON must be retranslated.
    return hasMeaningfulJson(existing);
  }

  return String(existing || '').trim() !== '';
}

function parseJsonIfPossible(value) {
  if (typeof value !== 'string') return { parsed: false, value };
  const trimmed = value.trim();
  if (!trimmed) return { parsed: false, value };
  try {
    return { parsed: true, value: JSON.parse(trimmed) };
  } catch {
    return { parsed: false, value };
  }
}

async function translateStringValue(text) {
  const source = String(text || '');
  if (!source.trim()) return source;
  if (shouldIgnoreForTranslation(source)) return source;

  const cache = loadValueTranslationCache();
  const key = translationCacheKey(source);
  if (Object.prototype.hasOwnProperty.call(cache, key)) {
    return cache[key];
  }
  if (inFlightValueTranslations.has(key)) {
    return inFlightValueTranslations.get(key);
  }

  const promise = (async () => {
    const translated = await translatePlainText(source);
    cache[key] = translated;
    saveValueTranslationCache(cache);
    return translated;
  })().finally(() => {
    inFlightValueTranslations.delete(key);
  });

  inFlightValueTranslations.set(key, promise);
  return promise;
}

async function translateJsonValuePerLeaf(value) {
  if (typeof value === 'string') {
    return translateStringValue(value);
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(item => translateJsonValuePerLeaf(item)));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = await Promise.all(
    Object.entries(value).map(async ([key, child]) => [key, await translateJsonValuePerLeaf(child)])
  );
  return Object.fromEntries(entries);
}

async function translatePlainText(text) {
  const prompt = `Translate the following text to ${TRANSLATE_DESTINATION_LANGUAGE}.
Return ONLY the translated text, with no markdown, no quotes, and no explanation.

${String(text)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(TRANSLATE_GPT_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: TRANSLATE_GPT_MODEL,
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
  console.log(`[translate] id=${id} model=${model} dst=${TRANSLATE_DESTINATION_LANGUAGE} mode=text prompt=${usage?.prompt_tokens} completion=${usage?.completion_tokens} total=${usage?.total_tokens} finish=${choices?.[0]?.finish_reason}`);

  return String(choices?.[0]?.message?.content || '').trim();
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
      const existing = field === 'metadata' ? record.en_metadata : record.en_attributes;

      if (hasExistingTranslationForInput(existing, input)) {
        return { request_id, skipped: true, reason: 'already_translated' };
      }

      if (!input || (typeof input === 'object' && Object.keys(input).length === 0)) {
        return { request_id, skipped: true, reason: 'empty_source' };
      }

      let translated;
      const parsedInput = parseJsonIfPossible(input);
      if (parsedInput.parsed) {
        translated = await translateJsonValuePerLeaf(parsedInput.value);
      } else if (typeof input === 'string') {
        translated = await translateStringValue(input);
      } else {
        translated = await translateJsonValuePerLeaf(input);
      }

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
