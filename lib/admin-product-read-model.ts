import {
  emptyAdminProductsData,
  type AdminProductsData,
  type AdminProductRow
} from "./admin-product-types.ts";
import { rowFromDb } from "./admin-product-mappers.ts";
import { isUuidValue, loadProductRows } from "./admin-products.ts"; // transitional delegation until loadProductRows is fully moved here
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import { getProductDecisionStatsByProduct } from "@/lib/admin-recommendation-insights";

// Read model helpers and queries extracted as part of Sprint 2 refactor.

export function summaryFromRows(rows: AdminProductRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.status === "ignored") {
        summary.ignored += 1;
      } else if (row.status === "pending_review") {
        summary.pendingReview += 1;
      } else if (row.status === "approved") {
        summary.approved += 1;
      }

      if (row.affiliateStatus === "active") {
        summary.activeAffiliate += 1;
      }

      if (row.facts.length < 1 || row.labelStatus !== "parsed") {
        summary.missingFacts += 1;
      }

      if (row.validationLabel === "Missing Image") {
        summary.missingImage += 1;
      }

      if (row.validationLabel === "Dirty Data") {
        summary.dirtyData += 1;
      }

      return summary;
    },
    {
      activeAffiliate: 0,
      dirtyData: 0,
      ignored: 0,
      missingFacts: 0,
      missingImage: 0,
      pendingReview: 0,
      total: 0,
      approved: 0
    }
  );
}


// Temporary delegation — in the next step we'll fully own loadProductRows
export async function loadAdminProductRow(productId: string) {
  const rows = await loadProductRows(productId);
  return rows?.[0] ? rowFromDb(rows[0]) : null;
}

export async function loadAdminProductRowsForBrand(brandId: string) {
  if (!isUuidValue(brandId)) {
    return [];
  }

  const rows = await loadProductRows();

  return rows
    ? rows.map((row) => rowFromDb(row)).filter((row) => row.brandId === brandId)
    : [];
}

export async function getAdminProductsData(
  range: AdminDashboardRange = "all"
): Promise<AdminProductsData> {
  try {
    const rows = await loadProductRows();

    if (!rows) {
      return emptyAdminProductsData();
    }

    const decisionStats = await getProductDecisionStatsByProduct(range);
    const mappedRows = rows.map((row) =>
      rowFromDb(row, decisionStats.get(row.id))
    );

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      platforms: [...new Set(mappedRows.map((row) => row.platform))].sort(),
      rows: mappedRows,
      summary: summaryFromRows(mappedRows)
    };
  } catch (error) {
    console.error("Unable to load products", error);
    return emptyAdminProductsData();
  }
}
