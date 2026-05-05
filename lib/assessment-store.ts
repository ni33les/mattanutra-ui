import type postgres from "postgres";
import {
  buildAssessmentSteps,
  type AssessmentPlan,
  type AssessmentSnapshot
} from "@/lib/assessment-jobs";
import {
  buildAssessmentSummary,
  getMockFormulationBlueprint,
  type FormulationIngredient,
  type FormulationResult,
  type RecommendedProduct
} from "@/lib/mock-formulation";
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

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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
    await sql`
      do $$
      declare
        constraint_names text[][] := array[
          ['assessment_submissions_pkey', 'assessments_pkey'],
          ['assessment_submissions_plan_id_not_null', 'assessments_plan_id_not_null'],
          ['assessment_submissions_locale_not_null', 'assessments_locale_not_null'],
          ['assessment_submissions_status_not_null', 'assessments_status_not_null'],
          ['assessment_submissions_answers_not_null', 'assessments_answers_not_null'],
          ['assessment_submissions_answer_summary_not_null', 'assessments_answer_summary_not_null'],
          ['assessment_submissions_captured_at_not_null', 'assessments_captured_at_not_null'],
          ['assessment_submissions_updated_at_not_null', 'assessments_updated_at_not_null']
        ];
        index_names text[][] := array[
          ['assessment_submissions_status_idx', 'assessments_status_idx'],
          ['assessment_submissions_plan_idx', 'assessments_plan_idx'],
          ['assessment_submissions_answers_gin_idx', 'assessments_answers_gin_idx']
        ];
        name_pair text[];
      begin
        if not exists (select 1 from pg_type where typname = 'assessment_plan') then
          create type assessment_plan as enum ('precision', 'pro');
        end if;

        if not exists (select 1 from pg_type where typname = 'assessment_status') then
          create type assessment_status as enum (
            'captured',
            'queued',
            'preparing',
            'ready',
            'failed'
          );
        end if;

        if to_regclass('public.assessment_submissions') is not null
          and to_regclass('public.assessments') is null then
          alter table public.assessment_submissions rename to assessments;
        end if;

        if to_regclass('public.assessments') is not null then
          foreach name_pair slice 1 in array constraint_names loop
            if exists (
              select 1 from pg_constraint
              where conrelid = 'public.assessments'::regclass
                and conname = name_pair[1]
            ) and not exists (
              select 1 from pg_constraint
              where conrelid = 'public.assessments'::regclass
                and conname = name_pair[2]
            ) then
              execute format(
                'alter table public.assessments rename constraint %I to %I',
                name_pair[1],
                name_pair[2]
              );
            end if;
          end loop;
        end if;

        foreach name_pair slice 1 in array index_names loop
          if to_regclass('public.' || name_pair[1]) is not null
            and to_regclass('public.' || name_pair[2]) is null then
            execute format(
              'alter index public.%I rename to %I',
              name_pair[1],
              name_pair[2]
            );
          end if;
        end loop;
      end $$;
    `;

    await sql`
      create table if not exists assessments (
        plan_id uuid primary key,
        locale text not null default 'en' check (locale in ('en', 'th')),
        selected_plan assessment_plan null,
        status assessment_status not null default 'captured',
        answers jsonb not null default '{}'::jsonb,
        answer_summary jsonb not null default '{}'::jsonb,
        queue_position integer null,
        captured_at timestamptz not null default now(),
        plan_selected_at timestamptz null,
        processing_started_at timestamptz null,
        completed_at timestamptz null,
        updated_at timestamptz not null default now()
      )
    `;

    await sql`
      create index if not exists assessments_status_idx
        on assessments (status, captured_at desc)
    `;
    await sql`
      create index if not exists assessments_plan_idx
        on assessments (selected_plan, captured_at desc)
    `;
    await sql`
      create index if not exists assessments_answers_gin_idx
        on assessments using gin (answers jsonb_path_ops)
    `;
  })();

  await schemaReady;
}

function fromStoredPlan(plan: unknown): AssessmentPlan {
  if (plan === "pro") {
    return "pro";
  }

  if (plan === "precision") {
    return "precision";
  }

  return "free";
}

function toSnapshotStatus(status: unknown): AssessmentSnapshot["status"] {
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

  await ensureAssessmentSchema();

  await sql`
    insert into assessments (
      plan_id,
      locale,
      selected_plan,
      status,
      answers,
      answer_summary,
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
      queue_position = excluded.queue_position,
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
    const tableCheck = await sql`
      select to_regclass('jobs') as jobs_table
    `;

    if (tableCheck[0]?.jobs_table) {
      const positions = await sql`
        with current_job as (
          select priority, queued_at
          from jobs
          where plan_id = ${planId}::uuid
            and status = 'queued'
          order by queued_at desc
          limit 1
        )
        select count(*)::int as queue_position
        from jobs
        cross join current_job
        where jobs.status = 'queued'
          and (
            jobs.priority > current_job.priority
            or (
              jobs.priority = current_job.priority
              and jobs.queued_at <= current_job.queued_at
            )
          )
      `;

      queuePosition = Number(positions[0]?.queue_position ?? queuePosition);
    }
  }

  return {
    plan: fromStoredPlan(row.selected_plan),
    planId: row.plan_id,
    queuePosition: status === "queued" ? Math.max(1, queuePosition) : 0,
    status,
    steps: buildAssessmentSteps(status)
  } satisfies AssessmentSnapshot;
}

export async function getStoredFormulationResult(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const rows = await sql`
    select
      assessments.answers,
      assessments.locale,
      assessments.selected_plan::text,
      formulations.formulation,
      formulations.generated_at,
      recommendations.recommendations
    from assessments
    join formulations on formulations.plan_id = assessments.plan_id
    left join recommendations on recommendations.plan_id = assessments.plan_id
    where assessments.plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const locale = normalizeLocale(row.locale);
  const plan = fromStoredPlan(row.selected_plan);
  const storedFormulation = asRecord(row.formulation);
  const defaultBlueprint = getMockFormulationBlueprint(locale);
  const supplementBreakdown = asArray<FormulationIngredient>(
    storedFormulation.supplementBreakdown ?? storedFormulation.formula
  );
  const recommendations = asArray<RecommendedProduct>(row.recommendations);
  const generatedAt =
    row.generated_at instanceof Date
      ? row.generated_at.toISOString()
      : new Date(row.generated_at).toISOString();

  return {
    assessmentSummary: buildAssessmentSummary({
      answers: row.answers,
      locale,
      plan
    }),
    generatedAt,
    planId,
    recommendations,
    schemaVersion: 1,
    supplementBreakdown:
      supplementBreakdown.length > 0
        ? supplementBreakdown
        : defaultBlueprint.supplementBreakdown
  } satisfies FormulationResult;
}
