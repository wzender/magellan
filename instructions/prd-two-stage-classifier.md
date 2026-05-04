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

### Stage 1 — Constrained Classification + Reasoning

**Purpose**: Classify the record directly into one of the injected allowed subtypes, or flag it as `unknown` (insufficient signal) or `missing_subtype` (strong signal, no list match). Stage 2 is **not called** when Stage 1 produces a valid allowed label — it is invoked only for the flagged cases.

**Prefix-cache strategy**: The system prompt embeds the full allowed subtype list, making it static per country/batch. Records in the same batch share the same system prompt, maximising vLLM prefix cache hits within a batch. Across countries the cache key differs (different allowed lists), which is unavoidable but acceptable since batches are already grouped by country.

#### Stage 1 — System Prompt

```python
STAGE1_SYSTEM: str = """\
You are a classification assistant specialized in {domain_name}.

## Domain Instructions
{domain_instructions}

## Allowed Subtypes
{allowed_subtypes_list}

## Task
Given a record's attributes and metadata, pick the single best label from the allowed list above.
Respond with exactly three lines and nothing else:
1. SUBTYPE: <exact label from the allowed list | unknown | missing_subtype>
2. REASON: <one sentence, max 50 tokens>
3. SIGNALS: <2–4 key field=value pairs from the input that most influenced your decision, separated by " | ">

Use "unknown" when the input provides no clear signal.
Use "missing_subtype" when the signal is strong and clear but does NOT fit any allowed label — even as a synonym or subset. In that case, put your proposed label name after a pipe on the SUBTYPE line:
  SUBTYPE: missing_subtype | <your proposed label>

Do not output any text before SUBTYPE: or after the SIGNALS: line. No markdown formatting, no preamble, no explanation.
""".strip()
```

**Placeholders**:
| Placeholder | Description |
|---|---|
| `{domain_name}` | Human-readable domain label, e.g. `"e-commerce product support"` |
| `{domain_instructions}` | Domain-specific guidance for record interpretation (see §Domain Instructions — Stage 1) |
| `{allowed_subtypes_list}` | Newline-separated list of allowed subtypes, e.g. `"- Admin\n- Billing\n..."` |

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

Few-shots are retrieved via Elastic KNN (cosine similarity) but are **not** injected into Stage 1. Instead, the unique subtype labels from the top-k retrieved records are passed as **nearest subtype hints** to Stage 2's user prompt. Stage 2 is only called for `unknown` and `missing_subtype` records, so this retrieval step can be skipped for the majority of records that Stage 1 resolves directly. This:
- Keeps Stage 1 user prompt clean — only record data, no retrieval noise
- Limits retrieval cost to the flagged subset (typically a small fraction of the batch)
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

### Stage 2 — Validation for Flagged Records Only

**Purpose**: Run a second LLM call **only** when Stage 1 outputs `unknown` or `missing_subtype`. For `unknown` records, Stage 2 acts as a second-opinion pass — checking whether Stage 1 was too conservative and the record can actually be grounded to an allowed label. For `missing_subtype` records, Stage 2 validates the proposed label and confirms the gap is genuine. Records where Stage 1 already output a valid allowed label skip Stage 2 entirely.

**Prefix-cache strategy**: The system prompt embeds the full allowed subtype list and is identical for all flagged records in the same country batch. Only the user turn (the Stage 1 output) varies per record.

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

| Condition | Stage 1 output | Stage 2 called? | Stage 2 output | Final result |
|---|---|---|---|---|
| Clear match in allowed list | Allowed label | **No** | — | The label |
| Strong signal, no list match | `missing_subtype \| <candidate>` | Yes | confirms or maps | `missing_subtype` + candidate as `suggested_label`, or an allowed label |
| Weak / no signal | `unknown` | Yes | confirms or resolves | `unknown` or an allowed label |
| Stage 2 fallback failure | `unknown` | Yes | `unknown` | `unknown` |

**Weak signal definition**: Stage 1 explicitly outputs `unknown`. No confidence score is required; the model's declaration is the sole gate.

**Missing subtype definition**: Stage 1 outputs `missing_subtype`. Stage 2 validates whether the proposed candidate is genuine or should be grounded to an existing label. If Stage 2 confirms missing, the Stage 1 `candidate_subtype` is preserved as `suggested_label` for taxonomy review.

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

The leaderboard is the only shared surface with other benchmarks. It shows one row per country/run and serves as the entry point into a two-tab review workspace.

In the current implementation, the Unknowns leaderboard is split into two grouped column bands.

| Group | Column | Description |
|---|---|---|
| Unknown Validation | Country | Derived from `run_name`; the row click target |
| Unknown Validation | Total | Records in the run where `pred_subtype_2 = "unknown"` |
| Unknown Validation | GPT Reviewed | Unknown records with a saved GPT review |
| Unknown Validation | Untagged | Unknown records with no `true_subtype` decision yet |
| Unknown Validation | Retagged → Existing | Unknown records retagged to an allowed subtype |
| Unknown Validation | Retagged → Missing | Unknown records retagged to `Missing` |
| Unknown Validation | Retagged → Unknown | Unknown records retagged to `unknown` |
| Missing Subtypes | Total | Records returned by `/api/missing-subtypes` across all groups |
| Missing Subtypes | GPT Reviewed | Missing-subtype records with a saved GPT review |
| Missing Subtypes | Untagged | Missing-subtype records with no `true_subtype` decision yet |
| Missing Subtypes | Retagged → Existing | Missing-subtype records retagged to an allowed subtype |
| Missing Subtypes | Retagged → Missing | Missing-subtype records retagged to `Missing` |
| Missing Subtypes | Retagged → Unknown | Missing-subtype records retagged to `unknown` |

This differs from the earlier design draft: the shipped leaderboard tracks review and retagging progress for both tabs using the same underlying `true_subtype` decision model.

#### Per-Country Validation View

Clicking a run opens a dedicated full-screen view scoped to that country. The current implementation keeps the original two-tab structure:

```text
┌─ Spain — Unknowns Review ───────────────────────────────────────┐
│  [Unknown Validation 120]   [Missing Subtypes 38]              │
│  47 / 120 reviewed · 19 / 120 retagged                         │
│  [Export CSV] [Publish Retagged]                               │
└─────────────────────────────────────────────────────────────────┘
```

##### Tab 1: Unknown Validation

This tab shows records where `pred_subtype_2 === 'unknown'`. The operator decides whether each record is genuinely underspecified or whether the classifier should have produced a usable subtype decision.

**Top-level filters**

```text
[All] [Unreviewed] [Real Unknown] [False Unknown]
```

**Current table columns**

| Column | Content |
|---|---|
| Request ID | Record identifier |
| Attributes | Full JSON cell with copy button; original/EN toggle |
| Metadata | Full JSON cell with copy button; original/EN toggle |
| Pred Subtype 1 | Stage-1 subtype candidate |
| Fewshots | Nearby subtype hints supplied to GPT |
| GPT Verdict | Structured GPT decision badge plus reasoning |
| GPT Subtype | Suggested mapped subtype, suggested missing subtype, or `unknown` |
| True Subtype | Searchable combobox storing the human decision |

The current table is dense and spreadsheet-like rather than card-based. It supports text filters, sorting, row-height toggles, and a grid drill-down from the Unknowns type-health summary.

**Per-record actions**

| Action | Effect |
|---|---|
| Ask GPT | `POST /api/ask-gpt` in `judge_mode`, with `predicted_status = "unknown"` |
| Accept GPT | Copies GPT's suggested subtype into `true_subtype` when one exists |
| Retag | Manual searchable subtype chooser -> `PUT /api/validation` |

**Bulk actions**

| Action | Scope |
|---|---|
| Ask GPT | Runs GPT across all currently filtered, unreviewed records |
| Accept GPT | Applies GPT suggestions for all currently filtered reviewed records |
| Export CSV | Downloads the run CSV with updated `true_subtype` values |
| Publish Retagged | Copies the exported run into Postgres as a `_retagged` table |

##### Tab 2: Missing Subtypes

This tab shows records where `pred_subtype_2 === 'missing'`. The operator reviews classifier-proposed subtype labels that are outside the country's allowed taxonomy and decides how each record should be represented in `true_subtype`.

The backend still exposes these records grouped by candidate `missing_subtype`, but the current UI **flattens the groups into a record-level table**. The operator works record-by-record rather than issuing one decision per candidate label.

**Top-level filters**

```text
[All] [Unreviewed] [Tagged] [Missing]
```

In the shipped UI, these filters mean:

- `All`: all missing-subtype records for the run
- `Unreviewed`: no saved GPT result yet
- `Tagged`: `true_subtype` is set to an existing subtype
- `Missing`: `true_subtype === "Missing"`

There is currently no dedicated per-candidate Accept / Map / Reject object model in the UI.

**Current table columns**

| Column | Content |
|---|---|
| Request ID | Record identifier |
| Attributes | Full JSON cell with copy button; original/EN toggle |
| Metadata | Full JSON cell with copy button; original/EN toggle |
| Pred Subtype 1 | Stage-1 subtype candidate |
| Missing Subtype | The classifier-proposed out-of-taxonomy label |
| GPT Verdict | Structured GPT decision badge plus reasoning |
| GPT Subtype | Clickable GPT suggestion pill when a suggested decision exists |
| True Subtype | Searchable combobox storing the human decision |

**Per-record actions**

| Action | Effect |
|---|---|
| Ask GPT | `POST /api/ask-gpt` in `judge_mode`, with `predicted_status = "missing"` |
| Accept GPT | Applies GPT's suggested mapped subtype, `Missing`, or `unknown` to the record |
| Retag | Manual searchable subtype chooser -> `PUT /api/missing-subtypes` |

**Storage**

The current implementation stores missing-subtype decisions the same way as unknown-validation retagging: by writing `true_subtype` back to the source run data. There is no separate `missing_subtype_decisions.json` store in the shipped code path.

**API**

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/missing-subtypes?run_id=X` | Returns grouped candidates, each with nested record rows |
| `PUT` | `/api/missing-subtypes` | Saves a record-level decision `{ run_id, request_id, true_subtype }` |
| `GET` | `/api/gpt-results?run_id=X` | Loads saved GPT review payloads for the tab |
| `PUT` | `/api/gpt-results` | Persists GPT review payloads keyed by request ID |

### Feedback Loop

The two tabs still drive **taxonomy evolution**, but in the current implementation they do so through a shared review-and-retag workflow:

- **Unknown Validation tab**: false-unknown patterns surface recall failures and help tune stage-2 prompting and subtype mapping.
- **Missing Subtypes tab**: repeated `Missing` decisions and repeated mapped retags identify taxonomy blindspots and candidate labels worth formalising later in `subtypes-by-country.json`.

The Unknowns benchmark closes the loop: every run surfaces both the classifier's recall gaps (unknowns) and its taxonomy blindspots (missing subtypes), and both tabs feed back through the same persisted artifacts: GPT review payloads plus human-written `true_subtype` values in the run data.

---

## Prompt Rendering Helper (pseudocode)

```python
def render_stage1(domain_name, domain_instructions_stage1, allowed_subtypes, attributes, metadata):
    allowed_subtypes_list = "\n".join(f"- {s}" for s in allowed_subtypes)
    system = STAGE1_SYSTEM.format(
        domain_name=domain_name,
        domain_instructions=domain_instructions_stage1,
        allowed_subtypes_list=allowed_subtypes_list,
    )
    user = STAGE1_USER.format(
        attributes=attributes,
        metadata=metadata,
    )
    return [{"role": "system", "content": system},
            {"role": "user",   "content": user}]


def render_stage2(domain_name, domain_instructions_stage2, allowed_subtypes,
                  stage1_subtype, candidate_label, stage1_reason, key_signals,
                  nearest_subtypes):
    allowed_subtypes_list = "\n".join(f"- {s}" for s in allowed_subtypes)
    system = STAGE2_SYSTEM.format(
        domain_name=domain_name,
        domain_instructions=domain_instructions_stage2,
        allowed_subtypes_list=allowed_subtypes_list,
    )
    user = STAGE2_USER.format(
        candidate_subtype=candidate_label or stage1_subtype,
        candidate_reason=stage1_reason,
        key_signals=key_signals,
        nearest_subtypes=nearest_subtypes,
    )
    return [{"role": "system", "content": system},
            {"role": "user",   "content": user}]
```

---

## vLLM Prefix Caching Notes

- **Batching**: Group records by `(allowed_subtypes_fingerprint)` before sending to vLLM. Records sharing the same rendered system prompt will hit the prefix cache on the second+ call in the batch.
- **Stage 1 cache key**: `hash(STAGE1_SYSTEM.format(domain_name, domain_instructions, allowed_subtypes_list))` — identical for all records in the same country batch.
- **Stage 2 cache key**: `hash(STAGE2_SYSTEM.format(domain_name, domain_instructions, allowed_subtypes_list))` — same scope as Stage 1 but only materialised for flagged records.
- command-r context window is large enough to hold the full allowed list + instructions in the system prompt without truncation risk.

---

## Response Parsing

### Stage 1 parser

```python
import re

def parse_stage1(response_text, allowed_subtypes_set):
    subtype_match  = re.search(r"^SUBTYPE:\s*(.+)$", response_text, re.MULTILINE)
    reason_match   = re.search(r"^REASON:\s*(.+)$",  response_text, re.MULTILINE)
    signals_match  = re.search(r"^SIGNALS:\s*(.+)$", response_text, re.MULTILINE)
    raw_subtype = subtype_match.group(1).strip() if subtype_match else "unknown"
    reason      = reason_match.group(1).strip()  if reason_match  else ""
    signals     = signals_match.group(1).strip() if signals_match else "N/A"

    # Handle "missing_subtype | <proposed label>"
    candidate_label = None
    if raw_subtype.startswith("missing_subtype"):
        parts = raw_subtype.split("|", 1)
        subtype = "missing_subtype"
        candidate_label = parts[1].strip() if len(parts) > 1 else ""
    elif raw_subtype in allowed_subtypes_set or raw_subtype == "unknown":
        subtype = raw_subtype
    else:
        # Model output something outside the list — treat as unknown for safety
        subtype = "unknown"

    return subtype, candidate_label, reason, signals
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
    allowed_set = set(allowed_subtypes)

    # Stage 1 — constrained to allowed list; Stage 2 called only if needed
    messages1 = render_stage1(domain_name, domain_instructions_stage1,
                               allowed_subtypes,
                               record["attributes"],
                               record["metadata"])
    # max_new_tokens=120 covers "SUBTYPE: <label>\nREASON: <text>\nSIGNALS: <pairs>"
    resp1 = llm_client.chat(messages1, max_new_tokens=120, temperature=0)
    stage1_subtype, candidate_label, stage1_reason, key_signals = parse_stage1(resp1, allowed_set)

    # Fast path: Stage 1 resolved to a valid allowed label — skip Stage 2
    if stage1_subtype not in ("unknown", "missing_subtype"):
        return {"subtype": stage1_subtype}

    # Slow path: Stage 1 flagged unknown or missing — run Stage 2 for validation
    nearest_subtypes = extract_nearest_subtypes(retrieved_fewshots)
    messages2 = render_stage2(domain_name, domain_instructions_stage2,
                               allowed_subtypes,
                               stage1_subtype, candidate_label or stage1_subtype,
                               stage1_reason, key_signals, nearest_subtypes)
    resp2 = llm_client.chat(messages2, max_new_tokens=40, temperature=0)
    final_label = parse_stage2(resp2)

    if final_label == "missing_subtype":
        return {
            "subtype": "missing_subtype",
            "suggested_label": candidate_label or stage1_subtype,
            "reason": stage1_reason,
            "signals": key_signals,
        }
    return {"subtype": final_label}
```

---

## Acceptance Criteria

1. Each LLM call is a `[system, user]` message pair — no combined single-turn prompts.
2. All prompt strings are Python `str` literals usable with `.format(**kwargs)`.
3. Domain Instructions are split into two blocks: Stage 1 (record interpretation) and Stage 2 (label grounding). Both must be replaced when adapting to a new domain.
4. Few-shots are NOT injected into Stage 1. Retrieved nearest subtype labels are passed as hints to Stage 2 only when Stage 2 is invoked.
5. Stage 2 is invoked **only** when Stage 1 outputs `unknown` or `missing_subtype`. Records resolved to a valid allowed label in Stage 1 skip Stage 2 entirely.
6. The pipeline outputs one of: an allowed subtype label, `"unknown"`, or `"missing_subtype"` (with `suggested_label` from Stage 1).
7. Stage 1 total response budget is `max_new_tokens=120`; covers the label (~10 tokens), reason (~50 tokens), and signals (~40 tokens).
8. Both LLM calls use `temperature=0` (greedy decoding) — recommended by Cohere for classification tasks and ensures deterministic output format.
9. Stage 1 system prompt is static per country batch (domain + allowed list) — no per-record variation — enabling vLLM prefix cache reuse within the batch.
10. Missing subtypes are detected via the `missing_subtype` keyword from Stage 1 (and confirmed/mapped by Stage 2). The Stage 1 candidate label is preserved as `suggested_label`.
