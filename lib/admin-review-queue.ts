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

export type AdminReviewJobRow = Readonly<{
  actionOptions: string[];
  clientDoseAmount: number | null;
  clientDoseText: string | null;
  clientDoseUnit: string | null;
  flagReason: string | null;
  id: string;
  limitAmount: number | null;
  limitUnit: string | null;
  maxAmount: number | null;
  maxUnit: string | null;
  newDose: string | null;
  originalDose: string | null;
  planId: string | null;
  priority: number;
  queuedAt: string;
  requiredFields: string[];
  reviewId: string | null;
  reviewKind: string;
  status: string;
  supplementName: string;
}>;

export type AdminReviewQueueData = Readonly<{
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminReviewJobRow[];
  summary: {
    doseReduced: number;
    reviewRequired: number;
    total: number;
    unknown: number;
  };
}>;

type ReviewJobDbRow = Readonly<{
  ai_suggestion: Record<string, unknown> | null;
  flag_reason: string | null;
  goal_id?: string | null;
  id: string;
  limit_unit: string | null;
  limit_value: number | string | null;
  payload: Record<string, unknown> | null;
  plan_id: string | null;
  priority: number | string;
  queued_at: Date | string;
  review_id: string | null;
  status: string;
  suggested_dose_unit: string | null;
  suggested_dose_value: number | string | null;
  task_id?: string | null;
}>;

type Db = postgres.Sql | postgres.TransactionSql;

type CompletedTaskRow = Readonly<{
  goal_id: string;
  id: string;
}>;

type FormulationRow = Readonly<{
  formulation: Record<string, unknown>;
  model_version: string | null;
  version: number;
}>;

type SafetyReviewDecisionRow = Readonly<{
  client_notification_status: string;
  goal_id: string | null;
  id: string;
  supplement_name: string;
  task_id: string | null;
}>;

const REVIEW_TASK_TYPES = [
  "classify_supplement",
  "review_supplement_for_plan",
  "dose_reduction_notice",
  "client_safety_followup"
] as const;

export type ResolveAdminReviewJobInput = Readonly<{
  actor?: string | null;
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

export type DecideAdminPlanReviewJobInput = Readonly<{
  actor?: string | null;
  clientDoseAmount: number | null;
  clientDoseUnit: string | null;
  decision: "approve" | "disapprove";
  id: string;
  reviewerNote?: string | null;
}>;

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function localizedText(value: unknown) {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  const record = recordOrNull(value);

  if (!record) {
    return null;
  }

  return textOrNull(record.en) ?? textOrNull(record.th);
}

function formatReviewDose(amount: number | null, unit: string | null) {
  if (amount === null) {
    return null;
  }

  const formatted = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/\.?0+$/g, "");

  return `${formatted} ${unit ?? ""}`.trim();
}

function preferredClientDoseUnit(
  suggestedUnit: string | null,
  fallbackUnit: string | null
) {
  if (
    suggestedUnit &&
    fallbackUnit &&
    !suggestedUnit.includes("/") &&
    fallbackUnit.toLowerCase().startsWith(`${suggestedUnit.toLowerCase()}/`)
  ) {
    return fallbackUnit;
  }

  return suggestedUnit ?? fallbackUnit;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function supplementCategory(value: string | null | undefined) {
  if (
    !value ||
    [
      "Dose reduced",
      "Dose unverified",
      "Review required",
      "Unknown supplement",
      "ลดขนาดแล้ว",
      "ยังตรวจขนาดไม่ได้",
      "ต้องรีวิว",
      "อาหารเสริมใหม่"
    ].includes(value)
  ) {
    return "Admin review";
  }

  return value;
}

function emptyAdminReviewQueueData(): AdminReviewQueueData {
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

function rowFromDb(row: ReviewJobDbRow): AdminReviewJobRow {
  const payload = row.payload ?? {};
  const aiSuggestion = row.ai_suggestion ?? {};
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
    id: row.id,
    limitAmount: numberOrNull(row.limit_value),
    limitUnit: row.limit_unit,
    maxAmount: numberOrNull(payload.maxAmount),
    maxUnit: textOrNull(payload.maxUnit),
    newDose: textOrNull(payload.newDose),
    originalDose: textOrNull(payload.originalDose),
    planId: row.plan_id,
    priority: Number(row.priority) || 0,
    queuedAt: new Date(row.queued_at).toISOString(),
    requiredFields: textArray(payload.requiredFields),
    reviewId: row.review_id,
    reviewKind: textOrNull(payload.reviewKind) ?? "review_required",
    status: row.status,
    supplementName:
      textOrNull(payload.supplementName) ??
      textOrNull(payload.normalizedSupplementName) ??
      "Unknown supplement"
  };
}

function buildSummary(rows: AdminReviewJobRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.reviewKind === "dose_reduced") {
        summary.doseReduced += 1;
      } else if (row.reviewKind === "unknown_supplement") {
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

async function loadLegacyReviewRows(sql: postgres.Sql) {
  return sql<ReviewJobDbRow[]>`
      select
        jobs.id::text,
        null::text as goal_id,
        null::text as task_id,
        jobs.plan_id::text,
        jobs.status,
        jobs.priority,
        jobs.payload,
        jobs.queued_at,
        safety_reviews.id::text as review_id,
        safety_reviews.flag_reason,
        safety_reviews.suggested_dose_value,
        safety_reviews.suggested_dose_unit,
        safety_reviews.limit_value,
        safety_reviews.limit_unit,
        safety_reviews.ai_suggestion
      from public.jobs jobs
      left join lateral (
        select *
        from public.safety_reviews safety_reviews
        where safety_reviews.job_id = jobs.id
        order by safety_reviews.opened_at asc
        limit 1
      ) safety_reviews on true
      where jobs.job_type = 'supplement_review'
        and jobs.status = 'queued'
      order by jobs.priority desc, jobs.queued_at asc
      limit 200
    `;
}

async function loadTaskBackedReviewRows(sql: postgres.Sql) {
  return sql<ReviewJobDbRow[]>`
      with task_reviews as (
        select
          jobs.id::text,
          tasks.goal_id::text,
          tasks.id::text as task_id,
          jobs.plan_id::text,
          jobs.status,
          tasks.priority,
          coalesce(jobs.payload, '{}'::jsonb) || coalesce(tasks.payload, '{}'::jsonb) as payload,
          jobs.queued_at,
          safety_reviews.id::text as review_id,
          safety_reviews.flag_reason,
          safety_reviews.suggested_dose_value,
          safety_reviews.suggested_dose_unit,
          safety_reviews.limit_value,
          safety_reviews.limit_unit,
          safety_reviews.ai_suggestion
        from public.tasks tasks
        join public.jobs jobs on jobs.id = tasks.legacy_job_id
        left join lateral (
          select *
          from public.safety_reviews safety_reviews
          where safety_reviews.job_id = jobs.id
          order by safety_reviews.opened_at asc
          limit 1
        ) safety_reviews on true
        where tasks.task_type = any(${[...REVIEW_TASK_TYPES]}::text[])
          and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
          and jobs.job_type = 'supplement_review'
          and jobs.status = 'queued'
      ),
      legacy_reviews as (
        select
          jobs.id::text,
          null::text as goal_id,
          null::text as task_id,
          jobs.plan_id::text,
          jobs.status,
          jobs.priority,
          jobs.payload,
          jobs.queued_at,
          safety_reviews.id::text as review_id,
          safety_reviews.flag_reason,
          safety_reviews.suggested_dose_value,
          safety_reviews.suggested_dose_unit,
          safety_reviews.limit_value,
          safety_reviews.limit_unit,
          safety_reviews.ai_suggestion
        from public.jobs jobs
        left join lateral (
          select *
          from public.safety_reviews safety_reviews
          where safety_reviews.job_id = jobs.id
          order by safety_reviews.opened_at asc
          limit 1
        ) safety_reviews on true
        where jobs.job_type = 'supplement_review'
          and jobs.status = 'queued'
          and not exists (
            select 1
            from public.tasks tasks
            where tasks.legacy_job_id = jobs.id
              and tasks.task_type = any(${[...REVIEW_TASK_TYPES]}::text[])
              and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
          )
      )
      select *
      from task_reviews
      union all
      select *
      from legacy_reviews
      order by priority desc, queued_at asc
      limit 200
    `;
}

export async function getAdminReviewQueueData(): Promise<AdminReviewQueueData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminReviewQueueData();
  }

  try {
    let rows: ReviewJobDbRow[];

    try {
      rows = await loadTaskBackedReviewRows(sql);
    } catch (error) {
      console.warn("Unable to load task-backed review queue; falling back to legacy jobs", error);
      rows = await loadLegacyReviewRows(sql);
    }

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
    jobIds?: readonly string[];
    taskIds?: readonly string[];
  }>
) {
  if (!(await taskTablesAvailable(transaction))) {
    return [];
  }

  const jobIds = [...(input.jobIds ?? [])];
  const taskIds = [...(input.taskIds ?? [])];

  if (jobIds.length < 1 && taskIds.length < 1) {
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
      and (
        (${jobIds.length > 0} and legacy_job_id = any(${jobIds}::uuid[]))
        or (${taskIds.length > 0} and id = any(${taskIds}::uuid[]))
      )
    returning id::text, goal_id::text
  `;

  for (const task of tasks) {
    await transaction`
      insert into public.task_comments (
        id,
        task_id,
        goal_id,
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
        ${task.goal_id}::uuid,
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
        goal_id,
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
        ${task.goal_id}::uuid,
        ${input.eventType},
        'succeeded',
        'medium',
        ${transaction.json(resultPayload)},
        now(),
        now()
      )
    `;
  }

  const goalIds = Array.from(new Set(tasks.map((task) => task.goal_id)));

  if (goalIds.length > 0) {
    await transaction`
      update public.goals
      set
        status = 'completed',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where id = any(${goalIds}::uuid[])
        and not exists (
          select 1
          from public.tasks
          where tasks.goal_id = goals.id
            and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
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
    reviewJobId: string;
  }>
) {
  const versionRows = await transaction<{ version: number }[]>`
    select coalesce(max(version), 0) + 1 as version
    from public.formulations
    where plan_id = ${input.planId}::uuid
  `;
  const version = Number(versionRows[0]?.version ?? 1);
  const modelVersion = [
    input.previousModelVersion ?? "manual",
    input.reviewEvent
  ].join(":");

  await transaction`
    insert into public.formulations (
      plan_id,
      version,
      formulation,
      model_version,
      generated_at,
      updated_at
    )
    values (
      ${input.planId}::uuid,
      ${version},
      ${transaction.json(toJsonValue(input.formulation))},
      ${modelVersion},
      now(),
      now()
    )
  `;

  await transaction`
    insert into public.job_audit_events (
      id,
      job_id,
      plan_id,
      event_type,
      level,
      event_payload,
      created_at
    )
    values (
      ${randomUUID()}::uuid,
      ${input.reviewJobId}::uuid,
      ${input.planId}::uuid,
      'formulation_review_version_written',
      'medium',
      ${transaction.json(
        toJsonValue({
          formulationVersion: version,
          previousModelVersion: input.previousModelVersion,
          reviewEvent: input.reviewEvent
        })
      )},
      now()
    )
  `;

  return version;
}

async function queueClientSafetyFollowupTask(
  transaction: Db,
  input: Readonly<{
    actor?: string | null;
    clientDose: string | null;
    decision: "approve" | "disapprove";
    goalId: string | null;
    parentTaskId: string | null;
    planId: string;
    reviewJobId: string;
    safetyReviewId: string;
    supplementName: string;
  }>
) {
  if (!input.goalId || !(await taskTablesAvailable(transaction))) {
    return null;
  }

  const idempotencyKey = `client-safety-followup:${input.safetyReviewId}`;
  const existing = await transaction<{ id: string }[]>`
    select id::text
    from public.tasks
    where goal_id = ${input.goalId}::uuid
      and idempotency_key = ${idempotencyKey}
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
    order by created_at desc
    limit 1
  `;

  if (existing[0]?.id) {
    return existing[0].id;
  }

  const goalRows = await transaction<{ priority: number | string }[]>`
    select priority
    from public.goals
    where id = ${input.goalId}::uuid
    limit 1
  `;
  const goalPriority = Number(goalRows[0]?.priority ?? 3);
  const priority = Math.min(
    6,
    Math.max(5, Number.isFinite(goalPriority) ? goalPriority : 3)
  );
  const taskId = randomUUID();
  const title = `Notify client about ${input.supplementName}`;
  const payloadObject = {
    clientDose: input.clientDose,
    decision: input.decision,
    planId: input.planId,
    reviewJobId: input.reviewJobId,
    safetyReviewId: input.safetyReviewId,
    source: "human_review_completion",
    supplementName: input.supplementName
  };
  const payload = toJsonValue(payloadObject);

  await transaction`
    insert into public.tasks (
      id,
      goal_id,
      parent_task_id,
      plan_id,
      task_type,
      title,
      description,
      actor_type,
      status,
      priority,
      required_capabilities,
      reasoning_effort,
      payload,
      idempotency_key,
      max_attempts,
      scheduled_for,
      created_at,
      updated_at
    )
    values (
      ${taskId}::uuid,
      ${input.goalId}::uuid,
      ${input.parentTaskId ?? null}::uuid,
      ${input.planId}::uuid,
      'client_safety_followup',
      ${title},
      'Tell the client that a human safety review has been completed.',
      'deterministic',
      'queued',
      ${priority},
      ${["client_safety_followup"]}::text[],
      'none',
      ${transaction.json(payload)},
      ${idempotencyKey},
      1,
      now(),
      now(),
      now()
    )
  `;

  await transaction`
    update public.goals
    set
      status = case
        when status in ('completed', 'open') then 'active'
        else status
      end,
      completed_at = case
        when status = 'completed' then null
        else completed_at
      end,
      updated_at = now()
    where id = ${input.goalId}::uuid
  `;

  await transaction`
    insert into public.task_comments (
      id,
      task_id,
      goal_id,
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
      ${input.goalId}::uuid,
      'system',
      'MattaNutra safety',
      'admin',
      'instruction',
      'A human safety review is complete. Contact the client through the best available channel.',
      ${transaction.json(payload)},
      now()
    )
  `;

  await transaction`
    insert into public.task_events (
      id,
      task_id,
      goal_id,
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
      ${input.goalId}::uuid,
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

  return taskId;
}

export async function dismissAdminReviewJob({
  actor,
  id
}: Readonly<{
  actor?: string | null;
  id: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await sql.begin(async (transaction) => {
    const updated = await transaction<{ id: string }[]>`
      update public.jobs
      set
        status = 'complete',
        completed_at = now(),
        updated_at = now()
      where id = ${id}::uuid
        and job_type = 'supplement_review'
        and status = 'queued'
      returning id::text
    `;

    if (!updated[0]) {
      throw new Error("Review job not found");
    }

    await transaction`
      update public.safety_reviews
      set
        status = 'closed',
        reviewed_at = coalesce(reviewed_at, now()),
        closed_at = now(),
        reviewer_id = ${actor ?? "admin_dashboard"},
        reviewer_note = coalesce(reviewer_note, 'Dismissed from admin review queue.'),
        client_notification_status = 'not_required',
        updated_at = now()
      where job_id = ${id}::uuid
        and status in ('open', 'in_review', 'escalated')
    `;

    await completeSupplementReviewTasks(transaction, {
      actor,
      commentBody: "Dismissed from admin review queue.",
      eventPayload: {
        legacyJobId: id
      },
      eventType: "supplement_review_dismissed",
      jobIds: [id]
    });

    await transaction`
      insert into public.job_audit_events (
        id,
        job_id,
        event_type,
        level,
        event_payload,
        created_at
      )
      values (
        ${randomUUID()}::uuid,
        ${id}::uuid,
        'supplement_review_dismissed',
        'low',
        ${transaction.json({ actor: actor ?? "admin_dashboard" })},
        now()
      )
    `;
  });

  return getAdminReviewQueueData();
}

export async function resolveAdminReviewJob(input: ResolveAdminReviewJobInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const supplementName = input.supplementName.trim();
  const normalizedSupplementName = normalizeName(supplementName);

  if (!supplementName || !normalizedSupplementName) {
    throw new Error("Supplement name is required");
  }

  await sql.begin(async (transaction) => {
    const jobs = await transaction<
      Array<{
        id: string;
        payload: Record<string, unknown>;
        plan_id: string | null;
      }>
    >`
      select id::text, plan_id::text, payload
      from public.jobs
      where id = ${input.id}::uuid
        and job_type = 'supplement_review'
        and status = 'queued'
      for update
    `;
    const job = jobs[0];

    if (!job) {
      throw new Error("Review job not found");
    }

    const supplementRows = await transaction<{ id: string }[]>`
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
        ${transaction.json({
          jobId: input.id,
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
    const supplementId = supplementRows[0]?.id;

    if (!supplementId) {
      throw new Error("Supplement could not be resolved");
    }

    const latestLimit = await transaction<{ version: number | null }[]>`
      select max(version)::integer as version
      from public.supplement_safety_limits
      where supplement_id = ${supplementId}::uuid
    `;
    const version = latestLimit[0]?.version ?? null;
    const safetyFlags = normalizeSupplementSafetyFlags(input.safetyFlags);

    if (version) {
      await transaction`
        update public.supplement_safety_limits
        set
          max_amount = ${input.maxAmount},
          max_unit = ${input.maxUnit},
          confidence = ${input.confidence},
          safety_flags = ${safetyFlags},
          safety_notes = ${input.safetyNotes},
          updated_at = now()
        where supplement_id = ${supplementId}::uuid
          and version = ${version}
      `;
    } else {
      await transaction`
        insert into public.supplement_safety_limits (
          id,
          supplement_id,
          version,
          max_amount,
          max_unit,
          confidence,
          safety_flags,
          safety_notes,
          created_at,
          updated_at
        )
        values (
          ${randomUUID()}::uuid,
          ${supplementId}::uuid,
          1,
          ${input.maxAmount},
          ${input.maxUnit},
          ${input.confidence},
          ${safetyFlags},
          ${input.safetyNotes},
          now(),
          now()
        )
      `;
    }

    const completedJobs = await transaction<
      Array<{
        id: string;
        plan_id: string | null;
      }>
    >`
      update public.jobs
      set
        status = 'complete',
        completed_at = now(),
        updated_at = now(),
        payload = payload || ${transaction.json({
          resolvedSupplementId: supplementId,
          resolvedSupplementName: supplementName,
          resolution: input.listStatus
        })}::jsonb
      where job_type = 'supplement_review'
        and status = 'queued'
        and (
          id = ${input.id}::uuid
          or payload ->> 'normalizedSupplementName' = ${normalizedSupplementName}
          or lower(payload ->> 'supplementName') = lower(${supplementName})
          or trim(both '_' from regexp_replace(lower(coalesce(payload ->> 'normalizedSupplementName', '')), '[^a-z0-9]+', '_', 'g')) = ${normalizedSupplementName}
          or trim(both '_' from regexp_replace(lower(coalesce(payload ->> 'supplementName', '')), '[^a-z0-9]+', '_', 'g')) = ${normalizedSupplementName}
      )
      returning id::text, plan_id::text
    `;
    const completedJobIds = completedJobs.map((row) => row.id);

    await transaction`
      update public.safety_reviews
      set
        status = 'closed',
        reviewed_at = coalesce(reviewed_at, now()),
        closed_at = now(),
        reviewer_id = ${input.actor ?? "admin_dashboard"},
        reviewer_note = ${`Resolved as ${input.listStatus} from admin review queue.`},
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

    await completeSupplementReviewTasks(transaction, {
      actor: input.actor,
      commentBody: `Resolved as ${input.listStatus}.`,
      eventPayload: {
        completedJobIds,
        resolvedSupplementId: supplementId,
        resolution: input.listStatus,
        supplementName
      },
      eventType: "supplement_review_resolved",
      jobIds: completedJobIds
    });

    await transaction`
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
        'review_resolved',
        ${input.actor ?? "admin_dashboard"},
        ${transaction.json(toJsonValue(job.payload ?? {}))},
        ${transaction.json({
          completedJobIds,
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

    for (const completedJob of completedJobs) {
      await transaction`
        insert into public.job_audit_events (
          id,
          job_id,
          plan_id,
          event_type,
          level,
          event_payload,
          created_at
        )
        values (
          ${randomUUID()}::uuid,
          ${completedJob.id}::uuid,
          ${completedJob.plan_id}::uuid,
          'supplement_review_resolved',
          'low',
          ${transaction.json({
            actor: input.actor ?? "admin_dashboard",
            resolvedSupplementId: supplementId,
            resolution: input.listStatus,
            supplementName
          })},
          now()
        )
      `;
    }
  });

  return getAdminReviewQueueData();
}

function localized(en: string) {
  return { en, th: en };
}

function clientDoseText(amount: number | null, unit: string | null) {
  const dose = formatReviewDose(amount, unit);

  if (!dose) {
    throw new Error("Client dose is required");
  }

  return dose;
}

function ingredientMatchesReview(
  ingredient: Record<string, unknown>,
  input: {
    reviewId: string | null;
    reviewJobId: string;
    supplementName: string;
  }
) {
  const safety = recordOrNull(ingredient.safety);
  const supplementName = localizedText(ingredient.supplement);

  return (
    safety?.reviewJobId === input.reviewJobId ||
    safety?.reviewId === input.reviewId ||
    (supplementName !== null &&
      normalizeName(supplementName) === normalizeName(input.supplementName))
  );
}

function applyReviewDecisionToFormulation(
  formulation: Record<string, unknown>,
  input: {
    clientDoseAmount: number | null;
    clientDoseUnit: string | null;
    decision: "approve" | "disapprove";
    reviewId: string | null;
    reviewJobId: string;
    supplementName: string;
  }
) {
  const supplementBreakdown = Array.isArray(formulation.supplementBreakdown)
    ? formulation.supplementBreakdown
    : [];
  let changedCount = 0;
  const nextBreakdown = supplementBreakdown.flatMap((item) => {
    const ingredient = recordOrNull(item);

    if (!ingredient || !ingredientMatchesReview(ingredient, input)) {
      return [item];
    }

    changedCount += 1;

    if (input.decision === "disapprove") {
      return [];
    }

    return [
      {
        ...ingredient,
        dailyDose: localized(clientDoseText(input.clientDoseAmount, input.clientDoseUnit)),
        safety: {
          ...(recordOrNull(ingredient.safety) ?? {}),
          action: "human_review",
          message: localized("Approved by MattaNutra human review."),
          reviewId: input.reviewId ?? undefined,
          reviewJobId: input.reviewJobId,
          visibility: "visible"
        },
        status: ingredient.status === "review" ? "add" : ingredient.status
      }
    ];
  });

  if (changedCount < 1) {
    throw new Error("Reviewed supplement was not found in formulation");
  }

  const summary = recordOrNull(formulation.safetySummary);
  const nextSummary = summary
    ? {
        ...summary,
        hiddenCount: Math.max(0, Number(summary.hiddenCount ?? 0) - changedCount),
        removedCount:
          input.decision === "disapprove"
            ? Number(summary.removedCount ?? 0) + changedCount
            : Number(summary.removedCount ?? 0),
        reviewCount: Math.max(0, Number(summary.reviewCount ?? 0) - changedCount)
      }
    : summary;

  return {
    ...formulation,
    safetySummary: nextSummary,
    supplementBreakdown: nextBreakdown
  };
}

export async function decideAdminPlanReviewJob(
  input: DecideAdminPlanReviewJobInput
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (
    input.decision === "approve" &&
    (!input.clientDoseAmount ||
      input.clientDoseAmount <= 0 ||
      !input.clientDoseUnit?.trim())
  ) {
    throw new Error("Client dose is required to approve a review");
  }

  await sql.begin(async (transaction) => {
    const jobs = await transaction<
      Array<{
        id: string;
        payload: Record<string, unknown>;
        plan_id: string | null;
      }>
    >`
      select id::text, plan_id::text, payload
      from public.jobs
      where id = ${input.id}::uuid
        and job_type = 'supplement_review'
        and status = 'queued'
      for update
    `;
    const job = jobs[0];

    if (!job?.plan_id) {
      throw new Error("Plan-specific review job not found");
    }

    const safetyReviews = await transaction<SafetyReviewDecisionRow[]>`
      select
        client_notification_status,
        goal_id::text,
        id::text,
        supplement_name,
        task_id::text
      from public.safety_reviews
      where job_id = ${input.id}::uuid
        and plan_id = ${job.plan_id}::uuid
        and status in ('open', 'in_review', 'escalated')
      order by opened_at asc
      limit 1
      for update
    `;
    const review = safetyReviews[0];

    if (!review) {
      throw new Error("Safety review not found");
    }

    const formulations = await transaction<FormulationRow[]>`
      select formulation, model_version, version
      from public.formulations
      where plan_id = ${job.plan_id}::uuid
      order by version desc, generated_at desc
      limit 1
      for update
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
        reviewId: review.id,
        reviewJobId: input.id,
        supplementName: review.supplement_name
      }
    );
    const clientDose =
      input.decision === "approve"
        ? clientDoseText(input.clientDoseAmount, input.clientDoseUnit)
        : null;

    const nextVersion = await appendReviewedFormulationVersion(transaction, {
      formulation: nextFormulation,
      planId: job.plan_id,
      previousModelVersion: formulation.model_version,
      reviewEvent:
        input.decision === "approve"
          ? "human_review_approved"
          : "human_review_disapproved",
      reviewJobId: input.id
    });
    const followupTaskId =
      review.client_notification_status === "not_required"
        ? null
        : await queueClientSafetyFollowupTask(transaction, {
            actor: input.actor,
            clientDose,
            decision: input.decision,
            goalId: review.goal_id,
            parentTaskId: review.task_id,
            planId: job.plan_id,
            reviewJobId: input.id,
            safetyReviewId: review.id,
            supplementName: review.supplement_name
          });

    await transaction`
      update public.safety_reviews
      set
        status = ${input.decision === "approve" ? "accepted" : "rejected"},
        formulation_version = ${nextVersion},
        reviewed_at = now(),
        closed_at = now(),
        reviewer_id = ${input.actor ?? "admin_dashboard"},
        reviewer_note = ${input.reviewerNote ?? null},
        client_message = ${transaction.json(
          toJsonValue({
            decision: input.decision,
            dose: clientDose
          })
        )},
        client_notification_status = case
          when client_notification_status = 'not_required' then 'not_required'
          else 'queued'
        end,
        safety_context = safety_context || ${transaction.json(
          toJsonValue({
            followupTaskId,
            reviewedFormulationVersion: nextVersion
          })
        )}::jsonb,
        updated_at = now()
      where id = ${review.id}::uuid
    `;

    await transaction`
      update public.jobs
      set
        status = 'complete',
        completed_at = now(),
        updated_at = now(),
        payload = payload || ${transaction.json(
          toJsonValue({
            decision: input.decision,
            formulationVersion: nextVersion,
            followupTaskId,
            reviewedDose: clientDose,
            safetyReviewId: review.id
          })
        )}::jsonb
      where id = ${input.id}::uuid
    `;

    await completeSupplementReviewTasks(transaction, {
      actor: input.actor,
      commentBody:
        input.decision === "approve"
          ? `Approved for the client at ${clientDose}.`
          : "Disapproved and removed from the client formulation.",
      eventPayload: {
        clientDose,
        decision: input.decision,
        formulationVersion: nextVersion,
        followupTaskId,
        safetyReviewId: review.id,
        supplementName: review.supplement_name
      },
      eventType:
        input.decision === "approve"
          ? "supplement_review_approved"
          : "supplement_review_disapproved",
      jobIds: [input.id]
    });

    await transaction`
      insert into public.job_audit_events (
        id,
        job_id,
        plan_id,
        event_type,
        level,
        event_payload,
        created_at
      )
      values (
        ${randomUUID()}::uuid,
        ${input.id}::uuid,
        ${job.plan_id}::uuid,
        ${input.decision === "approve" ? "supplement_review_approved" : "supplement_review_disapproved"},
        'medium',
        ${transaction.json(
          toJsonValue({
            actor: input.actor ?? "admin_dashboard",
            clientDose,
            formulationVersion: nextVersion,
            followupTaskId,
            safetyReviewId: review.id,
            supplementName: review.supplement_name
          })
        )},
        now()
      )
    `;
  });

  return getAdminReviewQueueData();
}
