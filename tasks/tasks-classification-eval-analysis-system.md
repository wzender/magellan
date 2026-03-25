# Tasks: Classification Evaluation & Analysis System

## Relevant Files

- `tasks/prd-classification-eval-analysis-system.md` - The Product Requirements Document this feature is based on.
- `db/schema.sql` - SQL schema definitions for creating and updating the required tables in PostgreSQL.
- `server/api/leaderboard.js` - Handles backend endpoints for leaderboard metrics and requests.
- `server/api/runs.js` - Backend endpoints for loading and comparing runs.
- `server/api/confusionMatrix.js` - Backend endpoint for confusion matrix calculations and responses.
- `server/api/transitionMatrix.js` - Backend endpoint for transition matrix calculations and requests.
- `server/api/records.js` - Backend endpoint for row-level record exploration/filtering.
- `server/mock/mockDataGenerator.js` - Script/module for generating realistic mock data.
- `client/components/Dashboard.jsx` - Main entry point/component for the SPA dashboard.
- `client/components/LeaderboardWidget.jsx` - Leaderboard UI displaying metrics.
- `client/components/BenchmarkDropdown.jsx` - Dropdown for selecting benchmarks.
- `client/components/RunSelector.jsx` - UI for selecting specific runs or comparing runs.
- `client/components/ConfusionMatrixPanel.jsx` - Visualization and navigation for type/subtype confusion matrices.
- `client/components/TransitionMatrixPanel.jsx` - Visualization for drift/transition between runs.
- `client/components/RowLevelTable.jsx` - Detailed, expandable table for raw prediction/item data.
- `client/styles/` - Any application-wide styles, with special attention to dense tables and visualizations for 20 types x 400 subtypes.
- `server/api/__tests__/` - Directory for backend endpoint test files.
- `client/components/__tests__/` - Directory for frontend/unit test files.

### Notes

- Unit tests should typically be placed alongside code files they are testing (e.g., `LeaderboardWidget.jsx` & `LeaderboardWidget.test.jsx`).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests.

---

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off in this markdown file by changing `- [ ]` to `- [x]`. Update after completing each sub-task, not just after an entire parent task.

---

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch for this feature (e.g., `git checkout -b feature/classification-eval-analysis-system`)

- [x] 1.0 Design and Set Up Database Schema
  - [x] 1.1 Create table schema for `timestamp_run_id_results` and `leaderboard` as detailed in the PRD
  - [x] 1.2 Validate that schema supports attributes (large JSONs), up to 20 types, and ~400 subtypes
  - [x] 1.3 Add indexes as needed for performance on filters and lookups
  - [x] 1.4 Test database migrations/creation in a local environment

- [x] 2.0 Implement Backend API Endpoints
  - [x] 2.1 Implement `/leaderboard` endpoint for metric queries per benchmark
  - [x] 2.2 Implement `/runs` endpoint for listing and comparing runs
  - [x] 2.3 Implement `/confusion-matrix` endpoint for type/subtype confusion matrices
  - [x] 2.4 Implement `/transition-matrix` endpoint for subtype transitions between runs
  - [x] 2.5 Implement `/records` endpoint for row-level exploration
  - [x] 2.6 Ensure all endpoints efficiently process large JSON payloads
  - [x] 2.7 Write integration/unit tests for each endpoint


- [x] 3.0 Generate and Integrate Mock Data for Testing
  - [x] 3.1 Write scripts/utilities to generate ~2,000 items with realistic attributes (JSON), 20 types, each with 10-20 subtypes, and varied predictions/ground truths
  - [x] 3.2 Seed the database with this mock data for frontend and backend development
  - [x] 3.3 Validate realism and coverage (e.g., all types/subtypes are represented)

- [x] 4.0 Build Frontend Dashboard (Single Page Application)
  - [x] 4.1 Set up main SPA structure and routing (if needed)
  - [x] 4.2 Implement leaderboard, benchmark dropdown, and run selection widgets
  - [x] 4.3 Implement main panels for confusion matrix and transition matrix
  - [x] 4.4 Implement expandable/collapsible row-level item data table supporting long JSON attributes
  - [x] 4.5 Implement drill-down and filtering interactions (matrix cells → table rows)

- [x] 5.0 Implement and Link Interactive Visualizations
  - [x] 5.1 Build type-level confusion matrix with click navigation to subtype matrix
  - [x] 5.2 Build subtype confusion matrix with click navigation to relevant data table
  - [x] 5.3 Implement transition matrix visualization for run comparison with threshold slider
  - [x] 5.4 Ensure UI handles dense (20x400) scenarios, with view controls (scroll, zoom, grouping) as needed


- [x] 6.0 Write Unit and Integration Tests
  - [x] 6.1 Write backend endpoint tests (`/api/__tests__/`)
  - [x] 6.2 Write frontend unit tests for each component
  - [x] 6.3 Write integration tests for dashboard user flow
  - [x] 6.4 Validate API and UI against known (mock) ground truths


- [x] 7.0 Polish UI/UX and Performance for Large Datasets
  - [x] 7.1 Apply modern, accessible styling and layouts for dense data
  - [x] 7.2 Add lazy loading/virtualization for large tables and matrices
  - [x] 7.3 Optimize frontend and backend for large JSON attribute performance
  - [x] 7.4 Run usability tests (with >2000 items and dense taxonomy) and iterate on feedback


---