# Unknowns Benchmark — Review Flow

## Background

The two-stage classifier handles records it cannot confidently classify in two ways:

- **Unknown** (`pred_subtype_2 = 'unknown'`): the classifier had insufficient signal to pick any subtype. The record is genuinely ambiguous or underspecified.
- **Missing subtype** (`pred_subtype_2 = 'missing'`, `missing_subtype = '<candidate>'`): the classifier identified what the record probably is, but that label does not exist in the country's allowed subtype taxonomy. It might be a new subtype, or it might be a classifier hallucination.

Both categories require human review. The Unknowns benchmark is the tool for that.

---

## Step 1 — Start from the Leaderboard

The Unknowns benchmark leaderboard shows one row per country run. Each row summarises how many records were classified as unknown or missing-subtype.

Click a row to open the per-country review view.

---

## Step 2 — Tab 1: Unknown Validation

This tab shows every record the classifier could not label confidently.

### What you are deciding

For each record you answer: **Is this record genuinely unknown, or did the classifier fail?**

| GPT verdict | Meaning |
|---|---|
| `truly_unknown` | The record lacks enough information to classify. The classifier was right to abstain. |
| `wrong_subtype` | The classifier had enough signal but picked no label. A correct label exists in the taxonomy. |
| `missing_but_mappable` | The record is close to an existing subtype; the classifier should have mapped it there. |
| `true_missing_subtype` | The record represents a genuinely new subtype not in the taxonomy. |

### The flow

1. **Ask GPT** — click "Ask GPT" on a single record, or use the bulk button. GPT-4o (as judge) analyses the record's attributes and metadata and returns one of the four verdicts above.
2. **Read the verdict** — the verdict appears next to each record. No action required if you agree.
3. **Filter by outcome** — use the tabs at the top:
   - **Real Unknown** — shows `truly_unknown` records. These are expected and correct; no further action needed.
   - **False Unknown** — shows `wrong_subtype` and `missing_but_mappable` records. These represent classifier errors. You can optionally set the correct `true_subtype` via the retag dropdown, which writes the corrected label back to the run data.
4. **Retag (optional)** — for false unknowns, selecting a subtype from the dropdown saves a corrected label. This data informs future classifier instruction tuning.

### Progress bar

Shows: `N reviewed / total · N real unknown · N false unknown · N pending`.

A record counts as reviewed once GPT has given a verdict or you have manually set a verdict.

---

## Step 3 — Tab 2: Missing Subtypes

This tab shows candidates the classifier invented — labels it emitted as `missing_subtype` that are not in the current taxonomy.

### What you are deciding

For each candidate you answer: **Should this label be added to the taxonomy, mapped to an existing one, or discarded?**

### The flow

Candidates are grouped by label and sorted by record count (most common first). For each group:

1. **Expand** the group to read the actual records that triggered this candidate label.
2. **Choose an action:**

   | Action | Meaning |
   |---|---|
   | **Accept** | This is a real new subtype. It should be added to the country's taxonomy. |
   | **Map to existing** | This label is semantically close to an existing subtype; records should be classified under that existing label instead. Pick the target from the searchable dropdown. |
   | **Reject** | This is a classifier hallucination or error. The candidate label is not meaningful and should be ignored. |

3. Decisions are saved immediately to `data/missing_subtype_decisions.json`.

### Filter tabs

Use the tabs (All / Unreviewed / Accepted / Mapped / Rejected) to focus on what still needs a decision.

---

## Step 4 — Acting on Decisions

Decisions made in the two tabs feed back into the system differently:

| Source | Decision | Next action |
|---|---|---|
| Unknown Validation | `truly_unknown` | No action; expected classifier behaviour |
| Unknown Validation | `wrong_subtype` / `missing_but_mappable` | Corrected labels used for classifier fine-tuning |
| Missing Subtypes | Accept | Add the new label to `subtypes-by-country.json` for the relevant country |
| Missing Subtypes | Map to existing | Update the classifier prompt or taxonomy alias table to fold the candidate into the target subtype |
| Missing Subtypes | Reject | No action; classifier prompt may need tightening to avoid hallucinating this label |

---

## Summary

```
Leaderboard (one row per country)
  └─ Select a run
       ├─ Tab 1: Unknown Validation
       │    ├─ Ask GPT per record (or bulk)
       │    ├─ Read verdict: truly_unknown / wrong_subtype / missing_but_mappable
       │    └─ Retag false unknowns (optional) → saved to run CSV/DB
       │
       └─ Tab 2: Missing Subtypes
            ├─ Review grouped candidates (sorted by frequency)
            └─ Accept / Map / Reject → saved to missing_subtype_decisions.json
```
