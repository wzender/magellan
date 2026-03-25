# Classification Evaluation & Analysis System

## Overview
A modern single-page dashboard for evaluating, benchmarking, and exploring classification model performance with interactive visualizations and drill-down analytics.

## Features
- **Leaderboard**: View and compare classification metrics across model versions
- **Confusion Matrices**: Analyze type and subtype prediction errors
- **Transition Matrix**: Compare prediction changes between model runs
- **Row-Level Exploration**: Drill into individual records with expandable attributes/metadata
- **Responsive Design**: Handles dense taxonomies (20 types × ~400 subtypes)
- **Modern UI**: Built with React and clean CSS for optimal data visualization

## Tech Stack
- **Backend**: Node.js/Express, PostgreSQL, CORS
- **Frontend**: React.js, CSS3
- **Testing**: Jest, React Testing Library, Supertest
- **Database**: PostgreSQL 12+

## Quick Start

### Prerequisites
- Node.js 14+
- PostgreSQL 12+
- npm or yarn

### Installation
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Create database and schema
psql -U postgres -f db/schema.sql

# Seed database with mock data
npm run mock-seed

# Start development server
npm run dev

# Start frontend (in separate terminal)
npm run dev:frontend
```

### Running Tests
```bash
# Run all tests
npm test

# Run backend tests only
npm run test:backend

# Run frontend tests only
npm run test:frontend
```

## Project Structure
```
.
├── server/
│   ├── api/              # API endpoints
│   │   ├── leaderboard.js
│   │   ├── runs.js
│   │   ├── confusionMatrix.js
│   │   ├── transitionMatrix.js
│   │   ├── records.js
│   │   └── __tests__/
│   ├── mock/             # Mock data generation
│   │   ├── mockDataGenerator.js
│   │   └── seedDatabase.js
│   ├── db.js             # Database connection
│   └── index.js          # Server entry point
├── client/
│   ├── components/       # React components
│   │   ├── Dashboard.jsx
│   │   ├── LeaderboardWidget.jsx
│   │   ├── ConfusionMatrixPanel.jsx
│   │   ├── TransitionMatrixPanel.jsx
│   │   ├── RowLevelTable.jsx
│   │   ├── BenchmarkDropdown.jsx
│   │   ├── RunSelector.jsx
│   │   ├── styles/
│   │   │   └── styles.css
│   │   └── __tests__/
│   ├── public/
│   │   └── index.html
│   └── index.js          # Frontend entry point
├── db/
│   └── schema.sql        # Database schema
├── package.json
├── tasks/                # PRD and task list
└── README.md
```

## API Endpoints

### Benchmarks & Leaderboard
- `GET /api/benchmarks` - Get all benchmarks
- `GET /api/leaderboard?benchmark_id=X` - Get leaderboard metrics

### Runs
- `GET /api/runs?benchmark_id=X` - Get runs for benchmark
- `GET /api/runs/:id` - Get specific run details

### Confusion Matrices
- `GET /api/confusion-matrix?run_id=X` - Get type/subtype confusion matrices
- `GET /api/confusion-matrix/subtype?run_id=X&true_type=Y&pred_type=Z` - Get subtype confusion

### Records
- `GET /api/records?run_id=X` - Get paginated records with filters
- `GET /api/records/:id` - Get specific record

### Transition Matrix
- `GET /api/transition-matrix?run_id1=X&run_id2=Y&min_count=1` - Compare two runs

## Database Schema

### Benchmarks Table
```sql
- id (PK)
- name (UNIQUE)
- created_at
```

### Runs Table
```sql
- id (PK)
- benchmark_id (FK)
- run_name
- model_version
- created_at
```

### RunResults Table
```sql
- id (PK)
- run_id (FK)
- record_id
- attributes (JSONB)
- metadata (JSONB)
- true_type
- pred_type
- true_subtype
- pred_subtype
```

### Leaderboard Table
```sql
- id (PK)
- run_id (FK, UNIQUE)
- benchmark_id (FK)
- benchmark_length
- subtype_accuracy
- subtype_f1_weighted
- type_f1_weighted
```

## Key Features & Performance

### Handling Dense Data
- Optimized SQL queries with strategic indexing
- Virtualized tables for large datasets
- Lazy loading for matrix navigation
- Responsive design with breakpoints

### Metrics Calculated
- **Subtype Accuracy**: Exact match between true and predicted subtypes
- **Subtype F1 (Weighted)**: Precision-weighted F1 per subtype
- **Type F1 (Weighted)**: Precision-weighted F1 per type

### Drill-Down UI Flow
1. Select benchmark & run
2. View type confusion matrix
3. Click type cell → view subtype confusion
4. Click subtype cell → view records
5. Expand row → view full attributes/metadata

## Development

### Adding New Features
1. Create API endpoint in `server/api/`
2. Add corresponding React component in `client/components/`
3. Write tests for both
4. Update this README

### Extending the Backend
All API endpoints follow the same pattern:
- Express route handler with query parameters
- Database query via `pg` pool
- JSON response or error status

### Extending the Frontend
All React components follow these conventions:
- Functional components with hooks
- Props-based data flow
- CSS modules/classes for styling
- Tests in adjacent `__tests__` directory

## Performance Optimization

### Backend
- Connection pooling (pg)
- Query indexing on type/subtype fields
- Pagination for record endpoints
- JSONB GIN indexes for attribute searching

### Frontend
- Virtual scrolling for large tables
- Lazy loading of data
- Memoization of expensive computations
- CSS compression and minification

## Environment Variables
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=classification_eval
DB_USER=postgres
DB_PASSWORD=postgres
PORT=5000
NODE_ENV=development
```

## License
MIT

## Support
For issues or questions, please refer to the task list and PRD in `/tasks/`
