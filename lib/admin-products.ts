import { getSql } from "@/lib/db";
import { appendProductFactVersion } from "@/lib/domain-history";
import type { ProductSnapshot } from "@/lib/product-adapters";
import { toJsonValue } from "@/lib/assessment-store";
import {
  comparableDoseAmount,
  doseAmountInLimitUnit,
  doseExceedsLimit,
  normalizeDoseUnit,
  parseDoseLimit
} from "@/lib/dose-conversion";
import {
  normalizeProductFactKey,
  normalizeProductFactName,
  normalizeProductKey,
  productFactAliasKeys,
  productFactLooksLikeConcentration,
  productKeysMatch,
  type ProductAudience,
  type ProductAvailabilityStatus,
  type ProductCandidate,
  type ProductCandidateFact,
  type ProductConfidence,
  type ProductKind,
  type ProductStatus,
  type ProductRecommendationNeed,
  type ProductPlatform
} from "@/lib/product-recommendations";
import {
  productFactObservableIssueMessages,
  validateProduct,
  validationCacheMismatchReasons,
  type ValidationResult
} from "@/lib/product-validation";
import { appendSupplementSafetyLimitVersion } from "@/lib/supplement-safety-limit-versions";
import { normalizeSupplementSafetyFlags } from "@/lib/supplement-safety-flags";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode,
  normalizeProductCountryCodes,
  type ProductCountryCode
} from "@/lib/product-countries";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { createTask } from "@/lib/task-service";

export type ProductAffiliateStatus = "active" | "flagged_stale" | "none";
export type ProductLabelStatus = "failed" | "missing" | "parsed" | "stale";
type ProductFactSupplementStatus = "active" | "blocked";
export type ProductValidationCacheStatus = "fresh" | "missing" | "stale";

export type AdminProductFact = ProductCandidateFact & Readonly<{
  id: string;
  maxAmount: number | null;
  maxUnit: string | null;
  safetyFlags: readonly string[];
  source: string | null;
  sourceText: string | null;
  sourceUrl: string | null;
  supplementStatus: ProductFactSupplementStatus | null;
}>;

export type AdminProductOffer = Readonly<{
  availabilityStatus: ProductAvailabilityStatus;
  commissionRate: number | null;
  currency: string;
  id: string;
  linkType: "affiliate" | "direct";
  network: string | null;
  platform: string | null;
  priceAmount: number | null;
  priority: number;
  status: "active" | "flagged_stale" | "inactive";
  url: string;
}>;

export type AdminProductRow = Readonly<{
  affiliateStatus: ProductAffiliateStatus;
  aiCorrectionNotes: string | null;
  availabilityStatus: ProductAvailabilityStatus;
  availableCountryCodes: ProductCountryCode[];
  brandId: string | null;
  brandName: string | null;
  brandStatus: ProductStatus | null;
  category: string | null;
  currency: string;
  description: string | null;
  descriptionEn: string | null;
  descriptionTh: string | null;
  facts: AdminProductFact[];
  fdaApprovalNumber: string | null;
  id: string;
  imageUrl: string | null;
  importReviewTaskId: string | null;
  importStatus: string | null;
  labelStatus: ProductLabelStatus;
  manufacturerCountryCodes: ProductCountryCode[];
  status: ProductStatus;
  validation: ValidationResult;
  validationCacheStatus: ProductValidationCacheStatus;
  validationCacheStaleReasons: string[];
  validationLabel: string;
  productAudience: ProductAudience;
  platform: ProductPlatform;
  priceAmount: number | null;
  productImportDuplicateProductIds: string[];
  productImportId: string | null;
  productKind: ProductKind;
  productUrl: string;
  recommendationHistory: {
    averageProductCoveragePercent: number | null;
    averageStackCoveragePercent: number | null;
    chosenCount: number;
    lastRecommendedAt: string | null;
  };
  offers: AdminProductOffer[];
  region: string;
  sourceEvidence: {
    importId: string | null;
    importReviewTaskId: string | null;
    importStatus: string | null;
    sourceUrl: string | null;
  };
  title: string;
  titleEn: string | null;
  titleTh: string | null;
  updatedAt: string;
}>;

export type AdminProductsData = Readonly<{
  databaseAvailable: boolean;
  generatedAt: string;
  platforms: ProductPlatform[];
  rows: AdminProductRow[];
  summary: {
    activeAffiliate: number;
    dirtyData: number;
    ignored: number;
    missingFacts: number;
    missingImage: number;
    pendingReview: number;
    total: number;
    approved: number;
  };
}>;

export type ProductImportRunRow = Readonly<{
  approvedCount: number;
  brandName: string;
  completedAt: string | null;
  failedCount: number;
  id: string;
  notes: string | null;
  requestedAutoApprove: boolean;
  source: string;
  stagedCount: number;
  startedAt: string;
  status: "completed" | "failed" | "running";
  totalProducts: number;
}>;

type ProductDbRow = Readonly<{
  active_offer_id: string | null;
  active_offer_availability_status: ProductAvailabilityStatus | null;
  active_affiliate_commission_rate: string | number | null;
  active_offer_currency: string | null;
  active_affiliate_priority: string | number | null;
  active_offer_price_amount: string | number | null;
  active_affiliate_type: "affiliate" | "direct" | null;
  active_affiliate_url: string | null;
  offers: unknown;
  affiliate_status: ProductAffiliateStatus;
  availability_status: ProductAvailabilityStatus;
  available_country_codes: string[] | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_status: ProductStatus | null;
  category: string | null;
  currency: string;
  current_version: string | number | null;
  description: string | null;
  description_en: string | null;
  description_th: string | null;
  facts: unknown;
  fda_approval_number: string | null;
  history_average_product_coverage_percent: string | number | null;
  history_average_stack_coverage_percent: string | number | null;
  history_chosen_count: string | number | null;
  history_last_recommended_at: Date | string | null;
  id: string;
  image_url: string | null;
  import_duplicate_product_ids: string[] | null;
  import_id: string | null;
  import_review_task_id: string | null;
  import_status: string | null;
  label_status: ProductLabelStatus;
  manufacturer_country_codes: string[] | null;
  status: ProductStatus;
  platform: ProductPlatform;
  price_amount: string | number | null;
  product_audience: ProductAudience | null;
  product_kind: ProductKind;
  product_data_expires_at: Date | string | null;
  product_url: string;
  validation_checked_at: Date | string | null;
  validation_reasons: string[] | null;
  validation_status: ValidationResult["status"] | null;
  validation_summary: string | null;
  region: string;
  source_snapshot: unknown;
  source_url: string | null;
  title: string;
  title_en: string | null;
  title_th: string | null;
  updated_at: Date | string;
}>;

type ProductRecommendationDbRow = Readonly<{
  active_offer_id: string | null;
  active_offer_availability_status: ProductAvailabilityStatus | null;
  active_affiliate_commission_rate: string | number | null;
  active_offer_currency: string | null;
  active_affiliate_priority: string | number | null;
  active_offer_price_amount: string | number | null;
  active_affiliate_type: "affiliate" | "direct" | null;
  active_affiliate_url: string | null;
  available_country_codes: string[] | null;
  brand_name: string | null;
  brand_status: ProductStatus | null;
  currency: string;
  description: string | null;
  description_en: string | null;
  description_th: string | null;
  facts: unknown;
  id: string;
  image_url: string | null;
  label_status: ProductLabelStatus;
  manufacturer_country_codes: string[] | null;
  status: ProductStatus;
  platform: ProductPlatform;
  product_audience: ProductAudience | null;
  product_kind: ProductKind;
  product_data_expires_at: Date | string | null;
  product_url: string;
  region: string;
  source_url: string | null;
  title: string;
  title_en: string | null;
  title_th: string | null;
}>;

type FactDbPayload = Readonly<{
  aliases?: string[] | null;
  amount?: number | string | null;
  confidence?: ProductConfidence | null;
  foodId?: string | null;
  id?: string;
  itemType?: "food" | "nutrient" | "supplement";
  maxAmount?: number | string | null;
  maxUnit?: string | null;
  name?: string;
  normalizedName?: string;
  nutrientId?: string | null;
  servingLabel?: string | null;
  source?: string | null;
  sourceText?: string | null;
  sourceUrl?: string | null;
  supplementId?: string | null;
  supplementAudience?: ProductAudience | null;
  supplementStatus?: ProductFactSupplementStatus | null;
  safetyFlags?: string[] | null;
  unit?: string | null;
}>;

const productStatuses = new Set<ProductStatus>([
  "approved",
  "ignored",
  "pending_review"
]);
const productPlatforms = new Set<ProductPlatform>(["lazada", "manual", "shopee"]);
const productLabelStatuses = new Set<ProductLabelStatus>([
  "failed",
  "missing",
  "parsed",
  "stale"
]);
const productAvailabilityStatuses = new Set<ProductAvailabilityStatus>([
  "in_stock",
  "out_of_stock",
  "unavailable",
  "unknown"
]);
const productAudiences = new Set<ProductAudience>(["both", "female", "male"]);

export function isProductStatus(value: string): value is ProductStatus {
  return productStatuses.has(value as ProductStatus);
}

export function isProductPlatform(value: string): value is ProductPlatform {
  return productPlatforms.has(value as ProductPlatform);
}

export function isProductLabelStatus(value: string): value is ProductLabelStatus {
  return productLabelStatuses.has(value as ProductLabelStatus);
}

export function isProductAvailabilityStatus(
  value: string
): value is ProductAvailabilityStatus {
  return productAvailabilityStatuses.has(value as ProductAvailabilityStatus);
}

export function isProductAudience(value: string): value is ProductAudience {
  return productAudiences.has(value as ProductAudience);
}

export function emptyAdminProductsData(): AdminProductsData {
  return {
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    platforms: [],
    rows: [],
    summary: {
      activeAffiliate: 0,
      dirtyData: 0,
      ignored: 0,
      missingFacts: 0,
      missingImage: 0,
      pendingReview: 0,
      total: 0,
      approved: 0
    }
  };
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value: unknown) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));

  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function arrayPayload(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function productCountryCodesFromDb(
  value: unknown,
  fallback: readonly string[] = [defaultProductCountryCode]
): ProductCountryCode[] {
  return normalizeProductCountryCodes(Array.isArray(value) ? value : [], fallback);
}

function normalizeSubmittedProductCountryCodes(
  countryCodes: readonly string[],
  label: string
): ProductCountryCode[] {
  if (countryCodes.length < 1) {
    throw new Error(`${label} requires at least one country`);
  }

  const codes = [
    ...new Set(countryCodes
      .map((countryCode) => normalizeProductCountryCode(countryCode))
      .filter((countryCode): countryCode is ProductCountryCode => Boolean(countryCode)))
  ];

  if (codes.length < 1) {
    throw new Error(`${label} requires at least one valid country`);
  }

  return codes;
}

async function loadBrandCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  brandId: string | null | undefined,
  fallback: readonly string[] = [defaultProductCountryCode]
): Promise<ProductCountryCode[]> {
  if (!brandId) {
    return normalizeProductCountryCodes([], fallback);
  }

  const rows = await sql<Array<{ country_code: string }>>`
    select country_code
    from public.product_brand_countries
    where brand_id = ${brandId}::uuid
    order by country_code asc
  `;

  return normalizeProductCountryCodes(
    rows.map((row) => row.country_code),
    fallback
  );
}

async function loadProductCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string,
  fallback: readonly string[] = [defaultProductCountryCode]
): Promise<ProductCountryCode[]> {
  const rows = await sql<Array<{ country_code: string }>>`
    select country_code
    from public.product_countries
    where product_id = ${productId}::uuid
    order by country_code asc
  `;

  return normalizeProductCountryCodes(
    rows.map((row) => row.country_code),
    fallback
  );
}

async function ensureBrandCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  brandId: string | null | undefined,
  countryCodes: readonly string[]
): Promise<ProductCountryCode[]> {
  if (!brandId) {
    return normalizeProductCountryCodes(countryCodes);
  }

  const codes = normalizeProductCountryCodes(countryCodes);

  await sql`
    insert into public.product_brand_countries (
      brand_id,
      country_code,
      created_at,
      updated_at
    )
    select
      ${brandId}::uuid,
      country_code,
      now(),
      now()
    from unnest(${codes}::text[]) as input(country_code)
    on conflict (brand_id, country_code) do update set
      updated_at = excluded.updated_at
  `;

  return loadBrandCountryCodes(sql, brandId, codes);
}

async function replaceBrandCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  brandId: string,
  countryCodes: readonly string[]
): Promise<ProductCountryCode[]> {
  const codes = normalizeSubmittedProductCountryCodes(
    countryCodes,
    "Manufacturer countries"
  );

  await sql`
    delete from public.product_brand_countries
    where brand_id = ${brandId}::uuid
      and country_code <> all(${codes}::text[])
  `;

  await ensureBrandCountryCodes(sql, brandId, codes);

  return codes;
}

async function replaceProductCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string,
  countryCodes: readonly string[]
): Promise<ProductCountryCode[]> {
  const codes = normalizeSubmittedProductCountryCodes(
    countryCodes,
    "Product countries"
  );

  await sql`
    delete from public.product_countries
    where product_id = ${productId}::uuid
      and country_code <> all(${codes}::text[])
  `;

  await sql`
    insert into public.product_countries (
      product_id,
      country_code,
      created_at,
      updated_at
    )
    select
      ${productId}::uuid,
      country_code,
      now(),
      now()
    from unnest(${codes}::text[]) as input(country_code)
    on conflict (product_id, country_code) do update set
      updated_at = excluded.updated_at
  `;

  return codes;
}

function sameProductCountryCodes(
  left: readonly ProductCountryCode[],
  right: readonly ProductCountryCode[]
) {
  const normalizedLeft = normalizeProductCountryCodes(left).sort();
  const normalizedRight = normalizeProductCountryCodes(right).sort();

  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((countryCode, index) => countryCode === normalizedRight[index]);
}

async function reconcileProductsForBrandCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  brandId: string,
  countryCodes: readonly ProductCountryCode[]
) {
  const codes = normalizeSubmittedProductCountryCodes(
    countryCodes,
    "Manufacturer countries"
  );

  await sql`
    delete from public.product_countries
    using public.products
    where product_countries.product_id = products.id
      and products.brand_id = ${brandId}::uuid
      and product_countries.country_code <> all(${codes}::text[])
  `;

  await sql`
    insert into public.product_countries (
      product_id,
      country_code,
      created_at,
      updated_at
    )
    select
      products.id,
      input.country_code,
      now(),
      now()
    from public.products
    cross join unnest(${codes}::text[]) as input(country_code)
    where products.brand_id = ${brandId}::uuid
    on conflict (product_id, country_code) do update set
      updated_at = excluded.updated_at
  `;

  return codes;
}

function assertProductCountriesAllowedByBrand(
  productCountryCodes: readonly string[],
  brandCountryCodes: readonly string[],
  brandName?: string | null
) {
  const brandCountries = new Set(brandCountryCodes);
  const disallowed = productCountryCodes.filter((code) => !brandCountries.has(code));

  if (disallowed.length > 0) {
    throw new Error(
      `Product countries must be enabled on manufacturer${brandName ? ` ${brandName}` : ""}: ${disallowed.join(", ")}`
    );
  }
}

function normalizeFact(fact: FactDbPayload): AdminProductFact {
  const amount = numberOrNull(fact.amount);
  const unit = typeof fact.unit === "string" ? fact.unit : null;
  const rawName = String(fact.name ?? fact.normalizedName ?? "");
  const name = normalizeProductFactName(rawName) || rawName;
  const normalizedName =
    normalizeProductFactKey(rawName) ||
    (typeof fact.normalizedName === "string" && fact.normalizedName
      ? normalizeProductFactKey(fact.normalizedName)
      : "");
  const aliasKeys = productFactAliasKeys(
    rawName,
    Array.isArray(fact.aliases) ? fact.aliases : []
  );
  const doseUnit = unit ? normalizeDoseUnit(unit) : null;
  const comparableAmount =
    amount !== null && doseUnit && !productFactLooksLikeConcentration(rawName)
      ? comparableDoseAmount(
          {
            amount,
            originalText: `${amount} ${doseUnit}`,
            unit: doseUnit
          },
          normalizedName
        )
      : null;

  return {
    amount,
    aliasKeys,
    comparableAmount,
    confidence: fact.confidence ?? "moderate",
    foodId: fact.foodId ?? null,
    id: fact.id ?? crypto.randomUUID(),
    itemType: fact.itemType ?? "supplement",
    maxAmount: numberOrNull(fact.maxAmount),
    maxUnit: typeof fact.maxUnit === "string" ? fact.maxUnit : null,
    name: name || normalizedName,
    normalizedName,
    nutrientId: fact.nutrientId ?? null,
    safetyFlags: Array.isArray(fact.safetyFlags)
      ? fact.safetyFlags.filter((item): item is string => typeof item === "string")
      : [],
    servingLabel: fact.servingLabel ?? null,
    source: typeof fact.source === "string" ? fact.source : null,
    sourceText: typeof fact.sourceText === "string" ? fact.sourceText : null,
    sourceUrl: typeof fact.sourceUrl === "string" ? fact.sourceUrl : null,
    supplementAudience: productAudienceFromUnknown(fact.supplementAudience) ?? "both",
    supplementId: fact.supplementId ?? null,
    supplementStatus: fact.supplementStatus ?? null,
    unit
  };
}

function productSafetyPasses(facts: readonly AdminProductFact[], rawFacts: unknown) {
  const payloads = arrayPayload(rawFacts) as FactDbPayload[];

  for (const [index, fact] of facts.entries()) {
    const payload = payloads[index];

    if (payload?.supplementStatus === "blocked") {
      return false;
    }

    const amount = numberOrNull(payload?.amount);
    const unit = typeof payload?.unit === "string" ? payload.unit : null;
    const rawName = String(payload?.name ?? fact.name ?? fact.normalizedName ?? "");

    if (productFactLooksLikeConcentration(rawName)) {
      continue;
    }

    const maxAmount = numberOrNull(payload?.maxAmount);
    const maxUnit =
      typeof payload?.maxUnit === "string" ? payload.maxUnit : null;
    const doseUnit = unit ? normalizeDoseUnit(unit) : null;
    const limit = parseDoseLimit(maxAmount, maxUnit);

    if (amount !== null && doseUnit && limit) {
      const exceeds = doseExceedsLimit(
        {
          amount,
          originalText: `${amount} ${doseUnit}`,
          unit: doseUnit
        },
        limit,
        fact.normalizedName
      );

      if (exceeds === true) {
        return false;
      }
    }
  }

  return true;
}

function roundedDoseAmount(value: number) {
  return Math.ceil(value * 1_000_000) / 1_000_000;
}

function recordFromUnknown(value: unknown) {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function productAudienceFromUnknown(value: unknown): ProductAudience | null {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replaceAll("-", "_")
    : "";

  return isProductAudience(normalized) ? normalized : null;
}

function productAudienceFromText(...values: readonly unknown[]): ProductAudience | null {
  const text = values
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (!text) {
    return null;
  }

  const malePattern =
    /\b(men|mens|men's|male|prostate|testosterone)\b|conceive\s+well\s+men/;
  const femalePattern =
    /\b(women|womens|women's|female|pregnancy|pregnant|breast[ -]?feeding|breastfeeding|prenatal|postnatal|menopause)\b|conceive\s+well(?!\s+men)/;

  if (malePattern.test(text)) {
    return "male";
  }

  if (femalePattern.test(text)) {
    return "female";
  }

  return null;
}

function productAudienceFromSnapshot(value: unknown) {
  const snapshot = recordFromUnknown(value);
  const correction = recordFromUnknown(snapshot.aiFactCorrection);
  const qualityEnrichment = recordFromUnknown(snapshot.qualityEnrichment);

  return productAudienceFromUnknown(correction.productAudience) ??
    productAudienceFromUnknown(qualityEnrichment.productAudience) ??
    "both";
}

function aiCorrectionNotesFromSnapshot(value: unknown) {
  const snapshot = recordFromUnknown(value);
  const correction = recordFromUnknown(snapshot.aiFactCorrection);
  const notes = correction.notes;

  return typeof notes === "string" && notes.trim() ? notes.trim() : null;
}

function validationLabel(validation: ValidationResult) {
  if (validation.reasons.includes("missing_image")) {
    return "Missing Image";
  }

  if (
    validation.reasons.includes("no_dosed_facts") ||
    validation.reasons.includes("no_canonical_match")
  ) {
    return "Missing Facts";
  }

  if (
    validation.reasons.includes("dirty_name") ||
    validation.reasons.includes("concentration_only") ||
    validation.reasons.includes("source_conflict")
  ) {
    return "Dirty Data";
  }

  if (validation.status === "pass") {
    return "Approved";
  }

  return "Needs Review";
}

function validationCacheStatusForRow(
  row: Pick<ProductDbRow, "validation_reasons" | "validation_status" | "validation_summary">,
  validation: ValidationResult
) {
  const staleReasons = validationCacheMismatchReasons(
    {
      reasons: row.validation_reasons ?? [],
      status: row.validation_status,
      summary: row.validation_summary
    },
    validation
  );
  const status: ProductValidationCacheStatus = !row.validation_status
    ? "missing"
    : staleReasons.length > 0
      ? "stale"
      : "fresh";

  return {
    staleReasons,
    status
  };
}

function validationForRow(
  row: Pick<ProductDbRow, "image_url" | "label_status" | "product_url" | "source_url">,
  facts: readonly AdminProductFact[],
  rawFacts: unknown
) {
  const payloads = arrayPayload(rawFacts) as FactDbPayload[];
  const validationFacts = facts.map((fact, index) => {
    const payload = payloads[index] ?? {};

    return {
      amount: fact.amount,
      confidence: fact.confidence,
      foodId: fact.foodId,
      itemType: fact.itemType,
      maxAmount: payload.maxAmount,
      maxUnit: payload.maxUnit,
      name: fact.name,
      normalizedName: fact.normalizedName,
      nutrientId: fact.nutrientId,
      source: fact.source,
      sourceText: fact.sourceText,
      supplementId: fact.supplementId,
      supplementStatus: payload.supplementStatus,
      unit: fact.unit
    };
  });

  return validateProduct({
    facts: validationFacts,
    imageUrl: row.image_url,
    labelStatus: row.label_status,
    productUrl: row.product_url,
    sourceUrl: row.source_url
  });
}

function rowFromDb(row: ProductDbRow): AdminProductRow {
  const facts = (arrayPayload(row.facts) as FactDbPayload[]).map(normalizeFact);
  const validation = validationForRow(row, facts, row.facts);
  const validationCache = validationCacheStatusForRow(row, validation);
  const effectiveListStatus =
    row.status === "approved" && validation.status !== "pass"
      ? "pending_review"
      : row.status;
  const offers = arrayPayload(row.offers).map((item) => {
    const record = item && typeof item === "object"
      ? item as Record<string, unknown>
      : {};

    return {
      availabilityStatus:
        record.availabilityStatus === "in_stock" ||
        record.availabilityStatus === "out_of_stock" ||
        record.availabilityStatus === "unavailable"
          ? record.availabilityStatus
          : "unknown",
      commissionRate: numberOrNull(record.commissionRate),
      currency: typeof record.currency === "string" ? record.currency : "THB",
      id: typeof record.id === "string" ? record.id : crypto.randomUUID(),
      linkType: record.linkType === "direct" ? "direct" : "affiliate",
      network: typeof record.network === "string" ? record.network : null,
      platform: typeof record.platform === "string" ? record.platform : null,
      priceAmount: numberOrNull(record.priceAmount),
      priority: numberOrNull(record.priority) ?? 0,
      status:
        record.status === "flagged_stale" || record.status === "inactive"
          ? record.status
          : "active",
      url: typeof record.url === "string" ? record.url : ""
    } satisfies AdminProductOffer;
  });
  const activeAffiliateStatus =
    offers.some((offer) => offer.status === "active" && offer.linkType === "affiliate")
      ? "active"
      : "none";
  const activeOfferPriceAmount = numberOrNull(row.active_offer_price_amount);
  const activeOfferCurrency = row.active_offer_currency || "THB";
  const activeOfferAvailability = row.active_offer_availability_status ?? "unknown";

  return {
	    affiliateStatus: activeAffiliateStatus,
	    aiCorrectionNotes: aiCorrectionNotesFromSnapshot(row.source_snapshot),
	    availabilityStatus: activeOfferAvailability,
	    availableCountryCodes: productCountryCodesFromDb(
	      row.available_country_codes,
	      [row.region]
	    ),
	    brandId: row.brand_id,
	    brandName: row.brand_name,
	    brandStatus: row.brand_status,
    category: row.category,
    currency: activeOfferCurrency,
    description: row.description,
    descriptionEn: row.description_en,
    descriptionTh: row.description_th,
    facts,
    fdaApprovalNumber: row.fda_approval_number,
    id: row.id,
    imageUrl: row.image_url,
    labelStatus: row.label_status,
    status: effectiveListStatus,
    validation,
    validationCacheStatus: validationCache.status,
    validationCacheStaleReasons: validationCache.staleReasons,
    validationLabel: validationLabel(validation),
    productAudience:
      row.product_audience && row.product_audience !== "both"
        ? row.product_audience
        : productAudienceFromText(
            row.title,
            row.title_en,
            row.title_th,
            row.description,
            row.description_en,
            row.description_th
          ) ?? row.product_audience ?? "both",
	    importReviewTaskId: row.import_review_task_id,
	    importStatus: row.import_status,
	    manufacturerCountryCodes: productCountryCodesFromDb(
	      row.manufacturer_country_codes,
	      [row.region]
	    ),
	    offers,
    platform: row.platform,
    priceAmount: activeOfferPriceAmount,
    productImportDuplicateProductIds: row.import_duplicate_product_ids ?? [],
    productImportId: row.import_id,
    productKind: row.product_kind ?? "supplement",
    productUrl: row.product_url,
    recommendationHistory: {
      averageProductCoveragePercent: numberOrNull(
        row.history_average_product_coverage_percent
      ),
      averageStackCoveragePercent: numberOrNull(
        row.history_average_stack_coverage_percent
      ),
      chosenCount: Math.max(0, Math.round(numberOrNull(row.history_chosen_count) ?? 0)),
      lastRecommendedAt: isoOrNull(row.history_last_recommended_at)
    },
    region: row.region,
    sourceEvidence: {
      importId: row.import_id,
      importReviewTaskId: row.import_review_task_id,
      importStatus: row.import_status,
      sourceUrl: row.source_url ?? row.product_url
    },
    title: row.title,
    titleEn: row.title_en,
    titleTh: row.title_th,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

async function refreshAndPersistProductValidation(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string
) {
  const rows = await loadProductRows(productId);
  const sourceRow = rows?.[0];

  if (!sourceRow) {
    throw new Error("Product not found for validation check");
  }

  const row = rowFromDb(sourceRow);
  const validation = row.validation;
  const safeListStatus =
    row.status === "approved" && validation.status !== "pass"
      ? "pending_review"
      : row.status;
  const safeLabelStatus =
    validation.status === "pass" && row.facts.length > 0
      ? "parsed"
      : validation.reasons.includes("no_dosed_facts")
      ? row.facts.length > 0
        ? "failed"
        : "missing"
      : row.labelStatus;
  const validationPayload = toJsonValue(validation);

  await sql`
    update public.products
    set
      status = ${safeListStatus},
      label_status = ${safeLabelStatus},
      source_snapshot = source_snapshot || jsonb_build_object(
        'validation',
        ${sql.json(validationPayload)}::jsonb
      ),
      updated_at = now()
    where id = ${productId}::uuid
  `;

  try {
    await sql`
      update public.products
      set
        validation_status = ${validation.status},
        validation_reasons = ${validation.reasons}::text[],
        validation_summary = ${validation.summary},
        validation_checked_at = ${validation.checkedAt}::timestamptz,
        updated_at = now()
      where id = ${productId}::uuid
    `;
  } catch (error) {
    const code = error && typeof error === "object"
      ? (error as { code?: string }).code
      : null;

    if (code !== "42703") {
      throw error;
    }
  }

  return {
    labelStatus: safeLabelStatus,
    status: safeListStatus,
    validation
  };
}

async function productIdsUsingSupplement(
  sql: NonNullable<ReturnType<typeof getSql>>,
  supplementId: string
) {
  if (!isUuidValue(supplementId)) {
    return [];
  }

  const rows = await sql<Array<{ product_id: string }>>`
    select distinct product_facts.product_id::text
    from public.product_facts
    where product_facts.supplement_id = ${supplementId}::uuid
    order by product_facts.product_id::text
  `;

  return rows.map((row) => row.product_id);
}

async function refreshAndPersistProductValidations(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productIds: readonly string[]
) {
  const uniqueProductIds = [...new Set(productIds.filter(isUuidValue))];
  const refreshed: Array<{
    labelStatus: ProductLabelStatus;
    productId: string;
    status: ProductStatus;
    validation: ValidationResult;
  }> = [];

  for (const productId of uniqueProductIds) {
    const result = await refreshAndPersistProductValidation(sql, productId);

    refreshed.push({
      productId,
      ...result
    });
  }

  if (refreshed.length > 0) {
    clearProductRecommendationCandidateCache();
  }

  return refreshed;
}

export async function revalidateProductsForSupplement(input: Readonly<{
  actor?: string | null;
  supplementId: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const productIds = await productIdsUsingSupplement(sql, input.supplementId);
  const refreshed = await refreshAndPersistProductValidations(sql, productIds);

  if (refreshed.length > 0) {
    await sql`
      insert into public.product_admin_audit (
        actor,
        action,
        after_payload
      )
      values (
        ${input.actor ?? "admin_dashboard"},
        'product_validation_revalidated_for_supplement',
        ${sql.json(toJsonValue({
          productIds,
          revalidatedCount: refreshed.length,
          supplementId: input.supplementId
        }))}::jsonb
      )
    `;
  }

  return {
    productIds,
    revalidatedCount: refreshed.length,
    refreshed,
    supplementId: input.supplementId
  };
}

function persistedValidationForRow(row: ProductDbRow) {
  return {
    checkedAt: row.validation_checked_at
      ? new Date(row.validation_checked_at).toISOString()
      : null,
    reasons: row.validation_reasons ?? [],
    status: row.validation_status,
    summary: row.validation_summary
  };
}

export type ProductValidationConsistencyRow = Readonly<{
  factIssues: Array<{
    factId: string;
    factName: string;
    issues: string[];
    supplementId: string | null;
  }>;
  mismatchReasons: string[];
  persisted: ReturnType<typeof persistedValidationForRow>;
  productId: string;
  recomputed: ValidationResult;
  status: ProductStatus;
  title: string;
}>;

export async function checkProductValidationConsistency(input: Readonly<{
  limit?: number | null;
  productId?: string | null;
}> = {}) {
  const rows = await loadProductRows(input.productId ?? null);

  if (!rows) {
    throw new Error("Database is not configured");
  }

  const limit = Math.max(1, Math.min(5000, Math.round(input.limit ?? 1000)));
  const checkedRows = rows.slice(0, limit);
  const mismatches: ProductValidationConsistencyRow[] = [];

  for (const row of checkedRows) {
    const adminRow = rowFromDb(row);
    const persisted = persistedValidationForRow(row);
    const mismatchReasons = validationCacheMismatchReasons(
      persisted,
      adminRow.validation
    );

    if (mismatchReasons.length < 1) {
      continue;
    }

    mismatches.push({
      factIssues: adminRow.facts
        .map((fact) => ({
          factId: fact.id,
          factName: fact.name,
          issues: productFactObservableIssueMessages(fact),
          supplementId: fact.supplementId ?? null
        }))
        .filter((fact) => fact.issues.length > 0),
      mismatchReasons,
      persisted,
      productId: adminRow.id,
      recomputed: adminRow.validation,
      status: adminRow.status,
      title: adminRow.title
    });
  }

  return {
    checkedCount: checkedRows.length,
    generatedAt: new Date().toISOString(),
    limit,
    staleCount: mismatches.length,
    staleRows: mismatches
  };
}

export async function repairProductValidationConsistency(input: Readonly<{
  actor?: string | null;
  limit?: number | null;
  productId?: string | null;
}> = {}) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const report = await checkProductValidationConsistency(input);
  const refreshed = await refreshAndPersistProductValidations(
    sql,
    report.staleRows.map((row) => row.productId)
  );

  if (refreshed.length > 0) {
    await sql`
      insert into public.product_admin_audit (
        actor,
        action,
        after_payload
      )
      values (
        ${input.actor ?? "admin_dashboard"},
        'product_validation_cache_repaired',
        ${sql.json(toJsonValue({
          productIds: refreshed.map((row) => row.productId),
          repairedCount: refreshed.length
        }))}::jsonb
      )
    `;
  }

  return {
    ...report,
    repairedCount: refreshed.length,
    repairedProductIds: refreshed.map((row) => row.productId)
  };
}

export async function runProductValidationCheck(input: Readonly<{
  actor?: string | null;
  productId: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const validation = await refreshAndPersistProductValidation(sql, input.productId);

  await sql`
    insert into public.product_admin_audit (
      product_id,
      actor,
      action,
      after_payload
    )
    values (
      ${input.productId}::uuid,
      ${input.actor ?? "admin_dashboard"},
      'product_validation_checked',
      ${sql.json(toJsonValue(validation.validation))}::jsonb
    )
  `;

  const rows = await loadProductRows(input.productId);
  const row = rows?.[0] ? rowFromDb(rows[0]) : null;

  if (!row) {
    throw new Error("Product not found after validation check");
  }

  return row;
}

export async function increaseProductFactSafetyLimit(input: Readonly<{
  actor?: string | null;
  factId: string;
  productId: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!isUuidValue(input.productId) || !isUuidValue(input.factId)) {
    throw new Error("Product fact was not found");
  }

  const rows = await sql<Array<{
    amount: string | number | null;
    confidence: "high" | "low" | "moderate" | null;
    fact_name: string;
    max_amount: string | number | null;
    max_unit: string | null;
    normalized_name: string;
    safety_flags: string[] | null;
    safety_notes: string | null;
    supplement_id: string | null;
    supplement_name: string | null;
    unit: string | null;
  }>>`
    select
      product_facts.name as fact_name,
      product_facts.normalized_name,
      product_facts.amount,
      product_facts.unit,
      product_facts.supplement_id::text,
      supplements.name as supplement_name,
      limits.max_amount,
      limits.max_unit,
      limits.confidence,
      limits.safety_flags,
      limits.safety_notes
    from public.product_facts
    left join public.supplements
      on supplements.id = product_facts.supplement_id
    left join lateral (
      select *
      from public.supplement_safety_limits
      where supplement_safety_limits.supplement_id = product_facts.supplement_id
      order by version desc
      limit 1
    ) limits on true
    where product_facts.id = ${input.factId}::uuid
      and product_facts.product_id = ${input.productId}::uuid
    limit 1
  `;
  const fact = rows[0];

  if (!fact || !isUuidValue(fact.supplement_id)) {
    throw new Error("Safety limit can only be changed for a canonical supplement fact");
  }

  const amount = numberOrNull(fact.amount);
  const doseUnit = fact.unit ? normalizeDoseUnit(fact.unit) : null;
  const supplementKey = fact.normalized_name || fact.fact_name;

  if (amount === null || amount <= 0 || !doseUnit) {
    throw new Error("Fact has no comparable dose for a safety limit update");
  }

  const currentLimit = parseDoseLimit(numberOrNull(fact.max_amount), fact.max_unit);
  const factDose = {
    amount,
    originalText: `${amount} ${fact.unit ?? doseUnit}`,
    unit: doseUnit
  };

  if (currentLimit) {
    const exceedsLimit = doseExceedsLimit(factDose, currentLimit, supplementKey);

    if (exceedsLimit === null) {
      throw new Error(
        "Safety limit unit cannot be compared with this product fact unit; update this supplement from the Supplements screen"
      );
    }

    if (!exceedsLimit) {
      throw new Error("The configured safety limit already covers this dose");
    }
  }

  const maxUnit = fact.max_unit?.trim() || `${doseUnit}/day`;
  const nextMaxAmount = currentLimit
    ? doseAmountInLimitUnit(factDose, currentLimit, supplementKey)
    : amount;

  if (nextMaxAmount === null) {
    throw new Error(
      "Safety limit unit cannot be converted without changing the configured unit"
    );
  }

  const nextMaxAmountRounded = roundedDoseAmount(nextMaxAmount);
  const beforePayload = {
    factId: input.factId,
    factName: fact.fact_name,
    maxAmount: numberOrNull(fact.max_amount),
    maxUnit: fact.max_unit,
    productId: input.productId,
    supplementId: fact.supplement_id,
    supplementName: fact.supplement_name
  };
  const safetyNotes = [
    fact.safety_notes?.trim() || null,
    `Raised from product review to cover ${amount} ${fact.unit ?? doseUnit} in ${fact.fact_name}.`
  ]
    .filter(Boolean)
    .join(" ");

  const version = await appendSupplementSafetyLimitVersion(sql, {
    confidence: fact.confidence ?? "moderate",
    maxAmount: nextMaxAmountRounded,
    maxUnit,
    safetyFlags: normalizeSupplementSafetyFlags(fact.safety_flags ?? []),
    safetyNotes,
    supplementId: fact.supplement_id
  });

  await sql`
    insert into public.supplement_admin_audit (
      id,
      supplement_id,
      action,
      actor,
      before_payload,
      after_payload
    )
    values (
      ${crypto.randomUUID()}::uuid,
      ${fact.supplement_id}::uuid,
      'safety_limit_increased_from_product',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue(beforePayload))}::jsonb,
      ${sql.json(toJsonValue({
        ...beforePayload,
        factAmount: amount,
        factUnit: fact.unit ?? doseUnit,
        maxAmount: nextMaxAmountRounded,
        maxUnit,
        version
      }))}::jsonb
    )
  `;

  const revalidation = await refreshAndPersistProductValidations(
    sql,
    await productIdsUsingSupplement(sql, fact.supplement_id)
  );
  const validation = revalidation.find((row) => row.productId === input.productId) ??
    await refreshAndPersistProductValidation(sql, input.productId);
  const productVersion = await recordProductVersion(sql, {
    actor: input.actor,
    changeNote: "product_safety_limit_increased",
    productId: input.productId
  });

  await sql`
    insert into public.product_admin_audit (
      product_id,
      actor,
      action,
      after_payload
    )
    values (
      ${input.productId}::uuid,
      ${input.actor ?? "admin_dashboard"},
      'product_safety_limit_increased',
      ${sql.json(toJsonValue({
        factId: input.factId,
        factAmount: amount,
        factUnit: fact.unit ?? doseUnit,
        maxAmount: nextMaxAmountRounded,
        maxUnit,
        productVersion,
        revalidatedProductCount: revalidation.length,
        supplementId: fact.supplement_id,
        validation: validation.validation,
        version
      }))}::jsonb
    )
  `;

  const row = await loadAdminProductRow(input.productId);

  if (!row) {
    throw new Error("Product not found after safety limit update");
  }

  const revalidatedRows = (
    await Promise.all(
      revalidation.map((item) => loadAdminProductRow(item.productId))
    )
  ).filter((item): item is AdminProductRow => Boolean(item));

  clearProductRecommendationCandidateCache();

  return {
    revalidatedProductIds: revalidation.map((item) => item.productId),
    revalidatedRows,
    row
  };
}

function summaryFromRows(rows: AdminProductRow[]) {
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

async function loadProductRows(productId?: string | null) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  return sql<ProductDbRow[]>`
    select
      products.id::text,
      products.platform,
      products.region,
      products.title,
      products.title_en,
      products.title_th,
      products.brand_name,
      products.image_url,
      products.product_url,
      products.source_url,
      products.source_snapshot,
      products.description,
      coalesce(to_jsonb(products) ->> 'description_en', products.source_snapshot ->> 'descriptionEn') as description_en,
      coalesce(to_jsonb(products) ->> 'description_th', products.source_snapshot ->> 'descriptionTh') as description_th,
      products.category,
      products.fda_approval_number,
      coalesce(to_jsonb(products) ->> 'product_audience', 'both') as product_audience,
      products.product_kind,
      products.status,
	      products.label_status,
	      coalesce(product_country_rows.country_codes, array[upper(coalesce(nullif(products.region, ''), 'TH'))]) as available_country_codes,
	      coalesce(active_offer.availability_status, 'unknown') as availability_status,
      case
        when active_offer.link_type = 'affiliate' then 'active'
        else 'none'
      end as affiliate_status,
      active_offer.price_amount,
      products.currency,
      products.current_version,
      products.product_data_expires_at,
      products.validation_status,
      products.validation_summary,
      products.validation_reasons,
      products.validation_checked_at,
      products.updated_at,
      import_review.id::text as import_id,
      import_review.status as import_status,
      import_review.review_task_id::text as import_review_task_id,
      import_review.duplicate_product_ids::text[] as import_duplicate_product_ids,
	      product_brands.id::text as brand_id,
	      product_brands.status as brand_status,
	      coalesce(brand_country_rows.country_codes, array[upper(coalesce(nullif(product_brands.country_code, ''), 'TH'))]) as manufacturer_country_codes,
	      active_offer.id::text as active_offer_id,
      active_offer.availability_status as active_offer_availability_status,
      active_offer.currency as active_offer_currency,
      active_offer.link_type as active_affiliate_type,
      active_offer.price_amount as active_offer_price_amount,
      active_offer.url as active_affiliate_url,
      active_offer.commission_rate as active_affiliate_commission_rate,
      active_offer.admin_priority as active_affiliate_priority,
      coalesce(fact_rows.facts, '[]'::jsonb) as facts,
      coalesce(offer_rows.offers, '[]'::jsonb) as offers,
      coalesce(history.chosen_count, 0) as history_chosen_count,
      history.last_recommended_at as history_last_recommended_at,
      history.average_product_coverage_percent,
      history.average_stack_coverage_percent
    from public.products
	    left join public.product_brands
	      on product_brands.id = products.brand_id
	    left join lateral (
	      select array_agg(product_countries.country_code order by product_countries.country_code) as country_codes
	      from public.product_countries
	      where product_countries.product_id = products.id
	    ) product_country_rows on true
	    left join lateral (
	      select array_agg(product_brand_countries.country_code order by product_brand_countries.country_code) as country_codes
	      from public.product_brand_countries
	      where product_brand_countries.brand_id = product_brands.id
	    ) brand_country_rows on true
    left join lateral (
      select
        product_imports.id,
        product_imports.status,
        product_imports.review_task_id,
        product_imports.duplicate_product_ids
      from public.product_imports
      where product_imports.product_id = products.id
        and product_imports.status = 'pending_review'
      order by product_imports.updated_at desc
      limit 1
    ) import_review on true
    left join lateral (
      select
        id,
        url,
        link_type,
        commission_rate,
        admin_priority,
        price_amount,
        currency,
        availability_status
      from public.product_offers
      where product_offers.product_id = products.id
        and product_offers.status = 'active'
        and product_offers.availability_status not in ('out_of_stock', 'unavailable')
      order by
        case when product_offers.link_type = 'affiliate' then 0 else 1 end,
        product_offers.commission_rate desc nulls last,
        product_offers.admin_priority desc,
        product_offers.updated_at desc
      limit 1
    ) active_offer on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', product_facts.id,
            'itemType', product_facts.item_type,
            'supplementId', product_facts.supplement_id,
            'foodId', product_facts.food_id,
            'nutrientId', product_facts.nutrient_id,
            'name', product_facts.name,
            'normalizedName', product_facts.normalized_name,
            'aliases', coalesce(supplement_alias_rows.aliases, '[]'::jsonb),
            'amount', product_facts.amount,
            'unit', product_facts.unit,
            'servingLabel', product_facts.serving_label,
            'confidence', product_facts.confidence,
            'source', product_facts.source,
            'sourceUrl', product_facts.source_url,
            'sourceText', product_facts.source_text,
            'supplementAudience',
              case
                when coalesce(
                  to_jsonb(supplements) ->> 'audience',
                  supplements.source_payload ->> 'audience',
                  supplements.source_payload ->> 'productAudience'
                ) in ('both', 'female', 'male')
                  then coalesce(
                    to_jsonb(supplements) ->> 'audience',
                    supplements.source_payload ->> 'audience',
                    supplements.source_payload ->> 'productAudience'
                  )
                when lower(coalesce(supplements.primary_use_case, '')) ~ '(male vitality|male fertility|prostate|testosterone|dht)'
                  or lower(coalesce(supplements.name, '')) ~ '(saw palmetto|tongkat)'
                  then 'male'
                when lower(coalesce(supplements.category, '')) like '%gender%'
                  and (
                    lower(coalesce(supplements.primary_use_case, '')) ~ '(female|pms|cycle|estrogen|menopause)'
                    or lower(coalesce(supplements.name, '')) ~ '(vitex|chasteberry|evening primrose)'
                  )
                  then 'female'
                else 'both'
              end,
            'supplementStatus', supplements.list_status,
            'maxAmount', supplement_safety_limits.max_amount,
            'maxUnit', supplement_safety_limits.max_unit,
            'safetyFlags', coalesce(supplement_safety_limits.safety_flags, '{}'::text[])
          )
          order by product_facts.created_at asc
        ),
        '[]'::jsonb
      ) as facts
      from public.product_facts
      left join public.supplements
        on supplements.id = product_facts.supplement_id
      left join lateral (
        select jsonb_agg(supplement_aliases.normalized_alias order by supplement_aliases.normalized_alias) as aliases
        from public.supplement_aliases
        where supplement_aliases.supplement_id = product_facts.supplement_id
      ) supplement_alias_rows on true
      left join lateral (
        select max_amount, max_unit, safety_flags
        from public.supplement_safety_limits
        where supplement_safety_limits.supplement_id = product_facts.supplement_id
        order by version desc
        limit 1
      ) supplement_safety_limits on true
      where product_facts.product_id = products.id
    ) fact_rows on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', product_offers.id,
            'availabilityStatus', product_offers.availability_status,
            'commissionRate', product_offers.commission_rate,
            'currency', product_offers.currency,
            'linkType', product_offers.link_type,
            'network', product_offers.network,
            'platform', product_offers.platform,
            'priceAmount', product_offers.price_amount,
            'priority', product_offers.admin_priority,
            'status', product_offers.status,
            'url', product_offers.url
          )
          order by
            case when product_offers.status = 'active' then 0 else 1 end,
            case when product_offers.link_type = 'affiliate' then 0 else 1 end,
            product_offers.commission_rate desc nulls last,
            product_offers.admin_priority desc,
            product_offers.updated_at desc
        ),
        '[]'::jsonb
      ) as offers
      from public.product_offers
      where product_offers.product_id = products.id
    ) offer_rows on true
    left join lateral (
      select
        count(*)::int as chosen_count,
        max(product_recommendation_items.created_at) as last_recommended_at,
        avg(product_recommendation_items.product_coverage_percent) as average_product_coverage_percent,
        avg(product_recommendation_runs.stack_coverage_percent) as average_stack_coverage_percent
      from public.product_recommendation_items
      join public.product_recommendation_runs
        on product_recommendation_runs.id = product_recommendation_items.run_id
      where product_recommendation_items.product_id = products.id
    ) history on true
    where (${productId ?? null}::uuid is null or products.id = ${productId ?? null}::uuid)
    order by products.updated_at desc, products.title asc
  `;
}

async function loadAdminProductRow(productId: string) {
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

const PRODUCT_RECOMMENDATION_CANDIDATE_CACHE_MS = 15_000;
const productRecommendationCandidateCache = new Map<string, Readonly<{
  loadedAt: number;
  rows: ProductCandidate[];
}>>();

export function clearProductRecommendationCandidateCache() {
  productRecommendationCandidateCache.clear();
}

export async function getProductRecommendationCandidates(input: Readonly<{
  countryCode?: string | null;
  includeIneligible?: boolean;
}> = {}) {
  const sql = getSql();

  if (!sql) {
    return [];
  }

  const now = Date.now();
  const countryCode =
    normalizeProductCountryCode(input.countryCode) ?? defaultProductCountryCode;
  const includeIneligible = input.includeIneligible === true;
  const cacheKey = `${countryCode}:${includeIneligible ? "diagnostic" : "eligible"}`;
  const cached = productRecommendationCandidateCache.get(cacheKey);

  if (
    cached &&
    now - cached.loadedAt <
      PRODUCT_RECOMMENDATION_CANDIDATE_CACHE_MS
  ) {
    return cached.rows;
  }

  const rows = await sql<ProductRecommendationDbRow[]>`
    select
      products.id::text,
      products.platform,
      products.region,
      products.title,
      products.title_en,
      products.title_th,
      products.brand_name,
      products.image_url,
      coalesce(nullif(products.product_url, ''), products.source_url, '') as product_url,
      products.source_url,
      products.description,
      coalesce(to_jsonb(products) ->> 'description_en', products.source_snapshot ->> 'descriptionEn') as description_en,
      coalesce(to_jsonb(products) ->> 'description_th', products.source_snapshot ->> 'descriptionTh') as description_th,
      coalesce(to_jsonb(products) ->> 'product_audience', 'both') as product_audience,
      products.product_kind,
      products.status,
      products.label_status,
      coalesce(product_country_rows.country_codes, array[upper(coalesce(nullif(products.region, ''), 'TH'))]) as available_country_codes,
      products.currency,
      products.product_data_expires_at,
      coalesce(product_brands.status, 'approved') as brand_status,
      coalesce(brand_country_rows.country_codes, array[upper(coalesce(nullif(product_brands.country_code, ''), 'TH'))]) as manufacturer_country_codes,
      active_offer.id::text as active_offer_id,
      active_offer.availability_status as active_offer_availability_status,
      active_offer.currency as active_offer_currency,
      active_offer.link_type as active_affiliate_type,
      active_offer.price_amount as active_offer_price_amount,
      active_offer.url as active_affiliate_url,
      active_offer.commission_rate as active_affiliate_commission_rate,
      active_offer.admin_priority as active_affiliate_priority,
      coalesce(fact_rows.facts, '[]'::jsonb) as facts
    from public.products
    left join public.product_brands
      on product_brands.id = products.brand_id
    left join lateral (
      select array_agg(product_countries.country_code order by product_countries.country_code) as country_codes
      from public.product_countries
      where product_countries.product_id = products.id
    ) product_country_rows on true
    left join lateral (
      select array_agg(product_brand_countries.country_code order by product_brand_countries.country_code) as country_codes
      from public.product_brand_countries
      where product_brand_countries.brand_id = product_brands.id
    ) brand_country_rows on true
    left join lateral (
      select
        id,
        url,
        link_type,
        commission_rate,
        admin_priority,
        price_amount,
        currency,
        availability_status
      from public.product_offers
      where product_offers.product_id = products.id
        and product_offers.status = 'active'
        and product_offers.availability_status not in ('out_of_stock', 'unavailable')
      order by
        case when product_offers.link_type = 'affiliate' then 0 else 1 end,
        product_offers.commission_rate desc nulls last,
        product_offers.admin_priority desc,
        product_offers.updated_at desc
      limit 1
    ) active_offer on true
    join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', product_facts.id,
            'itemType', product_facts.item_type,
            'supplementId', product_facts.supplement_id,
            'foodId', product_facts.food_id,
            'nutrientId', product_facts.nutrient_id,
            'name', product_facts.name,
            'normalizedName', product_facts.normalized_name,
            'aliases', coalesce(supplement_alias_rows.aliases, '[]'::jsonb),
            'amount', product_facts.amount,
            'unit', product_facts.unit,
            'servingLabel', product_facts.serving_label,
            'confidence', product_facts.confidence,
            'source', product_facts.source,
            'sourceUrl', product_facts.source_url,
            'sourceText', product_facts.source_text,
            'supplementAudience',
              case
                when coalesce(
                  to_jsonb(supplements) ->> 'audience',
                  supplements.source_payload ->> 'audience',
                  supplements.source_payload ->> 'productAudience'
                ) in ('both', 'female', 'male')
                  then coalesce(
                    to_jsonb(supplements) ->> 'audience',
                    supplements.source_payload ->> 'audience',
                    supplements.source_payload ->> 'productAudience'
                  )
                when lower(coalesce(supplements.primary_use_case, '')) ~ '(male vitality|male fertility|prostate|testosterone|dht)'
                  or lower(coalesce(supplements.name, '')) ~ '(saw palmetto|tongkat)'
                  then 'male'
                when lower(coalesce(supplements.category, '')) like '%gender%'
                  and (
                    lower(coalesce(supplements.primary_use_case, '')) ~ '(female|pms|cycle|estrogen|menopause)'
                    or lower(coalesce(supplements.name, '')) ~ '(vitex|chasteberry|evening primrose)'
                  )
                  then 'female'
                else 'both'
              end,
            'supplementStatus', supplements.list_status,
            'maxAmount', supplement_safety_limits.max_amount,
            'maxUnit', supplement_safety_limits.max_unit,
            'safetyFlags', coalesce(supplement_safety_limits.safety_flags, '{}'::text[])
          )
          order by product_facts.created_at asc
        ),
        '[]'::jsonb
      ) as facts
      from public.product_facts
      left join public.supplements
        on supplements.id = product_facts.supplement_id
      left join lateral (
        select jsonb_agg(supplement_aliases.normalized_alias order by supplement_aliases.normalized_alias) as aliases
        from public.supplement_aliases
        where supplement_aliases.supplement_id = product_facts.supplement_id
      ) supplement_alias_rows on true
      left join lateral (
        select max_amount, max_unit, safety_flags
        from public.supplement_safety_limits
        where supplement_safety_limits.supplement_id = product_facts.supplement_id
        order by version desc
        limit 1
      ) supplement_safety_limits on true
      where product_facts.product_id = products.id
    ) fact_rows on jsonb_array_length(fact_rows.facts) > 0
    where (${includeIneligible} or products.status = 'approved')
      and (${includeIneligible} or coalesce(product_brands.status, 'approved') = 'approved')
      and ${countryCode} = any(
        coalesce(product_country_rows.country_codes, array[upper(coalesce(nullif(products.region, ''), 'TH'))])
      )
      and (
        products.brand_id is null
        or ${countryCode} = any(
          coalesce(brand_country_rows.country_codes, array[upper(coalesce(nullif(product_brands.country_code, ''), 'TH'))])
        )
      )
      and (${includeIneligible} or products.label_status = 'parsed')
      and (
        products.product_data_expires_at is null
        or products.product_data_expires_at > now()
      )
    order by products.updated_at desc, products.title asc
  `;

  const candidates = rows.map((row) => {
    const facts = (arrayPayload(row.facts) as FactDbPayload[]).map(normalizeFact);
    const validation = validationForRow(row, facts, row.facts);
    const activeAffiliateUrl =
      row.active_affiliate_type === "affiliate" &&
      typeof row.active_affiliate_url === "string"
        ? row.active_affiliate_url
        : null;
    const activeOfferAvailability =
      row.active_offer_availability_status ?? "unknown";
    const activeOfferCurrency = row.active_offer_currency || row.currency || "THB";
    const productDataExpiresAt = isoOrNull(row.product_data_expires_at);

    return {
      activeOfferId: row.active_offer_id,
      activeAffiliateCommissionRate: numberOrNull(row.active_affiliate_commission_rate),
      activeAffiliatePriority: numberOrNull(row.active_affiliate_priority),
      activeAffiliateType: row.active_affiliate_type,
      activeAffiliateUrl,
      affiliateStatus: row.active_affiliate_type === "affiliate" ? "active" : "none",
      automatedSafetyPassed: productSafetyPasses(facts, row.facts),
      availabilityStatus: activeOfferAvailability,
      brandName: row.brand_name,
      brandStatus: row.brand_status,
      currency: activeOfferCurrency,
      facts,
      id: row.id,
      imageUrl: row.image_url,
      labelStatus: row.label_status,
      status: validation.status === "pass" ? row.status : "pending_review",
      platform: row.platform,
      productAudience:
        row.product_audience && row.product_audience !== "both"
          ? row.product_audience
          : productAudienceFromText(
              row.title,
              row.title_en,
              row.title_th,
              row.description,
              row.description_en,
              row.description_th
            ) ?? row.product_audience ?? "both",
      productKind: row.product_kind ?? "supplement",
      validation,
	      priceAmount: numberOrNull(row.active_offer_price_amount),
	      productDataExpiresAt,
	      productUrl: row.product_url,
	      region: row.region,
	      availableCountryCodes: productCountryCodesFromDb(
	        row.available_country_codes,
	        [row.region]
	      ),
	      title: row.title
	    } satisfies ProductCandidate;
	  });

	  productRecommendationCandidateCache.set(cacheKey, {
	    loadedAt: Date.now(),
	    rows: candidates
	  });

  return candidates;
}

export type UpdateAdminProductInput = Readonly<{
  actor?: string | null;
  adminNotes?: string | null;
  affiliateStatus?: ProductAffiliateStatus;
  availabilityStatus?: ProductAvailabilityStatus;
  availableCountryCodes?: readonly string[];
  brandName?: string | null;
  manufacturerCountryCodes?: readonly string[];
  changeNote?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  facts?: readonly ProductImportFactInput[];
  factsSource?: string | null;
  fdaApprovalNumber?: string | null;
  id: string;
  imageUrl?: string | null;
  labelStatus?: ProductLabelStatus;
  status?: ProductStatus;
  priceAmount?: number | null;
  productAudience?: ProductAudience;
  productKind?: ProductKind;
  productUrl?: string | null;
  sourceSnapshotPatch?: Record<string, unknown> | null;
  title?: string | null;
  titleEn?: string | null;
  titleTh?: string | null;
}>;

export type CreateAdminProductInput = Readonly<{
  actor?: string | null;
  affiliateUrl?: string | null;
  availabilityStatus?: ProductAvailabilityStatus;
  availableCountryCodes?: readonly string[];
  brandStatus?: ProductStatus;
  brandName?: string | null;
  manufacturerCountryCodes?: readonly string[];
  currency?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  facts?: readonly ProductImportFactInput[];
  imageUrl?: string | null;
  fdaApprovalNumber?: string | null;
  labelStatus?: ProductLabelStatus;
  status?: ProductStatus;
  externalProductId?: string | null;
  platform: ProductPlatform;
  priceAmount?: number | null;
  productAudience?: ProductAudience;
  productKind?: ProductKind;
  productUrl: string;
  region?: string | null;
  replaceFacts?: boolean;
  source?: string;
  sourceSnapshot?: Record<string, unknown> | null;
  sourceUrl?: string | null;
  title: string;
  titleEn?: string | null;
  titleTh?: string | null;
}>;

export type ProductImportFactInput = Readonly<{
  amount?: number | null;
  confidence?: ProductConfidence;
  itemType?: "food" | "nutrient" | "supplement";
  name: string;
  servingLabel?: string | null;
  sourceText?: string | null;
  sourceUrl?: string | null;
  supplementId?: string | null;
  unit?: string | null;
}>;

export type StageProductImportInput = Readonly<{
  actor?: string | null;
  brandName: string;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  duplicateProductIds?: readonly string[];
  fdaApprovalNumber?: string | null;
  imageUrls?: readonly string[];
  importRunId?: string | null;
  parsedFacts?: readonly ProductImportFactInput[];
  parseConfidence?: ProductConfidence;
  productTitle: string;
  rawSnapshot?: Record<string, unknown> | null;
  source?: string | null;
  sourceUrl: string;
  titleEn?: string | null;
  titleTh?: string | null;
}>;

export type StartProductImportRunInput = Readonly<{
  autoApprove?: boolean;
  brandName: string;
  source?: string | null;
  totalProducts?: number;
}>;

export type FinishProductImportRunInput = Readonly<{
  approvedCount?: number;
  failedCount?: number;
  importRunId: string;
  notes?: string | null;
  stagedCount?: number;
  status: "completed" | "failed";
}>;

export type ResolveProductImportReviewInput = Readonly<{
  action: "approve" | "duplicate" | "ignore";
  actor?: string | null;
  availableCountryCodes?: readonly string[];
  brandName?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  fdaApprovalNumber?: string | null;
  imageUrl?: string | null;
  manufacturerCountryCodes?: readonly string[];
  mergeProductId?: string | null;
  parsedFacts?: readonly ProductImportFactInput[];
  productAudience?: ProductAudience;
  productUrl?: string | null;
  reviewerNote?: string | null;
  returnRow?: boolean;
  taskId: string;
  title?: string | null;
  titleEn?: string | null;
  titleTh?: string | null;
}>;

export type UpsertProductOfferInput = Readonly<{
  actor?: string | null;
  availabilityStatus?: ProductAvailabilityStatus;
  commissionRate?: number | null;
  currency?: string | null;
  linkType?: "affiliate" | "direct";
  network?: string | null;
  platform?: string | null;
  priceAmount?: number | null;
  priority?: number | null;
  productId: string;
  status?: "active" | "flagged_stale" | "inactive";
  trackingId?: string | null;
  url: string;
}>;

export type RemoveProductOfferInput = Readonly<{
  actor?: string | null;
  offerId: string;
  productId: string;
}>;

function cleanNullableText(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function productTitleLooksEnglish(value: string) {
  const text = value.trim();

  if (!text) {
    return false;
  }

  if (/[\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/u.test(text)) {
    return false;
  }

  return /[A-Za-z]/.test(text);
}

export function preferredProductTitle(input: Readonly<{
  title: string;
  titleEn?: string | null;
}>) {
  const title = input.title.trim();
  const titleEn = cleanNullableText(input.titleEn, 500);

  if (titleEn && !productTitleLooksEnglish(title)) {
    return titleEn;
  }

  return title;
}

function normalizedUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";

    return url.toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

export async function startProductImportRun(input: StartProductImportRunInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const brandName = input.brandName.trim();

  if (!brandName) {
    throw new Error("Product import run requires a brand");
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_import_runs (
      brand_name,
      normalized_brand_name,
      source,
      requested_auto_approve,
      total_products,
      created_at,
      updated_at
    )
    values (
      ${brandName},
      ${normalizeProductKey(brandName)},
      ${cleanNullableText(input.source, 200) ?? "manufacturer_scrape"},
      ${Boolean(input.autoApprove)},
      ${Math.max(0, Math.round(input.totalProducts ?? 0))},
      now(),
      now()
    )
    returning id::text
  `;

  const id = rows[0]?.id;

  if (!id) {
    throw new Error("Product import run was not created");
  }

  return id;
}

export async function finishProductImportRun(input: FinishProductImportRunInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await sql`
    update public.product_import_runs
    set
      status = ${input.status},
      staged_count = ${Math.max(0, Math.round(input.stagedCount ?? 0))},
      approved_count = ${Math.max(0, Math.round(input.approvedCount ?? 0))},
      failed_count = ${Math.max(0, Math.round(input.failedCount ?? 0))},
      notes = ${cleanNullableText(input.notes, 2000)},
      completed_at = now(),
      updated_at = now()
    where id = ${input.importRunId}::uuid
  `;
}

export async function getProductImportRuns(input: Readonly<{
  limit?: number;
}> = {}) {
  const sql = getSql();

  if (!sql) {
    return [];
  }

  const limit = Math.min(100, Math.max(1, Math.round(input.limit ?? 50)));
  const rows = await sql<Array<{
    approved_count: string | number;
    brand_name: string;
    completed_at: Date | string | null;
    failed_count: string | number;
    id: string;
    notes: string | null;
    requested_auto_approve: boolean;
    source: string;
    staged_count: string | number;
    started_at: Date | string;
    status: ProductImportRunRow["status"];
    total_products: string | number;
  }>>`
    select
      id::text,
      brand_name,
      source,
      status,
      requested_auto_approve,
      total_products,
      staged_count,
      approved_count,
      failed_count,
      notes,
      started_at,
      completed_at
    from public.product_import_runs
    order by started_at desc
    limit ${limit}
  `;

  return rows.map((row): ProductImportRunRow => ({
    approvedCount: Math.max(0, Math.round(numberOrNull(row.approved_count) ?? 0)),
    brandName: row.brand_name,
    completedAt: isoOrNull(row.completed_at),
    failedCount: Math.max(0, Math.round(numberOrNull(row.failed_count) ?? 0)),
    id: row.id,
    notes: row.notes,
    requestedAutoApprove: row.requested_auto_approve,
    source: row.source,
    stagedCount: Math.max(0, Math.round(numberOrNull(row.staged_count) ?? 0)),
    startedAt: new Date(row.started_at).toISOString(),
    status: row.status,
    totalProducts: Math.max(0, Math.round(numberOrNull(row.total_products) ?? 0))
  }));
}

function isUuidValue(value: string | null | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function normalizedFactsForStorage(
  facts: readonly ProductImportFactInput[] | undefined
) {
  return (facts ?? [])
    .map((fact) => {
      const name = normalizeProductFactName(fact.name.trim()) || fact.name.trim();

      if (!name) {
        return null;
      }

      return {
        amount: numberOrNull(fact.amount),
        confidence: fact.confidence ?? "moderate",
        itemType: fact.itemType ?? "supplement",
        name,
        servingLabel: cleanNullableText(fact.servingLabel, 200),
        sourceText: cleanNullableText(fact.sourceText, 1000),
        sourceUrl: cleanNullableText(fact.sourceUrl, 2000),
        supplementId: isUuidValue(fact.supplementId) ? fact.supplementId : null,
        unit: cleanNullableText(fact.unit, 40)
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
}

async function replaceProductFacts(
  sql: NonNullable<ReturnType<typeof getSql>>,
  input: Readonly<{
    actor?: string | null;
    changeReason?: string | null;
    deleteSources?: readonly string[];
    facts: readonly ProductImportFactInput[];
    productId: string;
    source: string;
    supplementMatchesByFactName: ReadonlyMap<string, { id: string; name: string }>;
  }>
) {
  const explicitSupplementIds = [...new Set(input.facts.flatMap((fact) =>
    isUuidValue(fact.supplementId) ? [fact.supplementId] : []
  ))];
  let existingSupplementIds = new Set<string>();

  if (explicitSupplementIds.length > 0) {
    const existingSupplementRows = await sql<Array<{ id: string }>>`
        select id::text
        from public.supplements
        where id = any(${explicitSupplementIds}::uuid[])
      `;
    existingSupplementIds = new Set(existingSupplementRows.map((row) => row.id));
  }
  const facts = input.facts
    .map((fact) => {
      const factName = fact.name.trim();

      if (!factName) {
        return null;
      }
      const supplementMatch =
        input.supplementMatchesByFactName.get(normalizeProductFactKey(factName));
      const canonicalName = supplementMatch?.name ?? factName;
      const explicitSupplementId =
        isUuidValue(fact.supplementId) && existingSupplementIds.has(fact.supplementId)
          ? fact.supplementId
          : null;
      const supplementId = explicitSupplementId ?? supplementMatch?.id ?? null;

      if (!supplementId) {
        return null;
      }

      return {
        amount: numberOrNull(fact.amount),
        confidence: fact.confidence ?? "moderate",
        item_type: fact.itemType ?? "supplement",
        name: canonicalName,
        normalized_name: normalizeProductFactKey(canonicalName),
        serving_label: cleanNullableText(fact.servingLabel, 200),
        source: input.source,
        source_text: cleanNullableText(fact.sourceText, 1000),
        source_url: cleanNullableText(fact.sourceUrl, 2000),
        supplement_id: supplementId,
        unit: cleanNullableText(fact.unit, 40)
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
  const sourceFilter = input.deleteSources
    ? input.deleteSources.length > 0
      ? sql`and source = any(${input.deleteSources}::text[])`
      : sql``
    : sql`and false`;
  const beforeFactRows = await sql<Array<{ fact: unknown }>>`
    select jsonb_build_object(
      'id', product_facts.id::text,
      'itemType', product_facts.item_type,
      'supplementId', product_facts.supplement_id::text,
      'foodId', product_facts.food_id::text,
      'nutrientId', product_facts.nutrient_id::text,
      'name', product_facts.name,
      'normalizedName', product_facts.normalized_name,
      'amount', product_facts.amount,
      'unit', product_facts.unit,
      'servingLabel', product_facts.serving_label,
      'confidence', product_facts.confidence,
      'source', product_facts.source,
      'sourceUrl', product_facts.source_url,
      'sourceText', product_facts.source_text,
      'createdAt', product_facts.created_at,
      'updatedAt', product_facts.updated_at
    ) as fact
    from public.product_facts
    where product_id = ${input.productId}::uuid
    order by created_at asc, id asc
  `;

  await appendProductFactVersion(sql, {
    action: "facts_replaced",
    actor: input.actor,
    afterFacts: facts,
    beforeFacts: beforeFactRows.map((row) => row.fact),
    changeReason: input.changeReason?.trim() || "product_facts_replaced",
    productId: input.productId,
    source: input.source
  });

  await sql`
    with deleted as (
      delete from public.product_facts
      where product_id = ${input.productId}::uuid
        ${sourceFilter}
    ),
    input_facts as (
      select *
      from jsonb_to_recordset(${sql.json(toJsonValue(facts))}::jsonb) as fact(
        amount numeric,
        confidence text,
        item_type text,
        name text,
        normalized_name text,
        serving_label text,
        source text,
        source_text text,
        source_url text,
        supplement_id uuid,
        unit text
      )
    )
    insert into public.product_facts (
      product_id,
      item_type,
      supplement_id,
      name,
      normalized_name,
      amount,
      unit,
      serving_label,
      confidence,
      source,
      source_url,
      source_text,
      created_at,
      updated_at
    )
    select
      ${input.productId}::uuid,
      input_facts.item_type,
      input_facts.supplement_id,
      input_facts.name,
      input_facts.normalized_name,
      input_facts.amount,
      input_facts.unit,
      input_facts.serving_label,
      input_facts.confidence,
      input_facts.source,
      input_facts.source_url,
      input_facts.source_text,
      now(),
      now()
    from input_facts
  `;
}

async function recordProductVersion(
  sql: NonNullable<ReturnType<typeof getSql>>,
  input: Readonly<{
    actor?: string | null;
    changeNote: string;
    productId: string;
  }>
) {
  const rows = await sql<Array<{ version: number }>>`
    with next_product as (
      update public.products
      set
        current_version = coalesce(current_version, 0) + 1,
        updated_at = now()
      where id = ${input.productId}::uuid
      returning *
    ),
    inserted_version as (
      insert into public.product_versions (
        product_id,
        version,
        actor,
        change_note,
        title,
        title_en,
        title_th,
        brand_name,
        normalized_brand_name,
        image_url,
        product_url,
        normalized_url,
        description,
        description_en,
        description_th,
        fda_approval_number,
        product_kind,
        product_audience,
        status,
        label_status,
        availability_status,
        affiliate_status,
        price_amount,
        currency,
        validation_status,
        validation_reasons,
        validation_summary,
        validation_checked_at,
        facts_snapshot,
        source_snapshot,
        created_at
      )
      select
        next_product.id,
        next_product.current_version,
        ${input.actor ?? "admin_dashboard"},
        ${input.changeNote},
        next_product.title,
        next_product.title_en,
        next_product.title_th,
        next_product.brand_name,
        next_product.normalized_brand_name,
        next_product.image_url,
        next_product.product_url,
        next_product.normalized_url,
        next_product.description,
        next_product.description_en,
        next_product.description_th,
        next_product.fda_approval_number,
        next_product.product_kind,
        coalesce(to_jsonb(next_product) ->> 'product_audience', 'both'),
        next_product.status,
        next_product.label_status,
        next_product.availability_status,
        next_product.affiliate_status,
        next_product.price_amount,
        next_product.currency,
        next_product.validation_status,
        next_product.validation_reasons,
        next_product.validation_summary,
        next_product.validation_checked_at,
        coalesce(fact_rows.facts, '[]'::jsonb),
        next_product.source_snapshot,
        now()
      from next_product
      left join lateral (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', product_facts.id,
              'itemType', product_facts.item_type,
              'supplementId', product_facts.supplement_id,
              'foodId', product_facts.food_id,
              'nutrientId', product_facts.nutrient_id,
              'name', product_facts.name,
              'normalizedName', product_facts.normalized_name,
              'amount', product_facts.amount,
              'unit', product_facts.unit,
              'servingLabel', product_facts.serving_label,
              'confidence', product_facts.confidence,
              'source', product_facts.source,
              'sourceUrl', product_facts.source_url,
              'sourceText', product_facts.source_text
            )
            order by product_facts.created_at asc
          ),
          '[]'::jsonb
        ) as facts
        from public.product_facts
        where product_facts.product_id = next_product.id
      ) fact_rows on true
      returning version
    )
    select version
    from inserted_version
  `;
  const version = rows[0]?.version;

  if (!version) {
    throw new Error("Product version was not recorded");
  }

  return version;
}

function titleContainsNeed(title: string, need: ProductRecommendationNeed) {
  const normalizedTitle = normalizeProductFactKey(title);
  const needKeys = productFactAliasKeys(need.displayName, need.aliasKeys);
  const needTokens = [...new Set(
    needKeys
      .flatMap((key) => key.split("_"))
      .filter((token) => token.length > 1 && token !== "and")
  )];

  if (
    needKeys.some((key) =>
      normalizedTitle.includes(key) || productKeysMatch(title, key)
    )
  ) {
    return true;
  }

  return needTokens.length > 0 &&
    needTokens.every((token) => normalizedTitle.includes(token));
}

function titleDose(title: string) {
  const match = title.match(/(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g|iu)\b/i);

  if (!match) {
    return { amount: null, unit: null };
  }

  return {
    amount: Number(match[1]),
    unit:
      match[2]
        ?.toLowerCase()
        .replace("µg", "mcg")
        .replace("ug", "mcg") ?? null
  };
}

async function supplementIdsForNeeds(
  sql: NonNullable<ReturnType<typeof getSql>>,
  needs: readonly ProductRecommendationNeed[]
) {
  const normalizedNames = [...new Set(
    needs
      .flatMap((need) => productFactAliasKeys(need.displayName, need.aliasKeys))
      .filter(Boolean)
  )];

  if (normalizedNames.length < 1) {
    return new Map<string, string>();
  }

  const rows = await sql<Array<{
    id: string;
    normalized_alias: string;
  }>>`
    select supplements.id::text, supplement_aliases.normalized_alias
    from public.supplement_aliases
    join public.supplements
      on supplements.id = supplement_aliases.supplement_id
    where supplement_aliases.normalized_alias = any(${normalizedNames}::text[])
  `;

  return new Map(rows.map((row) => [row.normalized_alias, row.id]));
}

async function supplementIdsForFacts(
  sql: NonNullable<ReturnType<typeof getSql>>,
  facts: readonly ProductImportFactInput[]
) {
  const factAliases = facts.map((fact) => ({
    aliases: productFactAliasKeys(fact.name),
    key: normalizeProductFactKey(fact.name)
  }));
  const normalizedNames = [...new Set(factAliases.flatMap((fact) => fact.aliases))];

  if (normalizedNames.length < 1) {
    return new Map<string, { id: string; name: string }>();
  }

  const rows = await sql<Array<{
    id: string;
    name: string;
    normalized_alias: string;
  }>>`
    select supplements.id::text, supplements.name, supplement_aliases.normalized_alias
    from public.supplement_aliases
    join public.supplements
      on supplements.id = supplement_aliases.supplement_id
    where supplement_aliases.normalized_alias = any(${normalizedNames}::text[])
       or supplements.normalized_name = any(${normalizedNames}::text[])
  `;
  const byKey = new Map<string, { id: string; name: string }>();

  for (const fact of factAliases) {
    const match = rows.find((row) =>
      fact.aliases.some((alias) =>
        row.normalized_alias === alias || productKeysMatch(alias, row.normalized_alias)
      )
    );

    if (match) {
      byKey.set(fact.key, { id: match.id, name: match.name });
    }
  }

  return byKey;
}

export async function validateProductImportForApproval(input: Readonly<{
  facts: readonly ProductImportFactInput[];
  imageUrl?: string | null;
  labelStatus?: string | null;
  productUrl?: string | null;
  sourceUrl?: string | null;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const facts = normalizedFactsForStorage(input.facts);
  const supplementMatchesByFactName = await supplementIdsForFacts(sql, facts);
  const supplementIds = [...new Set(facts.flatMap((fact) => {
    const explicitSupplementId = isUuidValue(fact.supplementId)
      ? fact.supplementId
      : null;
    const matchedSupplementId =
      supplementMatchesByFactName.get(normalizeProductFactKey(fact.name))?.id ??
      null;

    return explicitSupplementId ?? matchedSupplementId
      ? [explicitSupplementId ?? matchedSupplementId!]
      : [];
  }))];
  const supplementRows = supplementIds.length > 0
    ? await sql<Array<{
      id: string;
      list_status: string | null;
      max_amount: string | number | null;
      max_unit: string | null;
    }>>`
      select
        supplements.id::text,
        supplements.list_status,
        supplement_safety_limits.max_amount,
        supplement_safety_limits.max_unit
      from public.supplements
      left join lateral (
        select max_amount, max_unit
        from public.supplement_safety_limits
        where supplement_safety_limits.supplement_id = supplements.id
        order by version desc
        limit 1
      ) supplement_safety_limits on true
      where supplements.id = any(${supplementIds}::uuid[])
    `
    : [];
  const supplementsById = new Map(supplementRows.map((row) => [row.id, row]));
  const validationFacts = facts.map((fact) => {
    const supplementMatch =
      supplementMatchesByFactName.get(normalizeProductFactKey(fact.name));
    const explicitSupplementId = isUuidValue(fact.supplementId)
      ? fact.supplementId
      : null;
    const supplementId = explicitSupplementId ?? supplementMatch?.id ?? null;
    const supplementRow = supplementId ? supplementsById.get(supplementId) : null;

    return {
      amount: fact.amount,
      confidence: fact.confidence,
      itemType: fact.itemType,
      maxAmount: supplementRow?.max_amount ?? null,
      maxUnit: supplementRow?.max_unit ?? null,
      name: supplementMatch?.name ?? fact.name,
      sourceText: fact.sourceText,
      supplementId,
      supplementStatus: supplementRow?.list_status ?? null,
      unit: fact.unit
    };
  });

  return validateProduct({
    facts: validationFacts,
    imageUrl: input.imageUrl,
    labelStatus: input.labelStatus,
    productUrl: input.productUrl,
    sourceUrl: input.sourceUrl
  });
}

function factsFromMarketplaceSnapshot(
  snapshot: ProductSnapshot,
  needs: readonly ProductRecommendationNeed[],
  supplementIds: ReadonlyMap<string, string>
) {
  const dose = titleDose(snapshot.title);

  return needs
    .filter((need) => need.itemType !== "food")
    .filter((need) => titleContainsNeed(snapshot.title, need))
    .map((need) => ({
      amount: dose.amount,
      confidence: dose.amount ? "moderate" as const : "low" as const,
      itemType: "supplement" as const,
      name: need.displayName,
      supplementId:
        productFactAliasKeys(need.displayName, need.aliasKeys)
          .map((alias) => supplementIds.get(alias))
          .find((id): id is string => Boolean(id)) ?? null,
      unit: dose.unit
    }));
}

export async function createAdminProduct(input: CreateAdminProductInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rawTitle = input.title.trim();
  const titleEn = cleanNullableText(input.titleEn, 500);
  const titleTh = cleanNullableText(input.titleTh, 500);
  const title = preferredProductTitle({ title: rawTitle, titleEn });
  const productUrl = input.productUrl.trim();
  const descriptionEn = cleanNullableText(input.descriptionEn, 4000);
  const descriptionTh = cleanNullableText(input.descriptionTh, 4000);
  const description = cleanNullableText(
    input.description ?? descriptionEn ?? descriptionTh,
    4000
  );
  const sourceSnapshot = {
    ...(input.sourceSnapshot ?? {}),
    ...(rawTitle !== title ? { originalProductTitle: rawTitle } : {}),
    ...(titleEn ? { titleEn } : {}),
    ...(titleTh ? { titleTh } : {}),
    ...(descriptionEn ? { descriptionEn } : {}),
    ...(descriptionTh ? { descriptionTh } : {})
  };

  if (!title || !productUrl) {
    throw new Error("Product title and URL are required");
  }

	  const facts = input.facts ?? [];
	  const supplementMatchesByFactName = await supplementIdsForFacts(sql, facts);
	  const brandName = cleanNullableText(input.brandName, 200);
	  const normalizedBrandName = brandName ? normalizeProductKey(brandName) : null;
	  const regionCountryCodes = normalizeProductCountryCodes(
	    [input.region],
	    [defaultProductCountryCode]
	  );
	  let brandRows: Array<{ id: string }> = [];

  if (normalizedBrandName && brandName) {
    brandRows = await sql<Array<{ id: string }>>`
        insert into public.product_brands (
          name,
          normalized_name,
          status,
          created_at,
          updated_at
        )
        values (
          ${brandName},
          ${normalizedBrandName},
          ${input.brandStatus ?? "pending_review"},
          now(),
          now()
        )
        on conflict (normalized_name) do update set
          status = case
            when public.product_brands.status = 'ignored' then public.product_brands.status
            when ${input.brandStatus ?? null} = 'approved' then 'approved'
            when public.product_brands.status = 'approved' then public.product_brands.status
            when ${input.brandStatus ?? null}::text is null then public.product_brands.status
            else ${input.brandStatus ?? null}
          end,
          updated_at = now()
        returning id::text
      `;
	  }
	  const brandId = brandRows[0]?.id ?? null;
	  const manufacturerCountryCodes = brandId
	    ? input.manufacturerCountryCodes !== undefined
	      ? await replaceBrandCountryCodes(sql, brandId, input.manufacturerCountryCodes)
	      : await ensureBrandCountryCodes(sql, brandId, regionCountryCodes)
	    : [];
	  const productCountryCodes = input.availableCountryCodes !== undefined
	    ? normalizeSubmittedProductCountryCodes(
	        input.availableCountryCodes,
	        "Product countries"
	      )
	    : normalizeProductCountryCodes(
	        [],
	        brandId ? manufacturerCountryCodes : regionCountryCodes
	      );

	  if (brandId) {
	    assertProductCountriesAllowedByBrand(
	      productCountryCodes,
	      manufacturerCountryCodes,
	      brandName
	    );
	  }
	  const productRows = await sql<Array<{ id: string }>>`
    insert into public.products (
      platform,
      region,
      external_product_id,
      title,
      normalized_title,
      brand_id,
      brand_name,
      normalized_brand_name,
      image_url,
      product_url,
      normalized_url,
      description,
      title_en,
      title_th,
      fda_approval_number,
      source_url,
      source_snapshot,
      product_kind,
      product_audience,
      status,
      label_status,
      availability_status,
      affiliate_status,
      price_amount,
      currency,
      source,
      created_at,
      updated_at
    )
    values (
      ${input.platform},
      ${input.region?.trim() || "TH"},
      ${cleanNullableText(input.externalProductId, 300)},
      ${title},
      ${normalizeProductKey(title)},
	      ${brandId}::uuid,
      ${brandName},
      ${normalizedBrandName},
      ${cleanNullableText(input.imageUrl)},
      ${productUrl},
      ${normalizedUrl(productUrl)},
      ${description},
      ${titleEn},
      ${titleTh},
      ${cleanNullableText(input.fdaApprovalNumber, 100)},
      ${cleanNullableText(input.sourceUrl) ?? productUrl},
      ${sql.json(toJsonValue(sourceSnapshot))}::jsonb,
      ${input.productKind ?? "supplement"},
      ${input.productAudience ?? productAudienceFromSnapshot(sourceSnapshot)},
      ${input.status ?? "pending_review"},
      ${input.labelStatus ?? (input.facts?.length ? "parsed" : "missing")},
      'unknown',
      'none',
      null,
      ${input.currency?.trim() || "THB"},
      ${input.source ?? "admin"},
      now(),
      now()
    )
    on conflict (normalized_url) do update set
      title = excluded.title,
      normalized_title = excluded.normalized_title,
      external_product_id = coalesce(excluded.external_product_id, products.external_product_id),
      brand_id = excluded.brand_id,
      brand_name = excluded.brand_name,
      normalized_brand_name = excluded.normalized_brand_name,
      image_url = coalesce(excluded.image_url, products.image_url),
      description = coalesce(excluded.description, products.description),
      title_en = coalesce(excluded.title_en, products.title_en),
      title_th = coalesce(excluded.title_th, products.title_th),
      fda_approval_number = coalesce(excluded.fda_approval_number, products.fda_approval_number),
      source_url = coalesce(excluded.source_url, products.source_url),
      source_snapshot = products.source_snapshot || excluded.source_snapshot,
      product_kind = excluded.product_kind,
      product_audience = excluded.product_audience,
      status = excluded.status,
      label_status = excluded.label_status,
      availability_status = 'unknown',
      affiliate_status = 'none',
      price_amount = null,
      currency = excluded.currency,
      updated_at = now()
    returning id::text
  `;
  const productId = productRows[0]?.id;

	  if (!productId) {
	    throw new Error("Product was not created");
	  }

	  await replaceProductCountryCodes(sql, productId, productCountryCodes);
	
	  if (descriptionEn || descriptionTh) {
    try {
      await sql`
        update public.products
        set
          description_en = coalesce(${descriptionEn}, description_en),
          description_th = coalesce(${descriptionTh}, description_th),
          updated_at = now()
        where id = ${productId}::uuid
      `;
    } catch (error) {
      const code = error && typeof error === "object"
        ? (error as { code?: string }).code
        : null;

      if (code !== "42703") {
        throw error;
      }
    }
  }

  if (input.replaceFacts || facts.length > 0) {
    await replaceProductFacts(sql, {
      ...(input.replaceFacts ? { deleteSources: ["marketplace_discovery", "admin"] } : {}),
      actor: input.actor,
      changeReason: "product_create_facts",
      facts,
      productId,
      source: input.source === "marketplace_discovery" ? "marketplace_discovery" : "admin",
      supplementMatchesByFactName
    });
  }

  if (input.affiliateUrl) {
    await sql`
      insert into public.product_offers (
        product_id,
        url,
        link_type,
        status,
        created_at,
        updated_at
      )
      values (
        ${productId}::uuid,
        ${input.affiliateUrl.trim()},
        'affiliate',
        'active',
        now(),
        now()
      )
    `;
  }

  const validation = await refreshAndPersistProductValidation(sql, productId);
  const version = await recordProductVersion(sql, {
    actor: input.actor,
    changeNote: "product_saved",
    productId
  });

  await sql`
    insert into public.product_admin_audit (
      product_id,
      actor,
      action,
      after_payload
    )
    values (
      ${productId}::uuid,
      ${input.actor ?? "admin_dashboard"},
      'product_created',
	      ${sql.json({
	        availableCountryCodes: productCountryCodes,
	        manufacturerCountryCodes,
	        platform: input.platform,
        productUrl,
        validation: validation.validation,
        title,
        version
      })}::jsonb
    )
  `;

  const row = await loadAdminProductRow(productId);

  if (!row) {
    throw new Error("Product not found after creation");
  }

  clearProductRecommendationCandidateCache();

  return row;
}

export async function deletePendingManufacturerImportProduct(productId: string) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!isUuidValue(productId)) {
    return false;
  }

  const rows = await sql<Array<{ id: string }>>`
    update public.products
    set
      status = 'ignored',
      availability_status = 'unavailable',
      admin_notes = concat_ws(
        E'\n',
        nullif(admin_notes, ''),
        'Ignored instead of deleting pending manufacturer import.'
      ),
      updated_at = now()
    where id = ${productId}::uuid
      and status = 'pending_review'
      and source = 'manufacturer_import'
    returning id::text
  `;

  if (rows[0]) {
    clearProductRecommendationCandidateCache();
  }

  return Boolean(rows[0]);
}

export async function importDiscoveredMarketplaceProducts(input: Readonly<{
  actor?: string | null;
  needs: readonly ProductRecommendationNeed[];
  products: readonly ProductSnapshot[];
}>) {
  const sql = getSql();

  if (!sql || input.products.length < 1) {
    return {
      imported: 0,
      withInferredFacts: 0
    };
  }

  const supplementIds = await supplementIdsForNeeds(sql, input.needs);
  let imported = 0;
  let withInferredFacts = 0;

  for (const snapshot of input.products) {
    const facts = factsFromMarketplaceSnapshot(snapshot, input.needs, supplementIds);

    try {
      await createAdminProduct({
        actor: input.actor ?? "product_matcher",
        availabilityStatus: snapshot.availabilityStatus,
        availableCountryCodes: [snapshot.region],
        brandName: snapshot.brandName,
        currency: snapshot.currency,
        facts,
        imageUrl: snapshot.imageUrl,
        labelStatus: facts.length > 0 ? "parsed" : "missing",
        manufacturerCountryCodes: [snapshot.region],
        status: "pending_review",
        externalProductId: snapshot.externalProductId,
        platform: snapshot.platform,
        priceAmount: snapshot.priceAmount ?? null,
        productUrl: snapshot.productUrl,
        region: snapshot.region,
        replaceFacts: facts.length > 0,
        source: "marketplace_discovery",
        title: snapshot.title
      });
      imported += 1;
      withInferredFacts += facts.length > 0 ? 1 : 0;
    } catch (error) {
      console.error("Unable to import discovered marketplace product", {
        error: error instanceof Error ? error.message : "Unknown product import error",
        productUrl: snapshot.productUrl,
        title: snapshot.title
      });
    }
  }

  return { imported, withInferredFacts };
}

export async function stageProductImport(input: StageProductImportInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const brandName = input.brandName.trim();
  const rawProductTitle = input.productTitle.trim();
  const sourceUrl = input.sourceUrl.trim();
  const titleEn = cleanNullableText(input.titleEn, 500);
  const titleTh = cleanNullableText(input.titleTh, 500);
  const productTitle = preferredProductTitle({
    title: rawProductTitle,
    titleEn
  });
  const descriptionEn = cleanNullableText(input.descriptionEn, 4000);
  const descriptionTh = cleanNullableText(input.descriptionTh, 4000);
  const description = cleanNullableText(
    input.description ?? descriptionEn ?? descriptionTh,
    4000
  );
  const normalizedBrandName = normalizeProductKey(brandName);
  const normalizedProductTitle = normalizeProductKey(productTitle);
  const parsedFacts = normalizedFactsForStorage(input.parsedFacts);
  const imageUrls = [...new Set((input.imageUrls ?? [])
    .map((url) => url.trim())
    .filter(Boolean))].slice(0, 12);

  if (!brandName || !productTitle || !sourceUrl) {
    throw new Error("Product import requires brand, product title, and source URL");
  }

  const duplicateRows = await sql<Array<{ id: string }>>`
    select id::text
    from public.products
    where normalized_url = ${normalizedUrl(sourceUrl)}
      or (
        normalized_title = ${normalizedProductTitle}
        and coalesce(normalized_brand_name, '') = ${normalizedBrandName}
      )
    order by updated_at desc
    limit 8
  `;
  const duplicateProductIds = [
    ...new Set([
      ...duplicateRows.map((row) => row.id),
      ...(input.duplicateProductIds ?? []).filter(isUuidValue)
    ])
  ];
  const importRows = await sql<Array<{ id: string }>>`
    insert into public.product_imports (
      import_run_id,
      brand_name,
      normalized_brand_name,
      product_title,
      normalized_product_title,
      source_url,
      source,
      image_urls,
      fda_approval_number,
      parsed_facts,
      raw_snapshot,
      duplicate_product_ids,
      parse_confidence,
      status,
      created_at,
      updated_at
    )
    values (
      ${isUuidValue(input.importRunId) ? input.importRunId : null}::uuid,
      ${brandName},
      ${normalizedBrandName},
      ${productTitle},
      ${normalizedProductTitle},
      ${sourceUrl},
      ${cleanNullableText(input.source, 200) ?? "manufacturer_scrape"},
      ${imageUrls}::text[],
      ${cleanNullableText(input.fdaApprovalNumber, 100)},
      ${sql.json(toJsonValue(parsedFacts))}::jsonb,
      ${sql.json(toJsonValue({
        ...(input.rawSnapshot ?? {}),
        ...(rawProductTitle !== productTitle ? { originalProductTitle: rawProductTitle } : {}),
        ...(titleEn ? { titleEn } : {}),
        ...(titleTh ? { titleTh } : {}),
        ...(description ? { description } : {}),
        ...(descriptionEn ? { descriptionEn } : {}),
        ...(descriptionTh ? { descriptionTh } : {})
      }))}::jsonb,
      ${duplicateProductIds}::uuid[],
      ${input.parseConfidence ?? "moderate"},
      'pending_review',
      now(),
      now()
    )
    on conflict (normalized_brand_name, normalized_product_title, source_url)
    do update set
      import_run_id = coalesce(excluded.import_run_id, public.product_imports.import_run_id),
      image_urls = excluded.image_urls,
      fda_approval_number = coalesce(excluded.fda_approval_number, public.product_imports.fda_approval_number),
      parsed_facts = excluded.parsed_facts,
      raw_snapshot = public.product_imports.raw_snapshot || excluded.raw_snapshot,
      duplicate_product_ids = excluded.duplicate_product_ids,
      parse_confidence = excluded.parse_confidence,
      status = case
        when public.product_imports.status in ('approved', 'ignored', 'duplicate')
          then public.product_imports.status
        else 'pending_review'
      end,
      updated_at = now()
    returning id::text
  `;
  const importId = importRows[0]?.id;

  if (!importId) {
    throw new Error("Product import was not staged");
  }

  let draftProductId = duplicateProductIds[0] ?? null;

  if (!draftProductId) {
    const draftProduct = await createAdminProduct({
      actor: input.actor ?? "manufacturer_scraper",
      availabilityStatus: "unknown",
      availableCountryCodes: [defaultProductCountryCode],
      brandStatus: "pending_review",
      brandName,
      description,
      descriptionEn,
      descriptionTh,
      facts: parsedFacts,
      fdaApprovalNumber: cleanNullableText(input.fdaApprovalNumber, 100),
      imageUrl: imageUrls[0] ?? null,
      labelStatus: parsedFacts.length > 0 ? "parsed" : "missing",
      manufacturerCountryCodes: [defaultProductCountryCode],
      status: "pending_review",
      platform: "manual",
      productAudience: productAudienceFromSnapshot(input.rawSnapshot),
      productKind: parsedFacts.length >= 6 ? "multi" : "supplement",
      productUrl: sourceUrl,
      region: "TH",
      replaceFacts: true,
      source: "manufacturer_import",
      sourceSnapshot: {
        ...(input.rawSnapshot ?? {}),
        ...(rawProductTitle !== productTitle ? { originalProductTitle: rawProductTitle } : {}),
        ...(titleEn ? { titleEn } : {}),
        ...(titleTh ? { titleTh } : {}),
        ...(description ? { description } : {}),
        ...(descriptionEn ? { descriptionEn } : {}),
        ...(descriptionTh ? { descriptionTh } : {}),
        productImportId: importId
      },
      sourceUrl,
      title: productTitle,
      titleEn,
      titleTh
    });
    draftProductId = draftProduct.id;
  }

  if (description || descriptionEn || descriptionTh || titleEn || titleTh) {
    try {
      await sql`
        update public.product_imports
        set
          description = ${description},
          description_en = coalesce(${descriptionEn}, description_en),
          description_th = coalesce(${descriptionTh}, description_th),
          title_en = coalesce(${titleEn}, title_en),
          title_th = coalesce(${titleTh}, title_th),
          updated_at = now()
        where id = ${importId}::uuid
      `;
    } catch (error) {
      const code = error && typeof error === "object"
        ? (error as { code?: string }).code
        : null;

      if (code !== "42703") {
        throw error;
      }
    }
  }

  const { task } = await createTask({
    actorType: "human",
    businessValue: input.parseConfidence === "low" ? 420 : 300,
    context: {
      source: "manufacturer_product_import",
      taskType: "review_product_import"
    },
    groupLabel: "Review Product",
    idempotencyKey: `review-product-import:${importId}`,
    idempotencyScope: "active",
    idempotencyScopeKey: `review-product-import:${importId}`,
    initialComment: {
      authorName: input.actor ?? "Manufacturer scraper",
      authorType: "deterministic",
      body: `${productTitle} was imported from a manufacturer source and needs human review before it can be recommended.`,
      commentType: "instruction",
      metadata: {
        duplicateProductIds,
        ...(rawProductTitle !== productTitle ? { originalProductTitle: rawProductTitle } : {}),
        importId,
        parseConfidence: input.parseConfidence ?? "moderate",
        sourceUrl
      },
      visibility: "admin"
    },
    maxAttempts: 1,
    payload: {
      actionOptions: [
        "approve_product",
        "edit_then_approve",
        "mark_duplicate",
        "ignore_import"
      ],
      brandName,
      duplicateProductIds,
      fdaApprovalNumber: cleanNullableText(input.fdaApprovalNumber, 100),
      description,
      descriptionEn,
      descriptionTh,
      imageUrls,
      itemType: "product",
      parsedFacts,
      productImportId: importId,
      productName: productTitle,
      ...(rawProductTitle !== productTitle ? { originalProductTitle: rawProductTitle } : {}),
      productTitleEn: titleEn,
      productTitleTh: titleTh,
      reviewKind: "product_import",
      sourceUrl
    },
    reasoningEffort: "none",
    requiredCapabilities: [
      AGENT_CAPABILITIES.humanReview,
      AGENT_CAPABILITIES.productReview,
      AGENT_CAPABILITIES.safetyReview
    ],
    retryPolicy: false,
    taskType: "review_product_import",
    title: `Review Product ${productTitle}`
  });

  await sql`
    update public.product_imports
    set
      product_id = coalesce(product_id, ${isUuidValue(draftProductId) ? draftProductId : null}::uuid),
      review_task_id = ${task.id}::uuid,
      updated_at = now()
    where id = ${importId}::uuid
  `;

  await sql`
    insert into public.product_admin_audit (
      action,
      actor,
      after_payload
    )
    values (
      'product_import_staged',
      ${input.actor ?? "manufacturer_scraper"},
      ${sql.json(toJsonValue({
        brandName,
        importId,
        importRunId: input.importRunId ?? null,
        ...(rawProductTitle !== productTitle ? { originalProductTitle: rawProductTitle } : {}),
        productTitle,
        productId: draftProductId,
        reviewTaskId: task.id,
        sourceUrl
      }))}::jsonb
    )
  `;

  return {
    importId,
    importRunId: input.importRunId ?? null,
    productId: draftProductId,
    reviewTaskId: task.id
  };
}

async function completeProductImportTask(
  sql: NonNullable<ReturnType<typeof getSql>>,
  input: Readonly<{
    action: string;
    actor?: string | null;
    importId: string;
    taskId: string;
    payload?: Record<string, unknown>;
  }>
) {
  const payload = toJsonValue({
    action: input.action,
    importId: input.importId,
    ...(input.payload ?? {})
  });

  await sql`
    update public.tasks
    set
      status = 'completed',
      completed_at = now(),
      lease_until = null,
      reserved_by_agent_id = null,
      result_payload = coalesce(result_payload, '{}'::jsonb) || ${sql.json(payload)}::jsonb,
      updated_at = now()
    where id = ${input.taskId}::uuid
      and task_type = 'review_product_import'
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
  `;

  await sql`
    insert into public.task_comments (
      id,
      task_id,
      author_type,
      author_name,
      visibility,
      comment_type,
      body,
      metadata,
      created_at
    )
    values (
      gen_random_uuid(),
      ${input.taskId}::uuid,
      'human',
      ${input.actor ?? "admin_dashboard"},
      'admin',
      'decision',
      ${`Product import review completed: ${input.action}.`},
      ${sql.json(payload)},
      now()
    )
  `;

  await sql`
    insert into public.task_events (
      id,
      task_id,
      event_type,
      event_status,
      severity,
      event_payload,
      occurred_at,
      created_at
    )
    values (
      gen_random_uuid(),
      ${input.taskId}::uuid,
      'product_import_review_completed',
      'succeeded',
      'medium',
      ${sql.json(payload)},
      now(),
      now()
    )
  `;
}

export async function resolveProductImportReview(
  input: ResolveProductImportReviewInput
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const importRows = await sql<Array<{
    brand_name: string;
    description: string | null;
    description_en: string | null;
    description_th: string | null;
    duplicate_product_ids: string[];
    fda_approval_number: string | null;
    id: string;
    image_urls: string[];
    parsed_facts: ProductImportFactInput[];
    product_id: string | null;
    product_title: string;
    title_en: string | null;
    title_th: string | null;
    raw_snapshot: Record<string, unknown>;
    source_url: string;
  }>>`
    select
      id::text,
      brand_name,
      coalesce(to_jsonb(product_imports) ->> 'description', raw_snapshot ->> 'description') as description,
      coalesce(to_jsonb(product_imports) ->> 'description_en', raw_snapshot ->> 'descriptionEn') as description_en,
      coalesce(to_jsonb(product_imports) ->> 'description_th', raw_snapshot ->> 'descriptionTh') as description_th,
      product_title,
      coalesce(to_jsonb(product_imports) ->> 'title_en', raw_snapshot ->> 'titleEn') as title_en,
      coalesce(to_jsonb(product_imports) ->> 'title_th', raw_snapshot ->> 'titleTh') as title_th,
      source_url,
      image_urls,
      fda_approval_number,
      parsed_facts,
      product_id::text,
      raw_snapshot,
      duplicate_product_ids::text[]
    from public.product_imports
    where review_task_id = ${input.taskId}::uuid
      and status = 'pending_review'
    limit 1
  `;
  const productImport = importRows[0];

  if (!productImport) {
    throw new Error("Product import review task not found");
  }

  const nowStatus = input.action === "ignore"
      ? "ignored"
      : input.action === "duplicate"
        ? "duplicate"
        : "approved";
  const draftProductId = productImport.product_id;
  let productId = input.mergeProductId ?? draftProductId ?? null;
  const reviewFacts = input.parsedFacts
    ? normalizedFactsForStorage(input.parsedFacts)
    : productImport.parsed_facts;
  const reviewDescription =
    input.description === undefined
      ? productImport.description
      : cleanNullableText(input.description, 4000);
  const reviewDescriptionEn =
    input.descriptionEn === undefined
      ? productImport.description_en
      : cleanNullableText(input.descriptionEn, 4000);
  const reviewDescriptionTh =
    input.descriptionTh === undefined
      ? productImport.description_th
      : cleanNullableText(input.descriptionTh, 4000);
  const reviewBrandName = cleanNullableText(input.brandName, 200) ??
    productImport.brand_name;
  const reviewTitle = cleanNullableText(input.title, 500) ??
    productImport.product_title;
  const reviewTitleEn = input.titleEn === undefined
    ? productImport.title_en
    : cleanNullableText(input.titleEn, 500);
  const reviewTitleTh = input.titleTh === undefined
    ? productImport.title_th
    : cleanNullableText(input.titleTh, 500);
  const reviewFdaApprovalNumber = input.fdaApprovalNumber === undefined
    ? productImport.fda_approval_number
    : cleanNullableText(input.fdaApprovalNumber, 100);
  const reviewImageUrl = cleanNullableText(input.imageUrl) ??
    productImport.image_urls[0] ??
    null;
  const reviewProductUrl = cleanNullableText(input.productUrl) ??
    productImport.source_url;

  if (input.action === "approve") {
    const row = await createAdminProduct({
      actor: input.actor ?? "admin_dashboard",
      availabilityStatus: "in_stock",
      availableCountryCodes: input.availableCountryCodes,
      brandStatus: "approved",
      brandName: reviewBrandName,
      description: reviewDescription,
      descriptionEn: reviewDescriptionEn,
      descriptionTh: reviewDescriptionTh,
      facts: reviewFacts,
      fdaApprovalNumber: reviewFdaApprovalNumber,
      imageUrl: reviewImageUrl,
      labelStatus: reviewFacts.length > 0 ? "parsed" : "missing",
      manufacturerCountryCodes: input.manufacturerCountryCodes,
      status: "approved",
      platform: "manual",
      productAudience: input.productAudience ?? productAudienceFromSnapshot(productImport.raw_snapshot),
      productKind: reviewFacts.length >= 6 ? "multi" : "supplement",
      productUrl: reviewProductUrl,
      region: "TH",
      replaceFacts: true,
      source: "manufacturer_import",
      sourceSnapshot: {
        ...productImport.raw_snapshot,
        ...(reviewDescription ? { description: reviewDescription } : {}),
        ...(reviewDescriptionEn ? { descriptionEn: reviewDescriptionEn } : {}),
        ...(reviewDescriptionTh ? { descriptionTh: reviewDescriptionTh } : {})
      },
      sourceUrl: productImport.source_url,
      title: reviewTitle,
      titleEn: reviewTitleEn,
      titleTh: reviewTitleTh
    });
    productId = row.id;

    if (input.action === "approve" && row.validation.status !== "pass") {
      throw new Error(`Product still needs review: ${row.validation.summary}`);
    }
  }

  if (input.action === "duplicate") {
    if (!isUuidValue(productId)) {
      throw new Error("Mark duplicate requires an existing product");
    }

    const existing = await sql<Array<{ id: string }>>`
      select id::text
      from public.products
      where id = ${productId}::uuid
      limit 1
    `;

    if (!existing[0]) {
      throw new Error("Duplicate product was not found");
    }
  }

  if (
    (input.action === "ignore" || input.action === "duplicate") &&
    isUuidValue(draftProductId) &&
    (input.action === "ignore" || draftProductId !== productId)
  ) {
    await sql`
      update public.products
      set
        status = 'ignored',
        updated_at = now()
      where id = ${draftProductId}::uuid
        and status in ('pending_review', 'ignored')
        and (
          (source_snapshot ->> 'productImportId') = ${productImport.id}
          or (
            status = 'pending_review'
            and (source_snapshot ->> 'productImportId') is null
          )
        )
    `;
  }

  await sql`
    update public.product_imports
    set
      status = ${nowStatus},
      parsed_facts = ${sql.json(toJsonValue(reviewFacts))}::jsonb,
      product_id = ${isUuidValue(productId) ? productId : null}::uuid,
      reviewer_note = ${cleanNullableText(input.reviewerNote, 2000)},
      reviewed_by = ${input.actor ?? "admin_dashboard"},
      reviewed_at = now(),
      updated_at = now()
    where id = ${productImport.id}::uuid
  `;

  await completeProductImportTask(sql, {
    action: input.action,
    actor: input.actor,
    importId: productImport.id,
    payload: {
      productId,
      reviewerNote: input.reviewerNote ?? null
    },
    taskId: input.taskId
  });

  await sql`
    insert into public.product_admin_audit (
      product_id,
      action,
      actor,
      after_payload
    )
    values (
      ${isUuidValue(productId) ? productId : null}::uuid,
      'product_import_reviewed',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({
        action: input.action,
        importId: productImport.id,
        productId,
        reviewerNote: input.reviewerNote ?? null
      }))}::jsonb
    )
  `;

  const row = input.returnRow === false || !productId
    ? null
    : await loadAdminProductRow(productId);

  clearProductRecommendationCandidateCache();

  return {
    productId,
    removedTaskIds: [input.taskId],
    row
  };
}

export async function upsertProductOffer(
  input: UpsertProductOfferInput
) {
  const sql = getSql();
  const productId = isUuidValue(input.productId) ? input.productId : null;
  const url = input.url.trim();

  if (!sql || !productId) {
    throw new Error("Product link requires a valid product");
  }

  if (!url) {
    throw new Error("Product link URL is required");
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_offers (
      product_id,
      network,
      url,
      link_type,
      platform,
      commission_rate,
      admin_priority,
      price_amount,
      currency,
      availability_status,
      tracking_id,
      status,
      created_at,
      updated_at
    )
    values (
      ${productId}::uuid,
      ${cleanNullableText(input.network, 100)},
      ${url},
      ${input.linkType ?? "affiliate"},
      ${cleanNullableText(input.platform, 100)},
      ${input.commissionRate ?? null},
      ${Math.round(input.priority ?? 0)},
      ${input.priceAmount ?? null},
      ${cleanNullableText(input.currency, 20) ?? "THB"},
      ${input.availabilityStatus ?? "unknown"},
      ${cleanNullableText(input.trackingId, 500)},
      ${input.status ?? "active"},
      now(),
      now()
    )
    on conflict (product_id, url)
    do update set
      network = excluded.network,
      link_type = excluded.link_type,
      platform = excluded.platform,
      commission_rate = excluded.commission_rate,
      admin_priority = excluded.admin_priority,
      price_amount = excluded.price_amount,
      currency = excluded.currency,
      availability_status = excluded.availability_status,
      tracking_id = excluded.tracking_id,
      status = excluded.status,
      updated_at = now()
    returning id::text
  `;
  const offerId = rows[0]?.id;

  await sql`
    insert into public.product_admin_audit (
      product_id,
      action,
      actor,
      after_payload
    )
    values (
      ${productId}::uuid,
      'product_offer_upserted',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({
        commissionRate: input.commissionRate ?? null,
        offerId,
        linkType: input.linkType ?? "affiliate",
        platform: input.platform ?? null,
        priority: input.priority ?? 0,
        url
      }))}::jsonb
    )
  `;

  clearProductRecommendationCandidateCache();

  return loadAdminProductRow(productId);
}

export async function removeProductOffer(
  input: RemoveProductOfferInput
) {
  const sql = getSql();
  const productId = isUuidValue(input.productId) ? input.productId : null;
  const offerId = isUuidValue(input.offerId) ? input.offerId : null;

  if (!sql || !productId || !offerId) {
    throw new Error("Product link removal requires valid ids");
  }

  await sql`
    update public.product_offers
    set
      status = 'inactive',
      updated_at = now()
    where id = ${offerId}::uuid
      and product_id = ${productId}::uuid
  `;

  await sql`
    insert into public.product_admin_audit (
      product_id,
      action,
      actor,
      after_payload
    )
    values (
      ${productId}::uuid,
      'product_offer_removed',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({ offerId }))}::jsonb
    )
  `;

  clearProductRecommendationCandidateCache();

	  return loadAdminProductRow(productId);
	}
	
export async function updateProductBrandCountries(input: Readonly<{
  actor?: string | null;
  brandId: string;
  countryCodes: readonly string[];
}>) {
  const sql = getSql();
  const brandId = isUuidValue(input.brandId) ? input.brandId : null;

  if (!sql || !brandId) {
    throw new Error("Manufacturer country update requires a valid brand id");
  }

  const beforeRows = await sql<Array<{
    before_payload: unknown;
    name: string;
  }>>`
    select to_jsonb(product_brands.*) as before_payload, name
    from public.product_brands
    where id = ${brandId}::uuid
    limit 1
  `;

  if (!beforeRows[0]) {
    throw new Error("Manufacturer not found");
  }

  const countryCodes = await replaceBrandCountryCodes(
    sql,
    brandId,
    input.countryCodes
  );

  await sql`
    update public.product_brands
    set
      country_code = ${countryCodes[0] ?? defaultProductCountryCode},
      updated_at = now()
    where id = ${brandId}::uuid
  `;

  await reconcileProductsForBrandCountryCodes(sql, brandId, countryCodes);

  await sql`
    insert into public.product_admin_audit (
      brand_id,
      action,
      actor,
      before_payload,
      after_payload
    )
    values (
      ${brandId}::uuid,
      'product_brand_countries_updated',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue(beforeRows[0].before_payload ?? {}))}::jsonb,
      ${sql.json(toJsonValue({ countryCodes }))}::jsonb
    )
  `;

  clearProductRecommendationCandidateCache();

  const productRows = await loadAdminProductRowsForBrand(brandId);

  return {
    brandId,
    countryCodes,
    name: beforeRows[0].name,
    productRows
  };
}

export async function updateAdminProduct(input: UpdateAdminProductInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const beforeRows = await sql<Array<{
    before_payload: unknown;
    brand_id: string | null;
    brand_name: string | null;
    region: string;
  }>>`
    select
      to_jsonb(products.*) as before_payload,
      products.brand_id::text,
      products.brand_name,
      products.region
    from public.products
    where id = ${input.id}::uuid
    limit 1
  `;

  if (!beforeRows[0]) {
    throw new Error("Product not found");
  }
  const title = input.title === undefined ? undefined : cleanNullableText(input.title, 500);
  const titleEn = input.titleEn === undefined ? undefined : cleanNullableText(input.titleEn, 500);
  const titleTh = input.titleTh === undefined ? undefined : cleanNullableText(input.titleTh, 500);
  const brandName = input.brandName === undefined
    ? undefined
    : cleanNullableText(input.brandName, 200);
  const normalizedBrandName = brandName === undefined
    ? undefined
    : brandName
      ? normalizeProductKey(brandName)
      : null;
  const imageUrl = input.imageUrl === undefined
    ? undefined
    : cleanNullableText(input.imageUrl, 2000);
  const productUrl = input.productUrl === undefined
    ? undefined
    : cleanNullableText(input.productUrl, 2000);

  if (input.title !== undefined && !title) {
    throw new Error("Product title is required");
  }

  if (input.productUrl !== undefined && !productUrl) {
    throw new Error("Product URL is required");
  }

  const descriptionEn = cleanNullableText(input.descriptionEn, 4000);
  const descriptionTh = cleanNullableText(input.descriptionTh, 4000);
  const localizedSnapshot = {
    ...(input.sourceSnapshotPatch ?? {}),
    ...(input.titleEn !== undefined ? { titleEn } : {}),
    ...(input.titleTh !== undefined ? { titleTh } : {}),
    ...(input.descriptionEn !== undefined ? { descriptionEn } : {}),
    ...(input.descriptionTh !== undefined ? { descriptionTh } : {})
  };
  let brandRows: Array<{ id: string }> = [];

  if (normalizedBrandName && brandName) {
    brandRows = await sql<Array<{ id: string }>>`
        insert into public.product_brands (
          name,
          normalized_name,
          status,
          created_at,
          updated_at
        )
        values (
          ${brandName},
          ${normalizedBrandName},
          'pending_review',
          now(),
          now()
        )
        on conflict (normalized_name) do update set
          name = excluded.name,
          updated_at = now()
        returning id::text
      `;
  }
	  const brandId = normalizedBrandName === undefined
	    ? undefined
	    : normalizedBrandName
	      ? brandRows[0]?.id ?? null
	      : null;
	  const effectiveBrandId = brandId === undefined ? beforeRows[0].brand_id : brandId;
	  const effectiveBrandName = brandName === undefined
	    ? beforeRows[0].brand_name
	    : brandName;
	  const existingProductCountryCodes = await loadProductCountryCodes(
	    sql,
	    input.id,
	    [beforeRows[0].region]
	  );
	  const existingManufacturerCountryCodes = effectiveBrandId
	    ? await loadBrandCountryCodes(
	        sql,
	        effectiveBrandId,
	        existingProductCountryCodes
	      )
	    : [];
	  let manufacturerCountryCodes: ProductCountryCode[] = [];

	  if (effectiveBrandId) {
	    manufacturerCountryCodes = input.manufacturerCountryCodes !== undefined
	      ? await replaceBrandCountryCodes(
	          sql,
	          effectiveBrandId,
	          input.manufacturerCountryCodes
	        )
	      : await ensureBrandCountryCodes(
	          sql,
	          effectiveBrandId,
	          existingProductCountryCodes
	        );
	  }
	  const manufacturerCountriesChanged = Boolean(
	    effectiveBrandId &&
	    input.manufacturerCountryCodes !== undefined &&
	    !sameProductCountryCodes(
	      existingManufacturerCountryCodes,
	      manufacturerCountryCodes
	    )
	  );
	  const requestedProductCountryCodes = input.availableCountryCodes !== undefined
	    ? normalizeSubmittedProductCountryCodes(
	        input.availableCountryCodes,
	        "Product countries"
	      )
	    : existingProductCountryCodes;
	  const productCountryCodes = manufacturerCountriesChanged
	    ? manufacturerCountryCodes
	    : requestedProductCountryCodes;

	  if (effectiveBrandId) {
	    assertProductCountriesAllowedByBrand(
	      productCountryCodes,
	      manufacturerCountryCodes,
	      effectiveBrandName
	    );
	  }
	  const titleParam = title ?? null;
  const titleEnParam = titleEn ?? null;
  const titleThParam = titleTh ?? null;
  const brandNameParam = brandName ?? null;
  const normalizedBrandNameParam = normalizedBrandName ?? null;
  const brandIdParam = brandId ?? null;
  const imageUrlParam = imageUrl ?? null;
  const productUrlParam = productUrl ?? null;
  const normalizedProductUrlParam = productUrl ? normalizedUrl(productUrl) : null;

  const rows = await sql`
    update public.products set
      title = case
        when ${input.title === undefined} then title
        else ${titleParam}
      end,
      normalized_title = case
        when ${input.title === undefined} then normalized_title
        else ${normalizeProductKey(titleParam ?? "")}
      end,
      title_en = case
        when ${input.titleEn === undefined} then title_en
        else ${titleEnParam}
      end,
      title_th = case
        when ${input.titleTh === undefined} then title_th
        else ${titleThParam}
      end,
      brand_id = case
        when ${input.brandName === undefined} then brand_id
        else ${brandIdParam}::uuid
      end,
      brand_name = case
        when ${input.brandName === undefined} then brand_name
        else ${brandNameParam}
      end,
      normalized_brand_name = case
        when ${input.brandName === undefined} then normalized_brand_name
        else ${normalizedBrandNameParam}
      end,
      image_url = case
        when ${input.imageUrl === undefined} then image_url
        else ${imageUrlParam}
      end,
      product_url = case
        when ${input.productUrl === undefined} then product_url
        else ${productUrlParam}
      end,
      normalized_url = case
        when ${input.productUrl === undefined} then normalized_url
        else ${normalizedProductUrlParam}
      end,
      status = coalesce(${input.status ?? null}, status),
      label_status = coalesce(${input.labelStatus ?? null}, label_status),
      description = case
        when ${input.description === undefined} then description
        else ${cleanNullableText(input.description, 4000)}
      end,
      source_snapshot = source_snapshot || ${sql.json(toJsonValue(localizedSnapshot))}::jsonb,
      fda_approval_number = case
        when ${input.fdaApprovalNumber === undefined} then fda_approval_number
        else ${input.fdaApprovalNumber ?? null}
      end,
      product_kind = coalesce(${input.productKind ?? null}, product_kind),
      product_audience = coalesce(${input.productAudience ?? null}, product_audience),
      admin_notes = coalesce(${input.adminNotes ?? null}, admin_notes),
      updated_at = now()
    where id = ${input.id}::uuid
    returning id::text
  `;

	  if (input.facts !== undefined) {
	    const facts = normalizedFactsForStorage(input.facts);
	    const supplementMatchesByFactName = await supplementIdsForFacts(sql, facts);

    await replaceProductFacts(sql, {
      actor: input.actor,
      changeReason: input.changeNote?.trim() || "product_admin_save_facts",
      deleteSources: [],
      facts,
      productId: input.id,
      source: input.factsSource?.trim() || "admin",
	      supplementMatchesByFactName
	    });
	  }

	  if (input.availableCountryCodes !== undefined) {
	    await replaceProductCountryCodes(sql, input.id, productCountryCodes);
	  }

	  if (manufacturerCountriesChanged && effectiveBrandId) {
	    await reconcileProductsForBrandCountryCodes(
	      sql,
	      effectiveBrandId,
	      manufacturerCountryCodes
	    );
	  }
		
	  if (input.descriptionEn !== undefined || input.descriptionTh !== undefined) {
    try {
      await sql`
        update public.products
        set
          description_en = case
            when ${input.descriptionEn === undefined} then description_en
            else ${descriptionEn}
          end,
          description_th = case
            when ${input.descriptionTh === undefined} then description_th
            else ${descriptionTh}
          end,
          updated_at = now()
        where id = ${input.id}::uuid
      `;
    } catch (error) {
      const code = error && typeof error === "object"
        ? (error as { code?: string }).code
        : null;

      if (code !== "42703") {
        throw error;
      }
    }
  }

  const validation = await refreshAndPersistProductValidation(sql, input.id);

  if (input.status === "approved" && validation.validation.status !== "pass") {
    throw new Error(
      `Product validation blocks approval: ${validation.validation.summary}`
    );
  }

  const version = await recordProductVersion(sql, {
    actor: input.actor,
    changeNote: input.changeNote?.trim() || "product_admin_save",
    productId: input.id
  });

  await sql`
    insert into public.product_admin_audit (
      product_id,
      actor,
      action,
      before_payload,
      after_payload
    )
    values (
      ${input.id}::uuid,
      ${input.actor ?? "admin_dashboard"},
      'product_updated',
      ${sql.json(toJsonValue(beforeRows[0].before_payload ?? {}))}::jsonb,
	      ${sql.json({
	        availableCountryCodes: input.availableCountryCodes === undefined
	          ? undefined
	          : productCountryCodes,
	        brandName: input.brandName,
	        changeNote: input.changeNote,
        description: input.description,
        descriptionEn: input.descriptionEn,
        descriptionTh: input.descriptionTh,
        facts: input.facts,
	        factsSource: input.factsSource,
	        fdaApprovalNumber: input.fdaApprovalNumber,
	        imageUrl: input.imageUrl,
	        labelStatus: input.labelStatus,
	        manufacturerCountryCodes: input.manufacturerCountryCodes === undefined
	          ? undefined
	          : manufacturerCountryCodes,
	        manufacturerCountriesChanged,
	        status: input.status,
        validation: validation.validation,
        productAudience: input.productAudience,
        productKind: input.productKind,
        productUrl: input.productUrl,
        sourceSnapshotPatch: toJsonValue(input.sourceSnapshotPatch ?? null),
        title: input.title,
        titleEn: input.titleEn,
        titleTh: input.titleTh,
        version
      })}::jsonb
    )
  `;

  if (!rows[0]) {
    throw new Error("Product not found");
  }

  const row = await loadAdminProductRow(input.id);

  if (!row) {
    throw new Error("Product not found after update");
  }

  clearProductRecommendationCandidateCache();

  return row;
}
