import { getSql } from "@/lib/db";
import { firstNameFromAssessmentAnswers } from "@/lib/assessment-first-name";

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to apply the assessment schema");
}

await sql`
  alter table public.assessments
    add column if not exists first_name text,
    add column if not exists contact_email text,
    add column if not exists contact_email_captured_at timestamptz
`;

await sql`
  create table if not exists public.assessment_resume_drafts (
    id uuid primary key,
    plan_id uuid not null,
    locale text not null references public.site_locales(code),
    answers jsonb not null default '{}'::jsonb,
    section_index integer not null default 0,
    contact_email text not null,
    email_hash text not null,
    token_hash text not null unique,
    payment_id uuid,
    expires_at timestamptz not null,
    last_opened_at timestamptz,
    finalized_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
`;

await sql`
  create index if not exists assessment_resume_drafts_plan_idx
    on public.assessment_resume_drafts(plan_id)
`;

await sql`
  create index if not exists assessment_resume_drafts_email_hash_idx
    on public.assessment_resume_drafts(email_hash)
`;

await sql`
  do $$
  begin
    if exists (select 1 from pg_roles where rolname = 'mn') then
      grant select, insert, update, delete on public.assessment_resume_drafts to mn;
    end if;
  end
  $$;
`;

const rows = await sql<Array<{
  answer_summary: unknown;
  answers: unknown;
  plan_id: string;
}>>`
  select
    plan_id::text,
    answers,
    answer_summary
  from public.assessments
  where first_name is null
`;

let backfilled = 0;

for (const row of rows) {
  const firstName =
    firstNameFromAssessmentAnswers(row.answers) ??
    firstNameFromAssessmentAnswers(row.answer_summary);

  if (!firstName) {
    continue;
  }

  await sql`
    update public.assessments
    set
      first_name = ${firstName},
      answers = jsonb_set(
        coalesce(answers, '{}'::jsonb),
        '{firstName}',
        to_jsonb(${firstName}::text),
        true
      ),
      answer_summary = jsonb_set(
        coalesce(answer_summary, '{}'::jsonb),
        '{firstName}',
        to_jsonb(${firstName}::text),
        true
      ),
      updated_at = now()
    where plan_id = ${row.plan_id}::uuid
  `;
  backfilled += 1;
}

await sql`
  create table if not exists public.assessment_version_counters (
    plan_id uuid primary key,
    current_version integer not null default 0,
    current_formulation_version integer not null default 0,
    current_food_guidance_version integer not null default 0
  )
`;

await sql`
  do $$
  begin
    if exists (select 1 from pg_roles where rolname = 'mn') then
      grant select, insert, update, delete on public.assessment_version_counters to mn;
    end if;
  end
  $$;
`;

const assessmentCounters = await sql`
  insert into public.assessment_version_counters as counters (plan_id, current_version)
  select plan_id, max(version)::int
  from public.assessment_versions
  group by plan_id
  on conflict (plan_id) do update set
    current_version = greatest(counters.current_version, excluded.current_version)
`;

const formulationCounters = await sql`
  insert into public.assessment_version_counters as counters (plan_id, current_formulation_version)
  select plan_id, max(version)::int
  from public.formulations
  group by plan_id
  on conflict (plan_id) do update set
    current_formulation_version = greatest(
      counters.current_formulation_version,
      excluded.current_formulation_version
    )
`;

const foodCounters = await sql`
  insert into public.assessment_version_counters as counters (plan_id, current_food_guidance_version)
  select plan_id, max(version)::int
  from public.food_guidance
  group by plan_id
  on conflict (plan_id) do update set
    current_food_guidance_version = greatest(
      counters.current_food_guidance_version,
      excluded.current_food_guidance_version
    )
`;

let claimIndex = "skipped";

try {
  await sql.unsafe(`
    create index if not exists tasks_claim_queued_idx
      on public.tasks using btree (task_type, scheduled_for, created_at)
      where status = 'queued' and attempts < max_attempts
  `);
  claimIndex = "applied";
} catch (error) {
  claimIndex =
    error instanceof Error ? `not applied (${error.message})` : "not applied";
}

console.log(
  `[assessment-schema] first_name/contact_email columns and resume drafts ready; backfilled ${backfilled} assessment${backfilled === 1 ? "" : "s"}.`
);
console.log(
  `[assessment-schema] version counters ready; assessment=${assessmentCounters.count} formulation=${formulationCounters.count} food=${foodCounters.count}; claim index ${claimIndex}.`
);
