import { assessRetailSellability } from "@/lib/retail-sellability";
import { publicProductId } from "@/lib/agentic/contract/ids";
import { ACTIVE_RETAILER_ID, ACTIVE_RETAILER_NAME } from "@/lib/agentic/catalogue/market";
import {
  buildContributionIndex,
  loadLiveSupplementsForCountry
} from "@/lib/agentic/catalogue/live-supplements";
import {
  inferOmegaSource,
  isFalseOmegaAttribution,
  looksLikeOmegaLabel,
  shouldSkipOmegaContribution,
  supplementNameMatchesFact
} from "@/lib/agentic/catalogue/product-fit";
import type { CatalogueSupplement } from "@/lib/agentic/catalogue/types";
import {
  customerPriceFromRpp,
  DEFAULT_CUSTOMER_PRICE_MARGIN_PERCENT
} from "@/lib/customer-pricing";
import type {
  CatalogueProduct,
  CatalogueSnapshot
} from "@/lib/agentic/catalogue/types";
import { factComparableAmount } from "@/lib/product-recommendation-metrics";
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
  const { getSql } = await import("@/lib/db");

  return getSql();
}

const globalLive = globalThis as typeof globalThis & {
  mattanutraLiveCatalogueCache?: Map<
    string,
    { at: number; snapshot: CatalogueSnapshot }
  >;
  mattanutraLiveCatalogueInflight?: Map<string, Promise<CatalogueSnapshot>>;
};

function liveCache() {
  globalLive.mattanutraLiveCatalogueCache ??= new Map();

  return globalLive.mattanutraLiveCatalogueCache;
}

function liveInflight() {
  globalLive.mattanutraLiveCatalogueInflight ??= new Map();

  return globalLive.mattanutraLiveCatalogueInflight;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesOfSupplement(item: Pick<CatalogueSupplement, "aliases" | "name">) {
  return [item.name, ...item.aliases].map(normalizeName);
}

function contributionSupplementIds(
  candidate: ProductCandidate,
  index: Map<string, string>,
  supplements: readonly CatalogueSupplement[]
) {
  const ids = new Set<string>();

  for (const fact of candidate.facts ?? []) {
    if (fact.supplementId) {
      const mapped =
        index.get(fact.supplementId) ??
        index.get(fact.supplementId.toLowerCase()) ??
        index.get(normalizeName(fact.supplementId));

      if (mapped) {
        const mappedSupplement = supplements.find(
          (item) =>
            item.supplementId === mapped ||
            item.uuid === mapped ||
            item.uuid.toLowerCase() === mapped.toLowerCase()
        );
        const mappedLooksOmega = looksLikeOmegaLabel(
          `${mapped} ${mappedSupplement?.name ?? ""} ${(mappedSupplement?.aliases ?? []).join(" ")}`
        );

        if (isFalseOmegaAttribution(candidate) && mappedLooksOmega) {
          continue;
        }

        if (!shouldSkipOmegaContribution(mapped, candidate)) {
          ids.add(mapped);
        }
        continue;
      }
    }

    const keys = [
      fact.name,
      fact.normalizedName?.replace(/_/g, " "),
      ...(fact.aliasKeys ?? []).map((item) => item.replace(/_/g, " "))
    ].filter((item): item is string => Boolean(item));

    for (const key of keys) {
      const wanted = normalizeName(key);
      const exact = index.get(wanted);

      if (exact) {
        if (!shouldSkipOmegaContribution(wanted, candidate)) {
          ids.add(exact);
        }
        continue;
      }

      if (fact.supplementId) {
        continue;
      }

      const match = supplements.find((item) =>
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

function toCatalogueProduct(
  candidate: ProductCandidate,
  supplements: readonly CatalogueSupplement[],
  index: Map<string, string>
): CatalogueProduct | null {
  if (!isSaleEligible(candidate)) {
    return null;
  }

  const price = candidate.unitPriceAmount ?? candidate.priceAmount ?? 0;

  if (!(price > 0)) {
    return null;
  }

  const contributions = contributionSupplementIds(candidate, index, supplements);

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
  facts: unknown;
  image_url: string | null;
  organisation_currency: string | null;
  organisation_id: string;
  organisation_name: string;
  platform: string | null;
  product_audience: string | null;
  product_id: string;
  product_kind: string | null;
  product_status: string;
  product_url: string | null;
  region: string | null;
  retail_sellable_product_id: string;
  rrp_price_amount: number | string | null;
  margin_percent: number | string | null;
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

    const fact = {
      amount: Number.isFinite(amount) ? amount : null,
      comparableAmount: null,
      confidence: "high" as const,
      itemType: "supplement" as const,
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
    } satisfies ProductCandidateFact;

    return [
      {
        ...fact,
        comparableAmount: factComparableAmount(fact)
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
      supplements: []
    };
  }

  let supplements: CatalogueSnapshot["supplements"] = [];

  try {
    supplements = await loadLiveSupplementsForCountry(sql, code);
  } catch (error) {
    console.warn("Unable to load live supplements for MCP", {
      countryCode: code,
      error
    });
  }

  const contributionIndex = buildContributionIndex(supplements);

  const skuRows = await sql<SnapshotSkuRow[]>`
    with tenants as materialized (
      select organisations.id, organisations.name, organisations.currency
      from public.organisations
      where organisations.organisation_type = 'tenant'
        and organisations.status = 'active'
        and organisations.country_code = ${code}
    ),
    platform_margin as materialized (
      select coalesce(
        nullif(platform.metadata ->> 'customerPriceMarginPercent', '')::numeric,
        ${DEFAULT_CUSTOMER_PRICE_MARGIN_PERCENT}
      ) as percent
      from public.organisations platform
      where lower(platform.slug) = 'mattanutra'
        and platform.organisation_type = 'platform'
      limit 1
    )
    select
      tenants.id::text as organisation_id,
      tenants.name as organisation_name,
      tenants.currency as organisation_currency,
      sellable.id::text as retail_sellable_product_id,
      sellable.product_id::text,
      sellable.rrp_price_amount,
      sellable.currency,
      sellable.backorder_policy,
      products.title,
      products.image_url,
      products.product_url,
      products.platform,
      products.region,
      products.status as product_status,
      products.validation_status,
      products.product_kind,
      products.product_audience,
      product_brands.status as brand_status,
      coalesce(stock.stock_quantity, 0)::int as stock_quantity,
      coalesce(fact_rows.facts, '[]'::jsonb) as facts,
      coalesce(
        (select percent from platform_margin),
        ${DEFAULT_CUSTOMER_PRICE_MARGIN_PERCENT}
      ) as margin_percent
    from tenants
    join public.retail_sellable_products sellable
      on sellable.organisation_id = tenants.id
      and sellable.status = 'active'
    join public.products
      on products.id = sellable.product_id
    left join public.product_brands
      on product_brands.id = products.brand_id
    left join public.retail_product_stock stock
      on stock.organisation_id = sellable.organisation_id
      and stock.product_id = sellable.product_id
      and stock.status <> 'deleted'
    left join lateral (
      select
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
      where product_facts.product_id = products.id
    ) fact_rows on true
    where products.status = 'approved'
  `;
  const byListing = new Map<string, CatalogueProduct>();

  for (const row of skuRows) {
    const candidate = candidateFromSnapshotRow(
      row,
      snapshotFacts(row.facts),
      code,
      numberOrZero(row.margin_percent) || DEFAULT_CUSTOMER_PRICE_MARGIN_PERCENT
    );
    const mapped = toCatalogueProduct(candidate, supplements, contributionIndex);

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
    supplements
  };
}

function loadingSnapshot(countryCode: string): CatalogueSnapshot {
  const hit = liveCache().get(countryCode);

  if (hit) {
    return hit.snapshot;
  }

  return {
    availabilityAsOf: new Date().toISOString(),
    catalogueVersion: `retail-${countryCode}-loading`,
    products: [],
    supplements: []
  };
}

function startLiveLoad(code: string): Promise<CatalogueSnapshot> {
  const existing = liveInflight().get(code);

  if (existing) {
    return existing;
  }

  let resolveInflight!: (snapshot: CatalogueSnapshot) => void;
  let rejectInflight!: (error: unknown) => void;
  const inflight = new Promise<CatalogueSnapshot>((resolve, reject) => {
    resolveInflight = resolve;
    rejectInflight = reject;
  });
  liveInflight().set(code, inflight);

  void loadLiveRetailSnapshot(code)
    .then((snapshot) => {
      if (snapshot.products.length > 0 || snapshot.supplements.length > 0) {
        liveCache().set(code, { at: Date.now(), snapshot });
      }

      resolveInflight(snapshot);
    })
    .catch((error) => {
      noteWarmFailure(error);
      rejectInflight(error);
    })
    .finally(() => {
      if (liveInflight().get(code) === inflight) {
        liveInflight().delete(code);
      }
    });

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
      supplements: []
    };
  }

  const hit = liveCache().get(code);

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
  const hit = liveCache().get(code);

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

export function requireCachedLiveRetailSnapshot(
  countryCode: string
): CatalogueSnapshot {
  const code = countryCode.trim().toUpperCase() || "TH";

  if (process.env.NODE_TEST_CONTEXT) {
    return {
      availabilityAsOf: new Date().toISOString(),
      catalogueVersion: `retail-${code}-test`,
      products: [],
      supplements: []
    };
  }

  const hit = liveCache().get(code);

  if (hit && Date.now() - hit.at < LIVE_TTL_MS && hit.snapshot.products.length > 0) {
    return hit.snapshot;
  }

  throw new Error("Product matching catalogue is not ready");
}

export function cachedLiveThailandSnapshot(): Promise<CatalogueSnapshot> {
  return cachedLiveRetailSnapshot("TH");
}

export function resetLiveCatalogueCache() {
  liveCache().clear();
  liveInflight().clear();
}
