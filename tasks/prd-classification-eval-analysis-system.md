# Product Requirements Document (PRD)

## Classification Evaluation & Analysis System

---

### 1. Introduction / Overview

This project is a classification evaluation and analysis system that enables users to analyze and understand the performance of item classification models. The system classifies items into a hierarchical taxonomy (type/subtype) using static mapping and LLMs, and evaluates predictions against benchmark datasets. It provides interactive dashboards with comprehensive metrics and visualizations for a broad group of users: data scientists, business stakeholders, and developers.

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

- Track subtype accuracy and f1 metrics over time and between model versions
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
6. Clicking a cell in the subtype confusion matrix must display a row-level data table containing all relevant records, with columns: record_id, attributes, metadata, true_type, pred_type, true_subtype, pred_subtype.
7. The system must support comparing two runs of the same benchmark via a transition matrix (showing subtype label transitions between runs).
8. The transition matrix must support filtering by a minimum number of changed records (slider 1–50).
9. Clicking a transition cell must show the corresponding row-level records.
10. The UI must be modern, visually clear, and present all major features on a single page.
11. No authentication is required to use the dashboard.

---

### 5. Non-Goals (Out of Scope)

- User management, access control, or authentication flows
- Automated model retraining or re-running of benchmarks from the UI
- Customizable or user-defined taxonomy structures
- Support for non-tabular (image, audio, etc.) data forms

---

### 5a. Data Variety and Mock/Test Data

- There are approximately 20 unique types in the taxonomy. Each type contains approximately 10 to 20 subtypes, resulting in up to 400 unique subtypes in total.
- Each benchmark dataset is approximately 2,000 items (rows).
- Item attributes are stored as long JSON objects and can be large per entry.
- Mock data should be provided to support frontend and backend development and testing.
- The UI must gracefully handle the large variety and quantity of types/subtypes, and the potential verbosity of attributes display.

---

### 6. Design Considerations

- UI/UX should be sleek, modern, and compact—single-page with logical, well-organized panels
- Use standard, accessible colors and responsive layouts
- Present all primary analytics and drill-downs without navigating away from the main page
- Consider lazy loading for heavy data tables and visualizations

---

### 7. Technical Considerations

- Use PostgreSQL as the backend data store
- Ensure API endpoints are efficient for large tabular datasets
- System should be stateless (no authentication/session management is needed)
- Allow for future extensibility (benchmarks, model versions, new metrics)

---

### 8. Database Design

**1. Run Results Table** (`timestamp_run_id_results`)

- record_id
- attributes (JSON)
- metadata (JSON)
- true_type
- pred_type
- true_subtype
- pred_subtype

**2. Leaderboard Table**

- benchmark_id
- benchmark_length
- subtype_accuracy
- subtype_f1_weighted
- type_f1_weighted

---

### 9. API Design (example endpoints)

- `GET /leaderboard?benchmark_id=...` → Returns leaderboard metrics for benchmark
- `GET /runs?benchmark_id=...` → Returns list of runs for benchmark
- `GET /results?run_id=...&filter=incorrect` → Returns filtered prediction records
- `GET /confusion-matrix?run_id=...` → Returns type and subtype confusion matrices
- `GET /transition-matrix?run_id1=...&run_id2=...&min_count=...` → Returns transition matrix
- `GET /records?run_id=...&filter=...` → Returns row-level records for selected matrix cell

---

### 10. UI/UX Requirements

- User stays on a single page; no full-page reloads or navigations
- Layout includes: benchmark selection dropdown, leaderboard widget, run selection, main visualization panels (confusion matrix, transition matrix), item-level table drawer/popup
- Interactive visualizations with clickable cells for drill-down
- Filters and sliders (e.g., for transition matrix threshold)
- Responsive and mobile-friendly design
- Visualizations (confusion matrices, transition matrices, dropdowns, tables) must be designed to efficiently handle 20 types and up to 400 subtypes—supporting dense/scrollable layouts and effective visual grouping/zooming as needed.
- Attribute columns in data tables should use expandable/collapsible display, truncated previews, or popovers for very long JSON attributes.

---

### 11. Metrics and Success Criteria

- Leaderboard and analytics rendered for all benchmarks with <2s latency for typical dataset sizes
- Users can drill from leaderboard → run → confusion matrix → row-level items in ≤ 4 clicks
- 90%+ users (across target groups) find the UI intuitive and visually clear (validation through feedback/discussion)
- System can efficiently handle thousands of items per run; scaling plan for larger benchmarks

---

### 12. Future Improvements

- Support uploading custom benchmark datasets via UI
- Add user accounts, saved views, and audit logs (if authentication needed)
- Support additional metrics (e.g., per-attribute error analysis, longitudinal performance tracking)
- Integrate with automated model training and deployment pipelines
- Theme/customization support for company branding

---

### 13. Open Questions

- Should user-uploaded benchmarks and custom metrics be supported in the first phase, or deferred?
- Is there a preferred library/framework for building the UI or visualizations?
- Are there embargoed or sensitive datasets requiring eventual access control?

---
