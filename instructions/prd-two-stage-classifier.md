# PRD: Two-Stage LLM Subtype Classifier

## Overview

Build a two-stage LLM classification pipeline using **command-r** via **vLLM** with prefix caching. Given a record's `attributes` (product JSON) and `metadata` (source/status JSON), classify it into one of the allowed subtypes for its country — or flag it as `unknown` / a missing subtype.

---

## Background & Context

The system evaluates classification quality across benchmarks per country. Each country has a distinct allowed subtype list (loaded from `subtypes-by-country.json` / subtypes XLSX). The classifier must:
- Respect per-country taxonomy boundaries
- Be robust to noisy, sparse, or ambiguous inputs
- Remain domain-agnostic at the structural level, with domain logic isolated in a dedicated section

---

## Goals

1. **Accuracy**: Predict the correct subtype from the country's allowed list.
2. **Prefix cache efficiency**: Maximise the cacheable prefix (system prompts are static per country; only the user turn changes per record).
3. **Graceful degradation**: Output `unknown` on weak signals; flag missing subtypes when evidence is strong but no allowed label fits.
4. **Portability**: Swapping to a new domain requires editing only the *Domain Instructions* section of each prompt.

---

## Two-Stage Architecture

### Stage 1 — Free-form Classification + Reasoning

**Purpose**: Let the model reason freely and produce a candidate subtype label plus brief rationale, without being constrained to the allowed list yet.

**Prefix-cache strategy**: The system prompt is identical for all records in the same country. Batch all records for the same country together so vLLM can reuse the KV cache for the system turn.

#### Stage 1 — System Prompt

```python
STAGE1_SYSTEM = """\
You are a classification assistant specialized in {domain_name}.

## Domain Instructions
{domain_instructions}

## Task
Given a record's attributes and metadata, determine the most appropriate subtype category.
Respond with exactly two lines:
1. SUBTYPE: <your candidate label>
2. REASON: <one sentence, max 50 tokens>

If the input provides no clear signal, respond:
SUBTYPE: unknown
REASON: Insufficient signal to classify.
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

Country: {country}
""".strip()
```

**Placeholders**:
| Placeholder | Description |
|---|---|
| `{few_shot_block}` | Rendered few-shot examples block (see §Few-shot Template); empty string `""` if no examples provided |
| `{attributes}` | JSON string of the record's `attributes` field |
| `{metadata}` | JSON string of the record's `metadata` field |
| `{country}` | Country name, e.g. `"Spain"` |

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

**Purpose**: Map the Stage 1 candidate label (and its reasoning) onto the nearest allowed subtype for the country. This call is cheap — the candidate + allowed list is the only variable content.

**Prefix-cache strategy**: The system prompt is identical for all records in the same country (it embeds the full allowed subtype list). Only the user turn changes per record.

#### Stage 2 — System Prompt

```python
STAGE2_SYSTEM = """\
You are a label-grounding assistant specialized in {domain_name}.

## Domain Instructions
{domain_instructions}

## Allowed Subtypes for {country}
{allowed_subtypes_list}

## Task
You are given a candidate subtype label and a brief reason produced by a classifier.
Your job is to select the semantically closest label from the allowed list above.

Rules:
- You MUST output one of the labels from the allowed list, OR output "unknown", OR output "MISSING: <label>" (see below).
- Output "unknown" if the candidate is "unknown" or if neither it nor any allowed label is a reasonable match.
- Output "MISSING: <label>" ONLY if the candidate label has a strong, unambiguous semantic meaning that is absent from the allowed list and cannot be reasonably mapped to any existing label.
- Do NOT invent labels; use the exact string from the allowed list when grounding succeeds.

Respond with exactly one line:
RESULT: <chosen label | unknown | MISSING: <label>>
""".strip()
```

**Placeholders**:
| Placeholder | Description |
|---|---|
| `{domain_name}` | Same as Stage 1 |
| `{domain_instructions}` | Same domain instructions block |
| `{country}` | Country name |
| `{allowed_subtypes_list}` | Newline-separated list of allowed subtypes, e.g. `"- Admin\n- Billing\n..."` |

---

#### Stage 2 — User Prompt

```python
STAGE2_USER = """\
Candidate subtype: {candidate_subtype}
Reason: {candidate_reason}
""".strip()
```

**Placeholders**:
| Placeholder | Description |
|---|---|
| `{candidate_subtype}` | `SUBTYPE` value parsed from Stage 1 response |
| `{candidate_reason}` | `REASON` value parsed from Stage 1 response |

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
| Candidate found, no list match | Valid candidate | `MISSING: <label>` | `MISSING: <label>` |
| Weak / no signal | `unknown` | `unknown` | `unknown` |
| Forced grounding failure | Any | `unknown` (fallback) | `unknown` |

**Weak signal definition**: Stage 1 outputs `unknown` OR Stage 2 outputs `unknown`. No confidence score is required; the model's explicit `unknown` declaration is the sole weak-signal gate.

**Missing subtype definition**: Stage 2 outputs `MISSING:` prefix. This surfaces novel categories for taxonomy review rather than forcing an incorrect label.

---

## Prompt Rendering Helper (pseudocode)

```python
def render_stage1(domain_name, domain_instructions, few_shots, attributes, metadata, country):
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
        country=country,
    )
    return [{"role": "system", "content": system},
            {"role": "user",   "content": user}]


def render_stage2(domain_name, domain_instructions, country, allowed_subtypes,
                  candidate_subtype, candidate_reason):
    allowed_subtypes_list = "\n".join(f"- {s}" for s in allowed_subtypes)
    system = STAGE2_SYSTEM.format(
        domain_name=domain_name,
        domain_instructions=domain_instructions,
        country=country,
        allowed_subtypes_list=allowed_subtypes_list,
    )
    user = STAGE2_USER.format(
        candidate_subtype=candidate_subtype,
        candidate_reason=candidate_reason,
    )
    return [{"role": "system", "content": system},
            {"role": "user",   "content": user}]
```

---

## vLLM Prefix Caching Notes

- **Batching**: Group records by `(country, few_shot_fingerprint)` before sending to vLLM. Records sharing the same system prompt will hit the prefix cache on the second+ call in the batch.
- **Stage 1 cache key**: `hash(STAGE1_SYSTEM.format(domain_name, domain_instructions) + few_shot_block)`
- **Stage 2 cache key**: `hash(STAGE2_SYSTEM.format(domain_name, domain_instructions, country, allowed_subtypes_list))`
- command-r context window is large enough to hold the full allowed list + instructions in the system prompt without truncation risk.

---

## Response Parsing

### Stage 1 parser

```python
import re

def parse_stage1(response_text):
    subtype_match = re.search(r"^SUBTYPE:\s*(.+)$", response_text, re.MULTILINE)
    reason_match  = re.search(r"^REASON:\s*(.+)$",  response_text, re.MULTILINE)
    subtype = subtype_match.group(1).strip() if subtype_match else "unknown"
    reason  = reason_match.group(1).strip()  if reason_match  else ""
    return subtype, reason
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
    if result.startswith("MISSING:"):
        return result  # pass through for taxonomy review
    if result in allowed_subtypes:
        return result
    return "unknown"  # safety fallback: model output not in list and not a special token
```

---

## Full Pipeline

```python
def classify(record, country, allowed_subtypes, few_shots,
             domain_name, domain_instructions, llm_client):
    # Stage 1
    messages1 = render_stage1(domain_name, domain_instructions,
                               few_shots, record["attributes"],
                               record["metadata"], country)
    resp1 = llm_client.chat(messages1, max_new_tokens=80)
    candidate_subtype, candidate_reason = parse_stage1(resp1)

    # Stage 2
    messages2 = render_stage2(domain_name, domain_instructions,
                               country, allowed_subtypes,
                               candidate_subtype, candidate_reason)
    resp2 = llm_client.chat(messages2, max_new_tokens=40)
    final_label = parse_stage2(resp2, allowed_subtypes)

    return final_label
```

---

## Acceptance Criteria

1. Each LLM call is a `[system, user]` message pair — no combined single-turn prompts.
2. All prompt strings are Python `str` literals usable with `.format(**kwargs)`.
3. The `Domain Instructions` block is a single string constant — changing it is sufficient to repurpose the system for a new domain.
4. Few-shots are injected only into the Stage 1 user prompt and are externally supplied (not hardcoded).
5. The pipeline outputs exactly one of: an allowed subtype string, `"unknown"`, or `"MISSING: <label>"`.
6. Stage 1 reasoning is capped at 50 tokens (enforced via `max_new_tokens` at call time).
7. Both system prompts are stable (no per-record variation) within a `(country, few_shot_set)` batch — enabling vLLM prefix cache hits.
