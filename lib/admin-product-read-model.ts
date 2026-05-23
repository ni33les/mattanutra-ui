import { getSql } from "@/lib/db";
import {
  emptyAdminProductsData,
  type AdminProductsData,
  type AdminProductRow,
  type ProductDbRow
} from "./admin-product-types";
import { rowFromDb } from "./admin-product-mappers";
import { isUuidValue, loadProductRows } from "./admin-products"; // transitional delegation until loadProductRows is fully moved here

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
    ? rows.map(rowFromDb).filter((row) => row.brandId === brandId)
    : [];
}

export async function getAdminProductsData(): Promise<AdminProductsData> {
  try {
    const rows = await loadProductRows();

    if (!rows) {
      return emptyAdminProductsData();
    }

    const mappedRows = rows.map(rowFromDb);

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
