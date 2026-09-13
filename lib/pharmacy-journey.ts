import type { Locale } from "@/lib/i18n";

export const pharmacyAnalysisPolicy = Object.freeze({ generateHealthScore: true, waitForHealthScore: false,
  waitForProducts: true, pricingBasis: "pharmacy-rrp-v1" });

export function pharmacyOrganisationSlug(slug: string) {
  return slug === "delight" ? "delight-pharmacy" : slug;
}

export function pharmacyPath(locale: Locale, slug: string, page: "landing" | "quiz" | "reveal" | "plan",
  query: Record<string, string | undefined> = {}) {
  const publicSlug = slug === "delight-pharmacy" ? "delight" : slug;
  const params = new URLSearchParams(Object.entries(query).filter((row): row is [string, string] => Boolean(row[1])));
  return `/${locale}/retail/${encodeURIComponent(publicSlug)}/${page}${params.size ? `?${params}` : ""}`;
}

/** RRP is a captured commercial fact, never inferred from the online price. */
export function pharmacyCandidatePrice(candidate: { retailRrpPriceAmount?: number | null; priceAmount?: number | null }) {
  const value = candidate.retailRrpPriceAmount;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function belongsToPharmacy(product: { sellerId: string; candidate: { selectedRetailerOrganisationId?: string | null } }, organisationId: string) {
  return product.candidate.selectedRetailerOrganisationId === organisationId;
}
