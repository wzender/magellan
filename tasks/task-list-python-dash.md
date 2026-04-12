# Task List: Python/Dash Implementation
## Classification Evaluation & Analysis System

> **Target directory:** `python/`
> **Reference files:** `prd-classification-eval-analysis-system.md`, `python_dash_implementation_guide.md`, `confusion_matrix_dash_guide.md`
> **Goal:** Replicate the React app's look, feel, and full functionality using Python/Dash.

---

## Phase 1 — Project Scaffold & Dependencies

- [x] **1.1** Create the `python/` project structure:
  ```
  python/
  ├── app.py
  ├── colors.py
  ├── server/
  │   ├── __init__.py
  │   ├── loader.py
  │   └── metrics.py
  ├── components/
  │   ├── __init__.py
  │   ├── leaderboard.py
  │   ├── confusion_matrix.py
  │   ├── transition_matrix.py
  │   └── record_table.py
  ├── assets/
  │   └── styles.css
  └── .env
  ```

- [x] **1.2** Create `python/colors.py` — define `COLORS`, `FONTS`, `CARD_STYLE`, and `SECTION_HEADER_STYLE` constants exactly as specified in `python_dash_implementation_guide.md` §3.

- [x] **1.3** Create `python/.env` with `DATA_SOURCE=csv` default.

---

## Phase 2 — Data Layer (`server/loader.py`)

- [x] **2.1** Implement `CSVLoader` class:
  - On init, read `data/leaderboard.csv` into a pandas DataFrame. Assign sequential integer `run_id` (1-based, matching row order) to each leaderboard entry — this mirrors how `csv-loader.js` assigns `runId = i + 1`.
  - Parse `attributes` and `metadata` columns with `json.loads` for each run file at load time (cache per run_id).
  - Expose `get_benchmarks()` → list of `{id, name}` dicts (unique benchmark_id/benchmark_name pairs, preserving first-seen order).
  - Expose `get_leaderboard(benchmark_id)` → list of dicts sorted by `subtype_f1_weighted` DESC, each row including: `run_id`, `run_name`, `model_version` (from `model_name` column), `subtype_accuracy`, `subtype_f1_weighted`, `benchmark_length` (count of records in the run file).
  - Expose `get_run_records(run_id)` → pandas DataFrame with columns: `request_id`, `true_type`, `true_subtype`, `pred_type`, `pred_subtype`, `attributes` (parsed dict), `metadata` (parsed dict).
  - Run file path convention: `data/runs/{benchmark_id}_{sanitized_run_name}.csv` — apply the same sanitizer as `csv-loader.js`: lowercase, strip leading/trailing `_`, replace non-`[a-z0-9_-]` with `_`.

- [x] **2.2** Add a module-level singleton `loader` in `loader.py`: `loader = CSVLoader() if DATA_SOURCE == "csv" else PostgresLoader()`.

- [x] **2.3** *(Optional / future)* Stub out `PostgresLoader` with `NotImplementedError` on all methods so the interface is in place.

---

## Phase 3 — Metrics & Matrix Computation (`server/metrics.py`)

- [x] **3.1** Implement `compute_f1(matrix_data, label, rows, cols)` → `{f1, precision, recall}` or `None`. Mirror the React `computeF1` logic:
  - `tp = matrix_data[label][label]`
  - `fn = sum of matrix_data[label][c] for c != label`
  - `fp = sum of matrix_data[r][label] for r != label`
  - Return `None` if `tp + fp + fn == 0`.

- [x] **3.2** Implement `sort_labels_by_f1(labels, matrix_data)` → sorted label list (F1 descending, `None` F1 sorts last). Used for both type and subtype matrices.

- [x] **3.3** Implement `get_confusion_matrix(run_id, incorrect_only=False)` → `{type_matrix: {rows, cols, data}, subtype_matrix: [...]}`:
  - Filter records by `run_id`; if `incorrect_only`, keep only rows where `pred_subtype != true_subtype`.
  - Build the type confusion matrix as a nested dict `{true_type: {pred_type: count}}`.
  - Return sorted type labels (same set on both axes, sorted by F1 DESC).

- [x] **3.4** Implement `get_subtype_matrix(run_id, true_type, pred_type, incorrect_only=False)` → `{rows, cols, data}`:
  - Filter records to the given type pair.
  - Build subtype confusion dict.
  - Filter out empty rows/cols.
  - Sort row labels by F1 DESC; cols follow row order for shared labels (diagonal-aligned), then remaining cols appended sorted by F1.

- [x] **3.5** Implement `get_transition_matrix(run_id1, run_id2, min_count=1)` → `{rows, cols, data}`:
  - Join run1 and run2 records on `request_id`.
  - Keep only records where `run1.pred_subtype != run2.pred_subtype`.
  - For each `(run1_pred, run2_pred)` pair, count: `total`, `run1_correct` (run1 pred == true), `run2_correct` (run2 pred == true), `both_wrong`.
  - Apply `min_count` filter: exclude cells where `total < min_count`.
  - Return rows/cols as sorted arrays of subtypes that appear in filtered data.

- [x] **3.6** Implement `get_records(filters)` → `{data: [...], pagination: {total, limit, offset, pages}}`:
  - Support single-run mode: filter by `run_id`, optional `true_type`, `pred_type`, `true_subtype`, `pred_subtype`, `incorrect_only`.
  - Support dual-run mode (transition): filter by `run_id1` + `run_id2`, join on `request_id`, keep only changed predictions, optionally filter by `run1_pred_subtype` / `run2_pred_subtype`. Adds `run2_pred_type` and `run2_pred_subtype` columns to each row.
  - Apply `limit` / `offset` pagination (default limit=100).

---

## Phase 4 — App Entry Point & Layout (`app.py`)

- [x] **4.1** Initialize `dash.Dash(__name__)` with `suppress_callback_exceptions=True`. No external stylesheets.

- [x] **4.2** Build `app.layout` as a single `html.Div` with:
  - Five `dcc.Store` components: `store-benchmark`, `store-selected-runs` (list of ≤2 run_ids), `store-matrix-cell` (clicked type pair), `store-subtype-cell` (clicked subtype pair), `store-filter-mode` (`"all"` | `"incorrect"`).
  - Top bar: app title `html.H1` + `dcc.Dropdown` (`id="benchmark-selector"`, width 260px, no clear button).
  - Leaderboard card: `html.Div(id="leaderboard-panel", style=CARD_STYLE)`.
  - Filter toolbar: `html.Div(id="filter-toolbar")` — hidden initially, shown when a run is selected.
  - Matrix panel: `html.Div(id="matrix-panel", style=CARD_STYLE)`.
  - Record table panel: `html.Div(id="record-table-panel", style={**CARD_STYLE, "display": "none"})`.

- [x] **4.3** Populate benchmark dropdown on load:
  ```python
  @app.callback(Output("benchmark-selector", "options"), Output("benchmark-selector", "value"),
                Input("benchmark-selector", "id"))
  def init_benchmarks(_):
      benchmarks = loader.get_benchmarks()
      opts = [{"label": b["name"], "value": b["id"]} for b in benchmarks]
      return opts, (opts[0]["value"] if opts else None)
  ```

- [x] **4.4** Wire `benchmark-selector` → leaderboard: callback renders the leaderboard `DataTable` inside `#leaderboard-panel` and auto-selects the first run (`store-selected-runs = [first_run_id]`).

- [x] **4.5** Wire `store-selected-runs` → show/hide filter toolbar:
  - 0 runs: hide toolbar.
  - 1 run: show "Incorrect Only" toggle (radio/dropdown).
  - 2 runs: show "Min Changed" stepper (1–999).

- [x] **4.6** Wire `store-selected-runs` + `store-filter-mode` → `matrix-panel`:
  - 0 runs: placeholder "Select 1 or 2 runs to view matrices".
  - 1 run: render confusion matrix layout (type matrix + subtype matrix panels stacked).
  - 2 runs: render transition matrix layout.

---

## Phase 5 — Leaderboard Component (`components/leaderboard.py`)

- [x] **5.1** Create `make_leaderboard(rows)` returning a `dash_table.DataTable` with:
  - `id="leaderboard-grid"`.
  - Columns: `#` (rank), Run, Model Version, Date, Subtype Accuracy (4 decimal), Subtype F1 (4 decimal), Type F1 (shown as `NaN` when missing), Benchmark Size.
  - Date column: pre-process `rows` to add `date_display` (formatted `DD/MM/YYYY + relative label`) by parsing the `YYYYMMDD` prefix from `run_name` using `parse_run_date()` from `python_dash_implementation_guide.md` §14. Fall back to the CSV `run_date` field if the prefix is absent.
  - `sort_action="native"`, `row_selectable="multi"`, `page_action="none"`.
  - Style via inline `style_header`, `style_data`, `style_data_conditional` as shown in the implementation guide §5 — no external CSS class needed.

- [x] **5.2** Callback: `leaderboard-grid` `selected_rows` + `data` State → `store-selected-runs` (cap at 2 run_ids). Enforce the "clicking an already-selected single run keeps it selected" behaviour from the React app (no toggle-off to zero).

- [x] **5.3** Apply visual hint below grid: "Click a row to view its Confusion Matrix. Check up to 2 runs to compare them in the Transition Matrix."

---

## Phase 6 — Confusion Matrix Figure Builder (`components/confusion_matrix.py`)

- [x] **6.1** Implement `build_confusion_matrix_figure(matrix_data, row_labels, col_labels, title="")` → `go.Figure` using `go.Scatter` + shapes (NOT `go.Heatmap`):
  - Normalize per-row for color intensity.
  - Draw rectangle shapes for every cell: green-scale on diagonal, red-scale off-diagonal, near-white `rgba(245,245,245,1)` for zero cells.
  - Add invisible scatter trace for click events with `customdata=[(true_label, pred_label, count), ...]` and hover template `True: %{customdata[0]}<br>Predicted: %{customdata[1]}<br>Count: %{customdata[2]}`.
  - Layout: `xaxis` ticks at top, `-45°` angle; `yaxis` reversed; `plot_bgcolor="white"`; `paper_bgcolor="white"`; dark hover label (`bgcolor="#1e1e2e"`, white font).
  - Figure height: auto-size to `max(300, n * 36 + 120)` px.

- [x] **6.2** Add F1 badge row as Plotly annotations at `y = -0.8` (above the matrix, between the axis and the cells), one per column:
  - Green `#16a34a` for F1 ≥ 80%, amber `#d97706` for 50–80%, red `#dc2626` for < 50%.
  - White text, monospace font, `borderpad=3`, `borderradius=3`.
  - Tooltip (hovertext on a separate scatter point) shows precision and recall.

- [x] **6.3** Add diagonal triangle marker: second `go.Scatter` trace with `symbol="triangle-up"`, placed at `(i+0.38, i-0.38)` for each diagonal cell `i`.

- [x] **6.4** Add asymmetry arrow annotation `→` for off-diagonal cell `(i, j)` where `matrix[i][j] >= 3` AND `matrix[i][j] > 2 * matrix[j][i]`.

- [x] **6.5** Add low-support warning `⚠` prefix to y-axis tick label for rows where `row_sum < 10`.

- [x] **6.6** Implement `render_type_confusion_panel(run_id, filter_mode)` → `html.Div` containing:
  - Section header "Type Confusion Matrix".
  - `dcc.Loading` wrapper around `dcc.Graph(id="type-confusion-matrix", figure=..., config={"displayModeBar": False})`.
  - Compute sorted type labels (F1 DESC), build figure, return panel.

- [x] **6.7** Implement `render_subtype_confusion_panel(run_id, true_type, pred_type, filter_mode)` → `html.Div`:
  - Section header "Subtype Confusion Matrix — {true_type} → {pred_type}" with an `✕` clear button.
  - If no type pair selected: placeholder message "Click a cell in the Type Confusion Matrix above to view subtypes."
  - Otherwise: `dcc.Loading` + `dcc.Graph(id="subtype-confusion-matrix")`.
  - Subtype row labels sorted by F1 DESC; col labels aligned for shared labels (diagonal preserved), then remaining sorted by F1.

---

## Phase 7 — Confusion Mode Wiring (callbacks in `app.py`)

- [x] **7.1** `type-confusion-matrix` `clickData` → `store-matrix-cell`: extract `customdata[0]` (true_type) and `customdata[1]` (pred_type). Toggle off (set to `None`) if clicking the already-selected cell.

- [x] **7.2** `store-matrix-cell` + `store-selected-runs` + `store-filter-mode` → subtype matrix container: call `render_subtype_confusion_panel(...)`.

- [x] **7.3** `subtype-confusion-matrix` `clickData` → `store-subtype-cell`.

- [x] **7.4** `store-subtype-cell` → `record-table-panel` visibility + `record-table` data:
  - Call `get_records(...)` with type pair + subtype pair filters.
  - Set `display: block` on the panel.

- [x] **7.5** `store-filter-mode` → re-render both type and subtype matrices (same callbacks as 7.1–7.4 include `store-filter-mode` as Input/State as appropriate).

- [x] **7.6** Most-misclassified bar:
  - Compute top-5 true subtypes by error count from filtered records.
  - Render a horizontal `go.Bar` chart (`id="misclassified-bar"`) below the subtype matrix using `most_misclassified_bar(top5)`.
  - `misclassified-bar` `clickData` → `store-subtype-cell` (set `true_subtype`, `pred_subtype=None`).

---

## Phase 8 — Transition Matrix Component (`components/transition_matrix.py`)

- [x] **8.1** Implement `build_transition_matrix_figure(matrix_data, rows, cols, run1_name, run2_name)` → `go.Figure`:
  - Use `go.Scatter` + shapes (same pattern as confusion matrix).
  - Color per cell using `transition_cell_color(run1_correct, run2_correct, count)`:
    - Run1 correct / Run2 wrong → blue (rgba 59,130,246)
    - Run2 correct / Run1 wrong → green (rgba 22,163,74)
    - Both wrong → red (rgba 220,38,38)
    - Both correct / no change → neutral grey
    - Intensity scales with count.
  - `customdata` per cell: `(run1_pred, run2_pred, total, run1_correct, run2_correct, both_wrong)`.
  - Hover: show counts per correctness bucket.

- [x] **8.2** Add net delta badge annotation at `(n-0.4, -0.7)`:
  - `delta = run2_correct_total - run1_correct_total`
  - `▲ +{delta}` green badge if delta ≥ 0; `▼ {delta}` red badge if negative.

- [x] **8.3** Implement `render_transition_panel(run_id1, run_id2, min_count, run1_name, run2_name)` → `html.Div`:
  - Title: "Subtype Transition Matrix — {run1_name} → {run2_name}".
  - Net delta badge (as html element alongside title, matching the React inline badge).
  - Correctness legend: clickable filter buttons `All (N)`, `{run1_name} (N)`, `{run2_name} (N)`, `Both wrong (N)` — store active filter in `store-correctness-filter`.
  - `dcc.Loading` + `dcc.Graph(id="transition-matrix")`.

- [x] **8.4** Min Changed stepper: `dcc.Input(id="min-changed-stepper", type="number", min=1, max=999, debounce=True)` rendered in the filter toolbar (Phase 4.5).

- [x] **8.5** Persistent failures bar (both models wrong): compute top-5 true subtypes; render horizontal `go.Bar`; clicking filters records.

---

## Phase 9 — Transition Mode Wiring (callbacks in `app.py`)

- [x] **9.1** `store-selected-runs` + `min-changed-stepper` → `matrix-panel` (transition layout): call `render_transition_panel(...)`.

- [x] **9.2** `transition-matrix` `clickData` → `store-subtype-cell` (stores `run1_pred` and `run2_pred`).

- [x] **9.3** `store-subtype-cell` (transition) → `record-table-panel` + `record-table` data: call `get_records(run_id1=..., run_id2=..., run1_pred_subtype=..., run2_pred_subtype=...)`.

- [x] **9.4** `store-correctness-filter` → filter `displayRecords` (client-side or server-side) by correctness bucket (run1-correct, run2-correct, both-wrong, all).

---

## Phase 10 — Record Table Component (`components/record_table.py`)

- [x] **10.1** Implement `make_record_table(show_run2=False, run1_name="Run 1", run2_name="Run 2")` → `dash_table.DataTable`:
  - `id="record-table"`.
  - Single-run columns: request_id, true_type, pred_type, true_subtype, pred_subtype, attributes_short, metadata_short.
  - Dual-run columns: use multi-level `name` tuples with `merge_duplicate_headers=True` to produce grouped headers for Run 1 / Run 2 pred columns (see implementation guide §8).
  - `request_id` column: pre-process rows to add an `_r1_correct` / `_r2_correct` indicator field; use `style_data_conditional` to colour incorrect-prediction rows red-tinted.
  - `attributes` and `metadata`: pre-process to `attributes_short` (first 80 chars) for display, full JSON in `tooltip_data` (DataTable built-in tooltip, air-gap safe). Copy capability via `dcc.Clipboard` next to table or a `clientside_callback`.
  - `sort_action="native"`, `filter_action="native"` (per-column text filter built-in), `page_action="native"`, `page_size=20`.

- [x] **10.2** Row height selector buttons (1-line=24px, 2-line=48px, 3-line=72px, Auto) rendered above the table; callback updates `record-table` `style_data` (set `height` and `whiteSpace` — see implementation guide §8.2).

- [x] **10.3** JSON copy button + toast: use `dcc.Clipboard` or a `clientside_callback` writing `navigator.clipboard.writeText(...)`. Show a `dcc.Toast` or simple `html.Div` toast for 2 seconds on copy.

---

## Phase 11 — Global CSS (`assets/styles.css`)

- [x] **11.1** `DataTable` CSS overrides (copy from `python_dash_implementation_guide.md` §12):
  - Hover/selected row colours, filter row input styling, monospace font for JSON columns, compact pagination bar.

- [x] **11.2** Remove Dash default focus outline: `.dash-graph:focus { outline: none; }`.

- [x] **11.3** Page background: `body { background: #f8f9fc; margin: 0; }`.

- [x] **11.4** Compact dropdown: `.Select-control { font-size: 13px !important; }`.

- [x] **11.5** Match the React matrix styles for selected cells (blue highlight border), diagonal cells, asymmetry arrow, low-support warning icon, F1 row badge colours.

- [x] **11.6** Record table styles: `.json-cell-wrapper`, `.copy-json-btn`, `.json-pretty` (monospace, small font), toast notification.

- [x] **11.7** Correctness dot badges for request_id column (green/red small circles).

- [x] **11.8** Persistent failures bar and most-misclassified bar panel styles.

---

## Phase 12 — Integration & End-to-End Wiring

- [x] **12.1** Verify the full drill-down chain works:
  - Benchmark selector → leaderboard renders with correct runs.
  - Click leaderboard row → type confusion matrix renders.
  - Click type matrix cell → subtype matrix renders below, breadcrumb label shows `{true_type} → {pred_type}`.
  - Click subtype cell → record table appears with filtered records.
  - Click most-misclassified badge → record table filters to that subtype.
  - Toggle "Incorrect Only" → both matrices and record table refresh.

- [x] **12.2** Verify transition mode chain:
  - Check 2 leaderboard rows → transition matrix renders.
  - Adjust min-changed stepper → matrix re-renders (cells below threshold hidden).
  - Click transition cell → record table shows dual-run records.
  - Click correctness legend button → records filter by correctness bucket.
  - Click persistent-failures badge → records filter to that subtype.

- [x] **12.3** Edge cases to verify:
  - 0 runs selected: matrix panel shows placeholder.
  - Type pair with no subtype data: subtype panel shows "No subtype data for this type pair."
  - Run file missing: loader logs warning, leaderboard entry shows `benchmark_length=0`.
  - JSON attribute that is empty dict: record table shows `(empty)`.

---

## Phase 13 — Run & Deployment

- [x] **13.1** Add `requirements.txt` in `python/`:
  ```
  dash>=2.16
  plotly
  pandas
  numpy
  psycopg2-binary
  python-dotenv
  ```

- [x] **13.2** Confirm the app runs: `cd python && python app.py` → opens on `http://localhost:8050`.

- [x] **13.3** *(Optional)* Add a `Dockerfile.python` in the repo root or a `python/Dockerfile` that installs requirements and runs `python app.py` on port 8050.

---

## Appendix: Key Behaviour Details Observed from the React App

| Feature | Exact React behaviour to replicate |
|---|---|
| Leaderboard row click | Selects that run exclusively (no toggle-off to 0 runs) |
| Leaderboard checkbox | Toggle; max 2 checked at once; 3rd checkbox is disabled with tooltip |
| Type matrix cell click | Toggle: clicking the same cell again deselects it (clears subtype matrix + records) |
| Subtype cell click | Toggle within selected type; deselect restores type-pair filter on records |
| Date display | Parse `YYYYMMDD` prefix from `run_name`; fall back to `—` if absent |
| F1 tooltip | Shows Precision and Recall on hover over F1 badge cell |
| Asymmetry arrow | Only shown when `count >= 3` AND `count > 2 × reverse_count` |
| Low-support warning | ⚠ shown when row total > 0 AND < 10 |
| Most-misclassified bar | Top 5 true subtypes with mismatch errors; click to filter; shows only when records are loaded |
| Persistent failures bar | Top 5 true subtypes wrong in **both** models; transition mode only |
| Correctness legend | Clicking active filter deselects it (returns to "All") |
| Net delta badge | Always visible when transition data is loaded; colour-coded green/red |
| Min-changed stepper | `debounce=True`; hides rows/cols with total < threshold (not just dims the cells) |
| Record table pagination | Resets to page 1 when data changes or column filter changes |
| Record table row height | 1-line=24px, 2-line=48px, 3-line=72px, Auto=`height: auto` — set via `style_data` callback |
| JSON copy | Button shows "Copied ✔" for 1s then reverts; toast shows for 2s |

---

## Relevant Files

| File | Description |
| --- | --- |
| `python/app.py` | Dash app entry point |
| `python/colors.py` | Shared colour, font, and style constants |
| `python/server/__init__.py` | Package marker |
| `python/server/loader.py` | CSV / Postgres data loader |
| `python/server/metrics.py` | F1 and matrix computation |
| `python/components/__init__.py` | Package marker |
| `python/components/leaderboard.py` | Leaderboard DataTable component |
| `python/components/confusion_matrix.py` | Confusion matrix figure builder |
| `python/components/transition_matrix.py` | Transition matrix component |
| `python/components/record_table.py` | Row-level record DataTable component |
| `python/assets/styles.css` | Global CSS overrides |
| `python/.env` | Environment config (`DATA_SOURCE=csv`) |
| `python/requirements.txt` | Python dependencies |
| `python/Dockerfile` | Container image for running Dash app on port 8050 |
