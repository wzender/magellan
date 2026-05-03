/**
 * Ask-GPT API
 * Sends attributes + metadata to OpenAI; returns a yes/no verdict and reasoning.
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const OPENAI_MODEL      = process.env.OPENAI_MODEL      || 'gpt-4o-mini';
const OPENAI_JUDGE_MODEL = process.env.OPENAI_JUDGE_MODEL || OPENAI_MODEL;
const OPENAI_API_URL    = process.env.OPENAI_API_URL    || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 200;
const TIMEOUT_MS        = 20000;
const ASK_GPT_PROMPT    = (process.env.ASK_GPT_PROMPT || '').trim();
const ASK_GPT_DOMAIN_NAME = process.env.ASK_GPT_DOMAIN_NAME || 'e-commerce product support';
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

function normalizeJudgeDecision(value, predictedStatus = '') {
  const status = String(predictedStatus || '').trim().toLowerCase();
  const raw = String(value || '').trim().toLowerCase();

  if (VALID_JUDGE_DECISIONS.has(raw)) return raw;

  // Backward-compat mapping for legacy yes/no rows.
  if (raw === 'yes') {
    if (status === 'unknown') return 'wrong_subtype';
    if (status === 'missing') return 'true_missing_subtype';
    return 'wrong_subtype';
  }
  if (raw === 'no') {
    if (status === 'unknown') return 'truly_unknown';
    if (status === 'missing') return 'missing_but_mappable';
    return 'wrong_subtype';
  }

  if (/unknown/.test(raw) && !/missing/.test(raw)) return 'truly_unknown';
  if (/missing/.test(raw) && /(true|real|new|taxonomy)/.test(raw)) return 'true_missing_subtype';
  if (/mapp|closest|semantic|near|similar/.test(raw)) return 'missing_but_mappable';
  if (/wrong|incorrect|different|other/.test(raw)) return 'wrong_subtype';

  // Safe fallback: if it was flagged unknown/missing by stage2, preserve conservative semantics.
  if (status === 'unknown') return 'truly_unknown';
  if (status === 'missing') return 'missing_but_mappable';
  return 'wrong_subtype';
}

function parseJsonObject(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function callChat(messages, maxTokens = OPENAI_MAX_TOKENS, model = OPENAI_MODEL) {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    timeout: TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = (data.choices?.[0]?.message?.content || '').trim();
  return { data, raw };
}

/**
 * POST /api/ask-gpt
 * Body: { attributes, metadata, suggested_subtype?, suggested_type? }
 * Returns:
 * - verdict mode (Unknowns): { verdict: "yes"|"no", reasoning: "..." }
 * - classify mode (Record Details): { subtype: "...", reason: "...", text: "..." }
 */
router.post('/ask-gpt', async (req, res) => {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-key-here') {
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
    nearest_subtypes,
  } = req.body;
  if (!attributes && !metadata) {
    return res.status(400).json({ error: 'attributes or metadata required' });
  }

  try {
    if (judge_mode) {
      const allowedList = Array.isArray(allowed_subtypes) && allowed_subtypes.length > 0
        ? allowed_subtypes.map(s => `- ${s}`).join('\n')
        : '- N/A';
      const nearestHints = Array.isArray(nearest_subtypes) && nearest_subtypes.length > 0
        ? nearest_subtypes.join(', ')
        : 'N/A';

      const systemPrompt = `You are an expert audit judge for a two-stage subtype classifier.

You must classify each record into exactly one decision:
1) truly_unknown
   Use when the record has no actionable content signal. This includes:
   - Attributes where name/description are null, empty, or contain only an identifier (UUID, GUID, barcode, numeric code, "ID-xxxxx").
   - Records with all-null or all-empty fields beyond the SKU.
   - Records where confidence is very low (<0.15) and no human-readable description exists.
   When in doubt and signal is weak, choose truly_unknown over any other option.
2) true_missing_subtype
   Use ONLY when the record has strong, explicit content signal (a real name, description, or tags with meaningful words) AND the concept is clearly absent from the allowed list.
   Do NOT use this for records whose only content is an identifier string — even if the identifier pattern suggests a category.
3) missing_but_mappable
   Use when the classifier flagged missing, but the meaning is semantically close enough to an existing allowed subtype.
4) wrong_subtype
   Use when the classifier result is simply wrong and a different allowed subtype should have been chosen.

Output JSON only with this schema:
{"decision":"truly_unknown|true_missing_subtype|missing_but_mappable|wrong_subtype","mapped_allowed_subtype":"<allowed subtype or empty>","suggested_missing_subtype":"<1-3 words title case or empty>","reasoning":"1-2 concise sentences"}

Rules:
- Never output markdown.
- The attributes and metadata may be in any language — ignore their language and respond entirely in English.
- mapped_allowed_subtype must be copied verbatim from the allowed subtypes list, or left empty. Do not invent or translate subtype names.
- suggested_missing_subtype must be in English title case, non-empty only for true_missing_subtype.
- If uncertain between missing_but_mappable and wrong_subtype, prefer wrong_subtype.
- If uncertain between true_missing_subtype and truly_unknown, prefer truly_unknown.`;

      const userPrompt = `Predicted status (from small model pipeline): ${predicted_status || stage2_subtype || 'N/A'}
Predicted type: ${pred_type || 'N/A'}
Predicted subtype: ${pred_subtype || 'N/A'}
Stage-1 candidate subtype: ${candidate_subtype || 'N/A'}
Missing subtype candidate: ${missing_subtype || 'N/A'}

Allowed subtypes for this country:
${allowedList}

Nearest subtype hints from retrieval:
${nearestHints}

Attributes:
${JSON.stringify(attributes, null, 2)}

Metadata:
${JSON.stringify(metadata, null, 2)}`;

      const { data, raw } = await callChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], 220, OPENAI_JUDGE_MODEL);

      const parsed = parseJsonObject(raw) || {};
      const decision = normalizeJudgeDecision(parsed.decision || parsed.verdict || raw, predicted_status || stage2_subtype);
      const mappedAllowedSubtypeRaw = String(parsed.mapped_allowed_subtype || parsed.corrected_subtype || '').trim();
      const allowedSet = new Set((Array.isArray(allowed_subtypes) ? allowed_subtypes : []).map(s => String(s).trim()));
      const mappedAllowedSubtype = allowedSet.has(mappedAllowedSubtypeRaw) ? mappedAllowedSubtypeRaw : '';
      const suggestedMissingSubtype = String(parsed.suggested_missing_subtype || parsed.suggested_label || '').trim();
      const reasoning = String(parsed.reasoning || parsed.reason || raw).trim();

      console.log(`[ask-gpt] mode=judge model=${data.model} tokens=${data.usage?.total_tokens}`);

      return res.json({
        decision,
        mapped_allowed_subtype: mappedAllowedSubtype,
        suggested_missing_subtype: suggestedMissingSubtype,
        reasoning,
      });
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

      const { data, raw } = await callChat([{ role: 'user', content: prompt }]);
      console.log(`[ask-gpt] mode=verdict model=${data.model} tokens=${data.usage?.total_tokens}`);

      try {
        const parsed = JSON.parse(raw);
        return res.json({ verdict: parsed.verdict || 'no', reasoning: parsed.reasoning || raw });
      } catch {
        const isYes = /\byes\b/i.test(raw);
        return res.json({ verdict: isYes ? 'yes' : 'no', reasoning: raw });
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
      const { data, raw } = await callChat([{ role: 'user', content: rendered }], 250);
      console.log(`[ask-gpt] mode=env-prompt model=${data.model} tokens=${data.usage?.total_tokens}`);
      return res.json({ text: raw, subtype: null, reason: null });
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
    ], 80);
    const parsed = parseStage1(raw);
    console.log(`[ask-gpt] mode=stage1 model=${data.model} tokens=${data.usage?.total_tokens}`);
    return res.json({ subtype: parsed.subtype, reason: parsed.reason, text: raw });
  } catch (err) {
    console.error('[ask-gpt] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
