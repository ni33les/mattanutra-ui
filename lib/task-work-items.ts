import { normalizeAssessmentPlan, type AssessmentPlan } from "@/lib/assessment-snapshot";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import type {
  FoodGuidanceBlueprint,
  FormulationBlueprint
} from "@/lib/formulation-types";
import type { HealthScoreResult } from "@/lib/health-score";
import {
  buildExampleEmailHtml,
  buildExampleEmailSubject
} from "@/lib/example-email";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  buildReassessmentEmailHtml,
  buildReassessmentEmailSubject
} from "@/lib/reassessment-email";
import type { TaskRecord } from "@/lib/task-service";

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
  locale: Locale;
  plan: AssessmentPlan;
  planId: string;
  requestId?: string;
  taskId: string;
  taskType: "generate_example_supplement_guidance" | "generate_supplement_guidance";
}>;

export type FoodGuidanceWorkItem = Readonly<{
  answers: unknown;
  locale: Locale;
  plan: AssessmentPlan;
  planId: string;
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

export type TaskWorkItem =
  | CommunicationFollowupWorkItem
  | ContentStatusChangeWorkItem
  | DigitalOceanBillingSyncWorkItem
  | ExampleEmailWorkItem
  | FoodGuidanceWorkItem
  | FormulationWorkItem
  | HealthScoreWorkItem
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

  const rows = await sql`
    select answers, locale, selected_plan::text
    from public.assessments
    where plan_id = ${task.planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Assessment submission not found");
  }

  if (task.taskType === "generate_supplement_guidance") {
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
    answers: row.answers,
    locale: isLocale(row.locale) ? row.locale : "en",
    plan: normalizeAssessmentPlan(row.selected_plan),
    planId: task.planId,
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

  const rows = await sql`
    select answers, locale, selected_plan::text
    from public.assessments
    where plan_id = ${task.planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Assessment submission not found");
  }

  if (task.taskType === "generate_food_guidance") {
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
    answers: row.answers,
    locale: isLocale(row.locale) ? row.locale : "en",
    plan: normalizeAssessmentPlan(row.selected_plan),
    planId: task.planId,
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
    join lateral (
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
  const foodGuidance = row.food_guidance as FoodGuidanceBlueprint;
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
