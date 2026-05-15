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
import { createTask } from "@/lib/task-service";

type StepState = "active" | "complete" | "failed" | "pending";
type WorkTaskType =
  | "analyze_healthscore"
  | "client_safety_followup"
  | "generate_example_food_guidance"
  | "generate_example_supplement_guidance"
  | "generate_food_guidance"
  | "generate_supplement_guidance"
  | "send_example_email"
  | "send_reassessment_email"
  | "sync_digitalocean_billing";

const globalScheduler = globalThis as typeof globalThis & {
  mattanutraCronEnqueueRun?: Promise<{ queued: number }>;
};

const TASK_BUSINESS_VALUES = {
  billingSync: 100,
  exampleEmail: 350,
  exampleFoodGuidance: 150,
  exampleFormulation: 150,
  foodGuidance: 450,
  healthScoreAnalysis: 500,
  precision: 450,
  pro: 450,
  reassessment: 200
} as const;
const SUCCESSFUL_TASK_REUSE_STATUSES = new Set(["completed", "skipped"]);

function businessValueForPlan(plan: AssessmentPlan) {
  return plan === "pro" ? TASK_BUSINESS_VALUES.pro : TASK_BUSINESS_VALUES.precision;
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
  businessValue: number;
  description?: string;
  groupLabel: string;
  id?: string | null;
  idempotencyKey: string;
  idempotencyScope?: "active" | "successful";
  idempotencyScopeKey?: string | null;
  maxAttempts?: number;
  payload?: Record<string, unknown>;
  planId?: string | null;
  rayId?: string | null;
  retryPolicy?: false | {
    backoffMultiplier?: number;
    initialDelaySeconds?: number;
    maxDelaySeconds?: number;
    maxRetries?: number;
  };
  reasoningEffort: "low" | "medium" | "none";
  source: string;
  taskGroupId?: string | null;
  taskTitle: string;
  taskType: WorkTaskType;
}>) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const maxAttempts = input.maxAttempts ?? 3;
  const { task } = await createTask({
    actorType: input.actorType,
    businessValue: input.businessValue,
    context: {
      source: input.source,
      taskType: input.taskType,
      ...(input.payload ?? {})
    },
    groupLabel: input.groupLabel,
    id: input.id,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
    idempotencyScope: input.idempotencyScope,
    idempotencyScopeKey:
      input.idempotencyScopeKey ??
      (input.planId ? `${input.taskType}:${input.planId}` : input.taskType),
    initialComment: {
      authorName: "MattaNutra agent",
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
    rayId: input.rayId,
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
    taskGroupId: input.taskGroupId,
    title: input.taskTitle
  });

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
  const taskIdSeed = deterministicUuid(
    `mattanutra:task:digitalocean-billing-sync:${bucket}`
  );
  const idempotencyKey = `digitalocean-billing-sync:${bucket}`;
  const taskId = await createWorkTask({
    actorType: "deterministic",
    businessValue: TASK_BUSINESS_VALUES.billingSync,
    description:
      "Fetch DigitalOcean invoice-preview costs and write nominal hosting ledger rows.",
    groupLabel: "Sync DigitalOcean billing costs",
    id: taskIdSeed,
    idempotencyKey,
    idempotencyScope: "successful",
    idempotencyScopeKey: "sync_digitalocean_billing",
    maxAttempts: 2,
    payload: {
      bucket,
      projectNames: config.projects
    },
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
    businessValue: TASK_BUSINESS_VALUES.healthScoreAnalysis,
    groupLabel: "Analyze HealthScore",
    id: deterministicUuid(`mattanutra:task:healthscore:${planId}:${inputHash}`),
    idempotencyKey: `healthscore-analysis:${planId}:${inputHash}`,
    idempotencyScope: "successful",
    idempotencyScopeKey: `healthscore:${planId}`,
    payload: {},
    planId,
    reasoningEffort: "low",
    source: "assessment",
    taskTitle: "Analyze HealthScore",
    taskType: "analyze_healthscore"
  });
}

export async function enqueueNutritionPlanTasks({
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

  const inputHash = stableHash({
    answers,
    locale,
    plan
  });
  const taskGroupId = deterministicUuid(
    `mattanutra:task-group:nutrition-plan:${planId}:${inputHash}`
  );
  const formulationTaskId = await createWorkTask({
    actorType: "ai",
    businessValue: businessValueForPlan(plan),
    groupLabel:
      plan === "pro"
        ? "Prepare Pro nutrition plan"
        : "Prepare Precision nutrition plan",
    id: deterministicUuid(`mattanutra:task:formulation:${planId}:${inputHash}`),
    idempotencyKey: `formulation:${planId}:${inputHash}`,
    idempotencyScope: "successful",
    idempotencyScopeKey: `formulation:${planId}`,
    payload: { answers, locale, plan },
    planId,
    reasoningEffort: "medium",
    source: "assessment",
    taskGroupId,
    taskTitle: "Generate supplement plan",
    taskType: "generate_supplement_guidance"
  });
  const foodGuidanceTaskId = await createWorkTask({
    actorType: "ai",
    businessValue: TASK_BUSINESS_VALUES.foodGuidance,
    groupLabel:
      plan === "pro"
        ? "Prepare Pro nutrition plan"
        : "Prepare Precision nutrition plan",
    id: deterministicUuid(`mattanutra:task:food-guidance:${planId}:${inputHash}`),
    idempotencyKey: `food-guidance:${planId}:${inputHash}`,
    idempotencyScope: "successful",
    idempotencyScopeKey: `food-guidance:${planId}`,
    payload: { answers, locale, plan },
    planId,
    reasoningEffort: "medium",
    source: "assessment",
    taskGroupId,
    taskTitle: "Generate food plan",
    taskType: "generate_food_guidance"
  });

  if (!formulationTaskId || !foodGuidanceTaskId) {
    return null;
  }

  const taskRows = await sql<Array<{ status: string; task_type: string }>>`
    select task_type, status
    from public.tasks
    where id = any(${[formulationTaskId, foodGuidanceTaskId]}::uuid[])
  `;
  const allTasksReused = taskRows.length === 2 && taskRows.every((task) =>
    SUCCESSFUL_TASK_REUSE_STATUSES.has(task.status)
  );

  if (allTasksReused) {
    const formulationRows = await sql<Array<{ exists: boolean }>>`
      select exists (
        select 1
        from public.formulations
        where plan_id = ${planId}::uuid
          and (
            model_version is null
            or model_version not like '%:example'
          )
      ) as exists
    `;
    const foodRows = await sql<Array<{ exists: boolean }>>`
      select exists (
        select 1
        from public.food_guidance
        where plan_id = ${planId}::uuid
          and (
            model_version is null
            or model_version not like '%:example'
          )
      ) as exists
    `;
    const formulationReady = formulationRows[0]?.exists === true;
    const foodGuidanceReady = foodRows[0]?.exists === true;
    const planReady = formulationReady && foodGuidanceReady;

    await sql`
      update public.assessments set
        selected_plan = ${plan},
        status = ${planReady ? "ready" : "failed"}::public.assessment_status,
        queue_position = 0,
        error_message = ${planReady ? null : "Completed nutrition plan tasks were found, but one or more nutrition outputs are missing."},
        plan_selected_at = coalesce(plan_selected_at, now()),
        completed_at = case
          when ${planReady} then coalesce(completed_at, now())
          else completed_at
        end,
        updated_at = now()
      where plan_id = ${planId}::uuid
    `;

    return {
      foodGuidanceTaskId,
      formulationTaskId
    };
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

  return {
    foodGuidanceTaskId,
    formulationTaskId
  };
}

export async function enqueueFormulationTask(input: Parameters<typeof enqueueNutritionPlanTasks>[0]) {
  const taskIds = await enqueueNutritionPlanTasks(input);

  return taskIds?.formulationTaskId ?? null;
}

async function enqueueExampleFormulationTask(
  planId: string,
  requestId: string,
  taskGroupId?: string | null
) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const taskId = await createWorkTask({
    actorType: "ai",
    businessValue: TASK_BUSINESS_VALUES.exampleFormulation,
    groupLabel: "Prepare Free nutrition plan email",
    id: deterministicUuid(`mattanutra:task:example-formulation:${requestId}`),
    idempotencyKey: `example-formulation:${requestId}`,
    idempotencyScope: "successful",
    idempotencyScopeKey: `free-example:${requestId}`,
    payload: { businessValueClass: "free_example", requestId },
    planId,
    reasoningEffort: "medium",
    source: "free_example",
    taskGroupId,
    taskTitle: "Generate free supplement guidance",
    taskType: "generate_example_supplement_guidance"
  });

  if (taskId) {
    await sql`
      update public.assessment_example_requests set
        status = 'formulation_queued',
        formulation_status = 'queued',
        updated_at = now()
      where id = ${requestId}::uuid
    `;
  }

  return taskId;
}

async function enqueueExampleFoodGuidanceTask(
  planId: string,
  requestId: string,
  taskGroupId?: string | null
) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const taskId = await createWorkTask({
    actorType: "ai",
    businessValue: TASK_BUSINESS_VALUES.exampleFoodGuidance,
    groupLabel: "Prepare Free nutrition plan email",
    id: deterministicUuid(`mattanutra:task:example-food-guidance:${requestId}`),
    idempotencyKey: `example-food-guidance:${requestId}`,
    idempotencyScope: "successful",
    idempotencyScopeKey: `free-example-food:${requestId}`,
    payload: { businessValueClass: "free_example", requestId },
    planId,
    reasoningEffort: "medium",
    source: "free_example",
    taskGroupId,
    taskTitle: "Generate free food preview",
    taskType: "generate_example_food_guidance"
  });

  if (taskId) {
    await sql`
      update public.assessment_example_requests set
        status = 'formulation_queued',
        food_guidance_status = 'queued',
        updated_at = now()
      where id = ${requestId}::uuid
    `;
  }

  return taskId;
}

type ExamplePreviewTaskIds = {
  emailTaskId?: string | null;
  foodGuidanceTaskId?: string | null;
  formulationTaskId?: string | null;
  waitingOnTaskId?: string | null;
};

function primaryExampleTaskId(taskIds: ExamplePreviewTaskIds) {
  return (
    taskIds.emailTaskId ??
    taskIds.formulationTaskId ??
    taskIds.foodGuidanceTaskId ??
    taskIds.waitingOnTaskId ??
    ""
  );
}

async function fullNutritionOutputsReady(sql: postgres.Sql, planId: string) {
  const rows = await sql<Array<{
    food_guidance_ready: boolean;
    formulation_ready: boolean;
  }>>`
    select
      exists (
        select 1
        from public.formulations
        where plan_id = ${planId}::uuid
          and (
            model_version is null
            or model_version not like '%:example'
          )
      ) as formulation_ready,
      exists (
        select 1
        from public.food_guidance
        where plan_id = ${planId}::uuid
          and (
            model_version is null
            or model_version not like '%:example'
          )
      ) as food_guidance_ready
  `;

  return {
    foodGuidanceReady: rows[0]?.food_guidance_ready === true,
    formulationReady: rows[0]?.formulation_ready === true
  };
}

async function activePaidNutritionTaskId(sql: postgres.Sql, planId: string) {
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.tasks
    where plan_id = ${planId}::uuid
      and task_type in ('generate_supplement_guidance', 'generate_food_guidance')
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
    order by business_value desc, scheduled_for asc, created_at asc
    limit 1
  `;

  return rows[0]?.id ?? null;
}

async function markExamplePreviewReadyFromFullPlan(
  sql: postgres.Sql,
  requestId: string
) {
  await sql`
    update public.assessment_example_requests set
      status = 'formulation_ready',
      formulation_status = 'ready',
      food_guidance_status = 'ready',
      updated_at = now()
    where id = ${requestId}::uuid
  `;
}

async function markExamplePreviewWaitingOnFullPlan(
  sql: postgres.Sql,
  requestId: string
) {
  await sql`
    update public.assessment_example_requests set
      status = 'formulation_queued',
      formulation_status = 'queued',
      food_guidance_status = 'queued',
      updated_at = now()
    where id = ${requestId}::uuid
  `;
}

async function enqueueExamplePreviewTasks(
  planId: string,
  requestId: string
): Promise<ExamplePreviewTaskIds> {
  const sql = getSql();

  if (!sql) {
    return {};
  }

  const fullReady = await fullNutritionOutputsReady(sql, planId);

  if (fullReady.formulationReady && fullReady.foodGuidanceReady) {
    await markExamplePreviewReadyFromFullPlan(sql, requestId);
    return {
      emailTaskId: await enqueueExampleEmailIfPreviewReady(planId, requestId)
    };
  }

  const waitingOnTaskId = await activePaidNutritionTaskId(sql, planId);

  if (waitingOnTaskId) {
    await markExamplePreviewWaitingOnFullPlan(sql, requestId);
    return { waitingOnTaskId };
  }

  const taskGroupId = deterministicUuid(
    `mattanutra:task-group:example-nutrition-plan:${requestId}`
  );
  const formulationTaskId = await enqueueExampleFormulationTask(
    planId,
    requestId,
    taskGroupId
  );
  const foodGuidanceTaskId = await enqueueExampleFoodGuidanceTask(
    planId,
    requestId,
    taskGroupId
  );

  return {
    foodGuidanceTaskId,
    formulationTaskId
  };
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
    businessValue: TASK_BUSINESS_VALUES.exampleEmail,
    groupLabel: "Prepare Free nutrition plan email",
    id: deterministicUuid(`mattanutra:task:example-email:${requestId}`),
    idempotencyKey: `example-email:${requestId}`,
    idempotencyScope: "active",
    idempotencyScopeKey: `free-example:${requestId}`,
    maxAttempts: 2,
    payload: { businessValueClass: "free_example", requestId },
    planId,
    reasoningEffort: "none",
    source: "free_example",
    taskGroupId: deterministicUuid(
      `mattanutra:task-group:example-nutrition-plan:${requestId}`
    ),
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

export async function enqueueExampleEmailIfPreviewReady(
  planId: string,
  requestId: string
) {
  const sql = getSql();

  if (!sql || !isUuid(planId) || !isUuid(requestId)) {
    return null;
  }

  const rows = await sql<Array<{
    email_task_id: string | null;
    food_guidance_ready: boolean;
    formulation_ready: boolean;
    status: string;
  }>>`
    select
      assessment_example_requests.status,
      exists (
        select 1
        from public.formulations
        where formulations.plan_id = assessment_example_requests.plan_id
      ) as formulation_ready,
      exists (
        select 1
        from public.food_guidance
        where food_guidance.plan_id = assessment_example_requests.plan_id
      ) as food_guidance_ready,
      (
        select tasks.id::text
        from public.tasks
        where tasks.plan_id = assessment_example_requests.plan_id
          and tasks.payload ->> 'requestId' = assessment_example_requests.id::text
          and tasks.task_type = 'send_example_email'
          and tasks.status not in ('failed', 'cancelled', 'skipped')
        order by tasks.created_at desc
        limit 1
      ) as email_task_id
    from public.assessment_example_requests
    where id = ${requestId}::uuid
      and plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row || row.status === "email_sent" || row.email_task_id) {
    return row?.email_task_id ?? null;
  }

  if (!row.formulation_ready || !row.food_guidance_ready) {
    return null;
  }

  await sql`
    update public.assessment_example_requests set
      status = 'formulation_ready',
      formulation_status = 'ready',
      food_guidance_status = 'ready',
      updated_at = now()
    where id = ${requestId}::uuid
  `;

  return enqueueExampleEmailTask(planId, requestId);
}

export async function enqueueExampleEmailsForReadyFullPlan(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return [];
  }

  const fullReady = await fullNutritionOutputsReady(sql, planId);

  if (!fullReady.formulationReady || !fullReady.foodGuidanceReady) {
    return [];
  }

  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.assessment_example_requests
    where plan_id = ${planId}::uuid
      and status in ('requested', 'formulation_queued', 'formulation_ready')
    order by requested_at asc
  `;
  const queuedTaskIds: string[] = [];

  for (const row of rows) {
    await markExamplePreviewReadyFromFullPlan(sql, row.id);
    const taskId = await enqueueExampleEmailIfPreviewReady(planId, row.id);

    if (taskId) {
      queuedTaskIds.push(taskId);
    }
  }

  return queuedTaskIds;
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
          and tasks.task_type in (
            'generate_example_supplement_guidance',
            'generate_example_food_guidance',
            'send_example_email'
          )
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
      taskId:
        (await enqueueExampleEmailIfPreviewReady(planId, existingRequest.id)) ?? ""
    };
  }

  if (
    existingRequest &&
    (
      existingRequest.status === "requested" ||
      existingRequest.status === "formulation_queued"
    )
  ) {
    const taskIds = await enqueueExamplePreviewTasks(planId, existingRequest.id);

    return {
      requestId: existingRequest.id,
      taskId: primaryExampleTaskId(taskIds)
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

  const taskIds = await enqueueExamplePreviewTasks(planId, requestId);

  return { requestId, taskId: primaryExampleTaskId(taskIds) };
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
    businessValue: TASK_BUSINESS_VALUES.reassessment,
    groupLabel: "Send 60-day reassessment invite",
    id: deterministicUuid(`mattanutra:task:reassessment:${cronId}`),
    idempotencyKey: `reassessment:${cronId}`,
    idempotencyScopeKey: `reassessment:${cronId}`,
    maxAttempts: 2,
    payload: { cronId, email, locale },
    planId,
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

async function enqueueDueCronTasks() {
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
        error instanceof Error ? error.message : "Unknown scheduled action error";

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

export function enqueueDueScheduledActions() {
  if (globalScheduler.mattanutraCronEnqueueRun) {
    return globalScheduler.mattanutraCronEnqueueRun;
  }

  globalScheduler.mattanutraCronEnqueueRun = enqueueDueCronTasks().finally(() => {
    globalScheduler.mattanutraCronEnqueueRun = undefined;
  });

  return globalScheduler.mattanutraCronEnqueueRun;
}
