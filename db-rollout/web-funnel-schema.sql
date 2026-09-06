-- Additive web funnel recovery and provenance. Safe to apply before application rollout.
alter table public.assessments add column if not exists input_revision bigint not null default 0;
alter table public.assessments add column if not exists input_hash text;
alter table public.assessment_resume_drafts add column if not exists questionnaire_state jsonb;

create table if not exists public.assessment_inputs (
  plan_id uuid not null references public.assessments(plan_id) on delete cascade,
  revision bigint not null,
  input_hash text not null,
  answers jsonb not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, revision)
);
create table if not exists public.assessment_healthscore_results (
  plan_id uuid not null references public.assessments(plan_id) on delete cascade,
  revision bigint not null,
  locale text not null references public.site_locales(code),
  generator_version text not null,
  result jsonb not null,
  task_id uuid,
  created_at timestamptz not null default now(),
  primary key (plan_id, revision, locale, generator_version)
);
alter table public.formulations add column if not exists assessment_revision bigint;
alter table public.food_guidance add column if not exists assessment_revision bigint;
alter table public.recommendations add column if not exists assessment_revision bigint;
alter table public.product_recommendation_runs add column if not exists assessment_revision bigint;
alter table public.nutrition_reports add column if not exists assessment_revision bigint;
create index if not exists formulations_input_revision_idx on public.formulations(plan_id, assessment_revision, version desc);
create index if not exists food_guidance_input_revision_idx on public.food_guidance(plan_id, assessment_revision, version desc);
create index if not exists recommendations_input_revision_idx on public.recommendations(plan_id, assessment_revision, version desc);
create index if not exists product_runs_input_revision_idx on public.product_recommendation_runs(plan_id, assessment_revision, generated_at desc);

create table if not exists public.funnel_requests (
  scope text not null,
  request_key text not null,
  input_hash text not null,
  resource_id uuid not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (scope, request_key)
);
alter table public.payments add column if not exists fulfillment_status text not null default 'not_started'
  check (fulfillment_status in ('not_started', 'pending', 'complete', 'failed'));
alter table public.payments add column if not exists fulfillment_completed_at timestamptz;
alter table public.payments add column if not exists fulfillment_error text;
create index if not exists payments_fulfillment_pending_idx on public.payments(updated_at)
  where fulfillment_status in ('pending', 'failed');

create table if not exists public.healthscore_delivery_requests (
  id uuid primary key,
  plan_id uuid not null references public.assessments(plan_id) on delete cascade,
  revision bigint not null,
  locale text not null references public.site_locales(code),
  email text not null,
  status text not null default 'waiting' check (status in ('waiting', 'queued', 'sending', 'sent', 'failed', 'unknown', 'superseded')),
  task_id uuid,
  provider_message_id text,
  error_message text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (plan_id, revision, locale, email)
);
create index if not exists healthscore_delivery_waiting_idx on public.healthscore_delivery_requests(plan_id, revision, locale)
  where status in ('waiting', 'queued');

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mn') then
    grant select, insert, update, delete on public.assessment_inputs,
      public.assessment_healthscore_results, public.funnel_requests,
      public.healthscore_delivery_requests to mn;
  end if;
end $$;
