/**
 * Client-safe financials display helpers (no DB / Node-only imports).
 */

export type AdminFinancialDirection = "in" | "out" | "neutral";
export type AdminFinancialEntryBasis = "nominal" | "actual" | "all";
export type AdminFinancialCategory =
  | "ai"
  | "hosting"
  | "other"
  | "payment_fee"
  | "payout"
  | "refund"
  | "revenue";

export function financialDirection(
  category: AdminFinancialCategory,
  metadata: Record<string, unknown> = {}
): AdminFinancialDirection {
  if (category === "revenue") {
    return "in";
  }

  if (
    category === "payout" ||
    category === "refund" ||
    category === "payment_fee" ||
    category === "ai" ||
    category === "hosting"
  ) {
    return "out";
  }

  if (metadata.accountingBasis === "stripe_payout" || metadata.voided === true) {
    return "neutral";
  }

  return "neutral";
}

export function signedUsdForRow(
  amountUsd: number,
  direction: AdminFinancialDirection
) {
  if (direction === "out") {
    return -Math.abs(amountUsd);
  }

  if (direction === "in") {
    return Math.abs(amountUsd);
  }

  return 0;
}

/**
 * Adaptive fraction digits so micro AI costs are not rounded to 0.00.
 * - ≥ 1 → 2 dp
 * - ≥ 0.01 → 2–4 dp
 * - ≥ 0.0001 → 4–6 dp
 * - smaller → 6–8 dp
 */
export function ledgerMoneyFractionDigits(amount: number) {
  const absolute = Math.abs(amount);

  if (!Number.isFinite(absolute) || absolute === 0) {
    return { maximumFractionDigits: 2, minimumFractionDigits: 2 };
  }

  if (absolute >= 1) {
    return { maximumFractionDigits: 2, minimumFractionDigits: 2 };
  }

  if (absolute >= 0.01) {
    return { maximumFractionDigits: 4, minimumFractionDigits: 2 };
  }

  if (absolute >= 0.0001) {
    return { maximumFractionDigits: 6, minimumFractionDigits: 4 };
  }

  return { maximumFractionDigits: 8, minimumFractionDigits: 6 };
}

/**
 * Format ledger amounts as plain numbers (no $ / currency symbol).
 * Currency belongs in the column header (e.g. USD). Outflows stay absolute;
 * the UI styles them red.
 */
export function formatLedgerMoney(
  amountUsd: number,
  _direction: AdminFinancialDirection,
  locale: string,
  _currency = "USD"
) {
  const absolute = Math.abs(amountUsd);
  const fractionDigits = ledgerMoneyFractionDigits(absolute);

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: fractionDigits.maximumFractionDigits,
    minimumFractionDigits: fractionDigits.minimumFractionDigits,
    useGrouping: true
  }).format(absolute);
}

export function normalizeFinancialEntryBasis(
  value: string | null | undefined
): AdminFinancialEntryBasis {
  if (value === "actual" || value === "all") {
    return value;
  }

  return "nominal";
}

export function normalizeFinancialPage(value: number | string | null | undefined) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
}

export function normalizeFinancialPageSize(
  value: number | string | null | undefined,
  defaults: Readonly<{ defaultSize?: number; maxSize?: number }> = {}
) {
  const defaultSize = defaults.defaultSize ?? 50;
  const maxSize = defaults.maxSize ?? 200;
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultSize;
  }

  return Math.min(maxSize, Math.floor(parsed));
}
