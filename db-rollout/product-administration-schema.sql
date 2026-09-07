-- Additive v5 catalogue metadata. Existing product/order snapshots remain intact.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS administration jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.products'::regclass AND conname='products_administration_object_check') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_administration_object_check CHECK (administration IS NULL OR jsonb_typeof(administration)='object');
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.catalogue_correction_audit (
  correction_id text PRIMARY KEY,
  manifest_sha256 text NOT NULL,
  entity_table text NOT NULL CHECK (entity_table IN ('products','product_facts')),
  entity_id uuid NOT NULL,
  before_fingerprint text NOT NULL,
  after_fingerprint text NOT NULL,
  before_record jsonb NOT NULL,
  after_record jsonb NOT NULL,
  evidence jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.catalogue_correction_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Catalogue correction evidence is append-only'; END;
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.catalogue_correction_audit'::regclass AND tgname='catalogue_correction_audit_no_update_delete') THEN
    CREATE TRIGGER catalogue_correction_audit_no_update_delete BEFORE UPDATE OR DELETE ON public.catalogue_correction_audit FOR EACH ROW EXECUTE FUNCTION public.catalogue_correction_audit_immutable();
  END IF;
END $$;
