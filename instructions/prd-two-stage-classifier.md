# PRD: Two-Stage LLM Subtype Classifier

## Overview

Build a two-stage LLM classification pipeline using **command-r** via **vLLM** with prefix caching. Given a record's `attributes` (product JSON) and `metadata` (source/status JSON), classify it into one of the injected allowed subtypes — or flag it as `unknown` / a missing subtype.

---

## Background & Context

The system evaluates classification quality across benchmarks per country. Each country has a distinct allowed subtype list (loaded from `subtypes-by-country.json` / subtypes XLSX). The classifier must:
- Respect per-country taxonomy boundaries
- Be robust to noisy, sparse, or ambiguous inputs
- Remain domain-agnostic at the structural level, with domain logic isolated in a dedicated section

---

## Goals

1. **Accuracy**: Predict the correct subtype from the injected allowed subtype list.
2. **Prefix cache efficiency**: Maximise the cacheable prefix (system prompts are static per subtype set; only the user turn changes per record).
3. **Graceful degradation**: Output `unknown` on weak signals; flag missing subtypes when evidence is strong but no allowed label fits.
4. **Portability**: Swapping to a new domain requires editing only the *Domain Instructions* section of each prompt.

---

## Two-Stage Architecture

### Stage 1 — Free-form Classification + Reasoning

**Purpose**: Let the model reason freely and produce a candidate subtype label plus brief rationale, without being constrained to the allowed list yet.

**Prefix-cache strategy**: The system prompt is identical for all records in the same domain/few-shot setting. Batch records by the same rendered Stage 1 system prompt so vLLM can reuse the KV cache.

#### Stage 1 — System Prompt

```python
STAGE1_SYSTEM = """\
You are a classification assistant specialized in {domain_name}.

## Domain Instructions
{domain_instructions}

## Task
Given a record's attributes and metadata, determine the most appropriate subtype category.
 full record and knRespond with exactly three lines and nothing else:
1. SUBTYPE: <your candidate label>
2. REASON: <one sentence, max 50 tokens>
3. SIGNALS: <2–4 key field=value pairs from the input that most influenced your decision, separated by " | ">

If the input provides no clear signal, respond:
SUBTYPE: unknown
REASON: Insufficient signal to classify.
SIGNALS: N/A

Do not output any text before SUBTYPE: or after the SIGNALS: line. No markdown formatting, no preamble, no explanation.
""".strip()
```

**Placeholders**:
| Placeholder | Description |
|---|---|
| `{domain_name}` | Human-readable domain label, e.g. `"e-commerce product support"` |
| `{domain_instructions}` | Domain-specific guidance block (see §Domain Instructions) |

---

#### Stage 1 — User Prompt (with few-shots)

```python
STAGE1_USER = """\
{few_shot_block}
## Record to Classify

Attributes:
{attributes}

Metadata:
{metadata}
""".strip()
```

**Placeholders**:
| Placeholder | Description |
|---|---|
| `{few_shot_block}` | Rendered few-shot examples block (see §Few-shot Template); empty string `""` if no examples provided |
| `{attributes}` | JSON string of the record's `attributes` field |
| `{metadata}` | JSON string of the record's `metadata` field |

---

#### Few-shot Block Template

Few-shots are provided externally as a list of `{"attributes": ..., "metadata": ..., "subtype": ..., "reason": ...}` dicts. Rendered with:

```python
FEWSHOT_EXAMPLE = """\
### Example {index}
Attributes:
{attributes}

Metadata:
{metadata}

SUBTYPE: {subtype}
REASON: {reason}
""".strip()

FEWSHOT_BLOCK_HEADER = "## Examples\n"
```

Concatenate: `FEWSHOT_BLOCK_HEADER + "\n\n".join(FEWSHOT_EXAMPLE.format(...) for each example) + "\n\n"`.
If no examples: `few_shot_block = ""`.

---

### Stage 2 — Semantic Grounding to Allowed List

**Purpose**: Map the Stage 1 candidate label (and its reasoning) onto the nearest allowed subtype from the injected list. This call is cheap — the candidate + allowed list is the only variable content.

**Prefix-cache strategy**: The system prompt is identical for all records sharing the same allowed subtype list (it embeds the full list). Only the user turn changes per record.

#### Stage 2 — System Prompt

```python
STAGE2_SYSTEM = """\
You are a label-grounding assistant specialized in {domain_name}.

## Domain Instructions
{domain_instructions}

## Allowed Subtypes
{allowed_subtypes_list}

## Task
You are given a candidate subtype label and a brief reason produced by a classifier.
Your job is to select the semantically closest label from the allowed list above.

Rules:
- You MUST output exactly one subtype label string, OR output "unknown".
- Output "unknown" if the candidate is "unknown" or if neither it nor any allowed label is a reasonable match.
- If there is a strong, unambiguous semantic meaning that is absent from the allowed list and cannot be reasonably mapped to any existing label, output that missing label directly as plain text (no prefix).
- Use the exact string from the allowed list when grounding succeeds.

Output only the single line below and nothing else. No markdown, no preamble, no explanation.
RESULT: <chosen label | unknown>
""".strip()
```

**Placeholders**:
| Placeholder | Description |
|---|---|
| `{domain_name}` | Same as Stage 1 |
| `{domain_instructions}` | Same domain instructions block |
| `{allowed_subtypes_list}` | Newline-separated list of allowed subtypes, e.g. `"- Admin\n- Billing\n..."` |

---

#### Stage 2 — User Prompt

```python
STAGE2_USER = """\
Candidate subtype: {candidate_subtype}
Reason: {candidate_reason}

Key signals from record:
{key_signals}
""".strip()
```

**Placeholders**:
| Placeholder | Description |
|---|---|
| `{candidate_subtype}` | `SUBTYPE` value parsed from Stage 1 response |
| `{candidate_reason}` | `REASON` value parsed from Stage 1 response |
| `{key_signals}` | The `SIGNALS` line parsed from Stage 1 response (see §Key Signals — Produced by Stage 1) |

#### Key Signals — Produced by Stage 1

Rather than extracting signals with a hardcoded Python function (which would break across domains/schemas), **Stage 1 itself outputs the key signals** it relied on. The model already sees the full record and knows which fields drove its decision — so it selects the most discriminative 2–4 field=value pairs regardless of schema.

Example Stage 1 output:
```
SUBTYPE: Returns & Refunds
REASON: Customer requesting refund for damaged product in support context.
SIGNALS: department=Support | tags=refund,damaged | description=Partial refund request for broken item
```

This adds ~20–40 tokens to the Stage 2 user prompt (vs. 200–500+ for full JSON), preserving prefix-cache efficiency while remaining fully schema- and domain-agnostic.

---

## Domain Instructions Block

This section is injected into **both** system prompts. It is the primary customisation point for new domains.

**Default (e-commerce / product support)**:

```python
DOMAIN_INSTRUCTIONS_ECOMMERCE = """\
You are classifying customer-submitted records related to e-commerce operations.
Each record describes a product or interaction using structured attributes (SKU, name, brand, tags, \
material, price, etc.) and operational metadata (region, source, status, department, data quality).

Key guidance:
- Focus on the semantic meaning of the record's description, tags, and department rather than \
  surface-level string matching.
- Metadata fields like "department" and "source" are strong signals for the category domain \
  (e.g., "Support" department → likely a support-related subtype).
- Tags and description together indicate the product domain; cross-reference with the subtype list.
- Low data quality or sparse attributes increase uncertainty; reflect this in your confidence.
""".strip()
```

To adapt to a new domain, replace this block. No other prompt changes are needed.

---

## Signal Strength & Output Logic

| Condition | Stage 1 output | Stage 2 output | Final result |
|---|---|---|---|
| Clear match | Valid candidate | Allowed label | The label |
| Strong candidate, no list match | Valid candidate | Missing label (plain text) | Missing label (application flags as missing) |
| Weak / no signal | `unknown` | `unknown` | `unknown` |
| Forced grounding failure | Any | `unknown` (fallback) | `unknown` |

**Weak signal definition**: Stage 1 outputs `unknown` OR Stage 2 outputs `unknown`. No confidence score is required; the model's explicit `unknown` declaration is the sole weak-signal gate.

**Missing subtype definition**: Stage 2 outputs a non-`unknown` label that is not present in `allowed_subtypes`. The application should flag this label as a missing subtype for taxonomy review.

---

## Prompt Rendering Helper (pseudocode)

```python
def render_stage1(domain_name, domain_instructions, few_shots, attributes, metadata):
    few_shot_block = ""
    if few_shots:
        examples = [
            FEWSHOT_EXAMPLE.format(index=i+1, **ex)
            for i, ex in enumerate(few_shots)
        ]
        few_shot_block = FEWSHOT_BLOCK_HEADER + "\n\n".join(examples) + "\n\n"

    system = STAGE1_SYSTEM.format(
        domain_name=domain_name,
        domain_instructions=domain_instructions,
    )
    user = STAGE1_USER.format(
        few_shot_block=few_shot_block,
        attributes=attributes,
        metadata=metadata,
    )
    return [{"role": "system", "content": system},
            {"role": "user",   "content": user}]


def render_stage2(domain_name, domain_instructions, allowed_subtypes,
                  candidate_subtype, candidate_reason, key_signals):
    allowed_subtypes_list = "\n".join(f"- {s}" for s in allowed_subtypes)
    system = STAGE2_SYSTEM.format(
        domain_name=domain_name,
        domain_instructions=domain_instructions,
        allowed_subtypes_list=allowed_subtypes_list,
    )
    user = STAGE2_USER.format(
        candidate_subtype=candidate_subtype,
        candidate_reason=candidate_reason,
        key_signals=key_signals,
    )
    return [{"role": "system", "content": system},
            {"role": "user",   "content": user}]
```

---

## vLLM Prefix Caching Notes

- **Batching**: Group records by `(allowed_subtypes_fingerprint, few_shot_fingerprint)` before sending to vLLM. Records sharing the same rendered system prompt will hit the prefix cache on the second+ call in the batch.
- **Stage 1 cache key**: `hash(STAGE1_SYSTEM.format(domain_name, domain_instructions) + few_shot_block)`
- **Stage 2 cache key**: `hash(STAGE2_SYSTEM.format(domain_name, domain_instructions, allowed_subtypes_list))`
- command-r context window is large enough to hold the full allowed list + instructions in the system prompt without truncation risk.

---

## Response Parsing

### Stage 1 parser

```python
import re

def parse_stage1(response_text):
    subtype_match  = re.search(r"^SUBTYPE:\s*(.+)$", response_text, re.MULTILINE)
    reason_match   = re.search(r"^REASON:\s*(.+)$",  response_text, re.MULTILINE)
    signals_match  = re.search(r"^SIGNALS:\s*(.+)$", response_text, re.MULTILINE)
    subtype = subtype_match.group(1).strip()  if subtype_match  else "unknown"
    reason  = reason_match.group(1).strip()   if reason_match   else ""
    signals = signals_match.group(1).strip()  if signals_match  else "N/A"
    return subtype, reason, signals
```

### Stage 2 parser

```python
def parse_stage2(response_text, allowed_subtypes):
    result_match = re.search(r"^RESULT:\s*(.+)$", response_text, re.MULTILINE)
    if not result_match:
        return "unknown"
    result = result_match.group(1).strip()
    if result == "unknown":
        return "unknown"
    return result  # app layer decides whether this is allowed or a missing subtype
```

---

## Full Pipeline

```python
def classify(record, allowed_subtypes, few_shots,
             domain_name, domain_instructions, llm_client):
    # Stage 1
    messages1 = render_stage1(domain_name, domain_instructions,
                               few_shots, record["attributes"],
                               record["metadata"])
    # max_new_tokens=120 covers "SUBTYPE: <label>\nREASON: <text>\nSIGNALS: <pairs>" — reason capped at ~50 tokens, signals at ~40 tokens
    resp1 = llm_client.chat(messages1, max_new_tokens=120, temperature=0)
    candidate_subtype, candidate_reason, key_signals = parse_stage1(resp1)

    # Stage 2
    messages2 = render_stage2(domain_name, domain_instructions,
                               allowed_subtypes,
                               candidate_subtype, candidate_reason,
                               key_signals)
    resp2 = llm_client.chat(messages2, max_new_tokens=40, temperature=0)
    final_label = parse_stage2(resp2, allowed_subtypes)

    return final_label
```

---

## Acceptance Criteria

1. Each LLM call is a `[system, user]` message pair — no combined single-turn prompts.
2. All prompt strings are Python `str` literals usable with `.format(**kwargs)`.
3. The `Domain Instructions` block is a single string constant — changing it is sufficient to repurpose the system for a new domain.
4. Few-shots are injected only into the Stage 1 user prompt and are externally supplied (not hardcoded).
5. The pipeline outputs exactly one of: a subtype label string or `"unknown"`.
6. Stage 1 total response budget is `max_new_tokens=120`; covers the label (~10 tokens), reason (~50 tokens), and signals (~40 tokens).
7. Both LLM calls use `temperature=0` (greedy decoding) — recommended by Cohere for classification tasks and ensures deterministic output format.
8. Both system prompts are stable (no per-record variation) within an `(allowed_subtypes_set, few_shot_set)` batch — enabling vLLM prefix cache hits.
9. The application determines missing subtype cases by checking whether non-`unknown` Stage 2 output exists in `allowed_subtypes_list`.
