import type { AdminRetailStockData } from "@/lib/admin-retail-stock";

export type ReorderPurchaseItem = Readonly<{
  assignedActiveUnits: number;
  amountToBuyUnits: number;
  brandName: string | null;
  currentStockQuantity: number;
  organisationId: string;
  productId: string;
  productTitle: string;
  recommendationPressureCount: number;
  riskLevel: AdminRetailStockData["reorderAdvice"][number]["riskLevel"] | null;
  source: "backorder" | "recommendation";
  unassignedDemandUnits: number;
  unorderedNeedUnits: number;
  wholesalePriceAmount: number | null;
}>;

export function reorderRiskRank(
  riskLevel: AdminRetailStockData["reorderAdvice"][number]["riskLevel"] | null
) {
  if (riskLevel === "out_of_stock") {
    return 0;
  }

  if (riskLevel === "reorder") {
    return 1;
  }

  if (riskLevel === "watch") {
    return 2;
  }

  return 3;
}

export function orgProductKey(
  organisationId: string,
  productId: string | null | undefined
) {
  return `${organisationId}:${productId ?? "unknown"}`;
}

export function activeShoppingListCoverageUnits(
  line: AdminRetailStockData["shoppingListLines"][number]
) {
  const assignedDemand = Math.max(
    line.assignedQuantity,
    line.requiredQuantity,
    line.unorderedNeedQuantity
  );

  if (assignedDemand < 1) {
    return Math.max(0, line.actualQuantity - line.stockedQuantity);
  }

  if (line.actualQuantity < assignedDemand) {
    return Math.max(0, line.actualQuantity - line.stockedQuantity);
  }

  return assignedDemand;
}

export function activeShoppingListReturnedDemandUnits(
  line: AdminRetailStockData["shoppingListLines"][number]
) {
  const assignedDemand = Math.max(
    line.assignedQuantity,
    line.requiredQuantity,
    line.unorderedNeedQuantity
  );

  return Math.max(0, assignedDemand - line.actualQuantity);
}

export function shoppingListIdFromResult(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return "";
  }

  const shoppingListId = (result as Record<string, unknown>).shoppingListId;

  return typeof shoppingListId === "string" ? shoppingListId : "";
}
