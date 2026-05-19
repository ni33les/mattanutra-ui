import { getSql } from "@/lib/db";
import type { MarketplaceProductSnapshot } from "@/lib/marketplace-adapters";
import { toJsonValue } from "@/lib/assessment-store";
import {
  comparableDoseAmount,
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
  type ProductListStatus,
  type ProductRecommendationNeed,
  type ProductPlatform
} from "@/lib/product-recommendations";
import {
  validateProductQuality,
  type ProductQualityResult
} from "@/lib/product-quality";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { createTask } from "@/lib/task-service";

export type ProductAffiliateStatus = "active" | "flagged_stale" | "none";
export type ProductLabelStatus = "failed" | "missing" | "parsed" | "stale";

export type AdminProductFact = ProductCandidateFact & Readonly<{
  id: string;
  maxAmount: number | null;
  maxUnit: string | null;
  source: string | null;
  sourceText: string | null;
  sourceUrl: string | null;
  supplementStatus: ProductListStatus | null;
}>;

export type AdminProductAffiliateLink = Readonly<{
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
  affiliateLinks: AdminProductAffiliateLink[];
  affiliateStatus: ProductAffiliateStatus;
  aiCorrectionNotes: string | null;
  availabilityStatus: ProductAvailabilityStatus;
  brandName: string | null;
  brandStatus: ProductListStatus | null;
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
  listStatus: ProductListStatus;
  productQuality: ProductQualityResult;
  productQualityLabel: string;
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
  region: string;
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
    blacklisted: number;
    dirtyData: number;
    missingFacts: number;
    missingImage: number;
    reviewRequired: number;
    total: number;
    unknown: number;
    whitelisted: number;
  };
}>;

type ProductDbRow = Readonly<{
  active_affiliate_link_id: string | null;
  active_affiliate_commission_rate: string | number | null;
  active_affiliate_priority: string | number | null;
  active_affiliate_type: "affiliate" | "direct" | null;
  active_affiliate_url: string | null;
  affiliate_links: unknown;
  affiliate_status: ProductAffiliateStatus;
  availability_status: ProductAvailabilityStatus;
  brand_name: string | null;
  brand_status: ProductListStatus | null;
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
  list_status: ProductListStatus;
  platform: ProductPlatform;
  price_amount: string | number | null;
  product_audience: ProductAudience | null;
  product_kind: ProductKind;
  product_data_expires_at: Date | string | null;
  product_url: string;
  quality_checked_at: Date | string | null;
  quality_reasons: string[] | null;
  quality_status: ProductQualityResult["status"] | null;
  quality_summary: string | null;
  region: string;
  source_snapshot: unknown;
  source_url: string | null;
  title: string;
  title_en: string | null;
  title_th: string | null;
  updated_at: Date | string;
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
  supplementStatus?: ProductListStatus | null;
  unit?: string | null;
}>;

const productStatuses = new Set<ProductListStatus>([
  "blacklisted",
  "inactive",
  "review_required",
  "unknown",
  "whitelisted"
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

export function isProductListStatus(value: string): value is ProductListStatus {
  return productStatuses.has(value as ProductListStatus);
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
      blacklisted: 0,
      dirtyData: 0,
      missingFacts: 0,
      missingImage: 0,
      reviewRequired: 0,
      total: 0,
      unknown: 0,
      whitelisted: 0
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
    servingLabel: fact.servingLabel ?? null,
    source: typeof fact.source === "string" ? fact.source : null,
    sourceText: typeof fact.sourceText === "string" ? fact.sourceText : null,
    sourceUrl: typeof fact.sourceUrl === "string" ? fact.sourceUrl : null,
    supplementId: fact.supplementId ?? null,
    supplementStatus: fact.supplementStatus ?? null,
    unit
  };
}

function productSafetyPasses(facts: readonly AdminProductFact[], rawFacts: unknown) {
  const payloads = arrayPayload(rawFacts) as FactDbPayload[];

  for (const [index, fact] of facts.entries()) {
    const payload = payloads[index];

    if (payload?.supplementStatus === "blacklisted") {
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

function productAudienceFromSnapshot(value: unknown) {
  const snapshot = recordFromUnknown(value);
  const correction = recordFromUnknown(snapshot.aiFactCorrection);

  return productAudienceFromUnknown(correction.productAudience) ?? "both";
}

function aiCorrectionNotesFromSnapshot(value: unknown) {
  const snapshot = recordFromUnknown(value);
  const correction = recordFromUnknown(snapshot.aiFactCorrection);
  const notes = correction.notes;

  return typeof notes === "string" && notes.trim() ? notes.trim() : null;
}

function productQualityLabel(quality: ProductQualityResult) {
  if (quality.reasons.includes("missing_image")) {
    return "Missing Image";
  }

  if (
    quality.reasons.includes("no_dosed_facts") ||
    quality.reasons.includes("no_canonical_match")
  ) {
    return "Missing Facts";
  }

  if (
    quality.reasons.includes("dirty_name") ||
    quality.reasons.includes("concentration_only") ||
    quality.reasons.includes("source_conflict")
  ) {
    return "Dirty Data";
  }

  if (quality.status === "pass") {
    return "Approved";
  }

  return "Needs Review";
}

function productQualityForRow(
  row: Pick<ProductDbRow, "image_url" | "label_status" | "product_url" | "source_url">,
  facts: readonly AdminProductFact[],
  rawFacts: unknown
) {
  const payloads = arrayPayload(rawFacts) as FactDbPayload[];
  const qualityFacts = facts.map((fact, index) => {
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

  return validateProductQuality({
    facts: qualityFacts,
    imageUrl: row.image_url,
    labelStatus: row.label_status,
    productUrl: row.product_url,
    sourceUrl: row.source_url
  });
}

function rowFromDb(row: ProductDbRow): AdminProductRow {
  const facts = (arrayPayload(row.facts) as FactDbPayload[]).map(normalizeFact);
  const productQuality = productQualityForRow(row, facts, row.facts);
  const effectiveListStatus =
    row.list_status === "whitelisted" && productQuality.status !== "pass"
      ? "review_required"
      : row.list_status;
  const affiliateLinks = arrayPayload(row.affiliate_links).map((item) => {
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
    } satisfies AdminProductAffiliateLink;
  });

  return {
    affiliateLinks,
    affiliateStatus: row.affiliate_status,
    aiCorrectionNotes: aiCorrectionNotesFromSnapshot(row.source_snapshot),
    availabilityStatus: row.availability_status,
    brandName: row.brand_name,
    brandStatus: row.brand_status,
    category: row.category,
    currency: row.currency || "THB",
    description: row.description,
    descriptionEn: row.description_en,
    descriptionTh: row.description_th,
    facts,
    fdaApprovalNumber: row.fda_approval_number,
    id: row.id,
    imageUrl: row.image_url,
    labelStatus: row.label_status,
    listStatus: effectiveListStatus,
    productQuality,
    productQualityLabel: productQualityLabel(productQuality),
    productAudience: row.product_audience ?? "both",
    importReviewTaskId: row.import_review_task_id,
    importStatus: row.import_status,
    platform: row.platform,
    priceAmount: numberOrNull(row.price_amount),
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
    title: row.title,
    titleEn: row.title_en,
    titleTh: row.title_th,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

async function refreshAndPersistProductQuality(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string
) {
  const rows = await loadProductRows(productId);
  const sourceRow = rows?.[0];

  if (!sourceRow) {
    throw new Error("Product not found for quality check");
  }

  const row = rowFromDb(sourceRow);
  const quality = row.productQuality;
  const safeListStatus =
    row.listStatus === "whitelisted" && quality.status !== "pass"
      ? "review_required"
      : row.listStatus;
  const safeLabelStatus =
    quality.status === "pass" && row.facts.length > 0
      ? "parsed"
      : quality.reasons.includes("no_dosed_facts")
      ? row.facts.length > 0
        ? "failed"
        : "missing"
      : row.labelStatus;
  const qualityPayload = toJsonValue(quality);

  await sql`
    update public.marketplace_products
    set
      list_status = ${safeListStatus},
      label_status = ${safeLabelStatus},
      source_snapshot = source_snapshot || jsonb_build_object(
        'productQuality',
        ${sql.json(qualityPayload)}::jsonb
      ),
      updated_at = now()
    where id = ${productId}::uuid
  `;

  try {
    await sql`
      update public.marketplace_products
      set
        quality_status = ${quality.status},
        quality_reasons = ${quality.reasons}::text[],
        quality_summary = ${quality.summary},
        quality_checked_at = ${quality.checkedAt}::timestamptz,
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
    listStatus: safeListStatus,
    productQuality: quality
  };
}

export async function runProductQualityCheck(input: Readonly<{
  actor?: string | null;
  productId: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const quality = await refreshAndPersistProductQuality(sql, input.productId);

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
      'product_quality_checked',
      ${sql.json(toJsonValue(quality.productQuality))}::jsonb
    )
  `;

  const rows = await loadProductRows(input.productId);
  const row = rows?.[0] ? rowFromDb(rows[0]) : null;

  if (!row) {
    throw new Error("Product not found after quality check");
  }

  return row;
}

function summaryFromRows(rows: AdminProductRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.listStatus === "blacklisted") {
        summary.blacklisted += 1;
      } else if (row.listStatus === "review_required") {
        summary.reviewRequired += 1;
      } else if (row.listStatus === "unknown") {
        summary.unknown += 1;
      } else if (row.listStatus === "whitelisted") {
        summary.whitelisted += 1;
      }

      if (row.affiliateStatus === "active") {
        summary.activeAffiliate += 1;
      }

      if (row.facts.length < 1 || row.labelStatus !== "parsed") {
        summary.missingFacts += 1;
      }

      if (row.productQualityLabel === "Missing Image") {
        summary.missingImage += 1;
      }

      if (row.productQualityLabel === "Dirty Data") {
        summary.dirtyData += 1;
      }

      return summary;
    },
    {
      activeAffiliate: 0,
      blacklisted: 0,
      dirtyData: 0,
      missingFacts: 0,
      missingImage: 0,
      reviewRequired: 0,
      total: 0,
      unknown: 0,
      whitelisted: 0
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
      marketplace_products.id::text,
      marketplace_products.platform,
      marketplace_products.region,
      marketplace_products.title,
      marketplace_products.title_en,
      marketplace_products.title_th,
      marketplace_products.brand_name,
      marketplace_products.image_url,
      marketplace_products.product_url,
      marketplace_products.source_url,
      marketplace_products.source_snapshot,
      marketplace_products.description,
      coalesce(to_jsonb(marketplace_products) ->> 'description_en', marketplace_products.source_snapshot ->> 'descriptionEn') as description_en,
      coalesce(to_jsonb(marketplace_products) ->> 'description_th', marketplace_products.source_snapshot ->> 'descriptionTh') as description_th,
      marketplace_products.category,
      marketplace_products.fda_approval_number,
      coalesce(to_jsonb(marketplace_products) ->> 'product_audience', 'both') as product_audience,
      marketplace_products.product_kind,
      marketplace_products.list_status,
      marketplace_products.label_status,
      marketplace_products.availability_status,
      marketplace_products.affiliate_status,
      marketplace_products.price_amount,
      marketplace_products.currency,
      marketplace_products.current_version,
      marketplace_products.product_data_expires_at,
      coalesce(to_jsonb(marketplace_products) ->> 'quality_status', marketplace_products.source_snapshot #>> '{productQuality,status}') as quality_status,
      coalesce(to_jsonb(marketplace_products) ->> 'quality_summary', marketplace_products.source_snapshot #>> '{productQuality,summary}') as quality_summary,
      coalesce(to_jsonb(marketplace_products) -> 'quality_reasons', marketplace_products.source_snapshot #> '{productQuality,reasons}', '[]'::jsonb) as quality_reasons,
      coalesce(
        to_jsonb(marketplace_products) ->> 'quality_checked_at',
        marketplace_products.source_snapshot #>> '{productQuality,checkedAt}'
      ) as quality_checked_at,
      marketplace_products.updated_at,
      import_review.id::text as import_id,
      import_review.status as import_status,
      import_review.review_task_id::text as import_review_task_id,
      import_review.duplicate_product_ids::text[] as import_duplicate_product_ids,
      product_brands.list_status as brand_status,
      active_affiliate.id::text as active_affiliate_link_id,
      active_affiliate.url as active_affiliate_url,
      active_affiliate.link_type as active_affiliate_type,
      active_affiliate.commission_rate as active_affiliate_commission_rate,
      active_affiliate.admin_priority as active_affiliate_priority,
      coalesce(fact_rows.facts, '[]'::jsonb) as facts,
      coalesce(affiliate_rows.affiliate_links, '[]'::jsonb) as affiliate_links,
      coalesce(history.chosen_count, 0) as history_chosen_count,
      history.last_recommended_at as history_last_recommended_at,
      history.average_product_coverage_percent,
      history.average_stack_coverage_percent
    from public.marketplace_products
    left join public.product_brands
      on product_brands.id = marketplace_products.brand_id
    left join lateral (
      select
        product_imports.id,
        product_imports.status,
        product_imports.review_task_id,
        product_imports.duplicate_product_ids
      from public.product_imports
      where product_imports.product_id = marketplace_products.id
        and product_imports.status = 'needs_review'
      order by product_imports.updated_at desc
      limit 1
    ) import_review on true
    left join lateral (
      select id, url, link_type, commission_rate, admin_priority
      from public.product_affiliate_links
      where product_affiliate_links.product_id = marketplace_products.id
        and product_affiliate_links.status = 'active'
        and product_affiliate_links.availability_status <> 'unavailable'
      order by
        case when product_affiliate_links.link_type = 'affiliate' then 0 else 1 end,
        product_affiliate_links.commission_rate desc nulls last,
        product_affiliate_links.admin_priority desc,
        product_affiliate_links.updated_at desc
      limit 1
    ) active_affiliate on true
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
            'supplementStatus', supplements.list_status,
            'maxAmount', supplement_safety_limits.max_amount,
            'maxUnit', supplement_safety_limits.max_unit
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
        select max_amount, max_unit
        from public.supplement_safety_limits
        where supplement_safety_limits.supplement_id = product_facts.supplement_id
        order by version desc
        limit 1
      ) supplement_safety_limits on true
      where product_facts.product_id = marketplace_products.id
    ) fact_rows on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', product_affiliate_links.id,
            'availabilityStatus', product_affiliate_links.availability_status,
            'commissionRate', product_affiliate_links.commission_rate,
            'currency', product_affiliate_links.currency,
            'linkType', product_affiliate_links.link_type,
            'network', product_affiliate_links.network,
            'platform', product_affiliate_links.platform,
            'priceAmount', product_affiliate_links.price_amount,
            'priority', product_affiliate_links.admin_priority,
            'status', product_affiliate_links.status,
            'url', product_affiliate_links.url
          )
          order by
            case when product_affiliate_links.status = 'active' then 0 else 1 end,
            case when product_affiliate_links.link_type = 'affiliate' then 0 else 1 end,
            product_affiliate_links.commission_rate desc nulls last,
            product_affiliate_links.admin_priority desc,
            product_affiliate_links.updated_at desc
        ),
        '[]'::jsonb
      ) as affiliate_links
      from public.product_affiliate_links
      where product_affiliate_links.product_id = marketplace_products.id
    ) affiliate_rows on true
    left join lateral (
      select
        count(*)::int as chosen_count,
        max(product_recommendation_items.created_at) as last_recommended_at,
        avg(product_recommendation_items.product_coverage_percent) as average_product_coverage_percent,
        avg(product_recommendation_runs.stack_coverage_percent) as average_stack_coverage_percent
      from public.product_recommendation_items
      join public.product_recommendation_runs
        on product_recommendation_runs.id = product_recommendation_items.run_id
      where product_recommendation_items.product_id = marketplace_products.id
    ) history on true
    where (${productId ?? null}::uuid is null or marketplace_products.id = ${productId ?? null}::uuid)
    order by marketplace_products.updated_at desc, marketplace_products.title asc
  `;
}

async function loadAdminProductRow(productId: string) {
  const rows = await loadProductRows(productId);

  return rows?.[0] ? rowFromDb(rows[0]) : null;
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
    console.error("Unable to load marketplace products", error);
    return emptyAdminProductsData();
  }
}

export async function getProductRecommendationCandidates() {
  const rows = await loadProductRows();

  if (!rows) {
    return [];
  }

  return rows.map((row) => {
    const adminRow = rowFromDb(row);
    const activeAffiliateUrl =
      typeof row.active_affiliate_url === "string" ? row.active_affiliate_url : null;
    const productDataExpiresAt = isoOrNull(row.product_data_expires_at);

    return {
      activeAffiliateLinkId: row.active_affiliate_link_id,
      activeAffiliateCommissionRate: numberOrNull(row.active_affiliate_commission_rate),
      activeAffiliatePriority: numberOrNull(row.active_affiliate_priority),
      activeAffiliateType: row.active_affiliate_type,
      activeAffiliateUrl,
      affiliateStatus: adminRow.affiliateStatus,
      automatedSafetyPassed: productSafetyPasses(adminRow.facts, row.facts),
      availabilityStatus: adminRow.availabilityStatus,
      brandName: adminRow.brandName,
      brandStatus: adminRow.brandStatus,
      currency: adminRow.currency,
      facts: adminRow.facts,
      id: adminRow.id,
      imageUrl: adminRow.imageUrl,
      labelStatus: adminRow.labelStatus,
      listStatus: adminRow.listStatus,
      platform: adminRow.platform,
      productAudience: adminRow.productAudience,
      productKind: adminRow.productKind,
      productQuality: adminRow.productQuality,
      priceAmount: adminRow.priceAmount,
      productDataExpiresAt,
      productUrl: adminRow.productUrl,
      region: adminRow.region,
      title: adminRow.title
    } satisfies ProductCandidate;
  });
}

export type UpdateAdminProductInput = Readonly<{
  actor?: string | null;
  adminNotes?: string | null;
  affiliateStatus?: ProductAffiliateStatus;
  availabilityStatus?: ProductAvailabilityStatus;
  brandName?: string | null;
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
  listStatus?: ProductListStatus;
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
  brandListStatus?: ProductListStatus;
  brandName?: string | null;
  currency?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  facts?: readonly ProductImportFactInput[];
  imageUrl?: string | null;
  fdaApprovalNumber?: string | null;
  labelStatus?: ProductLabelStatus;
  listStatus?: ProductListStatus;
  marketplaceProductId?: string | null;
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
  parsedFacts?: readonly ProductImportFactInput[];
  parseConfidence?: ProductConfidence;
  productTitle: string;
  rawSnapshot?: Record<string, unknown> | null;
  source?: string | null;
  sourceUrl: string;
  titleEn?: string | null;
  titleTh?: string | null;
}>;

export type ResolveProductImportReviewInput = Readonly<{
  action: "approve" | "blacklist" | "ignore" | "merge" | "needs_more_data";
  actor?: string | null;
  brandName?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  fdaApprovalNumber?: string | null;
  imageUrl?: string | null;
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

export type UpsertProductAffiliateLinkInput = Readonly<{
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

export type RemoveProductAffiliateLinkInput = Readonly<{
  actor?: string | null;
  linkId: string;
  productId: string;
}>;

function cleanNullableText(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
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
        supplement_id:
          explicitSupplementId ??
          supplementMatch?.id ??
          null,
        unit: cleanNullableText(fact.unit, 40)
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
  const sourceFilter = input.deleteSources
    ? input.deleteSources.length > 0
      ? sql`and source = any(${input.deleteSources}::text[])`
      : sql``
    : sql`and false`;

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
      update public.marketplace_products
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
        list_status,
        label_status,
        availability_status,
        affiliate_status,
        price_amount,
        currency,
        quality_status,
        quality_reasons,
        quality_summary,
        quality_checked_at,
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
        next_product.list_status,
        next_product.label_status,
        next_product.availability_status,
        next_product.affiliate_status,
        next_product.price_amount,
        next_product.currency,
        coalesce(to_jsonb(next_product) ->> 'quality_status', next_product.source_snapshot #>> '{productQuality,status}', 'needs_review'),
        coalesce(
          array(
            select jsonb_array_elements_text(
              coalesce(to_jsonb(next_product) -> 'quality_reasons', next_product.source_snapshot #> '{productQuality,reasons}', '[]'::jsonb)
            )
          ),
          '{}'::text[]
        ),
        coalesce(to_jsonb(next_product) ->> 'quality_summary', next_product.source_snapshot #>> '{productQuality,summary}'),
        nullif(
          coalesce(to_jsonb(next_product) ->> 'quality_checked_at', next_product.source_snapshot #>> '{productQuality,checkedAt}'),
          ''
        )::timestamptz,
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

function factsFromMarketplaceSnapshot(
  snapshot: MarketplaceProductSnapshot,
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

  const title = input.title.trim();
  const productUrl = input.productUrl.trim();
  const descriptionEn = cleanNullableText(input.descriptionEn, 4000);
  const descriptionTh = cleanNullableText(input.descriptionTh, 4000);
  const description = cleanNullableText(
    input.description ?? descriptionEn ?? descriptionTh,
    4000
  );
  const sourceSnapshot = {
    ...(input.sourceSnapshot ?? {}),
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
  let brandRows: Array<{ id: string }> = [];

  if (normalizedBrandName && brandName) {
    brandRows = await sql<Array<{ id: string }>>`
        insert into public.product_brands (
          name,
          normalized_name,
          list_status,
          created_at,
          updated_at
        )
        values (
          ${brandName},
          ${normalizedBrandName},
          ${input.brandListStatus ?? "unknown"},
          now(),
          now()
        )
        on conflict (normalized_name) do update set
          list_status = case
            when public.product_brands.list_status = 'blacklisted' then public.product_brands.list_status
            when ${input.brandListStatus ?? null}::text is null then public.product_brands.list_status
            else ${input.brandListStatus ?? null}
          end,
          updated_at = now()
        returning id::text
      `;
  }
  const productRows = await sql<Array<{ id: string }>>`
    insert into public.marketplace_products (
      platform,
      region,
      marketplace_product_id,
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
      list_status,
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
      ${cleanNullableText(input.marketplaceProductId, 300)},
      ${title},
      ${normalizeProductKey(title)},
      ${brandRows[0]?.id ?? null}::uuid,
      ${brandName},
      ${normalizedBrandName},
      ${cleanNullableText(input.imageUrl)},
      ${productUrl},
      ${normalizedUrl(productUrl)},
      ${description},
      ${cleanNullableText(input.titleEn, 500)},
      ${cleanNullableText(input.titleTh, 500)},
      ${cleanNullableText(input.fdaApprovalNumber, 100)},
      ${cleanNullableText(input.sourceUrl) ?? productUrl},
      ${sql.json(toJsonValue(sourceSnapshot))}::jsonb,
      ${input.productKind ?? "supplement"},
      ${input.productAudience ?? productAudienceFromSnapshot(sourceSnapshot)},
      ${input.listStatus ?? "unknown"},
      ${input.labelStatus ?? (input.facts?.length ? "parsed" : "missing")},
      ${input.availabilityStatus ?? "unknown"},
      ${input.affiliateUrl ? "active" : "none"},
      ${input.priceAmount ?? null},
      ${input.currency?.trim() || "THB"},
      ${input.source ?? "admin"},
      now(),
      now()
    )
    on conflict (normalized_url) do update set
      title = excluded.title,
      normalized_title = excluded.normalized_title,
      marketplace_product_id = coalesce(excluded.marketplace_product_id, marketplace_products.marketplace_product_id),
      brand_id = excluded.brand_id,
      brand_name = excluded.brand_name,
      normalized_brand_name = excluded.normalized_brand_name,
      image_url = coalesce(excluded.image_url, marketplace_products.image_url),
      description = coalesce(excluded.description, marketplace_products.description),
      title_en = coalesce(excluded.title_en, marketplace_products.title_en),
      title_th = coalesce(excluded.title_th, marketplace_products.title_th),
      fda_approval_number = coalesce(excluded.fda_approval_number, marketplace_products.fda_approval_number),
      source_url = coalesce(excluded.source_url, marketplace_products.source_url),
      source_snapshot = marketplace_products.source_snapshot || excluded.source_snapshot,
      product_kind = excluded.product_kind,
      product_audience = excluded.product_audience,
      list_status = excluded.list_status,
      label_status = excluded.label_status,
      availability_status = excluded.availability_status,
      affiliate_status = excluded.affiliate_status,
      price_amount = excluded.price_amount,
      currency = excluded.currency,
      updated_at = now()
    returning id::text
  `;
  const productId = productRows[0]?.id;

  if (!productId) {
    throw new Error("Product was not created");
  }

  if (descriptionEn || descriptionTh) {
    try {
      await sql`
        update public.marketplace_products
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
      facts,
      productId,
      source: input.source === "marketplace_discovery" ? "marketplace_discovery" : "admin",
      supplementMatchesByFactName
    });
  }

  if (input.affiliateUrl) {
    await sql`
      insert into public.product_affiliate_links (
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

  const productQuality = await refreshAndPersistProductQuality(sql, productId);
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
        platform: input.platform,
        productUrl,
        productQuality: productQuality.productQuality,
        title,
        version
      })}::jsonb
    )
  `;

  const row = await loadAdminProductRow(productId);

  if (!row) {
    throw new Error("Product not found after creation");
  }

  return row;
}

export async function importDiscoveredMarketplaceProducts(input: Readonly<{
  actor?: string | null;
  needs: readonly ProductRecommendationNeed[];
  products: readonly MarketplaceProductSnapshot[];
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
        brandName: snapshot.brandName,
        currency: snapshot.currency,
        facts,
        imageUrl: snapshot.imageUrl,
        labelStatus: facts.length > 0 ? "parsed" : "missing",
        listStatus: "unknown",
        marketplaceProductId: snapshot.marketplaceProductId,
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
  const productTitle = input.productTitle.trim();
  const sourceUrl = input.sourceUrl.trim();
  const titleEn = cleanNullableText(input.titleEn, 500);
  const titleTh = cleanNullableText(input.titleTh, 500);
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
    from public.marketplace_products
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
        ...(titleEn ? { titleEn } : {}),
        ...(titleTh ? { titleTh } : {}),
        ...(description ? { description } : {}),
        ...(descriptionEn ? { descriptionEn } : {}),
        ...(descriptionTh ? { descriptionTh } : {})
      }))}::jsonb,
      ${duplicateProductIds}::uuid[],
      ${input.parseConfidence ?? "moderate"},
      'needs_review',
      now(),
      now()
    )
    on conflict (normalized_brand_name, normalized_product_title, source_url)
    do update set
      image_urls = excluded.image_urls,
      fda_approval_number = coalesce(excluded.fda_approval_number, public.product_imports.fda_approval_number),
      parsed_facts = excluded.parsed_facts,
      raw_snapshot = public.product_imports.raw_snapshot || excluded.raw_snapshot,
      duplicate_product_ids = excluded.duplicate_product_ids,
      parse_confidence = excluded.parse_confidence,
      status = case
        when public.product_imports.status in ('approved', 'blacklisted', 'ignored', 'merged')
          then public.product_imports.status
        else 'needs_review'
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
      brandListStatus: "unknown",
      brandName,
      description,
      descriptionEn,
      descriptionTh,
      facts: parsedFacts,
      fdaApprovalNumber: cleanNullableText(input.fdaApprovalNumber, 100),
      imageUrl: imageUrls[0] ?? null,
      labelStatus: parsedFacts.length > 0 ? "parsed" : "missing",
      listStatus: "unknown",
      platform: "manual",
      productAudience: productAudienceFromSnapshot(input.rawSnapshot),
      productKind: parsedFacts.length >= 6 ? "multi" : "supplement",
      productUrl: sourceUrl,
      region: "TH",
      replaceFacts: true,
      source: "manufacturer_import",
      sourceSnapshot: {
        ...(input.rawSnapshot ?? {}),
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
        "request_more_data",
        "blacklist_product",
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
    title: `Review product import ${productTitle}`
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
        productTitle,
        productId: draftProductId,
        reviewTaskId: task.id,
        sourceUrl
      }))}::jsonb
    )
  `;

  return {
    importId,
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
      and status = 'needs_review'
    limit 1
  `;
  const productImport = importRows[0];

  if (!productImport) {
    throw new Error("Product import review task not found");
  }

  const nowStatus = input.action === "blacklist"
    ? "blacklisted"
    : input.action === "ignore"
      ? "ignored"
      : input.action === "merge"
        ? "merged"
        : input.action === "needs_more_data"
          ? "needs_more_data"
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

  if (input.action === "approve" || input.action === "blacklist") {
    const row = await createAdminProduct({
      actor: input.actor ?? "admin_dashboard",
      availabilityStatus: "in_stock",
      brandListStatus: input.action === "approve" ? "whitelisted" : "unknown",
      brandName: reviewBrandName,
      description: reviewDescription,
      descriptionEn: reviewDescriptionEn,
      descriptionTh: reviewDescriptionTh,
      facts: reviewFacts,
      fdaApprovalNumber: reviewFdaApprovalNumber,
      imageUrl: reviewImageUrl,
      labelStatus: reviewFacts.length > 0 ? "parsed" : "missing",
      listStatus: input.action === "approve" ? "whitelisted" : "blacklisted",
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

    if (input.action === "approve" && row.productQuality.status !== "pass") {
      throw new Error(`Product still needs review: ${row.productQuality.summary}`);
    }
  }

  if (input.action === "merge") {
    if (!isUuidValue(productId)) {
      throw new Error("Mark duplicate requires an existing product");
    }

    const existing = await sql<Array<{ id: string }>>`
      select id::text
      from public.marketplace_products
      where id = ${productId}::uuid
      limit 1
    `;

    if (!existing[0]) {
      throw new Error("Duplicate product was not found");
    }
  }

  if (
    (input.action === "ignore" || input.action === "merge") &&
    isUuidValue(draftProductId) &&
    (input.action === "ignore" || draftProductId !== productId)
  ) {
    await sql`
      update public.marketplace_products
      set
        list_status = 'inactive',
        availability_status = 'unavailable',
        updated_at = now()
      where id = ${draftProductId}::uuid
        and list_status in ('unknown', 'review_required', 'inactive')
        and (
          (source_snapshot ->> 'productImportId') = ${productImport.id}
          or (
            list_status = 'unknown'
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

  return {
    productId,
    removedTaskIds: [input.taskId],
    row
  };
}

export async function upsertProductAffiliateLink(
  input: UpsertProductAffiliateLinkInput
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
    insert into public.product_affiliate_links (
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
  const linkId = rows[0]?.id;

  await sql`
    update public.marketplace_products
    set
      affiliate_status = case
        when exists (
          select 1
          from public.product_affiliate_links
          where product_id = ${productId}::uuid
            and status = 'active'
            and link_type = 'affiliate'
        ) then 'active'
        else affiliate_status
      end,
      updated_at = now()
    where id = ${productId}::uuid
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
      'product_affiliate_link_upserted',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({
        commissionRate: input.commissionRate ?? null,
        linkId,
        linkType: input.linkType ?? "affiliate",
        platform: input.platform ?? null,
        priority: input.priority ?? 0,
        url
      }))}::jsonb
    )
  `;

  return loadAdminProductRow(productId);
}

export async function removeProductAffiliateLink(
  input: RemoveProductAffiliateLinkInput
) {
  const sql = getSql();
  const productId = isUuidValue(input.productId) ? input.productId : null;
  const linkId = isUuidValue(input.linkId) ? input.linkId : null;

  if (!sql || !productId || !linkId) {
    throw new Error("Product link removal requires valid ids");
  }

  await sql`
    update public.product_affiliate_links
    set
      status = 'inactive',
      updated_at = now()
    where id = ${linkId}::uuid
      and product_id = ${productId}::uuid
  `;

  await sql`
    update public.marketplace_products
    set
      affiliate_status = case
        when exists (
          select 1
          from public.product_affiliate_links
          where product_id = ${productId}::uuid
            and status = 'active'
            and link_type = 'affiliate'
        ) then 'active'
        else 'none'
      end,
      updated_at = now()
    where id = ${productId}::uuid
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
      'product_affiliate_link_removed',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({ linkId }))}::jsonb
    )
  `;

  return loadAdminProductRow(productId);
}

export async function updateAdminProduct(input: UpdateAdminProductInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const beforeRows = await sql`
    select to_jsonb(marketplace_products.*) as before_payload
    from public.marketplace_products
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
          list_status,
          created_at,
          updated_at
        )
        values (
          ${brandName},
          ${normalizedBrandName},
          'unknown',
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
    update public.marketplace_products set
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
      list_status = coalesce(${input.listStatus ?? null}, list_status),
      label_status = coalesce(${input.labelStatus ?? null}, label_status),
      availability_status = coalesce(${input.availabilityStatus ?? null}, availability_status),
      affiliate_status = coalesce(${input.affiliateStatus ?? null}, affiliate_status),
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
      price_amount = case
        when ${input.priceAmount === undefined} then price_amount
        else ${input.priceAmount ?? null}
      end,
      admin_notes = coalesce(${input.adminNotes ?? null}, admin_notes),
      updated_at = now()
    where id = ${input.id}::uuid
    returning id::text
  `;

  if (input.facts !== undefined) {
    const facts = normalizedFactsForStorage(input.facts);
    const supplementMatchesByFactName = await supplementIdsForFacts(sql, facts);

    await replaceProductFacts(sql, {
      deleteSources: [],
      facts,
      productId: input.id,
      source: input.factsSource?.trim() || "admin",
      supplementMatchesByFactName
    });
  }

  if (input.descriptionEn !== undefined || input.descriptionTh !== undefined) {
    try {
      await sql`
        update public.marketplace_products
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

  const productQuality = await refreshAndPersistProductQuality(sql, input.id);
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
      ${sql.json(beforeRows[0].before_payload ?? {})}::jsonb,
      ${sql.json({
        affiliateStatus: input.affiliateStatus,
        availabilityStatus: input.availabilityStatus,
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
        listStatus: input.listStatus,
        productQuality: productQuality.productQuality,
        productAudience: input.productAudience,
        productKind: input.productKind,
        productUrl: input.productUrl,
        priceAmount: input.priceAmount,
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

  return row;
}
