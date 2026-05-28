#!/usr/bin/env node --env-file-if-exists=.env.local --experimental-strip-types --import ./register-ts-path-loader.mjs

/**
 * Applies the Thai Tax Rate configuration table required for Dream Pharmacy invoices and compliance.
 *
 * Run with:
 *   npm run thai-tax:schema:apply
 */

import { getSql } from "@/lib/db";

async function main() {
  const sql = getSql();
  if (!sql) {
    console.error("Database connection unavailable. Set DATABASE_URL or equivalent.");
    process.exit(1);
  }

  console.log("Applying Thai tax rate schema...");

  await sql`
    CREATE TABLE IF NOT EXISTS public.thai_tax_rates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tax_type text NOT NULL CHECK (tax_type IN ('vat', 'wht', 'other')),
      rate numeric(10,6) NOT NULL CHECK (rate >= 0 AND rate <= 1),
      description text NOT NULL,
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      is_active boolean NOT NULL DEFAULT true,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT thai_tax_rates_no_overlap
        EXCLUDE USING gist (
          tax_type WITH =,
          daterange(effective_from, COALESCE(effective_to, 'infinity'::date)) WITH &&
        ) WHERE (is_active)
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_thai_tax_rates_active_lookup
      ON public.thai_tax_rates (tax_type, effective_from, effective_to)
      WHERE is_active = true;
  `;

  // Seed the standard 7% VAT rate if no active VAT rate exists
  await sql`
    INSERT INTO public.thai_tax_rates (tax_type, rate, description, effective_from)
    SELECT 'vat', 0.07, 'Thailand VAT 7% (standard rate for goods and services)', CURRENT_DATE
    WHERE NOT EXISTS (
      SELECT 1 FROM public.thai_tax_rates
      WHERE tax_type = 'vat' AND is_active = true
    );
  `;

  console.log("Thai tax rate schema applied successfully.");
  console.log("You can now manage rates via the Dream Pharmacy admin section (to be built).");
}

main().catch((err) => {
  console.error("Failed to apply Thai tax schema:", err);
  process.exit(1);
});
