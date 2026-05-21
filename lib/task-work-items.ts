import { normalizeAssessmentPlan, type AssessmentPlan } from "@/lib/assessment-snapshot";
import {
  isUuid,
  reconcileResolvedSafetyReviewFlags
} from "@/lib/assessment-store";
import type { CanonicalSupplementOption } from "@/lib/canonical-supplements";
import { getSql } from "@/lib/db";
import { appendAssessmentEvent } from "@/lib/domain-history";
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
import { isLocale, type Locale } from "@/lib/i18n";
import {
  getProductRecommendationCandidates
} from "@/lib/admin-products";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import { loadActivePlanFeedback } from "@/lib/plan-feedback";
import { loadActivePlanGuidanceAdjustments } from "@/lib/plan-guidance-adjustments";
import {
  buildMarketplaceSearchQueries,
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
import {
  buildReassessmentEmailHtml,
  buildReassessmentEmailSubject
} from "@/lib/reassessment-email";
import type { TaskRecord } from "@/lib/task-service";

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
  requestId?: string;
  taskId: string;
  taskType: "generate_example_food_guidance" | "generate_food_guidance";
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
  foodGuidance: FoodGuidanceBlueprint | null;
  formulation: FormulationBlueprint | null;
  guidanceAdjustments: PlanGuidanceAdjustment[];
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
  foodGuidance: FoodGuidanceBlueprint;
  formulation: FormulationBlueprint;
  guidanceAdjustments: PlanGuidanceAdjustment[];
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
  planId: string;
  searchQueries: string[];
  stackPreference: ProductStackPreference;
  taskId: string;
  taskType: "generate_product_recommendations";
}>;

export type MarketplaceProductMaintenanceWorkItem = Readonly<{
  payload: Record<string, unknown>;
  planId: string | null;
  taskId: string;
  taskType:
    | "discover_products"
    | "parse_product_label"
    | "refresh_marketplace_product";
}>;

export type TaskWorkItem =
  | CommunicationFollowupWorkItem
  | ContentStatusChangeWorkItem
  | DigitalOceanBillingSyncWorkItem
  | ExampleEmailWorkItem
  | FoodGuidanceWorkItem
  | FormulationWorkItem
  | HealthScoreWorkItem
  | MarketplaceProductMaintenanceWorkItem
  | NutritionPlanChatWorkItem
  | NutritionPlanRefinementWorkItem
  | NutritionReportWorkItem
  | ProductRecommendationsWorkItem
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

  return {
    budgetPreference: textFromRecord(record, "budget"),
    conditions: stringArrayFromRecord(record, "conditions"),
    currentSupplements: textFromRecord(record, "supps"),
    guidanceAdjustmentCount: guidanceAdjustments.length,
    lifestage: textFromRecord(record, "lifestage"),
    medicationTypes: stringArrayFromRecord(record, "medTypes"),
    medications: textFromRecord(record, "meds"),
    pillLimit: textFromRecord(record, "pills"),
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

async function buildFormulationWorkItem(task: TaskRecord) {
  const sql = getSql();

  if (!sql || !task.planId) {
    throw new Error("Formulation work item is missing a plan");
  }
  const [context, canonicalSupplements] = await Promise.all([
    loadPlanGenerationContext(sql, task.planId),
    loadCanonicalSupplementOptions(sql)
  ]);

  if (task.taskType === "generate_supplement_guidance") {
    await appendAssessmentEvent(sql, {
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
  const context = await loadPlanGenerationContext(sql, task.planId);

  if (task.taskType === "generate_food_guidance") {
    await appendAssessmentEvent(sql, {
      actor: task.reservedByAgentId,
      afterPayload: {
        errorMessage: null,
        processingStartedAt: "coalesce_current_or_now",
        queuePosition: 0,
        status: "preparing"
      },
      changeReason: "food_guidance_started",
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
      | "generate_example_food_guidance"
      | "generate_food_guidance"
  } satisfies FoodGuidanceWorkItem;
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

async function loadPlanGenerationContext(sql: NonNullable<ReturnType<typeof getSql>>, planId: string) {
  const rows = await sql`
    select
      assessments.answers,
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
    foodGuidance,
    formulation,
    guidanceAdjustments,
    locale: isLocale(row.locale) ? row.locale : "en",
    plan: normalizeAssessmentPlan(row.selected_plan),
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
  }>>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      supplements.category,
      supplements.list_status,
      safety.max_amount,
      safety.max_unit,
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
      select max_amount, max_unit
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
      safety.max_unit
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
    normalizedName: row.normalized_name
  }));
}

async function buildNutritionAdvisorContext(task: TaskRecord) {
  const sql = getSql();

  if (!sql || !task.planId) {
    throw new Error("Nutrition advisor work item is missing a plan");
  }

  return loadPlanGenerationContext(sql, task.planId);
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

  return {
    ...context,
    foodGuidance: context.foodGuidance ?? EMPTY_FOOD_GUIDANCE,
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
  const candidates = await getProductRecommendationCandidates({
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
    searchQueries: buildMarketplaceSearchQueries(needs),
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
  if (task.taskType === "analyze_healthscore") {
    return buildHealthScoreWorkItem(task);
  }

  if (
    task.taskType === "generate_supplement_guidance" ||
    task.taskType === "generate_example_supplement_guidance"
  ) {
    return buildFormulationWorkItem(task);
  }

  if (
    task.taskType === "generate_food_guidance" ||
    task.taskType === "generate_example_food_guidance"
  ) {
    return buildFoodGuidanceWorkItem(task);
  }

  if (task.taskType === "send_example_email") {
    return buildExampleEmailWorkItem(task);
  }

  if (task.taskType === "send_reassessment_email") {
    return buildReassessmentEmailWorkItem(task);
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

  if (
    task.taskType === "discover_products" ||
    task.taskType === "parse_product_label" ||
    task.taskType === "refresh_marketplace_product"
  ) {
    return {
      payload: payloadRecord(task.payload),
      planId: task.planId,
      taskId: task.id,
      taskType: task.taskType
    } satisfies MarketplaceProductMaintenanceWorkItem;
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
