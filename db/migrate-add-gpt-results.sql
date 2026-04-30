CREATE TABLE IF NOT EXISTS gpt_results (
  run_id     INTEGER      NOT NULL,
  request_id VARCHAR(255) NOT NULL,
  verdict    VARCHAR(255),
  reasoning  TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, request_id)
);
