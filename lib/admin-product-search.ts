import type { AdminProductRow } from "@/lib/admin-products";
import { getAdminProductsData } from "@/lib/admin-products"; // transitional - will use read-model directly later
import { productSafetyPasses } from "@/lib/admin-product-mappers";
import type { ProductCandidate } from "@/lib/product-recommendations";

function normalizeProductSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productSearchTokens(value: unknown) {
  return normalizeProductSearchText(value).split(" ").filter(Boolean);
}

function productSearchTerms(value: string) {
  const tokens = productSearchTokens(value);

  return tokens.length > 1
    ? tokens.filter((token) => token !== "l")
    : tokens;
}

function productSearchIndex(row: AdminProductRow) {
  const fields = [
    row.title,
    row.titleEn,
    row.titleTh,
    row.brandName,
    row.category,
    row.fdaApprovalNumber,
    row.productKind,
    row.productAudience,
    row.platform,
    row.region,
    ...(row.availableCountryCodes ?? []),
    ...(row.manufacturerCountryCodes ?? []),
    row.status,
    row.labelStatus,
    row.validationLabel,
    ...row.facts.flatMap((fact) => [
      fact.name,
      fact.normalizedName,
      fact.itemType,
      fact.confidence,
      fact.source,
      fact.sourceText,
      ...(fact.aliasKeys ?? [])
    ]),
    ...row.offers.flatMap((offer) => [
      offer.linkType,
      offer.network,
      offer.platform,
      offer.status
    ])
  ];
  const normalizedFields = fields
    .map(normalizeProductSearchText)
    .filter(Boolean);
  const text = normalizedFields.join(" ");

  return {
    compactText: text.replace(/\s+/g, ""),
    text,
    tokens: new Set(normalizedFields.flatMap((field) => field.split(" ")))
  };
}

function productSearchTermMatches(
  index: ReturnType<typeof productSearchIndex>,
  term: string
) {
  if (index.tokens.has(term)) {
    return true;
  }

  return term.length >= 3 || /\d/.test(term)
    ? index.text.includes(term) || index.compactText.includes(term)
    : false;
}

export function productMatchesSearch(row: AdminProductRow, search: string) {
  const terms = productSearchTerms(search);

  if (terms.length < 1) {
    return true;
  }

  const index = productSearchIndex(row);

  return terms.every((term) => productSearchTermMatches(index, term));
}

// ---------------------------------------------------------------------------
// Recommendation Candidates (with cache)
// This is the proper home for getProductRecommendationCandidates + cache.
// ---------------------------------------------------------------------------

let productRecommendationCandidateCache: ProductCandidate[] | null = null;

export function clearProductRecommendationCandidateCache() {
  productRecommendationCandidateCache = null;
}

export async function getProductRecommendationCandidates(input: Readonly<{
  countryCode?: string | null;
  includeIneligible?: boolean;
  limit?: number;
  productId?: string | null;
}>) {
  if (!productRecommendationCandidateCache) {
    const data = await getAdminProductsData();
    const rows = data.rows;

    productRecommendationCandidateCache = rows.map((row) => {
      const automatedSafetyPassed = productSafetyPasses(row.facts, row.sourceEvidence?.importStatus ?? null);

      return {
        ...row,
        automatedSafetyPassed,
        // Ensure shape matches what recommendProductStackFullBeam expects
        activeOfferId: row.offers[0]?.id ?? null,
        activeAffiliateUrl: row.offers.find(o => o.linkType === "affiliate")?.url ?? null,
        activeAffiliateCommissionRate: row.offers.find(o => o.linkType === "affiliate")?.commissionRate ?? null,
        activeAffiliatePriority: row.offers[0]?.priority ?? null,
        activeAffiliateType: row.offers[0]?.linkType ?? null,
      } as ProductCandidate;
    });
  }

  let candidates = productRecommendationCandidateCache;

  if (input.countryCode) {
    candidates = candidates.filter((c) =>
      !c.availableCountryCodes ||
      c.availableCountryCodes.includes(input.countryCode!)
    );
  }

  if (!input.includeIneligible) {
    candidates = candidates.filter((c) => c.automatedSafetyPassed && c.status === "approved");
  }

  if (input.productId) {
    candidates = candidates.filter((c) => c.id === input.productId);
  }

  if (input.limit) {
    candidates = candidates.slice(0, input.limit);
  }

  return candidates;
}
