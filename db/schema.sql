-- Classification Evaluation & Analysis System Database Schema

-- Drop existing tables if they exist (for fresh start)
DROP TABLE IF EXISTS run_results CASCADE;
DROP TABLE IF EXISTS leaderboard CASCADE;
DROP TABLE IF EXISTS runs CASCADE;
DROP TABLE IF EXISTS benchmarks CASCADE;

-- Benchmarks table
CREATE TABLE benchmarks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Runs table (a run is a single execution of a model against a benchmark)
CREATE TABLE runs (
  id SERIAL PRIMARY KEY,
  benchmark_id INTEGER NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
  run_name VARCHAR(255) NOT NULL,
  model_version VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(benchmark_id, run_name)
);

-- Main results table: stores individual prediction records
CREATE TABLE run_results (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  request_id VARCHAR(255) NOT NULL,
  attributes JSONB,
  attributes_en JSONB,
  metadata JSONB,
  true_type VARCHAR(100) NOT NULL,
  pred_type VARCHAR(100) NOT NULL,
  true_subtype VARCHAR(100) NOT NULL,
  pred_subtype VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leaderboard table: stores aggregated metrics per run and benchmark
CREATE TABLE leaderboard (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  benchmark_id INTEGER NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
  benchmark_length INTEGER,
  subtype_accuracy NUMERIC(5, 4),
  subtype_f1_weighted NUMERIC(5, 4),
  type_f1_weighted NUMERIC(5, 4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization

-- Index for filtering by run and finding results
CREATE INDEX idx_run_results_run_id ON run_results(run_id);

-- Index for filtering by record type/subtype pairs (for confusion matrix queries)
CREATE INDEX idx_run_results_types ON run_results(run_id, true_type, pred_type);
CREATE INDEX idx_run_results_subtypes ON run_results(run_id, true_subtype, pred_subtype);

-- Index for benchmark-specific queries
CREATE INDEX idx_runs_benchmark_id ON runs(benchmark_id);
CREATE INDEX idx_leaderboard_benchmark_id ON leaderboard(benchmark_id);

-- Index on attributes and metadata for potential filtering by content
CREATE INDEX idx_run_results_attributes ON run_results USING GIN(attributes);
CREATE INDEX idx_run_results_attributes_en ON run_results USING GIN(attributes_en);
CREATE INDEX idx_run_results_metadata ON run_results USING GIN(metadata);

-- Index for transition matrix queries (comparing two runs)
CREATE INDEX idx_run_results_request_id ON run_results(request_id, run_id);
