import { productIsApprovedForRetail } from "@/lib/retail-listing-availability";

export type RetailStockEligibilityRow = Readonly<{
  backorderPolicy: "allow" | "deny";
  productStatus: string;
  retailPriceAmount: number | null;
  retailSellableProductId: string | null;
  status: string;
  stockQuantity: number;
}>;

export function stockRowIsSelected(row: RetailStockEligibilityRow) {
  return Boolean(row.retailSellableProductId);
}

export function stockRowEligibleForSale(row: RetailStockEligibilityRow) {
  if (!productIsApprovedForRetail(row.productStatus)) {
    return false;
  }

  if (!stockRowIsSelected(row) || row.status !== "active") {
    return false;
  }

  const rrp = row.retailPriceAmount;
  if (typeof rrp !== "number" || !Number.isFinite(rrp) || rrp <= 0) {
    return false;
  }

  return row.stockQuantity > 0 || row.backorderPolicy !== "deny";
}

export function stockRowIneligibleReason(
  row: RetailStockEligibilityRow,
  labels: Readonly<{
    ineligibleForSale?: string;
    ineligibleInactive?: string;
    ineligibleMissingRrp?: string;
    ineligibleNoStock?: string;
    ineligibleNotApproved?: string;
  }>
) {
  if (!productIsApprovedForRetail(row.productStatus)) {
    return labels.ineligibleNotApproved ?? "Not approved";
  }

  if (!stockRowIsSelected(row) || row.status !== "active") {
    return labels.ineligibleInactive ?? "Inactive";
  }

  const rrp = row.retailPriceAmount;
  if (typeof rrp !== "number" || !Number.isFinite(rrp) || rrp <= 0) {
    return labels.ineligibleMissingRrp ?? "Missing RRP";
  }

  if (row.stockQuantity <= 0 && row.backorderPolicy === "deny") {
    return labels.ineligibleNoStock ?? "Out of stock, no backorder";
  }

  return labels.ineligibleForSale ?? "Ineligible for sale";
}
