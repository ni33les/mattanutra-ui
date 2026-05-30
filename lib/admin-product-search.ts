import type { AdminProductRow } from "@/lib/admin-product-types";
import { loadProductRows } from "@/lib/admin-product-read-model";
import {
  productSafetyPasses,
  rowFromDb
} from "@/lib/admin-product-mappers";
import { normalizeProductCountryCode } from "@/lib/product-countries";
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

export function clearProductRecommendationCandidateCache() {
  // Kept as a public invalidation hook for product mutation paths.
}

export async function getProductRecommendationCandidates(input: Readonly<{
  countryCode?: string | null;
  includeIneligible?: boolean;
  limit?: number;
  productId?: string | null;
}>) {
  const rows = await loadProductRows(input.productId ?? null);

  if (!rows) {
    return [] as ProductCandidate[];
  }

  const countryCode = input.countryCode
    ? normalizeProductCountryCode(input.countryCode)
    : null;
  let candidates = rows.map((sourceRow) => {
    const row = rowFromDb(sourceRow);
    const activeOffer =
      row.offers.find((offer) =>
        offer.status === "active" &&
        offer.availabilityStatus !== "out_of_stock" &&
        offer.availabilityStatus !== "unavailable" &&
        offer.linkType === "affiliate"
      ) ??
      row.offers.find((offer) =>
        offer.status === "active" &&
        offer.availabilityStatus !== "out_of_stock" &&
        offer.availabilityStatus !== "unavailable"
      ) ??
      null;

    return {
      ...row,
      activeOfferId: activeOffer?.id ?? null,
      activeAffiliateUrl:
        activeOffer?.linkType === "affiliate" ? activeOffer.url : null,
      activeAffiliateCommissionRate:
        activeOffer?.linkType === "affiliate"
          ? activeOffer.commissionRate
          : null,
      activeAffiliatePriority: activeOffer?.priority ?? null,
      activeAffiliateType: activeOffer?.linkType ?? null,
      automatedSafetyPassed:
        row.validation.status === "pass" &&
        productSafetyPasses(row.facts, sourceRow.facts)
    } satisfies ProductCandidate;
  });

  if (countryCode) {
    candidates = candidates.filter((candidate) => {
      const productCountries = candidate.availableCountryCodes ?? [];
      const manufacturerCountries = candidate.manufacturerCountryCodes ?? [];

      return (
        productCountries.includes(countryCode) &&
        (manufacturerCountries.length < 1 ||
          manufacturerCountries.includes(countryCode))
      );
    });
  }

  if (!input.includeIneligible) {
    candidates = candidates.filter((candidate) =>
      candidate.status === "approved" &&
      candidate.brandStatus === "approved" &&
      candidate.validation?.status === "pass" &&
      candidate.automatedSafetyPassed
    );
  }

  return input.limit ? candidates.slice(0, input.limit) : candidates;
}
