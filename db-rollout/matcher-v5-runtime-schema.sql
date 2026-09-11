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
-- Defer the shared catalogue fence until commit. The event is transaction-local
-- by key and removed by its deferred trigger; it is never a growing work queue.
CREATE TABLE IF NOT EXISTS public.catalogue_revision_commits (
  transaction_id bigint PRIMARY KEY
);
CREATE OR REPLACE FUNCTION public.commit_catalogue_runtime_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.catalogue_runtime_revision SET revision=revision+1, updated_at=now() WHERE singleton=true;
  DELETE FROM public.catalogue_revision_commits WHERE transaction_id=NEW.transaction_id;
  RETURN NULL;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.catalogue_revision_commits'::regclass AND tgname='commit_catalogue_runtime_revision') THEN
    CREATE CONSTRAINT TRIGGER commit_catalogue_runtime_revision
      AFTER INSERT ON public.catalogue_revision_commits DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.commit_catalogue_runtime_revision();
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.bump_catalogue_runtime_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.catalogue_revision_commits(transaction_id) VALUES(txid_current()) ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['products','product_facts','supplements','supplement_aliases','supplement_safety_limits','supplement_country_availability','retail_sellable_products'] LOOP
    IF to_regclass('public.'||table_name) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||table_name) AND tgname='catalogue_runtime_revision_changed') THEN
      EXECUTE format('CREATE TRIGGER catalogue_runtime_revision_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalogue_runtime_revision()',table_name);
    END IF;
  END LOOP;
END $$;
-- Catalogue SQL also depends on retailer eligibility and platform margin, and
-- brand approval. Only meaningful changes advance the shared identity.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.organisations'::regclass AND tgname='catalogue_runtime_revision_org_insert_delete') THEN
    CREATE TRIGGER catalogue_runtime_revision_org_insert_delete AFTER INSERT OR DELETE OR TRUNCATE ON public.organisations
      FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalogue_runtime_revision();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.organisations'::regclass AND tgname='catalogue_runtime_revision_org_changed') THEN
    CREATE TRIGGER catalogue_runtime_revision_org_changed AFTER UPDATE ON public.organisations FOR EACH ROW
      WHEN ((OLD.name, OLD.organisation_type, OLD.status, OLD.country_code, OLD.currency, OLD.slug, OLD.metadata -> 'customerPriceMarginPercent')
        IS DISTINCT FROM
        (NEW.name, NEW.organisation_type, NEW.status, NEW.country_code, NEW.currency, NEW.slug, NEW.metadata -> 'customerPriceMarginPercent'))
      EXECUTE FUNCTION public.bump_catalogue_runtime_revision();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.product_brands'::regclass AND tgname='catalogue_runtime_revision_brand_insert_delete') THEN
    CREATE TRIGGER catalogue_runtime_revision_brand_insert_delete AFTER INSERT OR DELETE OR TRUNCATE ON public.product_brands
      FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalogue_runtime_revision();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.product_brands'::regclass AND tgname='catalogue_runtime_revision_brand_changed') THEN
    CREATE TRIGGER catalogue_runtime_revision_brand_changed AFTER UPDATE ON public.product_brands FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION public.bump_catalogue_runtime_revision();
  END IF;
END $$;
ALTER TABLE public.product_recommendation_runs ADD COLUMN IF NOT EXISTS catalogue_revision bigint;
ALTER TABLE public.product_recommendation_runs ADD COLUMN IF NOT EXISTS catalogue_fingerprint text;
ALTER TABLE public.product_recommendation_runs ADD COLUMN IF NOT EXISTS search_effort text NOT NULL DEFAULT 'standard';
