-- Widen legacy integer telemetry without deleting or rounding historical data.
-- Unrestricted numeric also preserves future coverage precision. Reapplication
-- leaves the current column untouched and does not rewrite existing events.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.agentic_matcher_events'::regclass
      AND attname = 'coverage_percent' AND NOT attisdropped
      AND (atttypid <> 'numeric'::regtype OR atttypmod <> -1)
  ) THEN
    ALTER TABLE public.agentic_matcher_events
      ALTER COLUMN coverage_percent TYPE numeric USING coverage_percent::numeric;
  END IF;
END $$;
