/**
 * Ask-GPT API
 * Sends attributes + metadata to OpenAI; returns a yes/no verdict and reasoning.
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const OPENAI_MODEL      = process.env.OPENAI_MODEL      || 'gpt-oss';
const OPENAI_JUDGE_MODEL = process.env.OPENAI_JUDGE_MODEL || OPENAI_MODEL;
const OPENAI_JUDGE_MAX_TOKENS = parseInt(process.env.OPENAI_JUDGE_MAX_TOKENS, 10) || 220;
const OPENAI_API_URL    = process.env.OPENAI_API_URL    || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 200;
const TIMEOUT_MS        = 20000;
const ASK_GPT_USE_JSON_MODE = String(process.env.ASK_GPT_USE_JSON_MODE || 'true').toLowerCase() === 'true';
const ASK_GPT_PROMPT    = (process.env.ASK_GPT_PROMPT || '').trim();
const ASK_GPT_DOMAIN_NAME = process.env.ASK_GPT_DOMAIN_NAME || 'e-commerce product support';

const PS2_UNKNOWN = (process.env.PRED_SUBTYPE2_UNKNOWN || 'unknown').toLowerCase();
const PS2_MISSING = (process.env.PRED_SUBTYPE2_MISSING || 'missing').toLowerCase();
const ASK_GPT_DOMAIN_INSTRUCTIONS = (process.env.ASK_GPT_DOMAIN_INSTRUCTIONS || `You are classifying customer-submitted records related to e-commerce operations.
Each record describes a product or interaction using structured attributes (SKU, name, brand, tags, material, price, etc.) and operational metadata (region, source, status, department, data quality).

Key guidance:
- Focus on the semantic meaning of the record's description, tags, and department rather than surface-level string matching.
- Metadata fields like "department" and "source" are strong signals for the category domain.
- Tags and description together indicate the product domain; cross-reference with the subtype list when provided.
- Low data quality or sparse attributes increase uncertainty; reflect this in your confidence.`).trim();

const STAGE1_SYSTEM = `You are a classification assistant specialized in {domain_name}.

## Domain Instructions
{domain_instructions}

## Task
Given a record's attributes and metadata, determine the most appropriate subtype category.
Respond with exactly two lines and nothing else:
1. SUBTYPE: <your candidate label>
2. REASON: <one sentence, max 50 tokens>

If the input provides no clear signal, respond:
SUBTYPE: unknown
REASON: Insufficient signal to classify.

Do not output any text before SUBTYPE: or after the REASON: line. No markdown formatting, no preamble, no explanation.`;

const STAGE1_USER = `## Record to Classify

Attributes:
{attributes}

Metadata:
{metadata}`;

function formatTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

function parseStage1(rawText) {
  const subtypeMatch = /^SUBTYPE:\s*(.+)$/m.exec(rawText || '');
  const reasonMatch = /^REASON:\s*(.+)$/m.exec(rawText || '');
  return {
    subtype: subtypeMatch ? subtypeMatch[1].trim() : 'unknown',
    reason: reasonMatch ? reasonMatch[1].trim() : '',
  };
}

const VALID_JUDGE_DECISIONS = new Set([
  'truly_unknown',
  'true_missing_subtype',
  'missing_but_mappable',
  'wrong_subtype',
]);

const VALID_RESPONSE_KINDS = new Set(['existing', 'missing', 'unknown', 'error']);

function normalizeJudgeDecision(value, predictedStatus = '') {
  const status = String(predictedStatus || '').trim().toLowerCase();
  const raw = String(value || '').trim().toLowerCase();

  if (VALID_JUDGE_DECISIONS.has(raw)) return raw;

  // Backward-compat mapping for legacy yes/no rows.
  if (raw === 'yes') {
    if (status === PS2_UNKNOWN) return 'wrong_subtype';
    if (status === PS2_MISSING) return 'true_missing_subtype';
    return 'wrong_subtype';
  }
  if (raw === 'no') {
    if (status === PS2_UNKNOWN) return 'truly_unknown';
    if (status === PS2_MISSING) return 'missing_but_mappable';
    return 'wrong_subtype';
  }

  if (/unknown/.test(raw) && !/missing/.test(raw)) return 'truly_unknown';
  if (/missing/.test(raw) && /(true|real|new|taxonomy)/.test(raw)) return 'true_missing_subtype';
  if (/mapp|closest|semantic|near|similar/.test(raw)) return 'missing_but_mappable';
  if (/wrong|incorrect|different|other/.test(raw)) return 'wrong_subtype';

  // Safe fallback: if it was flagged unknown/missing by stage2, preserve conservative semantics.
  if (status === PS2_UNKNOWN) return 'truly_unknown';
  if (status === PS2_MISSING) return 'missing_but_mappable';
  return 'wrong_subtype';
}

function normalizeResponseKind(value, predictedStatus = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (VALID_RESPONSE_KINDS.has(raw)) return raw;

  const legacyDecision = normalizeJudgeDecision(value, predictedStatus);
  if (legacyDecision === 'truly_unknown') return 'unknown';
  if (legacyDecision === 'true_missing_subtype') return 'missing';
  if (legacyDecision === 'missing_but_mappable' || legacyDecision === 'wrong_subtype') return 'existing';
  return 'error';
}

function parseHttpStatusCode(message) {
  const match = /OpenAI\s+(\d{3})/.exec(String(message || ''));
  return match ? match[1] : '';
}

function buildJudgeErrorResponse(code, rawResponse = '', errorMessage = '') {
  const suffix = String(code || 'UNKNOWN').trim().toUpperCase();
  return {
    suggested_subtype: `ERROR_${suffix}`,
    reasoning: null,
    response_kind: 'error',
    raw_response: rawResponse,
    error: errorMessage || `ERROR_${suffix}`,
  };
}

function buildJudgeOutcome(parsed, raw, allowedSubtypes, predictedStatus) {
  const responseKind = normalizeResponseKind(
    parsed.response_kind || parsed.kind || parsed.decision || parsed.verdict || '',
    predictedStatus,
  );
  const allowedList = (Array.isArray(allowedSubtypes) ? allowedSubtypes : []).map(s => String(s).trim().toLowerCase());
  const allowedSet = new Set(allowedList);
  const reasoning = String(parsed.reasoning || parsed.reason || '').trim() || null;

  const suggestedSubtypeOriginal = pickFirstNonEmpty([
    parsed.suggested_subtype,
    parsed.mapped_allowed_subtype,
    parsed.corrected_subtype,
  ]);
  const normalizedAllowedSuggestion = suggestedSubtypeOriginal.toLowerCase();

  const missingSuggestion = pickFirstNonEmpty([
    parsed.suggested_subtype,
    parsed.suggested_missing_subtype,
    parsed.suggested_label,
    parsed.suggetsed_missing_subtype,
    parsed.sugested_missing_subtype,
  ]);

  if (responseKind === 'unknown') {
    return {
      suggested_subtype: 'unknown',
      reasoning,
      response_kind: 'unknown',
      raw_response: raw,
    };
  }

  if (responseKind === 'existing') {
    if (!normalizedAllowedSuggestion) {
      return buildJudgeErrorResponse('PARSE', raw, 'Existing response_kind without suggested_subtype');
    }
    if (allowedSubtypes.length > 0 && !allowedSet.has(normalizedAllowedSuggestion)) {
      return buildJudgeErrorResponse('PARSE', raw, 'Existing response_kind with suggested_subtype not in allowed list');
    }
    return {
      suggested_subtype: suggestedSubtypeOriginal,
      reasoning,
      response_kind: 'existing',
      raw_response: raw,
    };
  }

  if (responseKind === 'missing') {
    const suggestedSubtype = String(missingSuggestion || '').trim();
    if (!suggestedSubtype || suggestedSubtype.toLowerCase() === 'unknown' || suggestedSubtype.toLowerCase() === 'missing') {
      // Graceful downgrade: model chose "missing" but did not provide a concrete label.
      // Treat this as unknown instead of a hard parse error.
      return {
        suggested_subtype: 'unknown',
        reasoning,
        response_kind: 'unknown',
        raw_response: raw,
      };
    }
    if (allowedSet.has(suggestedSubtype.toLowerCase())) {
      return {
        suggested_subtype: suggestedSubtype.toLowerCase(),
        reasoning,
        response_kind: 'existing',
        raw_response: raw,
      };
    }
    return {
      suggested_subtype: suggestedSubtype,
      reasoning,
      response_kind: 'missing',
      raw_response: raw,
    };
  }

  return buildJudgeErrorResponse('PARSE', raw, 'Unsupported response_kind');
}

function parseJsonObject(raw) {
  const strict = tryParseJsonStrict(raw);
  if (strict && typeof strict === 'object' && !Array.isArray(strict)) return strict;

  const stripped = stripMarkdownCodeFences(raw);
  const strippedParsed = tryParseJsonStrict(stripped);
  if (strippedParsed && typeof strippedParsed === 'object' && !Array.isArray(strippedParsed)) return strippedParsed;

  const extracted = extractFirstJsonObject(stripped);
  if (extracted) {
    const extractedParsed = tryParseJsonStrict(extracted);
    if (extractedParsed && typeof extractedParsed === 'object' && !Array.isArray(extractedParsed)) return extractedParsed;
  }

  const repaired = basicJsonRepair(extracted || stripped);
  const repairedParsed = tryParseJsonStrict(repaired);
  if (repairedParsed && typeof repairedParsed === 'object' && !Array.isArray(repairedParsed)) return repairedParsed;

  return null;
}

function tryParseJsonStrict(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stripMarkdownCodeFences(raw) {
  const text = String(raw || '').trim();
  if (!text.startsWith('```')) return text;
  return text
    .replace(/^```[a-zA-Z0-9_-]*\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim();
}

function extractFirstJsonObject(raw) {
  const text = String(raw || '');
  const start = text.indexOf('{');
  if (start < 0) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return '';
}

function basicJsonRepair(raw) {
  const text = String(raw || '').trim();
  if (!text) return text;

  // Lightweight cleanup for common LLM issues.
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function clipText(value, max = 1200) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...(truncated ${text.length - max} chars)`;
}

function pickFirstNonEmpty(values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function summarizeJsonLike(value) {
  if (value === null || value === undefined) return { type: 'nullish' };
  if (typeof value === 'string') return { type: 'string', length: value.length };
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (typeof value === 'object') return { type: 'object', keys: Object.keys(value).length };
  return { type: typeof value };
}

const LOG = {
  info:  (tid, ...args) => console.info( `[INFO][ask-gpt][${tid}]`, ...args),
  warn:  (tid, ...args) => console.warn( `[WARN][ask-gpt][${tid}]`, ...args),
  error: (tid, ...args) => console.error(`[ERROR][ask-gpt][${tid}]`, ...args),
  debug: (tid, ...args) => console.debug(`[DEBUG][ask-gpt][${tid}]`, ...args),
};

function logMalformedJson(mode, raw, errMessage = '', traceId = '-') {
  const preview = String(raw || '').slice(0, 1200);
  const suffix = String(raw || '').length > 1200 ? '...(truncated)' : '';
  LOG.warn(traceId, `malformed JSON mode=${mode}${errMessage ? ` error=${errMessage}` : ''} raw=${preview}${suffix}`);
}

async function callChat(messages, maxTokens = OPENAI_MAX_TOKENS, model = OPENAI_MODEL, trace = {}) {
  const traceId = trace.traceId || '-';
  const mode = trace.mode || 'unknown';
  const preferJson = Boolean(trace.preferJson && ASK_GPT_USE_JSON_MODE);
  LOG.info(traceId, `── CALL START mode=${mode} model=${model} max_tokens=${maxTokens} messages=${messages.length}`);

  const makeBody = (withJsonMode) => {
    const body = {
      model,
      max_tokens: maxTokens,
      temperature: 0,
      messages,
    };
    if (withJsonMode) {
      body.response_format = { type: 'json_object' };
    }
    return body;
  };

  let response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    timeout: TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(makeBody(preferJson)),
  });

  if (!response.ok && preferJson) {
    const errPreview = await response.text();
    const jsonModeLikelyUnsupported =
      response.status === 400 && /(response_format|json_object|unsupported|invalid)/i.test(errPreview);
    if (jsonModeLikelyUnsupported) {
      LOG.warn(traceId, `── JSON MODE RETRY mode=${mode} reason=${clipText(errPreview, 300)}`);
      response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(makeBody(false)),
      });
    } else {
      LOG.error(traceId, `── CALL FAILED mode=${mode} status=${response.status} body=${clipText(errPreview, 2000)}`);
      throw new Error(`OpenAI ${response.status}: ${errPreview}`);
    }
  }

  if (!response.ok) {
    const err = await response.text();
    LOG.error(traceId, `── CALL FAILED mode=${mode} status=${response.status} body=${clipText(err, 2000)}`);
    throw new Error(`OpenAI ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = (data.choices?.[0]?.message?.content || '').trim();
  LOG.info(traceId,
    `── CALL OK mode=${mode} response_model=${data.model || ''} total_tokens=${data.usage?.total_tokens || 0} raw_chars=${raw.length}`
  );
  LOG.debug(traceId, `raw response preview: ${clipText(raw)}`);
  return { data, raw };
}

/**
 * POST /api/ask-gpt
 * Body: { attributes, metadata, suggested_subtype?, suggested_type? }
 * Returns:
 * - judge mode: { suggested_subtype, reasoning, response_kind }
 * - verdict mode (legacy): { verdict: "yes"|"no", reasoning: "..." }
 * - classify mode (Record Details): { subtype: "...", reason: "...", text: "..." }
 */
router.post('/ask-gpt', async (req, res) => {
  const traceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-key-here') {
    LOG.error('-', 'OPENAI_API_KEY is not configured');
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  const {
    attributes,
    metadata,
    suggested_subtype,
    suggested_type,
    judge_mode,
    predicted_status,
    candidate_subtype,
    stage2_subtype,
    pred_type,
    pred_subtype,
    missing_subtype,
    allowed_subtypes,
  } = req.body;

  LOG.info(traceId,
    `── REQUEST mode=${judge_mode ? 'judge' : (suggested_subtype ? 'verdict' : (ASK_GPT_PROMPT ? 'env-prompt' : 'stage1'))}` +
    ` predicted_status=${String(predicted_status || '').trim().toLowerCase()}` +
    ` stage2_subtype=${String(stage2_subtype || '').trim().toLowerCase()}` +
    ` allowed_subtypes=${Array.isArray(allowed_subtypes) ? allowed_subtypes.length : 0}` +
    ` attributes=${JSON.stringify(summarizeJsonLike(attributes))} metadata=${JSON.stringify(summarizeJsonLike(metadata))}`
  );

  if (!attributes && !metadata) {
    LOG.warn(traceId, 'rejected: attributes or metadata required');
    return res.status(400).json({ error: 'attributes or metadata required' });
  }

  try {
    if (judge_mode) {
      const allowedList = Array.isArray(allowed_subtypes) && allowed_subtypes.length > 0
        ? [...new Set(allowed_subtypes)].map(s => `- ${s}`).join('\n')
        : '- N/A';

      const systemPrompt = `You are an expert audit judge for a subtype classifier.

  You must classify each record into exactly one response_kind:
  1) existing
    Use when the record can be classified as one of the allowed subtypes.
    The suggested_subtype must be copied verbatim from the allowed list.
  2) missing
    Use when the record has enough signal to classify, but the best subtype is not in the allowed list.
    The suggested_subtype must be a short English label describing the concrete classification.
  3) unknown
    Use ONLY when the record is truly empty, contains only identifiers, or has absolutely no descriptive content.
    If there is ANY descriptive signal (tags, description, category, brand, etc.), you MUST classify as existing or missing — never unknown.
    Placeholder/test-like content with no domain meaning (e.g., generic words like "test", "sample", "example", "item", or synthetic labels) should be treated as unknown.
    suggested_subtype must be exactly "unknown".

Output JSON only with this schema:
{"suggested_subtype":"<concrete subtype label or unknown>","reasoning":"1-2 concise sentences","response_kind":"existing|missing|unknown"}

Rules:
- Never output markdown.
- The attributes and metadata may be in any language — ignore their language and respond entirely in English.
- If response_kind is existing, suggested_subtype must be copied verbatim from the allowed subtype list.
- If response_kind is missing, suggested_subtype must be a concrete descriptive classification label (e.g. "handcrafted instrument", "electric guitar") that is NOT in the allowed subtype list. It must NEVER be the word "missing", "none", or any enum/placeholder.
- If response_kind is unknown, suggested_subtype must be exactly "unknown".
- If the best natural subtype label is not literally present in the allowed subtype list, use response_kind=missing and return that natural subtype label.
- Do not replace a missing subtype with the closest allowed subtype just because it is semantically similar.
- unknown is ONLY for records with no descriptive content at all (empty, identifier-only). If a record has tags, a description, a category, or any textual signal, it must be existing or missing.
- If uncertain between existing and missing, prefer missing with your best-guess label.`;

      const userPrompt = `Allowed subtypes for this country:
${allowedList}

Attributes:
${JSON.stringify(attributes, null, 2)}

Metadata:
${JSON.stringify(metadata, null, 2)}`;

      LOG.info(traceId, `── JUDGE PROMPT system_chars=${systemPrompt.length} user_chars=${userPrompt.length}`);
      LOG.debug(traceId, `judge user prompt preview: ${clipText(userPrompt, 1600)}`);
      const { data, raw } = await callChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], OPENAI_JUDGE_MAX_TOKENS, OPENAI_JUDGE_MODEL, { traceId, mode: 'judge', preferJson: true });

      const parsedOrNull = parseJsonObject(raw);
      if (!parsedOrNull || typeof parsedOrNull !== 'object') {
        logMalformedJson('judge', raw, '', traceId);
        LOG.warn(traceId, 'judge JSON malformed — returning structured parse error');
        return res.json(buildJudgeErrorResponse('PARSE', raw, 'Malformed JSON response from GPT judge'));
      }

      const parsed = parsedOrNull || {};
      const outcome = buildJudgeOutcome(parsed, raw, allowed_subtypes, predicted_status || stage2_subtype);

      LOG.info(traceId,
        `── JUDGE RESULT response_kind=${outcome.response_kind}` +
        ` | suggested_subtype="${outcome.suggested_subtype || '(empty)'}"` +
        ` | GPT RAW RESPONSE chars=${raw.length} reasoning_chars=${String(outcome.reasoning || '').length}` +
        ` | model=${data.model} tokens=${data.usage?.total_tokens}`
      );
      LOG.info(traceId, '── RESPONSE SENT');

      return res.json(outcome);
    }

    // Existing Unknowns workflow: yes/no verdict for suggested subtype.
    if (suggested_subtype) {
      const prompt = `Based ONLY on the attributes and metadata below, is classifying this record as subtype "${suggested_subtype}" (type: "${suggested_type}") justified?

Attributes:
${JSON.stringify(attributes, null, 2)}

Metadata:
${JSON.stringify(metadata, null, 2)}

Respond with a JSON object only — no markdown, no extra text:
{"verdict": "yes" or "no", "reasoning": "1-2 sentence explanation"}`;

      LOG.info(traceId, `── VERDICT PROMPT chars=${prompt.length}`);
      const { data, raw } = await callChat([{ role: 'user', content: prompt }], OPENAI_MAX_TOKENS, OPENAI_MODEL, { traceId, mode: 'verdict', preferJson: true });
      LOG.info(traceId, `── VERDICT model=${data.model} tokens=${data.usage?.total_tokens}`);

      try {
        const parsed = parseJsonObject(raw);
        if (!parsed) throw new Error('malformed verdict JSON');
        LOG.info(traceId, `── VERDICT PARSED verdict=${parsed.verdict || '(missing)'} reasoning_chars=${String(parsed.reasoning || '').length}`);
        return res.json({ verdict: parsed.verdict || 'no', reasoning: parsed.reasoning || raw, raw_response: raw });
      } catch (err) {
        logMalformedJson('verdict', raw, err?.message || 'parse error', traceId);
        const isYes = /\byes\b/i.test(raw);
        LOG.warn(traceId, `verdict fallback applied isYes=${isYes}`);
        return res.json({ verdict: isYes ? 'yes' : 'no', reasoning: raw, raw_response: raw });
      }
    }

    // Record Details workflow:
    // 1) If ASK_GPT_PROMPT exists in .env, send that prompt directly.
    // 2) Else fallback to PRD Stage-1 classification call (system + user).
    if (ASK_GPT_PROMPT) {
      const rendered = formatTemplate(ASK_GPT_PROMPT, {
        attributes: JSON.stringify(attributes ?? {}, null, 2),
        metadata: JSON.stringify(metadata ?? {}, null, 2),
        suggested_subtype: suggested_subtype || '',
        suggested_type: suggested_type || '',
      });
      LOG.info(traceId, `── ENV-PROMPT chars=${rendered.length}`);
      const { data, raw } = await callChat([{ role: 'user', content: rendered }], 250, OPENAI_MODEL, { traceId, mode: 'env-prompt' });
      LOG.info(traceId, `── ENV-PROMPT RESULT model=${data.model} tokens=${data.usage?.total_tokens}`);
      return res.json({ text: raw, subtype: null, reason: null, raw_response: raw });
    }

    const stage1System = formatTemplate(STAGE1_SYSTEM, {
      domain_name: ASK_GPT_DOMAIN_NAME,
      domain_instructions: ASK_GPT_DOMAIN_INSTRUCTIONS,
    });
    const stage1User = formatTemplate(STAGE1_USER, {
      attributes: JSON.stringify(attributes ?? {}, null, 2),
      metadata: JSON.stringify(metadata ?? {}, null, 2),
    });
    const { data, raw } = await callChat([
      { role: 'system', content: stage1System },
      { role: 'user', content: stage1User },
    ], 80, OPENAI_MODEL, { traceId, mode: 'stage1' });
    const parsed = parseStage1(raw);
    LOG.info(traceId, `── STAGE1 RESULT model=${data.model} tokens=${data.usage?.total_tokens} subtype=${parsed.subtype || '(empty)'} reason_chars=${String(parsed.reason || '').length}`);
    return res.json({ subtype: parsed.subtype, reason: parsed.reason, text: raw, raw_response: raw });
  } catch (err) {
    const httpStatus = parseHttpStatusCode(err.message) || '500';
    LOG.error(traceId, `── UNHANDLED ERROR message=${err.message}`);
    LOG.debug(traceId, `stack: ${clipText(err.stack || '', 2000)}`);
    res.status(Number(httpStatus) || 500).json(buildJudgeErrorResponse(httpStatus, '', err.message));
  }
});

module.exports = router;
