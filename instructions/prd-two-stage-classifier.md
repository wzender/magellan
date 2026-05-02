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

**Prefix-cache strategy**: The system prompt is identical for all records in the same domain. No few-shots are injected into Stage 1, so the system prompt never varies — maximising vLLM prefix cache hits across the entire batch.

#### Stage 1 — System Prompt

```python
STAGE1_SYSTEM: str = """\
You are a classification assistant specialized in {domain_name}.

## Domain Instructions
{domain_instructions}

## Task
Given a record's attributes and metadata, determine the most appropriate subtype category.
Respond with exactly three lines and nothing else:
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
| `{domain_instructions}` | Domain-specific guidance for record interpretation (see §Domain Instructions — Stage 1) |

---

#### Stage 1 — User Prompt

```python
STAGE1_USER: str = """\
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
| `{attributes}` | JSON string of the record's `attributes` field |
| `{metadata}` | JSON string of the record's `metadata` field |

---

#### Few-shot Retrieval → Stage 2 Hints

Few-shots are retrieved via Elastic KNN (cosine similarity) but are **not** injected into Stage 1. Instead, the unique subtype labels from the top-k retrieved records are passed as **nearest subtype hints** to Stage 2's user prompt. This:
- Keeps Stage 1 unbiased — free to output novel/missing labels
- Improves Stage 1 prefix cache hit rate (no variable few-shot block)
- Gives Stage 2 retrieval-informed grounding guidance at minimal token cost (~10–20 tokens)

```python
def extract_nearest_subtypes(retrieved_fewshots: list, max_hints: int = 5) -> str:
    """Deduplicate subtype labels from top-k retrieved records, preserving rank order."""
    seen = set()
    hints = []
    for fs in retrieved_fewshots:
        label = fs["subtype"]
        if label not in seen:
            seen.add(label)
            hints.append(label)
        if len(hints) >= max_hints:
            break
    return ", ".join(hints) if hints else "N/A"
```

---

### Stage 2 — Semantic Grounding to Allowed List

**Purpose**: Map the Stage 1 candidate label (and its reasoning) onto the nearest allowed subtype from the injected list. This call is cheap — the candidate + allowed list is the only variable content.

**Prefix-cache strategy**: The system prompt is identical for all records sharing the same allowed subtype list (it embeds the full list). Only the user turn changes per record.

#### Stage 2 — System Prompt

```python
STAGE2_SYSTEM: str = """\
You are a label-grounding assistant specialized in {domain_name}.

## Domain Instructions
{domain_instructions}

## Allowed Subtypes
{allowed_subtypes_list}

## Task
You are given a candidate subtype label and a brief reason produced by a classifier.
Your job is to select the semantically closest label from the allowed list above.

Rules:
- You MUST output exactly one of: a label from the allowed list, "unknown", or "missing_subtype".
- Output "unknown" if the candidate is "unknown" or if the signal is too weak to decide.
- Output "missing_subtype" if the candidate has a strong, clear semantic meaning that does NOT fit any allowed label — even as a synonym, abbreviation, or subset.
- Output an allowed label (exact string) when the candidate can be reasonably mapped to it.

Output only the single line below and nothing else. No markdown, no preamble, no explanation.
RESULT: <chosen label | unknown | missing_subtype>
""".strip()
```

**Placeholders**:
| Placeholder | Description |
|---|---|
| `{domain_name}` | Same as Stage 1 |
| `{domain_instructions}` | Domain-specific guidance for label grounding (see §Domain Instructions — Stage 2) |
| `{allowed_subtypes_list}` | Newline-separated list of allowed subtypes, e.g. `"- Admin\n- Billing\n..."` |

---

#### Stage 2 — User Prompt

```python
STAGE2_USER: str = """\
Candidate subtype: {candidate_subtype}
Reason: {candidate_reason}

Key signals from record:
{key_signals}

Nearest subtypes from similar records:
{nearest_subtypes}
""".strip()
```

**Placeholders**:
| Placeholder | Description |
|---|---|
| `{candidate_subtype}` | `SUBTYPE` value parsed from Stage 1 response |
| `{candidate_reason}` | `REASON` value parsed from Stage 1 response |
| `{key_signals}` | The `SIGNALS` line parsed from Stage 1 response (see §Key Signals — Produced by Stage 1) |
| `{nearest_subtypes}` | Comma-separated deduplicated subtype labels from top-k Elastic KNN results (see §Few-shot Retrieval → Stage 2 Hints) |

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

Each stage has its own domain instructions block tailored to its task. This is the primary customisation point for new domains.

### Domain Instructions — Stage 1 (Record Interpretation)

Focuses on: what the record fields mean, which fields are strong classification signals, when to output unknown.

```python
DOMAIN_INSTRUCTIONS_STAGE1: str = """\
You are classifying customer-submitted records related to e-commerce product operations.

## Record Structure
- Attributes: product-level data (SKU, name, brand, tags, material, price, description)
- Metadata: operational context (region, source, status, department, data_quality)

## Classification Signals (strongest → weakest)
1. metadata.department — directly maps to operational category
2. attributes.tags — multi-label semantic indicators of product/issue domain
3. attributes.description — free-text context when tags are sparse
4. metadata.source — channel origin correlates with issue type

## Uncertainty
- Output unknown when data_quality is "low" AND description+tags are empty
- Output unknown when all signal fields are null/missing
""".strip()
```

### Domain Instructions — Stage 2 (Label Grounding)

Focuses on: how subtype labels relate to each other, disambiguation rules between similar labels, when to reject vs. map.

```python
DOMAIN_INSTRUCTIONS_STAGE2: str = """\
You are grounding candidate labels for e-commerce product operations.

## Disambiguation Rules
- "Billing" vs "Billing Support": Billing = invoice/payment issues; Billing Support = customer service about billing
- "Returns" vs "Refunds": Returns = logistics/shipping back; Refunds = money back without return
- "Delivery" vs "Shipping": Delivery = last-mile/receipt; Shipping = transit/tracking

## Grounding Guidance
- When the candidate label is a synonym or abbreviation of an allowed label, map to the allowed label
- When the candidate is a hypernym (broader) of multiple allowed labels, use key_signals and nearest_subtypes to disambiguate
- When the candidate is a hyponym (narrower) that fits within one allowed label, map up to the allowed label
- Reject (output as missing) only when the semantic gap is clear and the candidate cannot reasonably belong to any allowed label
""".strip()
```

To adapt to a new domain, replace both blocks. The Stage 1 block describes the data; the Stage 2 block describes label relationships.

---

## Signal Strength & Output Logic

| Condition | Stage 1 output | Stage 2 output | Final result |
|---|---|---|---|
| Clear match | Valid candidate | Allowed label | The label |
| Strong candidate, no list match | Valid candidate | `missing_subtype` | `missing_subtype` + Stage 1 candidate preserved as `suggested_label` |
| Weak / no signal | `unknown` | `unknown` | `unknown` |
| Forced grounding failure | Any | `unknown` (fallback) | `unknown` |

**Weak signal definition**: Stage 1 outputs `unknown` OR Stage 2 outputs `unknown`. No confidence score is required; the model's explicit `unknown` declaration is the sole weak-signal gate.

**Missing subtype definition**: Stage 2 outputs `missing_subtype`. The application preserves Stage 1's `candidate_subtype` as the `suggested_label` for taxonomy review.

---

## Downstream Integration — Unknowns Benchmark & GPT-as-Judge

The Magellan dashboard includes a dedicated **Unknowns benchmark** (benchmark ID 4) that consumes the pipeline's `unknown` and `missing_subtype` outputs and provides a human review workflow — assisted by a **stronger offline GPT** (e.g., GPT-4o) that judges the quality of the lightweight command-r classifier.

### Model Roles

| Model | Role | Context | Cost |
|---|---|---|---|
| command-r (vLLM) | Online classifier — fast batch inference | Tight budget, prefix-cached, temperature=0 | Low (self-hosted) |
| GPT-4o (OpenAI API) | Offline judge — validates/corrects classifier decisions | No latency constraint, full reasoning | Higher per-call, but applied only to flagged records |

The two models never run together in the pipeline. command-r classifies all records in bulk; GPT-4o reviews only the subset surfaced in the Unknowns benchmark (unknowns + missing subtypes).

### Data Flow

```
classify() returns {"subtype": "missing_subtype", "suggested_label": ..., "reason": ..., "signals": ...}
    ↓
Records land in country-specific Unknowns run files (4_spain.csv, 4_france.csv, 4_italy.csv)
    ↓
csv-loader.js pre-computes valid/invalid subtypes per country (from subtypes-by-country.json)
    ↓
Dashboard leaderboard shows one row per country/run with unknown + missing counts
    ↓
User selects a run → enters the two-tab per-country validation view
    ↓
Tab 1 (Unknown Validation): GPT-4o judges unknown records offline via Ask GPT endpoint
Tab 2 (Missing Subtypes): human reviews candidate subtypes grouped by suggested_label
```

### GPT-as-Judge: What It Evaluates

The stronger GPT answers a different question depending on the classifier's output:

#### For `missing_subtype` records
**Question**: "Is classifying this record as `[suggested_label]` justified, or should it map to an existing allowed subtype?"

| GPT Verdict | Meaning | Action |
|---|---|---|
| `yes` | Genuinely missing — `suggested_label` is a valid new category | Candidate for taxonomy addition |
| `no` + correction | command-r failed grounding — should have mapped to `[allowed_label]` | Retag `true_subtype` = allowed_label; signals classifier weakness |

#### For `unknown` records
**Question**: "Given the record's attributes and metadata, can you confidently classify this into one of the allowed subtypes?"

| GPT Verdict | Meaning | Action |
|---|---|---|
| `yes` + label | GPT can classify — command-r was too conservative | Retag `true_subtype` = GPT's label; signals recall gap in command-r |
| `no` | Truly ambiguous — even a stronger model can't decide | Confirms `unknown` is correct; record stays unclassified |

#### For `missing_subtype` — Subtype Suggestion
**Question**: "What should this new subtype be called? (1–3 words, Title Case, novel relative to existing list)"

Used when GPT confirms the record is genuinely missing. The stronger model proposes a clean label name since command-r's `suggested_label` may be noisy or verbose.

### Review Workflow

| Step | Action | API Endpoint | GPT Role |
|---|---|---|---|
| 1. Select run | Pick country from leaderboard | — | — |
| 2. Judge unknowns | GPT evaluates each `unknown` record | `POST /api/ask-gpt` (verdict mode) | Validates or corrects |
| 3. Retag | Human confirms/overrides GPT verdict | `PUT /api/validation` | — |
| 4. Review missing subtypes | Browse candidates grouped by `suggested_label` | `GET /api/missing-subtypes?run_id=X` | — |
| 5. Decide on candidates | Accept / Map to existing / Reject each candidate group | `PUT /api/missing-subtypes` | — |
| 6. Persist | Store GPT verdicts and missing subtype decisions | `PUT /api/gpt-results`, `PUT /api/missing-subtypes` | — |

### Field Mapping: Pipeline → Dashboard

| Pipeline output field | Dashboard column / API field |
|---|---|
| `subtype` (`"missing_subtype"`) | `pred_subtype2` = `"missing"` |
| `suggested_label` | `missing_subtype` column; grouped in Missing Subtypes tab |
| `reason` | Displayed in record detail; passed to GPT for context |
| `signals` | Displayed in record detail; passed to GPT for context |

### Quality Signals from GPT Verdicts

Aggregating GPT verdicts across a run produces **classifier quality metrics**:

| Metric | Computation | Indicates |
|---|---|---|
| False Unknown Rate | `unknown` records where GPT says `yes` / total `unknown` | command-r is too conservative (recall gap) |
| False Missing Rate | `missing_subtype` records where GPT says `no` / total `missing_subtype` | Stage 2 grounding failure |
| True Missing Rate | `missing_subtype` records where GPT says `yes` / total `missing_subtype` | Genuine taxonomy gaps |
| Judge Agreement | GPT `no` corrections that match a human retag | GPT judge reliability |

These metrics help decide whether to tune domain instructions, adjust Stage 2 disambiguation rules, or expand the allowed subtype list.

---

### UI Design: Unknowns Benchmark

The Unknowns benchmark is a **labeling and taxonomy management tool**, not a classification accuracy dashboard. Its UI is optimised for human review throughput, not metric analysis. Each run corresponds to exactly one country; selecting a run enters the full-screen per-country validation view.

#### Leaderboard — Entry Point

The leaderboard is the only shared surface with other benchmarks. It shows one row per country/run and serves as the entry point.

| Column | Source | Description |
|---|---|---|
| Run | `run_name` | Country name |
| Unknowns | `pred_subtype2 = "unknown"` count | Records where command-r had insufficient signal |
| Missing | `pred_subtype2 = "missing"` count | Records where command-r flagged a taxonomy gap |
| Real Unknown | GPT verdict `no` on unknown records | Confirmed ambiguous |
| False Unknown | GPT verdict `yes` on unknown records | command-r too conservative (orange if >20%) |
| Reviewed | Records with any GPT verdict | Progress indicator |

Default sort: `Missing` descending (surfaces countries with the most taxonomy gaps first).

#### Per-Country Validation View

Clicking a run opens a dedicated full-screen view scoped to that country. The view has two tabs.

```
┌─ Spain — Unknown Validation ────────────────────────────────────┐
│  [Unknown Validation]   [Missing Subtypes]                      │
└─────────────────────────────────────────────────────────────────┘
```

---

##### Tab 1: Unknown Validation

For records where `pred_subtype_2 === 'unknown'`. Goal: determine whether each unknown is genuine (Real Unknown) or a classifier recall failure (False Unknown).

**Header bar**

```
Progress: 47 / 120 reviewed  ████████░░░░  39%
Real Unknown: 23  ·  False Unknown: 24  ·  Unclear: 0
```

**Verdict filter tabs** (primary navigation):

```
[All 120]  [Unreviewed 73]  [Real Unknown 23]  [False Unknown 24]  [Unclear 0]
```

**Record table columns**

| Column | Content |
|---|---|
| ID | Record identifier |
| Attributes preview | Truncated `attributes` JSON |
| Reason | command-r's one-sentence rationale from Stage 1 |
| Signals | Key field=value pairs from Stage 1 |
| GPT says | GPT verdict + correction label (if available) |
| Verdict | Inline buttons: Real Unknown / False Unknown / Unclear |

Expanding a row shows full `attributes` and `metadata` JSON (syntax-highlighted) and the country's allowed subtype list.

**Per-record actions**

| Action | Effect |
|---|---|
| Ask GPT | `POST /api/ask-gpt` — GPT evaluates whether the record is truly unknown |
| Accept GPT | Copies GPT's verdict into the record's true subtype |
| Retag | Inline subtype combobox → `PUT /api/validation` |

**Bulk actions**

| Action | Scope |
|---|---|
| Judge All Unreviewed | Batch `POST /api/ask-gpt` for all unreviewed records in filtered set |
| Accept All GPT Yes | Batch-accept GPT corrections where verdict = yes |
| Export | Download CSV of filtered records with verdicts |

---

##### Tab 2: Missing Subtypes

For records where `pred_subtype_2 === 'missing_subtype'`. Goal: identify genuine new subtypes that should be added to the country's taxonomy.

Records are **grouped by `missing_subtype` candidate** (Stage 1's `suggested_label`). Record count per group is the signal-strength indicator — a candidate appearing in 15 records is a stronger taxonomy gap signal than one appearing in 1.

**Group list** (sorted by record count descending):

```
mortgage_fraud        15 records   [unreviewed]   [Accept]  [Map to existing ▼]  [Reject]
crypto_scam            8 records   [accepted]
elder_abuse            3 records   [mapped → fraud_financial]
loan_modification      1 record    [rejected]
```

**Per-group actions**

| Action | Effect | Stored as |
|---|---|---|
| Accept | Candidate is a genuine new subtype — add to taxonomy | `{ status: "accepted" }` |
| Map to existing | Candidate maps to an existing allowed subtype (combobox) | `{ status: "mapped", mapped_to: "existing_subtype" }` |
| Reject | Candidate is a classifier error — ignore | `{ status: "rejected" }` |

Expanding a group shows all constituent records with their attributes, metadata, reason, and signals.

**Storage**: decisions are persisted to `data/missing_subtype_decisions.json`, keyed by `run_id` → `candidate_name` → decision object. This is separate from `true_subtype` verdicts which live in the run CSV.

```json
{
  "42": {
    "mortgage_fraud": { "status": "accepted" },
    "crypto_scam":    { "status": "mapped", "mapped_to": "fraud_investment" },
    "elder_abuse":    { "status": "rejected" }
  }
}
```

**API**

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/missing-subtypes?run_id=X` | Returns grouped candidates with counts and current decision |
| `PUT` | `/api/missing-subtypes` | Saves a decision `{ run_id, candidate, status, mapped_to? }` |

### Feedback Loop

The two tabs together drive **taxonomy evolution**:

- **Missing Subtypes tab**: accepted candidates graduate to `subtypes-by-country.json`, entering the allowed list for future classification runs.
- **Unknown Validation tab**: false-unknown patterns (command-r consistently fails on a class of records) inform updates to `DOMAIN_INSTRUCTIONS_STAGE2` disambiguation rules.

The Unknowns benchmark closes the loop: every run surfaces both the classifier's recall gaps (unknowns) and its taxonomy blindspots (missing subtypes), with human decisions feeding directly back into the system.

---

## Prompt Rendering Helper (pseudocode)

```python
def render_stage1(domain_name, domain_instructions_stage1, attributes, metadata):
    system = STAGE1_SYSTEM.format(
        domain_name=domain_name,
        domain_instructions=domain_instructions_stage1,
    )
    user = STAGE1_USER.format(
        attributes=attributes,
        metadata=metadata,
    )
    return [{"role": "system", "content": system},
            {"role": "user",   "content": user}]


def render_stage2(domain_name, domain_instructions_stage2, allowed_subtypes,
                  candidate_subtype, candidate_reason, key_signals,
                  nearest_subtypes):
    allowed_subtypes_list = "\n".join(f"- {s}" for s in allowed_subtypes)
    system = STAGE2_SYSTEM.format(
        domain_name=domain_name,
        domain_instructions=domain_instructions_stage2,
        allowed_subtypes_list=allowed_subtypes_list,
    )
    user = STAGE2_USER.format(
        candidate_subtype=candidate_subtype,
        candidate_reason=candidate_reason,
        key_signals=key_signals,
        nearest_subtypes=nearest_subtypes,
    )
    return [{"role": "system", "content": system},
            {"role": "user",   "content": user}]
```

---

## vLLM Prefix Caching Notes

- **Batching**: Group records by `(allowed_subtypes_fingerprint)` before sending to vLLM. Records sharing the same rendered system prompt will hit the prefix cache on the second+ call in the batch.
- **Stage 1 cache key**: `hash(STAGE1_SYSTEM.format(domain_name, domain_instructions))` — identical for all records in a domain, maximising cache reuse.
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
def parse_stage2(response_text):
    result_match = re.search(r"^RESULT:\s*(.+)$", response_text, re.MULTILINE)
    if not result_match:
        return "unknown"
    result = result_match.group(1).strip()
    if result in ("unknown", "missing_subtype"):
        return result
    return result  # an allowed label
```

---

## Full Pipeline

```python
def classify(record, allowed_subtypes, retrieved_fewshots,
             domain_name, domain_instructions_stage1,
             domain_instructions_stage2, llm_client):
    # Extract nearest subtype hints from retrieval results
    nearest_subtypes = extract_nearest_subtypes(retrieved_fewshots)

    # Stage 1 — unbiased, no few-shots
    messages1 = render_stage1(domain_name, domain_instructions_stage1,
                               record["attributes"],
                               record["metadata"])
    # max_new_tokens=120 covers "SUBTYPE: <label>\nREASON: <text>\nSIGNALS: <pairs>" — reason capped at ~50 tokens, signals at ~40 tokens
    resp1 = llm_client.chat(messages1, max_new_tokens=120, temperature=0)
    candidate_subtype, candidate_reason, key_signals = parse_stage1(resp1)

    # Stage 2 — grounding with retrieval hints
    messages2 = render_stage2(domain_name, domain_instructions_stage2,
                               allowed_subtypes,
                               candidate_subtype, candidate_reason,
                               key_signals, nearest_subtypes)
    resp2 = llm_client.chat(messages2, max_new_tokens=40, temperature=0)
    final_label = parse_stage2(resp2)

    # Build result with missing subtype detection
    if final_label == "missing_subtype":
        return {
            "subtype": "missing_subtype",
            "suggested_label": candidate_subtype,
            "reason": candidate_reason,
            "signals": key_signals,
        }
    return {"subtype": final_label}
```

---

## Acceptance Criteria

1. Each LLM call is a `[system, user]` message pair — no combined single-turn prompts.
2. All prompt strings are Python `str` literals usable with `.format(**kwargs)`.
3. Domain Instructions are split into two blocks: Stage 1 (record interpretation) and Stage 2 (label grounding). Both must be replaced when adapting to a new domain.
4. Few-shots are NOT injected into Stage 1. Instead, retrieved nearest subtype labels are passed as hints to Stage 2.
5. The pipeline outputs one of: an allowed subtype label, `"unknown"`, or `"missing_subtype"` (with `suggested_label` from Stage 1).
6. Stage 1 total response budget is `max_new_tokens=120`; covers the label (~10 tokens), reason (~50 tokens), and signals (~40 tokens).
7. Both LLM calls use `temperature=0` (greedy decoding) — recommended by Cohere for classification tasks and ensures deterministic output format.
8. Stage 1 system prompt is fully static per domain — no per-record or per-batch variation — enabling maximum vLLM prefix cache reuse.
9. Missing subtypes are detected via the explicit `missing_subtype` keyword from Stage 2. The original candidate label from Stage 1 is preserved as `suggested_label`.
