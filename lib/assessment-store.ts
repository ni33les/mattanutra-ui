import type postgres from "postgres";
import { healthScoreAnalysisStatusFromTaskStatuses } from "@/lib/assessment-status";
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
  type FoodGuidanceItem,
  type FormulationIngredient,
  type FormulationResult,
  type MarketingPoint,
  type NutritionReport,
  type ProductNeedCoverage,
  type RecommendedProduct
} from "@/lib/formulation-types";
import {
  buildProductNeeds,
  type ProductRecommendationNeed
} from "@/lib/product-recommendations";
import { getSql } from "@/lib/db";

export type StoredAssessmentStatus =
  | "captured"
  | "failed"
  | "preparing"
  | "queued"
  | "ready";

type PersistAssessmentInput = Readonly<{
  answers?: unknown;
  locale?: unknown;
  selectedPlan?: AssessmentPlan | null;
  snapshot: AssessmentSnapshot;
  status: StoredAssessmentStatus;
}>;

let schemaReady: Promise<void> | null = null;

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeLocale(locale: unknown) {
  return locale === "th" ? "th" : "en";
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

export function hasHealthScoreAdvice(value: unknown) {
  const advice = asRecord(asRecord(value).advice);
  const overview = advice.overview;

  return (
    Boolean(overview && typeof overview === "object") ||
    Array.isArray(advice.paywallFeatures)
  );
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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

      if (!id || !displayName || !itemType || !Number.isFinite(coveragePercent)) {
        return null;
      }

      return {
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
  coverageLookup: ReadonlyMap<string, number>
) {
  return needs
    .filter(
      (need): need is ProductRecommendationNeed & {
        itemType: "food" | "supplement";
      } => need.itemType === "food" || need.itemType === "supplement"
    )
    .map((need) => ({
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
    } satisfies ProductNeedCoverage));
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

function reconcileProductRecommendationCoverage(input: Readonly<{
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

  if (input.rawNeedCoverage.length < 1) {
    addRecommendationCoverageFallback(coverageLookup, input.recommendations);
  }
  const needCoverage = currentNeedCoverage(currentNeeds, coverageLookup);
  const productNeeds = currentNeeds.filter((need) => need.itemType === "supplement");
  const stackCoveragePercent = weightedCoveragePercent(productNeeds, coverageLookup);

  return {
    needCoverage,
    recommendations: input.recommendations.map((recommendation) => {
      const matchedNeeds = productNeeds.filter((need) =>
        recommendationMatchesNeed(recommendation, need)
      );
      const contributionPercent = weightedContributionPercent(
        matchedNeeds,
        productNeeds,
        coverageLookup
      );
      const displayPercent =
        contributionPercent > 0
          ? contributionPercent
          : Math.min(100, Math.max(0, Math.round(recommendation.productCoveragePercent ?? 0)));

      return {
        ...recommendation,
        productCoveragePercent: displayPercent,
        stackContributionPercent: displayPercent,
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

  return {
    age: scalarOrNull(record.age),
    budget: scalarOrNull(record.budget),
    country: scalarOrNull(record.country),
    goals: Array.isArray(record.goals) ? record.goals : [],
    medications: scalarOrNull(record.meds),
    pills: scalarOrNull(record.pills),
    sex: scalarOrNull(record.sex),
    symptoms: Array.isArray(record.symptoms) ? record.symptoms : []
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

export async function persistAssessmentSubmission({
  answers,
  locale,
  selectedPlan,
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

  if (!snapshot.healthScore) {
    throw new Error("Assessment snapshot must include backend HealthScore");
  }

  await ensureAssessmentSchema();

  await sql`
    insert into assessments (
      plan_id,
      locale,
      selected_plan,
      status,
      answers,
      answer_summary,
      health_score,
      queue_position,
      plan_selected_at,
      processing_started_at,
      completed_at,
      updated_at
    )
    values (
      ${snapshot.planId}::uuid,
      ${normalizeLocale(locale)},
      ${toStoredPlan(selectedPlan)},
      ${status},
      ${sql.json(toJsonValue(answers))},
      ${sql.json(toJsonValue(buildAnswerSummary(answers)))},
      ${sql.json(toJsonValue(snapshot.healthScore))},
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
            'generate_supplement_guidance',
            'generate_food_guidance',
            'generate_example_supplement_guidance',
            'generate_example_food_guidance'
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

  await ensureAssessmentSchema();

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

  const hasAdvice = hasHealthScoreAdvice(healthScore);
  const taskRows = hasAdvice
    ? []
    : await sql<{ status: string }[]>`
        select status::text
        from public.tasks
        where plan_id = ${planId}::uuid
          and task_type = 'analyze_healthscore'
        order by created_at desc
        limit 20
      `;
  const analysisStatus = healthScoreAnalysisStatusFromTaskStatuses(
    hasAdvice,
    taskRows.map((task) => task.status)
  );

  return createHealthScoreAnalysisSnapshot({
    healthScore: healthScore as NonNullable<AssessmentSnapshot["healthScore"]>,
    plan: row.selected_plan,
    planId: row.plan_id,
    status: analysisStatus
  });
}

export async function getStoredAssessmentPrefill(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  await ensureAssessmentSchema();

  const rows = await sql`
    select
      answers,
      health_score,
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
    healthScore:
      typeof healthScore.score === "number"
        ? (healthScore as AssessmentSnapshot["healthScore"])
        : null,
    plan: row.selected_plan ? fromStoredPlan(row.selected_plan) : null,
    planId
  };
}

export async function getStoredFormulationResult(
  planId: string,
  options: Readonly<{
    mode?: "full" | "preview";
  }> = {}
) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const mode = options.mode ?? "full";
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
      product_recommendation_items_payload.recommendations as product_recommendation_items_payload,
      product_recommendation_task.status as product_recommendation_task_status
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
          'generate_food_guidance',
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
        notes,
        generated_at
      from product_recommendation_runs
      where product_recommendation_runs.plan_id = assessments.plan_id
      order by generated_at desc
      limit 1
    ) product_recommendation_run on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'affiliate',
              product_recommendation_items.offer_id is not null,
            'covers',
              coalesce(
                (
                  select jsonb_agg(covered_need.value ->> 'sourceId')
                  from jsonb_array_elements(product_recommendation_items.covered_needs) as covered_need(value)
                ),
                '[]'::jsonb
              ),
            'description',
              coalesce(product_recommendation_items.why, ''),
            'id',
              products.id::text,
            'imageUrl',
              coalesce(
                products.image_url,
                product_recommendation_items.image_url
              ),
            'marketplace',
              case products.platform
                when 'lazada' then 'Lazada Thailand'
                when 'shopee' then 'Shopee Thailand'
                else 'Imported product'
              end,
            'name',
              products.title,
            'price',
              case
                when product_recommendation_items.price_amount is not null
                  and product_recommendation_items.price_amount > 0
                  then jsonb_build_object(
                    'amount',
                      product_recommendation_items.price_amount,
                    'currency',
                      product_recommendation_items.currency
                  )
                else null
              end,
            'priority',
              product_recommendation_items.rank,
            'productCoveragePercent',
              product_recommendation_items.product_coverage_percent,
            'productId',
              products.id::text,
            'rank',
              product_recommendation_items.rank,
            'recommendationRunId',
              product_recommendation_items.run_id::text,
            'stackContributionPercent',
              product_recommendation_items.stack_contribution_percent,
            'stackCoveragePercent',
              product_recommendation_run.stack_coverage_percent,
            'tag',
              case
                when product_recommendation_items.offer_id is not null
                  then 'Best match + affiliate'
                else 'Best match'
              end,
            'url',
              product_recommendation_items.url_used
          )
          order by product_recommendation_items.rank
        ),
        '[]'::jsonb
      ) as recommendations
      from product_recommendation_items
      join products
        on products.id = product_recommendation_items.product_id
      where product_recommendation_run.id is not null
        and product_recommendation_items.run_id = product_recommendation_run.id
    ) product_recommendation_items_payload on true
    left join lateral (
      select status
      from tasks
      where tasks.plan_id = assessments.plan_id
        and task_type = 'generate_product_recommendations'
      order by created_at desc
      limit 1
    ) product_recommendation_task on true
    where assessments.plan_id = ${planId}::uuid
      ${assessmentAccessFilter}
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  if (mode === "preview" && (!row.formulation || !row.food_guidance)) {
    return null;
  }

  const locale = normalizeLocale(row.locale);
  const plan = fromStoredPlan(row.selected_plan);
  const storedFormulation = asRecord(row.formulation);
  const storedFoodGuidanceRecord = asRecord(row.food_guidance);
  const storedSupplementBreakdown = asArray<FormulationIngredient>(
    storedFormulation.supplementBreakdown ?? storedFormulation.formula
  );
  const marketingPoints = asArray<MarketingPoint>(
    storedFormulation.marketingPoints
  );
  const storedFoodGuidance = asArray<FoodGuidanceItem>(
    storedFoodGuidanceRecord.foodGuidance
  );
  const reconciledSafety = await reconcileResolvedSafetyReviewFlags(
    sql,
    planId,
    {
      foodGuidance: storedFoodGuidance,
      foodSafetySummary: safetySummaryFromRecord(
        storedFoodGuidanceRecord.foodSafetySummary
      ),
      safetySummary: safetySummaryFromRecord(storedFormulation.safetySummary),
      supplementBreakdown: storedSupplementBreakdown
    }
  );
  const supplementBreakdown = reconciledSafety.supplementBreakdown;
  const foodGuidance = reconciledSafety.foodGuidance;
  const safetySummary = reconciledSafety.safetySummary;
  const foodSafetySummary = reconciledSafety.foodSafetySummary;

  const legacyRecommendations = asArray<RecommendedProduct>(
    row.recommendations
  );
  const productRecommendationItems = asArray<RecommendedProduct>(
    row.product_recommendation_items_payload
  );
  const recommendations =
    productRecommendationItems.length > 0
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
  const productRecommendationGeneratedAt =
    row.product_recommendation_generated_at instanceof Date
      ? row.product_recommendation_generated_at.toISOString()
      : row.product_recommendation_generated_at
        ? new Date(row.product_recommendation_generated_at).toISOString()
        : undefined;
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
    generatedAt,
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
            ...(productNeedCoverage.length > 0
              ? { needCoverage: productNeedCoverage }
              : {}),
            stackCoveragePercent: productStackCoveragePercent,
            status: productRecommendationStatus
          }
        }
      : {}),
    recommendations: reconciledRecommendations,
    schemaVersion: 1,
    sectionStatuses: {
      foods: foodsReady && !refinementPending ? "ready" : "pending",
      ...(reportStatus ? { report: reportStatus } : {}),
      supplements: supplementsReady && !refinementPending ? "ready" : "pending"
    },
    ...(safetySummary ? { safetySummary } : {}),
    ...(foodSafetySummary ? { foodSafetySummary } : {}),
    ...(marketingPoints.length > 0 ? { marketingPoints } : {}),
    foodGuidance,
    supplementBreakdown
  } satisfies FormulationResult;

  return mode === "preview" ? toFreePreviewFormulationResult(result) : result;
}
