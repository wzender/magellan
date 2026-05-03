DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE column_name = 'missing_output'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I RENAME COLUMN missing_output TO missing_subtype', r.table_schema, r.table_name);
    RAISE NOTICE 'Renamed missing_output → missing_subtype in %.%', r.table_schema, r.table_name;
  END LOOP;
END;
$$;
