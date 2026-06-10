import { normalizeAssessmentPlan, type AssessmentPlan } from "@/lib/assessment-snapshot";
import {
  isUuid,
  reconcileResolvedSafetyReviewFlags
} from "@/lib/assessment-store";
import type { CanonicalSupplementOption } from "@/lib/canonical-supplements";
import { getSql } from "@/lib/db";
import { appendAssessmentVersion } from "@/lib/domain-versions";
import { firstNameFromAssessmentAnswers } from "@/lib/assessment-first-name";
import type {
  FoodGuidanceBlueprint,
  FormulationBlueprint,
  PlanGuidanceAdjustment,
  PlanFeedbackItem,
  PlanChatMessage
} from "@/lib/formulation-types";
import type { HealthScoreResult } from "@/lib/health-score";
import {
  buildExampleEmailHtml,
  buildExampleEmailSubject
} from "@/lib/example-email";
import { isLocale, publicLocales, type Locale } from "@/lib/i18n";
import {
  getProductRecommendationCandidates,
  getRetailerAwareProductRecommendationCandidateSets,
  type ProductRecommendationRetailerCandidateSet
} from "@/lib/admin-products";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import { loadActivePlanFeedback } from "@/lib/plan-feedback";
import { loadActivePlanGuidanceAdjustments } from "@/lib/plan-guidance-adjustments";
import {
  buildProductSearchQueries,
  buildProductNeeds,
  normalizeProductStackPreference,
  productFactAliasKeys,
  productKeysMatch,
  type ProductCandidate,
  type ProductClientSex,
  type ProductRecommendationClientContext,
  type ProductRecommendationNeed,
  type ProductStackPreference
} from "@/lib/product-recommendations";
import type {
  FoodGapProductVariant,
  ManagedFoodCatalogItem
} from "@/lib/food-gap-support";
import {
  buildReassessmentEmailHtml,
  buildReassessmentEmailSubject
} from "@/lib/reassessment-email";
import {
  adminCommunicationEventKeys,
  type AdminCommunicationChannelType,
  type AdminCommunicationEventKey
} from "@/lib/communications";
import {
  isRetailAgentExecutableTaskType,
  type RetailAgentExecutableTaskType
} from "@/lib/retail-task-policy";
import type { TaskRecord } from "@/lib/task-service";
import { isPregenerationSource } from "@/lib/task-worker";

const EMPTY_FOOD_GUIDANCE: FoodGuidanceBlueprint = {
  foodGuidance: []
};

export type HealthScoreWorkItem = Readonly<{
  answers: unknown;
  healthScore: HealthScoreResult;
  locale: Locale;
  planId: string;
  taskId: string;
  taskType: "analyze_healthscore";
}>;

export type FormulationWorkItem = Readonly<{
  answers: unknown;
  canonicalSupplements: CanonicalSupplementOption[];
  chatMessages: PlanChatMessage[];
  locale: Locale;
  plan: AssessmentPlan;
  planFeedback: PlanFeedbackItem[];
  planId: string;
  previousFoodGuidance: FoodGuidanceBlueprint | null;
  previousFormulation: FormulationBlueprint | null;
  requestId?: string;
  taskId: string;
  taskType: "generate_example_supplement_guidance" | "generate_supplement_guidance";
}>;

export type FoodGuidanceWorkItem = Readonly<{
  answers: unknown;
  chatMessages: PlanChatMessage[];
  locale: Locale;
  plan: AssessmentPlan;
  planFeedback: PlanFeedbackItem[];
  planId: string;
  previousFoodGuidance: FoodGuidanceBlueprint | null;
  previousFormulation: FormulationBlueprint | null;
  taskId: string;
  taskType: "generate_food_guidance";
}>;

export type FoodGapSupportWorkItem = Readonly<{
  answers: unknown;
  chatMessages: PlanChatMessage[];
  locale: Locale;
  managedFoods: ManagedFoodCatalogItem[];
  plan: AssessmentPlan;
  planFeedback: PlanFeedbackItem[];
  planId: string;
  previousFoodGuidance: FoodGuidanceBlueprint | null;
  previousFormulation: FormulationBlueprint | null;
  productVariants: FoodGapProductVariant[];
  taskId: string;
  taskType: "generate_food_gap_guidance";
}>;

export type ExampleEmailWorkItem = Readonly<{
  email: string;
  html: string;
  locale: Locale;
  metadata: Record<string, unknown>;
  planId: string;
  requestId: string;
  subject: string;
  to: string;
  taskType: "send_example_email";
  unsubscribeToken: string | null;
}>;

export type ReassessmentEmailWorkItem = Readonly<{
  cronId: string;
  email: string;
  html: string;
  locale: Locale;
  metadata: Record<string, unknown>;
  planId: string;
  recurrenceDays: number;
  subject: string;
  to: string;
  taskType: "send_reassessment_email";
  unsubscribeToken: string;
}>;

export type RetailOrderWorkflowEmailWorkItem = Readonly<{
  event:
    | "awaiting_stock"
    | "cancelled"
    | "confirmed"
    | "delivered"
    | "returned"
    | "shipped";
  locale: Locale;
  orderId: string;
  paymentId: string | null;
  planId: string | null;
  taskId: string;
  taskType: "send_retail_order_workflow_email";
}>;

export type AdminCommunicationRouteWorkItem = Readonly<{
  body: string | null;
  channelType: AdminCommunicationChannelType | null;
  eventKey: AdminCommunicationEventKey;
  metadata: Record<string, unknown>;
  organisationId: string;
  resourceId: string | null;
  resourceType: string | null;
  subject: string | null;
  taskId: string;
  taskType: "route_admin_communication";
}>;

export type CommunicationDispatchWorkItem = Readonly<{
  messageId: string;
  organisationId: string;
  taskId: string;
  taskType: "dispatch_chat_communication_message" | "dispatch_email_communication_message";
}>;

export type CarrierShipmentWorkItem = Readonly<{
  carrierId: string | null;
  eventId: string | null;
  orderId: string | null;
  shipmentId: string | null;
  taskId: string;
  taskType:
    | "carrier_event_process"
    | "carrier_label_generate"
    | "carrier_pickup_book"
    | "carrier_shipment_create"
    | "carrier_tracking_sync";
}>;

export type CommunicationFollowupWorkItem = Readonly<{
  body: string;
  metadata: Record<string, unknown>;
  payload: Record<string, unknown>;
  planId: string | null;
  safetyReviewIds: string[];
  subject: string;
  taskId: string;
  taskType: "client_safety_followup";
}>;

export type CustomerChatReplyWorkItem = Readonly<{
  chatMessages: PlanChatMessage[];
  communicationMessageId: string | null;
  customer: Readonly<{
    firstName: string | null;
    locale: Locale;
  }>;
  entitlement: "living_protocol" | "paid_plan" | "unpaid";
  order: Readonly<{
    currency: string | null;
    orderId: string | null;
    orderNumber: string | null;
    status: string | null;
    totalAmount: number | null;
    trackingUrl: string | null;
  }> | null;
  plan: Readonly<{
    answerSummary: unknown;
    healthScore: unknown;
    selectedPlan: string | null;
    status: string | null;
  }>;
  planId: string;
  taskId: string;
  taskType: "customer_chat_reply";
  userMessage: string;
}>;

export type ContentStatusChangeWorkItem = Readonly<{
  contentId: string;
  contentType: "blog_post" | "testimonial";
  payload: Record<string, unknown>;
  targetStatus: "archived" | "draft" | "published" | "review";
  taskType: "content_status_change";
}>;

export type DigitalOceanBillingSyncWorkItem = Readonly<{
  projectNames: string[];
  taskId: string;
  taskType: "sync_digitalocean_billing";
}>;

export type NutritionPlanChatWorkItem = Readonly<{
  answers: unknown;
  chatMessages: PlanChatMessage[];
  firstName?: string | null;
  foodGuidance: FoodGuidanceBlueprint | null;
  formulation: FormulationBlueprint | null;
  guidanceAdjustments: PlanGuidanceAdjustment[];
  healthScore?: HealthScoreResult | null;
  locale: Locale;
  messageId: string;
  plan: AssessmentPlan;
  planFeedback: PlanFeedbackItem[];
  planId: string;
  taskId: string;
  taskType: "nutrition_plan_chat_reply";
  userMessage: string;
}>;

export type NutritionReportWorkItem = Readonly<{
  answers: unknown;
  chatMessages: PlanChatMessage[];
  firstName?: string | null;
  foodGuidance: FoodGuidanceBlueprint;
  formulation: FormulationBlueprint;
  guidanceAdjustments: PlanGuidanceAdjustment[];
  healthScore?: HealthScoreResult | null;
  locale: Locale;
  plan: AssessmentPlan;
  planFeedback: PlanFeedbackItem[];
  planId: string;
  taskId: string;
  taskType: "generate_nutrition_report";
}>;

export type NutritionPlanRefinementWorkItem = Readonly<{
  planId: string;
  refinementHash: string;
  taskId: string;
  taskType: "refine_nutrition_plan";
}>;

export type ProductRecommendationsWorkItem = Readonly<{
  candidates: ProductCandidate[];
  candidateLoadMs?: number;
  clientContext: ProductRecommendationClientContext;
  clientSex: ProductClientSex | null;
  countryCode: string;
  needs: ProductRecommendationNeed[];
  retailerCandidateSets: ProductRecommendationRetailerCandidateSet[];
  planId: string;
  searchQueries: string[];
  stackPreference: ProductStackPreference;
  taskId: string;
  taskType: "generate_product_recommendations";
}>;

export type ProductFdaApprovalSourcingWorkItem = Readonly<{
  includeManufacturerEvidence: boolean;
  limit: number;
  maxRunMs: number;
  productId: string | null;
  taskId: string;
  taskType: "source_product_fda_approvals";
}>;

export type ProductIdentifierSourcingWorkItem = Readonly<{
  limit: number;
  productId: string | null;
  taskId: string;
  taskType: "source_product_identifiers";
}>;

export type RetailStockForecastWorkItem = Readonly<{
  organisationId: string;
  productId: string | null;
  source: string | null;
  stockId: string | null;
  taskId: string;
  taskType: "retail_stock_forecast_refresh";
}>;

export type RetailOperationsReviewWorkItem = Readonly<{
  organisationId: string;
  payload: Record<string, unknown>;
  sourceEntityId: string | null;
  sourceEntityType: string | null;
  taskId: string;
  taskType: Exclude<
    RetailAgentExecutableTaskType,
    "retail_stock_forecast_refresh"
  >;
}>;

export type TaskWorkItem =
  | CarrierShipmentWorkItem
  | CommunicationFollowupWorkItem
  | ContentStatusChangeWorkItem
  | CustomerChatReplyWorkItem
  | DigitalOceanBillingSyncWorkItem
  | ExampleEmailWorkItem
  | FoodGapSupportWorkItem
  | FoodGuidanceWorkItem
  | FormulationWorkItem
  | HealthScoreWorkItem
  | NutritionPlanChatWorkItem
  | NutritionPlanRefinementWorkItem
  | NutritionReportWorkItem
  | ProductFdaApprovalSourcingWorkItem
  | ProductIdentifierSourcingWorkItem
  | ProductRecommendationsWorkItem
  | AdminCommunicationRouteWorkItem
  | CommunicationDispatchWorkItem
  | RetailOrderWorkflowEmailWorkItem
  | RetailStockForecastWorkItem
  | RetailOperationsReviewWorkItem
  | ReassessmentEmailWorkItem
  | Readonly<{
      originalTaskType: string;
      payload: unknown;
      planId: string | null;
      taskType: "unknown_task";
    }>;

function payloadRecord(payload: unknown) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function productClientSexFromAnswers(value: unknown): ProductClientSex | null {
  const record = payloadRecord(value);

  return record.sex === "female" || record.sex === "male" ? record.sex : null;
}

function productCountryCodeFromAnswers(value: unknown) {
  const record = payloadRecord(value);

  return normalizeProductCountryCode(record.country) ?? defaultProductCountryCode;
}

function textFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return Array.isArray(value)
    ? value.filter((item): item is string =>
        typeof item === "string" && item.trim().length > 0
      )
    : [];
}

function productRecommendationClientContextFromPlan(
  answers: unknown,
  planFeedback: readonly PlanFeedbackItem[],
  guidanceAdjustments: readonly PlanGuidanceAdjustment[]
): ProductRecommendationClientContext {
  const record = payloadRecord(answers);
  const cautions = [
    ...stringArrayFromRecord(record, "suppAllergies"),
    textFromRecord(record, "kidney"),
    textFromRecord(record, "liver"),
    textFromRecord(record, "surgery"),
    textFromRecord(record, "antibiotics"),
    textFromRecord(record, "digCondition")
  ].filter((item): item is string => Boolean(item) && item !== "none" && item !== "normal" && item !== "no");
  const lifestage = [
    textFromRecord(record, "reproStatus"),
    textFromRecord(record, "menopause"),
    textFromRecord(record, "flow")
  ].filter(Boolean).join("/");

  return {
    budgetPreference: textFromRecord(record, "budget"),
    conditions: cautions,
    currentSupplements: textFromRecord(record, "supplements"),
    guidanceAdjustmentCount: guidanceAdjustments.length,
    lifestage: lifestage || null,
    medicationTypes: stringArrayFromRecord(record, "medTypes"),
    medications: textFromRecord(record, "meds"),
    pillLimit: textFromRecord(record, "maxPills"),
    planFeedbackTypes: [
      ...new Set(
        planFeedback
          .map((item) => item.feedbackType)
          .filter((item): item is PlanFeedbackItem["feedbackType"] => Boolean(item))
      )
    ],
    preferredForm: textFromRecord(record, "form")
  };
}

function payloadText(payload: unknown, key: string) {
  const value = payloadRecord(payload)[key];

  return typeof value === "string" ? value : "";
}

function payloadBoolean(payload: unknown, key: string, fallback = false) {
  const value = payloadRecord(payload)[key];

  return typeof value === "boolean" ? value : fallback;
}

function payloadNumber(
  payload: unknown,
  key: string,
  fallback: number,
  min: number,
  max: number
) {
  const value = Number(payloadRecord(payload)[key]);

  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

function payloadTextArray(payload: unknown, key: string) {
  const value = payloadRecord(payload)[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function newUnsubscribeToken() {
  return crypto.randomUUID();
}

function recurrenceDays(value: unknown) {
  const days = Number(value ?? 60);

  return Number.isFinite(days) && days > 0 ? days : 60;
}

function safetyFollowupItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => payloadRecord(item))
    .map((item) => ({
      clientDose: typeof item.clientDose === "string" ? item.clientDose : null,
      decision: payloadText(item, "decision") || "reviewed",
      safetyReviewId: payloadText(item, "safetyReviewId") || null,
      supplementName: payloadText(item, "supplementName") || "your supplement"
    }));
}

function safetyFollowupMessage(input: Readonly<{
  clientDose?: string | null;
  decision: string;
  reviewedItems?: ReturnType<typeof safetyFollowupItems>;
  supplementName: string;
}>) {
  const reviewedItems = input.reviewedItems ?? [];

  if (reviewedItems.length > 1) {
    const summary = reviewedItems
      .map((item) => {
        if (item.decision === "approve") {
          return item.clientDose
            ? `${item.supplementName} approved at ${item.clientDose}`
            : `${item.supplementName} approved`;
        }

        if (item.decision === "disapprove") {
          return `${item.supplementName} removed`;
        }

        return `${item.supplementName} reviewed`;
      })
      .join("; ");

    return `Your human safety review is complete. We have updated your nutrition plan after reviewing ${reviewedItems.length} supplements: ${summary}.`;
  }

  const singleItem = reviewedItems[0];

  if (singleItem) {
    return safetyFollowupMessage({
      clientDose: singleItem.clientDose,
      decision: singleItem.decision,
      supplementName: singleItem.supplementName
    });
  }

  if (input.decision === "approve") {
    return input.clientDose
      ? `Your human safety review for ${input.supplementName} is complete. The reviewed dose is ${input.clientDose}. Your nutrition plan has been updated.`
      : `Your human safety review for ${input.supplementName} is complete. Your nutrition plan has been updated.`;
  }

  return `Your human safety review for ${input.supplementName} is complete. We have removed that suggestion from your nutrition plan.`;
}

async function buildHealthScoreWorkItem(task: TaskRecord) {
  const sql = getSql();

  if (!sql || !task.planId) {
    throw new Error("HealthScore work item is missing a plan");
  }

  const rows = await sql`
    select answers, health_score, locale
    from public.assessments
    where plan_id = ${task.planId}::uuid
    limit 1
  `;
  const row = rows[0];
  const healthScore = payloadRecord(row?.health_score);

  if (!row || typeof healthScore.score !== "number") {
    throw new Error("Assessment is missing a backend HealthScore");
  }

  return {
    answers: row.answers,
    healthScore: healthScore as HealthScoreResult,
    locale: isLocale(row.locale) ? row.locale : "en",
    planId: task.planId,
    taskId: task.id,
    taskType: "analyze_healthscore"
  } satisfies HealthScoreWorkItem;
}

function taskSource(task: TaskRecord) {
  const payload = payloadRecord(task.payload);
  const context = payloadRecord(task.context);

  return payloadText(payload, "source") || payloadText(context, "source");
}

function taskPlanOverride(task: TaskRecord): AssessmentPlan | null {
  const payloadPlan = payloadText(task.payload, "plan");

  return payloadPlan === "pro" || payloadPlan === "precision"
    ? payloadPlan
    : null;
}

async function buildFormulationWorkItem(task: TaskRecord) {
  const sql = getSql();

  if (!sql || !task.planId) {
    throw new Error("Formulation work item is missing a plan");
  }
  const [context, canonicalSupplements] = await Promise.all([
    loadPlanGenerationContext(sql, task.planId, taskPlanOverride(task)),
    loadCanonicalSupplementOptions(sql)
  ]);
  const isBackgroundPregeneration = isPregenerationSource(taskSource(task));

  if (task.taskType === "generate_supplement_guidance" && !isBackgroundPregeneration) {
    await appendAssessmentVersion(sql, {
      actor: task.reservedByAgentId,
      afterPayload: {
        errorMessage: null,
        processingStartedAt: "coalesce_current_or_now",
        queuePosition: 0,
        status: "preparing"
      },
      changeReason: "supplement_guidance_started",
      eventPayload: { taskType: task.taskType },
      eventType: "assessment_status_projection_update",
      planId: task.planId,
      source: "task_work_item",
      taskId: task.id
    });

    await sql`
      update public.assessments set
        status = 'preparing',
        queue_position = 0,
        error_message = null,
        processing_started_at = coalesce(processing_started_at, now()),
        updated_at = now()
      where plan_id = ${task.planId}::uuid
    `;
  }

  return {
    answers: context.answers,
    canonicalSupplements,
    chatMessages: context.chatMessages,
    locale: context.locale,
    plan: context.plan,
    planFeedback: context.planFeedback,
    planId: task.planId,
    previousFoodGuidance: context.foodGuidance,
    previousFormulation: context.formulation,
    requestId: payloadText(task.payload, "requestId") || undefined,
    taskId: task.id,
    taskType: task.taskType as
      | "generate_example_supplement_guidance"
      | "generate_supplement_guidance"
  } satisfies FormulationWorkItem;
}

async function buildFoodGuidanceWorkItem(task: TaskRecord) {
  const sql = getSql();

  if (!sql || !task.planId) {
    throw new Error("Food guidance work item is missing a plan");
  }

  const context = await loadPlanGenerationContext(
    sql,
    task.planId,
    taskPlanOverride(task)
  );

  return {
    answers: context.answers,
    chatMessages: context.chatMessages,
    locale: context.locale,
    plan: context.plan,
    planFeedback: context.planFeedback,
    planId: task.planId,
    previousFoodGuidance: context.foodGuidance,
    previousFormulation: context.formulation,
    taskId: task.id,
    taskType: "generate_food_guidance"
  } satisfies FoodGuidanceWorkItem;
}

function localizedFoodTranslation(
  translations: Record<string, unknown>,
  locale: Locale,
  fallback: Readonly<{
    category: string;
    imageAlt: string;
    name: string;
    primaryUseCase: string | null;
  }>
) {
  const record = payloadRecord(translations[locale]);

  return {
    category: payloadText(record, "category") || fallback.category,
    imageAlt: payloadText(record, "imageAlt") || fallback.imageAlt || fallback.name,
    name: payloadText(record, "name") || fallback.name,
    primaryUseCase:
      payloadText(record, "primaryUseCase") ||
      fallback.primaryUseCase ||
      fallback.category
  };
}

async function loadManagedFoodCatalog(
  sql: NonNullable<ReturnType<typeof getSql>>
): Promise<ManagedFoodCatalogItem[]> {
  const rows = await sql<Array<{
    benefit_tags: string[] | null;
    category: string;
    id: string;
    image_path: string | null;
    name: string;
    normalized_name: string;
    nutrient_tags: string[] | null;
    primary_use_case: string | null;
    translations: unknown;
  }>>`
    select
      foods.id::text,
      foods.name,
      foods.normalized_name,
      foods.category,
      foods.primary_use_case,
      foods.benefit_tags,
      foods.nutrient_tags,
      foods.image_path,
      coalesce(
        jsonb_object_agg(
          food_translations.locale,
          jsonb_build_object(
            'name', food_translations.name,
            'category', food_translations.category,
            'primaryUseCase', food_translations.primary_use_case,
            'imageAlt', food_translations.image_alt
          )
        ) filter (where food_translations.locale = any(${publicLocales}::text[])),
        '{}'::jsonb
      ) as translations
    from public.foods
    left join public.food_translations
      on food_translations.food_id = foods.id
      and food_translations.locale = any(${publicLocales}::text[])
      and food_translations.status = 'complete'
    where foods.is_active = true
      and foods.list_status = 'whitelisted'
      and coalesce(foods.image_path, '') <> ''
    group by foods.id
    order by foods.name
  `;

  return rows.flatMap((row): ManagedFoodCatalogItem[] => {
    if (!row.image_path) {
      return [];
    }

    const translations = payloadRecord(row.translations);
    const fallback = {
      category: row.category || "Other",
      imageAlt: row.name,
      name: row.name,
      primaryUseCase: row.primary_use_case
    };
    const en = localizedFoodTranslation(translations, "en", fallback);
    const th = localizedFoodTranslation(translations, "th", fallback);
    const zhCn = localizedFoodTranslation(translations, "zh-CN", fallback);

    if (!en.name || !th.name || !zhCn.name || !en.imageAlt || !th.imageAlt || !zhCn.imageAlt) {
      return [];
    }

    return [{
      benefitTags: row.benefit_tags ?? [],
      category: row.category,
      foodId: row.id,
      imagePath: row.image_path,
      normalizedName: row.normalized_name,
      nutrientTags: row.nutrient_tags ?? [],
      primaryUseCase: row.primary_use_case,
      translations: { en, th, "zh-CN": zhCn }
    }];
  });
}

function productNeedCoverageFromDiagnostics(value: unknown) {
  const diagnostics = payloadRecord(value);
  const candidates = [
    ...(
      Array.isArray(diagnostics.matchedNeeds)
        ? diagnostics.matchedNeeds
        : []
    ),
    ...(
      Array.isArray(diagnostics.unmatchedNeeds)
        ? diagnostics.unmatchedNeeds
        : []
    )
  ];

  return candidates.flatMap((candidate): FoodGapProductVariant["needCoverage"] => {
    const item = payloadRecord(candidate);
    const id = payloadText(item, "id");
    const displayName = payloadText(item, "displayName");
    const rawItemType = payloadText(item, "itemType");
    const itemType = rawItemType === "food" ? "food" : "supplement";
    const coveragePercent = Number(item.coveragePercent);

    if (!id || !displayName || !Number.isFinite(coveragePercent)) {
      return [];
    }

    return [{
      bestRejectedProductId: payloadText(item, "bestRejectedProductId") || null,
      bestRejectedReason: payloadText(item, "bestRejectedReason") || null,
      coveragePercent,
      displayName,
      id,
      itemType
    }];
  });
}

async function loadFoodGapProductVariants(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planId: string
): Promise<FoodGapProductVariant[]> {
  const rows = await sql<Array<{
    diagnostics: unknown;
    id: string;
    recommendation_count: number;
    stack_coverage_percent: number | string | null;
    stack_preference: string;
  }>>`
    select distinct on (coalesce(diagnostics ->> 'stackPreference', 'balanced'))
      id::text,
      diagnostics,
      coalesce(diagnostics ->> 'stackPreference', 'balanced') as stack_preference,
      stack_coverage_percent,
      (
        select count(*)::int
        from public.product_recommendation_items
        where product_recommendation_items.run_id = product_recommendation_runs.id
      ) as recommendation_count
    from public.product_recommendation_runs
    where product_recommendation_runs.plan_id = ${planId}::uuid
      and product_recommendation_runs.status in ('completed', 'partial')
      and coalesce(diagnostics ->> 'stackPreference', 'balanced') in ('compact', 'balanced')
    order by
      coalesce(diagnostics ->> 'stackPreference', 'balanced'),
      generated_at desc
  `;

  return rows.flatMap((row): FoodGapProductVariant[] => {
    const stackPreference = normalizeProductStackPreference(row.stack_preference);
    const needCoverage = productNeedCoverageFromDiagnostics(row.diagnostics);

    return [{
      needCoverage,
      recommendationCount: Number(row.recommendation_count) || 0,
      runId: row.id,
      stackCoveragePercent: Number(row.stack_coverage_percent) || 0,
      stackPreference
    }];
  });
}

async function buildFoodGapSupportWorkItem(task: TaskRecord) {
  const sql = getSql();

  if (!sql || !task.planId) {
    throw new Error("Food gap support work item is missing a plan");
  }

  const [context, managedFoods, productVariants] = await Promise.all([
    loadPlanGenerationContext(sql, task.planId, taskPlanOverride(task)),
    loadManagedFoodCatalog(sql),
    loadFoodGapProductVariants(sql, task.planId)
  ]);

  return {
    answers: context.answers,
    chatMessages: context.chatMessages,
    locale: context.locale,
    managedFoods,
    plan: context.plan,
    planFeedback: context.planFeedback,
    planId: task.planId,
    previousFoodGuidance: context.foodGuidance,
    previousFormulation: context.formulation,
    productVariants,
    taskId: task.id,
    taskType: "generate_food_gap_guidance"
  } satisfies FoodGapSupportWorkItem;
}

async function buildExampleEmailWorkItem(task: TaskRecord) {
  const sql = getSql();
  const requestId = payloadText(task.payload, "requestId");

  if (!sql || !task.planId || !isUuid(requestId)) {
    throw new Error("Example email work item is missing identifiers");
  }

  const rows = await sql`
    select
      assessment_example_requests.email,
      assessment_example_requests.health_score,
      assessment_example_requests.locale,
      reassessment.cron_id,
      reassessment.unsubscribe_token,
      food_guidance.guidance as food_guidance,
      formulations.formulation
    from public.assessment_example_requests
    join lateral (
      select formulation
      from public.formulations
      where formulations.plan_id = assessment_example_requests.plan_id
      order by version desc, generated_at desc
      limit 1
    ) formulations on true
    left join lateral (
      select guidance
      from public.food_guidance
      where food_guidance.plan_id = assessment_example_requests.plan_id
      order by version desc, generated_at desc
      limit 1
    ) food_guidance on true
    left join lateral (
      select cron.id::text as cron_id, cron.unsubscribe_token
      from public.cron
      where cron.plan_id = assessment_example_requests.plan_id
        and cron.action_type = 'reassessment'
        and cron.status in ('scheduled', 'queued')
        and lower(cron.recipient ->> 'email') = lower(assessment_example_requests.email)
      order by cron.scheduled_for desc, cron.created_at desc
      limit 1
    ) reassessment on true
    where assessment_example_requests.id = ${requestId}::uuid
      and assessment_example_requests.plan_id = ${task.planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Example email request is missing formulation");
  }

  const cronId = typeof row.cron_id === "string" ? row.cron_id : "";
  let unsubscribeToken =
    typeof row.unsubscribe_token === "string" ? row.unsubscribe_token : "";

  if (isUuid(cronId) && !unsubscribeToken) {
    unsubscribeToken = newUnsubscribeToken();
    await sql`
      update public.cron set
        unsubscribe_token = ${unsubscribeToken},
        updated_at = now()
      where id = ${cronId}::uuid
    `;
  }

  const email = typeof row.email === "string" ? row.email : "";
  const formulation = row.formulation as FormulationBlueprint;
  const foodGuidance = row.food_guidance
    ? row.food_guidance as FoodGuidanceBlueprint
    : EMPTY_FOOD_GUIDANCE;
  const healthScore = row.health_score as HealthScoreResult;
  const locale: Locale = isLocale(row.locale) ? row.locale : "en";

  return {
    email,
    html: buildExampleEmailHtml({
      formulation: {
        ...formulation,
        foodGuidance: foodGuidance.foodGuidance ?? []
      },
      healthScore,
      locale,
      planId: task.planId,
      unsubscribeToken: unsubscribeToken || null
    }),
    locale,
    metadata: {
      requestId
    },
    planId: task.planId,
    requestId,
    subject: buildExampleEmailSubject(locale, healthScore),
    to: email,
    taskType: "send_example_email",
    unsubscribeToken: unsubscribeToken || null
  } satisfies ExampleEmailWorkItem;
}

async function buildReassessmentEmailWorkItem(task: TaskRecord) {
  const sql = getSql();
  const cronId = payloadText(task.payload, "cronId");

  if (!sql || !task.planId || !isUuid(cronId)) {
    throw new Error("Reassessment work item is missing identifiers");
  }

  const rows = await sql`
    select payload, recurrence_days, recipient, unsubscribe_token
    from public.cron
    where cron.id = ${cronId}::uuid
      and cron.plan_id = ${task.planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Scheduled reassessment action not found");
  }

  const payload = payloadRecord(row.payload);
  const recipient = payloadRecord(row.recipient);
  const unsubscribeToken =
    typeof row.unsubscribe_token === "string" && row.unsubscribe_token
      ? row.unsubscribe_token
      : newUnsubscribeToken();

  if (row.unsubscribe_token !== unsubscribeToken) {
    await sql`
      update public.cron set
        unsubscribe_token = ${unsubscribeToken},
        updated_at = now()
      where id = ${cronId}::uuid
    `;
  }

  const email = typeof recipient.email === "string" ? recipient.email : "";
  const locale: Locale = isLocale(payload.locale) ? payload.locale : "en";
  const days = recurrenceDays(row.recurrence_days);

  return {
    cronId,
    email,
    html: buildReassessmentEmailHtml({
      locale,
      planId: task.planId,
      unsubscribeToken
    }),
    locale,
    metadata: {
      cronId
    },
    planId: task.planId,
    recurrenceDays: days,
    subject: buildReassessmentEmailSubject(locale),
    to: email,
    taskType: "send_reassessment_email",
    unsubscribeToken
  } satisfies ReassessmentEmailWorkItem;
}

function buildRetailOrderWorkflowEmailWorkItem(
  task: TaskRecord
): RetailOrderWorkflowEmailWorkItem {
  const event = payloadText(task.payload, "event");
  const localePayload = payloadText(task.payload, "locale");
  const orderId =
    payloadText(task.payload, "orderId") || task.sourceEntityId || "";
  const paymentId = payloadText(task.payload, "paymentId") || null;
  const planId = payloadText(task.payload, "planId") || task.planId;

  if (
    event !== "awaiting_stock" &&
    event !== "cancelled" &&
    event !== "confirmed" &&
    event !== "delivered" &&
    event !== "returned" &&
    event !== "shipped"
  ) {
    throw new Error("Retail order email task has an invalid event");
  }

  if (!isUuid(orderId)) {
    throw new Error("Retail order email task is missing an order id");
  }

  return {
    event,
    locale: isLocale(localePayload) ? localePayload : "en",
    orderId,
    paymentId,
    planId,
    taskId: task.id,
    taskType: "send_retail_order_workflow_email"
  };
}

function adminCommunicationChannelType(
  value: string
): AdminCommunicationChannelType | null {
  return value === "email" || value === "line" ? value : null;
}

function buildAdminCommunicationRouteWorkItem(
  task: TaskRecord
): AdminCommunicationRouteWorkItem {
  const payload = payloadRecord(task.payload);
  const eventKey = payloadText(payload, "eventKey");
  const channelType = adminCommunicationChannelType(
    payloadText(payload, "channelType")
  );

  if (!adminCommunicationEventKeys.includes(eventKey as AdminCommunicationEventKey)) {
    throw new Error("Admin communication route task has an invalid event key");
  }

  const targetOrganisationId =
    payloadText(payload, "targetOrganisationId") ||
    payloadText(payload, "organisationId") ||
    task.organisationId;

  if (!isUuid(targetOrganisationId)) {
    throw new Error("Admin communication route task is missing a target organisation");
  }

  return {
    body: textFromRecord(payload, "body"),
    channelType,
    eventKey: eventKey as AdminCommunicationEventKey,
    metadata: payloadRecord(payload.metadata),
    organisationId: targetOrganisationId,
    resourceId: textFromRecord(payload, "resourceId"),
    resourceType: textFromRecord(payload, "resourceType"),
    subject: textFromRecord(payload, "subject"),
    taskId: task.id,
    taskType: "route_admin_communication"
  };
}

function buildCommunicationDispatchWorkItem(
  task: TaskRecord
): CommunicationDispatchWorkItem {
  const messageId = payloadText(task.payload, "messageId") || task.sourceEntityId || "";

  if (!isUuid(messageId)) {
    throw new Error("Communication dispatch task is missing a message id");
  }

  if (!isUuid(task.organisationId)) {
    throw new Error("Communication dispatch task is missing an organisation");
  }

  return {
    messageId,
    organisationId: task.organisationId,
    taskId: task.id,
    taskType: task.taskType as CommunicationDispatchWorkItem["taskType"]
  };
}

function buildCarrierShipmentWorkItem(task: TaskRecord): CarrierShipmentWorkItem {
  const payload = payloadRecord(task.payload);
  const taskType = task.taskType as CarrierShipmentWorkItem["taskType"];

  return {
    carrierId: textFromRecord(payload, "carrierId"),
    eventId: textFromRecord(payload, "eventId"),
    orderId:
      textFromRecord(payload, "orderId") ||
      (task.sourceEntityType === "retail_customer_order" ? task.sourceEntityId : null),
    shipmentId:
      textFromRecord(payload, "shipmentId") ||
      (task.sourceEntityType === "retail_order_shipment" ? task.sourceEntityId : null),
    taskId: task.id,
    taskType
  };
}

function customerEntitlement(selectedPlan: string | null) {
  if (selectedPlan === "pro") {
    return "living_protocol" as const;
  }

  return selectedPlan ? "paid_plan" as const : "unpaid" as const;
}

async function latestCustomerOrderSummary(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planId: string,
  locale: Locale
): Promise<CustomerChatReplyWorkItem["order"]> {
  const readyRows = await sql<Array<{ ready: boolean }>>`
    select to_regclass('public.retail_checkout_payments') is not null as ready
  `;

  if (readyRows[0]?.ready !== true) {
    return null;
  }

  const rows = await sql<Array<{
    amount: number | string | null;
    currency: string | null;
    order_id: string | null;
    order_number: string | null;
    status: string | null;
  }>>`
    select
      retail_checkout_payments.amount,
      retail_checkout_payments.currency,
      retail_customer_orders.id::text as order_id,
      retail_customer_orders.order_number,
      coalesce(retail_customer_orders.status, retail_checkout_payments.status) as status
    from public.retail_checkout_payments
    left join public.retail_customer_orders
      on retail_customer_orders.id = retail_checkout_payments.retail_customer_order_id
    where retail_checkout_payments.plan_id = ${planId}::uuid
    order by retail_checkout_payments.created_at desc
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const amount = Number(row.amount);
  const totalAmount = Number.isFinite(amount) ? amount / 1_000_000 : null;

  return {
    currency: row.currency,
    orderId: row.order_id,
    orderNumber: row.order_number,
    status: row.status,
    totalAmount,
    trackingUrl: row.order_number
      ? `/${locale}/order/track/${encodeURIComponent(row.order_number)}`
      : null
  };
}

async function buildCustomerChatReplyWorkItem(
  task: TaskRecord
): Promise<CustomerChatReplyWorkItem> {
  const sql = getSql();
  const messageId = payloadText(task.payload, "messageId");
  const communicationMessageId = payloadText(task.payload, "communicationMessageId");

  if (!sql || !task.planId || !isUuid(messageId)) {
    throw new Error("Panya chat task is missing identifiers");
  }

  const rows = await sql<Array<{
    answer_summary: unknown;
    body: string | null;
    first_name: string | null;
    health_score: unknown;
    locale: string | null;
    selected_plan: string | null;
    status: string | null;
  }>>`
    select
      plan_chat_messages.body,
      assessments.answer_summary,
      assessments.first_name,
      assessments.health_score,
      assessments.locale,
      assessments.selected_plan::text,
      assessments.status::text
    from public.plan_chat_messages
    join public.assessments
      on assessments.plan_id = plan_chat_messages.plan_id
    where plan_chat_messages.id = ${messageId}::uuid
      and plan_chat_messages.plan_id = ${task.planId}::uuid
      and plan_chat_messages.role = 'user'
    limit 1
  `;
  const row = rows[0];
  const userMessage = row?.body?.trim();

  if (!row || !userMessage) {
    throw new Error("Panya chat message was not found");
  }

  const locale: Locale = isLocale(row.locale) ? row.locale : "en";
  const chatRows = await sql<Array<{
    body: string;
    created_at: Date | string;
    id: string;
    role: "assistant" | "user";
    status: "failed" | "queued" | "ready";
  }>>`
    select id::text, role, body, status, created_at
    from public.plan_chat_messages
    where plan_id = ${task.planId}::uuid
    order by created_at asc
    limit 30
  `;

  return {
    chatMessages: chatRows.map(mapChatMessage),
    communicationMessageId: isUuid(communicationMessageId)
      ? communicationMessageId
      : null,
    customer: {
      firstName: row.first_name,
      locale
    },
    entitlement: customerEntitlement(row.selected_plan),
    order: await latestCustomerOrderSummary(sql, task.planId, locale),
    plan: {
      answerSummary: row.answer_summary ?? null,
      healthScore: row.health_score ?? null,
      selectedPlan: row.selected_plan,
      status: row.status
    },
    planId: task.planId,
    taskId: task.id,
    taskType: "customer_chat_reply",
    userMessage
  };
}

function mapChatMessage(row: Record<string, unknown>) {
  return {
    body: typeof row.body === "string" ? row.body : "",
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(String(row.created_at)).toISOString(),
    id: typeof row.id === "string" ? row.id : "",
    role: row.role === "assistant" ? "assistant" : "user",
    status:
      row.status === "queued" || row.status === "failed"
        ? row.status
        : "ready"
  } satisfies PlanChatMessage;
}

async function loadPlanGenerationContext(
  sql: NonNullable<ReturnType<typeof getSql>>,
  planId: string,
  planOverride?: AssessmentPlan | null
) {
  const rows = await sql`
    select
      assessments.answers,
      assessments.first_name,
      assessments.health_score,
      assessments.locale,
      assessments.selected_plan::text,
      formulations.formulation,
      food_guidance.guidance as food_guidance
    from public.assessments
    left join lateral (
      select formulation
      from public.formulations
      where formulations.plan_id = assessments.plan_id
        and (
          model_version is null
          or model_version not like '%:example'
        )
      order by version desc, generated_at desc
      limit 1
    ) formulations on true
    left join lateral (
      select guidance
      from public.food_guidance
      where food_guidance.plan_id = assessments.plan_id
        and (
          model_version is null
          or model_version not like '%:example'
        )
      order by version desc, generated_at desc
      limit 1
    ) food_guidance on true
    where assessments.plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Assessment submission not found");
  }

  const chatRows = await sql<Array<Record<string, unknown>>>`
    select id::text, role, body, status, created_at
    from public.plan_chat_messages
    where plan_id = ${planId}::uuid
      and status in ('ready', 'queued')
    order by created_at asc
    limit 30
  `;
  const guidanceAdjustments = await loadActivePlanGuidanceAdjustments(
    sql,
    planId
  );
  const planFeedback = await loadActivePlanFeedback(sql, planId);

  let formulation = row.formulation
    ? row.formulation as FormulationBlueprint
    : null;
  let foodGuidance = row.food_guidance
    ? row.food_guidance as FoodGuidanceBlueprint
    : null;

  if (formulation && foodGuidance) {
    const reconciledSafety = await reconcileResolvedSafetyReviewFlags(
      sql,
      planId,
      {
        foodGuidance: foodGuidance.foodGuidance ?? [],
        foodSafetySummary: foodGuidance.foodSafetySummary,
        safetySummary: formulation.safetySummary,
        supplementBreakdown: formulation.supplementBreakdown ?? []
      }
    );

    formulation = {
      ...formulation,
      safetySummary: reconciledSafety.safetySummary,
      supplementBreakdown: reconciledSafety.supplementBreakdown
    };
    foodGuidance = {
      ...foodGuidance,
      foodGuidance: reconciledSafety.foodGuidance,
      foodSafetySummary: reconciledSafety.foodSafetySummary
    };
  }

  return {
    answers: row.answers,
    chatMessages: chatRows.map(mapChatMessage),
    firstName:
      typeof row.first_name === "string" && row.first_name.trim()
        ? row.first_name.trim()
        : firstNameFromAssessmentAnswers(row.answers),
    foodGuidance,
    formulation,
    guidanceAdjustments,
    healthScore:
      row.health_score && typeof row.health_score === "object"
        ? (row.health_score as HealthScoreResult)
        : null,
    locale: isLocale(row.locale) ? row.locale : "en",
    plan: planOverride ?? normalizeAssessmentPlan(row.selected_plan),
    planFeedback,
    planId
  };
}

async function loadCanonicalSupplementOptions(
  sql: NonNullable<ReturnType<typeof getSql>>
): Promise<CanonicalSupplementOption[]> {
  const rows = await sql<Array<{
    aliases: string[];
    category: string;
    id: string;
    list_status: string;
    max_amount: string | number | null;
    max_unit: string | null;
    name: string;
    normalized_name: string;
    safety_flags: string[] | null;
    safety_notes: string | null;
  }>>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      supplements.category,
      supplements.list_status,
      safety.max_amount,
      safety.max_unit,
      safety.safety_flags,
      safety.safety_notes,
      coalesce(
        array_agg(distinct supplement_aliases.alias)
          filter (
            where supplement_aliases.alias is not null
              and supplement_aliases.normalized_alias <> supplements.normalized_name
          ),
        '{}'::text[]
      ) as aliases
    from public.supplements
    left join public.supplement_aliases
      on supplement_aliases.supplement_id = supplements.id
    left join lateral (
      select max_amount, max_unit, safety_flags, safety_notes
      from public.supplement_safety_limits
      where supplement_safety_limits.supplement_id = supplements.id
      order by version desc, updated_at desc
      limit 1
    ) safety on true
    where supplements.is_active = true
      and supplements.list_status = 'active'
    group by
      supplements.id,
      supplements.name,
      supplements.normalized_name,
      supplements.category,
      supplements.list_status,
      safety.max_amount,
      safety.max_unit,
      safety.safety_flags,
      safety.safety_notes
    order by
      case supplements.list_status
        when 'active' then 0
        else 1
      end,
      supplements.name
    limit 220
  `;

  return rows.map((row) => ({
    aliases: row.aliases ?? [],
    category: row.category,
    id: row.id,
    listStatus: row.list_status,
    maxAmount:
      row.max_amount === null || row.max_amount === undefined
        ? null
        : Number(row.max_amount),
    maxUnit: row.max_unit,
    name: row.name,
    normalizedName: row.normalized_name,
    safetyFlags: row.safety_flags ?? [],
    safetyNotes: row.safety_notes
  }));
}

async function buildNutritionAdvisorContext(task: TaskRecord) {
  const sql = getSql();

  if (!sql || !task.planId) {
    throw new Error("Nutrition advisor work item is missing a plan");
  }

  return loadPlanGenerationContext(sql, task.planId, taskPlanOverride(task));
}

async function buildNutritionPlanChatWorkItem(task: TaskRecord) {
  const messageId = payloadText(task.payload, "messageId");

  if (!isUuid(messageId)) {
    throw new Error("Nutrition plan chat task is missing a message");
  }

  const sql = getSql();
  const context = await buildNutritionAdvisorContext(task);

  if (!sql || !task.planId) {
    throw new Error("Nutrition plan chat task is missing a plan");
  }

  const messageRows = await sql<Array<{ body: string }>>`
    select body
    from public.plan_chat_messages
    where id = ${messageId}::uuid
      and plan_id = ${task.planId}::uuid
      and role = 'user'
    limit 1
  `;
  const userMessage = messageRows[0]?.body?.trim();

  if (!userMessage) {
    throw new Error("Nutrition plan chat message was not found");
  }

  return {
    ...context,
    messageId,
    taskId: task.id,
    taskType: "nutrition_plan_chat_reply",
    userMessage
  } satisfies NutritionPlanChatWorkItem;
}

async function buildNutritionReportWorkItem(task: TaskRecord) {
  const context = await buildNutritionAdvisorContext(task);

  if (!context.formulation) {
    throw new Error("Nutrition report requires supplement guidance");
  }

  if (!context.foodGuidance) {
    throw new Error("Nutrition report requires food guidance");
  }

  return {
    ...context,
    foodGuidance: context.foodGuidance,
    formulation: context.formulation,
    taskId: task.id,
    taskType: "generate_nutrition_report"
  } satisfies NutritionReportWorkItem;
}

async function buildProductRecommendationsWorkItem(task: TaskRecord) {
  const context = await buildNutritionAdvisorContext(task);

  if (!task.planId || !context.formulation) {
    throw new Error("Product recommendation task requires a finalized plan");
  }
  const needs = await enrichProductNeedsWithAliases(buildProductNeeds({
    foodGuidance: null,
    formulation: context.formulation
  }));
  const countryCode = productCountryCodeFromAnswers(context.answers);
  const candidateLoadStartedAt = Date.now();
  const retailerCandidateSets =
    await getRetailerAwareProductRecommendationCandidateSets({
      countryCode,
      includeIneligible: true
    });
  const candidates = retailerCandidateSets.length > 0
    ? retailerCandidateSets.flatMap((set) => set.candidates)
    : await getProductRecommendationCandidates({
    countryCode,
    includeIneligible: true
      });

  return {
    candidates,
    candidateLoadMs: Date.now() - candidateLoadStartedAt,
    clientContext: productRecommendationClientContextFromPlan(
      context.answers,
      context.planFeedback,
      context.guidanceAdjustments
    ),
    clientSex: productClientSexFromAnswers(context.answers),
    countryCode,
    needs,
    planId: task.planId,
    retailerCandidateSets,
    searchQueries: buildProductSearchQueries(needs),
    stackPreference: normalizeProductStackPreference(
      payloadText(task.payload, "stackPreference")
    ),
    taskId: task.id,
    taskType: "generate_product_recommendations"
  } satisfies ProductRecommendationsWorkItem;
}

async function enrichProductNeedsWithAliases(
  needs: readonly ProductRecommendationNeed[]
): Promise<ProductRecommendationNeed[]> {
  const sql = getSql();

  if (!sql || needs.length < 1) {
    return [...needs];
  }

  const rows = await sql<Array<{
    normalized_aliases: string[];
    normalized_name: string;
  }>>`
    select
      supplements.normalized_name,
      array_remove(array_agg(distinct supplement_aliases.normalized_alias), null) as normalized_aliases
    from public.supplements
    left join public.supplement_aliases
      on supplement_aliases.supplement_id = supplements.id
    group by supplements.id, supplements.normalized_name
  `;

  return needs.map((need) => {
    if (need.itemType !== "supplement") {
      return need;
    }

    const needAliases = productFactAliasKeys(need.displayName, need.aliasKeys);
    const matches = rows.filter((row) =>
      productKeysMatch(
        need.displayName,
        row.normalized_name,
        needAliases,
        row.normalized_aliases
      )
    );
    const aliasKeys = [
      ...needAliases,
      ...matches.flatMap((row) => [
        row.normalized_name,
        ...row.normalized_aliases
      ])
    ];

    return {
      ...need,
      aliasKeys: [...new Set(aliasKeys.flatMap((alias) => productFactAliasKeys(alias)))]
    };
  });
}

async function buildNutritionPlanRefinementWorkItem(task: TaskRecord) {
  if (!task.planId) {
    throw new Error("Nutrition plan refinement task is missing a plan");
  }

  return {
    planId: task.planId,
    refinementHash: payloadText(task.payload, "refinementHash"),
    taskId: task.id,
    taskType: "refine_nutrition_plan"
  } satisfies NutritionPlanRefinementWorkItem;
}

export async function buildTaskWorkItem(task: TaskRecord): Promise<TaskWorkItem> {
  if (
    task.taskType === "carrier_event_process" ||
    task.taskType === "carrier_label_generate" ||
    task.taskType === "carrier_pickup_book" ||
    task.taskType === "carrier_shipment_create" ||
    task.taskType === "carrier_tracking_sync"
  ) {
    return buildCarrierShipmentWorkItem(task);
  }

  if (task.taskType === "analyze_healthscore") {
    return buildHealthScoreWorkItem(task);
  }

  if (
    task.taskType === "generate_supplement_guidance" ||
    task.taskType === "generate_example_supplement_guidance"
  ) {
    return buildFormulationWorkItem(task);
  }

  if (task.taskType === "generate_food_guidance") {
    return buildFoodGuidanceWorkItem(task);
  }

  if (task.taskType === "generate_food_gap_guidance") {
    return buildFoodGapSupportWorkItem(task);
  }

  if (task.taskType === "send_example_email") {
    return buildExampleEmailWorkItem(task);
  }

  if (task.taskType === "send_reassessment_email") {
    return buildReassessmentEmailWorkItem(task);
  }

  if (task.taskType === "send_retail_order_workflow_email") {
    return buildRetailOrderWorkflowEmailWorkItem(task);
  }

  if (task.taskType === "route_admin_communication") {
    return buildAdminCommunicationRouteWorkItem(task);
  }

  if (task.taskType === "customer_chat_reply") {
    return buildCustomerChatReplyWorkItem(task);
  }

  if (
    task.taskType === "dispatch_chat_communication_message" ||
    task.taskType === "dispatch_email_communication_message"
  ) {
    return buildCommunicationDispatchWorkItem(task);
  }

  if (task.taskType === "nutrition_plan_chat_reply") {
    return buildNutritionPlanChatWorkItem(task);
  }

  if (task.taskType === "refine_nutrition_plan") {
    return buildNutritionPlanRefinementWorkItem(task);
  }

  if (task.taskType === "generate_nutrition_report") {
    return buildNutritionReportWorkItem(task);
  }

  if (task.taskType === "generate_product_recommendations") {
    return buildProductRecommendationsWorkItem(task);
  }

  if (task.taskType === "source_product_fda_approvals") {
    return {
      includeManufacturerEvidence: payloadBoolean(
        task.payload,
        "includeManufacturerEvidence",
        false
      ),
      limit: payloadNumber(task.payload, "limit", 120, 1, 500),
      maxRunMs: payloadNumber(task.payload, "maxRunMs", 180_000, 10_000, 600_000),
      productId: textFromRecord(payloadRecord(task.payload), "productId"),
      taskId: task.id,
      taskType: "source_product_fda_approvals"
    } satisfies ProductFdaApprovalSourcingWorkItem;
  }

  if (task.taskType === "source_product_identifiers") {
    return {
      limit: payloadNumber(task.payload, "limit", 2000, 1, 2000),
      productId: textFromRecord(payloadRecord(task.payload), "productId"),
      taskId: task.id,
      taskType: "source_product_identifiers"
    } satisfies ProductIdentifierSourcingWorkItem;
  }

  if (task.taskType === "retail_stock_forecast_refresh") {
    return {
      organisationId: task.organisationId,
      productId: textFromRecord(payloadRecord(task.payload), "productId"),
      source: textFromRecord(payloadRecord(task.payload), "source"),
      stockId: textFromRecord(payloadRecord(task.payload), "stockId"),
      taskId: task.id,
      taskType: "retail_stock_forecast_refresh"
    } satisfies RetailStockForecastWorkItem;
  }

  if (task.taskType.startsWith("retail_")) {
    if (!isRetailAgentExecutableTaskType(task.taskType)) {
      throw new Error(
        `Retail task ${task.taskType} is human-only or not agent-executable`
      );
    }

    const taskType = task.taskType as Exclude<
      RetailAgentExecutableTaskType,
      "retail_stock_forecast_refresh"
    >;

    return {
      organisationId: task.organisationId,
      payload: payloadRecord(task.payload),
      sourceEntityId: task.sourceEntityId,
      sourceEntityType: task.sourceEntityType,
      taskId: task.id,
      taskType
    } satisfies RetailOperationsReviewWorkItem;
  }

  if (task.taskType === "client_safety_followup") {
    const payload = payloadRecord(task.payload);
    const legacySafetyReviewId = payloadText(payload, "safetyReviewId");
    const reviewedItems = safetyFollowupItems(payload.reviewedItems);
    const safetyReviewIds = [
      ...reviewedItems
        .map((item) => item.safetyReviewId)
        .filter((id): id is string => Boolean(id)),
      ...(isUuid(legacySafetyReviewId) ? [legacySafetyReviewId] : [])
    ];
    const supplementName =
      payloadText(payload, "supplementName") || "your supplement";
    const decision = payloadText(payload, "decision") || "reviewed";

    return {
      body: safetyFollowupMessage({
        clientDose: payloadText(payload, "clientDose") || null,
        decision,
        reviewedItems,
        supplementName
      }),
      metadata: {
        decision,
        reviewedItems,
        safetyReviewIds,
        source: "client_safety_followup_task",
        supplementName
      },
      payload,
      planId: task.planId,
      safetyReviewIds,
      subject: "Your MattaNutra safety review is complete",
      taskId: task.id,
      taskType: "client_safety_followup"
    } satisfies CommunicationFollowupWorkItem;
  }

  if (task.taskType === "content_status_change") {
    const payload = payloadRecord(task.payload);
    const contentType = payloadText(payload, "contentType");
    const targetStatus = payloadText(payload, "targetStatus");
    const contentId = payloadText(payload, "contentId");

    if (
      (contentType !== "blog_post" && contentType !== "testimonial") ||
      (targetStatus !== "archived" &&
        targetStatus !== "draft" &&
        targetStatus !== "published" &&
        targetStatus !== "review") ||
      !isUuid(contentId)
    ) {
      throw new Error("Content status change work item is incomplete");
    }

    return {
      contentId,
      contentType,
      payload,
      targetStatus,
      taskType: "content_status_change"
    } satisfies ContentStatusChangeWorkItem;
  }

  if (task.taskType === "sync_digitalocean_billing") {
    return {
      projectNames: payloadTextArray(task.payload, "projectNames"),
      taskId: task.id,
      taskType: "sync_digitalocean_billing"
    } satisfies DigitalOceanBillingSyncWorkItem;
  }

  return {
    originalTaskType: task.taskType,
    payload: task.payload,
    planId: task.planId,
    taskType: "unknown_task"
  };
}
