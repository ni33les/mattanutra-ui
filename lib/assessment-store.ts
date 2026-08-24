import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import {
  buildAssessmentSteps,
  createHealthScoreAnalysisSnapshot,
  normalizeAssessmentPlan,
  type AssessmentPlan,
  type AssessmentSnapshot
} from "@/lib/assessment-snapshot";
import { buildAssessmentSummary } from "@/lib/formulation-summary";
import {
  isExampleFormulationModelVersion,
  toFreePreviewFormulationResult
} from "@/lib/formulation-preview";
import {
  type FoodGapSupport,
  type FoodGuidanceItem,
  type FormulationCaution,
  type FormulationIngredient,
  type FormulationResult,
  type MarketingPoint,
  type NutritionReport,
  type ProductNeedCoverage,
  type ProductRecommendationOption,
  type ProductRecommendationRefreshReason,
  type ProductStackPreference,
  type RecommendedProduct
} from "@/lib/formulation-types";
import {
  defaultLocale,
  isLocale,
  type Locale
} from "@/lib/i18n";
import {
  buildProductNeeds,
  type ProductRecommendationNeed
} from "@/lib/product-recommendations";
import { getSql } from "@/lib/db";
import { uuidArray } from "@/lib/sql-arrays";
import { appendAssessmentVersion } from "@/lib/domain-versions";
import {
  firstNameFromAssessmentAnswers,
  normalizeAssessmentFirstName
} from "@/lib/assessment-first-name";
import { normalizeAssessmentContactEmail } from "@/lib/assessment-contact";

export type StoredAssessmentStatus =
  | "captured"
  | "failed"
  | "preparing"
  | "queued"
  | "ready";

type PersistAssessmentInput = Readonly<{
  answers?: unknown;
  contactEmail?: unknown;
  locale?: unknown;
  selectedPlan?: AssessmentPlan | null;
  skipHealthScore?: boolean;
  snapshot: AssessmentSnapshot;
  status: StoredAssessmentStatus;
}>;

let schemaReady: Promise<void> | null = null;

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeLocale(locale: unknown): Locale {
  return isLocale(locale) ? locale : defaultLocale;
}

function marketplaceFromPlatform(
  platform: unknown
): RecommendedProduct["marketplace"] {
  if (platform === "lazada") {
    return "Lazada Thailand";
  }

  if (platform === "shopee") {
    return "Shopee Thailand";
  }

  return "Imported product";
}

function coversFromNeeds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (item && typeof item === "object" && "sourceId" in item) {
        const sourceId = (item as { sourceId?: unknown }).sourceId;
        return typeof sourceId === "string" ? sourceId : "";
      }

      return typeof item === "string" ? item : "";
    })
    .filter((item) => item.length > 0);
}

function servingMultiplierFrom(row: Readonly<{
  serving_multiplier?: unknown;
  why?: unknown;
}>) {
  const fromColumn = Number(row.serving_multiplier);
  const fromWhy = Number(
    String(row.why ?? "").match(/^Use ([0-9]+) servings/)?.[1]
  );

  return Math.max(
    1,
    Number.isFinite(fromColumn) && fromColumn > 0 ? fromColumn : 1,
    Number.isFinite(fromWhy) && fromWhy > 0 ? fromWhy : 1
  );
}

function mapStoredRecommendationItem(
  item: Record<string, unknown>,
  stackCoveragePercent: number
): RecommendedProduct {
  const priceAmount = Number(item.price_amount);
  const productId = String(item.product_id);
  const localeTitle =
    typeof item.locale_title === "string" ? item.locale_title.trim() : "";
  const defaultTitle =
    typeof item.default_title === "string" ? item.default_title.trim() : "";
  const productTitle =
    typeof item.product_title === "string" ? item.product_title : "";
  const productImage =
    typeof item.product_image_url === "string" && item.product_image_url
      ? item.product_image_url
      : typeof item.image_url === "string"
        ? item.image_url
        : null;

  return {
    affiliate: false,
    covers: coversFromNeeds(item.covered_needs),
    description: typeof item.why === "string" ? item.why : "",
    id: productId,
    imageUrl: productImage,
    marketplace: marketplaceFromPlatform(item.platform),
    name: localeTitle || defaultTitle || productTitle,
    price:
      Number.isFinite(priceAmount) && priceAmount > 0
        ? {
            amount: priceAmount,
            currency: typeof item.currency === "string" ? item.currency : "THB"
          }
        : null,
    retailer: null,
    priority: Number(item.rank) || 0,
    productCoveragePercent: Number(item.product_coverage_percent) || 0,
    productId,
    rank: Number(item.rank) || 0,
    recommendationRunId: String(item.run_id),
    servingMultiplier: servingMultiplierFrom(item),
    stackContributionPercent: Number(item.stack_contribution_percent) || 0,
    stackCoveragePercent,
    tag: "Best match",
    url: typeof item.url_used === "string" ? item.url_used : ""
  };
}

async function loadStoredRecommendationProductPayloads(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planId: string,
  locale: string
): Promise<{
  items: RecommendedProduct[];
  options: Array<Record<string, unknown>>;
}> {
  // Matcher write already keeps in-country, sale-eligible SKUs on the run.
  // Availability flips are a stack refresh, not a GET-time product_facts /
  // jsonb country scan. This path is a bounded lookup by run_id.
  const runs = await sql<
    Array<{
      client_needs_count: number | null;
      diagnostics: unknown;
      generated_at: Date | string | null;
      id: string;
      notes: string | null;
      stack_coverage_percent: number | null;
      stack_preference: string;
      status: string;
    }>
  >`
    select distinct on (coalesce(diagnostics ->> 'stackPreference', 'balanced'))
      id,
      status,
      stack_coverage_percent,
      jsonb_array_length(client_needs) as client_needs_count,
      diagnostics,
      coalesce(diagnostics ->> 'stackPreference', 'balanced') as stack_preference,
      notes,
      generated_at
    from product_recommendation_runs
    where plan_id = ${planId}::uuid
      and coalesce(diagnostics ->> 'stackPreference', 'balanced') in ('compact', 'balanced')
    order by
      coalesce(diagnostics ->> 'stackPreference', 'balanced'),
      generated_at desc
  `;

  if (runs.length < 1) {
    return { items: [], options: [] };
  }

  const itemRows = await sql<Array<Record<string, unknown>>>`
    select
      i.run_id,
      i.rank,
      i.why,
      i.image_url,
      i.price_amount,
      i.currency,
      i.product_coverage_percent,
      i.serving_multiplier,
      i.stack_contribution_percent,
      i.url_used,
      i.covered_needs,
      i.product_id,
      p.image_url as product_image_url,
      p.platform,
      p.title as product_title,
      loc.title as locale_title,
      def.title as default_title
    from product_recommendation_items i
    join products p
      on p.id = i.product_id
    left join product_translations loc
      on loc.product_id = p.id
      and loc.locale = ${locale}
    left join product_translations def
      on def.product_id = p.id
      and def.locale = ${defaultLocale}
    where i.run_id = any(${uuidArray(
      sql,
      runs.map((run) => String(run.id))
    )}::uuid[])
    order by i.rank
  `;

  const itemsByRun = new Map<string, RecommendedProduct[]>();
  const coverageByRun = new Map(
    runs.map((run) => [String(run.id), Number(run.stack_coverage_percent) || 0])
  );

  for (const item of itemRows) {
    const runId = String(item.run_id);
    const list = itemsByRun.get(runId) ?? [];
    list.push(
      mapStoredRecommendationItem(item, coverageByRun.get(runId) ?? 0)
    );
    itemsByRun.set(runId, list);
  }

  const primary =
    runs.find((run) => run.stack_preference === "balanced") ?? runs[0]!;
  const preferenceRank = (preference: string) =>
    preference === "balanced" ? 1 : preference === "compact" ? 2 : 4;

  return {
    items: itemsByRun.get(String(primary.id)) ?? [],
    options: [...runs]
      .sort(
        (left, right) =>
          preferenceRank(left.stack_preference) -
          preferenceRank(right.stack_preference)
      )
      .map((run) => {
        const diagnostics = asRecord(run.diagnostics);
        const trace = asRecord(diagnostics.trace);

        return {
          generatedAt: run.generated_at,
          maxProducts:
            trace.maxProducts ?? diagnostics.maxProducts ?? null,
          needsCount: run.client_needs_count,
          notes: run.notes,
          recommendations: itemsByRun.get(String(run.id)) ?? [],
          runId: String(run.id),
          stackCoveragePercent: Number(run.stack_coverage_percent) || 0,
          stackPreference: run.stack_preference,
          status: run.status,
          diagnostics: run.diagnostics
        };
      })
  };
}

function toJsonRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return toJsonRecord(value);
}

function asFoodGapSupport(value: unknown): FoodGapSupport | undefined {
  const record = asRecord(value);
  const variants = asRecord(record.variants);
  const balanced = asRecord(variants.balanced);
  const compact = asRecord(variants.compact);

  return record.version === "food-gap:v1" &&
    Array.isArray(balanced.items) &&
    Array.isArray(compact.items)
    ? (record as FoodGapSupport)
    : undefined;
}

export function hasHealthScoreAdvice(value: unknown) {
  return hasHealthScoreAiCopy(value);
}

export function hasHealthScoreAiCopy(value: unknown) {
  const healthScore = asRecord(value);
  const pageContent = asRecord(healthScore.pageContent);
  const aiCopy = asRecord(pageContent.aiCopy);
  const heroBody = aiCopy.heroBody;

  if (typeof heroBody === "string") {
    return heroBody.trim().length > 0;
  }

  if (heroBody && typeof heroBody === "object" && !Array.isArray(heroBody)) {
    return Object.values(heroBody as Record<string, unknown>).some(
      (item) => typeof item === "string" && item.trim().length > 0
    );
  }

  return false;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function numberFromUnknown(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateMsFromUnknown(value: unknown) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  const ms = date.getTime();

  return Number.isFinite(ms) ? ms : null;
}

function asProductStackPreference(value: unknown): ProductStackPreference | undefined {
  return value === "compact" || value === "balanced"
    ? value
    : undefined;
}

function asProductRecommendationRefreshReason(
  value: unknown
): ProductRecommendationRefreshReason | undefined {
  return value === "missing_run" ||
    value === "ttl_expired" ||
    value === "product_catalogue_changed" ||
    value === "retail_catalogue_changed" ||
    value === "stock_or_allocation_changed" ||
    value === "supplement_governance_changed" ||
    value === "formulation_changed"
    ? value
    : undefined;
}

function safetySummaryFromRecord(
  value: unknown
): FormulationResult["safetySummary"] | undefined {
  const record = asRecord(value);
  const adjustedCount = Number(record.adjustedCount);
  const hiddenCount = Number(record.hiddenCount);
  const removedCount = Number(record.removedCount);
  const reviewCount = Number(record.reviewCount);

  if (
    !Number.isFinite(adjustedCount) ||
    !Number.isFinite(hiddenCount) ||
    !Number.isFinite(removedCount) ||
    !Number.isFinite(reviewCount)
  ) {
    return undefined;
  }

  return {
    adjustedCount: Math.max(0, Math.round(adjustedCount)),
    hiddenCount: Math.max(0, Math.round(hiddenCount)),
    removedCount: Math.max(0, Math.round(removedCount)),
    reviewCount: Math.max(0, Math.round(reviewCount))
  };
}

function productNeedCoverageFromDiagnostics(
  value: unknown
): ProductNeedCoverage[] {
  const diagnostics = asRecord(value);
  const items = [
    ...asArray<Record<string, unknown>>(diagnostics.matchedNeeds),
    ...asArray<Record<string, unknown>>(diagnostics.unmatchedNeeds)
  ];

  return items
    .map((item) => {
      const id = typeof item.id === "string" ? item.id : "";
      const displayName =
        typeof item.displayName === "string" ? item.displayName : "";
      const itemType =
        item.itemType === "food" || item.itemType === "supplement"
          ? item.itemType
          : null;
      const coveragePercent = Number(item.coveragePercent);
      const bestRejectedProductId =
        typeof item.bestRejectedProductId === "string"
          ? item.bestRejectedProductId
          : null;
      const bestRejectedReason =
        typeof item.bestRejectedReason === "string"
          ? item.bestRejectedReason
          : null;

      if (!id || !displayName || !itemType || !Number.isFinite(coveragePercent)) {
        return null;
      }

      return {
        bestRejectedProductId,
        bestRejectedReason,
        coveragePercent: Math.min(100, Math.max(0, Math.round(coveragePercent))),
        displayName,
        id,
        itemType
      } satisfies ProductNeedCoverage;
    })
    .filter((item): item is ProductNeedCoverage => Boolean(item));
}

function sourceIdFromNeedId(id: string) {
  const separator = id.indexOf(":");

  return separator >= 0 ? id.slice(separator + 1) : id;
}

function productCoverageLookup(items: readonly ProductNeedCoverage[]) {
  const lookup = new Map<string, number>();

  for (const item of items) {
    lookup.set(item.id, item.coveragePercent);
    lookup.set(sourceIdFromNeedId(item.id), item.coveragePercent);
    lookup.set(normalizeReviewName(item.displayName), item.coveragePercent);
  }

  return lookup;
}

function productCoverageReasonLookup(items: readonly ProductNeedCoverage[]) {
  const lookup = new Map<string, ProductNeedCoverage>();

  for (const item of items) {
    lookup.set(item.id, item);
    lookup.set(sourceIdFromNeedId(item.id), item);
    lookup.set(normalizeReviewName(item.displayName), item);
  }

  return lookup;
}

function addRecommendationCoverageFallback(
  lookup: Map<string, number>,
  recommendations: readonly RecommendedProduct[]
) {
  for (const recommendation of recommendations) {
    for (const covered of recommendation.covers ?? []) {
      const keys = [covered, sourceIdFromNeedId(covered), normalizeReviewName(covered)];

      for (const key of keys) {
        lookup.set(key, Math.max(lookup.get(key) ?? 0, 100));
      }
    }
  }
}

function currentNeedCoverage(
  needs: readonly ProductRecommendationNeed[],
  coverageLookup: ReadonlyMap<string, number>,
  reasonLookup: ReadonlyMap<string, ProductNeedCoverage> = new Map()
) {
  return needs
    .filter(
      (need): need is ProductRecommendationNeed & {
        itemType: "food" | "supplement";
      } => need.itemType === "food" || need.itemType === "supplement"
    )
    .map((need) => {
      const matchedReason =
        reasonLookup.get(need.id) ??
        reasonLookup.get(need.sourceId) ??
        reasonLookup.get(normalizeReviewName(need.displayName));

      return {
      bestRejectedProductId: matchedReason?.bestRejectedProductId ?? null,
      bestRejectedReason: matchedReason?.bestRejectedReason ?? null,
      coveragePercent: Math.min(
        100,
        Math.max(
          0,
          Math.round(
            coverageLookup.get(need.id) ??
              coverageLookup.get(need.sourceId) ??
              coverageLookup.get(normalizeReviewName(need.displayName)) ??
              0
          )
        )
      ),
      displayName: need.displayName,
      id: need.id,
      itemType: need.itemType
    } satisfies ProductNeedCoverage;
    });
}

function weightedCoveragePercent(
  needs: readonly ProductRecommendationNeed[],
  coverageLookup: ReadonlyMap<string, number>
) {
  const totalWeight = needs.reduce((total, need) => total + need.weight, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const coveredWeight = needs.reduce((total, need) => {
    const coveragePercent =
      coverageLookup.get(need.id) ??
      coverageLookup.get(need.sourceId) ??
      coverageLookup.get(normalizeReviewName(need.displayName)) ??
      0;

    return total + need.weight * Math.min(1, Math.max(0, coveragePercent / 100));
  }, 0);

  return Math.min(100, Math.max(0, Math.round((coveredWeight / totalWeight) * 100)));
}

function weightedContributionPercent(
  selectedNeeds: readonly ProductRecommendationNeed[],
  denominatorNeeds: readonly ProductRecommendationNeed[],
  coverageLookup: ReadonlyMap<string, number>
) {
  const totalWeight = denominatorNeeds.reduce((total, need) => total + need.weight, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const coveredWeight = selectedNeeds.reduce((total, need) => {
    const coveragePercent =
      coverageLookup.get(need.id) ??
      coverageLookup.get(need.sourceId) ??
      coverageLookup.get(normalizeReviewName(need.displayName)) ??
      0;

    return total + need.weight * Math.min(1, Math.max(0, coveragePercent / 100));
  }, 0);

  return Math.min(100, Math.max(0, Math.round((coveredWeight / totalWeight) * 100)));
}

function boundedPercentOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.min(100, Math.max(0, Math.round(parsed)))
    : null;
}

function recommendationMatchesNeed(
  recommendation: RecommendedProduct,
  need: ProductRecommendationNeed
) {
  const covers = new Set(recommendation.covers ?? []);

  return (
    covers.has(need.id) ||
    covers.has(need.sourceId) ||
    covers.has(sourceIdFromNeedId(need.id)) ||
    covers.has(normalizeReviewName(need.displayName))
  );
}

export function reconcileProductRecommendationCoverage(input: Readonly<{
  foodGuidance: readonly FoodGuidanceItem[];
  rawNeedCoverage: readonly ProductNeedCoverage[];
  recommendations: readonly RecommendedProduct[];
  supplementBreakdown: readonly FormulationIngredient[];
}>) {
  const currentNeeds = buildProductNeeds({
    foodGuidance: { foodGuidance: [...input.foodGuidance] },
    formulation: { supplementBreakdown: [...input.supplementBreakdown] }
  });
  const coverageLookup = productCoverageLookup(input.rawNeedCoverage);
  const reasonLookup = productCoverageReasonLookup(input.rawNeedCoverage);

  if (input.rawNeedCoverage.length < 1) {
    addRecommendationCoverageFallback(coverageLookup, input.recommendations);
  }
  const needCoverage = currentNeedCoverage(currentNeeds, coverageLookup, reasonLookup);
  const productNeeds = currentNeeds.filter((need) => need.itemType === "supplement");
  const stackCoveragePercent = weightedCoveragePercent(productNeeds, coverageLookup);

  return {
    needCoverage,
    recommendations: input.recommendations.map((recommendation) => {
      const matchedNeeds = productNeeds.filter((need) =>
        recommendationMatchesNeed(recommendation, need)
      );
      const fallbackContributionPercent = weightedContributionPercent(
        matchedNeeds,
        productNeeds,
        coverageLookup
      );
      const stackContributionPercent =
        boundedPercentOrNull(recommendation.stackContributionPercent) ??
        (
          fallbackContributionPercent > 0
            ? fallbackContributionPercent
            : boundedPercentOrNull(recommendation.productCoveragePercent) ?? 0
        );
      const productCoveragePercent =
        boundedPercentOrNull(recommendation.productCoveragePercent) ??
        stackContributionPercent;

      return {
        ...recommendation,
        productCoveragePercent,
        stackContributionPercent,
        stackCoveragePercent
      } satisfies RecommendedProduct;
    }),
    stackCoveragePercent
  };
}

type SafetyReviewResolutionRow = Readonly<{
  client_message: Record<string, unknown> | null;
  id: string;
  item_name: string | null;
  reviewer_note: string | null;
  rule_code: string | null;
  status: string;
  supplement_name: string | null;
  task_id: string | null;
}>;

type SafetyReviewRefs = Readonly<{
  names: string[];
  reviewIds: string[];
  taskIds: string[];
}>;

function localizedValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  const record = asRecord(value);

  return String(record.en ?? record.th ?? "").trim();
}

function normalizeReviewName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hiddenSafetyRecord(
  item: FormulationIngredient | FoodGuidanceItem
) {
  return item.safety?.visibility === "hidden" ? item.safety : null;
}

function addHiddenReviewRefs(
  refs: { names: Set<string>; reviewIds: Set<string>; taskIds: Set<string> },
  item: FormulationIngredient | FoodGuidanceItem,
  name: string
) {
  const safety = hiddenSafetyRecord(item);

  if (!safety) {
    return;
  }

  if (safety.reviewId && isUuid(safety.reviewId)) {
    refs.reviewIds.add(safety.reviewId);
  }

  if (safety.reviewTaskId && isUuid(safety.reviewTaskId)) {
    refs.taskIds.add(safety.reviewTaskId);
  }

  const normalizedName = normalizeReviewName(name);

  if (normalizedName) {
    refs.names.add(normalizedName);
  }
}

function collectHiddenReviewRefs(
  supplementBreakdown: readonly FormulationIngredient[],
  foodGuidance: readonly FoodGuidanceItem[]
): SafetyReviewRefs {
  const refs = {
    names: new Set<string>(),
    reviewIds: new Set<string>(),
    taskIds: new Set<string>()
  };

  for (const item of supplementBreakdown) {
    addHiddenReviewRefs(refs, item, localizedValue(item.supplement));
  }

  for (const item of foodGuidance) {
    addHiddenReviewRefs(refs, item, localizedValue(item.food));
  }

  return {
    names: [...refs.names],
    reviewIds: [...refs.reviewIds],
    taskIds: [...refs.taskIds]
  };
}

async function loadResolvedSafetyReviews(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planId: string,
  refs: SafetyReviewRefs
) {
  if (
    refs.names.length < 1 &&
    refs.reviewIds.length < 1 &&
    refs.taskIds.length < 1
  ) {
    return [];
  }

  return sql<SafetyReviewResolutionRow[]>`
    select
      id::text,
      task_id::text,
      status,
      rule_code,
      reviewer_note,
      client_message,
      coalesce(to_jsonb(safety_reviews) ->> 'item_name', supplement_name) as item_name,
      supplement_name
    from public.safety_reviews
    where plan_id = ${planId}::uuid
      and (
        id = any(${refs.reviewIds}::uuid[])
        or task_id = any(${refs.taskIds}::uuid[])
        or trim(both '_' from regexp_replace(lower(coalesce(to_jsonb(safety_reviews) ->> 'item_name', supplement_name, '')), '[^a-z0-9]+', '_', 'g'))
          = any(${refs.names}::text[])
      )
    order by reviewed_at desc nulls last, closed_at desc nulls last, updated_at desc, opened_at desc
  `;
}

async function loadGovernanceStatusLookup(
  sql: NonNullable<ReturnType<typeof getSql>>,
  refs: SafetyReviewRefs
) {
  const supplementRows =
    refs.names.length > 0
      ? await sql<Array<{
          aliases: string[];
          list_status: string;
          normalized_name: string;
        }>>`
          select
            supplements.normalized_name,
            supplements.list_status,
            coalesce(
              array_remove(array_agg(distinct supplement_aliases.normalized_alias), null),
              '{}'::text[]
            ) as aliases
          from public.supplements
          left join public.supplement_aliases
            on supplement_aliases.supplement_id = supplements.id
          where supplements.is_active = true
            and (
              supplements.normalized_name = any(${refs.names}::text[])
              or supplement_aliases.normalized_alias = any(${refs.names}::text[])
            )
          group by supplements.id, supplements.normalized_name, supplements.list_status
        `
      : [];
  const foodRows =
    refs.names.length > 0
      ? await sql<Array<{
          aliases: string[];
          list_status: string;
          normalized_name: string;
        }>>`
          select
            foods.normalized_name,
            foods.list_status,
            coalesce(
              array_remove(array_agg(distinct food_aliases.normalized_alias), null),
              '{}'::text[]
            ) as aliases
          from public.foods
          left join public.food_aliases
            on food_aliases.food_id = foods.id
          where foods.is_active = true
            and (
              foods.normalized_name = any(${refs.names}::text[])
              or food_aliases.normalized_alias = any(${refs.names}::text[])
            )
          group by foods.id, foods.normalized_name, foods.list_status
        `
      : [];
  const supplements = new Map<string, string>();
  const foods = new Map<string, string>();

  for (const row of supplementRows) {
    supplements.set(row.normalized_name, row.list_status);
    for (const alias of row.aliases ?? []) {
      supplements.set(alias, row.list_status);
    }
  }

  for (const row of foodRows) {
    foods.set(row.normalized_name, row.list_status);
    for (const alias of row.aliases ?? []) {
      foods.set(alias, row.list_status);
    }
  }

  return { foods, supplements };
}

function reviewDecision(row: SafetyReviewResolutionRow) {
  const clientMessage = asRecord(row.client_message);
  const decision = String(clientMessage.decision ?? "").toLowerCase();

  if (decision === "approve" || decision === "disapprove") {
    return decision;
  }

  return null;
}

function reviewMakesItemVisible(row: SafetyReviewResolutionRow) {
  const note = (row.reviewer_note ?? "").toLowerCase();

  return (
    row.status === "accepted" ||
    reviewDecision(row) === "approve" ||
    note.includes("resolved as active") ||
    note.includes("resolved as whitelisted") ||
    note.includes("associated with") ||
    note.includes("approved")
  );
}

function reviewRemovesItem(row: SafetyReviewResolutionRow) {
  return row.status === "rejected" || reviewDecision(row) === "disapprove";
}

function reviewCanBeSatisfiedByWhitelist(row: SafetyReviewResolutionRow) {
  return (
    row.rule_code === "unknown_food" ||
    row.rule_code === "unknown_supplement"
  );
}

function reviewNameKeys(row: SafetyReviewResolutionRow) {
  return [
    row.item_name ? normalizeReviewName(row.item_name) : "",
    row.supplement_name ? normalizeReviewName(row.supplement_name) : ""
  ].filter(Boolean);
}

function findResolvedReview(
  reviews: readonly SafetyReviewResolutionRow[],
  item: FormulationIngredient | FoodGuidanceItem,
  name: string
) {
  const safety = hiddenSafetyRecord(item);
  const normalizedName = normalizeReviewName(name);

  return reviews.find((review) => {
    if (safety?.reviewId && review.id === safety.reviewId) {
      return true;
    }

    if (safety?.reviewTaskId && review.task_id === safety.reviewTaskId) {
      return true;
    }

    return Boolean(
      normalizedName && reviewNameKeys(review).includes(normalizedName)
    );
  });
}

function makeSupplementVisible(
  ingredient: FormulationIngredient,
  review: SafetyReviewResolutionRow
): FormulationIngredient {
  return {
    ...ingredient,
    safety: {
      ...(ingredient.safety ?? {
        action: "human_review" as const,
        message: "Approved by MattaNutra review."
      }),
      action: "human_review",
      message: {
        en: "Approved by MattaNutra review.",
        th: "Approved by MattaNutra review."
      },
      reviewId: review.id,
      reviewTaskId: review.task_id ?? ingredient.safety?.reviewTaskId,
      visibility: "visible"
    },
    status: ingredient.status === "review" ? "add" : ingredient.status
  };
}

function itemIsWhitelisted(
  lookup: ReadonlyMap<string, string>,
  name: string
) {
  return lookup.get(normalizeReviewName(name)) === "active";
}

function makeFoodVisible(
  item: FoodGuidanceItem,
  review: SafetyReviewResolutionRow
): FoodGuidanceItem {
  return {
    ...item,
    safety: {
      ...(item.safety ?? {
        action: "human_review" as const,
        message: "Approved by MattaNutra review."
      }),
      action: "human_review",
      message: {
        en: "Approved by MattaNutra review.",
        th: "Approved by MattaNutra review."
      },
      reviewId: review.id,
      reviewTaskId: review.task_id ?? item.safety?.reviewTaskId,
      visibility: "visible"
    },
    status: item.status === "review" ? "add" : item.status
  };
}

function adjustSafetySummary(
  summary: FormulationResult["safetySummary"] | undefined,
  input: Readonly<{
    removedCount: number;
    resolvedCount: number;
  }>
) {
  if (!summary) {
    return summary;
  }

  const resolvedHiddenCount = input.resolvedCount + input.removedCount;

  return {
    ...summary,
    hiddenCount: Math.max(0, summary.hiddenCount - resolvedHiddenCount),
    removedCount: summary.removedCount + input.removedCount,
    reviewCount: Math.max(0, summary.reviewCount - resolvedHiddenCount)
  };
}

export async function reconcileResolvedSafetyReviewFlags(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planId: string,
  input: Readonly<{
    foodGuidance: FoodGuidanceItem[];
    foodSafetySummary: FormulationResult["foodSafetySummary"] | undefined;
    safetySummary: FormulationResult["safetySummary"] | undefined;
    supplementBreakdown: FormulationIngredient[];
  }>
) {
  const refs = collectHiddenReviewRefs(
    input.supplementBreakdown,
    input.foodGuidance
  );
  const reviews = await loadResolvedSafetyReviews(sql, planId, refs);
  const governance = await loadGovernanceStatusLookup(sql, refs);
  let resolvedSupplements = 0;
  let removedSupplements = 0;
  let resolvedFoods = 0;
  let removedFoods = 0;

  if (
    reviews.length < 1 &&
    governance.supplements.size < 1 &&
    governance.foods.size < 1
  ) {
    return input;
  }

  const supplementBreakdown = input.supplementBreakdown.flatMap((ingredient) => {
    const ingredientName = localizedValue(ingredient.supplement);
    const review = findResolvedReview(
      reviews,
      ingredient,
      ingredientName
    );

    if (!review) {
      return [ingredient];
    }

    if (reviewRemovesItem(review)) {
      removedSupplements += 1;
      return [];
    }

    if (reviewMakesItemVisible(review)) {
      resolvedSupplements += 1;
      return [makeSupplementVisible(ingredient, review)];
    }

    if (
      reviewCanBeSatisfiedByWhitelist(review) &&
      itemIsWhitelisted(governance.supplements, ingredientName)
    ) {
      resolvedSupplements += 1;
      return [makeSupplementVisible(ingredient, review)];
    }

    return [ingredient];
  });
  const foodGuidance = input.foodGuidance.flatMap((item) => {
    const foodName = localizedValue(item.food);
    const review = findResolvedReview(reviews, item, foodName);

    if (!review) {
      return [item];
    }

    if (reviewRemovesItem(review)) {
      removedFoods += 1;
      return [];
    }

    if (reviewMakesItemVisible(review)) {
      resolvedFoods += 1;
      return [makeFoodVisible(item, review)];
    }

    if (
      reviewCanBeSatisfiedByWhitelist(review) &&
      itemIsWhitelisted(governance.foods, foodName)
    ) {
      resolvedFoods += 1;
      return [makeFoodVisible(item, review)];
    }

    return [item];
  });

  return {
    foodGuidance,
    foodSafetySummary: adjustSafetySummary(input.foodSafetySummary, {
      removedCount: removedFoods,
      resolvedCount: resolvedFoods
    }),
    safetySummary: adjustSafetySummary(input.safetySummary, {
      removedCount: removedSupplements,
      resolvedCount: resolvedSupplements
    }),
    supplementBreakdown
  };
}

export function toJsonValue(value: unknown): postgres.JSONValue {
  if (value === undefined) {
    return {};
  }

  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    return {};
  }

  return JSON.parse(serialized) as postgres.JSONValue;
}

function scalarOrNull(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return null;
}

function buildAnswerSummary(answers: unknown) {
  const record = toJsonRecord(answers);
  const firstName = firstNameFromAssessmentAnswers(record);

  return {
    age: scalarOrNull(record.age),
    budget: scalarOrNull(record.budget),
    country: scalarOrNull(record.country),
    firstName,
    goals: Array.isArray(record.goals) ? record.goals : [],
    medications: scalarOrNull(record.meds),
    maxPills: scalarOrNull(record.maxPills),
    sex: scalarOrNull(record.sex),
    symptoms: Array.isArray(record.symptoms) ? record.symptoms : []
  };
}

function buildStoredAssessmentAnswers(answers: unknown) {
  const record = toJsonRecord(answers);
  const firstName = firstNameFromAssessmentAnswers(record);

  return {
    ...record,
    firstName: firstName ?? ""
  };
}

export function toStoredPlan(plan: AssessmentPlan | null | undefined) {
  if (plan === "pro") {
    return "pro";
  }

  if (plan === "precision") {
    return "precision";
  }

  return null;
}

export async function ensureAssessmentSchema() {
  const sql = getSql();

  if (!sql) {
    return;
  }

  schemaReady ??= (async () => {
    const requiredColumns = [
      "plan_id",
      "locale",
      "selected_plan",
      "status",
      "answers",
      "answer_summary",
      "first_name",
      "contact_email",
      "contact_email_captured_at",
      "health_score",
      "queue_position",
      "error_message",
      "captured_at",
      "plan_selected_at",
      "processing_started_at",
      "completed_at",
      "updated_at"
    ];
    const rows = await sql<Array<{ column_name: string }>>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'assessments'
    `;
    const available = new Set(rows.map((row) => row.column_name));
    const missing = requiredColumns
      .filter((column) => !available.has(column))
      .map((column) => `public.assessments.${column}`);

    if (missing.length > 0) {
      throw new Error(
        `Assessment schema is incomplete. Apply db-schema.sql before using assessment APIs. Missing: ${missing.join(", ")}`
      );
    }

    const resumeDraftRows = await sql<Array<{ table_name: string }>>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'assessment_resume_drafts'
      limit 1
    `;

    if (!resumeDraftRows[0]) {
      throw new Error(
        "Assessment schema is incomplete. Apply db-schema.sql before using assessment APIs. Missing: public.assessment_resume_drafts"
      );
    }
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });

  await schemaReady;
}

function fromStoredPlan(plan: unknown): AssessmentPlan {
  return normalizeAssessmentPlan(plan);
}

function toSnapshotStatus(status: unknown): AssessmentSnapshot["status"] {
  if (status === "failed") {
    return "failed";
  }

  if (status === "ready") {
    return "ready";
  }

  if (status === "preparing") {
    return "preparing";
  }

  return "queued";
}

async function upsertAssessmentEmailChannel(input: Readonly<{
  contactEmail: string;
  displayName: string | null;
  planId: string;
}>) {
  const sql = getSql();

  if (!sql) {
    return;
  }

  const existing = await sql<Array<{ identity_id: string }>>`
    select identity_id::text
    from public.plan_communication_identities
    where plan_id = ${input.planId}::uuid
      and is_primary
    order by created_at asc
    limit 1
  `;
  const identityId = existing[0]?.identity_id ?? randomUUID();

  if (!existing[0]?.identity_id) {
    await sql`
      insert into public.communication_identities (
        id,
        source,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${identityId}::uuid,
        'plan',
        ${sql.json(toJsonValue({ planId: input.planId, source: "questionnaire_resume" }))},
        now(),
        now()
      )
      on conflict (id) do nothing
    `;
    await sql`
      insert into public.plan_communication_identities (
        plan_id,
        identity_id,
        relationship,
        is_primary,
        metadata,
        created_at
      )
      values (
        ${input.planId}::uuid,
        ${identityId}::uuid,
        'client',
        true,
        ${sql.json(toJsonValue({ source: "questionnaire_resume" }))},
        now()
      )
      on conflict do nothing
    `;
  }

  await sql`
    insert into public.communication_channels (
      id,
      identity_id,
      channel_type,
      address,
      display_name,
      status,
      preference_rank,
      actor_type,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${identityId}::uuid,
      'email',
      ${input.contactEmail},
      ${input.displayName ?? "Questionnaire email"},
      'active',
      70,
      'human',
      ${sql.json(toJsonValue({ source: "questionnaire_resume" }))},
      now(),
      now()
    )
    on conflict (identity_id, channel_type, lower(address)) do update set
      display_name = coalesce(excluded.display_name, communication_channels.display_name),
      metadata = communication_channels.metadata || excluded.metadata,
      preference_rank = least(communication_channels.preference_rank, excluded.preference_rank),
      status = 'active',
      updated_at = now()
  `;
}

export async function persistAssessmentSubmission({
  answers,
  contactEmail,
  locale,
  selectedPlan,
  skipHealthScore = false,
  snapshot,
  status
}: PersistAssessmentInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database connection is not configured");
  }

  if (!isUuid(snapshot.planId)) {
    throw new Error("Assessment plan ID must be a UUID");
  }

  if (!snapshot.healthScore && !skipHealthScore) {
    throw new Error("Assessment snapshot must include backend HealthScore");
  }

  const normalizedLocale = normalizeLocale(locale);
  const storedPlan = toStoredPlan(selectedPlan);
  const storedAnswersRecord = buildStoredAssessmentAnswers(answers);
  const firstName = normalizeAssessmentFirstName(storedAnswersRecord.firstName);
  const normalizedContactEmail = normalizeAssessmentContactEmail(contactEmail);
  const storedAnswers = toJsonValue(storedAnswersRecord);
  const storedAnswerSummary = toJsonValue(buildAnswerSummary(storedAnswersRecord));
  const storedHealthScore = toJsonValue(snapshot.healthScore);

  await sql`
    insert into assessments (
      plan_id,
      locale,
      selected_plan,
      status,
      answers,
      answer_summary,
      first_name,
      contact_email,
      contact_email_captured_at,
      health_score,
      queue_position,
      plan_selected_at,
      processing_started_at,
      completed_at,
      updated_at
    )
    values (
      ${snapshot.planId}::uuid,
      ${normalizedLocale},
      ${storedPlan},
      ${status},
      ${sql.json(storedAnswers)},
      ${sql.json(storedAnswerSummary)},
      ${firstName},
      ${normalizedContactEmail},
      ${normalizedContactEmail ? sql`now()` : null},
      ${sql.json(storedHealthScore)},
      ${snapshot.queuePosition},
      ${selectedPlan ? sql`now()` : null},
      ${status === "queued" || status === "preparing" || status === "ready"
        ? sql`now()`
        : null},
      ${status === "ready" ? sql`now()` : null},
      now()
    )
    on conflict (plan_id) do update set
      locale = excluded.locale,
      selected_plan = excluded.selected_plan,
      status = excluded.status,
      answers = excluded.answers,
      answer_summary = excluded.answer_summary,
      first_name = excluded.first_name,
      contact_email = coalesce(excluded.contact_email, assessments.contact_email),
      contact_email_captured_at = case
        when excluded.contact_email is not null
        then coalesce(assessments.contact_email_captured_at, excluded.contact_email_captured_at)
        else assessments.contact_email_captured_at
      end,
      health_score = excluded.health_score,
      queue_position = excluded.queue_position,
      error_message = case
        when excluded.status in ('captured', 'queued', 'preparing', 'ready')
        then null
        else assessments.error_message
      end,
      plan_selected_at = coalesce(
        assessments.plan_selected_at,
        excluded.plan_selected_at
      ),
      processing_started_at = coalesce(
        assessments.processing_started_at,
        excluded.processing_started_at
      ),
      completed_at = coalesce(
        assessments.completed_at,
        excluded.completed_at
      ),
      updated_at = now()
  `;

  void appendAssessmentVersion(sql, {
    actor: "assessment_api",
    afterPayload: {
      answers: storedAnswers,
      answerSummary: storedAnswerSummary,
      firstName,
      contactEmail: normalizedContactEmail,
      healthScore: storedHealthScore,
      locale: normalizedLocale,
      queuePosition: snapshot.queuePosition,
      selectedPlan,
      status
    },
    changeReason: "assessment_submission",
    eventPayload: {
      beforePayload: {},
      selectedPlan: storedPlan,
      status
    },
    eventType: "assessment_submission_persisted",
    planId: snapshot.planId,
    source: "assessment_store"
  }).catch(() => undefined);

  if (normalizedContactEmail) {
    void upsertAssessmentEmailChannel({
      contactEmail: normalizedContactEmail,
      displayName: firstName,
      planId: snapshot.planId
    }).catch(() => undefined);
  }
}

export async function getStoredAssessmentSnapshot(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  await ensureAssessmentSchema();

  const rows = await sql`
    select
      plan_id::text,
      selected_plan::text,
      status::text,
      health_score,
      queue_position
    from assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;

  const row = rows[0];

  if (!row) {
    return null;
  }

  const status = toSnapshotStatus(row.status);
  let queuePosition = Number(row.queue_position ?? 0);

  if (status === "queued") {
    const positions = await sql`
      with queued_tasks as (
        select
          plan_id,
          scheduled_for,
          created_at,
          (
            business_value
            + least(
              200,
              floor(greatest(0, extract(epoch from now() - scheduled_for) - 300) / 900) * 10
            )
          ) as effective_business_value
        from public.tasks
        where status = 'queued'
          and task_type in (
            'generate_food_gap_guidance',
            'generate_product_recommendations',
            'generate_supplement_guidance',
            'generate_example_supplement_guidance'
          )
      ),
      current_task as (
        select effective_business_value, scheduled_for, created_at
        from queued_tasks
        where plan_id = ${planId}::uuid
        order by created_at desc
        limit 1
      )
      select count(*)::int as queue_position
      from queued_tasks
      cross join current_task
      where (
          queued_tasks.effective_business_value > current_task.effective_business_value
          or (
            queued_tasks.effective_business_value = current_task.effective_business_value
            and queued_tasks.scheduled_for < current_task.scheduled_for
          )
          or (
            queued_tasks.effective_business_value = current_task.effective_business_value
            and queued_tasks.scheduled_for = current_task.scheduled_for
            and queued_tasks.created_at <= current_task.created_at
          )
        )
    `;

    queuePosition = Number(positions[0]?.queue_position ?? queuePosition);
  }

  const healthScore = asRecord(row.health_score);

  return {
    ...(typeof healthScore.score === "number"
      ? { healthScore: healthScore as AssessmentSnapshot["healthScore"] }
      : {}),
    plan: fromStoredPlan(row.selected_plan),
    planId: row.plan_id,
    queuePosition: status === "queued" ? Math.max(1, queuePosition) : 0,
    status,
    steps: buildAssessmentSteps(status)
  } satisfies AssessmentSnapshot;
}

export async function getStoredHealthScoreAnalysisSnapshot(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const rows = await sql`
    select
      plan_id::text,
      selected_plan::text,
      health_score
    from assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const healthScore = asRecord(row.health_score);

  if (typeof healthScore.score !== "number") {
    return null;
  }

  return createHealthScoreAnalysisSnapshot({
    healthScore: healthScore as NonNullable<AssessmentSnapshot["healthScore"]>,
    plan: row.selected_plan,
    planId: row.plan_id,
    status: "ready"
  });
}

export async function getStoredAssessmentPrefill(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const rows = await sql`
    select
      answers,
      contact_email,
      health_score,
      locale,
      selected_plan::text
    from assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const healthScore = asRecord(row.health_score);

  return {
    answers: asRecord(row.answers),
    contactEmail:
      typeof row.contact_email === "string" ? row.contact_email : null,
    healthScore:
      typeof healthScore.score === "number"
        ? (healthScore as AssessmentSnapshot["healthScore"])
        : null,
    locale: normalizeLocale(row.locale),
    plan: row.selected_plan ? fromStoredPlan(row.selected_plan) : null,
    planId
  };
}

type StoredFormulationRead = Readonly<{
  result: FormulationResult;
  status: AssessmentSnapshot["status"];
}>;

function mapSlimFormulationResult(
  planId: string,
  locale: Locale,
  row: Readonly<Record<string, unknown>>
): FormulationResult {
  const firstName =
    normalizeAssessmentFirstName(row.first_name) ??
    firstNameFromAssessmentAnswers(row.answers);
  const plan = fromStoredPlan(row.selected_plan);
  const storedFormulation = asRecord(row.formulation);
  const storedFoodGuidanceRecord = asRecord(row.food_guidance);
  const supplementBreakdown = asArray<FormulationIngredient>(
    storedFormulation.supplementBreakdown ?? storedFormulation.formula
  );
  const marketingPoints = asArray<MarketingPoint>(
    storedFormulation.marketingPoints
  );
  const cautions = asArray<FormulationCaution>(storedFormulation.cautions);
  const foodGuidance = asArray<FoodGuidanceItem>(
    storedFoodGuidanceRecord.foodGuidance
  );
  const storedFoodGapSupport = asFoodGapSupport(
    storedFoodGuidanceRecord.foodGapSupport
  );
  const safetySummary = safetySummaryFromRecord(
    storedFormulation.safetySummary
  );
  const foodSafetySummary = safetySummaryFromRecord(
    storedFoodGuidanceRecord.foodSafetySummary
  );
  const generatedDates = [row.generated_at, row.food_guidance_generated_at]
    .filter(Boolean)
    .map((value) => (value instanceof Date ? value : new Date(String(value))))
    .filter((date) => Number.isFinite(date.getTime()));
  const generatedAt = (
    generatedDates.length > 0
      ? new Date(Math.max(...generatedDates.map((date) => date.getTime())))
      : row.assessment_updated_at instanceof Date
        ? row.assessment_updated_at
        : new Date(String(row.assessment_updated_at))
  ).toISOString();
  const supplementsReady = Boolean(row.formulation);
  const foodsReady = Boolean(row.food_guidance);
  const result = {
    access:
      !row.selected_plan ||
      isExampleFormulationModelVersion(row.model_version)
        ? "preview"
        : "full",
    assessmentSummary: buildAssessmentSummary({
      answers: row.answers,
      locale,
      plan
    }),
    catalogueProductCount: 0,
    catalogueSupplementCount: 0,
    generatedAt,
    firstName,
    planId,
    nutritionReport: null,
    recommendations: [],
    schemaVersion: 1 as const,
    sectionStatuses: {
      foods: foodsReady ? "ready" : "pending",
      supplements: supplementsReady ? "ready" : "pending"
    },
    ...(safetySummary ? { safetySummary } : {}),
    ...(foodSafetySummary ? { foodSafetySummary } : {}),
    ...(cautions.length > 0 ? { cautions } : {}),
    ...(marketingPoints.length > 0 ? { marketingPoints } : {}),
    ...(storedFoodGapSupport ? { foodGapSupport: storedFoodGapSupport } : {}),
    foodGuidance,
    supplementBreakdown
  } satisfies FormulationResult;

  return result.access === "preview"
    ? toFreePreviewFormulationResult(result)
    : result;
}

async function loadStoredFormulationFormulaRead(
  planId: string,
  localeOption?: string | null
): Promise<StoredFormulationRead | null> {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const resultLocale = normalizeLocale(localeOption);
  const exampleModelPattern = "%:example";
  const rows = await sql<Array<Record<string, unknown>>>`
    select
      assessments.status::text,
      assessments.answers,
      assessments.first_name,
      assessments.locale,
      assessments.selected_plan::text,
      assessments.updated_at as assessment_updated_at,
      formulations.formulation,
      formulations.generated_at,
      formulations.model_version,
      food_guidance.guidance as food_guidance,
      food_guidance.generated_at as food_guidance_generated_at,
      food_guidance.model_version as food_guidance_model_version
    from assessments
    left join lateral (
      select formulation, generated_at, model_version
      from formulations
      where formulations.plan_id = assessments.plan_id
        and (
          case
            when assessments.selected_plan is not null then
              (
                formulations.model_version is null
                or formulations.model_version not like ${exampleModelPattern}
              )
            else
              formulations.model_version like ${exampleModelPattern}
          end
        )
      order by version desc, generated_at desc
      limit 1
    ) formulations on true
    left join lateral (
      select guidance, generated_at, model_version
      from food_guidance
      where food_guidance.plan_id = assessments.plan_id
        and (
          case
            when assessments.selected_plan is not null then
              (
                food_guidance.model_version is null
                or food_guidance.model_version not like ${exampleModelPattern}
              )
            else
              food_guidance.model_version like ${exampleModelPattern}
          end
        )
      order by version desc, generated_at desc
      limit 1
    ) food_guidance on true
    where assessments.plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    result: mapSlimFormulationResult(planId, resultLocale, row),
    status: toSnapshotStatus(row.status)
  };
}

export async function getStoredFormulationRead(
  planId: string,
  options: Readonly<{
    includeProducts?: boolean;
    locale?: string | null;
  }> = {}
): Promise<StoredFormulationRead | null> {
  if (options.includeProducts) {
    const result =
      (await getStoredFormulationResult(planId, {
        locale: options.locale,
        mode: "full"
      })) ??
      (await getStoredFormulationResult(planId, {
        locale: options.locale,
        mode: "preview"
      }));

    if (!result) {
      return null;
    }

    return {
      result,
      status: "ready"
    };
  }

  return loadStoredFormulationFormulaRead(planId, options.locale);
}

export async function getStoredFormulationResult(
  planId: string,
  options: Readonly<{
    detail?: "full" | "page";
    locale?: string | null;
    mode?: "full" | "preview";
  }> = {}
) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const mode = options.mode ?? "full";
  const includeProductPayloads = options.detail !== "page";
  const resultLocale = normalizeLocale(options.locale);
  const exampleModelPattern = "%:example";
  const formulationModeFilter =
    mode === "preview"
      ? sql`and formulations.model_version like ${exampleModelPattern}`
      : sql`and (
          formulations.model_version is null
          or formulations.model_version not like ${exampleModelPattern}
        )`;
  const foodGuidanceModeFilter =
    mode === "preview"
      ? sql`and food_guidance.model_version like ${exampleModelPattern}`
      : sql`and (
          food_guidance.model_version is null
          or food_guidance.model_version not like ${exampleModelPattern}
        )`;
  const assessmentAccessFilter =
    mode === "preview"
      ? sql`and assessments.selected_plan is null`
      : sql`and assessments.selected_plan is not null`;

  const rows = await sql`
    select
      assessments.answers,
      assessments.first_name,
      assessments.locale,
      assessments.selected_plan::text,
      assessments.updated_at as assessment_updated_at,
      formulations.formulation,
      formulations.generated_at,
      formulations.model_version,
      food_guidance.guidance as food_guidance,
      food_guidance.generated_at as food_guidance_generated_at,
      food_guidance.model_version as food_guidance_model_version,
      nutrition_reports.report as nutrition_report,
      nutrition_reports.version as nutrition_report_version,
      nutrition_reports.generated_at as nutrition_report_generated_at,
      report_task.status as report_task_status,
      refinement_task.status as refinement_task_status,
      recommendations.recommendations,
      product_recommendation_run.id::text as product_recommendation_run_id,
      product_recommendation_run.status as product_recommendation_run_status,
      product_recommendation_run.stack_coverage_percent as product_recommendation_stack_coverage_percent,
      product_recommendation_run.client_needs_count as product_recommendation_needs_count,
      product_recommendation_run.generated_at as product_recommendation_generated_at,
      product_recommendation_run.notes as product_recommendation_notes,
      product_recommendation_run.diagnostics as product_recommendation_diagnostics,
      product_recommendation_run.stack_preference as product_recommendation_stack_preference,
      product_recommendation_items_payload.recommendations as product_recommendation_items_payload,
      product_recommendation_options_payload.options as product_recommendation_options_payload,
      product_recommendation_task.created_at as product_recommendation_task_created_at,
      product_recommendation_task.payload ->> 'refreshReason' as product_recommendation_task_refresh_reason,
      product_recommendation_task.payload ->> 'stackPreference' as product_recommendation_task_stack_preference,
      product_recommendation_task.status as product_recommendation_task_status,
      food_gap_support_task.status as food_gap_support_task_status,
      supplement_catalogue.active_supplement_count,
      product_catalogue.approved_product_count
    from assessments
    left join lateral (
      select formulation, generated_at, model_version
      from formulations
      where formulations.plan_id = assessments.plan_id
        ${formulationModeFilter}
      order by version desc, generated_at desc
      limit 1
    ) formulations on true
    left join lateral (
      select guidance, generated_at, model_version
      from food_guidance
      where food_guidance.plan_id = assessments.plan_id
        ${foodGuidanceModeFilter}
      order by version desc, generated_at desc
      limit 1
    ) food_guidance on true
    left join lateral (
      select report, version, generated_at
      from nutrition_reports
      where nutrition_reports.plan_id = assessments.plan_id
      order by version desc, generated_at desc
      limit 1
    ) nutrition_reports on true
    left join lateral (
      select status
      from tasks
      where tasks.plan_id = assessments.plan_id
        and task_type = 'generate_nutrition_report'
      order by created_at desc
      limit 1
    ) report_task on true
    left join lateral (
      select status
      from tasks
      where tasks.plan_id = assessments.plan_id
        and task_type in (
          'refine_nutrition_plan',
          'generate_supplement_guidance',
          'generate_nutrition_report'
        )
        and context ->> 'source' = 'plan_refinement'
        and status in ('queued', 'reserved', 'running', 'needs_review', 'waiting_approval')
      order by created_at desc
      limit 1
    ) refinement_task on true
    left join lateral (
      select recommendations
      from recommendations
      where recommendations.plan_id = assessments.plan_id
      order by version desc, generated_at desc
      limit 1
    ) recommendations on true
    left join lateral (
      select
        id,
        status,
        stack_coverage_percent,
        jsonb_array_length(client_needs) as client_needs_count,
        diagnostics,
        diagnostics ->> 'stackPreference' as stack_preference,
        notes,
        generated_at
      from product_recommendation_runs
      where product_recommendation_runs.plan_id = assessments.plan_id
        and coalesce(diagnostics ->> 'stackPreference', 'balanced') in ('compact', 'balanced')
      order by
        case coalesce(diagnostics ->> 'stackPreference', 'balanced')
          when 'balanced' then 1
          when 'compact' then 2
          else 3
        end,
        generated_at desc
      limit 1
    ) product_recommendation_run on true
    left join lateral (
      select '[]'::jsonb as recommendations
    ) product_recommendation_items_payload on true
    left join lateral (
      select '[]'::jsonb as options
    ) product_recommendation_options_payload on true
    left join lateral (
      select created_at, payload, status
      from tasks
      where tasks.plan_id = assessments.plan_id
        and task_type = 'generate_product_recommendations'
      order by
        case
          when status in ('queued', 'reserved', 'running', 'needs_review', 'waiting_approval')
            then 0
          else 1
        end,
        created_at desc
      limit 1
    ) product_recommendation_task on true
    left join lateral (
      select status
      from tasks
      where tasks.plan_id = assessments.plan_id
        and task_type = 'generate_food_gap_guidance'
      order by created_at desc
      limit 1
    ) food_gap_support_task on true
    left join lateral (
      select 0::int as active_supplement_count
    ) supplement_catalogue on true
    left join lateral (
      select 0::int as approved_product_count
    ) product_catalogue on true
    where assessments.plan_id = ${planId}::uuid
      ${assessmentAccessFilter}
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const productPayloads = includeProductPayloads
    ? await loadStoredRecommendationProductPayloads(sql, planId, resultLocale)
    : { items: [], options: [] };

  if (mode === "preview" && (!row.formulation || !row.food_guidance)) {
    return null;
  }

  const locale = resultLocale;
  const firstName =
    normalizeAssessmentFirstName(row.first_name) ??
    firstNameFromAssessmentAnswers(row.answers);
  const plan = fromStoredPlan(row.selected_plan);
  const storedFormulation = asRecord(row.formulation);
  const storedFoodGuidanceRecord = asRecord(row.food_guidance);
  const storedSupplementBreakdown = asArray<FormulationIngredient>(
    storedFormulation.supplementBreakdown ?? storedFormulation.formula
  );
  const marketingPoints = asArray<MarketingPoint>(
    storedFormulation.marketingPoints
  );
  const cautions = asArray<FormulationCaution>(storedFormulation.cautions);
  const storedFoodGuidance = asArray<FoodGuidanceItem>(
    storedFoodGuidanceRecord.foodGuidance
  );
  const storedFoodGapSupport = asFoodGapSupport(
    storedFoodGuidanceRecord.foodGapSupport
  );
  const storedSafety = {
    foodGuidance: storedFoodGuidance,
    foodSafetySummary: safetySummaryFromRecord(
      storedFoodGuidanceRecord.foodSafetySummary
    ),
    safetySummary: safetySummaryFromRecord(storedFormulation.safetySummary),
    supplementBreakdown: storedSupplementBreakdown
  };
  const reconciledSafety =
    options.detail === "page"
      ? storedSafety
      : await reconcileResolvedSafetyReviewFlags(sql, planId, storedSafety);
  const supplementBreakdown = reconciledSafety.supplementBreakdown;
  const foodGuidance = reconciledSafety.foodGuidance;
  const safetySummary = reconciledSafety.safetySummary;
  const foodSafetySummary = reconciledSafety.foodSafetySummary;

  const legacyRecommendations = asArray<RecommendedProduct>(
    row.recommendations
  );
  const productRecommendationItems = includeProductPayloads
    ? productPayloads.items
    : asArray<RecommendedProduct>(row.product_recommendation_items_payload);
  const hasStructuredProductRecommendationRun =
    typeof row.product_recommendation_run_status === "string" &&
    row.product_recommendation_run_status.length > 0;
  const recommendations =
    hasStructuredProductRecommendationRun
      ? productRecommendationItems
      : legacyRecommendations;
  const productRecommendationCoverage = reconcileProductRecommendationCoverage({
    foodGuidance,
    rawNeedCoverage: productNeedCoverageFromDiagnostics(
      row.product_recommendation_diagnostics
    ),
    recommendations,
    supplementBreakdown
  });
  const productNeedCoverage = productRecommendationCoverage.needCoverage;
  const reconciledRecommendations = productRecommendationCoverage.recommendations;
  const productStackCoveragePercent =
    productNeedCoverage.length > 0
      ? productRecommendationCoverage.stackCoveragePercent
      : Number(row.product_recommendation_stack_coverage_percent) || 0;
  const nutritionReportRecord = asRecord(row.nutrition_report);
  const hasNutritionReportRecord = Object.keys(nutritionReportRecord).length > 0;
  const productRecommendationTaskStatus =
    typeof row.product_recommendation_task_status === "string"
      ? row.product_recommendation_task_status
      : "";
  const productRecommendationRunStatus =
    typeof row.product_recommendation_run_status === "string"
      ? row.product_recommendation_run_status
      : "";
  const productRecommendationPending = [
    "queued",
    "reserved",
    "running",
    "needs_review",
    "waiting_approval"
  ].includes(productRecommendationTaskStatus);
  const productRecommendationStatus =
    productRecommendationRunStatus === "completed"
      ? "ready"
      : productRecommendationRunStatus === "partial"
        ? "partial"
        : productRecommendationRunStatus === "failed"
          ? "failed"
          : productRecommendationPending || hasNutritionReportRecord
            ? "pending"
            : undefined;
  const foodGapSupportTaskStatus =
    typeof row.food_gap_support_task_status === "string"
      ? row.food_gap_support_task_status
      : "";
  const foodGapSupportPending = [
    "queued",
    "reserved",
    "running",
    "needs_review",
    "waiting_approval"
  ].includes(foodGapSupportTaskStatus);
  const foodGapSupportStatus =
    storedFoodGapSupport
      ? "ready"
      : foodGapSupportTaskStatus === "failed"
        ? "failed"
        : foodGapSupportPending || productRecommendationStatus === "pending"
          ? "pending"
          : undefined;
  const productRecommendationGeneratedAt =
    row.product_recommendation_generated_at instanceof Date
      ? row.product_recommendation_generated_at.toISOString()
      : row.product_recommendation_generated_at
        ? new Date(row.product_recommendation_generated_at).toISOString()
        : undefined;
  const productRecommendationStackPreference =
    asProductStackPreference(row.product_recommendation_stack_preference);
  const productRecommendationTaskStackPreference =
    asProductStackPreference(row.product_recommendation_task_stack_preference);
  const productRecommendationTaskRefreshReason =
    asProductRecommendationRefreshReason(
      row.product_recommendation_task_refresh_reason
    );
  const productRecommendationTaskCreatedMs = dateMsFromUnknown(
    row.product_recommendation_task_created_at
  );
  const productRecommendationRefreshActiveFor = (
    stackPreference: ProductStackPreference,
    generatedAt: unknown
  ) => {
    if (!productRecommendationPending) {
      return false;
    }

    if (
      productRecommendationTaskStackPreference &&
      productRecommendationTaskStackPreference !== stackPreference
    ) {
      return false;
    }

    const generatedMs = dateMsFromUnknown(generatedAt);

    return (
      generatedMs === null ||
      productRecommendationTaskCreatedMs === null ||
      productRecommendationTaskCreatedMs >= generatedMs
    );
  };
  const productRecommendationRefreshing =
    productRecommendationStatus
      ? productRecommendationRefreshActiveFor(
          productRecommendationStackPreference ?? "balanced",
          productRecommendationGeneratedAt
        )
      : false;
  const productRecommendationOptions = (
    includeProductPayloads
      ? productPayloads.options
      : asArray<Record<string, unknown>>(row.product_recommendation_options_payload)
  )
    .flatMap((option): ProductRecommendationOption[] => {
      const stackPreference = asProductStackPreference(option.stackPreference);
      const optionRecommendations = asArray<RecommendedProduct>(
        option.recommendations
      );
      const diagnostics = option.diagnostics;
      const retailerOptions = asArray<Record<string, unknown>>(
        asRecord(diagnostics).retailerOptions
      );
      const optionRunStatus =
        typeof option.status === "string" ? option.status : "";
      const optionStatus =
        optionRunStatus === "completed"
          ? "ready"
          : optionRunStatus === "partial"
            ? "partial"
            : optionRunStatus === "failed"
              ? "failed"
              : undefined;

      if (!stackPreference || !optionStatus) {
        return [];
      }

      const coverage = reconcileProductRecommendationCoverage({
        foodGuidance,
        rawNeedCoverage: productNeedCoverageFromDiagnostics(diagnostics),
        recommendations: optionRecommendations,
        supplementBreakdown
      });
      const generatedAt =
        option.generatedAt instanceof Date
          ? option.generatedAt.toISOString()
          : option.generatedAt
            ? new Date(option.generatedAt as string).toISOString()
            : undefined;
      const maxProducts = Number(option.maxProducts);
      const optionRefreshing = productRecommendationRefreshActiveFor(
        stackPreference,
        generatedAt
      );

      return [{
        id: stackPreference,
        ...(Number.isFinite(maxProducts) && maxProducts > 0
          ? { maxProducts }
          : {}),
        productRecommendations: {
          ...(generatedAt ? { generatedAt } : {}),
          matchedCount: coverage.recommendations.length,
          needsCount:
            coverage.needCoverage.length ||
            Number(option.needsCount) ||
            0,
          ...(typeof option.notes === "string" && option.notes.trim()
            ? { notes: option.notes.trim() }
            : {}),
          ...(typeof option.runId === "string" ? { runId: option.runId } : {}),
          ...(optionRefreshing
            ? {
                refreshing: true,
                ...(productRecommendationTaskRefreshReason
                  ? { refreshReason: productRecommendationTaskRefreshReason }
                  : {})
              }
            : {}),
          ...(coverage.needCoverage.length > 0
            ? { needCoverage: coverage.needCoverage }
            : {}),
          stackCoveragePercent:
            coverage.needCoverage.length > 0
              ? coverage.stackCoveragePercent
              : Number(option.stackCoveragePercent) || 0,
          stackPreference,
          status: optionStatus
        },
        recommendations: coverage.recommendations,
        retailerOptions: retailerOptions.map((retailerOption) => ({
          backorderCount: numberFromUnknown(retailerOption.backorderCount),
          currency:
            typeof retailerOption.currency === "string"
              ? retailerOption.currency
              : null,
          dispatchCity:
            typeof retailerOption.dispatchCity === "string"
              ? retailerOption.dispatchCity
              : null,
          etaDate:
            typeof retailerOption.etaDate === "string"
              ? retailerOption.etaDate
              : null,
          organisationId:
            typeof retailerOption.organisationId === "string"
              ? retailerOption.organisationId
              : null,
          organisationName:
            typeof retailerOption.organisationName === "string"
              ? retailerOption.organisationName
              : null,
          productCount: numberFromUnknown(retailerOption.productCount),
          subtotalAmount: numberFromUnknown(retailerOption.subtotalAmount),
          supplementProductCoveragePercent:
            numberFromUnknown(retailerOption.supplementProductCoveragePercent),
          totalPlanCoveragePercent:
            numberFromUnknown(retailerOption.totalPlanCoveragePercent),
          unavailableReason:
            typeof retailerOption.unavailableReason === "string"
              ? retailerOption.unavailableReason
              : null
        }))
      }];
    });
  const nutritionReport =
    hasNutritionReportRecord
      ? ({
          ...nutritionReportRecord,
          generatedAt:
            row.nutrition_report_generated_at instanceof Date
              ? row.nutrition_report_generated_at.toISOString()
              : row.nutrition_report_generated_at
                ? new Date(row.nutrition_report_generated_at).toISOString()
                : undefined,
          planId,
          version:
            typeof row.nutrition_report_version === "number"
              ? row.nutrition_report_version
              : undefined
        } as NutritionReport)
      : null;
  const generatedDates = [row.generated_at, row.food_guidance_generated_at]
    .filter(Boolean)
    .map((value) => (value instanceof Date ? value : new Date(value)))
    .filter((date) => Number.isFinite(date.getTime()));
  const generatedAt = (
    generatedDates.length > 0
      ? new Date(Math.max(...generatedDates.map((date) => date.getTime())))
      : row.assessment_updated_at instanceof Date
        ? row.assessment_updated_at
        : new Date(row.assessment_updated_at)
  ).toISOString();
  const supplementsReady = Boolean(row.formulation);
  const foodsReady = Boolean(row.food_guidance);
  const reportTaskStatus =
    typeof row.report_task_status === "string" ? row.report_task_status : "";
  const refinementTaskStatus =
    typeof row.refinement_task_status === "string"
      ? row.refinement_task_status
      : "";
  const refinementPending = [
    "queued",
    "reserved",
    "running",
    "needs_review",
    "waiting_approval"
  ].includes(refinementTaskStatus);
  const reportStatus =
    refinementPending
      ? "pending"
      : nutritionReport
      ? "ready"
      : [
          "queued",
          "reserved",
          "running",
          "needs_review",
          "waiting_approval"
        ].includes(reportTaskStatus)
        ? "pending"
        : reportTaskStatus === "failed"
          ? "failed"
          : undefined;

  const result = {
    access:
      mode === "preview" || isExampleFormulationModelVersion(row.model_version)
        ? "preview"
        : "full",
    assessmentSummary: buildAssessmentSummary({
      answers: row.answers,
      locale,
      plan
    }),
    catalogueProductCount: Math.max(
      0,
      Number(row.approved_product_count) || 0
    ),
    catalogueSupplementCount: Math.max(
      0,
      Number(row.active_supplement_count) || 0
    ),
    generatedAt,
    firstName,
    planId,
    nutritionReport,
    ...(productRecommendationStatus
      ? {
          productRecommendations: {
            ...(productRecommendationGeneratedAt
              ? { generatedAt: productRecommendationGeneratedAt }
              : {}),
            matchedCount: recommendations.length,
            needsCount:
              productNeedCoverage.length ||
              Number(row.product_recommendation_needs_count) ||
              0,
            ...(typeof row.product_recommendation_notes === "string" &&
            row.product_recommendation_notes.trim()
              ? { notes: row.product_recommendation_notes.trim() }
              : {}),
            ...(typeof row.product_recommendation_run_id === "string"
              ? { runId: row.product_recommendation_run_id }
              : {}),
            ...(productRecommendationStackPreference
              ? { stackPreference: productRecommendationStackPreference }
              : {}),
            ...(productRecommendationRefreshing
              ? {
                  refreshing: true,
                  ...(productRecommendationTaskRefreshReason
                    ? { refreshReason: productRecommendationTaskRefreshReason }
                    : {})
                }
              : {}),
            ...(productNeedCoverage.length > 0
              ? { needCoverage: productNeedCoverage }
              : {}),
            stackCoveragePercent: productStackCoveragePercent,
            status: productRecommendationStatus
          }
        }
      : {}),
    ...(productRecommendationOptions.length > 0
      ? { productRecommendationOptions }
      : {}),
    recommendations: reconciledRecommendations,
    schemaVersion: 1,
    sectionStatuses: {
      ...(foodGapSupportStatus ? { foodSupport: foodGapSupportStatus } : {}),
      foods: foodsReady && !refinementPending ? "ready" : "pending",
      ...(reportStatus ? { report: reportStatus } : {}),
      supplements: supplementsReady && !refinementPending ? "ready" : "pending"
    },
    ...(safetySummary ? { safetySummary } : {}),
    ...(foodSafetySummary ? { foodSafetySummary } : {}),
    ...(cautions.length > 0 ? { cautions } : {}),
    ...(marketingPoints.length > 0 ? { marketingPoints } : {}),
    ...(storedFoodGapSupport ? { foodGapSupport: storedFoodGapSupport } : {}),
    foodGuidance,
    supplementBreakdown
  } satisfies FormulationResult;

  return mode === "preview" ? toFreePreviewFormulationResult(result) : result;
}
