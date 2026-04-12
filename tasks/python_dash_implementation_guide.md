# Python/Dash Implementation Guide
## Classification Evaluation & Analysis System

> **How to use this file:** Feed this guide alongside `prd-classification-eval-analysis-system.md`
> and `confusion_matrix_dash_guide.md` to Claude (VS Code extension) when building the app.
> This file focuses on **how** to translate the PRD into Python/Dash while preserving the
> look and feel of the original React app.

---

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Web framework | `dash >= 2.16` | Component model, callbacks, built-in Plotly |
| Data tables | `dash.dash_table.DataTable` (built-in) | Bundled inside `dash` itself — zero extra downloads; sortable, filterable, paginated |
| Visualizations | `plotly` — `go.Scatter` + shapes | See `confusion_matrix_dash_guide.md` |
| Data layer | `pandas` + CSV / `psycopg2` for Postgres | Mirrors the Node.js dual-backend in the PRD |
| Styling | Inline `style={}` dicts + `assets/styles.css` | No CDN; full air-gap compatibility |

> **Why not `dash-ag-grid`?** AG Grid loads additional JavaScript bundles from the network at runtime even when installed via pip. `dash.dash_table.DataTable` is entirely self-contained within the `dash` wheel — nothing extra is fetched, making it the correct choice for air-gapped machines.

### Offline install order
```bash
pip install dash plotly pandas numpy psycopg2-binary python-dotenv
```
Or transfer wheels as described in `confusion_matrix_dash_guide.md`.

---

## 2. Project Structure

```
project/
├── app.py                  # Dash app entry point
├── data/
│   ├── leaderboard.csv
│   └── runs/
│       └── {benchmark_id}_{run_name}.csv
├── server/
│   ├── loader.py           # CSV / Postgres loader (polymorphic)
│   └── metrics.py          # F1, confusion matrix computation
├── components/
│   ├── leaderboard.py      # Leaderboard table component
│   ├── confusion_matrix.py # go.Scatter + shapes matrix builder
│   ├── transition_matrix.py
│   └── record_table.py     # dash_table.DataTable record table
├── assets/
│   └── styles.css          # Global CSS overrides (no CDN)
└── .env
```

---

## 3. Visual Design System

This is the most critical section. The goal is to match the React app's look exactly.

### 3.1 Color Palette (define as Python constants)

```python
# colors.py — import this everywhere
COLORS = {
    "bg_page":       "#f8f9fc",
    "bg_card":       "#ffffff",
    "bg_header":     "#1e1e2e",
    "border":        "#e5e7eb",
    "text_primary":  "#111827",
    "text_secondary":"#6b7280",
    "text_muted":    "#9ca3af",
    "accent_blue":   "#3b82f6",
    "green_strong":  "#16a34a",
    "amber":         "#d97706",
    "red":           "#dc2626",
    # Matrix diagonal (correct predictions)
    "matrix_diag_hi":"rgba(22, 163, 74, 0.85)",
    "matrix_diag_lo":"rgba(187, 247, 208, 0.6)",
    # Matrix off-diagonal (errors)
    "matrix_err_hi": "rgba(220, 38, 38, 0.85)",
    "matrix_err_lo": "rgba(254, 226, 226, 0.5)",
    # Transition matrix
    "trans_a_only":  "#3b82f6",   # Run A correct, B wrong
    "trans_b_only":  "#16a34a",   # Run B correct, A wrong
    "trans_both_bad":"#dc2626",   # Both wrong
    "trans_neutral": "#f3f4f6",   # Both correct / no change
}
```

### 3.2 Typography (system fonts, no CDN)

```python
FONTS = {
    "body":  "Segoe UI, system-ui, -apple-system, sans-serif",
    "mono":  "Consolas, 'Courier New', monospace",
    "size":  {
        "xs": "11px", "sm": "12px", "base": "13px",
        "md": "14px", "lg": "16px", "xl": "18px", "2xl": "22px"
    }
}
```

### 3.3 Card / Panel style (reuse everywhere)

```python
CARD_STYLE = {
    "background": "#ffffff",
    "borderRadius": "10px",
    "border": "1px solid #e5e7eb",
    "boxShadow": "0 1px 6px rgba(0,0,0,0.06)",
    "padding": "20px",
    "marginBottom": "16px",
}

SECTION_HEADER_STYLE = {
    "fontSize": "13px",
    "fontWeight": "700",
    "letterSpacing": "0.08em",
    "textTransform": "uppercase",
    "color": "#6b7280",
    "marginBottom": "12px",
    "fontFamily": FONTS["body"],
}
```

---

## 4. Page Layout

Build the full page in `app.py` as one `html.Div`. Never navigate away — use
`dcc.Store` to hold state and callbacks to swap panel content.

```python
app.layout = html.Div(style={"background": COLORS["bg_page"], "minHeight": "100vh",
                               "fontFamily": FONTS["body"], "padding": "24px"}, children=[

    # ── State stores ──────────────────────────────────────────────────────────
    dcc.Store(id="store-selected-benchmark"),
    dcc.Store(id="store-selected-runs"),        # list of 0/1/2 run IDs
    dcc.Store(id="store-matrix-cell"),          # clicked type-pair cell
    dcc.Store(id="store-subtype-cell"),         # clicked subtype cell
    dcc.Store(id="store-filter-mode"),          # "all" | "incorrect"

    # ── Top bar ───────────────────────────────────────────────────────────────
    html.Div(style={"display": "flex", "alignItems": "center",
                    "marginBottom": "20px", "gap": "16px"}, children=[
        html.H1("Classification Evaluation & Analysis",
                style={"fontSize": FONTS["size"]["xl"], "fontWeight": "700",
                       "color": COLORS["text_primary"], "margin": "0"}),
        dcc.Dropdown(
            id="benchmark-selector",
            placeholder="Select benchmark…",
            clearable=False,
            style={"width": "260px", "fontSize": FONTS["size"]["sm"]},
        ),
    ]),

    # ── Leaderboard card ──────────────────────────────────────────────────────
    html.Div(id="leaderboard-panel", style=CARD_STYLE),

    # ── Filter toolbar (shown when a run is selected) ─────────────────────────
    html.Div(id="filter-toolbar", style={"display": "none", "marginBottom": "12px"}),

    # ── Matrix panel (confusion or transition, swapped by callback) ───────────
    html.Div(id="matrix-panel", style=CARD_STYLE),

    # ── Record table (shown when a matrix cell is clicked) ────────────────────
    html.Div(id="record-table-panel", style={**CARD_STYLE, "display": "none"}),
])
```

---

## 5. Leaderboard Component

Use `dash.dash_table.DataTable` for the leaderboard. It is fully bundled inside
the `dash` wheel — no extra downloads, no CDN, fully air-gap safe.

> **Column reordering:** `DataTable` does not support drag-to-reorder columns.
> Sorting (click header) and per-column resizing (drag right edge) are both
> supported natively. Column reordering is the only PRD feature that requires a
> workaround: add `↑` / `↓` buttons in a small toolbar above the table, or simply
> omit it and note the limitation in the app.

```python
# components/leaderboard.py
from dash import dash_table, html
from colors import COLORS, FONTS, CARD_STYLE, SECTION_HEADER_STYLE

LEADERBOARD_COLUMNS = [
    {"name": "#",                   "id": "rank",              "type": "numeric"},
    {"name": "Run",                 "id": "run_name"},
    {"name": "Model Version",       "id": "model_version"},
    {"name": "Date",                "id": "date_display"},       # pre-formatted DD/MM/YYYY + relative
    {"name": "Subtype Acc",         "id": "subtype_accuracy",   "type": "numeric",
     "format": dash_table.FormatTemplate.percentage(1)},
    {"name": "Subtype F1",          "id": "subtype_f1_weighted","type": "numeric",
     "format": dash_table.Format(precision=4, scheme=dash_table.Format.Scheme.fixed)},
    {"name": "Type F1",             "id": "type_f1_weighted",   "type": "numeric",
     "format": dash_table.Format(precision=4, scheme=dash_table.Format.Scheme.fixed)},
    {"name": "Size",                "id": "benchmark_length",   "type": "numeric"},
]

def make_leaderboard(rows: list[dict]) -> dash_table.DataTable:
    return dash_table.DataTable(
        id="leaderboard-grid",
        columns=LEADERBOARD_COLUMNS,
        data=rows,
        sort_action="native",
        filter_action="none",
        row_selectable="multi",
        selected_rows=[],
        page_action="none",          # show all rows (leaderboard is small)
        style_table={
            "overflowX": "auto",
            "fontFamily": FONTS["body"],
            "fontSize": FONTS["size"]["sm"],
        },
        style_header={
            "backgroundColor": COLORS["bg_page"],
            "color": COLORS["text_secondary"],
            "fontWeight": "600",
            "fontSize": FONTS["size"]["xs"],
            "textTransform": "uppercase",
            "letterSpacing": "0.06em",
            "border": f"1px solid {COLORS['border']}",
            "padding": "8px 10px",
            "cursor": "pointer",     # signals clickable sort
        },
        style_data={
            "color": COLORS["text_primary"],
            "backgroundColor": COLORS["bg_card"],
            "border": f"1px solid {COLORS['border']}",
            "fontSize": FONTS["size"]["sm"],
        },
        style_data_conditional=[
            {   # Highlight selected rows
                "if": {"state": "selected"},
                "backgroundColor": "#eff6ff",
                "border": f"1px solid {COLORS['accent_blue']}",
                "color": COLORS["text_primary"],
            },
            {   # Metric columns: right-align
                "if": {"column_type": "numeric"},
                "textAlign": "right",
                "fontFamily": FONTS["mono"],
            },
        ],
        style_cell={
            "padding": "8px 10px",
            "minWidth": "60px",
            "textOverflow": "ellipsis",
            "overflow": "hidden",
            "whiteSpace": "nowrap",
        },
        style_cell_conditional=[
            {"if": {"column_id": "rank"},         "width": "48px"},
            {"if": {"column_id": "run_name"},      "minWidth": "200px"},
            {"if": {"column_id": "date_display"},  "width": "140px"},
        ],
        css=[{"selector": ".dash-spreadsheet td.cell--selected, .dash-spreadsheet td.focused",
              "rule": "background-color: #eff6ff !important; border: 1px solid #3b82f6 !important;"}],
    )
```

### Leaderboard callback (row selection → run selection)

```python
@app.callback(
    Output("store-selected-runs", "data"),
    Input("leaderboard-grid", "selected_rows"),
    State("leaderboard-grid", "data"),
    prevent_initial_call=True,
)
def on_leaderboard_select(selected_row_indices, table_data):
    if not selected_row_indices or not table_data:
        return []
    # Limit to 2 runs (PRD requirement)
    return [table_data[i]["run_id"] for i in selected_row_indices[:2]]
```

> **Single-click vs checkbox behaviour:** `DataTable` with `row_selectable="multi"` uses
> checkboxes for multi-select. To match the React app's behaviour (row click = single-run
> mode, checkbox = up to 2 runs), use `row_selectable="multi"` and cap at 2 in the
> callback. The first checked row drives confusion mode; adding a second drives transition
> mode. Use `selected_row_ids` (requires an `id` column) instead of `selected_rows` if you
> want stable references across sorts.

---

## 6. Confusion Matrix Panel

See `confusion_matrix_dash_guide.md` for the full `build_confusion_matrix_figure()` function.
Below is the Dash wiring that connects everything per the PRD.

### 6.1 F1 row above the matrix

Embed the F1 badges **inside the Plotly figure** as annotations at `y = -0.8`
(just above the top axis) so they stay aligned with columns even when the
figure is resized:

```python
for j, (label, f1) in enumerate(zip(col_labels, col_f1_scores)):
    color = "#16a34a" if f1 >= 0.8 else ("#d97706" if f1 >= 0.5 else "#dc2626")
    annotations.append(dict(
        x=j, y=-0.8,
        text=f"<b>{f1:.0%}</b>",
        showarrow=False,
        font=dict(size=10, color="white", family=FONTS["mono"]),
        bgcolor=color,
        borderpad=3,
        borderradius=3,
        xref="x", yref="y",
    ))
```

### 6.2 Diagonal triangle marker

Add a small SVG triangle in the top-right corner of diagonal cells using a
second scatter trace with marker symbol `"triangle-up"`:

```python
fig.add_trace(go.Scatter(
    x=[i + 0.38 for i in range(n)],
    y=[i - 0.38 for i in range(n)],
    mode="markers",
    marker=dict(symbol="triangle-up", size=8,
                color=COLORS["green_strong"], opacity=0.7),
    hoverinfo="skip",
    showlegend=False,
))
```

### 6.3 Asymmetry arrow annotation

For off-diagonal cell `(i, j)` where `matrix[i][j] >= 3` and
`matrix[i][j] > 2 * matrix[j][i]`, add an arrow annotation:

```python
if i != j and value >= 3 and value > 2 * matrix[j][i]:
    annotations.append(dict(
        x=j + 0.3, y=i,
        text="→",
        showarrow=False,
        font=dict(size=10, color="#6b7280"),
        xref="x", yref="y",
    ))
```

### 6.4 Low-support warning

For rows where `row_sums[i] < 10`, add a `⚠` to the y-axis tick label:

```python
ytick_labels = [
    f"⚠ {lbl}" if row_sums[i] < 10 else lbl
    for i, lbl in enumerate(row_labels)
]
```

### 6.5 Drill-down callback chain

```
click type matrix cell
  → store-matrix-cell updated
    → subtype matrix rendered
      → click subtype matrix cell
        → store-subtype-cell updated
          → record table filtered & shown
```

```python
@app.callback(
    Output("store-matrix-cell", "data"),
    Input("type-confusion-matrix", "clickData"),
    prevent_initial_call=True,
)
def on_type_cell_click(click_data):
    if not click_data:
        return None
    pt = click_data["points"][0]
    return {"true_type": pt["customdata"][0], "pred_type": pt["customdata"][1]}


@app.callback(
    Output("subtype-matrix-container", "children"),
    Input("store-matrix-cell", "data"),
    State("store-selected-runs", "data"),
    State("store-filter-mode", "data"),
    prevent_initial_call=True,
)
def render_subtype_matrix(cell, run_ids, filter_mode):
    if not cell or not run_ids:
        return html.P("Click a cell above to drill into subtypes.",
                      style={"color": COLORS["text_muted"], "padding": "20px"})
    matrix, labels, f1_scores = compute_subtype_matrix(
        run_ids[0], cell["true_type"], cell["pred_type"],
        incorrect_only=(filter_mode == "incorrect")
    )
    fig = build_confusion_matrix_figure(matrix, labels, f1_scores)
    return dcc.Graph(figure=fig, id="subtype-confusion-matrix",
                     config={"displayModeBar": False})
```

---

## 7. Transition Matrix

Shown when exactly 2 runs are selected in the leaderboard.

### Color coding per cell

```python
def transition_cell_color(run1_correct: bool, run2_correct: bool, count: int) -> str:
    if count == 0:
        return "rgba(245,245,245,1)"
    if run1_correct and not run2_correct:
        return f"rgba(59,130,246,{min(0.3 + count/50, 0.9):.2f})"   # blue
    if run2_correct and not run1_correct:
        return f"rgba(22,163,74,{min(0.3 + count/50, 0.9):.2f})"    # green
    if not run1_correct and not run2_correct:
        return f"rgba(220,38,38,{min(0.3 + count/50, 0.9):.2f})"    # red
    return f"rgba(156,163,175,{min(0.1 + count/100, 0.4):.2f})"     # neutral
```

### Net delta badge

Add as a Plotly annotation at position `(n-0.4, -0.6)`:

```python
delta = run2_correct_total - run1_correct_total
badge_text = f"▲ +{delta}" if delta >= 0 else f"▼ {delta}"
badge_color = COLORS["green_strong"] if delta >= 0 else COLORS["red"]
annotations.append(dict(
    x=n - 0.5, y=-0.7,
    text=f"<b>{badge_text}</b>",
    showarrow=False,
    font=dict(size=11, color="white"),
    bgcolor=badge_color,
    borderpad=4, borderradius=4,
    xref="x", yref="y",
))
```

### Min-changed stepper

```python
html.Div([
    html.Label("Min changed:", style={"fontSize": FONTS["size"]["sm"],
                                       "color": COLORS["text_secondary"]}),
    dcc.Input(
        id="min-changed-stepper",
        type="number", min=1, max=999, step=1, value=1,
        debounce=True,
        style={"width": "70px", "marginLeft": "8px", "borderRadius": "6px",
               "border": f"1px solid {COLORS['border']}", "padding": "4px 8px",
               "fontSize": FONTS["size"]["sm"]},
    ),
])
```

---

## 8. Record Table

Use `dash.dash_table.DataTable` for the row-level records table. It is bundled
inside `dash` — no external resources, fully air-gap safe.

```python
from dash import dash_table
from colors import COLORS, FONTS

def make_record_table(show_run2=False, run1_name="Run 1", run2_name="Run 2"):
    if show_run2:
        columns = [
            {"name": ["",          "Request ID"],    "id": "request_id"},
            {"name": ["True",      "Type"],          "id": "true_type"},
            {"name": ["True",      "Subtype"],       "id": "true_subtype"},
            {"name": [run1_name,   "Pred Type"],     "id": "pred_type"},
            {"name": [run1_name,   "Pred Subtype"],  "id": "pred_subtype"},
            {"name": [run2_name,   "Pred Type"],     "id": "run2_pred_type"},
            {"name": [run2_name,   "Pred Subtype"],  "id": "run2_pred_subtype"},
            {"name": ["Details",   "Attributes"],    "id": "attributes_short"},
            {"name": ["Details",   "Metadata"],      "id": "metadata_short"},
        ]
    else:
        columns = [
            {"name": "Request ID",     "id": "request_id"},
            {"name": "True Type",     "id": "true_type"},
            {"name": "Pred Type",     "id": "pred_type"},
            {"name": "True Subtype",  "id": "true_subtype"},
            {"name": "Pred Subtype",  "id": "pred_subtype"},
            {"name": "Attributes",    "id": "attributes_short"},
            {"name": "Metadata",      "id": "metadata_short"},
        ]

    return dash_table.DataTable(
        id="record-table",
        columns=columns,
        data=[],
        merge_duplicate_headers=True,   # collapses the grouped header rows
        sort_action="native",
        filter_action="native",         # per-column text filter built-in
        page_action="native",
        page_size=20,
        style_table={"overflowX": "auto", "fontFamily": FONTS["body"]},
        style_header={
            "backgroundColor": COLORS["bg_page"],
            "color": COLORS["text_secondary"],
            "fontWeight": "600",
            "fontSize": FONTS["size"]["xs"],
            "textTransform": "uppercase",
            "letterSpacing": "0.06em",
            "border": f"1px solid {COLORS['border']}",
            "padding": "6px 10px",
        },
        style_data={
            "color": COLORS["text_primary"],
            "backgroundColor": COLORS["bg_card"],
            "border": f"1px solid {COLORS['border']}",
            "fontSize": FONTS["size"]["sm"],
            "whiteSpace": "normal",   # allows wrapping; controlled by row-height buttons
        },
        style_filter={
            "backgroundColor": "#f8f9fc",
            "fontSize": "11px",
            "border": f"1px solid {COLORS['border']}",
        },
        style_cell={
            "padding": "6px 10px",
            "minWidth": "80px",
            "maxWidth": "300px",
            "overflow": "hidden",
            "textOverflow": "ellipsis",
        },
        style_cell_conditional=[
            {"if": {"column_id": "attributes_short"}, "minWidth": "200px", "maxWidth": "400px"},
            {"if": {"column_id": "metadata_short"},    "minWidth": "200px", "maxWidth": "400px"},
        ],
        style_data_conditional=[
            {   # highlight rows where prediction is wrong (single-run)
                "if": {"filter_query": "{true_subtype} ne {pred_subtype}"},
                "backgroundColor": "rgba(254,226,226,0.4)",
            },
        ],
        tooltip_data=[],    # populated dynamically in callback with full JSON
        tooltip_duration=None,
    )
```

### 8.1 JSON truncation + tooltip approach (air-gap safe)

Pre-process records before passing to `data=` to add short display strings and
full JSON in the tooltip:

```python
import json

def prepare_record_rows(records: list[dict]) -> tuple[list[dict], list[dict]]:
    """Returns (table_data, tooltip_data) ready for DataTable."""
    rows = []
    tooltips = []
    for r in records:
        attrs_str = json.dumps(r.get("attributes", {}), indent=2)
        meta_str  = json.dumps(r.get("metadata",   {}), indent=2)
        rows.append({
            **r,
            "attributes_short": attrs_str[:80] + ("…" if len(attrs_str) > 80 else ""),
            "metadata_short":   meta_str[:80]  + ("…" if len(meta_str)  > 80 else ""),
        })
        tooltips.append({
            "attributes_short": {"value": f"```\n{attrs_str}\n```", "type": "markdown"},
            "metadata_short":   {"value": f"```\n{meta_str}\n```",  "type": "markdown"},
        })
    return rows, tooltips
```

In your callback:

```python
table_data, tooltip_data = prepare_record_rows(records)
# Return both to the DataTable:
# Output("record-table", "data")    → table_data
# Output("record-table", "tooltip_data") → tooltip_data
```

> **Copy button:** `DataTable` does not render arbitrary React inside cells.
> To add a copy button for JSON cells, place a `dcc.Clipboard` component
> *next to* the table that copies the last-clicked row's full JSON stored in
> a `dcc.Store`, or use a simple `clientside_callback` that writes to
> `navigator.clipboard`. The tooltip-on-hover approach above is simpler and
> fully offline.

### 8.2 Row height selector

```python
html.Div([
    html.Span("Row height:", style={"fontSize": FONTS["size"]["xs"],
                                     "color": COLORS["text_secondary"]}),
    *[html.Button(
        label,
        id={"type": "row-height-btn", "index": px},
        n_clicks=0,
        style={"fontSize": "11px", "padding": "2px 8px", "marginLeft": "4px",
               "border": f"1px solid {COLORS['border']}", "borderRadius": "4px",
               "cursor": "pointer", "background": "white"},
    ) for label, px in [("1", 24), ("2", 48), ("3", 72), ("Auto", None)]],
], style={"display": "flex", "alignItems": "center", "marginBottom": "8px"})
```

Row height in `DataTable` is controlled via `style_data`. Update it from
a callback:

```python
@app.callback(
    Output("record-table", "style_data"),
    Input({"type": "row-height-btn", "index": ALL}, "n_clicks"),
    prevent_initial_call=True,
)
def set_row_height(n_clicks_list):
    ctx = dash.callback_context
    triggered = ctx.triggered_id
    px = triggered["index"]
    base = {
        "color": COLORS["text_primary"],
        "border": f"1px solid {COLORS['border']}",
        "fontSize": FONTS["size"]["sm"],
    }
    if px is None:
        return {**base, "whiteSpace": "normal", "height": "auto"}
    return {**base, "whiteSpace": "nowrap", "height": f"{px}px",
            "overflow": "hidden", "textOverflow": "ellipsis"}
```

---

## 9. Most Misclassified Bar

Shown below the subtype matrix. Render as a horizontal bar chart using
`go.Bar` with `orientation="h"`, styled to match:

```python
def most_misclassified_bar(top5: list[tuple[str, int]]) -> go.Figure:
    labels = [t[0] for t in top5]
    counts = [t[1] for t in top5]
    fig = go.Figure(go.Bar(
        y=labels, x=counts, orientation="h",
        marker=dict(color=COLORS["red"], opacity=0.75),
        hovertemplate="%{y}: %{x} errors<extra></extra>",
        customdata=labels,
    ))
    fig.update_layout(
        height=160,
        margin=dict(l=10, r=10, t=10, b=10),
        plot_bgcolor="white", paper_bgcolor="white",
        xaxis=dict(showgrid=False, zeroline=False),
        yaxis=dict(showgrid=False, autorange="reversed"),
        font=dict(family=FONTS["body"], size=11),
        bargap=0.35,
    )
    return fig
```

Clicking a bar should filter the record table to that subtype:

```python
@app.callback(
    Output("store-subtype-cell", "data"),
    Input("misclassified-bar", "clickData"),
    State("store-matrix-cell", "data"),
    prevent_initial_call=True,
)
def on_bar_click(click_data, matrix_cell):
    if not click_data:
        return None
    subtype = click_data["points"][0]["customdata"]
    return {**matrix_cell, "true_subtype": subtype, "pred_subtype": None}
```

---

## 10. Data Layer

### loader.py (polymorphic CSV / Postgres)

```python
import os, json, pandas as pd
from dotenv import load_dotenv
load_dotenv()

DATA_SOURCE = os.getenv("DATA_SOURCE", "csv")

class DataLoader:
    def get_benchmarks(self) -> list[dict]: ...
    def get_leaderboard(self, benchmark_id: str) -> list[dict]: ...
    def get_run_records(self, run_id: str) -> pd.DataFrame: ...

class CSVLoader(DataLoader):
    def __init__(self):
        self._leaderboard = pd.read_csv("data/leaderboard.csv")
        self._runs: dict[str, pd.DataFrame] = {}

    def _load_run(self, run_id: str) -> pd.DataFrame:
        if run_id not in self._runs:
            path = f"data/runs/{run_id}.csv"
            df = pd.read_csv(path)
            df["attributes"] = df["attributes"].apply(json.loads)
            df["metadata"]   = df["metadata"].apply(json.loads)
            self._runs[run_id] = df
        return self._runs[run_id]

    def get_leaderboard(self, benchmark_id):
        df = self._leaderboard[self._leaderboard["benchmark_id"] == benchmark_id]
        return df.sort_values("subtype_f1_weighted", ascending=False).to_dict("records")

class PostgresLoader(DataLoader):
    def __init__(self):
        import psycopg2
        self.conn = psycopg2.connect(
            host=os.getenv("DB_HOST"), dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"), password=os.getenv("DB_PASSWORD"),
        )
    # implement same interface using SQL queries

loader: DataLoader = CSVLoader() if DATA_SOURCE == "csv" else PostgresLoader()
```

---

## 11. Incremental Rendering for Large Matrices

20 types × 20 types = 400 cells. For subtypes (up to 400 × 400 = 160,000 cells),
avoid building all shapes at once. Instead:

1. For the **type matrix** (≤ 20×20): build all shapes at once — fine.
2. For the **subtype matrix**: filter to non-zero rows/columns first, then render.
   Typically this reduces to < 10×10 per type pair.
3. Use `dcc.Loading` wrappers around matrix panels to show a spinner while
   Plotly renders:

```python
dcc.Loading(
    id="loading-subtype",
    type="circle",
    color=COLORS["accent_blue"],
    children=html.Div(id="subtype-matrix-container"),
)
```

---

## 12. Global CSS Overrides (`assets/styles.css`)

Dash auto-serves everything in `assets/`. Use this file to style `DataTable`
and override Dash defaults without any CDN:

```css
/* Remove Dash default focus outline */
.dash-graph:focus { outline: none; }

/* Compact dropdown */
.Select-control { font-size: 13px !important; }

/* Page background */
body { background: #f8f9fc; margin: 0; }

/* DataTable: tighter filter row inputs */
.dash-filter input {
    font-size: 11px !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
}

/* DataTable: hover highlight (DataTable doesn't expose a CSS variable,
   so target the row directly) */
.dash-spreadsheet-container .dash-spreadsheet tbody tr:hover td {
    background-color: #f0f9ff !important;
}

/* DataTable: selected row */
.dash-spreadsheet-container .dash-spreadsheet tbody tr.row--selected td {
    background-color: #eff6ff !important;
    border-color: #3b82f6 !important;
}

/* DataTable: monospace for numeric / JSON columns */
.dash-spreadsheet td[data-dash-column="attributes_short"],
.dash-spreadsheet td[data-dash-column="metadata_short"] {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 11px;
    color: #374151;
}

/* Compact pagination bar */
.previous-next-container { font-size: 12px; }
```

---

## 13. Key Callback Map

| Trigger | Updates | Notes |
|---|---|---|
| `benchmark-selector` value | `leaderboard-panel` | Fetch + render leaderboard |
| `leaderboard-grid` `selected_rows` | `store-selected-runs` | 0 = blank, 1 = confusion, 2 = transition |
| `store-selected-runs` | `matrix-panel`, `filter-toolbar` | Switch matrix mode |
| `type-confusion-matrix` clickData | `store-matrix-cell` | Drill to subtype |
| `store-matrix-cell` | `subtype-matrix-container` | Render subtype matrix |
| `subtype-confusion-matrix` clickData | `store-subtype-cell` | Filter records |
| `store-subtype-cell` | `record-table-panel`, `record-table` `data` + `tooltip_data` | Show + populate table |
| `filter-mode-toggle` value | `store-filter-mode` | Re-render matrices with filter |
| `min-changed-stepper` value | `matrix-panel` (transition only) | Re-render transition matrix |
| `misclassified-bar` clickData | `store-subtype-cell` | Filter records by subtype |
| `row-height-btn` n_clicks | `record-table` `style_data` | Change row height |

---

## 14. Run / Date Display

Parse the `YYYYMMDD` prefix from run names for the leaderboard date column:

```python
import re
from datetime import datetime, date

def parse_run_date(run_name: str) -> tuple[str, str]:
    """Returns (DD/MM/YYYY, relative_label) e.g. ('27/03/2026', '6 days ago')"""
    m = re.match(r"(\d{8})", run_name)
    if not m:
        return "—", ""
    d = datetime.strptime(m.group(1), "%Y%m%d").date()
    delta = (date.today() - d).days
    if delta == 0:   rel = "today"
    elif delta == 1: rel = "yesterday"
    elif delta < 30: rel = f"{delta} days ago"
    elif delta < 60: rel = "a month ago"
    else:            rel = f"{delta // 30} months ago"
    return d.strftime("%d/%m/%Y"), rel
```

---

## 15. Checklist for Claude (VS Code)

When asking Claude to implement, provide these files together:

1. `prd-classification-eval-analysis-system.md` — what to build
2. `confusion_matrix_dash_guide.md` — how to build the matrix visuals
3. `python_dash_implementation_guide.md` (this file) — Python-specific patterns

### Suggested prompt to Claude VS Code:

```
Using the three attached markdown files as your specification, build the
Classification Evaluation & Analysis System as a Python Dash application.

Key priorities:
1. Match the look and feel of the React reference app as closely as possible
2. Use go.Scatter + shapes for all confusion/transition matrices (not go.Heatmap)
3. Use dash.dash_table.DataTable for the leaderboard and record tables (bundled in dash, air-gap safe)
4. Keep everything air-gap compatible — no CDN dependencies
5. Follow the color palette and typography defined in the implementation guide
6. Implement the full callback chain: benchmark → leaderboard → confusion matrix
   → subtype matrix → record table
7. Start with app.py, then components/, then server/loader.py
```
