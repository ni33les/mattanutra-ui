import {
  listingIsSelected,
  productIsApprovedForRetail
} from "@/lib/retail-listing-availability";

export type RetailStockEligibilityRow = Readonly<{
  backorderPolicy: "allow" | "deny";
  productStatus: string;
  retailPriceAmount: number | null;
  retailSellableProductId: string | null;
  status: string;
  stockQuantity: number;
}>;

export type RetailStockUnavailableLabels = Readonly<{
  ineligibleForSale?: string;
  ineligibleInactive?: string;
  ineligibleMissingRrp?: string;
  ineligibleNoStock?: string;
  ineligibleNotApproved?: string;
}>;

export function stockRowIsSelected(row: RetailStockEligibilityRow) {
  return Boolean(row.retailSellableProductId) && listingIsSelected(row.status);
}

export function stockRowIsUnselected(row: RetailStockEligibilityRow) {
  return (
    productIsApprovedForRetail(row.productStatus) && !stockRowIsSelected(row)
  );
}

export function stockRowEligibleForSale(row: RetailStockEligibilityRow) {
  if (!productIsApprovedForRetail(row.productStatus)) {
    return false;
  }

  if (!stockRowIsSelected(row)) {
    return false;
  }

  const rrp = row.retailPriceAmount;
  if (typeof rrp !== "number" || !Number.isFinite(rrp) || rrp <= 0) {
    return false;
  }

  return row.stockQuantity > 0 || row.backorderPolicy !== "deny";
}

export function stockRowIsOnSale(row: RetailStockEligibilityRow) {
  return stockRowEligibleForSale(row);
}

export function stockRowIsUnavailable(row: RetailStockEligibilityRow) {
  return stockRowIsSelected(row) && !stockRowIsOnSale(row);
}

export function stockRowUnavailableReason(
  row: RetailStockEligibilityRow,
  labels: RetailStockUnavailableLabels
) {
  if (!productIsApprovedForRetail(row.productStatus)) {
    return labels.ineligibleNotApproved ?? "Not approved";
  }

  if (!stockRowIsSelected(row)) {
    return labels.ineligibleInactive ?? "Unselected";
  }

  const rrp = row.retailPriceAmount;
  if (typeof rrp !== "number" || !Number.isFinite(rrp) || rrp <= 0) {
    return labels.ineligibleMissingRrp ?? "Missing RRP";
  }

  if (row.stockQuantity <= 0 && row.backorderPolicy === "deny") {
    return labels.ineligibleNoStock ?? "Out of stock, no backorder";
  }

  return labels.ineligibleForSale ?? "Unavailable";
}

export function stockRowIneligibleReason(
  row: RetailStockEligibilityRow,
  labels: RetailStockUnavailableLabels
) {
  return stockRowUnavailableReason(row, labels);
}
