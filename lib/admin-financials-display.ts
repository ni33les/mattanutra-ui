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
 * Format ledger amounts: outflows as ($x.xx), inflows as $x.xx.
 */
export function formatLedgerMoney(
  amountUsd: number,
  direction: AdminFinancialDirection,
  locale: string,
  currency = "USD"
) {
  const absolute = Math.abs(amountUsd);
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(absolute);

  if (direction === "out") {
    return `(${formatted})`;
  }

  return formatted;
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
