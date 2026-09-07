ALTER TABLE public.assessment_product_preferences ADD COLUMN IF NOT EXISTS search_effort text NOT NULL DEFAULT 'standard';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.assessment_product_preferences'::regclass AND conname='assessment_product_preferences_search_effort_check') THEN
    ALTER TABLE public.assessment_product_preferences ADD CONSTRAINT assessment_product_preferences_search_effort_check CHECK (search_effort IN ('standard','expanded'));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.catalogue_runtime_revision (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton=true),
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.catalogue_runtime_revision (singleton) VALUES (true) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.bump_catalogue_runtime_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.catalogue_runtime_revision SET revision=revision+1,updated_at=now() WHERE singleton=true;
  RETURN NULL;
END $$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['products','product_facts','supplements','supplement_aliases','supplement_safety_limits','supplement_country_availability','retail_sellable_products'] LOOP
    IF to_regclass('public.'||table_name) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||table_name) AND tgname='catalogue_runtime_revision_changed') THEN
      EXECUTE format('CREATE TRIGGER catalogue_runtime_revision_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalogue_runtime_revision()',table_name);
    END IF;
  END LOOP;
END $$;
ALTER TABLE public.product_recommendation_runs ADD COLUMN IF NOT EXISTS catalogue_revision bigint;
ALTER TABLE public.product_recommendation_runs ADD COLUMN IF NOT EXISTS catalogue_fingerprint text;
ALTER TABLE public.product_recommendation_runs ADD COLUMN IF NOT EXISTS search_effort text NOT NULL DEFAULT 'standard';
