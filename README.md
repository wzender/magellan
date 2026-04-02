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

```bash
docker run -p 5000:5000 \
  -e DATABASE_URL=postgresql://user:password@host:5432/dbname \
  -e DB_SCHEMA=magellan \
  -e DATA_SOURCE=postgres \
  magellan
```

To use the CSV backend instead (no database required):

```bash
docker run -p 5000:5000 \
  -e DATA_SOURCE=csv \
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

## Running Tests

```bash
npm test                  # all tests
npm run test:backend      # server/ only
```
