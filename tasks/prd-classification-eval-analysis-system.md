# Product Requirements Document (PRD)

## Classification Evaluation & Analysis System

---

### 1. Introduction / Overview

This project is a classification evaluation and analysis system that enables users to analyze and understand the performance of item classification models. The system classifies items into a hierarchical taxonomy (type/subtype) and evaluates predictions against benchmark datasets. It provides interactive dashboards with comprehensive metrics and visualizations for data scientists, business stakeholders, and developers.

**Goal:**
To provide an all-in-one, modern dashboard for robust evaluation, benchmarking, and exploration of classification models by leveraging benchmark datasets and rich, drill-down analytics.

---

### 2. Goals

- Allow users to view and compare classification model performance against benchmarks
- Support analysis at a high level (overall metrics) and granular level (item-by-item)
- Allow exploration via confusion matrices and transition matrices
- Enable easy filtering and drill-down into misclassifications
- Deliver all functionality in a unified, modern, single-page interface

---

### 3. Users and Use Cases

**Target Users:**

- Data scientists and ML engineers: Evaluate, compare, and debug model results
- Business stakeholders: Monitor accuracy and business impact
- Developers/QA: Investigate misclassifications, regression, and edge cases

**Example Use Cases:**

- Track subtype accuracy and F1 metrics over time and between model versions
- Slice and filter predictions to identify problem areas
- Drill into raw item-level data for any cell of a confusion/transition matrix
- Compare classification drift between model versions for a given benchmark

---

### 4. Functional Requirements

1. The system must display a leaderboard per benchmark, showing subtype accuracy, subtype weighted F1, and type weighted F1.
2. The system must allow users to select which benchmark to view.
3. The system must allow users to filter predictions: all vs only incorrect subtype predictions.
4. The system must allow users to select a specific run and display its type confusion matrix.
5. Clicking a cell in the type confusion matrix must display the subtype confusion matrix for the relevant type pair.
6. Clicking a cell in the subtype confusion matrix must display a row-level data table containing all relevant records, with columns: request_id, attributes, metadata, true_type, pred_type, true_subtype, pred_subtype.
7. The system must support comparing two runs of the same benchmark via a transition matrix (showing subtype label transitions between runs).
8. The transition matrix must support filtering by a minimum number of changed records (stepper 1–999).
9. Clicking a transition cell must show the corresponding row-level records.
10. The UI must be modern, visually clear, and present all major features on a single page.
11. No authentication is required to use the dashboard.

---

### 5. Non-Goals (Out of Scope)

- User management, access control, or authentication flows
- Automated model retraining or re-running of benchmarks from the UI
- Customizable or user-defined taxonomy structures
- Support for non-tabular (image, audio, etc.) data forms
- Data upload or benchmark refresh via the UI

---

### 5a. Data Variety and Mock/Test Data

- There are approximately 20 unique types in the taxonomy. Each type contains approximately 10 to 20 subtypes, resulting in up to 400 unique subtypes in total.
- Each benchmark dataset is approximately 2,000 items (rows).
- Item attributes are stored as long JSON objects and can be large per entry.
- Mock data is provided in `data/` to support development and testing.
- The UI must gracefully handle the large variety and quantity of types/subtypes, and the potential verbosity of attributes display.

---

### 6. Design Considerations

- UI/UX should be sleek, modern, and compact — single-page with logical, well-organized panels
- Use standard, accessible colors and responsive layouts
- Present all primary analytics and drill-downs without navigating away from the main page
- Lazy loading and pagination for heavy data tables

---

### 7. Technical Considerations

- Dual data backend: CSV files (primary, in-memory cache) and PostgreSQL (optional, selected via `DATA_SOURCE` env var)
- Express.js server on port 5000; serves pre-built React client as static files
- API endpoints are stateless and efficient for large tabular datasets
- System is stateless (no session management)

---

### 8. Data Layer

**CSV (primary)**

- `data/leaderboard.csv` — one row per run: `benchmark_id`, `benchmark_name`, `run_name`, `model_name`, `subtype_accuracy`, `subtype_f1_weighted`, `run_date`
- `data/runs/{benchmark_id}_{run_name}.csv` — per-run prediction records: `benchmark_id`, `rec_id`, `true_type`, `true_subtype`, `pred_type`, `pred_subtype`, `attributes` (JSON), `metadata` (JSON)
- All CSV data is parsed and cached in memory on server startup; `attributes` and `metadata` are parsed from JSON strings at load time

**PostgreSQL (optional)**

- Activated by setting `DATA_SOURCE=postgres` in `.env`
- Same query interface as the CSV loader (polymorphic design via `server/loader.js`)

**Run name convention**

- Run names are expected to encode date as a `YYYYMMDD` prefix (e.g. `20260327-0001-Benchmark-Q1-2026`); the date is parsed client-side for display

---

### 9. API Design

All endpoints are prefixed `/api/`:

| Endpoint | Params | Returns |
|---|---|---|
| `GET /benchmarks` | — | Array of `{id, name}` |
| `GET /leaderboard` | `benchmark_id` | Leaderboard entries sorted by `subtype_f1_weighted` DESC |
| `GET /runs` | `benchmark_id` | Array of run references |
| `GET /runs/:id` | — | Single run with `record_count` |
| `GET /confusion-matrix` | `run_id`, `filter` (optional: `incorrect`) | `{type_matrix: {rows, cols, data}}` |
| `GET /confusion-matrix/subtype` | `run_id`, `true_type`, `pred_type`, `filter` | Subtype matrix for a type pair |
| `GET /transition-matrix` | `run_id1`, `run_id2`, `min_count` | Two-run comparison matrix |
| `GET /records` | `run_id` (or `run_id1`+`run_id2`), type/subtype filters, `limit`, `offset` | Paginated record rows |
| `GET /records/:id` | — | Single record |
| `GET /health` | — | `{status: 'ok'}` |

---

### 10. UI/UX Requirements

#### Layout

- Single page; no full-page reloads or navigations
- Top: benchmark selector dropdown
- Middle: leaderboard widget
- Bottom: matrix panels (confusion or transition, depending on selection) + row-level table

#### Leaderboard

- Columns: Select (checkbox), Rank, Run, Model Version, Date, Subtype Accuracy, Subtype F1 (Weighted), Type F1 (Weighted), Benchmark Size
- **Date column**: date is parsed from the `YYYYMMDD` prefix of the run name and displayed as `DD/MM/YYYY` with a relative time label below it (e.g. "3 days ago", "a month ago")
- Click a row → enter single-run confusion mode
- Check up to 2 rows → enter transition mode
- All columns are sortable (click header), resizable (drag right edge), and reorderable (drag header)

#### Confusion Matrix (1 run selected)

- **Type Confusion Matrix**:
  - Rows = true labels, columns = predicted labels, sorted by F1 descending
  - **F1 row** at the top of each column, color-coded: green ≥80%, amber 50–80%, red <50%; tooltip shows precision and recall
  - Diagonal cells are highlighted (correct predictions) with a corner triangle marker
  - Off-diagonal cells with strong asymmetry (≥3 occurrences AND >2× the reverse) show a `→` arrow
  - Low-support rows (<10 samples) show a ⚠ warning
  - Click any cell to drill into the subtype matrix
- **Subtype Confusion Matrix**:
  - Shown below the type matrix once a type-pair cell is clicked
  - Same F1 row, diagonal marking, asymmetry hints, and low-support warnings as the type matrix
  - Rows (pred subtypes) sorted by F1 descending; columns (true subtypes) follow the same label order, keeping the diagonal aligned
  - Empty rows/columns are filtered out
  - Click a cell to filter the record table below
- **Incorrect Only filter**: toolbar toggle to restrict both matrices and records to wrong predictions only
- **Most Misclassified bar**: top 5 true subtypes by error count; clickable to filter the record table

#### Transition Matrix (2 runs selected)

- Rows = Run 1 predictions, columns = Run 2 predictions
- Cell color coding by correctness outcome:
  - Run 1 correct / Run 2 wrong — blue
  - Run 2 correct / Run 1 wrong — green
  - Both wrong — red
  - Both correct / no change — neutral
- **Net delta badge**: top-right corner shows `▲ +N` (improvement) or `▼ N` (regression)
- **Correctness legend**: clickable filter buttons (All, Run A only, Run B only, Both wrong) with counts
- **Persistent failures bar**: top 5 true subtypes where both models fail; clickable to filter records
- **Min Changed threshold**: stepper (1–999) to hide low-count transitions

#### Row-Level Table

- Shown below the active matrix panel
- Single-run columns: request_id, true_type, pred_type, true_subtype, pred_subtype, attributes, metadata
- Dual-run columns: request_id, true type/subtype, Run 1 predictions, Run 2 predictions, attributes, metadata
- Features: sortable, per-column text filter, resizable columns, reorderable columns, page size (20/50/All), row height selector (1-line / 2-line / 3-line / Auto)
- JSON cells: pretty-printed with Copy button and toast notification on copy

---

### 11. Deployment

- **Docker**: `Dockerfile` in root; base `node:18.18.2-slim`; builds client then starts server; exposes port 5000
- **`start.sh`**: builds client (`npm run build`) then starts `node server/index.js`
- **Dev mode**: `npm run dev` for server with auto-restart; `cd client && npm start` for hot-reload client on port 3000 (proxies `/api` to 5000)
- **Configuration**: `.env` sets `DATA_SOURCE`, `PORT`, `DB_*` for PostgreSQL connection

---

### 12. Metrics and Success Criteria

- Leaderboard and analytics rendered for all benchmarks with <2s latency for typical dataset sizes
- Users can drill from leaderboard → run → confusion matrix → row-level items in ≤ 4 clicks
- System can efficiently handle thousands of items per run

---

### 13. Future Improvements

- Support uploading custom benchmark datasets via UI
- Add user accounts, saved views, and audit logs (if authentication needed)
- Support additional metrics (e.g., per-attribute error analysis, longitudinal performance tracking)
- Integrate with automated model training and deployment pipelines
- Export to CSV / shareable links for filtered views
- Charts and trend graphs across benchmark runs over time
