import {
  customerPriceFromRpp,
  normalizeCustomerPriceMarginPercent
} from "@/lib/customer-pricing";

export type RetailSellabilityHardReason =
  | "missing_retail_price"
  | "sellable_inactive"
  | "master_not_approved"
  | "out_of_stock_no_backorder";

export type RetailSellabilityAssessment = Readonly<{
  /** Eligible for full-beam, recommendations, and customer checkout. */
  eligible: boolean;
  customerUnitPrice: number | null;
  hardReasons: readonly RetailSellabilityHardReason[];
  /** Pharmacy is paid RRP (list price), not wholesale. */
  pharmacyUnitPayable: number | null;
  platformMarginPercent: number;
}>;

function moneyOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function positiveMoney(value: unknown): number | null {
  const amount = moneyOrNull(value);

  return amount !== null && amount > 0 ? amount : null;
}

/**
 * Sale eligibility + programmatic customer pricing.
 *
 * Customer pays RRP × (1 + platform%). Pharmacy is paid RRP.
 * Eligible for full-beam only when RRP is set and stock is available or backorder is allowed.
 */
export function assessRetailSellability(input: Readonly<{
  availableNow?: number | null;
  backorderPolicy?: string | null;
  marginPercent?: number | null;
  productStatus?: string | null;
  requireMasterApproved?: boolean;
  rrpPriceAmount: unknown;
  sellableStatus?: string | null;
}>): RetailSellabilityAssessment {
  const platformMarginPercent = normalizeCustomerPriceMarginPercent(
    input.marginPercent
  );
  const rrp = positiveMoney(input.rrpPriceAmount);
  const hardReasons: RetailSellabilityHardReason[] = [];
  const requireMaster = input.requireMasterApproved !== false;
  const productStatus = (input.productStatus ?? "approved").trim().toLowerCase();
  const sellableStatus = (input.sellableStatus ?? "active").trim().toLowerCase();
  const availableNow = Math.max(0, Math.round(Number(input.availableNow) || 0));
  const backorderAllowed =
    String(input.backorderPolicy ?? "allow").trim().toLowerCase() !== "deny";

  if (sellableStatus !== "active") {
    hardReasons.push("sellable_inactive");
  }

  if (requireMaster && productStatus !== "approved") {
    hardReasons.push("master_not_approved");
  }

  if (rrp === null) {
    hardReasons.push("missing_retail_price");
  }

  if (availableNow < 1 && !backorderAllowed) {
    hardReasons.push("out_of_stock_no_backorder");
  }

  const customerUnitPrice =
    rrp === null ? null : customerPriceFromRpp(rrp, platformMarginPercent);

  return {
    customerUnitPrice,
    eligible: hardReasons.length === 0 && customerUnitPrice !== null,
    hardReasons,
    pharmacyUnitPayable: rrp,
    platformMarginPercent
  };
}

export function retailSellabilityReasonLabel(
  reason: RetailSellabilityHardReason
): string {
  switch (reason) {
    case "missing_retail_price":
      return "Missing retail price (RRP)";
    case "sellable_inactive":
      return "Sellable product is not active";
    case "master_not_approved":
      return "Master product is not approved";
    case "out_of_stock_no_backorder":
      return "Out of stock and backorder disabled";
    default:
      return reason;
  }
}
