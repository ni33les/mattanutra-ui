import { assessRetailSellability } from "@/lib/retail-sellability";
import { publicProductId } from "@/lib/agentic/contract/ids";
import { ACTIVE_RETAILER_ID, ACTIVE_RETAILER_NAME } from "@/lib/agentic/catalogue/market";
import { FIXTURE_SUPPLEMENTS } from "@/lib/agentic/catalogue/fixtures";
import { refreshAdminSafetyCeilings } from "@/lib/agentic/catalogue/load-safety-ceilings";
import {
  inferOmegaSource,
  supplementNameMatchesFact
} from "@/lib/agentic/catalogue/product-fit";
import {
  customerPriceFromRpp,
  getCustomerPriceMarginPercent
} from "@/lib/customer-pricing";
import { uuidArray } from "@/lib/sql-arrays";
import type {
  CatalogueProduct,
  CatalogueSnapshot
} from "@/lib/agentic/catalogue/types";
import type {
  ProductCandidate,
  ProductCandidateFact,
  ProductPlatform,
  ProductStatus
} from "@/lib/product-recommendation-types";

const LIVE_TTL_MS = 10 * 60_000;
const LIVE_LOAD_WAIT_MS = 8_000;
const WARM_FAILURE_BACKOFF_MS = 5 * 60_000;

let lastWarmFailureAt = 0;

function isStatementTimeout(error: unknown) {
  if (!error || typeof error !== "object") {
    return /statement timeout/i.test(String(error));
  }

  const code = "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);

  return code === "57014" || /statement timeout|57014/i.test(message);
}

function noteWarmFailure(error: unknown) {
  if (isStatementTimeout(error)) {
    lastWarmFailureAt = Date.now();
  }
}

function warmFailureIsCoolingDown() {
  return Date.now() - lastWarmFailureAt < WARM_FAILURE_BACKOFF_MS;
}

async function catalogueSql() {
  const { getSql, getWorkerSql } = await import("@/lib/db");

  return getWorkerSql() ?? getSql();
}

const liveCache = new Map<string, { at: number; snapshot: CatalogueSnapshot }>();
const liveInflight = new Map<string, Promise<CatalogueSnapshot>>();

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesOfSupplement(item: (typeof FIXTURE_SUPPLEMENTS)[number]) {
  return [item.name, ...item.aliases].map(normalizeName);
}

function contributionSupplementIds(candidate: ProductCandidate) {
  const ids = new Set<string>();

  for (const fact of candidate.facts ?? []) {
    const keys = [
      fact.name,
      fact.normalizedName?.replace(/_/g, " "),
      ...(fact.aliasKeys ?? []).map((item) => item.replace(/_/g, " "))
    ].filter((item): item is string => Boolean(item));

    for (const key of keys) {
      const wanted = normalizeName(key);
      const match = FIXTURE_SUPPLEMENTS.find((item) =>
        namesOfSupplement(item).some((name) =>
          supplementNameMatchesFact(name, wanted, candidate)
        )
      );

      if (match) {
        ids.add(match.supplementId);
      }
    }
  }

  return [...ids];
}

function inferDietarySource(
  candidate: ProductCandidate,
  omegaSource: CatalogueProduct["omegaSource"]
): CatalogueProduct["dietarySource"] {
  if (omegaSource === "algae") {
    return "algae";
  }

  if (omegaSource === "fish") {
    return "fish";
  }

  const haystack = candidate.title.toLowerCase();

  if (/\bvegan\b|\bplant\b/.test(haystack)) {
    return "plant";
  }

  return "any";
}

function inferForm(candidate: ProductCandidate) {
  const haystack = [
    candidate.title,
    ...candidate.facts.map((item) => item.servingLabel ?? "")
  ]
    .join(" ")
    .toLowerCase();
  const forms = [
    "softgel",
    "capsule",
    "tablet",
    "powder",
    "gummy",
    "liquid",
    "sachet"
  ] as const;

  return forms.find((form) => haystack.includes(form)) ?? "capsule";
}

function inferDailyPills(candidate: ProductCandidate) {
  for (const fact of candidate.facts) {
    const match = fact.servingLabel?.match(/(\d+(?:\.\d+)?)/);
    const value = match ? Number(match[1]) : NaN;

    if (Number.isFinite(value) && value > 0 && value <= 12) {
      return value;
    }
  }

  return 1;
}

function isSaleEligible(candidate: ProductCandidate) {
  const price = candidate.unitPriceAmount ?? candidate.priceAmount ?? 0;
  return (
    assessRetailSellability({
      availableNow: 1,
      productStatus: candidate.status,
      rrpPriceAmount: price,
      sellableStatus: "active"
    }).eligible &&
    (candidate.brandStatus == null || candidate.brandStatus === "approved") &&
    candidate.validation?.status === "pass" &&
    candidate.automatedSafetyPassed === true &&
    Boolean(candidate.imageUrl?.trim()) &&
    price > 0
  );
}

function toCatalogueProduct(candidate: ProductCandidate): CatalogueProduct | null {
  if (!isSaleEligible(candidate)) {
    return null;
  }

  const price = candidate.unitPriceAmount ?? candidate.priceAmount ?? 0;

  if (!(price > 0)) {
    return null;
  }

  const contributions = contributionSupplementIds(candidate);

  if (contributions.length < 1) {
    return null;
  }

  const omegaSource = inferOmegaSource(candidate);
  const stockStatus: CatalogueProduct["stockStatus"] =
    candidate.retailAvailabilityStatus === "backorder"
      ? "backorder"
      : candidate.retailAvailabilityStatus === "available_now" ||
          candidate.availabilityStatus === "in_stock"
        ? "in_stock"
        : "unavailable";

  if (stockStatus === "unavailable") {
    return null;
  }

  return {
    audience: candidate.productAudience === "both" ? "both" : "adult",
    candidate,
    contributionSupplementIds: contributions,
    dailyPills: inferDailyPills(candidate),
    dietarySource: inferDietarySource(candidate, omegaSource),
    form: inferForm(candidate),
    incompleteCommercialFacts: false,
    omegaSource,
    orderable: true,
    productId: publicProductId(candidate.id),
    retailerSku: candidate.retailSellableProductId ?? candidate.id,
    sellerId: candidate.selectedRetailerOrganisationId ?? ACTIVE_RETAILER_ID,
    sellerName: candidate.selectedRetailerName ?? ACTIVE_RETAILER_NAME,
    source: "retail",
    stockStatus,
    unitPriceMinor: Math.round(price * 100)
  };
}

type SnapshotSkuRow = Readonly<{
  backorder_policy: string | null;
  brand_status: string | null;
  currency: string | null;
  image_url: string | null;
  lead_time_days: number | string | null;
  organisation_currency: string | null;
  organisation_id: string;
  organisation_metadata: unknown;
  organisation_name: string;
  platform: string | null;
  product_audience: string | null;
  product_form: string | null;
  product_id: string;
  product_kind: string | null;
  product_status: string;
  product_url: string | null;
  region: string | null;
  retail_sellable_product_id: string;
  rrp_price_amount: number | string | null;
  stock_quantity: number | string | null;
  title: string;
  validation_status: string | null;
}>;

function numberOrZero(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotFacts(value: unknown): ProductCandidateFact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    const unit = typeof row.unit === "string" ? row.unit : null;
    const amount = Number(row.amount);

    if (!name) {
      return [];
    }

    return [
      {
        amount: Number.isFinite(amount) ? amount : null,
        comparableAmount: Number.isFinite(amount) ? amount : null,
        confidence: "high",
        itemType: "supplement",
        name,
        normalizedName:
          typeof row.normalizedName === "string"
            ? row.normalizedName
            : name.toLowerCase(),
        servingLabel:
          typeof row.servingLabel === "string" ? row.servingLabel : null,
        supplementId:
          typeof row.supplementId === "string" ? row.supplementId : null,
        unit
      } satisfies ProductCandidateFact
    ];
  });
}

function snapshotPlatform(value: unknown): ProductPlatform {
  return value === "lazada" ||
    value === "manual" ||
    value === "shopee" ||
    value === "wholesale_pharmacy_import"
    ? value
    : "wholesale_pharmacy_import";
}

function candidateFromSnapshotRow(
  row: SnapshotSkuRow,
  facts: ProductCandidateFact[],
  countryCode: string,
  marginPercent: number
): ProductCandidate {
  const stockQuantity = Math.max(0, Math.round(numberOrZero(row.stock_quantity)));
  const rrp = numberOrZero(row.rrp_price_amount);
  const currency = row.currency || row.organisation_currency || "THB";
  const customerPrice = customerPriceFromRpp(rrp, marginPercent) ?? rrp;
  const backorderAllowed =
    String(row.backorder_policy ?? "allow").trim().toLowerCase() !== "deny";
  const retailAvailabilityStatus =
    stockQuantity > 0
      ? "available_now"
      : backorderAllowed
        ? "backorder"
        : "unavailable";

  return {
    automatedSafetyPassed: (row.validation_status ?? "pass") === "pass",
    availabilityStatus: stockQuantity > 0 ? "in_stock" : "out_of_stock",
    availableCountryCodes: [countryCode],
    brandStatus: (row.brand_status as ProductStatus | null) ?? null,
    currency,
    facts,
    id: row.product_id,
    imageUrl: row.image_url,
    labelStatus: facts.length > 0 ? "parsed" : "missing",
    platform: snapshotPlatform(row.platform),
    priceAmount: customerPrice,
    priceSource: "retail_override",
    productAudience:
      row.product_audience === "female" || row.product_audience === "male"
        ? row.product_audience
        : "both",
    productKind:
      row.product_kind === "food" ||
      row.product_kind === "multi" ||
      row.product_kind === "supplement"
        ? row.product_kind
        : "supplement",
    productUrl: row.product_url || "",
    region: row.region || countryCode,
    retailAvailabilityStatus,
    retailSellableProductId: row.retail_sellable_product_id,
    selectedRetailerName: row.organisation_name,
    selectedRetailerOrganisationId: row.organisation_id,
    status: row.product_status === "approved" ? "approved" : "pending_review",
    title: row.title,
    unitPriceAmount: customerPrice,
    validation: {
      checkedAt: new Date(0).toISOString(),
      matchableFactCount: facts.length,
      reasons: [],
      status: (row.validation_status ?? "pass") === "pass" ? "pass" : "failed",
      summary: ""
    }
  };
}

export async function loadLiveRetailSnapshot(
  countryCode: string
): Promise<CatalogueSnapshot> {
  const sql = await catalogueSql();
  const code = countryCode.trim().toUpperCase();
  const startedAt = Date.now();

  if (!sql) {
    return {
      availabilityAsOf: new Date().toISOString(),
      catalogueVersion: `retail-${code}-unavailable`,
      products: [],
      supplements: FIXTURE_SUPPLEMENTS
    };
  }

  const [skuRows, marginPercent] = await Promise.all([
    sql<SnapshotSkuRow[]>`
      select
        organisations.id::text as organisation_id,
        organisations.name as organisation_name,
        organisations.currency as organisation_currency,
        organisations.metadata as organisation_metadata,
        sellable.id::text as retail_sellable_product_id,
        sellable.product_id::text,
        sellable.rrp_price_amount,
        sellable.currency,
        sellable.lead_time_days,
        sellable.backorder_policy,
        products.title,
        products.image_url,
        products.product_url,
        products.platform,
        products.region,
        products.status as product_status,
        products.validation_status,
        products.product_kind,
        coalesce(to_jsonb(products) ->> 'product_audience', 'both') as product_audience,
        coalesce(
          to_jsonb(products) ->> 'product_form',
          products.source_snapshot ->> 'productForm',
          products.source_snapshot ->> 'product_form'
        ) as product_form,
        product_brands.status as brand_status,
        coalesce(stock.stock_quantity, 0)::int as stock_quantity
      from public.organisations
      join public.retail_sellable_products sellable
        on sellable.organisation_id = organisations.id
        and sellable.status = 'active'
      join public.products
        on products.id = sellable.product_id
      left join public.product_brands
        on product_brands.id = products.brand_id
      left join public.retail_product_stock stock
        on stock.organisation_id = sellable.organisation_id
        and stock.product_id = sellable.product_id
        and stock.status <> 'deleted'
      where organisations.organisation_type = 'tenant'
        and organisations.status = 'active'
        and organisations.country_code = ${code}
        and products.status = 'approved'
        and coalesce(products.validation_status, 'pass') = 'pass'
        and (products.brand_id is null or product_brands.status = 'approved')
    `,
    getCustomerPriceMarginPercent({ sql }),
    refreshAdminSafetyCeilings()
  ]);
  const productIds = [...new Set(skuRows.map((row) => row.product_id))];
  const factRows =
    productIds.length > 0
      ? await sql<Array<{ facts: unknown; product_id: string }>>`
          select
            product_id::text,
            coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'name', name,
                  'normalizedName', normalized_name,
                  'amount', amount,
                  'unit', unit,
                  'servingLabel', serving_label,
                  'supplementId', supplement_id::text,
                  'itemType', item_type
                )
              ) filter (where supplement_id is not null),
              '[]'::jsonb
            ) as facts
          from public.product_facts
          where product_id = any(${uuidArray(sql, productIds)}::uuid[])
          group by product_id
        `
      : [];
  const factsByProduct = new Map(
    factRows.map((row) => [row.product_id, snapshotFacts(row.facts)])
  );
  const byListing = new Map<string, CatalogueProduct>();

  for (const row of skuRows) {
    const candidate = candidateFromSnapshotRow(
      row,
      factsByProduct.get(row.product_id) ?? [],
      code,
      marginPercent
    );
    const mapped = toCatalogueProduct(candidate);

    if (!mapped) {
      continue;
    }

    const listingKey = `${mapped.sellerId}:${mapped.productId}`;
    const existing = byListing.get(listingKey);

    if (!existing) {
      byListing.set(listingKey, mapped);
      continue;
    }

    const existingRank = existing.stockStatus === "in_stock" ? 0 : 1;
    const nextRank = mapped.stockStatus === "in_stock" ? 0 : 1;

    if (
      nextRank < existingRank ||
      (nextRank === existingRank && mapped.unitPriceMinor < existing.unitPriceMinor)
    ) {
      byListing.set(listingKey, mapped);
    }
  }

  console.info("[catalogue:snapshot]", {
    countryCode: code,
    ms: Date.now() - startedAt,
    products: byListing.size,
    skus: skuRows.length
  });

  return {
    availabilityAsOf: new Date().toISOString(),
    catalogueVersion: `retail-${code}-${byListing.size}`,
    products: [...byListing.values()],
    supplements: FIXTURE_SUPPLEMENTS
  };
}

function loadingSnapshot(countryCode: string): CatalogueSnapshot {
  const hit = liveCache.get(countryCode);

  return {
    availabilityAsOf: new Date().toISOString(),
    catalogueVersion: hit?.snapshot.catalogueVersion ?? `retail-${countryCode}-loading`,
    products: hit?.snapshot.products ?? [],
    supplements: FIXTURE_SUPPLEMENTS
  };
}

function startLiveLoad(code: string): Promise<CatalogueSnapshot> {
  const existing = liveInflight.get(code);

  if (existing) {
    return existing;
  }

  const inflight = loadLiveRetailSnapshot(code)
    .then((snapshot) => {
      if (snapshot.products.length > 0) {
        liveCache.set(code, { at: Date.now(), snapshot });
      }

      return snapshot;
    })
    .catch((error) => {
      noteWarmFailure(error);
      throw error;
    })
    .finally(() => {
      liveInflight.delete(code);
    });
  liveInflight.set(code, inflight);
  return inflight;
}

export async function cachedLiveRetailSnapshot(
  countryCode: string
): Promise<CatalogueSnapshot> {
  const code = countryCode.trim().toUpperCase() || "TH";

  if (process.env.NODE_TEST_CONTEXT) {
    return {
      availabilityAsOf: new Date().toISOString(),
      catalogueVersion: `retail-${code}-test`,
      products: [],
      supplements: FIXTURE_SUPPLEMENTS
    };
  }

  const hit = liveCache.get(code);

  if (hit && Date.now() - hit.at < LIVE_TTL_MS) {
    return hit.snapshot;
  }

  const inflight = startLiveLoad(code);

  if (hit) {
    return hit.snapshot;
  }

  return Promise.race([
    inflight,
    new Promise<CatalogueSnapshot>((resolve) => {
      setTimeout(() => resolve(loadingSnapshot(code)), LIVE_LOAD_WAIT_MS);
    })
  ]);
}

export async function warmLiveRetailSnapshot(
  countryCode: string
): Promise<CatalogueSnapshot> {
  if (process.env.NODE_TEST_CONTEXT) {
    return cachedLiveRetailSnapshot(countryCode);
  }

  const code = countryCode.trim().toUpperCase() || "TH";
  const hit = liveCache.get(code);

  if (hit && Date.now() - hit.at < LIVE_TTL_MS && hit.snapshot.products.length > 0) {
    return hit.snapshot;
  }

  if (warmFailureIsCoolingDown()) {
    return hit?.snapshot ?? loadingSnapshot(code);
  }

  try {
    return await startLiveLoad(code);
  } catch (error) {
    noteWarmFailure(error);
    throw error;
  }
}

export function cachedLiveThailandSnapshot(): Promise<CatalogueSnapshot> {
  return cachedLiveRetailSnapshot("TH");
}

export function resetLiveCatalogueCache() {
  liveCache.clear();
  liveInflight.clear();
}
