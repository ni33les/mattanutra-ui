import { getSql } from "@/lib/db";

/**
 * Thai Tax Configuration for Dream Pharmacy / MattaNutra fulfillment.
 *
 * As of 2026, the main relevant rates for supplement sales in Thailand are:
 * - VAT: 7% (standard)
 * - Possible Withholding Tax (WHT) on certain supplier payments (1%, 2%, 3%, 5% etc. depending on category)
 *
 * This module provides a versioned, effective-dated configuration that can be managed via admin UI.
 */

export type ThaiTaxType = "vat" | "wht" | "other";

export type ThaiTaxRate = Readonly<{
  id: string;
  taxType: ThaiTaxType;
  rate: number; // e.g. 0.07 for 7%
  description: string;
  effectiveFrom: string; // ISO date
  effectiveTo?: string | null;
  isActive: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}>;

export type TaxCalculationInput = Readonly<{
  amount: number; // in smallest currency unit (satang for THB, or micros)
  currency?: string;
  taxType?: ThaiTaxType;
  asOf?: Date | string;
}>;

export type TaxCalculationResult = Readonly<{
  taxableAmount: number;
  taxAmount: number;
  totalWithTax: number;
  rate: number;
  taxType: ThaiTaxType;
  currency: string;
  appliedRateId?: string | null;
}>;

/**
 * Default / fallback rates (used if DB is unavailable or no configured rate).
 * These are the standard 2026 Thai rates for most supplement sales.
 */
const FALLBACK_RATES: Record<ThaiTaxType, { rate: number; description: string }> = {
  vat: { rate: 0.07, description: "Thailand VAT 7% (standard rate)" },
  wht: { rate: 0.03, description: "Default Withholding Tax 3% (adjust per supplier category)" },
  other: { rate: 0, description: "No tax or custom rate" },
};

/**
 * Get the active tax rate for a given type as of a specific date.
 * Falls back to safe defaults if the database is unavailable.
 */
export async function getActiveThaiTaxRate(
  taxType: ThaiTaxType,
  asOf: Date | string = new Date()
): Promise<{ rate: number; description: string; rateId?: string | null }> {
  const sql = getSql();
  if (!sql) {
    const fallback = FALLBACK_RATES[taxType];
    return { rate: fallback.rate, description: fallback.description };
  }

  const asOfDate = typeof asOf === "string" ? new Date(asOf) : asOf;

  try {
    const rows = await sql<Array<{ id: string; rate: number; description: string }>>`
      SELECT id, rate, description
      FROM public.thai_tax_rates
      WHERE tax_type = ${taxType}
        AND is_active = true
        AND effective_from <= ${asOfDate}
        AND (effective_to IS NULL OR effective_to > ${asOfDate})
      ORDER BY effective_from DESC
      LIMIT 1
    `;

    if (rows.length > 0) {
      return {
        rate: Number(rows[0].rate),
        description: rows[0].description,
        rateId: rows[0].id,
      };
    }
  } catch (error) {
    console.warn("Failed to load Thai tax rate from DB, using fallback", error);
  }

  const fallback = FALLBACK_RATES[taxType];
  return { rate: fallback.rate, description: fallback.description };
}

/**
 * Calculate tax for a given amount using the active rate.
 * Returns amounts in the same unit as the input (recommended: use integer satang or micros).
 */
export async function calculateThaiTax(
  input: TaxCalculationInput
): Promise<TaxCalculationResult> {
  const taxType = input.taxType ?? "vat";
  const currency = input.currency ?? "THB";
  const { rate, rateId } = await getActiveThaiTaxRate(taxType, input.asOf);

  const taxableAmount = Math.round(input.amount);
  const taxAmount = Math.round(taxableAmount * rate);
  const totalWithTax = taxableAmount + taxAmount;

  return {
    taxableAmount,
    taxAmount,
    totalWithTax,
    rate,
    taxType,
    currency,
    appliedRateId: rateId ?? null,
  };
}

/**
 * Helper to record a tax calculation as a BPM event (recommended).
 * Import from fulfillment-bpm and call after successful calculation.
 */
export function buildTaxBpmProperties(result: TaxCalculationResult) {
  return {
    taxType: result.taxType,
    taxRate: result.rate,
    taxableAmount: result.taxableAmount,
    taxAmount: result.taxAmount,
    totalWithTax: result.totalWithTax,
    currency: result.currency,
    appliedRateId: result.appliedRateId,
  };
}

/**
 * List all configured tax rates (for the management UI).
 */
export async function listThaiTaxRates(): Promise<ThaiTaxRate[]> {
  const sql = getSql();
  if (!sql) return [];

  const rows = await sql<ThaiTaxRate[]>`
    SELECT
      id,
      tax_type as "taxType",
      rate,
      description,
      effective_from as "effectiveFrom",
      effective_to as "effectiveTo",
      is_active as "isActive",
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM public.thai_tax_rates
    ORDER BY tax_type, effective_from DESC
  `;

  return rows as ThaiTaxRate[];
}
