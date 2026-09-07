-- Additive correction receipts. Historical reference versions remain immutable.
ALTER TABLE public.supplement_safety_limits
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS basis_rationale text;

CREATE TABLE IF NOT EXISTS public.supplement_safety_reference_corrections (
  environment text NOT NULL CHECK (environment IN ('dev', 'uat')),
  correction_id text NOT NULL,
  manifest_id text NOT NULL,
  supplement_id uuid NOT NULL REFERENCES public.supplements(id) ON DELETE RESTRICT,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  before_heads_fingerprint text NOT NULL CHECK (before_heads_fingerprint ~ '^[a-f0-9]{64}$'),
  after_heads_fingerprint text NOT NULL CHECK (after_heads_fingerprint ~ '^[a-f0-9]{64}$'),
  before_heads jsonb NOT NULL,
  after_heads jsonb NOT NULL,
  manifest jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, correction_id)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.supplement_safety_reference_corrections'::regclass AND tgname='supplement_safety_reference_corrections_immutable') THEN
    CREATE TRIGGER supplement_safety_reference_corrections_immutable BEFORE UPDATE OR DELETE
      ON public.supplement_safety_reference_corrections FOR EACH ROW EXECUTE FUNCTION public.prevent_domain_version_mutation();
  END IF;
END $$;
