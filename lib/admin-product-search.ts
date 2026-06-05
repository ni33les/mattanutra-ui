import type { AdminProductRow } from "@/lib/admin-product-types";
import type postgres from "postgres";
import { loadProductRows } from "@/lib/admin-product-read-model";
import {
  productSafetyPasses,
  rowFromDb
} from "@/lib/admin-product-mappers";
import { getSql } from "@/lib/db";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import {
  customerPriceFromRpp,
  getCustomerPriceMarginPercent
} from "@/lib/customer-pricing";
import type { ProductCandidate } from "@/lib/product-recommendations";

type ProductSearchDb = postgres.Sql | postgres.TransactionSql;

export type ProductRecommendationRetailerOption = Readonly<{
  currency: string;
  etaDate: string | null;
  organisationId: string;
  organisationName: string;
  productCount: number;
  subtotalAmount: number;
}>;

export type ProductRecommendationRetailerCandidateSet =
  ProductRecommendationRetailerOption & Readonly<{
    candidates: ProductCandidate[];
  }>;

type RetailProductCandidateRow = Readonly<{
  allocated_quantity: number | string | null;
  backorder_policy: string | null;
  currency: string | null;
  lead_time_days: number | string | null;
  organisation_currency: string | null;
  organisation_id: string;
  organisation_name: string;
  product_id: string;
  retail_override_price_amount: number | string | null;
  retail_sellable_product_id: string;
  rrp_price_amount: number | string | null;
  stock_quantity: number | string | null;
}>;

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

function integerOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function moneyOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function etaDateFromLeadTime(leadTimeDays: number) {
  return new Date(Date.now() + leadTimeDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function latestEtaDate(values: readonly (string | null)[]) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function candidateFromProductRow(input: Readonly<{
  countryCode: string | null;
  customerPriceMarginPercent: number;
  retail?: Readonly<{
    availabilityStatus: ProductCandidate["retailAvailabilityStatus"];
    currency: string;
    etaDate: string | null;
    priceAmount: number;
    priceSource: NonNullable<ProductCandidate["priceSource"]>;
    retailSellableProductId: string;
    selectedRetailerName: string;
    selectedRetailerOrganisationId: string;
  }>;
  sourceRow: Parameters<typeof rowFromDb>[0];
}>) {
  const row = rowFromDb(input.sourceRow);
  const countryPricing = input.countryCode
    ? row.countryPricing.find((pricing) => pricing.countryCode === input.countryCode)
    : row.countryPricing.find((pricing) => pricing.rrpPriceAmount !== null);
  const customerPriceAmount = input.retail?.priceAmount ??
    customerPriceFromRpp(
      countryPricing?.rrpPriceAmount ?? null,
      input.customerPriceMarginPercent
    );
  return {
    ...row,
    automatedSafetyPassed:
      row.validation.status === "pass" &&
      productSafetyPasses(row.facts, input.sourceRow.facts),
    currency: input.retail?.currency ?? countryPricing?.currency ?? row.currency,
    priceAmount: customerPriceAmount,
    priceSource: input.retail?.priceSource ?? "master_list_country_rrp_margin",
    retailAvailabilityStatus: input.retail?.availabilityStatus ?? null,
    retailEtaDate: input.retail?.etaDate ?? null,
    retailSellableProductId: input.retail?.retailSellableProductId ?? null,
    selectedRetailerName: input.retail?.selectedRetailerName ?? null,
    selectedRetailerOrganisationId:
      input.retail?.selectedRetailerOrganisationId ?? null,
    unitPriceAmount: input.retail?.priceAmount ?? customerPriceAmount
  } satisfies ProductCandidate;
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
  const customerPriceMarginPercent = await getCustomerPriceMarginPercent();
  let candidates = rows.map((sourceRow) =>
    candidateFromProductRow({
      countryCode,
      customerPriceMarginPercent,
      sourceRow
    })
  );

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

export async function getRetailerAwareProductRecommendationCandidateSets(input: Readonly<{
  countryCode?: string | null;
  includeIneligible?: boolean;
  limit?: number;
  productId?: string | null;
  sql?: ProductSearchDb;
}>): Promise<ProductRecommendationRetailerCandidateSet[]> {
  const sql = input.sql ?? getSql();

  if (!sql) {
    return [];
  }

  const countryCode =
    normalizeProductCountryCode(input.countryCode) ?? defaultProductCountryCode;
  const rows = await loadProductRows(input.productId ?? null);

  if (!rows || rows.length < 1) {
    return [];
  }

  const productRowsById = new Map(
    rows.map((sourceRow) => [rowFromDb(sourceRow).id, sourceRow])
  );
  const productIds = [...productRowsById.keys()];
  const retailRows = await sql<RetailProductCandidateRow[]>`
    select
      organisations.id::text as organisation_id,
      organisations.name as organisation_name,
      organisations.currency as organisation_currency,
      sellable.id::text as retail_sellable_product_id,
      sellable.product_id::text,
      sellable.rrp_price_amount as retail_override_price_amount,
      sellable.rrp_price_amount as rrp_price_amount,
      sellable.currency as currency,
      sellable.lead_time_days,
      sellable.backorder_policy,
      coalesce(stock.stock_quantity, 0)::int as stock_quantity,
      coalesce(active_allocations.quantity_allocated, 0)::int as allocated_quantity
    from public.organisations
    join public.retail_sellable_products sellable
      on sellable.organisation_id = organisations.id
      and sellable.status = 'active'
    join public.products
      on products.id = sellable.product_id
    left join public.retail_product_stock stock
      on stock.organisation_id = sellable.organisation_id
      and stock.product_id = sellable.product_id
      and stock.status <> 'deleted'
    left join lateral (
      select sum(retail_order_allocations.quantity_allocated)::int as quantity_allocated
      from public.retail_order_allocations
      where retail_order_allocations.organisation_id = sellable.organisation_id
        and retail_order_allocations.product_id = sellable.product_id
        and retail_order_allocations.status in ('active', 'picked')
    ) active_allocations on true
    where organisations.organisation_type = 'tenant'
      and organisations.status = 'active'
      and organisations.country_code = ${countryCode}
      and sellable.product_id = any(${productIds}::uuid[])
    order by lower(organisations.name), sellable.updated_at desc
  `;
  const customerPriceMarginPercent = await getCustomerPriceMarginPercent({ sql });
  const byRetailer = new Map<string, {
    candidates: ProductCandidate[];
    currency: string;
    etaDates: Array<string | null>;
    name: string;
    subtotalAmount: number;
  }>();

  for (const retailRow of retailRows) {
    const sourceRow = productRowsById.get(retailRow.product_id);

    if (!sourceRow) {
      continue;
    }

    const stockQuantity = integerOrDefault(retailRow.stock_quantity, 0);
    const allocatedQuantity = integerOrDefault(retailRow.allocated_quantity, 0);
    const availableNow = Math.max(0, stockQuantity - allocatedQuantity);
    const backorderAllowed = retailRow.backorder_policy !== "deny";

    if (availableNow <= 0 && !backorderAllowed) {
      continue;
    }

    const retailOverridePriceAmount = moneyOrNull(
      retailRow.retail_override_price_amount
    );
    const masterPriceAmount = customerPriceFromRpp(
      moneyOrNull(retailRow.rrp_price_amount),
      customerPriceMarginPercent
    );
    const priceAmount = retailOverridePriceAmount ?? masterPriceAmount;

    if (priceAmount === null) {
      continue;
    }

    const leadTimeDays = integerOrDefault(retailRow.lead_time_days, 0);
    const availabilityStatus = availableNow > 0 ? "available_now" : "backorder";
    const etaDate = availabilityStatus === "backorder"
      ? etaDateFromLeadTime(leadTimeDays)
      : null;
    const candidate = candidateFromProductRow({
      countryCode,
      customerPriceMarginPercent,
      retail: {
        availabilityStatus,
        currency:
          retailRow.currency?.trim().toUpperCase() ||
          retailRow.organisation_currency?.trim().toUpperCase() ||
          "THB",
        etaDate,
        priceAmount,
        priceSource: retailOverridePriceAmount === null
          ? "master_list_country_rrp_margin"
          : "retail_override",
        retailSellableProductId: retailRow.retail_sellable_product_id,
        selectedRetailerName: retailRow.organisation_name,
        selectedRetailerOrganisationId: retailRow.organisation_id
      },
      sourceRow
    });
    const productCountries = candidate.availableCountryCodes ?? [];
    const manufacturerCountries = candidate.manufacturerCountryCodes ?? [];

    if (
      !productCountries.includes(countryCode) ||
      (
        manufacturerCountries.length > 0 &&
        !manufacturerCountries.includes(countryCode)
      )
    ) {
      continue;
    }

    if (
      !input.includeIneligible &&
      (
        candidate.status !== "approved" ||
        candidate.brandStatus !== "approved" ||
        candidate.validation?.status !== "pass" ||
        !candidate.automatedSafetyPassed
      )
    ) {
      continue;
    }

    const retailer = byRetailer.get(retailRow.organisation_id) ?? {
      candidates: [],
      currency: candidate.currency,
      etaDates: [],
      name: retailRow.organisation_name,
      subtotalAmount: 0
    };

    retailer.candidates.push(candidate);
    retailer.etaDates.push(etaDate);
    retailer.subtotalAmount += priceAmount;
    byRetailer.set(retailRow.organisation_id, retailer);
  }

  const candidateSets = [...byRetailer].map(([organisationId, retailer]) => ({
    candidates: input.limit
      ? retailer.candidates.slice(0, input.limit)
      : retailer.candidates,
    currency: retailer.currency,
    etaDate: latestEtaDate(retailer.etaDates),
    organisationId,
    organisationName: retailer.name,
    productCount: retailer.candidates.length,
    subtotalAmount: retailer.subtotalAmount
  }));

  return candidateSets.filter((set) => set.candidates.length > 0);
}
