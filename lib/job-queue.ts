import type postgres from "postgres";
import { getSql } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n";
import { type AssessmentPlan } from "@/lib/assessment-jobs";
import {
  getMockFormulationBlueprint,
  getMockRecommendations
} from "@/lib/mock-formulation";
import {
  ensureAssessmentSchema,
  isUuid,
  toJsonValue
} from "@/lib/assessment-store";

type JobType = "formulation";

type ClaimedJob = {
  attempts: number;
  id: string;
  job_type: JobType | string;
  plan_id: string | null;
};

const globalJobsWorker = globalThis as typeof globalThis & {
  mattanutraJobsSchemaReady?: Promise<void>;
  mattanutraJobsWorker?: Promise<void>;
};

function priorityForPlan(plan: AssessmentPlan) {
  if (plan === "pro") {
    return 30;
  }

  if (plan === "precision") {
    return 20;
  }

  return 10;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function ensureJobsSchema(sql: postgres.Sql) {
  globalJobsWorker.mattanutraJobsSchemaReady ??= (async () => {
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
        plan_id uuid primary key references assessments(plan_id) on delete cascade,
        formulation jsonb not null,
        model_version text null,
        generated_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;

    await sql`
      create table if not exists recommendations (
        plan_id uuid primary key references assessments(plan_id) on delete cascade,
        recommendations jsonb not null,
        generated_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;

    await sql`
      create index if not exists jobs_queue_idx
        on jobs (status, priority desc, queued_at asc)
    `;
    await sql`
      create index if not exists jobs_plan_type_idx
        on jobs (plan_id, job_type, status)
    `;
  })();

  await globalJobsWorker.mattanutraJobsSchemaReady;
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

  const existing = await sql`
    select id::text
    from jobs
    where plan_id = ${planId}::uuid
      and job_type = 'formulation'
      and status in ('queued', 'running', 'complete')
    order by queued_at desc
    limit 1
  `;

  if (existing[0]) {
    return existing[0].id as string;
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

  await sql`
    update assessments set
      selected_plan = ${plan},
      status = 'queued',
      queue_position = coalesce(queue_position, 1),
      plan_selected_at = coalesce(plan_selected_at, now()),
      updated_at = now()
    where plan_id = ${planId}::uuid
  `;

  return jobId;
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
        order by priority desc, queued_at asc
        for update skip locked
        limit 1
      )
      returning id::text, job_type, plan_id::text, attempts
    `;

    const job = rows[0] ?? null;

    if (job?.plan_id) {
      await transaction`
        update assessments set
          status = 'preparing',
          queue_position = 0,
          processing_started_at = coalesce(processing_started_at, now()),
          updated_at = now()
        where plan_id = ${job.plan_id}::uuid
      `;
    }

    return job;
  });
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

    if (job.plan_id) {
      await transaction`
        update assessments set
          status = 'failed',
          error_message = ${message},
          updated_at = now()
        where plan_id = ${job.plan_id}::uuid
      `;
    }
  });
}

async function completeFormulationJob(sql: postgres.Sql, job: ClaimedJob) {
  if (!job.plan_id) {
    throw new Error("Formulation job is missing plan_id");
  }

  const submissions = await sql`
    select
      locale
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
  const formulation = getMockFormulationBlueprint(locale);
  const recommendations = getMockRecommendations(locale);

  await delay(randomInt(1200, 2400));

  await sql.begin(async (transaction) => {
    await transaction`
      insert into formulations (
        plan_id,
        formulation,
        model_version,
        generated_at,
        updated_at
      )
      values (
        ${job.plan_id}::uuid,
        ${transaction.json(toJsonValue(formulation))},
        'mock-v1',
        now(),
        now()
      )
      on conflict (plan_id) do update set
        formulation = excluded.formulation,
        model_version = excluded.model_version,
        updated_at = now()
    `;

    await transaction`
      insert into recommendations (
        plan_id,
        recommendations,
        generated_at,
        updated_at
      )
      values (
        ${job.plan_id}::uuid,
        ${transaction.json(toJsonValue(recommendations))},
        now(),
        now()
      )
      on conflict (plan_id) do update set
        recommendations = excluded.recommendations,
        updated_at = now()
    `;

    await transaction`
      update assessments set
        status = 'ready',
        queue_position = 0,
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
  });
}

async function processJob(sql: postgres.Sql, job: ClaimedJob) {
  if (job.job_type === "formulation") {
    await completeFormulationJob(sql, job);
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

  while (true) {
    const job = await claimNextJob(sql);

    if (!job) {
      return;
    }

    try {
      await processJob(sql, job);
    } catch (error) {
      await failJob(sql, job, error);
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
