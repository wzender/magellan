# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build client and start server (production)
./start.sh

# Development (server auto-restarts on change, client with hot reload)
npm run dev                    # server only, port 5000
cd client && npm start         # client dev server, port 3000 (proxies /api to 5000)

# Build client only
cd client && npm run build

# Run all tests
npm test

# Run backend tests only
npm run test:backend            # jest server/

# Run a single test file
npx jest server/api/__tests__/endpoints.test.js
```

## Architecture

This is a single-page classification evaluation dashboard. The server serves the built React client as static files; in production there is one process on port 5000.

### Data layer: CSV not PostgreSQL

Despite the presence of `server/db.js` and `server/db-loader.js`, **the app currently uses `server/csv-loader.js`** which reads four CSV files from `data/` into an in-memory cache at startup. All API route files (`server/api/*.js`) `require('../csv-loader')`. The PostgreSQL code is unused.

`csv-loader.js` parses `attributes` and `metadata` columns with `JSON.parse` at load time so they arrive at the client as objects.

### Request flow

```
Browser → GET /api/...
  → server/index.js (Express)
  → server/api/{leaderboard,runs,confusionMatrix,transitionMatrix,records}.js
  → server/csv-loader.js (in-memory data, filtered in JS)
  → JSON response
```

### Frontend state (Dashboard.jsx)

`Dashboard.jsx` is the single stateful orchestrator. It owns all data-fetching `useEffect` hooks and passes data + callbacks down to four display components:

- **LeaderboardWidget** — sortable/resizable table; run selection (single click = confusion mode, checkbox = up to 2 runs = transition mode)
- **ConfusionMatrixPanel** — shown when 1 run selected; two independent `matrix-panel` divs (type matrix → subtype matrix); clicking a type cell loads the subtype matrix via a second API call
- **TransitionMatrixPanel** — shown when 2 runs selected; subtype-level diff matrix with correctness colouring
- **RowLevelTable** — rendered inside both matrix panels; expandable rows show `attributes`/`metadata` as syntax-highlighted JSON

### Two display modes

`isConfusionMode = selectedRuns.length === 1` / `isTransitionMode = selectedRuns.length === 2` controls which panel renders and which API calls fire.

### filter=incorrect

The "Incorrect Only" toggle (visible only in confusion mode) appends `&filter=incorrect` to all three confusion-related API calls. Each API route translates this to `incorrectOnly: true` passed into csv-loader functions, which then add `.filter(r => r.pred_subtype !== r.true_subtype)` before building matrices or returning records.

### CSS layout

`.dashboard` is a `flex-direction: column; height: 100vh` container. Fixed sections (header, toolbar, leaderboard) stack at the top; `.main-content` (`flex: 1; overflow-y: auto`) scrolls the matrix panels and records below. Each `.matrix-panel-body` has its own `overflow: auto; max-height: 40vh` giving independent scroll with sticky `thead`.
