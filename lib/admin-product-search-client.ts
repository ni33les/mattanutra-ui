import type { AdminProductRow } from "@/lib/admin-products";

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
    row.displayTitle,
    row.displayDescription,
    ...Object.values(row.translations ?? {}).flatMap((translation) => [
      translation.locale,
      translation.status,
      translation.title,
      translation.description
    ]),
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
