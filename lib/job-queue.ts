import type postgres from "postgres";
import { createHash, randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  normalizeAssessmentPlan,
  type AssessmentPlan
} from "@/lib/assessment-jobs";
import {
  buildExampleEmailHtml,
  buildExampleEmailSubject
} from "@/lib/example-email";
import { validateLeadEmail } from "@/lib/email-validation";
import { analyzeFormulationWithGrok } from "@/lib/formulation-analysis";
import { applyFormulationSafety } from "@/lib/formulation-safety";
import type { FormulationBlueprint } from "@/lib/formulation-types";
import { analyzeHealthScoreAdvice } from "@/lib/health-score-analysis";
import type { HealthScoreResult } from "@/lib/health-score";
import { writeBpmEvent } from "@/lib/bpm";
import {
  buildReassessmentEmailHtml,
  buildReassessmentEmailSubject
} from "@/lib/reassessment-email";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import {
  ensureAssessmentSchema,
  isUuid,
  toJsonValue
} from "@/lib/assessment-store";
import {
  completeTask,
  createGoal,
  createTask,
  failTask,
  reserveNextTask,
  type ReservedTask
} from "@/lib/task-service";

type JobType =
  | "example_email"
  | "example_formulation"
  | "formulation"
  | "healthscore_analysis"
  | "reassessment"
  | "supplement_review";
type AuditLevel = "critical" | "high" | "low" | "medium";
type StepState = "active" | "complete" | "failed" | "pending";

type ClaimedJob = {
  attempts: number;
  id: string;
  job_type: JobType | string;
  plan_id: string | null;
  payload: unknown;
};

type ClaimedTaskJob = Readonly<{
  job: ClaimedJob;
  reserved: ReservedTask;
}>;

const globalJobsWorker = globalThis as typeof globalThis & {
  mattanutraCronWorker?: Promise<{ queued: number }>;
  mattanutraJobsSchemaReadyV7?: Promise<void>;
  mattanutraJobsWorker?: Promise<void>;
};

const JOB_PRIORITIES = {
  exampleEmail: 3,
  exampleFormulation: 5,
  healthScoreAnalysis: 25,
  precision: 20,
  pro: 30,
  reassessment: 10
} as const;
const JOB_WORKER_CAPABILITY = "legacy_job_worker";
const JOB_WORKER_TASK_TYPES = [
  "generate_formulation",
  "generate_example_formulation",
  "analyze_healthscore",
  "send_example_email",
  "send_reassessment_email"
] as const;
const STALE_RUNNING_JOB_MINUTES = 70;

function priorityForPlan(plan: AssessmentPlan) {
  if (plan === "pro") {
    return JOB_PRIORITIES.pro;
  }

  return JOB_PRIORITIES.precision;
}

function deterministicUuid(seed: string) {
  const bytes = Buffer.from(createHash("sha256").update(seed).digest().subarray(0, 16));

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

function payloadRecord(payload: unknown) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function payloadText(payload: unknown, key: string) {
  const value = payloadRecord(payload)[key];

  return typeof value === "string" ? value : "";
}

function goalPriorityForJob(
  jobType: JobType | string,
  payload: Record<string, unknown>
) {
  if (jobType === "formulation") {
    return normalizeAssessmentPlan(payload.plan) === "pro" ? 6 : 5;
  }

  if (jobType === "healthscore_analysis") {
    return 5;
  }

  if (jobType === "example_formulation" || jobType === "example_email") {
    return 3;
  }

  if (jobType === "reassessment") {
    return 3;
  }

  return 2;
}

function jobTaskConfig(input: Readonly<{
  jobId: string;
  jobType: JobType | string;
  payload: Record<string, unknown>;
  planId: string | null;
}>) {
  const requestId = payloadText(input.payload, "requestId");
  const cronId = payloadText(input.payload, "cronId");
  const fallbackSeed = `mattanutra:goal:legacy-job:${input.jobId}`;
  const freeExampleSeed = isUuid(requestId)
    ? `mattanutra:goal:free-example:${requestId}`
    : fallbackSeed;
  const reassessmentSeed = isUuid(cronId)
    ? `mattanutra:goal:reassessment:${cronId}:${input.jobId}`
    : fallbackSeed;

  if (input.jobType === "formulation") {
    const plan = normalizeAssessmentPlan(input.payload.plan);

    return {
      actorType: "ai" as const,
      goalId: deterministicUuid(fallbackSeed),
      goalTitle:
        plan === "pro"
          ? "Prepare Pro nutrition plan"
          : "Prepare Precision nutrition plan",
      priority: goalPriorityForJob(input.jobType, input.payload),
      reasoningEffort: "medium" as const,
      taskTitle: "Generate nutrition plan",
      taskType: "generate_formulation"
    };
  }

  if (input.jobType === "healthscore_analysis" && input.planId) {
    return {
      actorType: "ai" as const,
      goalId: deterministicUuid(`mattanutra:goal:healthscore:${input.planId}`),
      goalTitle: "Analyze HealthScore",
      priority: goalPriorityForJob(input.jobType, input.payload),
      reasoningEffort: "medium" as const,
      taskTitle: "Analyze HealthScore",
      taskType: "analyze_healthscore"
    };
  }

  if (input.jobType === "example_formulation") {
    return {
      actorType: "ai" as const,
      goalId: deterministicUuid(freeExampleSeed),
      goalTitle: "Prepare Free nutrition plan email",
      priority: goalPriorityForJob(input.jobType, input.payload),
      reasoningEffort: "medium" as const,
      taskTitle: "Generate Free nutrition plan",
      taskType: "generate_example_formulation"
    };
  }

  if (input.jobType === "example_email") {
    return {
      actorType: "deterministic" as const,
      goalId: deterministicUuid(freeExampleSeed),
      goalTitle: "Prepare Free nutrition plan email",
      priority: goalPriorityForJob(input.jobType, input.payload),
      reasoningEffort: "none" as const,
      taskTitle: "Send Free nutrition plan email",
      taskType: "send_example_email"
    };
  }

  if (input.jobType === "reassessment") {
    return {
      actorType: "deterministic" as const,
      goalId: deterministicUuid(reassessmentSeed),
      goalTitle: "Send 60-day reassessment invite",
      priority: goalPriorityForJob(input.jobType, input.payload),
      reasoningEffort: "none" as const,
      taskTitle: "Send reassessment email",
      taskType: "send_reassessment_email"
    };
  }

  return null;
}

async function ensureTaskForJob(
  sql: postgres.Sql,
  input: Readonly<{
    jobId: string;
    jobType: JobType | string;
    payload?: Record<string, unknown>;
    planId: string | null;
  }>
) {
  const payload = input.payload ?? {};
  const config = jobTaskConfig({
    jobId: input.jobId,
    jobType: input.jobType,
    payload,
    planId: input.planId
  });

  if (!config) {
    return;
  }

  try {
    const goal = await createGoal({
      context: {
        jobId: input.jobId,
        jobType: input.jobType,
        source: "job_queue"
      },
      id: config.goalId,
      planId: input.planId,
      priority: config.priority,
      source: "job_queue",
      title: config.goalTitle,
      type: "goal"
    });

    await createTask({
      actorType: config.actorType,
      goalId: goal.id,
      idempotencyKey: `legacy-job:${input.jobId}`,
      initialComment: {
        authorName: "MattaNutra worker",
        authorType: "system",
        body: `Legacy ${input.jobType} job queued for task-backed processing.`,
        commentType: "instruction",
        metadata: {
          jobId: input.jobId,
          jobType: input.jobType
        },
        visibility: "worker"
      },
      legacyJobId: input.jobId,
      maxAttempts: 3,
      payload: {
        jobId: input.jobId,
        jobType: input.jobType,
        planId: input.planId,
        source: "job_queue",
        ...payload
      },
      planId: input.planId,
      reasoningEffort: config.reasoningEffort,
      requiredCapabilities: [JOB_WORKER_CAPABILITY],
      taskType: config.taskType,
      title: config.taskTitle
    });
  } catch (error) {
    console.warn("Unable to create task-backed job work", {
      error,
      jobId: input.jobId,
      jobType: input.jobType,
      planId: input.planId
    });

    await auditJobEvent(sql, {
      eventPayload: {
        error: error instanceof Error ? error.message : "Unknown task bridge error",
        jobType: input.jobType
      },
      eventType: "job_task_bridge_failed",
      jobId: input.jobId,
      level: "medium",
      planId: input.planId
    });
  }
}

function newUnsubscribeToken() {
  return crypto.randomUUID();
}

async function ensureJobsSchema(sql: postgres.Sql) {
  globalJobsWorker.mattanutraJobsSchemaReadyV7 ??= (async () => {
    await ensureAssessmentSchema();

    await sql`
      create table if not exists jobs (
        id uuid primary key,
        job_type text not null,
        plan_id uuid null references assessments(plan_id) on delete cascade,
        status text not null default 'queued' check (
          status in ('queued', 'running', 'complete', 'failed')
        ),
        priority integer not null default 0,
        attempts integer not null default 0,
        payload jsonb not null default '{}'::jsonb,
        error_message text null,
        queued_at timestamptz not null default now(),
        started_at timestamptz null,
        completed_at timestamptz null,
        failed_at timestamptz null,
        updated_at timestamptz not null default now()
      )
    `;

    await sql`
      do $$
      begin
        if to_regclass('public.assessment_formulations') is not null
          and to_regclass('public.formulations') is null then
          alter table public.assessment_formulations rename to formulations;
        end if;
      end $$;
    `;

    await sql`
      create table if not exists formulations (
        plan_id uuid not null references assessments(plan_id) on delete cascade,
        version integer not null default 1,
        formulation jsonb not null,
        model_version text null,
        generated_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (plan_id, version)
      )
    `;

    await sql`
      create table if not exists recommendations (
        plan_id uuid not null references assessments(plan_id) on delete cascade,
        version integer not null default 1,
        recommendations jsonb not null,
        generated_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (plan_id, version)
      )
    `;

    await sql`
      create table if not exists job_audit_events (
        id uuid primary key,
        job_id uuid null references jobs(id) on delete set null,
        plan_id uuid null references assessments(plan_id) on delete cascade,
        event_type text not null,
        level text not null default 'low' check (
          level in ('low', 'medium', 'high', 'critical')
        ),
        event_payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `;

    await sql`
      create table if not exists assessment_example_requests (
        id uuid primary key,
        plan_id uuid not null references assessments(plan_id) on delete cascade,
        email text not null,
        locale text not null default 'en' check (locale in ('en', 'th')),
        status text not null default 'requested' check (
          status in (
            'requested',
            'formulation_queued',
            'formulation_ready',
            'email_queued',
            'email_rendered',
            'email_sent',
            'failed'
          )
        ),
        health_score jsonb not null default '{}'::jsonb,
        email_html text null,
        error_message text null,
        requested_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;

    await sql`
      create table if not exists cron (
        id uuid primary key,
        plan_id uuid null references assessments(plan_id) on delete cascade,
        action_type text not null,
        recipient jsonb not null default '{}'::jsonb,
        payload jsonb not null default '{}'::jsonb,
        scheduled_for timestamptz not null,
        status text not null default 'scheduled' check (
          status in ('scheduled', 'queued', 'complete', 'cancelled', 'failed')
        ),
        job_id uuid null references jobs(id) on delete set null,
        attempts integer not null default 0,
        recurrence_days integer null,
        unsubscribe_token text null,
        unsubscribed_at timestamptz null,
        result_payload jsonb not null default '{}'::jsonb,
        error_message text null,
        created_at timestamptz not null default now(),
        queued_at timestamptz null,
        completed_at timestamptz null,
        updated_at timestamptz not null default now()
      )
    `;

    await sql`
      alter table formulations
        add column if not exists version integer not null default 1
    `;

    await sql`
      alter table recommendations
        add column if not exists version integer not null default 1
    `;

    await sql`
      alter table job_audit_events
        add column if not exists level text not null default 'low'
    `;

    await sql`
      do $$
      begin
        alter table assessment_example_requests
          drop constraint if exists assessment_example_requests_status_check;

        alter table assessment_example_requests
          add constraint assessment_example_requests_status_check
          check (
            status in (
              'requested',
              'formulation_queued',
              'formulation_ready',
              'email_queued',
              'email_rendered',
              'email_sent',
              'failed'
            )
          );
      end $$;
    `;

    await sql`
      alter table cron
        add column if not exists action_type text,
        add column if not exists recipient jsonb not null default '{}'::jsonb,
        add column if not exists payload jsonb not null default '{}'::jsonb,
        add column if not exists scheduled_for timestamptz,
        add column if not exists status text not null default 'scheduled',
        add column if not exists job_id uuid null references jobs(id) on delete set null,
        add column if not exists attempts integer not null default 0,
        add column if not exists recurrence_days integer null,
        add column if not exists unsubscribe_token text null,
        add column if not exists unsubscribed_at timestamptz null,
        add column if not exists result_payload jsonb not null default '{}'::jsonb,
        add column if not exists error_message text null,
        add column if not exists created_at timestamptz not null default now(),
        add column if not exists queued_at timestamptz null,
        add column if not exists completed_at timestamptz null,
        add column if not exists updated_at timestamptz not null default now()
    `;

    await sql`
      alter table cron
        drop column if exists email_html
    `;

    await sql`
      update cron
      set action_type = 'reassessment'
      where action_type = 'reassessment_email'
    `;

    await sql`
      update cron
      set recurrence_days = 60
      where action_type = 'reassessment'
        and recurrence_days is null
    `;

    await sql`
      update jobs
      set job_type = 'reassessment'
      where job_type = 'reassessment_email'
    `;

    await sql`
      update cron
      set
        action_type = coalesce(action_type, 'reassessment'),
        recipient = coalesce(recipient, '{}'::jsonb),
        payload = coalesce(payload, '{}'::jsonb),
        scheduled_for = coalesce(scheduled_for, now()),
        status = case
          when status in ('scheduled', 'queued', 'complete', 'cancelled', 'failed') then status
          else 'scheduled'
        end,
        attempts = coalesce(attempts, 0),
        result_payload = coalesce(result_payload, '{}'::jsonb),
        created_at = coalesce(created_at, now()),
        updated_at = coalesce(updated_at, now())
      where action_type is null
        or recipient is null
        or payload is null
        or scheduled_for is null
        or status is null
        or status not in ('scheduled', 'queued', 'complete', 'cancelled', 'failed')
        or attempts is null
        or result_payload is null
        or created_at is null
        or updated_at is null
    `;

    await sql`
      alter table cron
        alter column action_type set not null,
        alter column recipient set default '{}'::jsonb,
        alter column recipient set not null,
        alter column payload set default '{}'::jsonb,
        alter column payload set not null,
        alter column scheduled_for set not null,
        alter column status set default 'scheduled',
        alter column status set not null,
        alter column attempts set default 0,
        alter column attempts set not null,
        alter column result_payload set default '{}'::jsonb,
        alter column result_payload set not null,
        alter column created_at set default now(),
        alter column created_at set not null,
        alter column updated_at set default now(),
        alter column updated_at set not null
    `;

    await sql`
      update job_audit_events
      set level = 'low'
      where level is null
        or level not in ('low', 'medium', 'high', 'critical')
    `;

    await sql`
      alter table job_audit_events
        alter column level set default 'low',
        alter column level set not null
    `;

    await sql`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'public.job_audit_events'::regclass
            and conname = 'job_audit_events_level_check'
        ) then
          alter table job_audit_events
            add constraint job_audit_events_level_check
            check (level in ('low', 'medium', 'high', 'critical'));
        end if;
      end $$;
    `;

    await sql`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'public.cron'::regclass
            and conname = 'cron_recurrence_days_check'
        ) then
          alter table cron
            add constraint cron_recurrence_days_check
            check (recurrence_days is null or recurrence_days > 0);
        end if;
      end $$;
    `;

    await sql`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'public.cron'::regclass
            and conname = 'cron_status_check'
        ) then
          alter table cron
            add constraint cron_status_check
            check (
              status in ('scheduled', 'queued', 'complete', 'cancelled', 'failed')
            );
        end if;
      end $$;
    `;

    await sql`
      do $$
      declare
        current_pkey text;
      begin
        select conname into current_pkey
        from pg_constraint
        where conrelid = 'public.formulations'::regclass
          and contype = 'p'
        limit 1;

        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'public.formulations'::regclass
            and contype = 'p'
            and pg_get_constraintdef(oid) = 'PRIMARY KEY (plan_id, version)'
        ) then
          if current_pkey is not null then
            execute format('alter table public.formulations drop constraint %I', current_pkey);
          end if;

          alter table public.formulations
            add constraint formulations_pkey primary key (plan_id, version);
        end if;

        select conname into current_pkey
        from pg_constraint
        where conrelid = 'public.recommendations'::regclass
          and contype = 'p'
        limit 1;

        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'public.recommendations'::regclass
            and contype = 'p'
            and pg_get_constraintdef(oid) = 'PRIMARY KEY (plan_id, version)'
        ) then
          if current_pkey is not null then
            execute format('alter table public.recommendations drop constraint %I', current_pkey);
          end if;

          alter table public.recommendations
            add constraint recommendations_pkey primary key (plan_id, version);
        end if;
      end $$;
    `;

    await sql`
      create index if not exists jobs_queue_idx
        on jobs (status, priority desc, queued_at asc)
    `;
    await sql`
      create index if not exists jobs_plan_type_idx
        on jobs (plan_id, job_type, status)
    `;
    await sql`
      create index if not exists formulations_latest_idx
        on formulations (plan_id, version desc, generated_at desc)
    `;
    await sql`
      create index if not exists recommendations_latest_idx
        on recommendations (plan_id, version desc, generated_at desc)
    `;
    await sql`
      create index if not exists job_audit_events_plan_idx
        on job_audit_events (plan_id, created_at desc)
    `;
    await sql`
      create index if not exists job_audit_events_job_idx
        on job_audit_events (job_id, created_at desc)
    `;
    await sql`
      create index if not exists assessment_example_requests_plan_idx
        on assessment_example_requests (plan_id, requested_at desc)
    `;
    await sql`
      create index if not exists assessment_example_requests_status_idx
        on assessment_example_requests (status, requested_at asc)
    `;
    await sql`
      create index if not exists cron_due_idx
        on cron (status, scheduled_for asc)
    `;
    await sql`
      create index if not exists cron_plan_action_idx
        on cron (plan_id, action_type, status)
    `;
    await sql`
      create unique index if not exists cron_unsubscribe_token_idx
        on cron (unsubscribe_token)
        where unsubscribe_token is not null
    `;
  })().catch((error) => {
    globalJobsWorker.mattanutraJobsSchemaReadyV7 = undefined;
    throw error;
  });

  await globalJobsWorker.mattanutraJobsSchemaReadyV7;
}

async function auditJobEvent(
  sql: postgres.Sql,
  {
    eventPayload = {},
    eventType,
    jobId,
    level = "low",
    planId
  }: Readonly<{
    eventPayload?: Record<string, unknown>;
    eventType: string;
    jobId?: string | null;
    level?: AuditLevel;
    planId?: string | null;
  }>
) {
  try {
    await sql`
      insert into job_audit_events (
        id,
        job_id,
        plan_id,
        event_type,
        level,
        event_payload,
        created_at
      )
      values (
        ${crypto.randomUUID()}::uuid,
        ${jobId ?? null}::uuid,
        ${planId ?? null}::uuid,
        ${eventType},
        ${level},
        ${sql.json(toJsonValue(eventPayload))},
        now()
      )
    `;
  } catch (error) {
    console.warn("Unable to write job audit event", error);
  }
}

export async function enqueueFormulationJob({
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

  await ensureJobsSchema(sql);

  const assessmentRows = await sql`
    select health_score
    from assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;

  if (
    !assessmentRows[0] ||
    hasHealthScoreAdvice(assessmentRows[0].health_score)
  ) {
    return null;
  }

  const existing = await sql`
    select id::text
    from jobs
    where plan_id = ${planId}::uuid
      and job_type = 'formulation'
      and status in ('queued', 'running')
    order by queued_at desc
    limit 1
  `;

  if (existing[0]) {
    const existingJobId = existing[0].id as string;

    await ensureTaskForJob(sql, {
      jobId: existingJobId,
      jobType: "formulation",
      payload: { answers, locale, plan },
      planId
    });

    return existingJobId;
  }

  const jobId = crypto.randomUUID();

  await sql`
    insert into jobs (
      id,
      job_type,
      plan_id,
      status,
      priority,
      payload,
      queued_at,
      updated_at
    )
    values (
      ${jobId}::uuid,
      'formulation',
      ${planId}::uuid,
      'queued',
      ${priorityForPlan(plan)},
      ${sql.json(toJsonValue({ answers, locale, plan }))},
      now(),
      now()
    )
  `;

  await auditJobEvent(sql, {
    eventPayload: {
      businessEvent: true,
      plan,
      priority: priorityForPlan(plan)
    },
    eventType: "job_enqueued",
    jobId,
    level: "low",
    planId
  });

  await sql`
    update assessments set
      selected_plan = ${plan},
      status = 'queued',
      queue_position = coalesce(queue_position, 1),
      error_message = null,
      plan_selected_at = coalesce(plan_selected_at, now()),
      updated_at = now()
    where plan_id = ${planId}::uuid
  `;

  await ensureTaskForJob(sql, {
    jobId,
    jobType: "formulation",
    payload: { answers, locale, plan },
    planId
  });

  return jobId;
}

export async function enqueueHealthScoreAnalysisJob({
  planId
}: Readonly<{
  planId: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  await ensureJobsSchema(sql);

  const existing = await sql`
    select id::text
    from jobs
    where plan_id = ${planId}::uuid
      and job_type = 'healthscore_analysis'
      and status in ('queued', 'running')
    order by queued_at desc
    limit 1
  `;

  if (existing[0]) {
    const existingJobId = existing[0].id as string;

    await ensureTaskForJob(sql, {
      jobId: existingJobId,
      jobType: "healthscore_analysis",
      payload: {},
      planId
    });

    return existingJobId;
  }

  const jobId = crypto.randomUUID();

  await sql`
    insert into jobs (
      id,
      job_type,
      plan_id,
      status,
      priority,
      payload,
      queued_at,
      updated_at
    )
    values (
      ${jobId}::uuid,
      'healthscore_analysis',
      ${planId}::uuid,
      'queued',
      ${JOB_PRIORITIES.healthScoreAnalysis},
      ${sql.json(toJsonValue({}))},
      now(),
      now()
    )
  `;

  await auditJobEvent(sql, {
    eventPayload: {
      businessEvent: true,
      priority: JOB_PRIORITIES.healthScoreAnalysis
    },
    eventType: "healthscore_analysis_job_enqueued",
    jobId,
    level: "low",
    planId
  });

  await ensureTaskForJob(sql, {
    jobId,
    jobType: "healthscore_analysis",
    payload: {},
    planId
  });

  return jobId;
}

async function enqueueExampleFormulationJob(
  sql: postgres.Sql,
  {
    planId,
    requestId
  }: Readonly<{
    planId: string;
    requestId: string;
  }>
) {
  const existing = await sql`
    select id::text
    from jobs
    where plan_id = ${planId}::uuid
      and job_type = 'example_formulation'
      and status in ('queued', 'running')
      and payload ->> 'requestId' = ${requestId}
    order by queued_at desc
    limit 1
  `;

  if (existing[0]) {
    const existingJobId = existing[0].id as string;

    await ensureTaskForJob(sql, {
      jobId: existingJobId,
      jobType: "example_formulation",
      payload: { priorityClass: "free_example", requestId },
      planId
    });

    return existingJobId;
  }

  const jobId = crypto.randomUUID();

  await sql`
    insert into jobs (
      id,
      job_type,
      plan_id,
      status,
      priority,
      payload,
      queued_at,
      updated_at
    )
    values (
      ${jobId}::uuid,
      'example_formulation',
      ${planId}::uuid,
      'queued',
      ${JOB_PRIORITIES.exampleFormulation},
      ${sql.json(toJsonValue({ priorityClass: "free_example", requestId }))},
      now(),
      now()
    )
  `;

  await sql`
    update assessment_example_requests set
      status = 'formulation_queued',
      updated_at = now()
    where id = ${requestId}::uuid
  `;

  await auditJobEvent(sql, {
      eventPayload: {
        businessEvent: true,
        priority: JOB_PRIORITIES.exampleFormulation,
        priorityClass: "free_example",
        requestId
      },
    eventType: "example_formulation_job_enqueued",
    jobId,
    level: "low",
    planId
  });

  await ensureTaskForJob(sql, {
    jobId,
    jobType: "example_formulation",
    payload: { priorityClass: "free_example", requestId },
    planId
  });

  return jobId;
}

async function enqueueExampleEmailJob(
  sql: postgres.Sql,
  {
    planId,
    requestId
  }: Readonly<{
    planId: string;
    requestId: string;
  }>
) {
  const existing = await sql`
    select id::text
    from jobs
    where plan_id = ${planId}::uuid
      and job_type = 'example_email'
      and status in ('queued', 'running')
      and payload ->> 'requestId' = ${requestId}
    order by queued_at desc
    limit 1
  `;

  if (existing[0]) {
    const existingJobId = existing[0].id as string;

    await ensureTaskForJob(sql, {
      jobId: existingJobId,
      jobType: "example_email",
      payload: { priorityClass: "free_example", requestId },
      planId
    });

    return existingJobId;
  }

  const jobId = crypto.randomUUID();

  await sql`
    insert into jobs (
      id,
      job_type,
      plan_id,
      status,
      priority,
      payload,
      queued_at,
      updated_at
    )
    values (
      ${jobId}::uuid,
      'example_email',
      ${planId}::uuid,
      'queued',
      ${JOB_PRIORITIES.exampleEmail},
      ${sql.json(toJsonValue({ priorityClass: "free_example", requestId }))},
      now(),
      now()
    )
  `;

  await sql`
    update assessment_example_requests set
      status = 'email_queued',
      updated_at = now()
    where id = ${requestId}::uuid
  `;

  await auditJobEvent(sql, {
      eventPayload: {
        businessEvent: true,
        priority: JOB_PRIORITIES.exampleEmail,
        priorityClass: "free_example",
        requestId
      },
    eventType: "example_email_job_enqueued",
    jobId,
    level: "low",
    planId
  });

  await ensureTaskForJob(sql, {
    jobId,
    jobType: "example_email",
    payload: { priorityClass: "free_example", requestId },
    planId
  });

  return jobId;
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

  await ensureJobsSchema(sql);

  const assessmentRows = await sql`
    select health_score
    from assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;

  if (!assessmentRows[0]) {
    return null;
  }

  const existingRequests = await sql<{
    id: string;
    job_id: string | null;
    status: string;
  }[]>`
    select
      assessment_example_requests.id::text,
      assessment_example_requests.status,
      (
        select jobs.id::text
        from jobs
        where jobs.plan_id = assessment_example_requests.plan_id
          and jobs.payload ->> 'requestId' = assessment_example_requests.id::text
          and jobs.job_type in ('example_formulation', 'example_email')
          and jobs.status in ('queued', 'running')
        order by jobs.queued_at desc
        limit 1
      ) as job_id
    from assessment_example_requests
    where plan_id = ${planId}::uuid
      and lower(email) = ${emailValidation.email}
    order by requested_at desc
    limit 1
  `;
  const existingRequest = existingRequests[0];

  if (existingRequest && existingRequest.status !== "failed") {
    await auditJobEvent(sql, {
      eventPayload: {
        businessEvent: true,
        email: emailValidation.email,
        requestId: existingRequest.id
      },
      eventType: "example_request_reused",
      level: "low",
      planId
    });

    return {
      jobId: existingRequest.job_id ?? "",
      requestId: existingRequest.id
    };
  }

  const requestId = crypto.randomUUID();
  const normalizedLocale: Locale = isLocale(locale) ? locale : "en";

  await sql`
    insert into assessment_example_requests (
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

  await auditJobEvent(sql, {
    eventPayload: {
      businessEvent: true,
      email: emailValidation.email,
      requestId
    },
    eventType: "example_request_created",
    level: "low",
    planId
  });

  const jobId = await enqueueExampleFormulationJob(sql, {
    planId,
    requestId
  });

  return { jobId, requestId };
}

function mapExampleRequestStatus(status: unknown) {
  if (status === "failed") {
    return "failed";
  }

  if (
    status === "formulation_queued" ||
    status === "formulation_ready" ||
    status === "email_queued" ||
    status === "email_rendered" ||
    status === "email_sent"
  ) {
    return "ready";
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

  await ensureJobsSchema(sql);

  const rows = await sql<{
    error_message: string | null;
    status: string;
  }[]>`
    select
      status,
      error_message
    from assessment_example_requests
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

  await ensureJobsSchema(sql);

  const normalizedLocale: Locale = isLocale(locale) ? locale : "en";
  const existing = await sql<
    Array<{
      id: string;
      plan_id: string | null;
      unsubscribe_token: string | null;
    }>
  >`
    select id::text
      , plan_id::text
      , unsubscribe_token
    from cron
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
      update cron set
        plan_id = ${planId}::uuid,
        recipient = ${sql.json(
          toJsonValue({ email: emailValidation.email })
        )},
        payload = ${sql.json(toJsonValue({ locale: normalizedLocale }))},
        recurrence_days = 60,
        unsubscribe_token = ${unsubscribeToken},
        unsubscribed_at = null,
        scheduled_for = now() + interval '60 days',
        status = 'scheduled',
        job_id = null,
        error_message = null,
        updated_at = now()
      where id = ${existingPrimary.id}::uuid
    `;

    for (const duplicate of existing.slice(1)) {
      await sql`
        update cron set
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

    await auditJobEvent(sql, {
      eventPayload: {
        actionType: "reassessment",
        businessEvent: true,
        cronId: existingPrimary.id,
        duplicateCount: Math.max(0, existing.length - 1),
        email: emailValidation.email,
        recurrenceDays: 60
      },
      eventType: "cron_action_deduped",
      level: existing.length > 1 ? "medium" : "low",
      planId
    });

    return existingPrimary.id;
  }

  const cronId = crypto.randomUUID();
  const unsubscribeToken = newUnsubscribeToken();

  await sql`
    insert into cron (
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

  await auditJobEvent(sql, {
    eventPayload: {
      actionType: "reassessment",
      businessEvent: true,
      cronId,
      email: emailValidation.email,
      recurrenceDays: 60
    },
    eventType: "cron_action_scheduled",
    level: "low",
    planId
  });

  return cronId;
}

export async function cancelReassessmentActionByToken(token: string) {
  const sql = getSql();
  const normalizedToken = token.trim();

  if (!sql || !isUuid(normalizedToken)) {
    return { cancelled: false, reason: "invalid_token" as const };
  }

  await ensureJobsSchema(sql);

  const rows = await sql<
    Array<{
      id: string;
      job_id: string | null;
      plan_id: string | null;
      status: string;
    }>
  >`
    select
      id::text,
      job_id::text,
      plan_id::text,
      status
    from cron
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

  const cancelled = await sql.begin(async (transaction) => {
    const updated = await transaction<Array<{ id: string }>>`
      update cron set
        status = 'cancelled',
        job_id = null,
        unsubscribed_at = now(),
        result_payload = coalesce(result_payload, '{}'::jsonb) || ${transaction.json(
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

    await transaction`
      update jobs set
        status = 'failed',
        error_message = 'Cancelled by unsubscribe',
        failed_at = now(),
        updated_at = now()
      where job_type = 'reassessment'
        and status = 'queued'
        and payload ->> 'cronId' = ${row.id}
    `;

    return updated.length > 0;
  });

  await auditJobEvent(sql, {
    eventPayload: {
      actionType: "reassessment",
      cronId: row.id,
      status: cancelled ? "cancelled" : row.status
    },
    eventType: "reassessment_unsubscribed",
    level: "medium",
    planId: row.plan_id
  });

  return {
    cancelled,
    planId: row.plan_id,
    reason: cancelled ? ("cancelled" as const) : ("not_active" as const)
  };
}

async function enqueueReassessmentEmailJob(
  sql: postgres.Sql,
  {
    cronId,
    email,
    locale,
    planId
  }: Readonly<{
    cronId: string;
    email: string;
    locale: Locale;
    planId: string;
  }>
) {
  const existing = await sql`
    select id::text
    from jobs
    where plan_id = ${planId}::uuid
      and job_type = 'reassessment'
      and status in ('queued', 'running')
      and payload ->> 'cronId' = ${cronId}
    order by queued_at desc
    limit 1
  `;

  if (existing[0]) {
    const existingJobId = existing[0].id as string;

    await ensureTaskForJob(sql, {
      jobId: existingJobId,
      jobType: "reassessment",
      payload: { cronId, email, locale },
      planId
    });

    return existingJobId;
  }

  const jobId = crypto.randomUUID();

  await sql`
    insert into jobs (
      id,
      job_type,
      plan_id,
      status,
      priority,
      payload,
      queued_at,
      updated_at
    )
    values (
      ${jobId}::uuid,
      'reassessment',
      ${planId}::uuid,
      'queued',
      ${JOB_PRIORITIES.reassessment},
      ${sql.json(toJsonValue({ cronId, email, locale }))},
      now(),
      now()
    )
  `;

  await sql`
    update cron set
      status = 'queued',
      job_id = ${jobId}::uuid,
      queued_at = now(),
      updated_at = now()
    where id = ${cronId}::uuid
  `;

  await auditJobEvent(sql, {
    eventPayload: {
      businessEvent: true,
      cronId,
      email
    },
    eventType: "reassessment_job_enqueued",
    jobId,
    level: "low",
    planId
  });

  await ensureTaskForJob(sql, {
    jobId,
    jobType: "reassessment",
    payload: { cronId, email, locale },
    planId
  });

  return jobId;
}

async function claimDueCronActions(sql: postgres.Sql) {
  return sql.begin(async (transaction) => {
    const rows = await transaction<
      Array<{
        id: string;
        plan_id: string | null;
        recipient: unknown;
        payload: unknown;
      }>
    >`
      update cron set
        status = 'queued',
        attempts = attempts + 1,
        updated_at = now()
      where id in (
        select id
        from cron
        where scheduled_for <= now()
          and (
            status = 'scheduled'
            or (
              status = 'queued'
              and job_id is null
              and updated_at < now() - interval '10 minutes'
            )
          )
        order by scheduled_for asc
        for update skip locked
        limit 25
      )
      returning id::text, plan_id::text, recipient, payload
    `;

    return rows;
  });
}

async function runCronWorker() {
  const sql = getSql();

  if (!sql) {
    return { queued: 0 };
  }

  await ensureJobsSchema(sql);
  await auditJobEvent(sql, {
    eventType: "cron_worker_started",
    level: "low"
  });

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

      await enqueueReassessmentEmailJob(sql, {
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
        update cron set
          status = 'failed',
          error_message = ${message},
          updated_at = now()
        where id = ${action.id}::uuid
      `;
      await auditJobEvent(sql, {
        eventPayload: { cronId: action.id, error: message },
        eventType: "cron_action_failed",
        level: "high",
        planId: isUuid(planId) ? planId : null
      });
    }
  }

  await auditJobEvent(sql, {
    eventPayload: { queued },
    eventType: "cron_worker_completed",
    level: "low"
  });

  if (queued > 0) {
    void kickJobsWorker();
  }

  return { queued };
}

async function claimNextJob(sql: postgres.Sql) {
  return sql.begin(async (transaction) => {
    const rows = await transaction<ClaimedJob[]>`
      update jobs set
        status = 'running',
        attempts = attempts + 1,
        started_at = coalesce(started_at, now()),
        updated_at = now()
      where id = (
        select id
        from jobs
        where status = 'queued'
          and job_type <> 'supplement_review'
        order by priority desc, queued_at asc
        for update skip locked
        limit 1
      )
      returning id::text, job_type, plan_id::text, attempts, payload
    `;

    const job = rows[0] ?? null;

    if (job?.plan_id && job.job_type === "formulation") {
      await transaction`
      update assessments set
        status = 'preparing',
        queue_position = 0,
        error_message = null,
        processing_started_at = coalesce(processing_started_at, now()),
        updated_at = now()
      where plan_id = ${job.plan_id}::uuid
      `;
    }

    return job;
  });
}

async function deferReservedTask(
  sql: postgres.Sql,
  reserved: ReservedTask,
  reason: string
) {
  await sql.begin(async (transaction) => {
    await transaction`
      update public.task_reservations set
        status = 'released',
        released_at = now()
      where task_id = ${reserved.task.id}::uuid
        and status = 'active'
    `;

    await transaction`
      update public.tasks set
        status = 'queued',
        attempts = greatest(attempts - 1, 0),
        reserved_by_agent_id = null,
        lease_until = null,
        scheduled_for = now() + interval '10 minutes',
        updated_at = now()
      where id = ${reserved.task.id}::uuid
        and status in ('reserved', 'running')
    `;

    await transaction`
      insert into public.task_events (
        id,
        task_id,
        goal_id,
        agent_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      values (
        ${randomUUID()}::uuid,
        ${reserved.task.id}::uuid,
        ${reserved.task.goalId}::uuid,
        ${reserved.agent.id}::uuid,
        'task_deferred',
        'observed',
        'low',
        ${transaction.json(
          toJsonValue({
            legacyJobId: reserved.task.legacyJobId,
            reason
          })
        )},
        now(),
        now()
      )
    `;
  });
}

async function claimJobForReservedTask(
  sql: postgres.Sql,
  reserved: ReservedTask
): Promise<ClaimedJob | null> {
  const legacyJobId = reserved.task.legacyJobId;

  if (!legacyJobId) {
    await failTask({
      errorMessage: "Reserved worker task is missing legacy_job_id.",
      resultPayload: {
        taskType: reserved.task.taskType
      },
      taskId: reserved.task.id
    });

    return null;
  }

  const rows = await sql.begin(async (transaction) => {
    const claimed = await transaction<ClaimedJob[]>`
      update jobs set
        status = 'running',
        attempts = attempts + 1,
        started_at = coalesce(started_at, now()),
        updated_at = now()
      where id = ${legacyJobId}::uuid
        and (
          status = 'queued'
          or (
            status = 'running'
            and updated_at < now() - make_interval(mins => ${STALE_RUNNING_JOB_MINUTES})
          )
        )
        and job_type <> 'supplement_review'
      returning id::text, job_type, plan_id::text, attempts, payload
    `;
    const job = claimed[0] ?? null;

    if (job?.plan_id && job.job_type === "formulation") {
      await transaction`
        update assessments set
          status = 'preparing',
          queue_position = 0,
          error_message = null,
          processing_started_at = coalesce(processing_started_at, now()),
          updated_at = now()
        where plan_id = ${job.plan_id}::uuid
      `;
    }

    return claimed;
  });
  const job = rows[0] ?? null;

  if (job) {
    return job;
  }

  const statusRows = await sql<Array<{
    error_message: string | null;
    status: string;
  }>>`
    select status, error_message
    from jobs
    where id = ${legacyJobId}::uuid
    limit 1
  `;
  const status = statusRows[0]?.status ?? "missing";

  if (status === "complete") {
    await completeTask({
      resultPayload: {
        legacyJobId,
        status
      },
      taskId: reserved.task.id
    });
  } else if (status === "running") {
    await deferReservedTask(
      sql,
      reserved,
      "Legacy job is already running; task-backed worker will retry later."
    );
  } else {
    await failTask({
      errorMessage:
        statusRows[0]?.error_message ??
        `Legacy job is not available for processing: ${status}.`,
      resultPayload: {
        legacyJobId,
        status
      },
      taskId: reserved.task.id
    });
  }

  return null;
}

async function claimNextTaskJob(sql: postgres.Sql): Promise<ClaimedTaskJob | null> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const reserved = await reserveNextTask({
      agent: {
        capabilities: [JOB_WORKER_CAPABILITY],
        metadata: {
          bridge: "legacy_jobs"
        },
        name: "MattaNutra Jobs Worker",
        type: "deterministic"
      },
      leaseSeconds: 3600,
      mustRequireCapability: JOB_WORKER_CAPABILITY,
      taskTypes: [...JOB_WORKER_TASK_TYPES]
    });

    if (!reserved) {
      return null;
    }

    const job = await claimJobForReservedTask(sql, reserved);

    if (job) {
      return {
        job,
        reserved
      };
    }
  }

  return null;
}

async function failJob(
  sql: postgres.Sql,
  job: ClaimedJob,
  error: unknown
) {
  const message = error instanceof Error ? error.message : "Unknown job error";

  await sql.begin(async (transaction) => {
    await transaction`
      update jobs set
        status = 'failed',
        error_message = ${message},
        failed_at = now(),
        updated_at = now()
      where id = ${job.id}::uuid
    `;

    if (job.plan_id && job.job_type === "formulation") {
      await transaction`
        update assessments set
          status = 'failed',
          error_message = ${message},
          updated_at = now()
        where plan_id = ${job.plan_id}::uuid
      `;
    }

    if (
      job.plan_id &&
      (job.job_type === "example_formulation" ||
        job.job_type === "example_email")
    ) {
      const requestId = payloadText(job.payload, "requestId");

      if (isUuid(requestId)) {
        await transaction`
          update assessment_example_requests set
            status = 'failed',
            error_message = ${message},
            updated_at = now()
          where id = ${requestId}::uuid
        `;
      }
    }

    if (job.job_type === "reassessment") {
      const cronId = payloadText(job.payload, "cronId");

      if (isUuid(cronId)) {
        await transaction`
          update cron set
            status = 'failed',
            error_message = ${message},
            updated_at = now()
          where id = ${cronId}::uuid
        `;
      }
    }
  });

  await auditJobEvent(sql, {
    eventPayload: { error: message },
    eventType: "job_failed",
    jobId: job.id,
    level: "critical",
    planId: job.plan_id
  });
  await writeBpmEvent({
    actorType: "worker",
    errorCode: "job_failed",
    errorMessage: message,
    eventName: "worker_job_failed",
    eventType: "error",
    jobId: job.id,
    planId: job.plan_id,
    properties: {
      jobType: job.job_type
    },
    severity: "critical"
  });
}

function hasHealthScoreAdvice(value: unknown) {
  const advice = payloadRecord(payloadRecord(value).advice);
  const overview = advice.overview;

  return (
    Boolean(overview && typeof overview === "object") ||
    Array.isArray(advice.paywallFeatures)
  );
}

async function completeHealthScoreAnalysisJob(
  sql: postgres.Sql,
  job: ClaimedJob
) {
  if (!job.plan_id) {
    throw new Error("HealthScore analysis job is missing plan_id");
  }

  const rows = await sql`
    select
      answers,
      health_score,
      locale
    from assessments
    where plan_id = ${job.plan_id}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Assessment submission not found");
  }

  const healthScore = payloadRecord(row.health_score);

  if (typeof healthScore.score !== "number") {
    throw new Error("Assessment is missing a backend HealthScore");
  }

  const locale: Locale = isLocale(row.locale) ? row.locale : "en";
  const baseHealthScore = healthScore as HealthScoreResult;
  const updatedHealthScore: HealthScoreResult = hasHealthScoreAdvice(healthScore)
    ? baseHealthScore
    : ({
        ...baseHealthScore,
        advice: await analyzeHealthScoreAdvice({
          answers: row.answers,
          healthScore: baseHealthScore,
          locale
        })
      } as HealthScoreResult);

  await sql.begin(async (transaction) => {
    await transaction`
      update assessments set
        health_score = ${transaction.json(toJsonValue(updatedHealthScore))},
        updated_at = now()
      where plan_id = ${job.plan_id}::uuid
    `;

    await transaction`
      update jobs set
        status = 'complete',
        completed_at = now(),
        updated_at = now()
      where id = ${job.id}::uuid
    `;

    await transaction`
      insert into job_audit_events (
        id,
        job_id,
        plan_id,
        event_type,
        level,
        event_payload,
        created_at
      )
      values (
        ${crypto.randomUUID()}::uuid,
        ${job.id}::uuid,
        ${job.plan_id}::uuid,
        'healthscore_analysis_completed',
        'medium',
        ${transaction.json(
          toJsonValue({
            businessEvent: true,
            cachedOrExisting: hasHealthScoreAdvice(healthScore)
          })
        )},
        now()
      )
    `;
  });

  await writeBpmEvent({
    actorType: "worker",
    eventName: "healthscore_analysis_completed",
    eventType: "funnel",
    jobId: job.id,
    locale,
    planId: job.plan_id
  });
}

async function completeFormulationJob(sql: postgres.Sql, job: ClaimedJob) {
  if (!job.plan_id) {
    throw new Error("Formulation job is missing plan_id");
  }

  const submissions = await sql`
    select
      answers,
      locale,
      selected_plan::text
    from assessments
    where plan_id = ${job.plan_id}::uuid
    limit 1
  `;
  const submission = submissions[0];

  if (!submission) {
    throw new Error("Assessment submission not found");
  }

  const locale: Locale = isLocale(submission.locale)
    ? submission.locale
    : "en";
  const plan = normalizeAssessmentPlan(submission.selected_plan);

  await auditJobEvent(sql, {
    eventType: "formulation_analysis_started",
    jobId: job.id,
    level: "medium",
    planId: job.plan_id
  });

  const analysis = await analyzeFormulationWithGrok({
    answers: submission.answers,
    audit: async ({ eventType, level, payload }) =>
      auditJobEvent(sql, {
        eventPayload: payload,
        eventType,
        jobId: job.id,
        level,
        planId: job.plan_id
      }),
    locale,
    plan,
    planId: job.plan_id
  });
  const safeFormulation = await applyFormulationSafety(sql, {
    audit: async ({ eventType, level, payload }) =>
      auditJobEvent(sql, {
        eventPayload: payload,
        eventType,
        jobId: job.id,
        level,
        planId: job.plan_id
      }),
    formulation: analysis.formulation,
    jobId: job.id,
    locale,
    plan,
    planId: job.plan_id
  });
  await sql.begin(async (transaction) => {
    const versionRows = await transaction<{ version: number }[]>`
      select greatest(
        (
          select coalesce(max(version), 0)
          from formulations
          where plan_id = ${job.plan_id}::uuid
        ),
        (
          select coalesce(max(version), 0)
          from recommendations
          where plan_id = ${job.plan_id}::uuid
        )
      ) + 1 as version
    `;
    const version = Number(versionRows[0]?.version ?? 1);

    await transaction`
      insert into formulations (
        plan_id,
        version,
        formulation,
        model_version,
        generated_at,
        updated_at
      )
      values (
        ${job.plan_id}::uuid,
        ${version},
        ${transaction.json(toJsonValue(safeFormulation))},
        ${`xai:${analysis.model}:${analysis.reasoningEffort}:${analysis.promptVersion}`},
        now(),
        now()
      )
    `;

    await transaction`
      insert into recommendations (
        plan_id,
        version,
        recommendations,
        generated_at,
        updated_at
      )
      values (
        ${job.plan_id}::uuid,
        ${version},
        ${transaction.json(toJsonValue([]))},
        now(),
        now()
      )
    `;

    await transaction`
      update assessments set
        status = 'ready',
        queue_position = 0,
        error_message = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where plan_id = ${job.plan_id}::uuid
    `;

    await transaction`
      update jobs set
        status = 'complete',
        completed_at = now(),
        updated_at = now()
      where id = ${job.id}::uuid
    `;

    await transaction`
      insert into job_audit_events (
        id,
        job_id,
        plan_id,
        event_type,
        level,
        event_payload,
        created_at
      )
      values (
        ${crypto.randomUUID()}::uuid,
        ${job.id}::uuid,
        ${job.plan_id}::uuid,
        'formulation_version_written',
        'medium',
        ${transaction.json(
          toJsonValue({
            attempts: analysis.attempts,
            businessEvent: true,
            formulationVersion: version,
            model: analysis.model,
            promptVersion: analysis.promptVersion,
            recommendationVersion: version,
            reasoningEffort: analysis.reasoningEffort,
            responseId: analysis.responseId,
            safetySummary: safeFormulation.safetySummary
          })
        )},
        now()
      )
    `;
  });

  await auditJobEvent(sql, {
    eventPayload: {
      attempts: analysis.attempts,
      safetySummary: safeFormulation.safetySummary,
      model: analysis.model,
      promptVersion: analysis.promptVersion,
      reasoningEffort: analysis.reasoningEffort
    },
    eventType: "job_completed",
    jobId: job.id,
    level: "medium",
    planId: job.plan_id
  });
  await writeBpmEvent({
    actorType: "worker",
    eventName: "formulation_ready",
    eventType: "formulation",
    jobId: job.id,
    locale,
    metrics: {
      attempts: analysis.attempts
    },
    planId: job.plan_id,
    properties: {
      model: analysis.model,
      promptVersion: analysis.promptVersion,
      reasoningEffort: analysis.reasoningEffort,
      responseId: analysis.responseId
    },
    selectedPlan: plan
  });
}

async function completeExampleFormulationJob(
  sql: postgres.Sql,
  job: ClaimedJob
) {
  if (!job.plan_id) {
    throw new Error("Example formulation job is missing plan_id");
  }

  const requestId = payloadText(job.payload, "requestId");

  if (!isUuid(requestId)) {
    throw new Error("Example formulation job is missing requestId");
  }

  const submissions = await sql`
    select
      assessments.answers,
      assessments.locale,
      assessments.selected_plan::text,
      assessment_example_requests.status as request_status
    from assessments
    join assessment_example_requests
      on assessment_example_requests.plan_id = assessments.plan_id
    where assessments.plan_id = ${job.plan_id}::uuid
      and assessment_example_requests.id = ${requestId}::uuid
    limit 1
  `;
  const submission = submissions[0];

  if (!submission) {
    throw new Error("Example request not found");
  }

  const locale: Locale = isLocale(submission.locale)
    ? submission.locale
    : "en";
  const plan = normalizeAssessmentPlan(submission.selected_plan);

  await auditJobEvent(sql, {
    eventPayload: { requestId },
    eventType: "example_formulation_analysis_started",
    jobId: job.id,
    level: "medium",
    planId: job.plan_id
  });

  const analysis = await analyzeFormulationWithGrok({
    answers: submission.answers,
    audit: async ({ eventType, level, payload }) =>
      auditJobEvent(sql, {
        eventPayload: { ...payload, requestId },
        eventType,
        jobId: job.id,
        level,
        planId: job.plan_id
      }),
    locale,
    plan,
    planId: job.plan_id
  });
  const safeFormulation = await applyFormulationSafety(sql, {
    audit: async ({ eventType, level, payload }) =>
      auditJobEvent(sql, {
        eventPayload: { ...payload, requestId },
        eventType,
        jobId: job.id,
        level,
        planId: job.plan_id
      }),
    formulation: analysis.formulation,
    jobId: job.id,
    locale,
    plan,
    planId: job.plan_id,
    requestId
  });

  await sql.begin(async (transaction) => {
    const versionRows = await transaction<{ version: number }[]>`
      select coalesce(max(version), 0) + 1 as version
      from formulations
      where plan_id = ${job.plan_id}::uuid
    `;
    const version = Number(versionRows[0]?.version ?? 1);

    await transaction`
      insert into formulations (
        plan_id,
        version,
        formulation,
        model_version,
        generated_at,
        updated_at
      )
      values (
        ${job.plan_id}::uuid,
        ${version},
        ${transaction.json(toJsonValue(safeFormulation))},
        ${`xai:${analysis.model}:${analysis.reasoningEffort}:${analysis.promptVersion}:example`},
        now(),
        now()
      )
    `;

    await transaction`
      update assessment_example_requests set
        status = 'formulation_ready',
        updated_at = now()
      where id = ${requestId}::uuid
    `;

    await transaction`
      update jobs set
        status = 'complete',
        completed_at = now(),
        updated_at = now()
      where id = ${job.id}::uuid
    `;

    await transaction`
      insert into job_audit_events (
        id,
        job_id,
        plan_id,
        event_type,
        level,
        event_payload,
        created_at
      )
      values (
        ${crypto.randomUUID()}::uuid,
        ${job.id}::uuid,
        ${job.plan_id}::uuid,
        'example_formulation_version_written',
        'medium',
        ${transaction.json(
          toJsonValue({
            attempts: analysis.attempts,
            businessEvent: true,
            formulationVersion: version,
            model: analysis.model,
            promptVersion: analysis.promptVersion,
            reasoningEffort: analysis.reasoningEffort,
            requestId,
            responseId: analysis.responseId,
            safetySummary: safeFormulation.safetySummary
          })
        )},
        now()
      )
    `;
  });

  await enqueueExampleEmailJob(sql, {
    planId: job.plan_id,
    requestId
  });
  await writeBpmEvent({
    actorType: "worker",
    eventName: "free_example_formulation_ready",
    eventType: "formulation",
    exampleRequestId: requestId,
    jobId: job.id,
    locale,
    metrics: {
      attempts: analysis.attempts,
      safetySummary: safeFormulation.safetySummary
    },
    planId: job.plan_id,
    properties: {
      model: analysis.model,
      promptVersion: analysis.promptVersion,
      reasoningEffort: analysis.reasoningEffort,
      responseId: analysis.responseId
    },
    selectedPlan: plan
  });
}

async function completeExampleEmailJob(sql: postgres.Sql, job: ClaimedJob) {
  if (!job.plan_id) {
    throw new Error("Example email job is missing plan_id");
  }

  const requestId = payloadText(job.payload, "requestId");

  if (!isUuid(requestId)) {
    throw new Error("Example email job is missing requestId");
  }

  const rows = await sql`
    select
      assessment_example_requests.email,
      assessment_example_requests.health_score,
      assessment_example_requests.locale,
      reassessment.cron_id,
      reassessment.unsubscribe_token,
      formulations.formulation
    from assessment_example_requests
    join lateral (
      select formulation
      from formulations
      where formulations.plan_id = assessment_example_requests.plan_id
      order by version desc, generated_at desc
      limit 1
    ) formulations on true
    left join lateral (
      select
        cron.id::text as cron_id,
        cron.unsubscribe_token
      from cron
      where cron.plan_id = assessment_example_requests.plan_id
        and cron.action_type = 'reassessment'
        and cron.status in ('scheduled', 'queued')
        and lower(cron.recipient ->> 'email') = lower(assessment_example_requests.email)
      order by cron.scheduled_for desc, cron.created_at desc
      limit 1
    ) reassessment on true
    where assessment_example_requests.id = ${requestId}::uuid
      and assessment_example_requests.plan_id = ${job.plan_id}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Example email request is missing formulation");
  }

  const locale: Locale = isLocale(row.locale) ? row.locale : "en";
  const formulation = row.formulation as FormulationBlueprint;
  const emailValidation = validateLeadEmail(row.email);

  if (!emailValidation.ok) {
    throw new Error("Example email request has an invalid recipient");
  }

  const cronId = typeof row.cron_id === "string" ? row.cron_id : "";
  let unsubscribeToken =
    typeof row.unsubscribe_token === "string" ? row.unsubscribe_token : "";

  if (isUuid(cronId) && !unsubscribeToken) {
    unsubscribeToken = newUnsubscribeToken();
    await sql`
      update cron set
        unsubscribe_token = ${unsubscribeToken},
        updated_at = now()
      where id = ${cronId}::uuid
    `;
  }

  const emailHtml = buildExampleEmailHtml({
    formulation,
    healthScore: row.health_score as HealthScoreResult,
    locale,
    planId: job.plan_id,
    unsubscribeToken: unsubscribeToken || null
  });
  const delivery = await sendTransactionalEmail({
    html: emailHtml,
    subject: buildExampleEmailSubject(
      locale,
      row.health_score as HealthScoreResult
    ),
    to: emailValidation.email
  });
  const eventType = delivery.sent
    ? "example_email_sent"
    : "example_email_rendered_not_sent";

  await sql.begin(async (transaction) => {
    await transaction`
      update assessment_example_requests set
        status = ${delivery.sent ? "email_sent" : "email_rendered"},
        email_html = ${emailHtml},
        updated_at = now()
      where id = ${requestId}::uuid
    `;

    await transaction`
      update jobs set
        status = 'complete',
        completed_at = now(),
        updated_at = now()
      where id = ${job.id}::uuid
    `;

    await transaction`
      insert into job_audit_events (
        id,
        job_id,
        plan_id,
        event_type,
        level,
        event_payload,
        created_at
      )
      values (
        ${crypto.randomUUID()}::uuid,
        ${job.id}::uuid,
        ${job.plan_id}::uuid,
        ${eventType},
        'medium',
        ${transaction.json(
          toJsonValue({
            businessEvent: true,
            emailType: "example_preview",
            messageId: delivery.messageId,
            reason: delivery.reason,
            requestId,
            sent: delivery.sent,
            to: emailValidation.email
          })
        )},
        now()
      )
    `;
  });
  await writeBpmEvent({
    actorType: "worker",
    email: emailValidation.email,
    eventName: delivery.sent ? "free_email_sent" : "free_email_rendered",
    eventType: "email",
    exampleRequestId: requestId,
    jobId: job.id,
    locale,
    planId: job.plan_id,
    properties: {
      messageId: delivery.messageId,
      reason: delivery.reason
    }
  });
}

async function completeReassessmentJob(
  sql: postgres.Sql,
  job: ClaimedJob
) {
  if (!job.plan_id) {
    throw new Error("Reassessment job is missing plan_id");
  }

  const cronId = payloadText(job.payload, "cronId");

  if (!isUuid(cronId)) {
    throw new Error("Reassessment job is missing cronId");
  }

  const rows = await sql`
    select
      cron.payload,
      cron.recurrence_days,
      cron.recipient,
      cron.unsubscribe_token
    from cron
    where cron.id = ${cronId}::uuid
      and cron.plan_id = ${job.plan_id}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Scheduled reassessment action not found");
  }

  const payload = payloadRecord(row.payload);
  const recipient = payloadRecord(row.recipient);
  const storedRecurrenceDays = Number(row.recurrence_days ?? 60);
  const recurrenceDays =
    Number.isFinite(storedRecurrenceDays) && storedRecurrenceDays > 0
      ? storedRecurrenceDays
      : 60;
  const locale: Locale = isLocale(payload.locale) ? payload.locale : "en";
  const email = typeof recipient.email === "string" ? recipient.email : "";
  const emailValidation = validateLeadEmail(email);

  if (!emailValidation.ok) {
    throw new Error("Scheduled reassessment email is invalid");
  }

  const unsubscribeToken =
    typeof row.unsubscribe_token === "string" && row.unsubscribe_token
      ? row.unsubscribe_token
      : newUnsubscribeToken();

  const emailHtml = buildReassessmentEmailHtml({
    locale,
    planId: job.plan_id,
    unsubscribeToken
  });
  const delivery = await sendTransactionalEmail({
    html: emailHtml,
    subject: buildReassessmentEmailSubject(locale),
    to: emailValidation.email
  });
  const eventType = delivery.sent
    ? "reassessment_email_sent"
    : "reassessment_rendered_not_sent";

  console.info("Rendered reassessment email", {
    cronId,
    email: emailValidation.email,
    emailHtml,
    planId: job.plan_id
  });

  await sql.begin(async (transaction) => {
    await transaction`
      update cron set
        status = case
          when coalesce(recurrence_days, ${recurrenceDays}) > 0
          then 'scheduled'
          else 'complete'
        end,
        scheduled_for = case
          when coalesce(recurrence_days, ${recurrenceDays}) > 0
          then now() + (coalesce(recurrence_days, ${recurrenceDays}) * interval '1 day')
          else scheduled_for
        end,
        job_id = null,
        unsubscribe_token = ${unsubscribeToken},
        result_payload = ${transaction.json(
          toJsonValue({
            email: emailValidation.email,
            lastRenderedAt: new Date().toISOString(),
            lastRunJobId: job.id,
            messageId: delivery.messageId,
            reason: delivery.reason,
            recurrenceDays,
            sent: delivery.sent
          })
        )},
        completed_at = now(),
        updated_at = now()
      where id = ${cronId}::uuid
    `;

    await transaction`
      update jobs set
        status = 'complete',
        completed_at = now(),
        updated_at = now()
      where id = ${job.id}::uuid
    `;

    await transaction`
      insert into job_audit_events (
        id,
        job_id,
        plan_id,
        event_type,
        level,
        event_payload,
        created_at
      )
      values (
        ${crypto.randomUUID()}::uuid,
        ${job.id}::uuid,
        ${job.plan_id}::uuid,
        ${eventType},
        'medium',
        ${transaction.json(
          toJsonValue({
            businessEvent: true,
            cronId,
            emailHtml,
            emailType: "reassessment",
            messageId: delivery.messageId,
            reason: delivery.reason,
            recurrenceDays,
            sent: delivery.sent,
            to: emailValidation.email
          })
        )},
        now()
      )
    `;
  });
  await writeBpmEvent({
    actorType: "worker",
    cronId,
    email: emailValidation.email,
    eventName: delivery.sent
      ? "reassessment_email_sent"
      : "reassessment_email_rendered",
    eventType: "reassessment",
    jobId: job.id,
    locale,
    planId: job.plan_id,
    properties: {
      messageId: delivery.messageId,
      reason: delivery.reason,
      recurrenceDays
    }
  });
}

async function processJob(sql: postgres.Sql, job: ClaimedJob) {
  if (job.job_type === "example_email") {
    await completeExampleEmailJob(sql, job);
    return;
  }

  if (job.job_type === "example_formulation") {
    await completeExampleFormulationJob(sql, job);
    return;
  }

  if (job.job_type === "formulation") {
    await completeFormulationJob(sql, job);
    return;
  }

  if (job.job_type === "healthscore_analysis") {
    await completeHealthScoreAnalysisJob(sql, job);
    return;
  }

  if (job.job_type === "reassessment") {
    await completeReassessmentJob(sql, job);
    return;
  }

  throw new Error(`Unsupported job type: ${job.job_type}`);
}

async function runJobsWorker() {
  const sql = getSql();

  if (!sql) {
    return;
  }

  await ensureJobsSchema(sql);
  await auditJobEvent(sql, {
    eventType: "worker_started",
    level: "low"
  });

  while (true) {
    const claimedTaskJob = await claimNextTaskJob(sql);
    const job = claimedTaskJob?.job ?? (await claimNextJob(sql));

    if (!job) {
      await auditJobEvent(sql, {
        eventType: "worker_idle",
        level: "low"
      });
      return;
    }

    await auditJobEvent(sql, {
      eventPayload: {
        attempts: job.attempts,
        jobType: job.job_type,
        taskBacked: Boolean(claimedTaskJob),
        taskId: claimedTaskJob?.reserved.task.id,
        goalId: claimedTaskJob?.reserved.task.goalId
      },
      eventType: "job_picked_up",
      jobId: job.id,
      level: "low",
      planId: job.plan_id
    });

    try {
      await processJob(sql, job);

      if (claimedTaskJob) {
        try {
          await completeTask({
            resultPayload: {
              jobId: job.id,
              jobType: job.job_type,
              planId: job.plan_id,
              status: "complete"
            },
            taskId: claimedTaskJob.reserved.task.id
          });
        } catch (taskError) {
          console.warn("Unable to complete task-backed job task", {
            error: taskError,
            jobId: job.id,
            taskId: claimedTaskJob.reserved.task.id
          });
        }
      }
    } catch (error) {
      await failJob(sql, job, error);

      if (claimedTaskJob) {
        const message =
          error instanceof Error ? error.message : "Unknown job error";

        try {
          await failTask({
            errorMessage: message,
            resultPayload: {
              jobId: job.id,
              jobType: job.job_type,
              planId: job.plan_id
            },
            taskId: claimedTaskJob.reserved.task.id
          });
        } catch (taskError) {
          console.warn("Unable to fail task-backed job task", {
            error: taskError,
            jobId: job.id,
            taskId: claimedTaskJob.reserved.task.id
          });
        }
      }
    }
  }
}

export function kickJobsWorker() {
  if (globalJobsWorker.mattanutraJobsWorker) {
    return globalJobsWorker.mattanutraJobsWorker;
  }

  globalJobsWorker.mattanutraJobsWorker = runJobsWorker().finally(() => {
    globalJobsWorker.mattanutraJobsWorker = undefined;
  });

  return globalJobsWorker.mattanutraJobsWorker;
}

export function kickCronWorker() {
  if (globalJobsWorker.mattanutraCronWorker) {
    return globalJobsWorker.mattanutraCronWorker;
  }

  globalJobsWorker.mattanutraCronWorker = runCronWorker().finally(() => {
    globalJobsWorker.mattanutraCronWorker = undefined;
  });

  return globalJobsWorker.mattanutraCronWorker;
}
