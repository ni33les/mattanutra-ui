import type postgres from "postgres";
import { createHash } from "node:crypto";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import {
  hasHealthScoreAdvice,
  isUuid,
  toJsonValue
} from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import { getSql } from "@/lib/db";
import { validateLeadEmail } from "@/lib/email-validation";
import { digitalOceanBillingSyncConfiguration } from "@/lib/finance-ledger";
import { isLocale, type Locale } from "@/lib/i18n";
import { requiredCapabilitiesForWorkTaskType } from "@/lib/system-agents";
import { createGoal, createTask } from "@/lib/task-service";

type StepState = "active" | "complete" | "failed" | "pending";
type WorkTaskType =
  | "analyze_healthscore"
  | "client_safety_followup"
  | "generate_example_formulation"
  | "generate_formulation"
  | "send_example_email"
  | "send_reassessment_email"
  | "sync_digitalocean_billing";

const globalWorker = globalThis as typeof globalThis & {
  mattanutraCronWorker?: Promise<{ queued: number }>;
};

const TASK_PRIORITIES = {
  billingSync: 1,
  exampleEmail: 2,
  exampleFormulation: 3,
  healthScoreAnalysis: 4,
  precision: 4,
  pro: 5,
  reassessment: 2
} as const;

function priorityForPlan(plan: AssessmentPlan) {
  return plan === "pro" ? TASK_PRIORITIES.pro : TASK_PRIORITIES.precision;
}

function deterministicUuid(seed: string) {
  const bytes = Buffer.from(
    createHash("sha256").update(seed).digest().subarray(0, 16)
  );

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

function fifteenMinuteBucket(date = new Date()) {
  const bucketMs = 15 * 60 * 1000;

  return new Date(
    Math.floor(date.getTime() / bucketMs) * bucketMs
  ).toISOString();
}

function payloadRecord(payload: unknown) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)])
    );
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

function stableHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")
    .slice(0, 24);
}

function healthScoreInputForIdempotency(healthScore: unknown) {
  const record = payloadRecord(healthScore);
  const input = { ...record };

  delete input.advice;
  return input;
}

function newUnsubscribeToken() {
  return crypto.randomUUID();
}

async function createWorkTask(input: Readonly<{
  actorType: "ai" | "deterministic";
  description?: string;
  goalId: string;
  goalTitle: string;
  idempotencyKey: string;
  idempotencyScope?: "active" | "successful";
  maxAttempts?: number;
  payload?: Record<string, unknown>;
  planId?: string | null;
  priority: number;
  retryPolicy?: false | {
    backoffMultiplier?: number;
    initialDelaySeconds?: number;
    maxDelaySeconds?: number;
    maxRetries?: number;
  };
  reasoningEffort: "medium" | "none";
  source: string;
  taskTitle: string;
  taskType: WorkTaskType;
}>) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const maxAttempts = input.maxAttempts ?? 3;
  const goal = await createGoal({
    context: {
      source: input.source,
      taskType: input.taskType,
      ...(input.payload ?? {})
    },
    id: input.goalId,
    planId: input.planId,
    priority: input.priority,
    source: input.source,
    title: input.goalTitle,
    type: "goal"
  });
  const { created, task } = await createTask({
    actorType: input.actorType,
    description: input.description,
    goalId: goal.id,
    idempotencyKey: input.idempotencyKey,
    idempotencyScope: input.idempotencyScope,
    initialComment: {
      authorName: "MattaNutra worker",
      authorType: "system",
      body: `${input.taskTitle} queued for task-backed processing.`,
      commentType: "instruction",
      metadata: {
        source: input.source,
        taskType: input.taskType
      },
      visibility: "worker"
    },
    maxAttempts,
    payload: {
      planId: input.planId,
      source: input.source,
      ...input.payload
    },
    planId: input.planId,
    priority: input.priority,
    reasoningEffort: input.reasoningEffort,
    requiredCapabilities: requiredCapabilitiesForWorkTaskType(input.taskType),
    retryPolicy:
      input.retryPolicy === false
        ? false
        : (input.retryPolicy ?? {
            backoffMultiplier: 2,
            initialDelaySeconds: 300,
            maxDelaySeconds: 3600,
            maxRetries: Math.max(0, maxAttempts - 1)
          }),
    taskType: input.taskType,
    title: input.taskTitle
  });

  if (created) {
    await sql`
      update public.goals
      set
        status = case when status = 'completed' then 'open' else status end,
        completed_at = case when status = 'completed' then null else completed_at end,
        updated_at = now()
      where id = ${goal.id}::uuid
    `;
  }

  return task.id;
}

export async function enqueueDigitalOceanBillingSyncTask(date = new Date()) {
  const config = digitalOceanBillingSyncConfiguration();

  if (!config.configured) {
    return {
      projects: config.projects,
      reason: config.reason,
      skipped: true,
      taskId: null
    };
  }

  const bucket = fifteenMinuteBucket(date);
  const goalId = deterministicUuid(
    `mattanutra:goal:digitalocean-billing-sync:${bucket}`
  );
  const idempotencyKey = `digitalocean-billing-sync:${bucket}`;
  const taskId = await createWorkTask({
    actorType: "deterministic",
    description:
      "Fetch DigitalOcean invoice-preview costs and write nominal hosting ledger rows.",
    goalId,
    goalTitle: "Sync DigitalOcean billing costs",
    idempotencyKey,
    idempotencyScope: "successful",
    maxAttempts: 2,
    payload: {
      bucket,
      projectNames: config.projects
    },
    priority: TASK_PRIORITIES.billingSync,
    reasoningEffort: "none",
    source: "cron",
    taskTitle: "Sync DigitalOcean billing costs",
    taskType: "sync_digitalocean_billing"
  });

  return {
    bucket,
    projects: config.projects,
    queued: Boolean(taskId),
    skipped: false,
    taskId
  };
}

export async function enqueueHealthScoreAnalysisTask({
  planId
}: Readonly<{
  planId: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const rows = await sql`
    select health_score
    from public.assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;

  if (!rows[0]) {
    return null;
  }

  if (hasHealthScoreAdvice(rows[0].health_score)) {
    return null;
  }

  const inputHash = stableHash(
    healthScoreInputForIdempotency(rows[0].health_score)
  );

  return createWorkTask({
    actorType: "ai",
    goalId: deterministicUuid(`mattanutra:goal:healthscore:${planId}`),
    goalTitle: "Analyze HealthScore",
    idempotencyKey: `healthscore-analysis:${planId}:${inputHash}`,
    idempotencyScope: "successful",
    payload: {},
    planId,
    priority: TASK_PRIORITIES.healthScoreAnalysis,
    reasoningEffort: "medium",
    source: "assessment",
    taskTitle: "Analyze HealthScore",
    taskType: "analyze_healthscore"
  });
}

export async function enqueueFormulationTask({
  answers,
  locale,
  plan,
  planId
}: Readonly<{
  answers?: unknown;
  locale?: unknown;
  plan: AssessmentPlan;
  planId: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const assessmentRows = await sql`
    select plan_id
    from public.assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;

  if (!assessmentRows[0]) {
    return null;
  }

  const taskId = await createWorkTask({
    actorType: "ai",
    goalId: deterministicUuid(`mattanutra:goal:formulation:${planId}`),
    goalTitle:
      plan === "pro"
        ? "Prepare Pro nutrition plan"
        : "Prepare Precision nutrition plan",
    idempotencyKey: `formulation:${planId}:${stableHash({
      answers,
      locale,
      plan
    })}`,
    idempotencyScope: "successful",
    payload: { answers, locale, plan },
    planId,
    priority: priorityForPlan(plan),
    reasoningEffort: "medium",
    source: "assessment",
    taskTitle: "Generate nutrition plan",
    taskType: "generate_formulation"
  });

  if (!taskId) {
    return null;
  }

  await sql`
    update public.assessments set
      selected_plan = ${plan},
      status = 'queued',
      queue_position = coalesce(queue_position, 1),
      error_message = null,
      plan_selected_at = coalesce(plan_selected_at, now()),
      updated_at = now()
    where plan_id = ${planId}::uuid
  `;

  return taskId;
}

async function enqueueExampleFormulationTask(
  planId: string,
  requestId: string
) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const taskId = await createWorkTask({
    actorType: "ai",
    goalId: deterministicUuid(`mattanutra:goal:free-example:${requestId}`),
    goalTitle: "Prepare Free nutrition plan email",
    idempotencyKey: `example-formulation:${requestId}`,
    idempotencyScope: "successful",
    payload: { priorityClass: "free_example", requestId },
    planId,
    priority: TASK_PRIORITIES.exampleFormulation,
    reasoningEffort: "medium",
    source: "free_example",
    taskTitle: "Generate Free nutrition plan",
    taskType: "generate_example_formulation"
  });

  if (taskId) {
    await sql`
      update public.assessment_example_requests set
        status = 'formulation_queued',
        updated_at = now()
      where id = ${requestId}::uuid
    `;
  }

  return taskId;
}

export async function enqueueExampleEmailTask(
  planId: string,
  requestId: string
) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const taskId = await createWorkTask({
    actorType: "deterministic",
    goalId: deterministicUuid(`mattanutra:goal:free-example:${requestId}`),
    goalTitle: "Prepare Free nutrition plan email",
    idempotencyKey: `example-email:${requestId}`,
    idempotencyScope: "active",
    maxAttempts: 2,
    payload: { priorityClass: "free_example", requestId },
    planId,
    priority: TASK_PRIORITIES.exampleEmail,
    reasoningEffort: "none",
    source: "free_example",
    taskTitle: "Send Free nutrition plan email",
    taskType: "send_example_email"
  });

  if (taskId) {
    await sql`
      update public.assessment_example_requests set
        status = 'email_queued',
        updated_at = now()
      where id = ${requestId}::uuid
    `;
  }

  return taskId;
}

export async function requestExampleBrief({
  email,
  locale,
  planId
}: Readonly<{
  email: string;
  locale?: unknown;
  planId: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const emailValidation = validateLeadEmail(email);

  if (!emailValidation.ok) {
    return null;
  }

  const assessmentRows = await sql`
    select health_score
    from public.assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;

  if (!assessmentRows[0]) {
    return null;
  }

  const existingRequests = await sql<{
    id: string;
    status: string;
    task_id: string | null;
  }[]>`
    select
      assessment_example_requests.id::text,
      assessment_example_requests.status,
      (
        select tasks.id::text
        from public.tasks
        where tasks.plan_id = assessment_example_requests.plan_id
          and tasks.payload ->> 'requestId' = assessment_example_requests.id::text
          and tasks.task_type in ('generate_example_formulation', 'send_example_email')
          and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
        order by tasks.created_at desc
        limit 1
      ) as task_id
    from public.assessment_example_requests
    where plan_id = ${planId}::uuid
      and lower(email) = ${emailValidation.email}
    order by requested_at desc
    limit 1
  `;
  const existingRequest = existingRequests[0];

  if (existingRequest && existingRequest.status === "email_sent") {
    return {
      requestId: existingRequest.id,
      taskId: existingRequest.task_id ?? ""
    };
  }

  if (existingRequest?.task_id) {
    return {
      requestId: existingRequest.id,
      taskId: existingRequest.task_id
    };
  }

  if (
    existingRequest &&
    (
      existingRequest.status === "formulation_ready" ||
      existingRequest.status === "email_queued" ||
      existingRequest.status === "email_rendered"
    )
  ) {
    return {
      requestId: existingRequest.id,
      taskId: (await enqueueExampleEmailTask(planId, existingRequest.id)) ?? ""
    };
  }

  if (
    existingRequest &&
    (
      existingRequest.status === "requested" ||
      existingRequest.status === "formulation_queued"
    )
  ) {
    return {
      requestId: existingRequest.id,
      taskId:
        (await enqueueExampleFormulationTask(planId, existingRequest.id)) ?? ""
    };
  }

  const requestId = crypto.randomUUID();
  const normalizedLocale: Locale = isLocale(locale) ? locale : "en";

  await sql`
    insert into public.assessment_example_requests (
      id,
      plan_id,
      email,
      locale,
      status,
      health_score,
      requested_at,
      updated_at
    )
    values (
      ${requestId}::uuid,
      ${planId}::uuid,
      ${emailValidation.email},
      ${normalizedLocale},
      'requested',
      ${sql.json(toJsonValue(assessmentRows[0].health_score))},
      now(),
      now()
    )
  `;

  const taskId = await enqueueExampleFormulationTask(planId, requestId);

  return { requestId, taskId };
}

function mapExampleRequestStatus(status: unknown) {
  if (status === "failed") {
    return "failed";
  }

  if (status === "email_sent") {
    return "ready";
  }

  if (status === "email_rendered") {
    return "failed";
  }

  return "preparing";
}

function buildExampleRequestSteps(status: unknown) {
  const mappedStatus = mapExampleRequestStatus(status);
  const isReady = mappedStatus === "ready";
  const isRequestQueued = status === "formulation_queued";
  const hasFailed = mappedStatus === "failed";
  const formulationState: StepState = isReady
    ? "complete"
    : hasFailed
      ? "failed"
      : "active";

  return [
    { id: "assessment", state: "complete" },
    { id: "score", state: "complete" },
    { id: "scoreAnalysis", state: "complete" },
    { id: "payment", state: "complete" },
    { id: "formulation", state: formulationState },
    {
      id: "safety",
      state: isReady && !isRequestQueued ? "complete" : "pending"
    },
    {
      id: "results",
      state: isReady && !isRequestQueued ? "complete" : "pending"
    }
  ];
}

export async function getExampleBriefStatus({
  planId,
  requestId
}: Readonly<{
  planId: string;
  requestId: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(planId) || !isUuid(requestId)) {
    return null;
  }

  const rows = await sql<{
    error_message: string | null;
    status: string;
  }[]>`
    select status, error_message
    from public.assessment_example_requests
    where plan_id = ${planId}::uuid
      and id = ${requestId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    planId,
    queuePosition: 0,
    requestId,
    status: mapExampleRequestStatus(row.status),
    steps: buildExampleRequestSteps(row.status)
  };
}

export async function scheduleReassessmentAction({
  email,
  locale,
  planId
}: Readonly<{
  email: string;
  locale?: unknown;
  planId: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const emailValidation = validateLeadEmail(email);

  if (!emailValidation.ok) {
    return null;
  }

  const normalizedLocale: Locale = isLocale(locale) ? locale : "en";
  const existing = await sql<
    Array<{
      id: string;
      plan_id: string | null;
      unsubscribe_token: string | null;
    }>
  >`
    select id::text,
      plan_id::text,
      unsubscribe_token
    from public.cron
    where action_type = 'reassessment'
      and status in ('scheduled', 'queued')
      and lower(recipient ->> 'email') = ${emailValidation.email}
    order by
      (plan_id = ${planId}::uuid) desc,
      scheduled_for desc,
      created_at desc
  `;
  const existingPrimary = existing[0];

  if (existingPrimary) {
    const unsubscribeToken =
      existingPrimary.unsubscribe_token || newUnsubscribeToken();

    await sql`
      update public.cron set
        plan_id = ${planId}::uuid,
        recipient = ${sql.json(toJsonValue({ email: emailValidation.email }))},
        payload = ${sql.json(toJsonValue({ locale: normalizedLocale }))},
        recurrence_days = 60,
        unsubscribe_token = ${unsubscribeToken},
        unsubscribed_at = null,
        scheduled_for = now() + interval '60 days',
        status = 'scheduled',
        error_message = null,
        updated_at = now()
      where id = ${existingPrimary.id}::uuid
    `;

    for (const duplicate of existing.slice(1)) {
      await sql`
        update public.cron set
          status = 'cancelled',
          result_payload = ${sql.json(
            toJsonValue({
              cancelledReason: "duplicate_reassessment_email",
              duplicateOf: existingPrimary.id,
              email: emailValidation.email
            })
          )},
          updated_at = now()
        where id = ${duplicate.id}::uuid
      `;
    }

    return existingPrimary.id;
  }

  const cronId = crypto.randomUUID();
  const unsubscribeToken = newUnsubscribeToken();

  await sql`
    insert into public.cron (
      id,
      plan_id,
      action_type,
      recipient,
      payload,
      scheduled_for,
      recurrence_days,
      unsubscribe_token,
      status,
      created_at,
      updated_at
    )
    values (
      ${cronId}::uuid,
      ${planId}::uuid,
      'reassessment',
      ${sql.json(toJsonValue({ email: emailValidation.email }))},
      ${sql.json(toJsonValue({ locale: normalizedLocale }))},
      now() + interval '60 days',
      60,
      ${unsubscribeToken},
      'scheduled',
      now(),
      now()
    )
  `;

  return cronId;
}

export async function cancelReassessmentActionByToken(token: string) {
  const sql = getSql();
  const normalizedToken = token.trim();

  if (!sql || !isUuid(normalizedToken)) {
    return { cancelled: false, reason: "invalid_token" as const };
  }

  const rows = await sql<
    Array<{
      id: string;
      plan_id: string | null;
      status: string;
    }>
  >`
    select id::text, plan_id::text, status
    from public.cron
    where action_type = 'reassessment'
      and unsubscribe_token = ${normalizedToken}
    order by created_at desc
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return { cancelled: false, reason: "not_found" as const };
  }

  if (row.status === "cancelled") {
    return {
      cancelled: false,
      planId: row.plan_id,
      reason: "already_cancelled" as const
    };
  }

  const updated = await sql<Array<{ id: string }>>`
    update public.cron set
      status = 'cancelled',
      unsubscribed_at = now(),
      result_payload = coalesce(result_payload, '{}'::jsonb) || ${sql.json(
        toJsonValue({
          cancelledReason: "email_unsubscribe",
          unsubscribedAt: new Date().toISOString()
        })
      )}::jsonb,
      updated_at = now()
    where id = ${row.id}::uuid
      and status in ('scheduled', 'queued')
    returning id::text
  `;
  const cancelled = updated.length > 0;

  if (cancelled) {
    await sql`
      update public.tasks set
        status = 'cancelled',
        updated_at = now()
      where task_type = 'send_reassessment_email'
        and status in ('queued', 'reserved', 'running')
        and payload ->> 'cronId' = ${row.id}
    `;
  }

  await writeBpmEvent({
    actorType: "system",
    cronId: row.id,
    eventName: "reassessment_unsubscribed",
    eventType: "reassessment",
    planId: row.plan_id,
    properties: {
      status: cancelled ? "cancelled" : row.status
    },
    severity: "medium"
  });

  return {
    cancelled,
    planId: row.plan_id,
    reason: cancelled ? ("cancelled" as const) : ("not_active" as const)
  };
}

async function enqueueReassessmentEmailTask({
  cronId,
  email,
  locale,
  planId
}: Readonly<{
  cronId: string;
  email: string;
  locale: Locale;
  planId: string;
}>) {
  const taskId = await createWorkTask({
    actorType: "deterministic",
    goalId: deterministicUuid(`mattanutra:goal:reassessment:${cronId}`),
    goalTitle: "Send 60-day reassessment invite",
    idempotencyKey: `reassessment:${cronId}`,
    maxAttempts: 2,
    payload: { cronId, email, locale },
    planId,
    priority: TASK_PRIORITIES.reassessment,
    reasoningEffort: "none",
    source: "cron",
    taskTitle: "Send reassessment email",
    taskType: "send_reassessment_email"
  });
  const sql = getSql();

  if (taskId && sql) {
    await sql`
      update public.cron set
        status = 'queued',
        queued_at = now(),
        updated_at = now()
      where id = ${cronId}::uuid
    `;
  }

  return taskId;
}

async function claimDueCronActions(sql: postgres.Sql) {
  return sql<
    Array<{
      id: string;
      plan_id: string | null;
      recipient: unknown;
      payload: unknown;
    }>
  >`
    update public.cron set
      status = 'queued',
      attempts = attempts + 1,
      updated_at = now()
    where id in (
      select id
      from public.cron
      where scheduled_for <= now()
        and (
          status = 'scheduled'
          or (
            status = 'queued'
            and updated_at < now() - interval '10 minutes'
          )
        )
      order by scheduled_for asc
      for update skip locked
      limit 25
    )
    returning id::text, plan_id::text, recipient, payload
  `;
}

async function runCronWorker() {
  const sql = getSql();

  if (!sql) {
    return { queued: 0 };
  }

  const dueActions = await claimDueCronActions(sql);
  let queued = 0;

  for (const action of dueActions) {
    const planId = action.plan_id ?? "";
    const recipient = payloadRecord(action.recipient);
    const payload = payloadRecord(action.payload);
    const email = typeof recipient.email === "string" ? recipient.email : "";
    const locale: Locale = isLocale(payload.locale) ? payload.locale : "en";

    try {
      if (!isUuid(action.id) || !isUuid(planId)) {
        throw new Error("Scheduled reassessment action is missing identifiers");
      }

      const emailValidation = validateLeadEmail(email);

      if (!emailValidation.ok) {
        throw new Error("Scheduled reassessment action is missing a valid email");
      }

      await enqueueReassessmentEmailTask({
        cronId: action.id,
        email: emailValidation.email,
        locale,
        planId
      });
      queued += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown cron worker error";

      await sql`
        update public.cron set
          status = 'failed',
          error_message = ${message},
          updated_at = now()
        where id = ${action.id}::uuid
      `;
      await writeBpmEvent({
        actorType: "system",
        cronId: action.id,
        errorMessage: message,
        eventName: "cron_action_failed",
        eventType: "error",
        planId: isUuid(planId) ? planId : null,
        severity: "high"
      });
    }
  }

  return { queued };
}

export function kickCronWorker() {
  if (globalWorker.mattanutraCronWorker) {
    return globalWorker.mattanutraCronWorker;
  }

  globalWorker.mattanutraCronWorker = runCronWorker().finally(() => {
    globalWorker.mattanutraCronWorker = undefined;
  });

  return globalWorker.mattanutraCronWorker;
}
