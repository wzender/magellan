BEGIN;

ALTER TABLE IF EXISTS runs
  ADD COLUMN IF NOT EXISTS benchmark TEXT;

DO $$
BEGIN
  IF to_regclass('benchmarks') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'runs'
         AND column_name = 'benchmark_id'
     )
  THEN
    UPDATE runs r
    SET benchmark = b.name
    FROM benchmarks b
    WHERE r.benchmark_id = b.id
      AND (r.benchmark IS NULL OR TRIM(r.benchmark) = '');
  END IF;

  IF to_regclass('runs') IS NOT NULL THEN
    UPDATE runs
    SET benchmark = 'Unknown'
    WHERE benchmark IS NULL OR TRIM(benchmark) = '';
  END IF;
END $$;

ALTER TABLE IF EXISTS runs
  ALTER COLUMN benchmark SET NOT NULL;

DROP INDEX IF EXISTS idx_runs_benchmark_id;

ALTER TABLE IF EXISTS runs
  DROP CONSTRAINT IF EXISTS runs_benchmark_id_fkey,
  DROP COLUMN IF EXISTS benchmark_id;

DROP TABLE IF EXISTS benchmarks CASCADE;

CREATE INDEX IF NOT EXISTS idx_runs_benchmark ON runs(benchmark);

COMMIT;
