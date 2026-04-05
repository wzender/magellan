# Classification Evaluation & Analysis System

A single-page dashboard for evaluating and exploring classification model performance — confusion matrices, transition matrices, leaderboards, and record-level drill-down.

## Features

- **Leaderboard** — compare runs by subtype accuracy, F1 (weighted), and run date
- **Confusion Matrix** — type and subtype level; F1 row, asymmetry hints, diagonal markers
- **Transition Matrix** — diff two runs side-by-side with correctness coloring and net-delta badge
- **Row-Level Drill-Down** — paginated, filterable, sortable record table with JSON attribute viewer

## Tech Stack

- **Backend**: Node.js 21 / Express, PostgreSQL (or CSV fallback)
- **Frontend**: React, CSS3
- **Data**: CSV files in `data/` (default) or PostgreSQL via `DATA_SOURCE=postgres`

---

## Quick Start (local dev)

```bash
# 1. Install server dependencies
npm install

# 2. Install client dependencies
cd client && npm install && cd ..

# 3. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, DB_SCHEMA, DATA_SOURCE

# 4. Run in development mode (server auto-restarts, client hot-reload)
npm run dev                        # server on :5000
cd client && npm start             # client dev server on :3000 (proxies /api to :5000)
```

### Production build (no Docker)

```bash
cd client && npm run build && cd ..
npm start                          # serves built client + API on :5000
```

---

## Docker

### Build

```bash
docker build -t magellan .
```

### Run

If PostgreSQL is running on the host machine and the app container needs to connect to it on Linux, use host networking so `localhost` inside the container resolves to the host:

```bash
docker run --rm --network host \
  -e DATABASE_URL=postgresql://postgres:postgres@localhost:5432/classification_eval \
  -e DB_SCHEMA=magellan \
  -e DATA_SOURCE=postgres \
  magellan
```

To use the CSV backend instead, expose port 5000 normally:

```bash
docker run --rm -p 5000:5000 \
  -e DATA_SOURCE=csv \
  magellan
```

If you prefer bridge networking and want the container to reach PostgreSQL on the host, use Docker's host gateway name instead of `localhost`:

```bash
docker run --rm -p 5000:5000 \
  --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/classification_eval \
  -e DB_SCHEMA=magellan \
  -e DATA_SOURCE=postgres \
  magellan
```

Then open [http://localhost:5000](http://localhost:5000).

### Build and run with docker compose (example)

```yaml
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/classification_eval
      DB_SCHEMA: magellan
      DATA_SOURCE: postgres
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: classification_eval
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
```

```bash
docker compose up --build
```

---

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `DB_SCHEMA` | PostgreSQL schema | `magellan` |
| `DATA_SOURCE` | `postgres` or `csv` | `csv` |
| `PORT` | Server port | `5000` |
| `NODE_ENV` | `development` or `production` | `development` |

Copy `.env.example` to `.env` and fill in your values.

---

## Project Structure

```text
.
├── server/
│   ├── api/              # Express route handlers
│   │   ├── leaderboard.js
│   │   ├── runs.js
│   │   ├── confusionMatrix.js
│   │   ├── transitionMatrix.js
│   │   └── records.js
│   ├── csv-loader.js     # In-memory CSV backend
│   ├── db-loader.js      # PostgreSQL backend
│   ├── loader.js         # Selects backend via DATA_SOURCE
│   ├── db.js             # PostgreSQL pool (reads DATABASE_URL + DB_SCHEMA)
│   └── index.js          # Server entry point
├── client/
│   └── src/
│       └── components/   # React components
│           ├── Dashboard.jsx
│           ├── LeaderboardWidget.jsx
│           ├── ConfusionMatrixPanel.jsx
│           ├── TransitionMatrixPanel.jsx
│           ├── RowLevelTable.jsx
│           └── styles.css
├── data/
│   ├── leaderboard.csv   # Run metadata (benchmark, model, date, metrics)
│   └── runs/             # Per-run prediction CSVs
├── Dockerfile
├── start.sh              # Builds client then starts server
├── .env.example
└── tasks/                # PRD
```

---

## API Reference

| Method | Endpoint | Params |
| --- | --- | --- |
| GET | `/api/benchmarks` | — |
| GET | `/api/leaderboard` | `benchmark_id` |
| GET | `/api/runs` | `benchmark_id` |
| GET | `/api/runs/:id` | — |
| GET | `/api/confusion-matrix` | `run_id`, `filter` (optional: `incorrect`) |
| GET | `/api/confusion-matrix/subtype` | `run_id`, `true_type`, `pred_type`, `filter` |
| GET | `/api/transition-matrix` | `run_id1`, `run_id2`, `min_count` |
| GET | `/api/records` | `run_id`, type/subtype filters, `limit`, `offset` |
| GET | `/api/records/:id` | — |
| GET | `/api/health` | — |

---

## PostgreSQL Data Source

### Connection string

The connection string is read from the `DATABASE_URL` environment variable. Set it in your `.env` file (copied from `.env.example`):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/classification_eval
DB_SCHEMA=magellan
DATA_SOURCE=postgres
```

`DB_SCHEMA` controls which PostgreSQL schema is searched (defaults to `magellan`). The app sets `search_path` to that schema on every connection, so all table names below are relative to it.

### Table and column definitions

The schema is documented and queried in [server/db-loader.js](server/db-loader.js). There are two kinds of tables:

**`leaderboard-table`** — one row per run:

| Column | Type | Description |
| --- | --- | --- |
| `run_id` | text | Name of the per-run table (e.g. `20261230-1445-Test-benchmark`) |
| `nof_items` | integer | Number of records in the run |
| `subtype_accuracy` | numeric | Overall subtype accuracy (0–1) |
| `description` | text | Human-readable label shown in the leaderboard |

**Per-run tables** — one row per prediction, named `YYYYMMDD-HHMM-<benchmark-name>`:

| Column | Type | Description |
| --- | --- | --- |
| `record_id` | text | Stable identifier used to join two runs in transition-matrix mode |
| `true_type` | text | Ground-truth type label |
| `true_subtype` | text | Ground-truth subtype label |
| `pred_type` | text | Predicted type label |
| `pred_subtype` | text | Predicted subtype label |
| `attributes` | text / jsonb | JSON object with item-level attributes (displayed in drill-down) |
| `metadata` | text / jsonb | JSON object with additional metadata (displayed in drill-down) |

The benchmark name is inferred automatically from the run table name by dropping the `YYYYMMDD-HHMM-` prefix, so no separate benchmarks table is needed.

### Adapting to a different schema

If your environment uses different table or column names, the only file to edit is [server/db-loader.js](server/db-loader.js):

1. **Different leaderboard table name** — change the table name in the `getRunIndex` query (line ~50):
   ```js
   FROM "leaderboard-table"   // ← rename to match your table
   ```

2. **Different leaderboard column names** — update the `SELECT` list and the field references in `getRunIndex` where it maps `row.run_id`, `row.nof_items`, `row.subtype_accuracy`, `row.description`.

3. **Different per-run table naming convention** — the `extractBenchmarkName` helper (line ~32) splits the table name on `-` and drops the first two segments (`YYYYMMDD` and `HHMM`). Adjust that function if your tables follow a different naming pattern.

4. **Different per-run column names** — every SQL query in `db-loader.js` that touches per-run tables selects `record_id`, `true_type`, `true_subtype`, `pred_type`, `pred_subtype`, `attributes`, `metadata`. Search for those names and replace them with your column names. The rest of the app only sees the data after `db-loader.js` has mapped it, so no other files need changing.

5. **Different schema name** — just change `DB_SCHEMA` in your `.env`; the pool in [server/db.js](server/db.js) sets `search_path` dynamically from that variable.

---

## Running Tests

```bash
npm test                  # all tests
npm run test:backend      # server/ only
```
