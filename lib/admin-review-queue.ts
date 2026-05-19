import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getSql } from "@/lib/db";
import type {
  SupplementConfidence,
  SupplementListStatus
} from "@/lib/admin-supplements";
import { toJsonValue } from "@/lib/assessment-store";
import {
  normalizeSupplementSafetyFlags,
  type SupplementSafetyFlag
} from "@/lib/supplement-safety-flags";
import {
  insertFoodGuidanceVersion,
  insertFormulationVersion
} from "@/lib/plan-version-writes";
import { appendSupplementSafetyLimitVersion } from "@/lib/supplement-safety-limit-versions";
import { safetyReviewItemColumnsAvailable } from "@/lib/safety-review-schema";
import { notifyTaskQueueChanged } from "@/lib/task-wakeup";
import { enqueueProductRecommendationsTask } from "@/lib/task-worker";
import {
  applyReviewDecisionToFoodGuidance,
  applyReviewDecisionToFormulation,
  clientDoseText,
  formatReviewDose,
  localizedReviewText,
  localizedText,
  normalizeName,
  numberOrNull,
  preferredClientDoseUnit,
  supplementCategory,
  textArray,
  textOrNull,
  type AdminReviewLocalizedText
} from "@/lib/admin-review-helpers";

export type { AdminReviewLocalizedText } from "@/lib/admin-review-helpers";

export type AdminReviewTaskRow = Readonly<{
  actionOptions: string[];
  clientDoseAmount: number | null;
  clientDoseText: string | null;
  clientDoseUnit: string | null;
  flagReason: string | null;
  businessValue: number;
  taskGroupId: string | null;
  groupLabel: string | null;
  id: string;
  itemType: "food" | "product" | "supplement";
  limitAmount: number | null;
  limitUnit: string | null;
  maxAmount: number | null;
  maxUnit: string | null;
  newDose: string | null;
  originalDose: string | null;
  planId: string | null;
  queuedAt: string;
  requiredFields: string[];
  reviewId: string | null;
  reviewKind: string;
  status: string;
  supplementName: string;
  productImport: {
    description: string | null;
    descriptionEn: string | null;
    descriptionTh: string | null;
    duplicateProductIds: string[];
    fdaApprovalNumber: string | null;
    imageUrls: string[];
    parsedFacts: Array<{
      amount: number | null;
      confidence: string;
      name: string;
      unit: string | null;
    }>;
    productImportId: string | null;
    sourceUrl: string | null;
  } | null;
  foodFrequency: AdminReviewLocalizedText | null;
  foodRationale: AdminReviewLocalizedText | null;
  foodServing: AdminReviewLocalizedText | null;
}>;

export type AdminReviewQueueData = Readonly<{
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminReviewTaskRow[];
  summary: {
    doseReduced: number;
    reviewRequired: number;
    total: number;
    unknown: number;
  };
}>;

export type AdminReviewMutationResult = Readonly<{
  followupTaskId?: string | null;
  removedTaskIds: string[];
}>;

type ReviewTaskDbRow = Readonly<{
  ai_suggestion: Record<string, unknown> | null;
  flag_reason: string | null;
  business_value: number | string;
  task_group_id: string | null;
  group_label: string | null;
  id: string;
  limit_unit: string | null;
  limit_value: number | string | null;
  payload: Record<string, unknown> | null;
  plan_id: string | null;
  queued_at: Date | string;
  review_id: string | null;
  item_name: string | null;
  item_type: "food" | "supplement" | null;
  status: string;
  suggested_dose_unit: string | null;
  suggested_dose_value: number | string | null;
  task_id?: string | null;
}>;

type Db = postgres.Sql | postgres.TransactionSql;

type CompletedTaskRow = Readonly<{
  id: string;
}>;

type FormulationRow = Readonly<{
  formulation: Record<string, unknown>;
  model_version: string | null;
  version: number;
}>;

type FoodGuidanceRow = Readonly<{
  guidance: Record<string, unknown>;
  model_version: string | null;
  version: number;
}>;

type SafetyReviewDecisionRow = Readonly<{
  ai_suggestion: Record<string, unknown> | null;
  client_notification_status: string;
  id: string;
  item_name: string | null;
  item_type: "food" | "supplement" | null;
  supplement_name: string;
  task_id: string | null;
}>;

type SafetyFollowupReviewRow = Readonly<{
  client_message: Record<string, unknown> | null;
  id: string;
  supplement_name: string;
}>;

async function queueProductMatchAfterPlanReview(input: Readonly<{
  parentTaskId: string;
  planId: string | null;
}>) {
  if (!input.planId) {
    return;
  }

  try {
    await enqueueProductRecommendationsTask({
      parentTaskId: input.parentTaskId,
      planId: input.planId
    });
  } catch (error) {
    console.error("Unable to queue product recommendations after review", error);
  }
}

const REVIEW_TASK_TYPES = [
  "classify_food",
  "classify_supplement",
  "review_food_for_plan",
  "review_supplement_for_plan",
  "review_product_import",
  "dose_reduction_notice"
] as const;

export type ResolveAdminReviewTaskInput = Readonly<{
  actor?: string | null;
  associatedSupplementId?: string | null;
  category?: string | null;
  confidence: SupplementConfidence;
  id: string;
  listStatus: SupplementListStatus;
  maxAmount: number | null;
  maxUnit: string;
  safetyFlags: SupplementSafetyFlag[];
  safetyNotes: string | null;
  supplementName: string;
}>;

export type DecideAdminPlanReviewTaskInput = Readonly<{
  actor?: string | null;
  clientDoseAmount: number | null;
  clientDoseUnit: string | null;
  decision: "approve" | "disapprove";
  foodFrequency?: AdminReviewLocalizedText | null;
  foodRationale?: AdminReviewLocalizedText | null;
  foodServing?: AdminReviewLocalizedText | null;
  id: string;
  reviewerNote?: string | null;
}>;

export function emptyAdminReviewQueueData(): AdminReviewQueueData {
  return {
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    rows: [],
    summary: {
      doseReduced: 0,
      reviewRequired: 0,
      total: 0,
      unknown: 0
    }
  };
}

function reviewGroupLabel(label: string | null, payload: Record<string, unknown>) {
  if (
    label === "Review product imports" ||
    textOrNull(payload.reviewKind) === "product_import"
  ) {
    return "Review Product";
  }

  return label;
}

function rowFromDb(row: ReviewTaskDbRow): AdminReviewTaskRow {
  const payload = row.payload ?? {};
  const aiSuggestion = row.ai_suggestion ?? {};
  const itemType = textOrNull(payload.itemType) === "product"
    ? "product"
    : row.item_type === "food"
      ? "food"
      : "supplement";
  const clientDoseAmount =
    numberOrNull(row.suggested_dose_value) ??
    numberOrNull(payload.suggestedDoseAmount) ??
    numberOrNull(payload.maxAmount);
  const clientDoseUnit =
    preferredClientDoseUnit(
      textOrNull(row.suggested_dose_unit) ??
        textOrNull(payload.suggestedDoseUnit),
      textOrNull(payload.maxUnit)
    );

  return {
    actionOptions: textArray(payload.actionOptions),
    clientDoseAmount,
    clientDoseText:
      localizedText(aiSuggestion.dailyDose) ??
      textOrNull(payload.originalDose) ??
      formatReviewDose(clientDoseAmount, clientDoseUnit),
    clientDoseUnit,
    flagReason: row.flag_reason,
    businessValue: Number(row.business_value) || 0,
    taskGroupId: row.task_group_id,
    groupLabel: reviewGroupLabel(row.group_label, payload),
    id: row.id,
    itemType,
    limitAmount: numberOrNull(row.limit_value),
    limitUnit: row.limit_unit,
    maxAmount: numberOrNull(payload.maxAmount),
    maxUnit: textOrNull(payload.maxUnit),
    newDose: textOrNull(payload.newDose),
    originalDose: textOrNull(payload.originalDose),
    planId: row.plan_id,
    queuedAt: new Date(row.queued_at).toISOString(),
    requiredFields: textArray(payload.requiredFields),
    reviewId: row.review_id,
    reviewKind: textOrNull(payload.reviewKind) ?? "review_required",
    status: row.status,
    supplementName:
      textOrNull(row.item_name) ??
      textOrNull(payload.productName) ??
      textOrNull(payload.foodName) ??
      textOrNull(payload.normalizedFoodName) ??
      textOrNull(payload.supplementName) ??
      textOrNull(payload.normalizedSupplementName) ??
      (itemType === "food"
        ? "Unknown food"
        : itemType === "product"
          ? "Unknown product"
          : "Unknown supplement"),
    productImport: itemType === "product"
      ? {
          description: textOrNull(payload.description),
          descriptionEn: textOrNull(payload.descriptionEn),
          descriptionTh: textOrNull(payload.descriptionTh),
          duplicateProductIds: textArray(payload.duplicateProductIds),
          fdaApprovalNumber: textOrNull(payload.fdaApprovalNumber),
          imageUrls: textArray(payload.imageUrls),
          parsedFacts: Array.isArray(payload.parsedFacts)
            ? payload.parsedFacts.flatMap((item) => {
                const record = item && typeof item === "object"
                  ? item as Record<string, unknown>
                  : null;

                if (!record) {
                  return [];
                }

                const name = textOrNull(record.name);

                return name
                  ? [{
                      amount: numberOrNull(record.amount),
                      confidence: textOrNull(record.confidence) ?? "moderate",
                      name,
                      unit: textOrNull(record.unit)
                    }]
                  : [];
              })
            : [],
          productImportId: textOrNull(payload.productImportId),
          sourceUrl: textOrNull(payload.sourceUrl)
        }
      : null,
    foodFrequency: localizedReviewText(aiSuggestion.frequency),
    foodRationale: localizedReviewText(aiSuggestion.rationale),
    foodServing: localizedReviewText(aiSuggestion.serving)
  };
}

function buildSummary(rows: AdminReviewTaskRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.reviewKind === "dose_reduced") {
        summary.doseReduced += 1;
      } else if (
        row.reviewKind === "unknown_supplement" ||
        row.reviewKind === "unknown_food"
      ) {
        summary.unknown += 1;
      } else {
        summary.reviewRequired += 1;
      }

      return summary;
    },
    {
      doseReduced: 0,
      reviewRequired: 0,
      total: 0,
      unknown: 0
    }
  );
}

async function loadReviewTaskRows(sql: postgres.Sql) {
  const itemColumnsAvailable = await safetyReviewItemColumnsAvailable(sql);

  if (!itemColumnsAvailable) {
    return sql<ReviewTaskDbRow[]>`
      select
        tasks.id::text,
        tasks.id::text as task_id,
        coalesce(tasks.plan_id, safety_reviews.plan_id)::text as plan_id,
        tasks.status,
        tasks.business_value,
        tasks.task_group_id::text,
        tasks.group_label,
        tasks.payload,
        tasks.created_at as queued_at,
        safety_reviews.id::text as review_id,
        safety_reviews.flag_reason,
        safety_reviews.suggested_dose_value,
        safety_reviews.suggested_dose_unit,
        safety_reviews.limit_value,
        safety_reviews.limit_unit,
        safety_reviews.supplement_name as item_name,
        case
          when tasks.task_type in ('classify_food', 'review_food_for_plan')
            then 'food'
          else 'supplement'
        end as item_type,
        safety_reviews.ai_suggestion
      from public.tasks tasks
      left join lateral (
        select *
        from public.safety_reviews safety_reviews
        where safety_reviews.task_id = tasks.id
        order by safety_reviews.opened_at asc
        limit 1
      ) safety_reviews on true
      where tasks.task_type = any(${[...REVIEW_TASK_TYPES]}::text[])
        and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
      order by
        tasks.business_value desc,
        tasks.created_at asc
      limit 200
    `;
  }

  return sql<ReviewTaskDbRow[]>`
    select
      tasks.id::text,
      tasks.id::text as task_id,
      coalesce(tasks.plan_id, safety_reviews.plan_id)::text as plan_id,
      tasks.status,
      tasks.business_value,
      tasks.task_group_id::text,
      tasks.group_label,
      tasks.payload,
      tasks.created_at as queued_at,
      safety_reviews.id::text as review_id,
      safety_reviews.flag_reason,
      safety_reviews.suggested_dose_value,
      safety_reviews.suggested_dose_unit,
      safety_reviews.limit_value,
      safety_reviews.limit_unit,
      coalesce(safety_reviews.item_name, safety_reviews.supplement_name) as item_name,
      coalesce(
        safety_reviews.item_type,
        case
          when tasks.task_type in ('classify_food', 'review_food_for_plan')
            then 'food'
          else 'supplement'
        end
      ) as item_type,
      safety_reviews.ai_suggestion
    from public.tasks tasks
    left join lateral (
      select *
      from public.safety_reviews safety_reviews
      where safety_reviews.task_id = tasks.id
      order by safety_reviews.opened_at asc
      limit 1
    ) safety_reviews on true
    where tasks.task_type = any(${[...REVIEW_TASK_TYPES]}::text[])
      and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
    order by
      tasks.business_value desc,
      tasks.created_at asc
    limit 200
  `;
}

export async function getAdminReviewQueueData(): Promise<AdminReviewQueueData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminReviewQueueData();
  }

  try {
    const rows = await loadReviewTaskRows(sql);
    const mappedRows = rows.map(rowFromDb);

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      rows: mappedRows,
      summary: buildSummary(mappedRows)
    };
  } catch (error) {
    console.error("Unable to load admin review queue", error);
    return emptyAdminReviewQueueData();
  }
}

async function taskTablesAvailable(transaction: Db) {
  const rows = await transaction<{ available: boolean }[]>`
    select to_regclass('public.tasks') is not null
      and to_regclass('public.task_events') is not null
      and to_regclass('public.task_comments') is not null
      as available
  `;

  return rows[0]?.available === true;
}

async function completeSupplementReviewTasks(
  transaction: Db,
  input: Readonly<{
    actor?: string | null;
    commentBody: string;
    eventPayload?: Record<string, unknown>;
    eventType: string;
    taskIds?: readonly string[];
  }>
) {
  if (!(await taskTablesAvailable(transaction))) {
    return [];
  }

  const taskIds = [...(input.taskIds ?? [])];

  if (taskIds.length < 1) {
    return [];
  }

  const resultPayload = toJsonValue({
    actor: input.actor ?? "admin_dashboard",
    ...(input.eventPayload ?? {})
  });
  const tasks = await transaction<CompletedTaskRow[]>`
    update public.tasks
    set
      status = 'completed',
      completed_at = now(),
      lease_until = null,
      reserved_by_agent_id = null,
      result_payload = coalesce(result_payload, '{}'::jsonb) || ${transaction.json(resultPayload)}::jsonb,
      updated_at = now()
    where task_type = any(${[...REVIEW_TASK_TYPES]}::text[])
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
      and id = any(${taskIds}::uuid[])
    returning id::text
  `;

  for (const task of tasks) {
    await transaction`
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
        ${randomUUID()}::uuid,
        ${task.id}::uuid,
        'human',
        ${input.actor ?? "admin_dashboard"},
        'admin',
        'decision',
        ${input.commentBody},
        ${transaction.json(resultPayload)},
        now()
      )
    `;

    await transaction`
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
        ${randomUUID()}::uuid,
        ${task.id}::uuid,
        ${input.eventType},
        'succeeded',
        'medium',
        ${transaction.json(resultPayload)},
        now(),
        now()
      )
    `;
  }

  return tasks;
}

async function appendReviewedFormulationVersion(
  transaction: Db,
  input: Readonly<{
    formulation: Record<string, unknown>;
    previousModelVersion: string | null;
    planId: string;
    reviewEvent: string;
  }>
) {
  const modelVersion = [
    input.previousModelVersion ?? "manual",
    input.reviewEvent
  ].join(":");

  return insertFormulationVersion(transaction, {
    formulation: input.formulation,
    modelVersion,
    planId: input.planId
  });
}

async function appendReviewedFoodGuidanceVersion(
  transaction: Db,
  input: Readonly<{
    foodGuidance: Record<string, unknown>;
    previousModelVersion: string | null;
    planId: string;
    reviewEvent: string;
  }>
) {
  const modelVersion = [
    input.previousModelVersion ?? "manual",
    input.reviewEvent
  ].join(":");

  return insertFoodGuidanceVersion(transaction, {
    foodGuidance: input.foodGuidance,
    modelVersion,
    planId: input.planId
  });
}

async function queueClientSafetyFollowupTask(
  transaction: Db,
  input: Readonly<{
    actor?: string | null;
    parentTaskId: string | null;
    planId: string;
  }>
) {
  if (!(await taskTablesAvailable(transaction))) {
    return null;
  }

  const remainingReviewTasks = await transaction<{ count: number | string }[]>`
    select count(*)::int as count
    from public.tasks
    where plan_id = ${input.planId}::uuid
      and task_type = any(${[...REVIEW_TASK_TYPES]}::text[])
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
  `;

  if (Number(remainingReviewTasks[0]?.count ?? 0) > 0) {
    return null;
  }

  const reviewedRows = await transaction<SafetyFollowupReviewRow[]>`
    select
      id::text,
      supplement_name,
      client_message
    from public.safety_reviews
    where plan_id = ${input.planId}::uuid
      and status in ('accepted', 'rejected')
      and client_notification_status <> 'not_required'
    order by reviewed_at asc, opened_at asc
  `;

  if (reviewedRows.length < 1) {
    return null;
  }

  const reviewedItems = reviewedRows.map((row) => {
    const clientMessage = row.client_message ?? {};
    const decision = textOrNull(clientMessage.decision) ?? "reviewed";
    const clientDose = textOrNull(clientMessage.dose);

    return {
      clientDose,
      decision,
      safetyReviewId: row.id,
      supplementName: row.supplement_name
    };
  });
  const safetyReviewIds = reviewedRows.map((row) => row.id);
  const idempotencyScopeKey = `client-safety-followup:${input.planId}`;
  const idempotencyKey = idempotencyScopeKey;
  const existing = await transaction<{ id: string }[]>`
    select id::text
    from public.tasks
    where idempotency_scope_key = ${idempotencyScopeKey}
      and idempotency_key = ${idempotencyKey}
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
    order by created_at desc
    limit 1
  `;

  if (existing[0]?.id) {
    return existing[0].id;
  }

  await transaction`
    update public.tasks
    set
      status = 'cancelled',
      result_payload = coalesce(result_payload, '{}'::jsonb) || ${transaction.json(
        toJsonValue({
          cancelledBy: input.actor ?? "admin_dashboard",
          reason: "Superseded by grouped client safety follow-up"
        })
      )}::jsonb,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    where plan_id = ${input.planId}::uuid
      and task_type = 'client_safety_followup'
      and coalesce(idempotency_key, '') <> ${idempotencyKey}
      and status in ('queued', 'needs_review', 'waiting_approval')
  `;
  const taskId = randomUUID();
  const title = "Notify client about completed safety review";
  const parentRows = input.parentTaskId
    ? await transaction<Array<{
        group_label: string | null;
        task_group_id: string;
      }>>`
        select
          group_label,
          task_group_id::text
        from public.tasks
        where id = ${input.parentTaskId}::uuid
        limit 1
      `
    : [];
  const taskGroupId = parentRows[0]?.task_group_id ?? taskId;
  const groupLabel = parentRows[0]?.group_label ?? title;
  const payloadObject = {
    planId: input.planId,
    reviewedItems,
    safetyReviewIds,
    source: "human_review_completion",
    supplementCount: reviewedItems.length
  };
  const payload = toJsonValue(payloadObject);

  await transaction`
    insert into public.tasks (
      id,
      parent_task_id,
      plan_id,
      task_group_id,
      group_label,
      task_type,
      title,
      description,
      actor_type,
      status,
      business_value,
      required_capabilities,
      reasoning_effort,
      context,
      payload,
      idempotency_key,
      idempotency_scope_key,
      max_attempts,
      scheduled_for,
      created_at,
      updated_at
    )
    values (
      ${taskId}::uuid,
      ${input.parentTaskId ?? null}::uuid,
      ${input.planId}::uuid,
      ${taskGroupId}::uuid,
      ${groupLabel},
      'client_safety_followup',
      ${title},
      'Tell the client that a human safety review has been completed.',
      'deterministic',
      'queued',
      350,
      ${["client_safety_followup"]}::text[],
      'none',
      ${transaction.json(toJsonValue({ source: "human_review_completion" }))},
      ${transaction.json(payload)},
      ${idempotencyKey},
      ${idempotencyScopeKey},
      1,
      now(),
      now(),
      now()
    )
  `;

  await transaction`
    update public.safety_reviews
    set
      safety_context = safety_context || ${transaction.json(
        toJsonValue({ followupTaskId: taskId })
      )}::jsonb,
      updated_at = now()
    where id = any(${safetyReviewIds}::uuid[])
  `;

  await transaction`
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
      ${randomUUID()}::uuid,
      ${taskId}::uuid,
      'system',
      'MattaNutra safety',
      'admin',
      'instruction',
      'All human safety reviews for this plan are complete. Contact the client once through the best available channel.',
      ${transaction.json(payload)},
      now()
    )
  `;

  await transaction`
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
      ${randomUUID()}::uuid,
      ${taskId}::uuid,
      'client_safety_followup_queued',
      'requested',
      'medium',
      ${transaction.json(
        toJsonValue({
          actor: input.actor ?? "admin_dashboard",
          ...payloadObject
        })
      )},
      now(),
      now()
    )
  `;

  notifyTaskQueueChanged();

  return taskId;
}

export async function dismissAdminReviewTask({
  actor,
  id
}: Readonly<{
  actor?: string | null;
  id: string;
}>): Promise<AdminReviewMutationResult> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const tasks = await sql<{ id: string }[]>`
    select id::text
    from public.tasks
    where id = ${id}::uuid
      and task_type = any(${[...REVIEW_TASK_TYPES]}::text[])
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
  `;

  if (!tasks[0]) {
    throw new Error("Review task not found");
  }

  await sql`
    update public.safety_reviews
    set
      status = 'closed',
      reviewed_at = coalesce(reviewed_at, now()),
      closed_at = now(),
      reviewer_id = ${actor ?? "admin_dashboard"},
      reviewer_note = coalesce(reviewer_note, 'Dismissed from admin review queue.'),
      client_notification_status = 'not_required',
      updated_at = now()
    where task_id = ${id}::uuid
      and status in ('open', 'in_review', 'escalated')
  `;

  await completeSupplementReviewTasks(sql, {
    actor,
    commentBody: "Dismissed from admin review queue.",
    eventPayload: {
      taskId: id
    },
    eventType: "supplement_review_dismissed",
    taskIds: [id]
  });

  return {
    removedTaskIds: [id]
  };
}

export async function resolveAdminReviewTask(
  input: ResolveAdminReviewTaskInput
): Promise<AdminReviewMutationResult> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const supplementName = input.supplementName.trim();
  const normalizedSupplementName = normalizeName(supplementName);

  if (!supplementName || !normalizedSupplementName) {
    throw new Error("Supplement name is required");
  }

  let completedTaskIds: string[] = [];

  {
    const db = sql;
    const tasks = await db<
      Array<{
        id: string;
        payload: Record<string, unknown>;
        plan_id: string | null;
        task_type: string;
      }>
    >`
      select id::text, plan_id::text, payload, task_type
      from public.tasks
      where tasks.id = ${input.id}::uuid
        and tasks.task_type = any(${[...REVIEW_TASK_TYPES]}::text[])
        and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
    `;
    const task = tasks[0];

    if (!task) {
      throw new Error("Review task not found");
    }

    let supplementId: string | null = null;
    let associatedSupplementName: string | null = null;
    const associatedSupplementId = input.associatedSupplementId ?? null;

    if (associatedSupplementId) {
      const associatedRows = await db<
        Array<{
          id: string;
          name: string;
        }>
      >`
        select id::text, name
        from public.supplements
        where id = ${associatedSupplementId}::uuid
      `;
      const associatedSupplement = associatedRows[0];

      if (!associatedSupplement) {
        throw new Error("Associated supplement not found");
      }

      supplementId = associatedSupplement.id;
      associatedSupplementName = associatedSupplement.name;

      await db`
        insert into public.supplement_aliases (
          id,
          supplement_id,
          alias,
          normalized_alias,
          created_at
        )
        values (
          ${randomUUID()}::uuid,
          ${supplementId}::uuid,
          ${supplementName},
          ${normalizedSupplementName},
          now()
        )
        on conflict (normalized_alias) do update
        set
          alias = excluded.alias,
          supplement_id = excluded.supplement_id
      `;
    } else {
      const supplementRows = await db<{ id: string }[]>`
        insert into public.supplements (
          id,
          name,
          normalized_name,
          category,
          source_status,
          ingredient_type,
          list_status,
          is_active,
          source,
          source_payload,
          created_at,
          updated_at
        )
        values (
          ${randomUUID()}::uuid,
          ${supplementName},
          ${normalizedSupplementName},
          ${supplementCategory(input.category)},
          'recommended_add',
          null,
          ${input.listStatus},
          ${input.listStatus !== "inactive"},
          'admin_review_queue',
          ${db.json({
            normalizedSupplementName,
            resolvedBy: input.actor ?? "admin_dashboard"
          })},
          now(),
          now()
        )
        on conflict (normalized_name) do update
        set
          name = excluded.name,
          category = case
            when public.supplements.category in ('', 'Uncategorised', 'Admin review')
              then excluded.category
            else public.supplements.category
          end,
          list_status = excluded.list_status,
          is_active = excluded.is_active,
          source_status = case
            when public.supplements.source_status = 'core' then 'core'
            else 'recommended_add'
          end,
          source_payload = coalesce(public.supplements.source_payload, '{}'::jsonb)
            || excluded.source_payload,
          updated_at = now()
        returning id::text
      `;
      supplementId = supplementRows[0]?.id ?? null;
    }

    if (!supplementId) {
      throw new Error("Supplement could not be resolved");
    }

    const safetyFlags = normalizeSupplementSafetyFlags(input.safetyFlags);

    if (!associatedSupplementId) {
      await appendSupplementSafetyLimitVersion(db, {
        confidence: input.confidence,
        maxAmount: input.maxAmount,
        maxUnit: input.maxUnit,
        safetyFlags,
        safetyNotes: input.safetyNotes,
        supplementId
      });
    }

    const completedTasks = await db<
      Array<{
        id: string;
        plan_id: string | null;
      }>
    >`
      select id::text, plan_id::text
      from public.tasks
      where task_type = any(${[...REVIEW_TASK_TYPES]}::text[])
        and status not in ('completed', 'failed', 'cancelled', 'skipped')
        and (
          id = ${input.id}::uuid
          or payload ->> 'normalizedSupplementName' = ${normalizedSupplementName}
          or lower(payload ->> 'supplementName') = lower(${supplementName})
          or trim(both '_' from regexp_replace(lower(coalesce(payload ->> 'normalizedSupplementName', '')), '[^a-z0-9]+', '_', 'g')) = ${normalizedSupplementName}
          or trim(both '_' from regexp_replace(lower(coalesce(payload ->> 'supplementName', '')), '[^a-z0-9]+', '_', 'g')) = ${normalizedSupplementName}
      )
    `;
    completedTaskIds = completedTasks.map((row) => row.id);
    const resolutionLabel = associatedSupplementName
      ? `Associated with ${associatedSupplementName}.`
      : `Resolved as ${input.listStatus}.`;
    const auditAction = associatedSupplementName
      ? "review_associated"
      : "review_resolved";
    const eventType = associatedSupplementName
      ? "supplement_review_associated"
      : "supplement_review_resolved";

    await db`
      update public.safety_reviews
      set
        status = 'closed',
        reviewed_at = coalesce(reviewed_at, now()),
        closed_at = now(),
        reviewer_id = ${input.actor ?? "admin_dashboard"},
        reviewer_note = ${`${resolutionLabel} Closed from admin review queue.`},
        client_notification_status = case
          when client_notification_status = 'not_required' then 'not_required'
          else 'queued'
        end,
        updated_at = now()
      where status in ('open', 'in_review', 'escalated')
        and (
          lower(supplement_name) = lower(${supplementName})
          or trim(both '_' from regexp_replace(lower(coalesce(supplement_name, '')), '[^a-z0-9]+', '_', 'g')) = ${normalizedSupplementName}
        )
    `;

    await completeSupplementReviewTasks(db, {
      actor: input.actor,
      commentBody: resolutionLabel,
      eventPayload: {
        associatedSupplementName,
        completedTaskIds,
        resolvedSupplementId: supplementId,
        resolution: input.listStatus,
        supplementName
      },
      eventType,
      taskIds: completedTaskIds
    });

    await db`
      insert into public.supplement_admin_audit (
        id,
        supplement_id,
        action,
        actor,
        before_payload,
        after_payload
      )
      values (
        ${randomUUID()}::uuid,
        ${supplementId}::uuid,
        ${auditAction},
        ${input.actor ?? "admin_dashboard"},
        ${db.json(toJsonValue(task.payload ?? {}))},
        ${db.json({
          associatedSupplementName,
          completedTaskIds,
          confidence: input.confidence,
          listStatus: input.listStatus,
          maxAmount: input.maxAmount,
          maxUnit: input.maxUnit,
          safetyFlags,
          safetyNotes: input.safetyNotes,
          supplementName
        })}
      )
    `;
  }

  return {
    removedTaskIds: completedTaskIds.length > 0 ? completedTaskIds : [input.id]
  };
}

export async function decideAdminPlanReviewTask(
  input: DecideAdminPlanReviewTaskInput
): Promise<AdminReviewMutationResult> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  let followupTaskId: string | null = null;

  {
    const db = sql;
    const tasks = await db<
      Array<{
        id: string;
        payload: Record<string, unknown>;
        plan_id: string | null;
        task_type: string;
      }>
    >`
      select
        tasks.id::text,
        coalesce(tasks.plan_id, safety_reviews.plan_id)::text as plan_id,
        tasks.payload,
        tasks.task_type
      from public.tasks
      left join lateral (
        select plan_id
        from public.safety_reviews
        where safety_reviews.task_id = tasks.id
        order by safety_reviews.opened_at asc
        limit 1
      ) safety_reviews on true
      where tasks.id = ${input.id}::uuid
        and tasks.task_type = any(${[...REVIEW_TASK_TYPES]}::text[])
        and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
    `;
    const task = tasks[0];

    if (!task?.plan_id) {
      throw new Error("Plan-specific review task not found");
    }

    const itemColumnsAvailable = await safetyReviewItemColumnsAvailable(db);
    const safetyReviews = itemColumnsAvailable
      ? await db<SafetyReviewDecisionRow[]>`
          select
            client_notification_status,
            id::text,
            ai_suggestion,
            item_name,
            item_type,
            supplement_name,
            task_id::text
          from public.safety_reviews
          where task_id = ${input.id}::uuid
            and plan_id = ${task.plan_id}::uuid
            and status in ('open', 'in_review', 'escalated')
          order by opened_at asc
          limit 1
        `
      : await db<SafetyReviewDecisionRow[]>`
          select
            client_notification_status,
            id::text,
            ai_suggestion,
            null::text as item_name,
            case
              when ${task.task_type} in ('classify_food', 'review_food_for_plan')
                then 'food'
              else 'supplement'
            end as item_type,
            supplement_name,
            task_id::text
          from public.safety_reviews
          where task_id = ${input.id}::uuid
            and plan_id = ${task.plan_id}::uuid
            and status in ('open', 'in_review', 'escalated')
          order by opened_at asc
          limit 1
        `;
    const review = safetyReviews[0];

    if (!review) {
      throw new Error("Safety review not found");
    }

    const itemType = review.item_type === "food" ? "food" : "supplement";
    const reviewedItemName = review.item_name ?? review.supplement_name;

    if (itemType === "food") {
      const foodGuidanceRows = await db<FoodGuidanceRow[]>`
        select guidance, model_version, version
        from public.food_guidance
        where plan_id = ${task.plan_id}::uuid
        order by version desc, generated_at desc
        limit 1
      `;
      const foodGuidance = foodGuidanceRows[0];

      if (!foodGuidance) {
        throw new Error("Food guidance not found");
      }

      const nextFoodGuidance = applyReviewDecisionToFoodGuidance(
        foodGuidance.guidance,
        {
          decision: input.decision,
          foodFrequency: input.foodFrequency,
          aiSuggestion: review.ai_suggestion,
          foodRationale: input.foodRationale,
          foodServing: input.foodServing,
          foodName: reviewedItemName,
          reviewId: review.id,
          reviewTaskId: input.id
        }
      );
      const nextVersion = await appendReviewedFoodGuidanceVersion(db, {
        foodGuidance: nextFoodGuidance,
        planId: task.plan_id,
        previousModelVersion: foodGuidance.model_version,
        reviewEvent:
          input.decision === "approve"
            ? "human_review_approved"
            : "human_review_disapproved"
      });

      await db`
        update public.safety_reviews
        set
          status = ${input.decision === "approve" ? "accepted" : "rejected"},
          reviewed_at = now(),
          closed_at = now(),
          reviewer_id = ${input.actor ?? "admin_dashboard"},
          reviewer_note = ${input.reviewerNote ?? null},
          client_message = ${db.json(
            toJsonValue({
              decision: input.decision,
              frequency: input.foodFrequency,
              rationale: input.foodRationale,
              serving: input.foodServing
            })
          )},
          client_notification_status = case
            when client_notification_status = 'not_required' then 'not_required'
            else 'queued'
          end,
          safety_context = safety_context || ${db.json(
            toJsonValue({
              reviewedFoodGuidanceVersion: nextVersion
            })
          )}::jsonb,
          updated_at = now()
        where id = ${review.id}::uuid
      `;

      await completeSupplementReviewTasks(db, {
        actor: input.actor,
        commentBody:
          input.decision === "approve"
            ? "Approved for the client food guidance."
            : "Disapproved and removed from the client food guidance.",
        eventPayload: {
          decision: input.decision,
          foodGuidanceVersion: nextVersion,
          foodName: reviewedItemName,
          safetyReviewId: review.id
        },
        eventType:
          input.decision === "approve"
            ? "food_review_approved"
            : "food_review_disapproved",
        taskIds: [input.id]
      });

      followupTaskId =
        review.client_notification_status === "not_required"
          ? null
          : await queueClientSafetyFollowupTask(db, {
              actor: input.actor,
              parentTaskId: review.task_id,
              planId: task.plan_id
            });

      notifyTaskQueueChanged();
      await queueProductMatchAfterPlanReview({
        parentTaskId: input.id,
        planId: task.plan_id
      });

      return {
        followupTaskId,
        removedTaskIds: [input.id]
      };
    }

    if (
      input.decision === "approve" &&
      (!input.clientDoseAmount ||
        input.clientDoseAmount <= 0 ||
        !input.clientDoseUnit?.trim())
    ) {
      throw new Error("Client dose is required to approve a review");
    }

    const formulations = await db<FormulationRow[]>`
      select formulation, model_version, version
      from public.formulations
      where plan_id = ${task.plan_id}::uuid
      order by version desc, generated_at desc
      limit 1
    `;
    const formulation = formulations[0];

    if (!formulation) {
      throw new Error("Formulation not found");
    }

    const nextFormulation = applyReviewDecisionToFormulation(
      formulation.formulation,
      {
        clientDoseAmount: input.clientDoseAmount,
        clientDoseUnit: input.clientDoseUnit,
        decision: input.decision,
        aiSuggestion: review.ai_suggestion,
        reviewId: review.id,
        reviewTaskId: input.id,
        supplementName: review.supplement_name
      }
    );
    const clientDose =
      input.decision === "approve"
        ? clientDoseText(input.clientDoseAmount, input.clientDoseUnit)
        : null;

    const nextVersion = await appendReviewedFormulationVersion(db, {
      formulation: nextFormulation,
      planId: task.plan_id,
      previousModelVersion: formulation.model_version,
      reviewEvent:
        input.decision === "approve"
          ? "human_review_approved"
          : "human_review_disapproved"
    });

    await db`
      update public.safety_reviews
      set
        status = ${input.decision === "approve" ? "accepted" : "rejected"},
        formulation_version = ${nextVersion},
        reviewed_at = now(),
        closed_at = now(),
        reviewer_id = ${input.actor ?? "admin_dashboard"},
        reviewer_note = ${input.reviewerNote ?? null},
        client_message = ${db.json(
          toJsonValue({
            decision: input.decision,
            dose: clientDose
          })
        )},
        client_notification_status = case
          when client_notification_status = 'not_required' then 'not_required'
          else 'queued'
        end,
        safety_context = safety_context || ${db.json(
          toJsonValue({
            reviewedFormulationVersion: nextVersion
          })
        )}::jsonb,
        updated_at = now()
      where id = ${review.id}::uuid
    `;

    await completeSupplementReviewTasks(db, {
      actor: input.actor,
      commentBody:
        input.decision === "approve"
          ? `Approved for the client at ${clientDose}.`
          : "Disapproved and removed from the client formulation.",
      eventPayload: {
        clientDose,
        decision: input.decision,
        formulationVersion: nextVersion,
        safetyReviewId: review.id,
        supplementName: review.supplement_name
      },
      eventType:
        input.decision === "approve"
        ? "supplement_review_approved"
        : "supplement_review_disapproved",
      taskIds: [input.id]
    });

    followupTaskId =
      review.client_notification_status === "not_required"
        ? null
        : await queueClientSafetyFollowupTask(db, {
            actor: input.actor,
            parentTaskId: review.task_id,
            planId: task.plan_id
          });

    if (followupTaskId) {
      await db`
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
          ${randomUUID()}::uuid,
          ${input.id}::uuid,
          'client_safety_followup_grouped',
          'requested',
          'medium',
          ${db.json(
            toJsonValue({
              followupTaskId,
              planId: task.plan_id
            })
          )},
          now(),
          now()
        )
      `;
    }

    await queueProductMatchAfterPlanReview({
      parentTaskId: input.id,
      planId: task.plan_id
    });
  }

  return {
    followupTaskId,
    removedTaskIds: [input.id]
  };
}
