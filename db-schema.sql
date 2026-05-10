-- MattaNutra database schema
-- Re-runnable PostgreSQL schema for UAT/production.
-- Intended for copy/paste into the DigitalOcean database console.
-- Creates or upgrades every app table, index, constraint, and seed content.
-- Seed rows are upserted by stable IDs/slugs; operational customer data is not
-- deleted when this script is reapplied.

do $$
begin
  begin
    execute 'create schema if not exists public';
  exception when others then
    raise notice 'Skipping public schema create: %', sqlerrm;
  end;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'assessment_plan') then
    create type public.assessment_plan as enum ('precision', 'pro');
  end if;

  if not exists (select 1 from pg_type where typname = 'assessment_status') then
    create type public.assessment_status as enum (
      'captured',
      'queued',
      'preparing',
      'ready',
      'failed'
    );
  end if;
end $$;

alter type public.assessment_plan add value if not exists 'precision';
alter type public.assessment_plan add value if not exists 'pro';

alter type public.assessment_status add value if not exists 'captured';
alter type public.assessment_status add value if not exists 'queued';
alter type public.assessment_status add value if not exists 'preparing';
alter type public.assessment_status add value if not exists 'ready';
alter type public.assessment_status add value if not exists 'failed';

-- Compatibility renames for earlier development table names.
do $$
begin
  if to_regclass('public.assessment_submissions') is not null
    and to_regclass('public.assessments') is null then
    alter table public.assessment_submissions rename to assessments;
  end if;

  if to_regclass('public.formulation_jobs') is not null
    and to_regclass('public.jobs') is null then
    alter table public.formulation_jobs rename to jobs;
  end if;

  if to_regclass('public.assessment_formulations') is not null
    and to_regclass('public.formulations') is null then
    alter table public.assessment_formulations rename to formulations;
  end if;

  if to_regclass('public.blog_testimonials') is not null
    and to_regclass('public.testimonials') is null then
    alter table public.blog_testimonials rename to testimonials;
  end if;
end $$;

create table if not exists public.assessments (
  plan_id uuid primary key,
  locale text not null default 'en' check (locale in ('en', 'th')),
  selected_plan public.assessment_plan null,
  status public.assessment_status not null default 'captured',
  answers jsonb not null default '{}'::jsonb,
  answer_summary jsonb not null default '{}'::jsonb,
  health_score jsonb not null default '{}'::jsonb,
  queue_position integer null,
  error_message text null,
  captured_at timestamptz not null default now(),
  plan_selected_at timestamptz null,
  processing_started_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.assessments
  add column if not exists locale text default 'en',
  add column if not exists selected_plan public.assessment_plan null,
  add column if not exists status public.assessment_status default 'captured',
  add column if not exists answers jsonb default '{}'::jsonb,
  add column if not exists answer_summary jsonb default '{}'::jsonb,
  add column if not exists health_score jsonb default '{}'::jsonb,
  add column if not exists queue_position integer null,
  add column if not exists error_message text null,
  add column if not exists captured_at timestamptz default now(),
  add column if not exists plan_selected_at timestamptz null,
  add column if not exists processing_started_at timestamptz null,
  add column if not exists completed_at timestamptz null,
  add column if not exists updated_at timestamptz default now();

update public.assessments
set
  locale = coalesce(locale, 'en'),
  status = coalesce(status, 'captured'),
  answers = coalesce(answers, '{}'::jsonb),
  answer_summary = coalesce(answer_summary, '{}'::jsonb),
  health_score = coalesce(health_score, '{}'::jsonb),
  captured_at = coalesce(captured_at, now()),
  updated_at = coalesce(updated_at, now())
where locale is null
  or status is null
  or answers is null
  or answer_summary is null
  or health_score is null
  or captured_at is null
  or updated_at is null;

alter table public.assessments
  alter column locale set default 'en',
  alter column locale set not null,
  alter column status set default 'captured',
  alter column status set not null,
  alter column answers set default '{}'::jsonb,
  alter column answers set not null,
  alter column answer_summary set default '{}'::jsonb,
  alter column answer_summary set not null,
  alter column health_score set default '{}'::jsonb,
  alter column health_score set not null,
  alter column captured_at set default now(),
  alter column captured_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.assessments'::regclass
      and conname = 'assessments_locale_check'
  ) then
    alter table public.assessments
      add constraint assessments_locale_check check (locale in ('en', 'th'));
  end if;
end $$;

create index if not exists assessments_status_idx
  on public.assessments (status, captured_at desc);

create index if not exists assessments_plan_idx
  on public.assessments (selected_plan, captured_at desc);

create index if not exists assessments_answers_gin_idx
  on public.assessments using gin (answers jsonb_path_ops);

create table if not exists public.ai_response_cache (
  cache_key text primary key,
  cache_type text not null,
  model text not null,
  prompt_version text not null,
  response jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_response_cache
  add column if not exists cache_type text,
  add column if not exists model text,
  add column if not exists prompt_version text,
  add column if not exists response jsonb default '{}'::jsonb,
  add column if not exists expires_at timestamptz default now(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.ai_response_cache
set
  cache_type = coalesce(cache_type, 'unknown'),
  model = coalesce(model, 'unknown'),
  prompt_version = coalesce(prompt_version, 'v1'),
  response = coalesce(response, '{}'::jsonb),
  expires_at = coalesce(expires_at, now()),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where cache_type is null
  or model is null
  or prompt_version is null
  or response is null
  or expires_at is null
  or created_at is null
  or updated_at is null;

alter table public.ai_response_cache
  alter column cache_type set not null,
  alter column model set not null,
  alter column prompt_version set not null,
  alter column response set default '{}'::jsonb,
  alter column response set not null,
  alter column expires_at set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists ai_response_cache_type_expiry_idx
  on public.ai_response_cache (cache_type, expires_at desc);

create table if not exists public.jobs (
  id uuid primary key,
  job_type text not null,
  plan_id uuid null references public.assessments(plan_id) on delete cascade,
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
);

alter table public.jobs
  add column if not exists job_type text,
  add column if not exists plan_id uuid null references public.assessments(plan_id) on delete cascade,
  add column if not exists status text default 'queued',
  add column if not exists priority integer default 0,
  add column if not exists attempts integer default 0,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists error_message text null,
  add column if not exists queued_at timestamptz default now(),
  add column if not exists started_at timestamptz null,
  add column if not exists completed_at timestamptz null,
  add column if not exists failed_at timestamptz null,
  add column if not exists updated_at timestamptz default now();

update public.jobs
set
  job_type = coalesce(job_type, 'formulation'),
  status = case
    when status in ('queued', 'running', 'complete', 'failed') then status
    else 'queued'
  end,
  priority = coalesce(priority, 0),
  attempts = coalesce(attempts, 0),
  payload = coalesce(payload, '{}'::jsonb),
  queued_at = coalesce(queued_at, now()),
  updated_at = coalesce(updated_at, now())
where job_type is null
  or status is null
  or status not in ('queued', 'running', 'complete', 'failed')
  or priority is null
  or attempts is null
  or payload is null
  or queued_at is null
  or updated_at is null;

alter table public.jobs
  alter column job_type set not null,
  alter column status set default 'queued',
  alter column status set not null,
  alter column priority set default 0,
  alter column priority set not null,
  alter column attempts set default 0,
  alter column attempts set not null,
  alter column payload set default '{}'::jsonb,
  alter column payload set not null,
  alter column queued_at set default now(),
  alter column queued_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.jobs'::regclass
      and conname = 'jobs_status_check'
  ) then
    alter table public.jobs
      add constraint jobs_status_check
      check (status in ('queued', 'running', 'complete', 'failed'));
  end if;
end $$;

create index if not exists jobs_queue_idx
  on public.jobs (status, priority desc, queued_at asc);

create index if not exists jobs_plan_type_idx
  on public.jobs (plan_id, job_type, status);

create table if not exists public.formulations (
  plan_id uuid not null references public.assessments(plan_id) on delete cascade,
  version integer not null default 1,
  formulation jsonb not null,
  model_version text null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, version)
);

alter table public.formulations
  add column if not exists version integer default 1,
  add column if not exists formulation jsonb default '{}'::jsonb,
  add column if not exists model_version text null,
  add column if not exists generated_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.formulations
set
  version = coalesce(version, 1),
  formulation = coalesce(formulation, '{}'::jsonb),
  generated_at = coalesce(generated_at, now()),
  updated_at = coalesce(updated_at, now())
where version is null
  or formulation is null
  or generated_at is null
  or updated_at is null;

alter table public.formulations
  alter column version set default 1,
  alter column version set not null,
  alter column formulation set not null,
  alter column generated_at set default now(),
  alter column generated_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create table if not exists public.recommendations (
  plan_id uuid not null references public.assessments(plan_id) on delete cascade,
  version integer not null default 1,
  recommendations jsonb not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, version)
);

alter table public.recommendations
  add column if not exists version integer default 1,
  add column if not exists recommendations jsonb default '[]'::jsonb,
  add column if not exists generated_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.recommendations
set
  version = coalesce(version, 1),
  recommendations = coalesce(recommendations, '[]'::jsonb),
  generated_at = coalesce(generated_at, now()),
  updated_at = coalesce(updated_at, now())
where version is null
  or recommendations is null
  or generated_at is null
  or updated_at is null;

alter table public.recommendations
  alter column version set default 1,
  alter column version set not null,
  alter column recommendations set not null,
  alter column generated_at set default now(),
  alter column generated_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create table if not exists public.job_audit_events (
  id uuid primary key,
  job_id uuid null references public.jobs(id) on delete set null,
  plan_id uuid null references public.assessments(plan_id) on delete cascade,
  event_type text not null,
  level text not null default 'low' check (
    level in ('low', 'medium', 'high', 'critical')
  ),
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.job_audit_events
  add column if not exists job_id uuid null references public.jobs(id) on delete set null,
  add column if not exists plan_id uuid null references public.assessments(plan_id) on delete cascade,
  add column if not exists event_type text default 'unknown',
  add column if not exists level text default 'low',
  add column if not exists event_payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

update public.job_audit_events
set
  event_type = coalesce(event_type, 'unknown'),
  level = case
    when level in ('low', 'medium', 'high', 'critical') then level
    else 'low'
  end,
  event_payload = coalesce(event_payload, '{}'::jsonb),
  created_at = coalesce(created_at, now())
where event_type is null
  or level is null
  or level not in ('low', 'medium', 'high', 'critical')
  or event_payload is null
  or created_at is null;

alter table public.job_audit_events
  alter column event_type set not null,
  alter column level set default 'low',
  alter column level set not null,
  alter column event_payload set default '{}'::jsonb,
  alter column event_payload set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.job_audit_events'::regclass
      and conname = 'job_audit_events_level_check'
  ) then
    alter table public.job_audit_events
      add constraint job_audit_events_level_check
      check (level in ('low', 'medium', 'high', 'critical'));
  end if;
end $$;

-- Earlier versions used plan_id as the sole primary key, which allowed only one
-- formulation/recommendation per assessment. The current model keeps the
-- assessment as the master record and stores versioned child rows.
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
      execute format(
        'alter table public.formulations drop constraint %I',
        current_pkey
      );
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
      execute format(
        'alter table public.recommendations drop constraint %I',
        current_pkey
      );
    end if;

    alter table public.recommendations
      add constraint recommendations_pkey primary key (plan_id, version);
  end if;
end $$;

create index if not exists formulations_latest_idx
  on public.formulations (plan_id, version desc, generated_at desc);

create index if not exists recommendations_latest_idx
  on public.recommendations (plan_id, version desc, generated_at desc);

create index if not exists job_audit_events_plan_idx
  on public.job_audit_events (plan_id, created_at desc);

create index if not exists job_audit_events_job_idx
  on public.job_audit_events (job_id, created_at desc);

create index if not exists job_audit_events_level_idx
  on public.job_audit_events (level, created_at desc);

create table if not exists public.assessment_example_requests (
  id uuid primary key,
  plan_id uuid not null references public.assessments(plan_id) on delete cascade,
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
);

alter table public.assessment_example_requests
  add column if not exists plan_id uuid references public.assessments(plan_id) on delete cascade,
  add column if not exists email text,
  add column if not exists locale text default 'en',
  add column if not exists status text default 'requested',
  add column if not exists health_score jsonb default '{}'::jsonb,
  add column if not exists email_html text null,
  add column if not exists error_message text null,
  add column if not exists requested_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.assessment_example_requests
set
  locale = coalesce(locale, 'en'),
  status = case
    when status in (
      'requested',
      'formulation_queued',
      'formulation_ready',
      'email_queued',
      'email_rendered',
      'email_sent',
      'failed'
    ) then status
    else 'requested'
  end,
  health_score = coalesce(health_score, '{}'::jsonb),
  requested_at = coalesce(requested_at, now()),
  updated_at = coalesce(updated_at, now())
where locale is null
  or status is null
  or status not in (
    'requested',
    'formulation_queued',
    'formulation_ready',
    'email_queued',
    'email_rendered',
    'email_sent',
    'failed'
  )
  or health_score is null
  or requested_at is null
  or updated_at is null;

alter table public.assessment_example_requests
  alter column plan_id set not null,
  alter column email set not null,
  alter column locale set default 'en',
  alter column locale set not null,
  alter column status set default 'requested',
  alter column status set not null,
  alter column health_score set default '{}'::jsonb,
  alter column health_score set not null,
  alter column requested_at set default now(),
  alter column requested_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.assessment_example_requests'::regclass
      and conname = 'assessment_example_requests_locale_check'
  ) then
    alter table public.assessment_example_requests
      add constraint assessment_example_requests_locale_check
      check (locale in ('en', 'th'));
  end if;

  alter table public.assessment_example_requests
    drop constraint if exists assessment_example_requests_status_check;

  alter table public.assessment_example_requests
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

create index if not exists assessment_example_requests_plan_idx
  on public.assessment_example_requests (plan_id, requested_at desc);

create index if not exists assessment_example_requests_status_idx
  on public.assessment_example_requests (status, requested_at asc);

create table if not exists public.cron (
  id uuid primary key,
  plan_id uuid null references public.assessments(plan_id) on delete cascade,
  action_type text not null,
  recipient jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (
    status in ('scheduled', 'queued', 'complete', 'cancelled', 'failed')
  ),
  job_id uuid null references public.jobs(id) on delete set null,
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
);

alter table public.cron
  add column if not exists plan_id uuid null references public.assessments(plan_id) on delete cascade,
  add column if not exists action_type text,
  add column if not exists recipient jsonb default '{}'::jsonb,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists scheduled_for timestamptz,
  add column if not exists status text default 'scheduled',
  add column if not exists job_id uuid null references public.jobs(id) on delete set null,
  add column if not exists attempts integer default 0,
  add column if not exists recurrence_days integer null,
  add column if not exists unsubscribe_token text null,
  add column if not exists unsubscribed_at timestamptz null,
  add column if not exists result_payload jsonb default '{}'::jsonb,
  add column if not exists error_message text null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists queued_at timestamptz null,
  add column if not exists completed_at timestamptz null,
  add column if not exists updated_at timestamptz default now();

alter table public.cron
  drop column if exists email_html;

update public.cron
set action_type = 'reassessment'
where action_type = 'reassessment_email';

update public.jobs
set job_type = 'reassessment'
where job_type = 'reassessment_email';

update public.cron
set recurrence_days = 60
where action_type = 'reassessment'
  and recurrence_days is null;

update public.cron
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
  or updated_at is null;

alter table public.cron
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
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cron'::regclass
      and conname = 'cron_status_check'
  ) then
    alter table public.cron
      add constraint cron_status_check
      check (status in ('scheduled', 'queued', 'complete', 'cancelled', 'failed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cron'::regclass
      and conname = 'cron_recurrence_days_check'
  ) then
    alter table public.cron
      add constraint cron_recurrence_days_check
      check (recurrence_days is null or recurrence_days > 0);
  end if;
end $$;

create index if not exists cron_due_idx
  on public.cron (status, scheduled_for asc);

create index if not exists cron_plan_action_idx
  on public.cron (plan_id, action_type, status);

create unique index if not exists cron_unsubscribe_token_idx
  on public.cron (unsubscribe_token)
  where unsubscribe_token is not null;

create table if not exists public.bpm (
  id uuid primary key,
  ray uuid not null,
  plan_id uuid null references public.assessments(plan_id) on delete set null,
  job_id uuid null references public.jobs(id) on delete set null,
  cron_id uuid null references public.cron(id) on delete set null,
  example_request_id uuid null references public.assessment_example_requests(id) on delete set null,
  event_name text not null,
  event_type text not null default 'funnel',
  event_status text not null default 'observed',
  severity text not null default 'low',
  actor_type text not null default 'visitor',
  emitted_by text null,
  locale text null,
  selected_plan public.assessment_plan null,
  email_hash text null,
  ip_hash text null,
  user_agent text null,
  device_type text null,
  browser text null,
  os text null,
  country_code text null,
  path text null,
  route text null,
  referrer text null,
  landing_page text null,
  traffic_source text null,
  source_channel text null,
  source_detail text null,
  source_url text null,
  utm_source text null,
  utm_medium text null,
  utm_campaign text null,
  utm_content text null,
  utm_term text null,
  campaign_id text null,
  campaign_name text null,
  promo_code text null,
  affiliate_id text null,
  affiliate_ref text null,
  affiliate_sub_id text null,
  affiliate_click_id text null,
  ad_id text null,
  click_id text null,
  health_score integer null,
  score_band text null,
  lowest_domain text null,
  value_amount numeric(14, 2) null,
  value_currency text null,
  error_code text null,
  error_message text null,
  safety_flags jsonb not null default '[]'::jsonb,
  duration_ms integer null,
  http_status integer null,
  properties jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.bpm
  add column if not exists ray uuid,
  add column if not exists plan_id uuid null references public.assessments(plan_id) on delete set null,
  add column if not exists job_id uuid null references public.jobs(id) on delete set null,
  add column if not exists cron_id uuid null references public.cron(id) on delete set null,
  add column if not exists example_request_id uuid null references public.assessment_example_requests(id) on delete set null,
  add column if not exists event_name text,
  add column if not exists event_type text default 'funnel',
  add column if not exists event_status text default 'observed',
  add column if not exists severity text default 'low',
  add column if not exists actor_type text default 'visitor',
  add column if not exists emitted_by text null,
  add column if not exists locale text null,
  add column if not exists selected_plan public.assessment_plan null,
  add column if not exists email_hash text null,
  add column if not exists ip_hash text null,
  add column if not exists user_agent text null,
  add column if not exists device_type text null,
  add column if not exists browser text null,
  add column if not exists os text null,
  add column if not exists country_code text null,
  add column if not exists path text null,
  add column if not exists route text null,
  add column if not exists referrer text null,
  add column if not exists landing_page text null,
  add column if not exists traffic_source text null,
  add column if not exists source_channel text null,
  add column if not exists source_detail text null,
  add column if not exists source_url text null,
  add column if not exists utm_source text null,
  add column if not exists utm_medium text null,
  add column if not exists utm_campaign text null,
  add column if not exists utm_content text null,
  add column if not exists utm_term text null,
  add column if not exists campaign_id text null,
  add column if not exists campaign_name text null,
  add column if not exists promo_code text null,
  add column if not exists affiliate_id text null,
  add column if not exists affiliate_ref text null,
  add column if not exists affiliate_sub_id text null,
  add column if not exists affiliate_click_id text null,
  add column if not exists ad_id text null,
  add column if not exists click_id text null,
  add column if not exists health_score integer null,
  add column if not exists score_band text null,
  add column if not exists lowest_domain text null,
  add column if not exists value_amount numeric(14, 2) null,
  add column if not exists value_currency text null,
  add column if not exists error_code text null,
  add column if not exists error_message text null,
  add column if not exists safety_flags jsonb default '[]'::jsonb,
  add column if not exists duration_ms integer null,
  add column if not exists http_status integer null,
  add column if not exists properties jsonb default '{}'::jsonb,
  add column if not exists metrics jsonb default '{}'::jsonb,
  add column if not exists occurred_at timestamptz default now(),
  add column if not exists created_at timestamptz default now();

update public.bpm
set
  ray = coalesce(ray, id),
  event_name = coalesce(event_name, 'unknown'),
  event_type = case
    when event_type in (
      'traffic',
      'content',
      'funnel',
      'plan',
      'payment',
      'email',
      'chat',
      'formulation',
      'reassessment',
      'affiliate',
      'safety',
      'error',
      'system'
    ) then event_type
    else 'funnel'
  end,
  event_status = coalesce(event_status, 'observed'),
  severity = case
    when severity in ('low', 'medium', 'high', 'critical') then severity
    else 'low'
  end,
  actor_type = case
    when actor_type in ('visitor', 'system', 'worker', 'admin', 'openclaw') then actor_type
    else 'visitor'
  end,
  locale = case
    when locale in ('en', 'th') then locale
    else null
  end,
  health_score = case
    when health_score between 0 and 100 then health_score
    else null
  end,
  safety_flags = case
    when jsonb_typeof(coalesce(safety_flags, '[]'::jsonb)) = 'array'
      then coalesce(safety_flags, '[]'::jsonb)
    else '[]'::jsonb
  end,
  properties = coalesce(properties, '{}'::jsonb),
  metrics = coalesce(metrics, '{}'::jsonb),
  occurred_at = coalesce(occurred_at, now()),
  created_at = coalesce(created_at, now())
where ray is null
  or event_name is null
  or event_type is null
  or event_type not in (
    'traffic',
    'content',
    'funnel',
    'plan',
    'payment',
    'email',
    'chat',
    'formulation',
    'reassessment',
    'affiliate',
    'safety',
    'error',
    'system'
  )
  or event_status is null
  or severity is null
  or severity not in ('low', 'medium', 'high', 'critical')
  or actor_type is null
  or actor_type not in ('visitor', 'system', 'worker', 'admin', 'openclaw')
  or (locale is not null and locale not in ('en', 'th'))
  or (health_score is not null and (health_score < 0 or health_score > 100))
  or safety_flags is null
  or jsonb_typeof(safety_flags) <> 'array'
  or properties is null
  or metrics is null
  or occurred_at is null
  or created_at is null;

alter table public.bpm
  alter column ray set not null,
  alter column event_name set not null,
  alter column event_type set default 'funnel',
  alter column event_type set not null,
  alter column event_status set default 'observed',
  alter column event_status set not null,
  alter column severity set default 'low',
  alter column severity set not null,
  alter column actor_type set default 'visitor',
  alter column actor_type set not null,
  alter column safety_flags set default '[]'::jsonb,
  alter column safety_flags set not null,
  alter column properties set default '{}'::jsonb,
  alter column properties set not null,
  alter column metrics set default '{}'::jsonb,
  alter column metrics set not null,
  alter column occurred_at set default now(),
  alter column occurred_at set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bpm'::regclass
      and conname = 'bpm_locale_check'
  ) then
    alter table public.bpm
      add constraint bpm_locale_check
      check (locale is null or locale in ('en', 'th'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bpm'::regclass
      and conname = 'bpm_event_type_check'
  ) then
    alter table public.bpm
      add constraint bpm_event_type_check
      check (
        event_type in (
          'traffic',
          'content',
          'funnel',
          'plan',
          'payment',
          'email',
          'chat',
          'formulation',
          'reassessment',
          'affiliate',
          'safety',
          'error',
          'system'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bpm'::regclass
      and conname = 'bpm_severity_check'
  ) then
    alter table public.bpm
      add constraint bpm_severity_check
      check (severity in ('low', 'medium', 'high', 'critical'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bpm'::regclass
      and conname = 'bpm_actor_type_check'
  ) then
    alter table public.bpm
      add constraint bpm_actor_type_check
      check (actor_type in ('visitor', 'system', 'worker', 'admin', 'openclaw'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bpm'::regclass
      and conname = 'bpm_health_score_check'
  ) then
    alter table public.bpm
      add constraint bpm_health_score_check
      check (health_score is null or (health_score >= 0 and health_score <= 100));
  end if;
end $$;

comment on table public.bpm is
  'Business process monitoring events for funnel, campaign, affiliate, sales, safety, and operational dashboards.';
comment on column public.bpm.ray is
  'Anonymous journey/session UUID tying one visitor interaction ray through multiple funnel stages.';
comment on column public.bpm.email_hash is
  'Hash of email where available. Never store raw email here.';
comment on column public.bpm.properties is
  'Flexible event-specific payload for dashboard slices that do not justify first-class columns yet.';
comment on column public.bpm.metrics is
  'Flexible numeric metrics such as counts, timings, scores, or model usage details.';

create index if not exists bpm_occurred_idx
  on public.bpm (occurred_at desc);

create index if not exists bpm_event_time_idx
  on public.bpm (event_type, event_name, occurred_at desc);

create index if not exists bpm_ray_idx
  on public.bpm (ray, occurred_at desc);

create index if not exists bpm_plan_idx
  on public.bpm (plan_id, occurred_at desc)
  where plan_id is not null;

create index if not exists bpm_email_hash_idx
  on public.bpm (email_hash, occurred_at desc)
  where email_hash is not null;

create index if not exists bpm_locale_idx
  on public.bpm (locale, occurred_at desc)
  where locale is not null;

create index if not exists bpm_device_idx
  on public.bpm (lower(coalesce(device_type, '')), occurred_at desc)
  where device_type is not null;

create index if not exists bpm_selected_plan_idx
  on public.bpm (selected_plan, occurred_at desc)
  where selected_plan is not null;

create index if not exists bpm_source_idx
  on public.bpm (traffic_source, source_channel, occurred_at desc)
  where traffic_source is not null or source_channel is not null;

create index if not exists bpm_utm_source_filter_idx
  on public.bpm (lower(coalesce(utm_source, '')), occurred_at desc)
  where utm_source is not null;

create index if not exists bpm_traffic_source_filter_idx
  on public.bpm (lower(coalesce(traffic_source, '')), occurred_at desc)
  where traffic_source is not null;

create index if not exists bpm_source_channel_filter_idx
  on public.bpm (lower(coalesce(source_channel, '')), occurred_at desc)
  where source_channel is not null;

create index if not exists bpm_utm_medium_filter_idx
  on public.bpm (lower(utm_medium), occurred_at desc)
  where utm_medium is not null;

create index if not exists bpm_campaign_idx
  on public.bpm (utm_campaign, campaign_id, occurred_at desc)
  where utm_campaign is not null or campaign_id is not null;

create index if not exists bpm_utm_campaign_filter_idx
  on public.bpm (lower(coalesce(utm_campaign, '')), occurred_at desc)
  where utm_campaign is not null;

create index if not exists bpm_campaign_name_filter_idx
  on public.bpm (lower(coalesce(campaign_name, '')), occurred_at desc)
  where campaign_name is not null;

create index if not exists bpm_campaign_id_filter_idx
  on public.bpm (lower(campaign_id), occurred_at desc)
  where campaign_id is not null;

create index if not exists bpm_affiliate_idx
  on public.bpm (affiliate_id, affiliate_ref, occurred_at desc)
  where affiliate_id is not null or affiliate_ref is not null;

create index if not exists bpm_affiliate_id_filter_idx
  on public.bpm (lower(coalesce(affiliate_id, '')), occurred_at desc)
  where affiliate_id is not null;

create index if not exists bpm_affiliate_ref_filter_idx
  on public.bpm (lower(coalesce(affiliate_ref, '')), occurred_at desc)
  where affiliate_ref is not null;

create index if not exists bpm_affiliate_sub_id_filter_idx
  on public.bpm (lower(coalesce(affiliate_sub_id, '')), occurred_at desc)
  where affiliate_sub_id is not null;

create index if not exists bpm_promo_idx
  on public.bpm (promo_code, occurred_at desc)
  where promo_code is not null;

create index if not exists bpm_promo_code_filter_idx
  on public.bpm (lower(promo_code), occurred_at desc)
  where promo_code is not null;

create index if not exists bpm_alerts_idx
  on public.bpm (severity, event_type, occurred_at desc)
  where severity in ('medium', 'high', 'critical')
    or event_type in ('safety', 'error');

create index if not exists bpm_properties_gin_idx
  on public.bpm using gin (properties jsonb_path_ops);

create index if not exists bpm_metrics_gin_idx
  on public.bpm using gin (metrics jsonb_path_ops);


-- Supplement whitelist/blacklist governance.
create table if not exists public.supplements (
  id uuid primary key,
  source_row_id integer null,
  name text not null,
  normalized_name text not null unique,
  category text not null,
  source_status text not null default 'core',
  ingredient_type text null,
  primary_use_case text null,
  notes text null,
  list_status text not null default 'review_required',
  is_active boolean not null default true,
  source text null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supplements
  add column if not exists source_row_id integer null,
  add column if not exists name text,
  add column if not exists normalized_name text,
  add column if not exists category text,
  add column if not exists source_status text default 'core',
  add column if not exists ingredient_type text null,
  add column if not exists primary_use_case text null,
  add column if not exists notes text null,
  add column if not exists list_status text default 'review_required',
  add column if not exists is_active boolean default true,
  add column if not exists source text null,
  add column if not exists source_payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  alter table public.supplements
    drop constraint if exists supplements_source_status_check;
  alter table public.supplements
    drop constraint if exists supplements_list_status_check;
end $$;

update public.supplements
set
  name = coalesce(name, normalized_name, id::text),
  normalized_name = coalesce(normalized_name, lower(regexp_replace(coalesce(name, id::text), '[^a-zA-Z0-9]+', '_', 'g'))),
  category = coalesce(category, 'Uncategorised'),
  source_status = case
    when source_status in ('core', 'recommended_add') then source_status
    else 'core'
  end,
  list_status = case
    when coalesce(is_active, true) = false then 'inactive'
    when list_status in ('whitelisted', 'review_required', 'blacklisted', 'inactive') then list_status
    else 'review_required'
  end,
  is_active = case
    when coalesce(is_active, true) = false or list_status = 'inactive' then false
    else true
  end,
  source_payload = coalesce(source_payload, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where name is null
  or normalized_name is null
  or category is null
  or source_status is null
  or source_status not in ('core', 'recommended_add')
  or list_status is null
  or list_status not in ('whitelisted', 'review_required', 'blacklisted', 'inactive')
  or is_active is null
  or source_payload is null
  or created_at is null
  or updated_at is null;

update public.supplements
set
  list_status = 'inactive',
  is_active = false,
  updated_at = now()
where coalesce(is_active, true) = false
  and list_status <> 'inactive';

update public.supplements
set
  is_active = false,
  updated_at = now()
where list_status = 'inactive'
  and coalesce(is_active, true) = true;

alter table public.supplements
  alter column name set not null,
  alter column normalized_name set not null,
  alter column category set not null,
  alter column source_status set default 'core',
  alter column source_status set not null,
  alter column list_status set default 'review_required',
  alter column list_status set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column source_payload set default '{}'::jsonb,
  alter column source_payload set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  alter table public.supplements
    add constraint supplements_source_status_check
    check (source_status in ('core', 'recommended_add'));

  alter table public.supplements
    add constraint supplements_list_status_check
    check (list_status in ('whitelisted', 'review_required', 'blacklisted', 'inactive'));

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.supplements'::regclass
      and conname = 'supplements_normalized_name_key'
  ) then
    alter table public.supplements
      add constraint supplements_normalized_name_key unique (normalized_name);
  end if;
end $$;

create table if not exists public.supplement_safety_limits (
  id uuid primary key,
  supplement_id uuid not null references public.supplements(id) on delete cascade,
  version integer not null default 1,
  max_amount numeric(14, 4) null,
  max_unit text not null,
  basis_rationale text null,
  confidence text not null default 'low',
  safety_flag text null,
  safety_flags text[] not null default '{}'::text[],
  safety_notes text null,
  source_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplement_id, version)
);

alter table public.supplement_safety_limits
  add column if not exists supplement_id uuid references public.supplements(id) on delete cascade,
  add column if not exists version integer default 1,
  add column if not exists max_amount numeric(14, 4) null,
  add column if not exists max_unit text,
  add column if not exists basis_rationale text null,
  add column if not exists confidence text default 'low',
  add column if not exists safety_flag text null,
  add column if not exists safety_flags text[] default '{}'::text[],
  add column if not exists safety_notes text null,
  add column if not exists source_url text null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  alter table public.supplement_safety_limits
    drop constraint if exists supplement_safety_limits_confidence_check;
  alter table public.supplement_safety_limits
    drop constraint if exists supplement_safety_limits_version_check;
  alter table public.supplement_safety_limits
    drop constraint if exists supplement_safety_limits_safety_flags_check;
end $$;

create or replace function public.mattanutra_supplement_safety_flags(
  raw_flag text
) returns text[]
language sql
immutable
as $$
  with normalized as (
    select lower(coalesce(raw_flag, '')) as flag
  ), matched as (
    select unnest(array_remove(array[
      case when flag like '%exclude%' then 'exclude_automated_use' end,
      case when flag like '%regulatory%' or flag like '%prescription%' then 'regulatory_risk' end,
      case when flag like '%pregnan%' then 'pregnancy_caution' end,
      case when flag like '%warfarin%' or flag like '%med%' or flag like '%acei%' or flag like '%arb%' or flag like '%ssri%' or flag like '%serotonin%' or flag like '%anticoagulant%' then 'medication_interaction' end,
      case when flag like '%bleed%' or flag like '%antiplatelet%' then 'bleeding_risk' end,
      case when flag like '%liver%' then 'liver_caution' end,
      case when flag like '%kidney%' or flag like '%renal%' then 'kidney_caution' end,
      case when flag like '%stimulant%' or flag like '%caffeine%' then 'stimulant' end,
      case when flag like '%hormon%' or flag like '%thyroid%' or flag like '%estrogen%' or flag like '%dht%' or flag like '%testosterone%' then 'hormone_caution' end,
      case when flag like '%allerg%' or flag like '%shellfish%' or flag like '%fish%' or flag like '%dairy%' then 'allergy_caution' end,
      case when flag like '%contamination%' or flag like '%heavy metal%' or flag like '%purified%' or flag like '%coa%' then 'contamination_risk' end,
      case when flag like '%condition%' or flag like '%disease%' or flag like '%hypertension%' or flag like '%g6pd%' or flag like '%autoimmune%' or flag like '%seizure%' or flag like '%surgery%' or flag like '%glucose%' or flag like '%diabetes%' or flag like '%hypercalcemia%' or flag like '%neuropathy%' or flag like '%stone%' then 'condition_caution' end,
      case when flag like '%upper%' or flag like '%ul%' or flag like '%dose%' then 'upper_dose_risk' end
    ]::text[], null)) as flag
    from normalized
  )
  select case
    when exists (select 1 from matched) then (
      select array_agg(distinct flag order by flag)
      from matched
    )
    when trim(coalesce(raw_flag, '')) <> '' then array['general_caution']::text[]
    else '{}'::text[]
  end;
$$;

drop function if exists public.mattanutra_supplement_safety_flags(text, boolean, boolean);
drop function if exists public.mattanutra_supplement_safety_flags(text, text, boolean);
drop function if exists public.mattanutra_supplement_safety_flags(text, boolean);

update public.supplement_safety_limits
set
  version = coalesce(version, 1),
  max_unit = coalesce(max_unit, ''),
  confidence = case
    when confidence in ('high', 'moderate', 'low') then confidence
    else 'low'
  end,
  safety_flags = case
    when safety_flags <@ array[
      'allergy_caution',
      'bleeding_risk',
      'condition_caution',
      'contamination_risk',
      'exclude_automated_use',
      'general_caution',
      'hormone_caution',
      'kidney_caution',
      'liver_caution',
      'medication_interaction',
      'pregnancy_caution',
      'regulatory_risk',
      'stimulant',
      'upper_dose_risk'
    ]::text[]
      then coalesce(safety_flags, '{}'::text[])
    else public.mattanutra_supplement_safety_flags(
      safety_flag
    )
  end,
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where version is null
  or max_unit is null
  or confidence is null
  or confidence not in ('high', 'moderate', 'low')
  or safety_flags is null
  or not (
    safety_flags <@ array[
      'allergy_caution',
      'bleeding_risk',
      'condition_caution',
      'contamination_risk',
      'exclude_automated_use',
      'general_caution',
      'hormone_caution',
      'kidney_caution',
      'liver_caution',
      'medication_interaction',
      'pregnancy_caution',
      'regulatory_risk',
      'stimulant',
      'upper_dose_risk'
    ]::text[]
  )
  or created_at is null
  or updated_at is null;

alter table public.supplement_safety_limits
  alter column supplement_id set not null,
  alter column version set default 1,
  alter column version set not null,
  alter column max_unit set not null,
  alter column confidence set default 'low',
  alter column confidence set not null,
  alter column safety_flags set default '{}'::text[],
  alter column safety_flags set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  alter table public.supplement_safety_limits
    add constraint supplement_safety_limits_confidence_check
    check (confidence in ('high', 'moderate', 'low'));

  alter table public.supplement_safety_limits
    add constraint supplement_safety_limits_version_check
    check (version > 0);

  alter table public.supplement_safety_limits
    add constraint supplement_safety_limits_safety_flags_check
    check (
      safety_flags <@ array[
        'allergy_caution',
        'bleeding_risk',
        'condition_caution',
        'contamination_risk',
        'exclude_automated_use',
        'general_caution',
        'hormone_caution',
        'kidney_caution',
        'liver_caution',
        'medication_interaction',
        'pregnancy_caution',
        'regulatory_risk',
        'stimulant',
        'upper_dose_risk'
      ]::text[]
    );

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.supplement_safety_limits'::regclass
      and conname = 'supplement_safety_limits_supplement_id_version_key'
  ) then
    alter table public.supplement_safety_limits
      add constraint supplement_safety_limits_supplement_id_version_key unique (supplement_id, version);
  end if;
end $$;

alter table public.supplement_safety_limits
  drop column if exists requires_human_review;

alter table public.supplement_safety_limits
  drop column if exists blocks_automated_use;

create table if not exists public.supplement_aliases (
  id uuid primary key,
  supplement_id uuid not null references public.supplements(id) on delete cascade,
  alias text not null,
  normalized_alias text not null unique,
  created_at timestamptz not null default now()
);

alter table public.supplement_aliases
  add column if not exists supplement_id uuid references public.supplements(id) on delete cascade,
  add column if not exists alias text,
  add column if not exists normalized_alias text,
  add column if not exists created_at timestamptz default now();

update public.supplement_aliases
set
  alias = coalesce(alias, normalized_alias, id::text),
  normalized_alias = coalesce(normalized_alias, lower(regexp_replace(coalesce(alias, id::text), '[^a-zA-Z0-9]+', '_', 'g'))),
  created_at = coalesce(created_at, now())
where alias is null
  or normalized_alias is null
  or created_at is null;

alter table public.supplement_aliases
  alter column supplement_id set not null,
  alter column alias set not null,
  alter column normalized_alias set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.supplement_aliases'::regclass
      and conname = 'supplement_aliases_normalized_alias_key'
  ) then
    alter table public.supplement_aliases
      add constraint supplement_aliases_normalized_alias_key unique (normalized_alias);
  end if;
end $$;

create table if not exists public.supplement_admin_audit (
  id uuid primary key,
  supplement_id uuid null references public.supplements(id) on delete set null,
  action text not null,
  actor text null,
  before_payload jsonb not null default '{}'::jsonb,
  after_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.supplement_admin_audit
  add column if not exists supplement_id uuid null references public.supplements(id) on delete set null,
  add column if not exists action text,
  add column if not exists actor text null,
  add column if not exists before_payload jsonb default '{}'::jsonb,
  add column if not exists after_payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

update public.supplement_admin_audit
set
  action = coalesce(action, 'updated'),
  before_payload = coalesce(before_payload, '{}'::jsonb),
  after_payload = coalesce(after_payload, '{}'::jsonb),
  created_at = coalesce(created_at, now())
where action is null
  or before_payload is null
  or after_payload is null
  or created_at is null;

alter table public.supplement_admin_audit
  alter column action set not null,
  alter column before_payload set default '{}'::jsonb,
  alter column before_payload set not null,
  alter column after_payload set default '{}'::jsonb,
  alter column after_payload set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists supplements_category_idx
  on public.supplements (category, list_status, name);

create index if not exists supplements_list_status_idx
  on public.supplements (list_status, is_active, name);

create index if not exists supplements_name_search_idx
  on public.supplements (normalized_name);

create index if not exists supplement_safety_limits_supplement_idx
  on public.supplement_safety_limits (supplement_id, version desc);

create index if not exists supplement_aliases_supplement_idx
  on public.supplement_aliases (supplement_id, alias);

create index if not exists supplement_admin_audit_supplement_idx
  on public.supplement_admin_audit (supplement_id, created_at desc);

with seed as (
  select *
  from jsonb_to_recordset($mattanutra_supplement_seed$[{"id":"df05c30c-144e-5d03-92dc-c895f7cb00c4","source_row_id":1,"name":"Vitamin A","normalized_name":"vitamin_a","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Baseline micronutrient","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"96789c48-47b0-531e-b792-18e1f60e50f2","max_amount":3000,"max_unit":"mcg RAE/day","basis_rationale":"Official adult UL; preformed retinol. Count beta-carotene separately.","confidence":"high","safety_flag":"Pregnancy/liver disease caution","safety_notes":"Do not exceed 3,000 mcg RAE preformed vitamin A unless clinician-directed.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"597ef3b1-2393-51d9-8168-5f543fff94c6","alias":"Vitamin A","normalized_alias":"vitamin_a"},{"id":"c03be7e3-33d2-5d0c-8257-cde605b5ab1e","source_row_id":2,"name":"Beta-carotene","normalized_name":"beta_carotene","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin / carotenoid","primary_use_case":"Antioxidant; vitamin A precursor","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"2389f187-128f-578b-8fb1-29d2c40e8188","max_amount":15,"max_unit":"mg/day","basis_rationale":"No official UL; conservative AI cap for supplemental beta-carotene.","confidence":"moderate","safety_flag":"Avoid in smokers/asbestos exposure","safety_notes":"High-dose beta-carotene has specific risk concerns in smokers; avoid automated high-dose use.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"1ab15f64-c1eb-59f5-badd-791095b864ff","alias":"Beta-carotene","normalized_alias":"beta_carotene"},{"id":"28975384-9c60-577e-a9c1-47ec63597b8d","source_row_id":3,"name":"Vitamin B1","normalized_name":"vitamin_b1","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Energy metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"7d8461da-40d7-5838-ba71-08d7eddf6403","max_amount":100,"max_unit":"mg/day","basis_rationale":"No official UL; operational AI cap aligned with high supplemental use / Thai updates.","confidence":"moderate","safety_flag":"Review","safety_notes":"No official adult UL; cap is internal guardrail.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/; https://exfood.fda.moph.go.th/law/data/announ_fda/49_VitaminsMinerals_E.pdf","alias_id":"5cb4a6b1-0290-5b60-bdc6-5f49f9889819","alias":"Vitamin B1","normalized_alias":"vitamin_b1"},{"id":"ad339cb4-f2b8-5cff-9b9a-1d623675144e","source_row_id":4,"name":"Vitamin B2","normalized_name":"vitamin_b2","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Energy metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"6fabf6ae-891c-51f7-9657-3403198732ec","max_amount":100,"max_unit":"mg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"No official adult UL; cap is internal guardrail.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"db272f17-852c-5d6a-9409-bec5775d4924","alias":"Vitamin B2","normalized_alias":"vitamin_b2"},{"id":"d5b9d597-5e92-500d-a691-f7e406eda7b1","source_row_id":5,"name":"Vitamin B3","normalized_name":"vitamin_b3","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Energy metabolism / NAD metabolism","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"0b6368df-1486-5939-83e4-2640425d1730","max_amount":35,"max_unit":"mg NE/day","basis_rationale":"Official adult UL for niacin from supplements/fortified foods.","confidence":"high","safety_flag":"Flushing/liver caution","safety_notes":"Use lower limits for nicotinic acid; niacinamide has different risk profile.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"8c346046-4fa4-51fe-97df-15aa5d27c0e7","alias":"Vitamin B3","normalized_alias":"vitamin_b3"},{"id":"b365988a-f6f4-5ab8-8a03-e1ed6715ae5a","source_row_id":6,"name":"Vitamin B5","normalized_name":"vitamin_b5","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Energy metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"8df90051-de60-560f-a95d-986967ed702b","max_amount":200,"max_unit":"mg/day","basis_rationale":"No official UL; conservative operational AI cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"No official adult UL; cap is internal guardrail.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"599aca25-c681-5700-8251-1412823d980d","alias":"Vitamin B5","normalized_alias":"vitamin_b5"},{"id":"ccc3e67b-d753-5315-a8cb-a8aefa8b2fd8","source_row_id":7,"name":"Vitamin B6","normalized_name":"vitamin_b6","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Methylation / neurotransmitters","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"b072c10c-4a2e-5681-92e9-af9ff6ce8a55","max_amount":12,"max_unit":"mg/day","basis_rationale":"Conservative AI cap reflecting stricter recent EU-style limits; US UL is higher.","confidence":"moderate","safety_flag":"Neuropathy caution","safety_notes":"Use conservative cap to avoid chronic high-dose B6 neuropathy risk.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"d734cc6c-0677-5748-9d5b-f535a5195e59","alias":"Vitamin B6","normalized_alias":"vitamin_b6"},{"id":"425aa5e8-9387-5439-8df5-6823058c4d21","source_row_id":8,"name":"Vitamin B7","normalized_name":"vitamin_b7","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Hair/skin/metabolism","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"37ec0268-25c0-53a8-930b-ce4aa991d3e5","max_amount":10,"max_unit":"mg/day","basis_rationale":"No official UL; operational cap.","confidence":"moderate","safety_flag":"Lab test interference","safety_notes":"Biotin can interfere with lab tests even at common supplement doses.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"a5e76bb2-11be-50ea-ba84-6d6e82a23165","alias":"Vitamin B7","normalized_alias":"vitamin_b7"},{"id":"14104f30-c896-59c6-89f1-231f477ac685","source_row_id":9,"name":"Vitamin B9","normalized_name":"vitamin_b9","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Methylation / pregnancy support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9338878d-f374-52b3-a0e5-fc52748d2313","max_amount":1000,"max_unit":"mcg DFE/day","basis_rationale":"Official adult UL for synthetic folic acid from supplements/fortified foods.","confidence":"high","safety_flag":"Masks B12 deficiency","safety_notes":"UL applies to folic acid, not naturally occurring food folate.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"97ae7830-b632-576f-b450-239a5ec7c928","alias":"Vitamin B9","normalized_alias":"vitamin_b9"},{"id":"7ddcc4f2-708f-5905-99a4-02d80e935adf","source_row_id":10,"name":"Vitamin B12","normalized_name":"vitamin_b12","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Neurologic / methylation support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"d2eaf3f8-89d1-51e9-b85d-549467f521b1","max_amount":2000,"max_unit":"mcg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"No official adult UL; very high doses should be clinician-directed.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"6a4b6961-6dbc-5683-8618-42276d760b25","alias":"Vitamin B12","normalized_alias":"vitamin_b12"},{"id":"a34da45e-fcf0-5dbd-8a0e-7d4f9fc7b71c","source_row_id":11,"name":"Vitamin C","normalized_name":"vitamin_c","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Antioxidant / immune / collagen","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"85451e3e-2d0b-52b0-a1ae-541f493523ab","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Kidney stone/GI caution","safety_notes":"Use lower cap for kidney stone history or renal disease.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"8433e553-9350-584c-874d-5b5f1ccc4063","alias":"Vitamin C","normalized_alias":"vitamin_c"},{"id":"927083fb-b90a-5a24-b4c5-5067b06ead5f","source_row_id":12,"name":"Vitamin D3","normalized_name":"vitamin_d3","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin / hormone-like","primary_use_case":"Bone, immunity","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"a49f8c06-0f27-5b71-a985-45e069296f3c","max_amount":100,"max_unit":"mcg/day","basis_rationale":"Official adult UL; equals 4,000 IU.","confidence":"high","safety_flag":"Hypercalcemia risk","safety_notes":"Check 25(OH)D/calcium if using high-dose chronic vitamin D.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"7081b8b4-617e-540a-96c3-d30f2421bcf6","alias":"Vitamin D3","normalized_alias":"vitamin_d3"},{"id":"d3b7491b-d6aa-57b0-8d1b-a03945d34b5e","source_row_id":13,"name":"Vitamin E","normalized_name":"vitamin_e","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Antioxidant","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"54a95936-cee7-5cfb-9422-540c308c0c77","max_amount":1000,"max_unit":"mg alpha-tocopherol/day","basis_rationale":"Official adult UL for supplemental alpha-tocopherol.","confidence":"high","safety_flag":"Bleeding/anticoagulant caution","safety_notes":"Use lower cap with anticoagulants or surgery.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"559adb2a-d926-558c-ae96-b658a9abac01","alias":"Vitamin E","normalized_alias":"vitamin_e"},{"id":"38de7efc-42f2-53ca-8463-130ba7c41547","source_row_id":14,"name":"Vitamin K1","normalized_name":"vitamin_k1","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Coagulation / bone","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1946c52b-a8fb-5bfc-bc31-6e4d70ab3624","max_amount":200,"max_unit":"mcg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"moderate","safety_flag":"Warfarin interaction","safety_notes":"Keep dose consistent; review for anticoagulant users.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"1e7d3353-c251-5611-a6c0-78e65d311d3d","alias":"Vitamin K1","normalized_alias":"vitamin_k1"},{"id":"8e020fbf-61f4-5b00-8537-97c117fef918","source_row_id":15,"name":"Vitamin K2","normalized_name":"vitamin_k2","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Bone / vascular calcium routing","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"508cb57e-85e1-5a21-aa0b-6222ebb4d55a","max_amount":200,"max_unit":"mcg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"moderate","safety_flag":"Warfarin interaction","safety_notes":"Keep dose consistent; review for anticoagulant users.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"56479799-8956-58ad-942b-1744a5404f81","alias":"Vitamin K2","normalized_alias":"vitamin_k2"},{"id":"684e1966-535b-59c7-8984-ce1e68a181a0","source_row_id":16,"name":"Calcium","normalized_name":"calcium","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Bone / muscle","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9e437548-a415-5072-8246-03a4df7038ae","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Conservative adult UL range; total intake from food + supplements matters.","confidence":"high","safety_flag":"Kidney stone/cardiovascular caution","safety_notes":"For AI formulas, consider supplemental calcium much lower unless dietary intake known.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"5b19934e-2ddb-5806-8625-dc3cf51ca724","alias":"Calcium","normalized_alias":"calcium"},{"id":"199df5c4-8921-5c37-b85b-6bcb14b443fa","source_row_id":17,"name":"Magnesium","normalized_name":"magnesium","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Muscle, sleep, glucose","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c9bda72a-d39e-547c-a235-abd483875c97","max_amount":350,"max_unit":"mg/day supplemental","basis_rationale":"Official adult UL applies only to supplemental/pharmacologic magnesium, not food magnesium.","confidence":"high","safety_flag":"Diarrhea/renal disease caution","safety_notes":"Do not count food magnesium toward this supplemental UL.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"43ac364b-ce03-5f89-8b53-f634a159daf6","alias":"Magnesium","normalized_alias":"magnesium"},{"id":"38d7558c-e74b-5be0-8632-a93b6499743a","source_row_id":18,"name":"Potassium","normalized_name":"potassium","category":"Minerals","source_status":"core","ingredient_type":"Mineral / electrolyte","primary_use_case":"Blood pressure / electrolyte balance","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"fc1b14d6-9ebc-5190-8128-cd2a299bf51a","max_amount":99,"max_unit":"mg/day supplemental unsupervised","basis_rationale":"Operational cap for unsupervised supplement tablets; no simple universal adult UL.","confidence":"moderate","safety_flag":"Kidney/ACEi/ARB caution","safety_notes":"Potassium should be clinician-guided in renal disease or BP meds.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"0e49ba37-8958-5154-b3c8-204dfc7f0484","alias":"Potassium","normalized_alias":"potassium"},{"id":"a9b4fe10-4340-53bb-8719-95f29dd7204e","source_row_id":19,"name":"Sodium","normalized_name":"sodium","category":"Minerals","source_status":"core","ingredient_type":"Mineral / electrolyte","primary_use_case":"Hydration / electrolyte balance","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"f1e892a1-c55e-5f88-9ec3-b5af29acf236","max_amount":2300,"max_unit":"mg/day total","basis_rationale":"Dietary upper target, not supplement target.","confidence":"moderate","safety_flag":"Hypertension caution","safety_notes":"Avoid adding sodium unless electrolyte indication.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"935abc46-7e6c-533b-9342-1513fc39cf67","alias":"Sodium","normalized_alias":"sodium"},{"id":"e32d5277-f5c8-57a8-a0ad-c2d6319f2f01","source_row_id":20,"name":"Phosphorus","normalized_name":"phosphorus","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Bone / ATP metabolism","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3d54fe41-27fa-5cad-9183-e0f65850a3f9","max_amount":4000,"max_unit":"mg/day","basis_rationale":"Official adult UL for many adults; renal disease requires much lower individualized limits.","confidence":"high","safety_flag":"Kidney disease caution","safety_notes":"Total dietary phosphorus matters; avoid supplementation unless indicated.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"92a747eb-a974-58d0-837a-dc26a336690f","alias":"Phosphorus","normalized_alias":"phosphorus"},{"id":"6c792ecd-956a-514d-8157-86215b4351c3","source_row_id":21,"name":"Iron","normalized_name":"iron","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Anemia / oxygen transport","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3391f349-7abc-5aed-9431-fc9d33eb1d7f","max_amount":45,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Hemochromatosis/men caution","safety_notes":"Never add iron automatically for adult men or post-menopausal women without labs/clinician review.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"079b3d4e-dd84-5ba8-a0b0-c9197a9b977d","alias":"Iron","normalized_alias":"iron"},{"id":"e7f08498-3cf8-5caa-868a-27adf61afeab","source_row_id":22,"name":"Zinc","normalized_name":"zinc","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Immune / hormone support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"387d8f52-440f-5280-8d27-5d0a5fd2b4a9","max_amount":40,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Copper deficiency risk","safety_notes":"Chronic zinc near UL should trigger copper monitoring/adjustment.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"715e508e-5ea6-5877-9da8-f732c1d6fc4f","alias":"Zinc","normalized_alias":"zinc"},{"id":"795fb8b0-ffe1-5856-b3ed-9012268c1d1c","source_row_id":23,"name":"Copper","normalized_name":"copper","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Iron metabolism / antioxidant enzymes","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e1f61506-44c8-5995-aa50-2bd51429ad22","max_amount":10,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Wilson disease caution","safety_notes":"Avoid in Wilson disease/liver disease unless clinician-directed.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"1011189e-7dc4-59f2-a8d3-8585ff572637","alias":"Copper","normalized_alias":"copper"},{"id":"783b46dc-be55-55a9-bc43-6a15a1bfdb80","source_row_id":24,"name":"Manganese","normalized_name":"manganese","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Bone / enzymes","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4b8fa15b-c19b-5f31-addd-3b38a6c4b3a3","max_amount":11,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Neurologic risk","safety_notes":"Avoid high-dose chronic use.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"1256dd9c-baef-565c-b745-3caebf46a685","alias":"Manganese","normalized_alias":"manganese"},{"id":"39c199df-0a23-593a-aa84-8526cf6cc260","source_row_id":25,"name":"Selenium","normalized_name":"selenium","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Thyroid / antioxidant enzymes","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4f9a4d28-11ec-5cda-8ad0-238bc99d1912","max_amount":400,"max_unit":"mcg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Selenosis risk","safety_notes":"Avoid stacking with multi-vitamins/Brazil nut intake.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"dd3853ff-8563-568d-a20f-3ff0851a4bbc","alias":"Selenium","normalized_alias":"selenium"},{"id":"22811ba3-fc72-5962-88e0-f78e5a2976f1","source_row_id":26,"name":"Chromium","normalized_name":"chromium","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Glucose metabolism","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"483690b1-0a99-56ad-83e5-8d0ebce684f5","max_amount":1000,"max_unit":"mcg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"moderate","safety_flag":"Diabetes/renal caution","safety_notes":"May interact with glucose-lowering therapy.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"0c1620d0-aa24-500f-a74a-2204e6d2884d","alias":"Chromium","normalized_alias":"chromium"},{"id":"6b1cf50a-5f53-5e76-83a7-63d15a212793","source_row_id":27,"name":"Molybdenum","normalized_name":"molybdenum","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Sulfur/amino acid metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"858b55c0-cd3b-5ff7-9586-0dafb1232bfd","max_amount":2000,"max_unit":"mcg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Review","safety_notes":"Rarely needed as standalone supplement.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"58141875-76d7-5cc2-a3a8-f01a91b12523","alias":"Molybdenum","normalized_alias":"molybdenum"},{"id":"db9d5e20-6b6e-567f-91b2-12c6c3b6db9b","source_row_id":28,"name":"Iodine","normalized_name":"iodine","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Thyroid","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"fd775096-0e58-5521-8574-71140b3a9b19","max_amount":1100,"max_unit":"mcg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Thyroid disease caution","safety_notes":"Avoid automated iodine in thyroid disease or thyroid medication users.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"561f4010-a688-5e11-8ef3-d69d792136ba","alias":"Iodine","normalized_alias":"iodine"},{"id":"61a870f9-f1a4-52b4-9df8-1ae2f44d3bf6","source_row_id":29,"name":"Boron","normalized_name":"boron","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Bone / hormone support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"72e8c0a5-d43d-524b-a3fd-e9caa86ef5e5","max_amount":20,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Review","safety_notes":"Use lower routine doses; high doses not appropriate for general consumers.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"06102168-955d-5512-8dcf-cdffa40c6940","alias":"Boron","normalized_alias":"boron"},{"id":"f5614a74-cb27-5f37-9d58-b5ff819cc412","source_row_id":30,"name":"Silicon","normalized_name":"silicon","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Skin/hair/bone support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"7afbaa99-e953-5082-8dec-fd6612cf3afd","max_amount":20,"max_unit":"mg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"low","safety_flag":"Review","safety_notes":"No universal UL; use conservative cap.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"32d19ab8-fc0d-5a71-acc4-d1ff10f4453e","alias":"Silicon","normalized_alias":"silicon"},{"id":"82ce3845-7a7a-538d-a45e-b2e9ae5ddfe1","source_row_id":31,"name":"L-Carnitine","normalized_name":"l_carnitine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid derivative","primary_use_case":"Fatty acid transport / energy","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e6bf0fcc-4f56-5bb0-bb8a-468621c76c06","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Common studied supplemental upper operational cap.","confidence":"moderate","safety_flag":"TMAO/GI caution","safety_notes":"Avoid high-dose chronic use without review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"efa6f53f-c2b7-58d9-ae14-839aae5f14e7","alias":"L-Carnitine","normalized_alias":"l_carnitine"},{"id":"fd4ff448-c276-56f1-8c4e-ad94d1ae0caa","source_row_id":32,"name":"L-Arginine","normalized_name":"l_arginine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Nitric oxide / circulation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3ef6c316-06f3-58cd-90dc-60b172e7a3f7","max_amount":6000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"BP/HSV/nitrates caution","safety_notes":"Avoid with nitrates/PDE5 meds, low BP, active herpes unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"93a6ac96-829a-50b6-be05-5860f898a802","alias":"L-Arginine","normalized_alias":"l_arginine"},{"id":"1f2f2b89-2edc-54b3-84f6-c73c781f74b5","source_row_id":33,"name":"L-Lysine","normalized_name":"l_lysine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Protein / immune support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"df567bac-ea5b-5b4c-a752-effd18fcb5ba","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"Kidney caution","safety_notes":"High-dose amino acids should be reviewed in renal disease.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"0b2c372d-e17a-5b23-835b-8430a3f83b0b","alias":"L-Lysine","normalized_alias":"l_lysine"},{"id":"70835fa3-1b3f-51a0-8a36-661cdcc0b660","source_row_id":34,"name":"L-Leucine","normalized_name":"l_leucine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Muscle protein synthesis","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1912e56a-7fcc-584c-ae4c-75382eb0b835","max_amount":5000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"low","safety_flag":"Kidney/liver caution","safety_notes":"Consider total BCAA load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"b634cbc0-fa9a-547d-9b2f-20e9c399e120","alias":"L-Leucine","normalized_alias":"l_leucine"},{"id":"b93d0360-cbd9-5686-967a-854078ca162c","source_row_id":35,"name":"L-Isoleucine","normalized_name":"l_isoleucine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Muscle / glucose metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"fbc564e3-be92-5720-901a-1dc454e48bed","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"low","safety_flag":"Kidney/liver caution","safety_notes":"Consider total BCAA load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"1348c131-b44f-54d1-b30c-0f1bc96644a4","alias":"L-Isoleucine","normalized_alias":"l_isoleucine"},{"id":"c431a419-b65b-5413-bf77-a449cd333317","source_row_id":36,"name":"L-Valine","normalized_name":"l_valine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Muscle / energy","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1f4d4806-daa8-5204-a5f0-3b6f79f512b7","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"low","safety_flag":"Kidney/liver caution","safety_notes":"Consider total BCAA load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"08202d5d-caf6-54af-95f2-42dbef9c7cfb","alias":"L-Valine","normalized_alias":"l_valine"},{"id":"721287b1-188d-5a75-bb1e-3644b42c396f","source_row_id":37,"name":"L-Glutamine","normalized_name":"l_glutamine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Gut / recovery","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"17f498a9-b7d6-5e0f-abf3-6bc58fb68073","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"Liver/kidney caution","safety_notes":"Avoid in severe liver/kidney disease unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"765fbe4a-5dec-53fb-873b-738bedaf6644","alias":"L-Glutamine","normalized_alias":"l_glutamine"},{"id":"0da3a410-75bd-5943-b2ae-db08beed39e3","source_row_id":38,"name":"L-Taurine","normalized_name":"l_taurine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid-like","primary_use_case":"Cardio / nervous system / bile acids","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"6196d6ca-78ba-5ffc-ba79-e16f6a7e396b","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"Higher doses may be studied, but use conservative AI ceiling.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"c55b5134-7846-5376-af3e-47cab228d314","alias":"L-Taurine","normalized_alias":"l_taurine"},{"id":"b0ffbdb1-1a75-50bb-b002-d2f7ce0d4aff","source_row_id":39,"name":"L-Methionine","normalized_name":"l_methionine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Methylation / protein","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e5962cbd-81a7-59d1-876d-21542f733369","max_amount":1500,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Homocysteine caution","safety_notes":"Avoid high-dose use unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"af947289-7f89-578f-8bd0-e2482734803a","alias":"L-Methionine","normalized_alias":"l_methionine"},{"id":"d2d85db6-e5b5-51b7-89ae-66519334bce7","source_row_id":40,"name":"L-Cysteine","normalized_name":"l_cysteine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Glutathione precursor","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"04037c60-0d01-5af2-bd7a-6bc4ecee6a6a","max_amount":1500,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Consider NAC separately; cysteine dosing needs form-specific review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"c1cd34b7-2fa2-5c44-9acc-15c84d613039","alias":"L-Cysteine","normalized_alias":"l_cysteine"},{"id":"2325feda-1356-58e1-83e9-06e831a1bc7c","source_row_id":41,"name":"CoQ10","normalized_name":"coq10","category":"Antioxidants","source_status":"core","ingredient_type":"Antioxidant / mitochondrial","primary_use_case":"Mitochondria / statin users","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"b2da7591-031b-5509-9e8a-c91710719e22","max_amount":1200,"max_unit":"mg/day","basis_rationale":"Operational cap from common studied ranges.","confidence":"moderate","safety_flag":"Warfarin interaction possible","safety_notes":"Review anticoagulant users.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"1d0890cc-edf9-5bd6-bd72-e5b3bf5739da","alias":"CoQ10","normalized_alias":"coq10"},{"id":"58f70851-02ed-5c53-ba36-3b72d1e0809f","source_row_id":42,"name":"Alpha-lipoic acid","normalized_name":"alpha_lipoic_acid","category":"Antioxidants","source_status":"core","ingredient_type":"Antioxidant","primary_use_case":"Glucose / neuropathy support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"693b5787-d851-54b9-8cb5-e7fc6c76b6cc","max_amount":1200,"max_unit":"mg/day","basis_rationale":"Operational cap from common studied ranges.","confidence":"moderate","safety_flag":"Glucose/thyroid caution","safety_notes":"Use caution with diabetes medications.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"9a35af44-9ab5-5527-bef5-36ec687aa3cf","alias":"Alpha-lipoic acid","normalized_alias":"alpha_lipoic_acid"},{"id":"c2f07bb0-d732-5652-b64e-8c6de377065f","source_row_id":43,"name":"Glutathione","normalized_name":"glutathione","category":"Antioxidants","source_status":"core","ingredient_type":"Antioxidant","primary_use_case":"Detox / oxidative stress","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"34d391cf-740b-5f69-99dc-299729499d33","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"low","safety_flag":"Review","safety_notes":"Bioavailability varies by form.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"9076fcbe-f7ed-59c8-8efc-37cc09da0b2a","alias":"Glutathione","normalized_alias":"glutathione"},{"id":"850c764a-bb47-5818-8fdf-b10422f0b517","source_row_id":44,"name":"Resveratrol","normalized_name":"resveratrol","category":"Antioxidants","source_status":"core","ingredient_type":"Polyphenol","primary_use_case":"Longevity / vascular health","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"8f6b2f5b-48e2-583e-9934-e8bb0cc6c89f","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"Bleeding/drug interaction caution","safety_notes":"Avoid high dose with anticoagulants/antiplatelets.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"be28f58e-19ec-5575-a88f-6680dea0347f","alias":"Resveratrol","normalized_alias":"resveratrol"},{"id":"8a1ce673-2aa3-5ee5-9a4d-033fa19b7c9d","source_row_id":45,"name":"Quercetin","normalized_name":"quercetin","category":"Antioxidants","source_status":"core","ingredient_type":"Polyphenol","primary_use_case":"Immune / allergy / senolytic pairing","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1ff67799-6e83-56c0-9c3b-16b9ba3de92e","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"Kidney/drug interaction caution","safety_notes":"Avoid high-dose chronic use without review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"45203152-3d7b-5774-8cec-21df7a9d49ef","alias":"Quercetin","normalized_alias":"quercetin"},{"id":"7dd80148-b88a-5583-85a0-07a41d5a88e2","source_row_id":46,"name":"Lycopene","normalized_name":"lycopene","category":"Antioxidants","source_status":"core","ingredient_type":"Carotenoid","primary_use_case":"Prostate / antioxidant","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"2c6dc080-1e0b-58fd-80ef-ac3c3dcef109","max_amount":30,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"Review","safety_notes":"No official UL.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3b9a7074-be7f-5cd1-8d87-386b1546d4b6","alias":"Lycopene","normalized_alias":"lycopene"},{"id":"6309a5ff-b090-5c27-a5a8-d801aa4df1f4","source_row_id":47,"name":"Astaxanthin","normalized_name":"astaxanthin","category":"Antioxidants","source_status":"core","ingredient_type":"Carotenoid","primary_use_case":"Skin / eye / antioxidant","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e9d6cc61-2136-5c6b-adbd-d85d2b47c366","max_amount":12,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"Use reputable standardized product.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"fe6763c7-9c24-5ef7-987b-26b7a88ed070","alias":"Astaxanthin","normalized_alias":"astaxanthin"},{"id":"9635ae95-9d40-5400-baf0-6cece0739711","source_row_id":48,"name":"Curcumin","normalized_name":"curcumin","category":"Antioxidants","source_status":"core","ingredient_type":"Polyphenol","primary_use_case":"Inflammation / joint","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3a7d022c-634a-5d7b-850a-58fbad9ebf5c","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"moderate","safety_flag":"Gallbladder/bleeding caution","safety_notes":"Interactions possible; piperine changes exposure.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"a593a0c8-8291-543b-b91f-3a79bcc92316","alias":"Curcumin","normalized_alias":"curcumin"},{"id":"d3732350-4b54-5816-b99f-89751ab061e0","source_row_id":49,"name":"Ginseng","normalized_name":"ginseng","category":"Herbals","source_status":"core","ingredient_type":"Herbal / adaptogen","primary_use_case":"Energy / cognition","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"f486fa40-2d9d-5db9-90f3-b6b2744daf65","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap; form/extract dependent.","confidence":"moderate","safety_flag":"BP/diabetes/warfarin caution","safety_notes":"Standardization matters; avoid automatic use with warfarin.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"fbf4f5fd-3821-548a-9ba5-09a38a59d263","alias":"Ginseng","normalized_alias":"ginseng"},{"id":"75f265a4-d650-5636-8b9e-985152228887","source_row_id":50,"name":"Ashwagandha","normalized_name":"ashwagandha","category":"Herbals","source_status":"core","ingredient_type":"Herbal / adaptogen","primary_use_case":"Stress / sleep / hormone support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e77d4bcf-9384-5fc1-932b-82dea2c88443","max_amount":600,"max_unit":"mg/day","basis_rationale":"Conservative operational cap for root extract.","confidence":"moderate","safety_flag":"Pregnancy/liver/thyroid caution","safety_notes":"Avoid in pregnancy; rare liver injury reports require warning.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"db1f4d5d-804d-5522-bcb1-b6891111ab1b","alias":"Ashwagandha","normalized_alias":"ashwagandha"},{"id":"aadcef40-774e-5317-a072-561ed056f22b","source_row_id":51,"name":"Rhodiola","normalized_name":"rhodiola","category":"Herbals","source_status":"core","ingredient_type":"Herbal / adaptogen","primary_use_case":"Fatigue / stress resilience","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"50c5091d-2504-5655-a193-653c9be7e886","max_amount":600,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Stimulant/bipolar caution","safety_notes":"Avoid with mania/bipolar history unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"6aecbc6a-478b-5357-8c2e-5e2f73ba87b0","alias":"Rhodiola","normalized_alias":"rhodiola"},{"id":"ef482200-464b-5e8f-a4c2-5a1c34017d10","source_row_id":52,"name":"Ginkgo","normalized_name":"ginkgo","category":"Herbals","source_status":"core","ingredient_type":"Herbal","primary_use_case":"Cognition / circulation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"039617e2-e865-5805-8523-f7b43fc9ce7e","max_amount":240,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/seizure caution","safety_notes":"Avoid with anticoagulants/antiplatelets unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"2b0e9543-9192-5342-8b1b-d08fe54dea92","alias":"Ginkgo","normalized_alias":"ginkgo"},{"id":"88ce039c-88bc-5b9d-9189-d5870ec17207","source_row_id":53,"name":"Milk thistle","normalized_name":"milk_thistle","category":"Herbals","source_status":"core","ingredient_type":"Herbal","primary_use_case":"Liver support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"afe82f1c-1e73-532d-8236-05262c137b1a","max_amount":700,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Allergy/drug interaction caution","safety_notes":"Extract standardization matters.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"a8b398c7-ae36-5e68-83e6-bbb2ad02aa6d","alias":"Milk thistle","normalized_alias":"milk_thistle"},{"id":"0a1f370a-3886-5218-b262-0b092f861e0a","source_row_id":54,"name":"Turmeric","normalized_name":"turmeric","category":"Herbals","source_status":"core","ingredient_type":"Herbal","primary_use_case":"Inflammation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"273b8982-d151-5db8-8241-3293bdd79691","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Operational cap; curcumin content varies.","confidence":"moderate","safety_flag":"Gallbladder/bleeding caution","safety_notes":"Avoid duplicating with curcumin unless total curcuminoids tracked.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"c9664282-c224-5988-bf7b-bc0964f78413","alias":"Turmeric","normalized_alias":"turmeric"},{"id":"8598f3b9-191d-54ce-88a4-4a2cdd85a873","source_row_id":55,"name":"Ginger","normalized_name":"ginger","category":"Herbals","source_status":"core","ingredient_type":"Herbal","primary_use_case":"GI / nausea / inflammation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"336a860b-fb99-5ee4-b7ca-ed4cc3dfcbdf","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/reflux caution","safety_notes":"Use caution with anticoagulants and before surgery.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"460d735a-a35f-5879-b133-eb4da68494ef","alias":"Ginger","normalized_alias":"ginger"},{"id":"21d71624-7572-543d-8f31-945cafdebdb4","source_row_id":56,"name":"Garlic","normalized_name":"garlic","category":"Herbals","source_status":"core","ingredient_type":"Herbal","primary_use_case":"Cardiometabolic / immune","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"63d0b8b5-1060-5997-ac67-9fc121dcd96d","max_amount":1200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/BP caution","safety_notes":"Use caution with anticoagulants/antiplatelets.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"bd05ca72-77a0-559a-8f92-e00ca8512d26","alias":"Garlic","normalized_alias":"garlic"},{"id":"26ffbe5c-92f8-5e9f-80e1-9cdf492b5510","source_row_id":57,"name":"Choline","normalized_name":"choline","category":"Functional","source_status":"core","ingredient_type":"Functional nutrient","primary_use_case":"Brain / liver / methylation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"bdfb250b-9aa0-5fd4-810c-5a29b789de0d","max_amount":3500,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Fishy odor/hypotension caution","safety_notes":"Total choline intake matters.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"d07f2a3b-f509-5c72-ae4c-30ad0ea1b75a","alias":"Choline","normalized_alias":"choline"},{"id":"6c23cf7c-4045-5d64-95c8-e31b611a29b4","source_row_id":58,"name":"Inositol","normalized_name":"inositol","category":"Functional","source_status":"core","ingredient_type":"Functional nutrient","primary_use_case":"Metabolic / mood / PCOS support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"74b083a2-060f-5ece-af22-d5099bfffb4e","max_amount":4000,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"moderate","safety_flag":"GI caution","safety_notes":"Higher doses may be used clinically but should be supervised.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"8b1413d8-d6e3-5088-ba9a-534cf533ff5c","alias":"Inositol","normalized_alias":"inositol"},{"id":"fb1c10b0-58d5-5c60-83ae-c2f73fb8b310","source_row_id":59,"name":"Creatine","normalized_name":"creatine","category":"Functional","source_status":"core","ingredient_type":"Performance / brain","primary_use_case":"Muscle / cognition / aging","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"03f1674d-3e07-5d71-b535-41853bc15a1e","max_amount":5000,"max_unit":"mg/day","basis_rationale":"Operational cap for routine maintenance.","confidence":"moderate","safety_flag":"Kidney caution","safety_notes":"Renal disease requires clinician review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3696b2c2-7309-5ab4-94e4-7af03638290d","alias":"Creatine","normalized_alias":"creatine"},{"id":"87e3548a-8eb8-5a10-9ba2-a3a880c3970e","source_row_id":60,"name":"NAD+ precursors","normalized_name":"nad_precursors","category":"Functional","source_status":"core","ingredient_type":"Longevity / cellular energy","primary_use_case":"NAD pathway","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"d739b2f1-98a6-5172-abe3-c0454301d43b","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap; ingredient form must be specified.","confidence":"moderate","safety_flag":"Review","safety_notes":"Do not combine multiple NAD boosters without summing total.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"d5801e0c-ea75-5aab-984f-2302c8befe81","alias":"NAD+ precursors","normalized_alias":"nad_precursors"},{"id":"6a33eb4f-77ff-5525-8b3f-85fdbdd34abc","source_row_id":61,"name":"Phosphatidylserine","normalized_name":"phosphatidylserine","category":"Functional","source_status":"core","ingredient_type":"Phospholipid","primary_use_case":"Cognition / stress","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4ca5ee29-aaca-574d-855b-b947e4770ff7","max_amount":300,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"Typical cognitive supplement range.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"7e8bda5b-d033-5a64-925e-3b1a0c11150c","alias":"Phosphatidylserine","normalized_alias":"phosphatidylserine"},{"id":"9da42d1d-24f5-56d2-bd62-5ea45adfcc4b","source_row_id":62,"name":"Omega-3","normalized_name":"omega_3","category":"Fatty Acids","source_status":"core","ingredient_type":"Fatty acid","primary_use_case":"Cardio / brain / inflammation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"182848fa-140e-5103-80c1-ae5be90a694b","max_amount":3000,"max_unit":"mg/day EPA+DHA","basis_rationale":"Conservative cap for combined EPA+DHA from supplements.","confidence":"moderate","safety_flag":"Bleeding/AFib caution","safety_notes":"Use lower cap with anticoagulants or arrhythmia history.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"2fc465a3-effe-5b4d-be62-dd44378e0c0e","alias":"Omega-3","normalized_alias":"omega_3"},{"id":"885c74ed-104b-5eb8-8f69-030f33553379","source_row_id":63,"name":"Omega-6","normalized_name":"omega_6","category":"Fatty Acids","source_status":"core","ingredient_type":"Fatty acid","primary_use_case":"Essential fatty acid balance","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"759173e1-5114-5e72-ae00-19291ab6323c","max_amount":5000,"max_unit":"mg/day supplemental","basis_rationale":"Operational cap; no universal supplement UL.","confidence":"low","safety_flag":"Review","safety_notes":"Avoid unnecessary omega-6 supplementation if dietary intake is high.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"87146a43-dce2-5dc6-9675-3bed6c08f136","alias":"Omega-6","normalized_alias":"omega_6"},{"id":"b7226046-2217-5bbc-98d6-d817ed4d18b2","source_row_id":64,"name":"Omega-9","normalized_name":"omega_9","category":"Fatty Acids","source_status":"core","ingredient_type":"Fatty acid","primary_use_case":"Cardiometabolic","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"79023bfe-70ba-5550-99a2-840ad9df849f","max_amount":5000,"max_unit":"mg/day supplemental","basis_rationale":"Operational cap; no universal supplement UL.","confidence":"low","safety_flag":"Review","safety_notes":"Usually food-derived; supplement rarely necessary.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"099baa41-1061-577a-8db6-520fe903c824","alias":"Omega-9","normalized_alias":"omega_9"},{"id":"71e61cb6-19bf-5cc8-8bb8-da4280a6e579","source_row_id":65,"name":"Inulin","normalized_name":"inulin","category":"Gut Health","source_status":"core","ingredient_type":"Prebiotic fiber","primary_use_case":"Microbiome","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"bf1a5930-6151-5e1d-b72b-4f8fecea5b50","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational fiber cap for tolerability.","confidence":"moderate","safety_flag":"GI/FODMAP caution","safety_notes":"Titrate gradually.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"d419d898-333e-5be5-b32b-1ab2836ffbe8","alias":"Inulin","normalized_alias":"inulin"},{"id":"4c1868b3-32f4-5538-8424-0ef637512e0a","source_row_id":66,"name":"FOS","normalized_name":"fos","category":"Gut Health","source_status":"core","ingredient_type":"Prebiotic fiber","primary_use_case":"Microbiome","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"a6129d2c-aa0a-5507-a92d-3ee344eecce4","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational fiber cap for tolerability.","confidence":"moderate","safety_flag":"GI/FODMAP caution","safety_notes":"Titrate gradually.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"17f81b05-277a-55fd-af94-89603bb3ebaa","alias":"FOS","normalized_alias":"fos"},{"id":"3114522b-bcaa-5dee-b469-7f9c794ce217","source_row_id":67,"name":"GOS","normalized_name":"gos","category":"Gut Health","source_status":"core","ingredient_type":"Prebiotic fiber","primary_use_case":"Microbiome","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"6e08a143-f09f-5cb9-a94c-8cdbd6dec143","max_amount":5000,"max_unit":"mg/day","basis_rationale":"Operational cap for tolerability.","confidence":"low","safety_flag":"GI/FODMAP caution","safety_notes":"Titrate gradually.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"ceba74bd-3c43-5c20-af6f-a257185bd721","alias":"GOS","normalized_alias":"gos"},{"id":"4019dcc8-b77b-5ef5-850f-b9b7157d0dad","source_row_id":68,"name":"Pectin","normalized_name":"pectin","category":"Gut Health","source_status":"core","ingredient_type":"Prebiotic fiber","primary_use_case":"Microbiome / cholesterol","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3b07c8ab-057b-57d5-bbd8-84a4bd147395","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational fiber cap.","confidence":"low","safety_flag":"GI/med absorption caution","safety_notes":"Separate from medications.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"472e0ea0-526a-543b-adf6-d83f0c963b3b","alias":"Pectin","normalized_alias":"pectin"},{"id":"091a783e-9f1a-5435-acb4-2cf53ca0a16e","source_row_id":69,"name":"Psyllium","normalized_name":"psyllium","category":"Gut Health","source_status":"core","ingredient_type":"Fiber","primary_use_case":"Cholesterol / glucose / bowel regularity","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"5c360f03-6f19-5b2c-aaa2-82caa90dcbdd","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational fiber cap.","confidence":"moderate","safety_flag":"Choking/med absorption caution","safety_notes":"Must take with adequate water; separate medications.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"51dbed65-344c-5392-b415-a5819c8f0168","alias":"Psyllium","normalized_alias":"psyllium"},{"id":"5537ed8d-b3ce-5b75-b875-7efed0cfb181","source_row_id":70,"name":"Bromelain","normalized_name":"bromelain","category":"Enzymes","source_status":"core","ingredient_type":"Enzyme","primary_use_case":"Protein digestion / inflammation","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c72d815b-264c-5c1e-af9e-c4c05648651f","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap; activity units also matter.","confidence":"low","safety_flag":"Bleeding/allergy caution","safety_notes":"Validate by activity units and extract quality.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"1944f26a-f579-557d-aa80-4c28a40bb31e","alias":"Bromelain","normalized_alias":"bromelain"},{"id":"f72cef12-799b-51c6-b8e6-de07cd9491a3","source_row_id":71,"name":"Papain","normalized_name":"papain","category":"Enzymes","source_status":"core","ingredient_type":"Enzyme","primary_use_case":"Protein digestion","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"79852adb-018e-5f1a-add3-027bc1097d9f","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap; activity units also matter.","confidence":"low","safety_flag":"Allergy caution","safety_notes":"Validate by activity units; avoid in latex/papaya allergy.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"8ac0d2fe-5230-5912-b9ca-c721cdf06604","alias":"Papain","normalized_alias":"papain"},{"id":"4449efe8-19a9-5acc-9a8d-ca7c7cb1db31","source_row_id":72,"name":"Amylase","normalized_name":"amylase","category":"Enzymes","source_status":"core","ingredient_type":"Enzyme","primary_use_case":"Carbohydrate digestion","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"735395a3-f38e-57f8-99d4-7d67bc2abb1c","max_amount":250,"max_unit":"mg/day","basis_rationale":"Placeholder mg cap; enzyme activity units required.","confidence":"low","safety_flag":"Review","safety_notes":"Do not rely on mg only; use FCC/USP activity limits by product.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"ee6db506-25d2-545a-94a3-86b67fa02d5c","alias":"Amylase","normalized_alias":"amylase"},{"id":"7da68318-b2d3-5abb-893d-628b4edf3017","source_row_id":73,"name":"Lipase","normalized_name":"lipase","category":"Enzymes","source_status":"core","ingredient_type":"Enzyme","primary_use_case":"Fat digestion","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c02d2ca7-12ba-50c5-9c6f-38f6b65c9271","max_amount":250,"max_unit":"mg/day","basis_rationale":"Placeholder mg cap; enzyme activity units required.","confidence":"low","safety_flag":"Review","safety_notes":"Do not rely on mg only; use FCC/USP activity limits by product.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"904277ae-2b70-5a2c-a019-f577d372682e","alias":"Lipase","normalized_alias":"lipase"},{"id":"828b293c-8709-590f-aeb1-6f76166d6fcf","source_row_id":74,"name":"Protease","normalized_name":"protease","category":"Enzymes","source_status":"core","ingredient_type":"Enzyme","primary_use_case":"Protein digestion","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"70c9f6e4-8859-5102-853e-95c1cc90f7f2","max_amount":250,"max_unit":"mg/day","basis_rationale":"Placeholder mg cap; enzyme activity units required.","confidence":"low","safety_flag":"Review","safety_notes":"Do not rely on mg only; use FCC/USP activity limits by product.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"f37ee10f-cc06-517f-be1c-55171d61d847","alias":"Protease","normalized_alias":"protease"},{"id":"be826295-ec35-5dc9-8477-5ecd5f59a8f3","source_row_id":75,"name":"Spermidine","normalized_name":"spermidine","category":"Longevity","source_status":"core","ingredient_type":"Longevity compound","primary_use_case":"Autophagy / healthy aging","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"7df7493d-0ee7-55f9-9be9-53178f5c9acf","max_amount":6,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Use food-derived/standardized material only.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"06f7a3ce-c2c3-5795-84ca-a1ba3eb97319","alias":"Spermidine","normalized_alias":"spermidine"},{"id":"f2ecd858-ff2a-5dff-b225-68d615a69b1f","source_row_id":76,"name":"Collagen","normalized_name":"collagen","category":"Longevity","source_status":"core","ingredient_type":"Protein / peptide","primary_use_case":"Skin / joints","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"74985f02-1bc3-5caa-bfe5-c4aa0921dc1c","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational cap for collagen peptides.","confidence":"moderate","safety_flag":"Protein/kidney caution","safety_notes":"Consider total protein load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3a7fea1f-f43f-51b8-94b4-589f738d8d0d","alias":"Collagen","normalized_alias":"collagen"},{"id":"c7c3b9dd-2bd7-50d2-81aa-217c0d44be6a","source_row_id":77,"name":"Hyaluronic acid","normalized_name":"hyaluronic_acid","category":"Longevity","source_status":"core","ingredient_type":"Glycosaminoglycan","primary_use_case":"Skin / joints","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"730e9e82-6d06-5ed1-9068-37a0db5ad83b","max_amount":200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Form and MW matter.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"4f169958-4558-50c1-9d2e-5c95f8ba4ca6","alias":"Hyaluronic acid","normalized_alias":"hyaluronic_acid"},{"id":"159491f9-3a74-51ef-b9e4-55e87567e41c","source_row_id":78,"name":"MSM","normalized_name":"msm","category":"Longevity","source_status":"core","ingredient_type":"Sulfur compound","primary_use_case":"Joint / connective tissue","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"695bf60b-e4e4-5d7f-a2ad-9584b9be1823","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"GI/headache caution","safety_notes":"Avoid high-dose unsupervised use.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"f50ccc4e-b817-5493-8ab6-1df289cfa0cd","alias":"MSM","normalized_alias":"msm"},{"id":"0389528a-10fe-5185-a94b-d4cecddf0aa9","source_row_id":79,"name":"Glucosamine","normalized_name":"glucosamine","category":"Longevity","source_status":"core","ingredient_type":"Joint compound","primary_use_case":"Joint support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"dc9b9ba9-d8f2-5bcf-939b-bca477124f27","max_amount":1500,"max_unit":"mg/day","basis_rationale":"Common supplemental cap.","confidence":"moderate","safety_flag":"Shellfish/warfarin/glucose caution","safety_notes":"Use caution with warfarin and shellfish allergy.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"d54e9d09-8de5-5472-818f-e7dc7f6fa95f","alias":"Glucosamine","normalized_alias":"glucosamine"},{"id":"28bcfb7f-a09e-5dd1-9187-c31d6f384a3a","source_row_id":80,"name":"Melatonin","normalized_name":"melatonin","category":"Longevity","source_status":"core","ingredient_type":"Sleep hormone","primary_use_case":"Sleep timing","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"227aafdc-edf7-51c4-8367-4baa36c148ad","max_amount":5,"max_unit":"mg/day","basis_rationale":"Conservative consumer AI cap.","confidence":"moderate","safety_flag":"Sedation/children/pregnancy caution","safety_notes":"Avoid high-dose chronic automated recommendations.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"949260ed-2e46-5ade-9eae-257ba1c31645","alias":"Melatonin","normalized_alias":"melatonin"},{"id":"8c6bbc4c-5046-5fc3-9516-27a3c8c7a178","source_row_id":81,"name":"Theanine","normalized_name":"theanine","category":"Longevity","source_status":"core","ingredient_type":"Amino acid derivative","primary_use_case":"Calm focus / sleep","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1c3456b0-aa40-5953-92b2-799104063840","max_amount":400,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Sedation caution","safety_notes":"Caution with sedatives.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"9a8ba474-9a71-55c1-9186-78849e0718d6","alias":"Theanine","normalized_alias":"theanine"},{"id":"0e1aff20-f862-5073-b379-b55933c339c9","source_row_id":82,"name":"Lion’s Mane (Hericium erinaceus)","normalized_name":"lion_s_mane_hericium_erinaceus","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Cognition / nerve growth factor support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"28b4b6c8-49a7-50f5-985b-449bf69979ff","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap; extract/fruiting body dependent.","confidence":"low","safety_flag":"Allergy/asthma caution","safety_notes":"Require beta-glucan/extract specification for product formulas.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"07ec304f-019f-5836-81cd-2179fe1ec86a","alias":"Lion’s Mane (Hericium erinaceus)","normalized_alias":"lion_s_mane_hericium_erinaceus"},{"id":"e3a93b74-5184-5b98-aecd-c9cede2e1ead","source_row_id":83,"name":"Reishi (Ganoderma lucidum)","normalized_name":"reishi_ganoderma_lucidum","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Stress resilience / immune modulation","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"d32ec2e2-456d-53d7-a64c-981b2fad66cc","max_amount":1500,"max_unit":"mg/day extract","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Bleeding/liver caution","safety_notes":"Avoid with anticoagulants; caution with liver disease.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"14c733d1-e2e6-5f08-a0c1-09def0c9f3db","alias":"Reishi (Ganoderma lucidum)","normalized_alias":"reishi_ganoderma_lucidum"},{"id":"933dd7af-aa29-5270-b7ab-a194276c784b","source_row_id":84,"name":"Cordyceps militaris","normalized_name":"cordyceps_militaris","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Energy / endurance / VO2 support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"41132330-d098-5831-9a61-a05d172b6a6a","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Autoimmune/bleeding caution","safety_notes":"Extract standardization matters.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"d7d7cc77-fe6f-595a-8842-1d2337388226","alias":"Cordyceps militaris","normalized_alias":"cordyceps_militaris"},{"id":"8f31671e-c502-5313-be41-13f7ce6a6890","source_row_id":85,"name":"Chaga","normalized_name":"chaga","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Antioxidant / immune support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"efb09ccb-1447-50d8-b0e3-98cffaaa2dc3","max_amount":1000,"max_unit":"mg/day extract","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Oxalate/kidney/bleeding caution","safety_notes":"Avoid in kidney stone/renal disease risk unless reviewed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"b45b3408-3bad-5536-a5c3-be5cd6440202","alias":"Chaga","normalized_alias":"chaga"},{"id":"fb508faf-1236-5ba8-bc1d-4b4e84f9d7f5","source_row_id":86,"name":"Turkey Tail","normalized_name":"turkey_tail","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Gut / immune support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4d5ea891-36f1-5a6f-b697-877e3244caa4","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Immune caution","safety_notes":"Avoid immunosuppressed/oncology use without clinician review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"49b31193-703b-52f2-8f13-27ba9b2a0477","alias":"Turkey Tail","normalized_alias":"turkey_tail"},{"id":"68d96ff4-126c-5b73-9980-b4ef729acd1b","source_row_id":87,"name":"Maitake","normalized_name":"maitake","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Metabolic / immune support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e587ef53-0ce8-5bba-b75d-1ddee53d3d93","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Glucose/BP caution","safety_notes":"Caution with diabetes/BP meds.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"ccd63f47-ad32-5277-b624-98371adcfcfe","alias":"Maitake","normalized_alias":"maitake"},{"id":"53085130-90e0-59ad-9817-8bdb6675cacb","source_row_id":88,"name":"Shiitake extract","normalized_name":"shiitake_extract","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Immune / metabolic support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"8adc38c0-6891-540d-83e6-5d613d1c1e68","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Allergy/skin reaction caution","safety_notes":"Extract standardization matters.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"e03f2bfb-97a5-5c10-9b12-a3d95b6ad841","alias":"Shiitake extract","normalized_alias":"shiitake_extract"},{"id":"e4c1c062-6b4b-527e-b171-7078fcecff44","source_row_id":89,"name":"NMN","normalized_name":"nmn","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"NAD+ precursor","primary_use_case":"Cellular energy / longevity","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"ff87fba0-8d2b-5bdb-81c9-5fa83f45a583","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Regulatory status varies by country; review before commercialization.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"2736ab10-9d94-5de7-b852-bd4e131c57c2","alias":"NMN","normalized_alias":"nmn"},{"id":"738cd230-2eee-5f7d-8bbb-9745294f645e","source_row_id":90,"name":"NR (Nicotinamide Riboside)","normalized_name":"nr_nicotinamide_riboside","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"NAD+ precursor","primary_use_case":"Cellular energy / longevity","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"38261c82-64b1-550e-81c6-a75eac92f446","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"Avoid stacking with other NAD boosters beyond total cap.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"f03e4a0e-480f-5332-8442-94bfedcdea1d","alias":"NR (Nicotinamide Riboside)","normalized_alias":"nr_nicotinamide_riboside"},{"id":"97c700ea-1752-57be-9ed4-dbaef1a5cd41","source_row_id":91,"name":"Fisetin","normalized_name":"fisetin","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Flavonoid / senolytic","primary_use_case":"Senescence / healthy aging","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9790d131-a7db-561a-b7b4-e1a6e8c94eee","max_amount":100,"max_unit":"mg/day","basis_rationale":"Conservative routine-use cap.","confidence":"low","safety_flag":"Experimental/senolytic caution","safety_notes":"High-dose senolytic protocols should be clinician/research only.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3db03683-58a5-5062-9a46-946e3d5577ef","alias":"Fisetin","normalized_alias":"fisetin"},{"id":"3d4caa9b-6cb0-596c-8aa3-4adaa2da105b","source_row_id":92,"name":"Pterostilbene","normalized_name":"pterostilbene","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Polyphenol","primary_use_case":"Longevity / vascular support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"d5c234e3-08c0-50c8-97b8-415b6733b80e","max_amount":250,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"LDL/drug interaction caution","safety_notes":"Use conservative dose; monitor lipids if chronic.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"0709ec10-4d0e-52e3-89b5-14aa893113ce","alias":"Pterostilbene","normalized_alias":"pterostilbene"},{"id":"f691f0ae-5a2e-5af8-a328-0452fd391e8a","source_row_id":93,"name":"Apigenin","normalized_name":"apigenin","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Flavonoid","primary_use_case":"Sleep / NAD support / calm","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"b82bcc4a-fe06-52f7-b440-cf3044c711a4","max_amount":50,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Sedation/drug interaction caution","safety_notes":"Caution with sedatives/anticoagulants.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3b5837d0-fe96-5fab-bd9e-527b5e000b3c","alias":"Apigenin","normalized_alias":"apigenin"},{"id":"c4004824-a6a2-5a28-b9cf-5a2858a92603","source_row_id":94,"name":"Urolithin A","normalized_name":"urolithin_a","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Postbiotic metabolite","primary_use_case":"Mitochondrial health","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"06329296-fb3b-5e7c-b9e1-1d0c131ccaca","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap based on commercial studied range.","confidence":"moderate","safety_flag":"Review","safety_notes":"Use validated ingredient form.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"52c0e14e-faf3-5718-bf41-abf0a47bf873","alias":"Urolithin A","normalized_alias":"urolithin_a"},{"id":"b687d526-a886-5406-8e31-f09f77e7f4ff","source_row_id":95,"name":"Glycine","normalized_name":"glycine","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Amino acid","primary_use_case":"Sleep / collagen / longevity","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"04b5c85a-b617-5969-8e6c-daf0f7f74286","max_amount":5000,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"moderate","safety_flag":"Sedation/GI caution","safety_notes":"Higher intakes should be reviewed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3f3240e9-6ae2-5c7d-859b-4627e05f573b","alias":"Glycine","normalized_alias":"glycine"},{"id":"2904424e-d914-58a2-b346-838a0a225dfc","source_row_id":96,"name":"Berberine","normalized_name":"berberine","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Alkaloid","primary_use_case":"Glucose / metabolic health","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9a06a91d-cafa-5a6e-a9dc-54c99ce6eb8e","max_amount":1500,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Diabetes/pregnancy/drug interaction caution","safety_notes":"Avoid pregnancy/breastfeeding; caution with glucose-lowering meds.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"f33e8948-7256-5894-8b12-6b4bc172a742","alias":"Berberine","normalized_alias":"berberine"},{"id":"6cf05719-eebe-5c93-9ffe-39edaaf28124","source_row_id":97,"name":"L-Citrulline","normalized_name":"l_citrulline","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Amino acid","primary_use_case":"Nitric oxide / circulation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"f421b032-0490-5e18-8cb7-e5d6861db8c0","max_amount":6000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"BP/nitrates caution","safety_notes":"Caution with low BP, nitrates, PDE5 meds.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"da59d50b-3e45-5236-ac62-9d5f10a7bf61","alias":"L-Citrulline","normalized_alias":"l_citrulline"},{"id":"f205033f-1de9-54a7-a3bb-f52e7737e104","source_row_id":98,"name":"Beetroot extract","normalized_name":"beetroot_extract","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Nitrate source","primary_use_case":"Blood flow / exercise performance","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"08b2d99f-cafd-52e2-a651-f90c0b7d2ec0","max_amount":1000,"max_unit":"mg/day extract","basis_rationale":"Operational cap; nitrate content matters.","confidence":"low","safety_flag":"BP/kidney stone caution","safety_notes":"Track nitrate amount where possible.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"37af2533-e66f-591a-9e65-43114236d03c","alias":"Beetroot extract","normalized_alias":"beetroot_extract"},{"id":"60fc28f2-3244-5e95-985c-36c264394dd8","source_row_id":99,"name":"Hawthorn extract","normalized_name":"hawthorn_extract","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Herbal extract","primary_use_case":"Cardiovascular support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9f704065-a2f4-54ad-9f83-6aa1f762b274","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Heart/BP medication caution","safety_notes":"Avoid automated use in cardiac patients without clinician review.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"29373838-602e-5399-b689-9b612d027e61","alias":"Hawthorn extract","normalized_alias":"hawthorn_extract"},{"id":"50b83f8f-a476-54f8-905b-1df6d98d3aed","source_row_id":100,"name":"Olive leaf extract","normalized_name":"olive_leaf_extract","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Polyphenol extract","primary_use_case":"Blood pressure / metabolic support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"132668a7-0608-54d2-a4cb-d252c1db3db8","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"BP/glucose caution","safety_notes":"Caution with BP/glucose medications.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"97349f57-a370-53bb-aa42-aa21805a0b10","alias":"Olive leaf extract","normalized_alias":"olive_leaf_extract"},{"id":"22d1d5f3-224c-5097-a20e-f9ac91140148","source_row_id":101,"name":"Garlic extract standardized to allicin","normalized_name":"garlic_extract_standardized_to_allicin","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Standardized herbal extract","primary_use_case":"Cardiometabolic support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e72bfd9c-36cd-58de-84e1-96d10975e60e","max_amount":1200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/BP caution","safety_notes":"Avoid duplicate garlic entries; track total garlic extract.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"d333d20d-af00-5a6a-8db7-7cdf33b91af8","alias":"Garlic extract standardized to allicin","normalized_alias":"garlic_extract_standardized_to_allicin"},{"id":"89ba3e8f-4c45-5037-93ab-d32a38fd4e0d","source_row_id":102,"name":"Policosanol","normalized_name":"policosanol","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Lipid compound","primary_use_case":"Cholesterol support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"59909e77-9da3-5485-8e8f-24c51954c7bf","max_amount":20,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Bleeding caution","safety_notes":"Evidence mixed; use conservative cap.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"53366876-0543-579c-bf62-2540e864097e","alias":"Policosanol","normalized_alias":"policosanol"},{"id":"ed45e60d-a6d4-5dda-8dfe-3671d7121fc5","source_row_id":103,"name":"Plant sterols / stanols","normalized_name":"plant_sterols_stanols","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Functional lipid","primary_use_case":"LDL cholesterol support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"39ce4f69-cb5c-5763-8202-bd167bed1b74","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Fat-soluble vitamin absorption caution","safety_notes":"Usually 1.5-3 g/day range.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"ef81cc2d-e506-540b-bc54-66ca84dc0b1b","alias":"Plant sterols / stanols","normalized_alias":"plant_sterols_stanols"},{"id":"c8ffa899-deea-52da-824e-2fe1f0437a66","source_row_id":104,"name":"Citicoline (CDP-choline)","normalized_name":"citicoline_cdp_choline","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Choline donor","primary_use_case":"Focus / cognition","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"2c65e712-3f4f-5d68-8092-011eac3bbdcb","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Cholinergic caution","safety_notes":"Sum with total choline load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"2ff397fd-1c29-5ea1-8f1c-7538bc9e2724","alias":"Citicoline (CDP-choline)","normalized_alias":"citicoline_cdp_choline"},{"id":"dcc59450-1b3e-54ce-87af-435a33329670","source_row_id":105,"name":"Alpha-GPC","normalized_name":"alpha_gpc","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Choline donor","primary_use_case":"Cognition / acetylcholine support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c39390b9-37b1-5dcc-a312-edeb77defd43","max_amount":600,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Cholinergic caution","safety_notes":"Sum with total choline load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"e2503d7a-9e80-5517-adcb-36170ab25fd5","alias":"Alpha-GPC","normalized_alias":"alpha_gpc"},{"id":"e225c7a6-acb9-5318-aaa3-4fb7d27f195c","source_row_id":106,"name":"Bacopa monnieri","normalized_name":"bacopa_monnieri","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Herbal nootropic","primary_use_case":"Memory / learning","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3970947b-deca-58a3-9237-141394c9693a","max_amount":450,"max_unit":"mg/day extract","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Sedation/GI/thyroid caution","safety_notes":"Use standardized bacosides; caution with sedatives.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"b2fedc5a-8dde-5344-b20b-fc4f6ed3a179","alias":"Bacopa monnieri","normalized_alias":"bacopa_monnieri"},{"id":"a2fbed19-a1db-5753-ba2b-c4b7703ae59b","source_row_id":107,"name":"L-Tyrosine","normalized_name":"l_tyrosine","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Amino acid","primary_use_case":"Stress / dopamine support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"186d2bb2-e26a-56bd-b066-49a3739cd3ca","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Thyroid/MAOI/BP caution","safety_notes":"Avoid with MAOIs; caution thyroid disease.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"9428ad82-0819-54d8-bc9f-3a8eaea37b0d","alias":"L-Tyrosine","normalized_alias":"l_tyrosine"},{"id":"00c13235-56d2-55e3-ade0-510fd25ffa4a","source_row_id":108,"name":"Uridine monophosphate","normalized_name":"uridine_monophosphate","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Nucleotide","primary_use_case":"Synapse / brain support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"b85fe645-8f27-5b25-9a63-a174cbfe20a5","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Use conservative cap; limited safety data.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"5d5e9d1f-c848-5bd2-be52-ae7bc23d399c","alias":"Uridine monophosphate","normalized_alias":"uridine_monophosphate"},{"id":"4b13d031-fd1c-5acf-95d5-54030093eccd","source_row_id":109,"name":"Saffron extract","normalized_name":"saffron_extract","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Botanical extract","primary_use_case":"Mood / emotional wellbeing","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4ab7960d-6ff0-5df3-a39a-9fbde37d478c","max_amount":30,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Pregnancy/serotonergic caution","safety_notes":"Avoid pregnancy; caution with serotonergic meds.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"aa58429e-5db2-57b0-a65b-388b3788a44b","alias":"Saffron extract","normalized_alias":"saffron_extract"},{"id":"995bce65-8b91-560a-9669-ffd1a9b53067","source_row_id":110,"name":"Lactobacillus rhamnosus","normalized_name":"lactobacillus_rhamnosus","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Probiotic strain","primary_use_case":"Gut / immune / resilience","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c3e912b7-efee-5a9b-bf62-42f2ddb1ed69","max_amount":10,"max_unit":"billion CFU/day","basis_rationale":"Operational cap; strain-specific.","confidence":"moderate","safety_flag":"Immunocompromised caution","safety_notes":"Probiotic dosing should be by strain and CFU, not mg.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"f7061d34-3640-5ead-8fc0-fb9c4a3fe37a","alias":"Lactobacillus rhamnosus","normalized_alias":"lactobacillus_rhamnosus"},{"id":"5333965c-2ad2-50d3-9617-122f752c3d16","source_row_id":111,"name":"Bifidobacterium longum","normalized_name":"bifidobacterium_longum","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Probiotic strain","primary_use_case":"Gut / mood / immune support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"650b1300-8de7-5f4a-ae16-e471c20f669a","max_amount":10,"max_unit":"billion CFU/day","basis_rationale":"Operational cap; strain-specific.","confidence":"moderate","safety_flag":"Immunocompromised caution","safety_notes":"Probiotic dosing should be by strain and CFU, not mg.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"c971fcc5-1ba8-5865-94fb-ca32cba30ae0","alias":"Bifidobacterium longum","normalized_alias":"bifidobacterium_longum"},{"id":"1deaa8e5-58ec-56fc-ae06-41dc13d698ef","source_row_id":112,"name":"Multi-strain probiotics","normalized_name":"multi_strain_probiotics","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Probiotic blend","primary_use_case":"Microbiome support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3c1602ce-e0b8-544c-a205-fc473075f189","max_amount":50,"max_unit":"billion CFU/day","basis_rationale":"Operational cap; strain-specific.","confidence":"moderate","safety_flag":"Immunocompromised caution","safety_notes":"Require strain IDs and CFU count.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"096c06ca-f1a5-5d7c-9bd6-50bbfa05de53","alias":"Multi-strain probiotics","normalized_alias":"multi_strain_probiotics"},{"id":"6a48f950-f8e6-5497-bba2-61fcdc829002","source_row_id":113,"name":"Saccharomyces boulardii","normalized_name":"saccharomyces_boulardii","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Probiotic yeast","primary_use_case":"Gut resilience / diarrhea support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9c896500-df7e-5b5f-a9a8-a89390300ce7","max_amount":10,"max_unit":"billion CFU/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Immunocompromised/central line caution","safety_notes":"Avoid in severely immunocompromised users unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"ede67f6e-b10a-556b-8e1c-d9a3f7fa50f7","alias":"Saccharomyces boulardii","normalized_alias":"saccharomyces_boulardii"},{"id":"669f0c4d-d4f1-501a-b496-a04657a70c06","source_row_id":114,"name":"Sodium butyrate","normalized_name":"sodium_butyrate","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Postbiotic / SCFA","primary_use_case":"Colon health / gut barrier","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"6d57b0f0-005d-5c9f-b701-45b27b8cd81b","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"GI caution","safety_notes":"Titrate gradually.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"b1ca7287-7f19-5ae3-88ba-226da56ee092","alias":"Sodium butyrate","normalized_alias":"sodium_butyrate"},{"id":"b95ac0c4-2996-5803-91eb-6d29be41a076","source_row_id":115,"name":"Digestive bitters","normalized_name":"digestive_bitters","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Botanical digestive aid","primary_use_case":"Digestion / appetite signaling","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3dac8323-f868-5d1a-8ad9-cef2a76b51f6","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap; blend dependent.","confidence":"low","safety_flag":"Pregnancy/gallbladder/reflux caution","safety_notes":"Requires ingredient-by-ingredient review.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"14ddd468-cd01-57a3-8d9a-1c749b233aa9","alias":"Digestive bitters","normalized_alias":"digestive_bitters"},{"id":"039c5ce1-31e4-5c17-bc1f-114e5efba0bb","source_row_id":116,"name":"Gentian","normalized_name":"gentian","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Digestive bitter herb","primary_use_case":"Digestion support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"81cb4ee3-2763-54f9-bea5-24a930c59d7c","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Ulcer/reflux/pregnancy caution","safety_notes":"Avoid in ulcer disease/reflux sensitivity.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"1856c6d9-c89f-5c52-be16-76e8cf4d7694","alias":"Gentian","normalized_alias":"gentian"},{"id":"c4ebf795-ba48-5716-a63d-d995e19eba59","source_row_id":117,"name":"Artichoke extract","normalized_name":"artichoke_extract","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Digestive / liver botanical","primary_use_case":"Bile flow / digestion","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"cda7d6ea-157b-50d4-abe7-12202d403fad","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Gallbladder/allergy caution","safety_notes":"Avoid with bile duct obstruction.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"c2e69e8c-2e72-5e88-b806-d044e6d9ff3b","alias":"Artichoke extract","normalized_alias":"artichoke_extract"},{"id":"55da9ab8-0b65-5780-ae8b-403d428363c7","source_row_id":118,"name":"Beta-alanine","normalized_name":"beta_alanine","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Performance amino acid","primary_use_case":"Endurance / buffering","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3decf7d5-0f52-5e86-8998-395a901f2694","max_amount":6400,"max_unit":"mg/day","basis_rationale":"Operational cap based on studied divided dosing.","confidence":"moderate","safety_flag":"Paresthesia caution","safety_notes":"Divide doses to reduce tingling.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"6370ff56-ca23-5482-a72d-e2b4009bbf9d","alias":"Beta-alanine","normalized_alias":"beta_alanine"},{"id":"41976380-db79-5d21-88f4-b1a40a54619b","source_row_id":119,"name":"HMB","normalized_name":"hmb","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Leucine metabolite","primary_use_case":"Muscle preservation / aging","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"f4565feb-58c5-580e-8c85-bce7d862cffd","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"Typical performance dose.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"590fa789-b48e-525a-9845-eba1bd6bf0d2","alias":"HMB","normalized_alias":"hmb"},{"id":"01a12bae-e53c-5a82-a401-ecb43c87f0fa","source_row_id":120,"name":"Electrolyte blend with trace minerals","normalized_name":"electrolyte_blend_with_trace_minerals","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Mineral blend","primary_use_case":"Hydration / performance","notes":null,"list_status":"blacklisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"87bf5357-bc16-5179-8209-d8d535f689a2","max_amount":0,"max_unit":"custom","basis_rationale":"Not a single ingredient; validate each mineral separately.","confidence":"high","safety_flag":"Formula logic required","safety_notes":"Set to 0 here; formula must break into sodium/potassium/magnesium/etc and check each ceiling.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"230ae50e-4233-59bc-ba47-ea8d9bd87eb4","alias":"Electrolyte blend with trace minerals","normalized_alias":"electrolyte_blend_with_trace_minerals"},{"id":"3cf87f3b-5365-5917-a38e-5152b1fb7768","source_row_id":121,"name":"Ecdysterone","normalized_name":"ecdysterone","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Phytoecdysteroid","primary_use_case":"Emerging muscle support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"169ea280-898e-5cfc-bf9c-0a1b4c22e9e7","max_amount":500,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Regulatory/sport caution","safety_notes":"Sports/regulatory status should be checked before use.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"358e0396-8549-5a74-8ff3-3c08ada6da76","alias":"Ecdysterone","normalized_alias":"ecdysterone"},{"id":"7e70e885-43f4-55e8-8120-6ce5dcce3beb","source_row_id":122,"name":"Tongkat Ali (Eurycoma longifolia)","normalized_name":"tongkat_ali_eurycoma_longifolia","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Herbal extract","primary_use_case":"Male vitality / testosterone support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"123c2c81-351b-5f0a-9a2b-aed6a5f6c772","max_amount":400,"max_unit":"mg/day extract","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Hormonal/liver caution","safety_notes":"Use standardized extract; avoid in hormone-sensitive conditions.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"b069357a-05c3-5c52-b3f0-d7f9460b1f5b","alias":"Tongkat Ali (Eurycoma longifolia)","normalized_alias":"tongkat_ali_eurycoma_longifolia"},{"id":"2648263d-18f3-56d7-8cd7-cf72e8e3e495","source_row_id":123,"name":"Shilajit","normalized_name":"shilajit","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Mineral resin","primary_use_case":"Mitochondrial / vitality support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"befdc999-cf9d-5694-9aba-04ebfb220c16","max_amount":500,"max_unit":"mg/day purified","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Heavy metal contamination caution","safety_notes":"Only purified, tested material; require COA.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"fd8231fe-93a3-59f2-8031-c7034951de5e","alias":"Shilajit","normalized_alias":"shilajit"},{"id":"3bb16f73-a51a-5bab-832e-3e183a1644b2","source_row_id":124,"name":"DIM (Diindolylmethane)","normalized_name":"dim_diindolylmethane","category":"Hormonal / Gender Specific","source_status":"recommended_add","ingredient_type":"Phytonutrient","primary_use_case":"Estrogen metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"750a4754-ae6d-5874-b351-3a6b1ed6fc11","max_amount":200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Hormonal/pregnancy caution","safety_notes":"Avoid pregnancy and hormone-sensitive conditions unless reviewed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"85d7ea43-f9e5-50d0-8655-cee7f6fb5619","alias":"DIM (Diindolylmethane)","normalized_alias":"dim_diindolylmethane"},{"id":"edbd6c38-9fe3-5aa0-b928-0db5f921c4d9","source_row_id":125,"name":"Vitex (Chasteberry)","normalized_name":"vitex_chasteberry","category":"Hormonal / Gender Specific","source_status":"recommended_add","ingredient_type":"Herbal extract","primary_use_case":"Female cycle support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"da2e7d4e-eea2-5db6-bf63-fbe74c7cdd9c","max_amount":40,"max_unit":"mg/day extract","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Hormonal/pregnancy/OCP caution","safety_notes":"Avoid pregnancy and hormone therapies unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"3579203e-c0fc-5cac-be51-5a36f9d4d650","alias":"Vitex (Chasteberry)","normalized_alias":"vitex_chasteberry"},{"id":"dbe1af92-998a-5f2b-844a-8cb34ab28e57","source_row_id":126,"name":"Evening primrose oil","normalized_name":"evening_primrose_oil","category":"Hormonal / Gender Specific","source_status":"recommended_add","ingredient_type":"Fatty acid / botanical oil","primary_use_case":"Female skin/PMS support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"7e81cf06-9024-54f0-9c58-ece2df76f7b5","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/seizure caution","safety_notes":"Caution with anticoagulants and seizure disorders.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"8a69abef-243f-5f8b-a911-7d86d4964dff","alias":"Evening primrose oil","normalized_alias":"evening_primrose_oil"},{"id":"888fb912-ea97-579b-a2b7-197a1f639166","source_row_id":127,"name":"Saw palmetto","normalized_name":"saw_palmetto","category":"Hormonal / Gender Specific","source_status":"recommended_add","ingredient_type":"Botanical extract","primary_use_case":"Prostate / DHT support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"ae1421ed-b9bf-5266-8ce7-1b324a505137","max_amount":320,"max_unit":"mg/day extract","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/hormonal caution","safety_notes":"Avoid before surgery; caution hormone therapies.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"015a5698-6dca-5423-adaa-6f88e6c52486","alias":"Saw palmetto","normalized_alias":"saw_palmetto"},{"id":"3b1bded1-a046-54f8-82ee-90317c36f0ad","source_row_id":128,"name":"Fenugreek extract","normalized_name":"fenugreek_extract","category":"Hormonal / Gender Specific","source_status":"recommended_add","ingredient_type":"Botanical extract","primary_use_case":"Glucose / testosterone/libido support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"852862c1-5d9d-5a91-9ed5-f9b7637fb201","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Glucose/pregnancy/allergy caution","safety_notes":"Avoid pregnancy; caution with diabetes meds.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"741552a7-4cba-5b14-8426-3247a55062a7","alias":"Fenugreek extract","normalized_alias":"fenugreek_extract"},{"id":"4dd22287-aec0-587d-8a67-a50f296d16bb","source_row_id":129,"name":"Magnesium threonate","normalized_name":"magnesium_threonate","category":"Sleep Optimization","source_status":"recommended_add","ingredient_type":"Mineral form","primary_use_case":"Brain magnesium / sleep / cognition","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c154a3a2-432c-5762-b86d-e611f4c40ca9","max_amount":2000,"max_unit":"mg/day compound","basis_rationale":"Operational cap; also enforce 350 mg/day elemental supplemental magnesium.","confidence":"moderate","safety_flag":"Magnesium UL logic","safety_notes":"Track elemental magnesium separately.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"11261e59-2114-5d36-b52e-7776235f0efb","alias":"Magnesium threonate","normalized_alias":"magnesium_threonate"},{"id":"8c92264e-c4ed-5a62-916e-3f71a6bc75ec","source_row_id":130,"name":"GABA","normalized_name":"gaba","category":"Sleep Optimization","source_status":"recommended_add","ingredient_type":"Neurotransmitter compound","primary_use_case":"Relaxation / sleep support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4492d217-941b-5901-9f8e-d57c952de676","max_amount":750,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Sedation caution","safety_notes":"Caution with sedatives/alcohol.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"46fc7b09-b690-5a42-bd62-3f24a46812e7","alias":"GABA","normalized_alias":"gaba"},{"id":"c3237767-20e1-5d2f-b2b2-c9442a2d766e","source_row_id":131,"name":"Tart cherry extract","normalized_name":"tart_cherry_extract","category":"Sleep Optimization","source_status":"recommended_add","ingredient_type":"Botanical extract","primary_use_case":"Sleep / recovery","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1978d049-cdc8-5a4e-a529-a1e1413c7f67","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Glucose/GI caution","safety_notes":"Extract standardization varies.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"cf545e98-aa07-5591-8991-58e49289b86f","alias":"Tart cherry extract","normalized_alias":"tart_cherry_extract"},{"id":"3481f58d-c561-5d5d-94f2-716aed9275be","source_row_id":132,"name":"Ceramides (oral)","normalized_name":"ceramides_oral","category":"Skin / Beauty / Anti-Aging","source_status":"recommended_add","ingredient_type":"Lipid complex","primary_use_case":"Skin hydration / barrier","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"30f6eed4-0740-520d-af43-7d9f321b3841","max_amount":70,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Use clinically studied ingredient forms.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3bf072c9-a067-5523-94e5-1c9d375b4f14","alias":"Ceramides (oral)","normalized_alias":"ceramides_oral"},{"id":"4b6364ef-29da-5b68-bca2-283657c2c317","source_row_id":133,"name":"Marine collagen peptides type I/III","normalized_name":"marine_collagen_peptides_type_i_iii","category":"Skin / Beauty / Anti-Aging","source_status":"recommended_add","ingredient_type":"Protein peptide","primary_use_case":"Skin / hair / nails / joints","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"62d8422a-537d-5144-b94f-e6b017b1f6dd","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Fish/shellfish allergy caution","safety_notes":"Consider total collagen/protein load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"153ff3f5-60a0-5702-94ba-c816ea21c343","alias":"Marine collagen peptides type I/III","normalized_alias":"marine_collagen_peptides_type_i_iii"},{"id":"616d3f0d-0646-54d4-ad30-18bc6c6208ce","source_row_id":134,"name":"Elastin peptides","normalized_name":"elastin_peptides","category":"Skin / Beauty / Anti-Aging","source_status":"recommended_add","ingredient_type":"Protein peptide","primary_use_case":"Skin elasticity","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"b77a3923-1a74-58ba-88c0-5a48e3d725e4","max_amount":200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Ingredient-specific evidence/safety varies.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"db38b8aa-7b43-5add-8b89-e7bd500a9ed5","alias":"Elastin peptides","normalized_alias":"elastin_peptides"},{"id":"0799b512-bcd3-52de-b6a3-59a23b366f11","source_row_id":135,"name":"Low molecular weight hyaluronic acid","normalized_name":"low_molecular_weight_hyaluronic_acid","category":"Skin / Beauty / Anti-Aging","source_status":"recommended_add","ingredient_type":"Glycosaminoglycan form","primary_use_case":"Skin / joints","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"bc19141c-0a90-5877-8d40-19a6b493a04e","max_amount":200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Avoid duplicate hyaluronic acid entries; track total HA.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"d2d4a263-6b41-5113-9c7a-fbe63aa19103","alias":"Low molecular weight hyaluronic acid","normalized_alias":"low_molecular_weight_hyaluronic_acid"},{"id":"3fc7016e-80cf-5c2d-9fbf-91708391fb30","source_row_id":136,"name":"Pine bark extract (Pycnogenol)","normalized_name":"pine_bark_extract_pycnogenol","category":"Skin / Beauty / Anti-Aging","source_status":"recommended_add","ingredient_type":"Polyphenol extract","primary_use_case":"Skin / circulation / antioxidant","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"fb8e64a9-5d32-5ec3-bc04-ddb7eb1bf445","max_amount":200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/autoimmune caution","safety_notes":"Caution with anticoagulants/antiplatelets.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"cf2880e1-cce0-57d4-ae8c-237683dcb7d1","alias":"Pine bark extract (Pycnogenol)","normalized_alias":"pine_bark_extract_pycnogenol"},{"id":"ebbedca4-ae2b-5b28-a1e5-549ada6ad059","source_row_id":137,"name":"Ketone esters","normalized_name":"ketone_esters","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Metabolic fuel","primary_use_case":"Performance / cognitive energy","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"46939d9f-94f8-5d2c-8bcb-0ed10a8a824c","max_amount":25000,"max_unit":"mg/day","basis_rationale":"Operational cap; product-specific.","confidence":"low","safety_flag":"GI/metabolic caution","safety_notes":"Advanced ingredient; use clinician/regulatory review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"919f541b-00b4-521e-a16d-a66bae478164","alias":"Ketone esters","normalized_alias":"ketone_esters"},{"id":"d8325c4c-5737-58e6-b35e-2c8e423e5785","source_row_id":138,"name":"Liposomal NAD boosters","normalized_name":"liposomal_nad_boosters","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Delivery technology","primary_use_case":"NAD pathway support","notes":null,"list_status":"blacklisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3a472b9e-2aea-554a-b522-04045ae9e076","max_amount":0,"max_unit":"exclude/clinician review","basis_rationale":"Not a specific ingredient; validate exact active ingredient and route.","confidence":"high","safety_flag":"Exclude automated use","safety_notes":"Set to 0 until active ingredient is specified and legally reviewed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"5f6f1e82-6b4a-509e-81c2-59fd024624e1","alias":"Liposomal NAD boosters","normalized_alias":"liposomal_nad_boosters"},{"id":"be152ac8-5b6e-5f3d-b71c-1e094b576eca","source_row_id":139,"name":"Colostrum","normalized_name":"colostrum","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Bioactive dairy compound","primary_use_case":"Gut / immune support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"8dda2af1-90f5-5d47-8113-9bc9e435744c","max_amount":5000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Dairy allergy/immunocompromised caution","safety_notes":"Use tested material; not for dairy allergy.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"b931302e-00a4-5708-a363-79c0d4a1bda4","alias":"Colostrum","normalized_alias":"colostrum"},{"id":"2892c425-6322-5619-b609-09964e51faa8","source_row_id":140,"name":"Adaptogen blend","normalized_name":"adaptogen_blend","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Combination formula","primary_use_case":"Stress resilience","notes":null,"list_status":"blacklisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"02935d24-287f-5238-87b6-a1f73fd8df07","max_amount":0,"max_unit":"exclude/blend review","basis_rationale":"Blend is not a single ingredient; check each component separately.","confidence":"high","safety_flag":"Exclude automated use","safety_notes":"Set to 0 until each component and dose are specified.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"3c5038bf-cc8d-5419-a960-5d978b1be62a","alias":"Adaptogen blend","normalized_alias":"adaptogen_blend"},{"id":"0857c1ed-58b5-559d-9919-c06103dc07f0","source_row_id":141,"name":"Methylene blue","normalized_name":"methylene_blue","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Advanced compound","primary_use_case":"Mitochondrial/cognition interest","notes":null,"list_status":"blacklisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c500b982-4068-5b81-b44f-ed1f35d9764f","max_amount":0,"max_unit":"exclude/medical review","basis_rationale":"Drug-like ingredient; not appropriate for automated supplement recommendation.","confidence":"high","safety_flag":"Serotonin syndrome/G6PD/prescription risk","safety_notes":"Exclude from consumer AI formulas unless physician/regulatory protocol approves.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"1c208a72-bdf6-53a4-bf52-1229758628e3","alias":"Methylene blue","normalized_alias":"methylene_blue"},{"id":"6c3ecde8-8075-5268-9cd8-8f140ab0b79f","source_row_id":142,"name":"Nootropic peptides","normalized_name":"nootropic_peptides","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Advanced compound class","primary_use_case":"Cognition","notes":null,"list_status":"blacklisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"ddb7476c-49ff-5fa7-bc7b-bb059685ab4c","max_amount":0,"max_unit":"exclude/medical/regulatory review","basis_rationale":"Not a defined supplement ingredient; potential drug/research chemical category.","confidence":"high","safety_flag":"Regulatory/safety risk","safety_notes":"Exclude from MattaNutra consumer supplement formulas.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"08d72361-3d2d-5ede-9e9a-49dc7f8f3837","alias":"Nootropic peptides","normalized_alias":"nootropic_peptides"}]$mattanutra_supplement_seed$::jsonb) as x(
    id uuid,
    source_row_id integer,
    name text,
    normalized_name text,
    category text,
    source_status text,
    ingredient_type text,
    primary_use_case text,
    notes text,
    list_status text,
    is_active boolean,
    source text,
    limit_id uuid,
    max_amount numeric,
    max_unit text,
    basis_rationale text,
    confidence text,
    safety_flag text,
    safety_notes text,
    source_url text,
    alias_id uuid,
    alias text,
    normalized_alias text
  )
), upserted_supplements as (
  insert into public.supplements (
    id,
    source_row_id,
    name,
    normalized_name,
    category,
    source_status,
    ingredient_type,
    primary_use_case,
    notes,
    list_status,
    is_active,
    source,
    source_payload
  )
  select
    seed.id,
    seed.source_row_id,
    seed.name,
    seed.normalized_name,
    seed.category,
    seed.source_status,
    seed.ingredient_type,
    seed.primary_use_case,
    seed.notes,
    seed.list_status,
    seed.is_active,
    seed.source,
    jsonb_build_object('seed', true, 'source_file', seed.source, 'source_row_id', seed.source_row_id)
  from seed
  on conflict (normalized_name) do update
  set
    source_row_id = excluded.source_row_id,
    name = excluded.name,
    category = excluded.category,
    source_status = excluded.source_status,
    ingredient_type = excluded.ingredient_type,
    primary_use_case = excluded.primary_use_case,
    notes = excluded.notes,
    source = excluded.source,
    source_payload = excluded.source_payload,
    updated_at = now()
  returning id, normalized_name
)
insert into public.supplement_safety_limits (
  id,
  supplement_id,
  version,
  max_amount,
  max_unit,
  basis_rationale,
  confidence,
  safety_flag,
  safety_flags,
  safety_notes,
  source_url
)
select
  seed.limit_id,
  supplements.id,
  1,
  seed.max_amount,
  seed.max_unit,
  seed.basis_rationale,
  seed.confidence,
  seed.safety_flag,
  public.mattanutra_supplement_safety_flags(
    seed.safety_flag
  ),
  seed.safety_notes,
  seed.source_url
from seed
join upserted_supplements supplements on supplements.normalized_name = seed.normalized_name
on conflict (supplement_id, version) do update
set
  max_amount = excluded.max_amount,
  max_unit = excluded.max_unit,
  basis_rationale = excluded.basis_rationale,
  confidence = excluded.confidence,
  safety_flag = excluded.safety_flag,
  safety_flags = excluded.safety_flags,
  safety_notes = excluded.safety_notes,
  source_url = excluded.source_url,
  updated_at = now();

with seed as (
  select *
  from jsonb_to_recordset($mattanutra_supplement_seed$[{"id":"df05c30c-144e-5d03-92dc-c895f7cb00c4","source_row_id":1,"name":"Vitamin A","normalized_name":"vitamin_a","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Baseline micronutrient","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"96789c48-47b0-531e-b792-18e1f60e50f2","max_amount":3000,"max_unit":"mcg RAE/day","basis_rationale":"Official adult UL; preformed retinol. Count beta-carotene separately.","confidence":"high","safety_flag":"Pregnancy/liver disease caution","safety_notes":"Do not exceed 3,000 mcg RAE preformed vitamin A unless clinician-directed.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"597ef3b1-2393-51d9-8168-5f543fff94c6","alias":"Vitamin A","normalized_alias":"vitamin_a"},{"id":"c03be7e3-33d2-5d0c-8257-cde605b5ab1e","source_row_id":2,"name":"Beta-carotene","normalized_name":"beta_carotene","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin / carotenoid","primary_use_case":"Antioxidant; vitamin A precursor","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"2389f187-128f-578b-8fb1-29d2c40e8188","max_amount":15,"max_unit":"mg/day","basis_rationale":"No official UL; conservative AI cap for supplemental beta-carotene.","confidence":"moderate","safety_flag":"Avoid in smokers/asbestos exposure","safety_notes":"High-dose beta-carotene has specific risk concerns in smokers; avoid automated high-dose use.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"1ab15f64-c1eb-59f5-badd-791095b864ff","alias":"Beta-carotene","normalized_alias":"beta_carotene"},{"id":"28975384-9c60-577e-a9c1-47ec63597b8d","source_row_id":3,"name":"Vitamin B1","normalized_name":"vitamin_b1","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Energy metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"7d8461da-40d7-5838-ba71-08d7eddf6403","max_amount":100,"max_unit":"mg/day","basis_rationale":"No official UL; operational AI cap aligned with high supplemental use / Thai updates.","confidence":"moderate","safety_flag":"Review","safety_notes":"No official adult UL; cap is internal guardrail.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/; https://exfood.fda.moph.go.th/law/data/announ_fda/49_VitaminsMinerals_E.pdf","alias_id":"5cb4a6b1-0290-5b60-bdc6-5f49f9889819","alias":"Vitamin B1","normalized_alias":"vitamin_b1"},{"id":"ad339cb4-f2b8-5cff-9b9a-1d623675144e","source_row_id":4,"name":"Vitamin B2","normalized_name":"vitamin_b2","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Energy metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"6fabf6ae-891c-51f7-9657-3403198732ec","max_amount":100,"max_unit":"mg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"No official adult UL; cap is internal guardrail.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"db272f17-852c-5d6a-9409-bec5775d4924","alias":"Vitamin B2","normalized_alias":"vitamin_b2"},{"id":"d5b9d597-5e92-500d-a691-f7e406eda7b1","source_row_id":5,"name":"Vitamin B3","normalized_name":"vitamin_b3","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Energy metabolism / NAD metabolism","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"0b6368df-1486-5939-83e4-2640425d1730","max_amount":35,"max_unit":"mg NE/day","basis_rationale":"Official adult UL for niacin from supplements/fortified foods.","confidence":"high","safety_flag":"Flushing/liver caution","safety_notes":"Use lower limits for nicotinic acid; niacinamide has different risk profile.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"8c346046-4fa4-51fe-97df-15aa5d27c0e7","alias":"Vitamin B3","normalized_alias":"vitamin_b3"},{"id":"b365988a-f6f4-5ab8-8a03-e1ed6715ae5a","source_row_id":6,"name":"Vitamin B5","normalized_name":"vitamin_b5","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Energy metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"8df90051-de60-560f-a95d-986967ed702b","max_amount":200,"max_unit":"mg/day","basis_rationale":"No official UL; conservative operational AI cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"No official adult UL; cap is internal guardrail.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"599aca25-c681-5700-8251-1412823d980d","alias":"Vitamin B5","normalized_alias":"vitamin_b5"},{"id":"ccc3e67b-d753-5315-a8cb-a8aefa8b2fd8","source_row_id":7,"name":"Vitamin B6","normalized_name":"vitamin_b6","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Methylation / neurotransmitters","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"b072c10c-4a2e-5681-92e9-af9ff6ce8a55","max_amount":12,"max_unit":"mg/day","basis_rationale":"Conservative AI cap reflecting stricter recent EU-style limits; US UL is higher.","confidence":"moderate","safety_flag":"Neuropathy caution","safety_notes":"Use conservative cap to avoid chronic high-dose B6 neuropathy risk.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"d734cc6c-0677-5748-9d5b-f535a5195e59","alias":"Vitamin B6","normalized_alias":"vitamin_b6"},{"id":"425aa5e8-9387-5439-8df5-6823058c4d21","source_row_id":8,"name":"Vitamin B7","normalized_name":"vitamin_b7","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Hair/skin/metabolism","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"37ec0268-25c0-53a8-930b-ce4aa991d3e5","max_amount":10,"max_unit":"mg/day","basis_rationale":"No official UL; operational cap.","confidence":"moderate","safety_flag":"Lab test interference","safety_notes":"Biotin can interfere with lab tests even at common supplement doses.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"a5e76bb2-11be-50ea-ba84-6d6e82a23165","alias":"Vitamin B7","normalized_alias":"vitamin_b7"},{"id":"14104f30-c896-59c6-89f1-231f477ac685","source_row_id":9,"name":"Vitamin B9","normalized_name":"vitamin_b9","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Methylation / pregnancy support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9338878d-f374-52b3-a0e5-fc52748d2313","max_amount":1000,"max_unit":"mcg DFE/day","basis_rationale":"Official adult UL for synthetic folic acid from supplements/fortified foods.","confidence":"high","safety_flag":"Masks B12 deficiency","safety_notes":"UL applies to folic acid, not naturally occurring food folate.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"97ae7830-b632-576f-b450-239a5ec7c928","alias":"Vitamin B9","normalized_alias":"vitamin_b9"},{"id":"7ddcc4f2-708f-5905-99a4-02d80e935adf","source_row_id":10,"name":"Vitamin B12","normalized_name":"vitamin_b12","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Neurologic / methylation support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"d2eaf3f8-89d1-51e9-b85d-549467f521b1","max_amount":2000,"max_unit":"mcg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"No official adult UL; very high doses should be clinician-directed.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"6a4b6961-6dbc-5683-8618-42276d760b25","alias":"Vitamin B12","normalized_alias":"vitamin_b12"},{"id":"a34da45e-fcf0-5dbd-8a0e-7d4f9fc7b71c","source_row_id":11,"name":"Vitamin C","normalized_name":"vitamin_c","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Antioxidant / immune / collagen","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"85451e3e-2d0b-52b0-a1ae-541f493523ab","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Kidney stone/GI caution","safety_notes":"Use lower cap for kidney stone history or renal disease.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"8433e553-9350-584c-874d-5b5f1ccc4063","alias":"Vitamin C","normalized_alias":"vitamin_c"},{"id":"927083fb-b90a-5a24-b4c5-5067b06ead5f","source_row_id":12,"name":"Vitamin D3","normalized_name":"vitamin_d3","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin / hormone-like","primary_use_case":"Bone, immunity","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"a49f8c06-0f27-5b71-a985-45e069296f3c","max_amount":100,"max_unit":"mcg/day","basis_rationale":"Official adult UL; equals 4,000 IU.","confidence":"high","safety_flag":"Hypercalcemia risk","safety_notes":"Check 25(OH)D/calcium if using high-dose chronic vitamin D.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"7081b8b4-617e-540a-96c3-d30f2421bcf6","alias":"Vitamin D3","normalized_alias":"vitamin_d3"},{"id":"d3b7491b-d6aa-57b0-8d1b-a03945d34b5e","source_row_id":13,"name":"Vitamin E","normalized_name":"vitamin_e","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Antioxidant","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"54a95936-cee7-5cfb-9422-540c308c0c77","max_amount":1000,"max_unit":"mg alpha-tocopherol/day","basis_rationale":"Official adult UL for supplemental alpha-tocopherol.","confidence":"high","safety_flag":"Bleeding/anticoagulant caution","safety_notes":"Use lower cap with anticoagulants or surgery.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"559adb2a-d926-558c-ae96-b658a9abac01","alias":"Vitamin E","normalized_alias":"vitamin_e"},{"id":"38de7efc-42f2-53ca-8463-130ba7c41547","source_row_id":14,"name":"Vitamin K1","normalized_name":"vitamin_k1","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Coagulation / bone","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1946c52b-a8fb-5bfc-bc31-6e4d70ab3624","max_amount":200,"max_unit":"mcg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"moderate","safety_flag":"Warfarin interaction","safety_notes":"Keep dose consistent; review for anticoagulant users.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"1e7d3353-c251-5611-a6c0-78e65d311d3d","alias":"Vitamin K1","normalized_alias":"vitamin_k1"},{"id":"8e020fbf-61f4-5b00-8537-97c117fef918","source_row_id":15,"name":"Vitamin K2","normalized_name":"vitamin_k2","category":"Vitamins","source_status":"core","ingredient_type":"Vitamin","primary_use_case":"Bone / vascular calcium routing","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"508cb57e-85e1-5a21-aa0b-6222ebb4d55a","max_amount":200,"max_unit":"mcg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"moderate","safety_flag":"Warfarin interaction","safety_notes":"Keep dose consistent; review for anticoagulant users.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"56479799-8956-58ad-942b-1744a5404f81","alias":"Vitamin K2","normalized_alias":"vitamin_k2"},{"id":"684e1966-535b-59c7-8984-ce1e68a181a0","source_row_id":16,"name":"Calcium","normalized_name":"calcium","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Bone / muscle","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9e437548-a415-5072-8246-03a4df7038ae","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Conservative adult UL range; total intake from food + supplements matters.","confidence":"high","safety_flag":"Kidney stone/cardiovascular caution","safety_notes":"For AI formulas, consider supplemental calcium much lower unless dietary intake known.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"5b19934e-2ddb-5806-8625-dc3cf51ca724","alias":"Calcium","normalized_alias":"calcium"},{"id":"199df5c4-8921-5c37-b85b-6bcb14b443fa","source_row_id":17,"name":"Magnesium","normalized_name":"magnesium","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Muscle, sleep, glucose","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c9bda72a-d39e-547c-a235-abd483875c97","max_amount":350,"max_unit":"mg/day supplemental","basis_rationale":"Official adult UL applies only to supplemental/pharmacologic magnesium, not food magnesium.","confidence":"high","safety_flag":"Diarrhea/renal disease caution","safety_notes":"Do not count food magnesium toward this supplemental UL.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"43ac364b-ce03-5f89-8b53-f634a159daf6","alias":"Magnesium","normalized_alias":"magnesium"},{"id":"38d7558c-e74b-5be0-8632-a93b6499743a","source_row_id":18,"name":"Potassium","normalized_name":"potassium","category":"Minerals","source_status":"core","ingredient_type":"Mineral / electrolyte","primary_use_case":"Blood pressure / electrolyte balance","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"fc1b14d6-9ebc-5190-8128-cd2a299bf51a","max_amount":99,"max_unit":"mg/day supplemental unsupervised","basis_rationale":"Operational cap for unsupervised supplement tablets; no simple universal adult UL.","confidence":"moderate","safety_flag":"Kidney/ACEi/ARB caution","safety_notes":"Potassium should be clinician-guided in renal disease or BP meds.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"0e49ba37-8958-5154-b3c8-204dfc7f0484","alias":"Potassium","normalized_alias":"potassium"},{"id":"a9b4fe10-4340-53bb-8719-95f29dd7204e","source_row_id":19,"name":"Sodium","normalized_name":"sodium","category":"Minerals","source_status":"core","ingredient_type":"Mineral / electrolyte","primary_use_case":"Hydration / electrolyte balance","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"f1e892a1-c55e-5f88-9ec3-b5af29acf236","max_amount":2300,"max_unit":"mg/day total","basis_rationale":"Dietary upper target, not supplement target.","confidence":"moderate","safety_flag":"Hypertension caution","safety_notes":"Avoid adding sodium unless electrolyte indication.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"935abc46-7e6c-533b-9342-1513fc39cf67","alias":"Sodium","normalized_alias":"sodium"},{"id":"e32d5277-f5c8-57a8-a0ad-c2d6319f2f01","source_row_id":20,"name":"Phosphorus","normalized_name":"phosphorus","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Bone / ATP metabolism","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3d54fe41-27fa-5cad-9183-e0f65850a3f9","max_amount":4000,"max_unit":"mg/day","basis_rationale":"Official adult UL for many adults; renal disease requires much lower individualized limits.","confidence":"high","safety_flag":"Kidney disease caution","safety_notes":"Total dietary phosphorus matters; avoid supplementation unless indicated.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"92a747eb-a974-58d0-837a-dc26a336690f","alias":"Phosphorus","normalized_alias":"phosphorus"},{"id":"6c792ecd-956a-514d-8157-86215b4351c3","source_row_id":21,"name":"Iron","normalized_name":"iron","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Anemia / oxygen transport","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3391f349-7abc-5aed-9431-fc9d33eb1d7f","max_amount":45,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Hemochromatosis/men caution","safety_notes":"Never add iron automatically for adult men or post-menopausal women without labs/clinician review.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"079b3d4e-dd84-5ba8-a0b0-c9197a9b977d","alias":"Iron","normalized_alias":"iron"},{"id":"e7f08498-3cf8-5caa-868a-27adf61afeab","source_row_id":22,"name":"Zinc","normalized_name":"zinc","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Immune / hormone support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"387d8f52-440f-5280-8d27-5d0a5fd2b4a9","max_amount":40,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Copper deficiency risk","safety_notes":"Chronic zinc near UL should trigger copper monitoring/adjustment.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"715e508e-5ea6-5877-9da8-f732c1d6fc4f","alias":"Zinc","normalized_alias":"zinc"},{"id":"795fb8b0-ffe1-5856-b3ed-9012268c1d1c","source_row_id":23,"name":"Copper","normalized_name":"copper","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Iron metabolism / antioxidant enzymes","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e1f61506-44c8-5995-aa50-2bd51429ad22","max_amount":10,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Wilson disease caution","safety_notes":"Avoid in Wilson disease/liver disease unless clinician-directed.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"1011189e-7dc4-59f2-a8d3-8585ff572637","alias":"Copper","normalized_alias":"copper"},{"id":"783b46dc-be55-55a9-bc43-6a15a1bfdb80","source_row_id":24,"name":"Manganese","normalized_name":"manganese","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Bone / enzymes","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4b8fa15b-c19b-5f31-addd-3b38a6c4b3a3","max_amount":11,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Neurologic risk","safety_notes":"Avoid high-dose chronic use.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"1256dd9c-baef-565c-b745-3caebf46a685","alias":"Manganese","normalized_alias":"manganese"},{"id":"39c199df-0a23-593a-aa84-8526cf6cc260","source_row_id":25,"name":"Selenium","normalized_name":"selenium","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Thyroid / antioxidant enzymes","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4f9a4d28-11ec-5cda-8ad0-238bc99d1912","max_amount":400,"max_unit":"mcg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Selenosis risk","safety_notes":"Avoid stacking with multi-vitamins/Brazil nut intake.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"dd3853ff-8563-568d-a20f-3ff0851a4bbc","alias":"Selenium","normalized_alias":"selenium"},{"id":"22811ba3-fc72-5962-88e0-f78e5a2976f1","source_row_id":26,"name":"Chromium","normalized_name":"chromium","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Glucose metabolism","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"483690b1-0a99-56ad-83e5-8d0ebce684f5","max_amount":1000,"max_unit":"mcg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"moderate","safety_flag":"Diabetes/renal caution","safety_notes":"May interact with glucose-lowering therapy.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"0c1620d0-aa24-500f-a74a-2204e6d2884d","alias":"Chromium","normalized_alias":"chromium"},{"id":"6b1cf50a-5f53-5e76-83a7-63d15a212793","source_row_id":27,"name":"Molybdenum","normalized_name":"molybdenum","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Sulfur/amino acid metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"858b55c0-cd3b-5ff7-9586-0dafb1232bfd","max_amount":2000,"max_unit":"mcg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Review","safety_notes":"Rarely needed as standalone supplement.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"58141875-76d7-5cc2-a3a8-f01a91b12523","alias":"Molybdenum","normalized_alias":"molybdenum"},{"id":"db9d5e20-6b6e-567f-91b2-12c6c3b6db9b","source_row_id":28,"name":"Iodine","normalized_name":"iodine","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Thyroid","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"fd775096-0e58-5521-8574-71140b3a9b19","max_amount":1100,"max_unit":"mcg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Thyroid disease caution","safety_notes":"Avoid automated iodine in thyroid disease or thyroid medication users.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"561f4010-a688-5e11-8ef3-d69d792136ba","alias":"Iodine","normalized_alias":"iodine"},{"id":"61a870f9-f1a4-52b4-9df8-1ae2f44d3bf6","source_row_id":29,"name":"Boron","normalized_name":"boron","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Bone / hormone support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"72e8c0a5-d43d-524b-a3fd-e9caa86ef5e5","max_amount":20,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Review","safety_notes":"Use lower routine doses; high doses not appropriate for general consumers.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"06102168-955d-5512-8dcf-cdffa40c6940","alias":"Boron","normalized_alias":"boron"},{"id":"f5614a74-cb27-5f37-9d58-b5ff819cc412","source_row_id":30,"name":"Silicon","normalized_name":"silicon","category":"Minerals","source_status":"core","ingredient_type":"Mineral","primary_use_case":"Skin/hair/bone support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"7afbaa99-e953-5082-8dec-fd6612cf3afd","max_amount":20,"max_unit":"mg/day","basis_rationale":"No official UL; operational AI cap.","confidence":"low","safety_flag":"Review","safety_notes":"No universal UL; use conservative cap.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"32d19ab8-fc0d-5a71-acc4-d1ff10f4453e","alias":"Silicon","normalized_alias":"silicon"},{"id":"82ce3845-7a7a-538d-a45e-b2e9ae5ddfe1","source_row_id":31,"name":"L-Carnitine","normalized_name":"l_carnitine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid derivative","primary_use_case":"Fatty acid transport / energy","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e6bf0fcc-4f56-5bb0-bb8a-468621c76c06","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Common studied supplemental upper operational cap.","confidence":"moderate","safety_flag":"TMAO/GI caution","safety_notes":"Avoid high-dose chronic use without review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"efa6f53f-c2b7-58d9-ae14-839aae5f14e7","alias":"L-Carnitine","normalized_alias":"l_carnitine"},{"id":"fd4ff448-c276-56f1-8c4e-ad94d1ae0caa","source_row_id":32,"name":"L-Arginine","normalized_name":"l_arginine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Nitric oxide / circulation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3ef6c316-06f3-58cd-90dc-60b172e7a3f7","max_amount":6000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"BP/HSV/nitrates caution","safety_notes":"Avoid with nitrates/PDE5 meds, low BP, active herpes unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"93a6ac96-829a-50b6-be05-5860f898a802","alias":"L-Arginine","normalized_alias":"l_arginine"},{"id":"1f2f2b89-2edc-54b3-84f6-c73c781f74b5","source_row_id":33,"name":"L-Lysine","normalized_name":"l_lysine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Protein / immune support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"df567bac-ea5b-5b4c-a752-effd18fcb5ba","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"Kidney caution","safety_notes":"High-dose amino acids should be reviewed in renal disease.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"0b2c372d-e17a-5b23-835b-8430a3f83b0b","alias":"L-Lysine","normalized_alias":"l_lysine"},{"id":"70835fa3-1b3f-51a0-8a36-661cdcc0b660","source_row_id":34,"name":"L-Leucine","normalized_name":"l_leucine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Muscle protein synthesis","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1912e56a-7fcc-584c-ae4c-75382eb0b835","max_amount":5000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"low","safety_flag":"Kidney/liver caution","safety_notes":"Consider total BCAA load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"b634cbc0-fa9a-547d-9b2f-20e9c399e120","alias":"L-Leucine","normalized_alias":"l_leucine"},{"id":"b93d0360-cbd9-5686-967a-854078ca162c","source_row_id":35,"name":"L-Isoleucine","normalized_name":"l_isoleucine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Muscle / glucose metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"fbc564e3-be92-5720-901a-1dc454e48bed","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"low","safety_flag":"Kidney/liver caution","safety_notes":"Consider total BCAA load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"1348c131-b44f-54d1-b30c-0f1bc96644a4","alias":"L-Isoleucine","normalized_alias":"l_isoleucine"},{"id":"c431a419-b65b-5413-bf77-a449cd333317","source_row_id":36,"name":"L-Valine","normalized_name":"l_valine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Muscle / energy","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1f4d4806-daa8-5204-a5f0-3b6f79f512b7","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"low","safety_flag":"Kidney/liver caution","safety_notes":"Consider total BCAA load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"08202d5d-caf6-54af-95f2-42dbef9c7cfb","alias":"L-Valine","normalized_alias":"l_valine"},{"id":"721287b1-188d-5a75-bb1e-3644b42c396f","source_row_id":37,"name":"L-Glutamine","normalized_name":"l_glutamine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Gut / recovery","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"17f498a9-b7d6-5e0f-abf3-6bc58fb68073","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"Liver/kidney caution","safety_notes":"Avoid in severe liver/kidney disease unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"765fbe4a-5dec-53fb-873b-738bedaf6644","alias":"L-Glutamine","normalized_alias":"l_glutamine"},{"id":"0da3a410-75bd-5943-b2ae-db08beed39e3","source_row_id":38,"name":"L-Taurine","normalized_name":"l_taurine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid-like","primary_use_case":"Cardio / nervous system / bile acids","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"6196d6ca-78ba-5ffc-ba79-e16f6a7e396b","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"Higher doses may be studied, but use conservative AI ceiling.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"c55b5134-7846-5376-af3e-47cab228d314","alias":"L-Taurine","normalized_alias":"l_taurine"},{"id":"b0ffbdb1-1a75-50bb-b002-d2f7ce0d4aff","source_row_id":39,"name":"L-Methionine","normalized_name":"l_methionine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Methylation / protein","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e5962cbd-81a7-59d1-876d-21542f733369","max_amount":1500,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Homocysteine caution","safety_notes":"Avoid high-dose use unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"af947289-7f89-578f-8bd0-e2482734803a","alias":"L-Methionine","normalized_alias":"l_methionine"},{"id":"d2d85db6-e5b5-51b7-89ae-66519334bce7","source_row_id":40,"name":"L-Cysteine","normalized_name":"l_cysteine","category":"Amino Acids","source_status":"core","ingredient_type":"Amino acid","primary_use_case":"Glutathione precursor","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"04037c60-0d01-5af2-bd7a-6bc4ecee6a6a","max_amount":1500,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Consider NAC separately; cysteine dosing needs form-specific review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"c1cd34b7-2fa2-5c44-9acc-15c84d613039","alias":"L-Cysteine","normalized_alias":"l_cysteine"},{"id":"2325feda-1356-58e1-83e9-06e831a1bc7c","source_row_id":41,"name":"CoQ10","normalized_name":"coq10","category":"Antioxidants","source_status":"core","ingredient_type":"Antioxidant / mitochondrial","primary_use_case":"Mitochondria / statin users","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"b2da7591-031b-5509-9e8a-c91710719e22","max_amount":1200,"max_unit":"mg/day","basis_rationale":"Operational cap from common studied ranges.","confidence":"moderate","safety_flag":"Warfarin interaction possible","safety_notes":"Review anticoagulant users.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"1d0890cc-edf9-5bd6-bd72-e5b3bf5739da","alias":"CoQ10","normalized_alias":"coq10"},{"id":"58f70851-02ed-5c53-ba36-3b72d1e0809f","source_row_id":42,"name":"Alpha-lipoic acid","normalized_name":"alpha_lipoic_acid","category":"Antioxidants","source_status":"core","ingredient_type":"Antioxidant","primary_use_case":"Glucose / neuropathy support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"693b5787-d851-54b9-8cb5-e7fc6c76b6cc","max_amount":1200,"max_unit":"mg/day","basis_rationale":"Operational cap from common studied ranges.","confidence":"moderate","safety_flag":"Glucose/thyroid caution","safety_notes":"Use caution with diabetes medications.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"9a35af44-9ab5-5527-bef5-36ec687aa3cf","alias":"Alpha-lipoic acid","normalized_alias":"alpha_lipoic_acid"},{"id":"c2f07bb0-d732-5652-b64e-8c6de377065f","source_row_id":43,"name":"Glutathione","normalized_name":"glutathione","category":"Antioxidants","source_status":"core","ingredient_type":"Antioxidant","primary_use_case":"Detox / oxidative stress","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"34d391cf-740b-5f69-99dc-299729499d33","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"low","safety_flag":"Review","safety_notes":"Bioavailability varies by form.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"9076fcbe-f7ed-59c8-8efc-37cc09da0b2a","alias":"Glutathione","normalized_alias":"glutathione"},{"id":"850c764a-bb47-5818-8fdf-b10422f0b517","source_row_id":44,"name":"Resveratrol","normalized_name":"resveratrol","category":"Antioxidants","source_status":"core","ingredient_type":"Polyphenol","primary_use_case":"Longevity / vascular health","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"8f6b2f5b-48e2-583e-9934-e8bb0cc6c89f","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"Bleeding/drug interaction caution","safety_notes":"Avoid high dose with anticoagulants/antiplatelets.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"be28f58e-19ec-5575-a88f-6680dea0347f","alias":"Resveratrol","normalized_alias":"resveratrol"},{"id":"8a1ce673-2aa3-5ee5-9a4d-033fa19b7c9d","source_row_id":45,"name":"Quercetin","normalized_name":"quercetin","category":"Antioxidants","source_status":"core","ingredient_type":"Polyphenol","primary_use_case":"Immune / allergy / senolytic pairing","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1ff67799-6e83-56c0-9c3b-16b9ba3de92e","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"Kidney/drug interaction caution","safety_notes":"Avoid high-dose chronic use without review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"45203152-3d7b-5774-8cec-21df7a9d49ef","alias":"Quercetin","normalized_alias":"quercetin"},{"id":"7dd80148-b88a-5583-85a0-07a41d5a88e2","source_row_id":46,"name":"Lycopene","normalized_name":"lycopene","category":"Antioxidants","source_status":"core","ingredient_type":"Carotenoid","primary_use_case":"Prostate / antioxidant","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"2c6dc080-1e0b-58fd-80ef-ac3c3dcef109","max_amount":30,"max_unit":"mg/day","basis_rationale":"Operational cap based on common supplemental use.","confidence":"moderate","safety_flag":"Review","safety_notes":"No official UL.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3b9a7074-be7f-5cd1-8d87-386b1546d4b6","alias":"Lycopene","normalized_alias":"lycopene"},{"id":"6309a5ff-b090-5c27-a5a8-d801aa4df1f4","source_row_id":47,"name":"Astaxanthin","normalized_name":"astaxanthin","category":"Antioxidants","source_status":"core","ingredient_type":"Carotenoid","primary_use_case":"Skin / eye / antioxidant","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e9d6cc61-2136-5c6b-adbd-d85d2b47c366","max_amount":12,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"Use reputable standardized product.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"fe6763c7-9c24-5ef7-987b-26b7a88ed070","alias":"Astaxanthin","normalized_alias":"astaxanthin"},{"id":"9635ae95-9d40-5400-baf0-6cece0739711","source_row_id":48,"name":"Curcumin","normalized_name":"curcumin","category":"Antioxidants","source_status":"core","ingredient_type":"Polyphenol","primary_use_case":"Inflammation / joint","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3a7d022c-634a-5d7b-850a-58fbad9ebf5c","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"moderate","safety_flag":"Gallbladder/bleeding caution","safety_notes":"Interactions possible; piperine changes exposure.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"a593a0c8-8291-543b-b91f-3a79bcc92316","alias":"Curcumin","normalized_alias":"curcumin"},{"id":"d3732350-4b54-5816-b99f-89751ab061e0","source_row_id":49,"name":"Ginseng","normalized_name":"ginseng","category":"Herbals","source_status":"core","ingredient_type":"Herbal / adaptogen","primary_use_case":"Energy / cognition","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"f486fa40-2d9d-5db9-90f3-b6b2744daf65","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap; form/extract dependent.","confidence":"moderate","safety_flag":"BP/diabetes/warfarin caution","safety_notes":"Standardization matters; avoid automatic use with warfarin.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"fbf4f5fd-3821-548a-9ba5-09a38a59d263","alias":"Ginseng","normalized_alias":"ginseng"},{"id":"75f265a4-d650-5636-8b9e-985152228887","source_row_id":50,"name":"Ashwagandha","normalized_name":"ashwagandha","category":"Herbals","source_status":"core","ingredient_type":"Herbal / adaptogen","primary_use_case":"Stress / sleep / hormone support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e77d4bcf-9384-5fc1-932b-82dea2c88443","max_amount":600,"max_unit":"mg/day","basis_rationale":"Conservative operational cap for root extract.","confidence":"moderate","safety_flag":"Pregnancy/liver/thyroid caution","safety_notes":"Avoid in pregnancy; rare liver injury reports require warning.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"db1f4d5d-804d-5522-bcb1-b6891111ab1b","alias":"Ashwagandha","normalized_alias":"ashwagandha"},{"id":"aadcef40-774e-5317-a072-561ed056f22b","source_row_id":51,"name":"Rhodiola","normalized_name":"rhodiola","category":"Herbals","source_status":"core","ingredient_type":"Herbal / adaptogen","primary_use_case":"Fatigue / stress resilience","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"50c5091d-2504-5655-a193-653c9be7e886","max_amount":600,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Stimulant/bipolar caution","safety_notes":"Avoid with mania/bipolar history unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"6aecbc6a-478b-5357-8c2e-5e2f73ba87b0","alias":"Rhodiola","normalized_alias":"rhodiola"},{"id":"ef482200-464b-5e8f-a4c2-5a1c34017d10","source_row_id":52,"name":"Ginkgo","normalized_name":"ginkgo","category":"Herbals","source_status":"core","ingredient_type":"Herbal","primary_use_case":"Cognition / circulation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"039617e2-e865-5805-8523-f7b43fc9ce7e","max_amount":240,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/seizure caution","safety_notes":"Avoid with anticoagulants/antiplatelets unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"2b0e9543-9192-5342-8b1b-d08fe54dea92","alias":"Ginkgo","normalized_alias":"ginkgo"},{"id":"88ce039c-88bc-5b9d-9189-d5870ec17207","source_row_id":53,"name":"Milk thistle","normalized_name":"milk_thistle","category":"Herbals","source_status":"core","ingredient_type":"Herbal","primary_use_case":"Liver support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"afe82f1c-1e73-532d-8236-05262c137b1a","max_amount":700,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Allergy/drug interaction caution","safety_notes":"Extract standardization matters.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"a8b398c7-ae36-5e68-83e6-bbb2ad02aa6d","alias":"Milk thistle","normalized_alias":"milk_thistle"},{"id":"0a1f370a-3886-5218-b262-0b092f861e0a","source_row_id":54,"name":"Turmeric","normalized_name":"turmeric","category":"Herbals","source_status":"core","ingredient_type":"Herbal","primary_use_case":"Inflammation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"273b8982-d151-5db8-8241-3293bdd79691","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Operational cap; curcumin content varies.","confidence":"moderate","safety_flag":"Gallbladder/bleeding caution","safety_notes":"Avoid duplicating with curcumin unless total curcuminoids tracked.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"c9664282-c224-5988-bf7b-bc0964f78413","alias":"Turmeric","normalized_alias":"turmeric"},{"id":"8598f3b9-191d-54ce-88a4-4a2cdd85a873","source_row_id":55,"name":"Ginger","normalized_name":"ginger","category":"Herbals","source_status":"core","ingredient_type":"Herbal","primary_use_case":"GI / nausea / inflammation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"336a860b-fb99-5ee4-b7ca-ed4cc3dfcbdf","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/reflux caution","safety_notes":"Use caution with anticoagulants and before surgery.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"460d735a-a35f-5879-b133-eb4da68494ef","alias":"Ginger","normalized_alias":"ginger"},{"id":"21d71624-7572-543d-8f31-945cafdebdb4","source_row_id":56,"name":"Garlic","normalized_name":"garlic","category":"Herbals","source_status":"core","ingredient_type":"Herbal","primary_use_case":"Cardiometabolic / immune","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"63d0b8b5-1060-5997-ac67-9fc121dcd96d","max_amount":1200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/BP caution","safety_notes":"Use caution with anticoagulants/antiplatelets.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"bd05ca72-77a0-559a-8f92-e00ca8512d26","alias":"Garlic","normalized_alias":"garlic"},{"id":"26ffbe5c-92f8-5e9f-80e1-9cdf492b5510","source_row_id":57,"name":"Choline","normalized_name":"choline","category":"Functional","source_status":"core","ingredient_type":"Functional nutrient","primary_use_case":"Brain / liver / methylation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"bdfb250b-9aa0-5fd4-810c-5a29b789de0d","max_amount":3500,"max_unit":"mg/day","basis_rationale":"Official adult UL.","confidence":"high","safety_flag":"Fishy odor/hypotension caution","safety_notes":"Total choline intake matters.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"d07f2a3b-f509-5c72-ae4c-30ad0ea1b75a","alias":"Choline","normalized_alias":"choline"},{"id":"6c23cf7c-4045-5d64-95c8-e31b611a29b4","source_row_id":58,"name":"Inositol","normalized_name":"inositol","category":"Functional","source_status":"core","ingredient_type":"Functional nutrient","primary_use_case":"Metabolic / mood / PCOS support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"74b083a2-060f-5ece-af22-d5099bfffb4e","max_amount":4000,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"moderate","safety_flag":"GI caution","safety_notes":"Higher doses may be used clinically but should be supervised.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"8b1413d8-d6e3-5088-ba9a-534cf533ff5c","alias":"Inositol","normalized_alias":"inositol"},{"id":"fb1c10b0-58d5-5c60-83ae-c2f73fb8b310","source_row_id":59,"name":"Creatine","normalized_name":"creatine","category":"Functional","source_status":"core","ingredient_type":"Performance / brain","primary_use_case":"Muscle / cognition / aging","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"03f1674d-3e07-5d71-b535-41853bc15a1e","max_amount":5000,"max_unit":"mg/day","basis_rationale":"Operational cap for routine maintenance.","confidence":"moderate","safety_flag":"Kidney caution","safety_notes":"Renal disease requires clinician review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3696b2c2-7309-5ab4-94e4-7af03638290d","alias":"Creatine","normalized_alias":"creatine"},{"id":"87e3548a-8eb8-5a10-9ba2-a3a880c3970e","source_row_id":60,"name":"NAD+ precursors","normalized_name":"nad_precursors","category":"Functional","source_status":"core","ingredient_type":"Longevity / cellular energy","primary_use_case":"NAD pathway","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"d739b2f1-98a6-5172-abe3-c0454301d43b","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap; ingredient form must be specified.","confidence":"moderate","safety_flag":"Review","safety_notes":"Do not combine multiple NAD boosters without summing total.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"d5801e0c-ea75-5aab-984f-2302c8befe81","alias":"NAD+ precursors","normalized_alias":"nad_precursors"},{"id":"6a33eb4f-77ff-5525-8b3f-85fdbdd34abc","source_row_id":61,"name":"Phosphatidylserine","normalized_name":"phosphatidylserine","category":"Functional","source_status":"core","ingredient_type":"Phospholipid","primary_use_case":"Cognition / stress","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4ca5ee29-aaca-574d-855b-b947e4770ff7","max_amount":300,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"Typical cognitive supplement range.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"7e8bda5b-d033-5a64-925e-3b1a0c11150c","alias":"Phosphatidylserine","normalized_alias":"phosphatidylserine"},{"id":"9da42d1d-24f5-56d2-bd62-5ea45adfcc4b","source_row_id":62,"name":"Omega-3","normalized_name":"omega_3","category":"Fatty Acids","source_status":"core","ingredient_type":"Fatty acid","primary_use_case":"Cardio / brain / inflammation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"182848fa-140e-5103-80c1-ae5be90a694b","max_amount":3000,"max_unit":"mg/day EPA+DHA","basis_rationale":"Conservative cap for combined EPA+DHA from supplements.","confidence":"moderate","safety_flag":"Bleeding/AFib caution","safety_notes":"Use lower cap with anticoagulants or arrhythmia history.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"2fc465a3-effe-5b4d-be62-dd44378e0c0e","alias":"Omega-3","normalized_alias":"omega_3"},{"id":"885c74ed-104b-5eb8-8f69-030f33553379","source_row_id":63,"name":"Omega-6","normalized_name":"omega_6","category":"Fatty Acids","source_status":"core","ingredient_type":"Fatty acid","primary_use_case":"Essential fatty acid balance","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"759173e1-5114-5e72-ae00-19291ab6323c","max_amount":5000,"max_unit":"mg/day supplemental","basis_rationale":"Operational cap; no universal supplement UL.","confidence":"low","safety_flag":"Review","safety_notes":"Avoid unnecessary omega-6 supplementation if dietary intake is high.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"87146a43-dce2-5dc6-9675-3bed6c08f136","alias":"Omega-6","normalized_alias":"omega_6"},{"id":"b7226046-2217-5bbc-98d6-d817ed4d18b2","source_row_id":64,"name":"Omega-9","normalized_name":"omega_9","category":"Fatty Acids","source_status":"core","ingredient_type":"Fatty acid","primary_use_case":"Cardiometabolic","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"79023bfe-70ba-5550-99a2-840ad9df849f","max_amount":5000,"max_unit":"mg/day supplemental","basis_rationale":"Operational cap; no universal supplement UL.","confidence":"low","safety_flag":"Review","safety_notes":"Usually food-derived; supplement rarely necessary.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"099baa41-1061-577a-8db6-520fe903c824","alias":"Omega-9","normalized_alias":"omega_9"},{"id":"71e61cb6-19bf-5cc8-8bb8-da4280a6e579","source_row_id":65,"name":"Inulin","normalized_name":"inulin","category":"Gut Health","source_status":"core","ingredient_type":"Prebiotic fiber","primary_use_case":"Microbiome","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"bf1a5930-6151-5e1d-b72b-4f8fecea5b50","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational fiber cap for tolerability.","confidence":"moderate","safety_flag":"GI/FODMAP caution","safety_notes":"Titrate gradually.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"d419d898-333e-5be5-b32b-1ab2836ffbe8","alias":"Inulin","normalized_alias":"inulin"},{"id":"4c1868b3-32f4-5538-8424-0ef637512e0a","source_row_id":66,"name":"FOS","normalized_name":"fos","category":"Gut Health","source_status":"core","ingredient_type":"Prebiotic fiber","primary_use_case":"Microbiome","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"a6129d2c-aa0a-5507-a92d-3ee344eecce4","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational fiber cap for tolerability.","confidence":"moderate","safety_flag":"GI/FODMAP caution","safety_notes":"Titrate gradually.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"17f81b05-277a-55fd-af94-89603bb3ebaa","alias":"FOS","normalized_alias":"fos"},{"id":"3114522b-bcaa-5dee-b469-7f9c794ce217","source_row_id":67,"name":"GOS","normalized_name":"gos","category":"Gut Health","source_status":"core","ingredient_type":"Prebiotic fiber","primary_use_case":"Microbiome","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"6e08a143-f09f-5cb9-a94c-8cdbd6dec143","max_amount":5000,"max_unit":"mg/day","basis_rationale":"Operational cap for tolerability.","confidence":"low","safety_flag":"GI/FODMAP caution","safety_notes":"Titrate gradually.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"ceba74bd-3c43-5c20-af6f-a257185bd721","alias":"GOS","normalized_alias":"gos"},{"id":"4019dcc8-b77b-5ef5-850f-b9b7157d0dad","source_row_id":68,"name":"Pectin","normalized_name":"pectin","category":"Gut Health","source_status":"core","ingredient_type":"Prebiotic fiber","primary_use_case":"Microbiome / cholesterol","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3b07c8ab-057b-57d5-bbd8-84a4bd147395","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational fiber cap.","confidence":"low","safety_flag":"GI/med absorption caution","safety_notes":"Separate from medications.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"472e0ea0-526a-543b-adf6-d83f0c963b3b","alias":"Pectin","normalized_alias":"pectin"},{"id":"091a783e-9f1a-5435-acb4-2cf53ca0a16e","source_row_id":69,"name":"Psyllium","normalized_name":"psyllium","category":"Gut Health","source_status":"core","ingredient_type":"Fiber","primary_use_case":"Cholesterol / glucose / bowel regularity","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"5c360f03-6f19-5b2c-aaa2-82caa90dcbdd","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational fiber cap.","confidence":"moderate","safety_flag":"Choking/med absorption caution","safety_notes":"Must take with adequate water; separate medications.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"51dbed65-344c-5392-b415-a5819c8f0168","alias":"Psyllium","normalized_alias":"psyllium"},{"id":"5537ed8d-b3ce-5b75-b875-7efed0cfb181","source_row_id":70,"name":"Bromelain","normalized_name":"bromelain","category":"Enzymes","source_status":"core","ingredient_type":"Enzyme","primary_use_case":"Protein digestion / inflammation","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c72d815b-264c-5c1e-af9e-c4c05648651f","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap; activity units also matter.","confidence":"low","safety_flag":"Bleeding/allergy caution","safety_notes":"Validate by activity units and extract quality.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"1944f26a-f579-557d-aa80-4c28a40bb31e","alias":"Bromelain","normalized_alias":"bromelain"},{"id":"f72cef12-799b-51c6-b8e6-de07cd9491a3","source_row_id":71,"name":"Papain","normalized_name":"papain","category":"Enzymes","source_status":"core","ingredient_type":"Enzyme","primary_use_case":"Protein digestion","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"79852adb-018e-5f1a-add3-027bc1097d9f","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap; activity units also matter.","confidence":"low","safety_flag":"Allergy caution","safety_notes":"Validate by activity units; avoid in latex/papaya allergy.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"8ac0d2fe-5230-5912-b9ca-c721cdf06604","alias":"Papain","normalized_alias":"papain"},{"id":"4449efe8-19a9-5acc-9a8d-ca7c7cb1db31","source_row_id":72,"name":"Amylase","normalized_name":"amylase","category":"Enzymes","source_status":"core","ingredient_type":"Enzyme","primary_use_case":"Carbohydrate digestion","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"735395a3-f38e-57f8-99d4-7d67bc2abb1c","max_amount":250,"max_unit":"mg/day","basis_rationale":"Placeholder mg cap; enzyme activity units required.","confidence":"low","safety_flag":"Review","safety_notes":"Do not rely on mg only; use FCC/USP activity limits by product.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"ee6db506-25d2-545a-94a3-86b67fa02d5c","alias":"Amylase","normalized_alias":"amylase"},{"id":"7da68318-b2d3-5abb-893d-628b4edf3017","source_row_id":73,"name":"Lipase","normalized_name":"lipase","category":"Enzymes","source_status":"core","ingredient_type":"Enzyme","primary_use_case":"Fat digestion","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c02d2ca7-12ba-50c5-9c6f-38f6b65c9271","max_amount":250,"max_unit":"mg/day","basis_rationale":"Placeholder mg cap; enzyme activity units required.","confidence":"low","safety_flag":"Review","safety_notes":"Do not rely on mg only; use FCC/USP activity limits by product.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"904277ae-2b70-5a2c-a019-f577d372682e","alias":"Lipase","normalized_alias":"lipase"},{"id":"828b293c-8709-590f-aeb1-6f76166d6fcf","source_row_id":74,"name":"Protease","normalized_name":"protease","category":"Enzymes","source_status":"core","ingredient_type":"Enzyme","primary_use_case":"Protein digestion","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"70c9f6e4-8859-5102-853e-95c1cc90f7f2","max_amount":250,"max_unit":"mg/day","basis_rationale":"Placeholder mg cap; enzyme activity units required.","confidence":"low","safety_flag":"Review","safety_notes":"Do not rely on mg only; use FCC/USP activity limits by product.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"f37ee10f-cc06-517f-be1c-55171d61d847","alias":"Protease","normalized_alias":"protease"},{"id":"be826295-ec35-5dc9-8477-5ecd5f59a8f3","source_row_id":75,"name":"Spermidine","normalized_name":"spermidine","category":"Longevity","source_status":"core","ingredient_type":"Longevity compound","primary_use_case":"Autophagy / healthy aging","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"7df7493d-0ee7-55f9-9be9-53178f5c9acf","max_amount":6,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Use food-derived/standardized material only.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"06f7a3ce-c2c3-5795-84ca-a1ba3eb97319","alias":"Spermidine","normalized_alias":"spermidine"},{"id":"f2ecd858-ff2a-5dff-b225-68d615a69b1f","source_row_id":76,"name":"Collagen","normalized_name":"collagen","category":"Longevity","source_status":"core","ingredient_type":"Protein / peptide","primary_use_case":"Skin / joints","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"74985f02-1bc3-5caa-bfe5-c4aa0921dc1c","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational cap for collagen peptides.","confidence":"moderate","safety_flag":"Protein/kidney caution","safety_notes":"Consider total protein load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3a7fea1f-f43f-51b8-94b4-589f738d8d0d","alias":"Collagen","normalized_alias":"collagen"},{"id":"c7c3b9dd-2bd7-50d2-81aa-217c0d44be6a","source_row_id":77,"name":"Hyaluronic acid","normalized_name":"hyaluronic_acid","category":"Longevity","source_status":"core","ingredient_type":"Glycosaminoglycan","primary_use_case":"Skin / joints","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"730e9e82-6d06-5ed1-9068-37a0db5ad83b","max_amount":200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Form and MW matter.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"4f169958-4558-50c1-9d2e-5c95f8ba4ca6","alias":"Hyaluronic acid","normalized_alias":"hyaluronic_acid"},{"id":"159491f9-3a74-51ef-b9e4-55e87567e41c","source_row_id":78,"name":"MSM","normalized_name":"msm","category":"Longevity","source_status":"core","ingredient_type":"Sulfur compound","primary_use_case":"Joint / connective tissue","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"695bf60b-e4e4-5d7f-a2ad-9584b9be1823","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"GI/headache caution","safety_notes":"Avoid high-dose unsupervised use.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"f50ccc4e-b817-5493-8ab6-1df289cfa0cd","alias":"MSM","normalized_alias":"msm"},{"id":"0389528a-10fe-5185-a94b-d4cecddf0aa9","source_row_id":79,"name":"Glucosamine","normalized_name":"glucosamine","category":"Longevity","source_status":"core","ingredient_type":"Joint compound","primary_use_case":"Joint support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"dc9b9ba9-d8f2-5bcf-939b-bca477124f27","max_amount":1500,"max_unit":"mg/day","basis_rationale":"Common supplemental cap.","confidence":"moderate","safety_flag":"Shellfish/warfarin/glucose caution","safety_notes":"Use caution with warfarin and shellfish allergy.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"d54e9d09-8de5-5472-818f-e7dc7f6fa95f","alias":"Glucosamine","normalized_alias":"glucosamine"},{"id":"28bcfb7f-a09e-5dd1-9187-c31d6f384a3a","source_row_id":80,"name":"Melatonin","normalized_name":"melatonin","category":"Longevity","source_status":"core","ingredient_type":"Sleep hormone","primary_use_case":"Sleep timing","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"227aafdc-edf7-51c4-8367-4baa36c148ad","max_amount":5,"max_unit":"mg/day","basis_rationale":"Conservative consumer AI cap.","confidence":"moderate","safety_flag":"Sedation/children/pregnancy caution","safety_notes":"Avoid high-dose chronic automated recommendations.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"949260ed-2e46-5ade-9eae-257ba1c31645","alias":"Melatonin","normalized_alias":"melatonin"},{"id":"8c6bbc4c-5046-5fc3-9516-27a3c8c7a178","source_row_id":81,"name":"Theanine","normalized_name":"theanine","category":"Longevity","source_status":"core","ingredient_type":"Amino acid derivative","primary_use_case":"Calm focus / sleep","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1c3456b0-aa40-5953-92b2-799104063840","max_amount":400,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Sedation caution","safety_notes":"Caution with sedatives.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"9a8ba474-9a71-55c1-9186-78849e0718d6","alias":"Theanine","normalized_alias":"theanine"},{"id":"0e1aff20-f862-5073-b379-b55933c339c9","source_row_id":82,"name":"Lion’s Mane (Hericium erinaceus)","normalized_name":"lion_s_mane_hericium_erinaceus","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Cognition / nerve growth factor support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"28b4b6c8-49a7-50f5-985b-449bf69979ff","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap; extract/fruiting body dependent.","confidence":"low","safety_flag":"Allergy/asthma caution","safety_notes":"Require beta-glucan/extract specification for product formulas.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"07ec304f-019f-5836-81cd-2179fe1ec86a","alias":"Lion’s Mane (Hericium erinaceus)","normalized_alias":"lion_s_mane_hericium_erinaceus"},{"id":"e3a93b74-5184-5b98-aecd-c9cede2e1ead","source_row_id":83,"name":"Reishi (Ganoderma lucidum)","normalized_name":"reishi_ganoderma_lucidum","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Stress resilience / immune modulation","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"d32ec2e2-456d-53d7-a64c-981b2fad66cc","max_amount":1500,"max_unit":"mg/day extract","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Bleeding/liver caution","safety_notes":"Avoid with anticoagulants; caution with liver disease.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"14c733d1-e2e6-5f08-a0c1-09def0c9f3db","alias":"Reishi (Ganoderma lucidum)","normalized_alias":"reishi_ganoderma_lucidum"},{"id":"933dd7af-aa29-5270-b7ab-a194276c784b","source_row_id":84,"name":"Cordyceps militaris","normalized_name":"cordyceps_militaris","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Energy / endurance / VO2 support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"41132330-d098-5831-9a61-a05d172b6a6a","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Autoimmune/bleeding caution","safety_notes":"Extract standardization matters.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"d7d7cc77-fe6f-595a-8842-1d2337388226","alias":"Cordyceps militaris","normalized_alias":"cordyceps_militaris"},{"id":"8f31671e-c502-5313-be41-13f7ce6a6890","source_row_id":85,"name":"Chaga","normalized_name":"chaga","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Antioxidant / immune support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"efb09ccb-1447-50d8-b0e3-98cffaaa2dc3","max_amount":1000,"max_unit":"mg/day extract","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Oxalate/kidney/bleeding caution","safety_notes":"Avoid in kidney stone/renal disease risk unless reviewed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"b45b3408-3bad-5536-a5c3-be5cd6440202","alias":"Chaga","normalized_alias":"chaga"},{"id":"fb508faf-1236-5ba8-bc1d-4b4e84f9d7f5","source_row_id":86,"name":"Turkey Tail","normalized_name":"turkey_tail","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Gut / immune support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4d5ea891-36f1-5a6f-b697-877e3244caa4","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Immune caution","safety_notes":"Avoid immunosuppressed/oncology use without clinician review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"49b31193-703b-52f2-8f13-27ba9b2a0477","alias":"Turkey Tail","normalized_alias":"turkey_tail"},{"id":"68d96ff4-126c-5b73-9980-b4ef729acd1b","source_row_id":87,"name":"Maitake","normalized_name":"maitake","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Metabolic / immune support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e587ef53-0ce8-5bba-b75d-1ddee53d3d93","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Glucose/BP caution","safety_notes":"Caution with diabetes/BP meds.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"ccd63f47-ad32-5277-b624-98371adcfcfe","alias":"Maitake","normalized_alias":"maitake"},{"id":"53085130-90e0-59ad-9817-8bdb6675cacb","source_row_id":88,"name":"Shiitake extract","normalized_name":"shiitake_extract","category":"Medicinal Mushrooms","source_status":"recommended_add","ingredient_type":"Mushroom extract","primary_use_case":"Immune / metabolic support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"8adc38c0-6891-540d-83e6-5d613d1c1e68","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Allergy/skin reaction caution","safety_notes":"Extract standardization matters.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"e03f2bfb-97a5-5c10-9b12-a3d95b6ad841","alias":"Shiitake extract","normalized_alias":"shiitake_extract"},{"id":"e4c1c062-6b4b-527e-b171-7078fcecff44","source_row_id":89,"name":"NMN","normalized_name":"nmn","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"NAD+ precursor","primary_use_case":"Cellular energy / longevity","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"ff87fba0-8d2b-5bdb-81c9-5fa83f45a583","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Regulatory status varies by country; review before commercialization.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"2736ab10-9d94-5de7-b852-bd4e131c57c2","alias":"NMN","normalized_alias":"nmn"},{"id":"738cd230-2eee-5f7d-8bbb-9745294f645e","source_row_id":90,"name":"NR (Nicotinamide Riboside)","normalized_name":"nr_nicotinamide_riboside","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"NAD+ precursor","primary_use_case":"Cellular energy / longevity","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"38261c82-64b1-550e-81c6-a75eac92f446","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"Avoid stacking with other NAD boosters beyond total cap.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"f03e4a0e-480f-5332-8442-94bfedcdea1d","alias":"NR (Nicotinamide Riboside)","normalized_alias":"nr_nicotinamide_riboside"},{"id":"97c700ea-1752-57be-9ed4-dbaef1a5cd41","source_row_id":91,"name":"Fisetin","normalized_name":"fisetin","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Flavonoid / senolytic","primary_use_case":"Senescence / healthy aging","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9790d131-a7db-561a-b7b4-e1a6e8c94eee","max_amount":100,"max_unit":"mg/day","basis_rationale":"Conservative routine-use cap.","confidence":"low","safety_flag":"Experimental/senolytic caution","safety_notes":"High-dose senolytic protocols should be clinician/research only.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3db03683-58a5-5062-9a46-946e3d5577ef","alias":"Fisetin","normalized_alias":"fisetin"},{"id":"3d4caa9b-6cb0-596c-8aa3-4adaa2da105b","source_row_id":92,"name":"Pterostilbene","normalized_name":"pterostilbene","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Polyphenol","primary_use_case":"Longevity / vascular support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"d5c234e3-08c0-50c8-97b8-415b6733b80e","max_amount":250,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"LDL/drug interaction caution","safety_notes":"Use conservative dose; monitor lipids if chronic.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"0709ec10-4d0e-52e3-89b5-14aa893113ce","alias":"Pterostilbene","normalized_alias":"pterostilbene"},{"id":"f691f0ae-5a2e-5af8-a328-0452fd391e8a","source_row_id":93,"name":"Apigenin","normalized_name":"apigenin","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Flavonoid","primary_use_case":"Sleep / NAD support / calm","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"b82bcc4a-fe06-52f7-b440-cf3044c711a4","max_amount":50,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Sedation/drug interaction caution","safety_notes":"Caution with sedatives/anticoagulants.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3b5837d0-fe96-5fab-bd9e-527b5e000b3c","alias":"Apigenin","normalized_alias":"apigenin"},{"id":"c4004824-a6a2-5a28-b9cf-5a2858a92603","source_row_id":94,"name":"Urolithin A","normalized_name":"urolithin_a","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Postbiotic metabolite","primary_use_case":"Mitochondrial health","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"06329296-fb3b-5e7c-b9e1-1d0c131ccaca","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap based on commercial studied range.","confidence":"moderate","safety_flag":"Review","safety_notes":"Use validated ingredient form.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"52c0e14e-faf3-5718-bf41-abf0a47bf873","alias":"Urolithin A","normalized_alias":"urolithin_a"},{"id":"b687d526-a886-5406-8e31-f09f77e7f4ff","source_row_id":95,"name":"Glycine","normalized_name":"glycine","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Amino acid","primary_use_case":"Sleep / collagen / longevity","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"04b5c85a-b617-5969-8e6c-daf0f7f74286","max_amount":5000,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"moderate","safety_flag":"Sedation/GI caution","safety_notes":"Higher intakes should be reviewed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3f3240e9-6ae2-5c7d-859b-4627e05f573b","alias":"Glycine","normalized_alias":"glycine"},{"id":"2904424e-d914-58a2-b346-838a0a225dfc","source_row_id":96,"name":"Berberine","normalized_name":"berberine","category":"Advanced Longevity","source_status":"recommended_add","ingredient_type":"Alkaloid","primary_use_case":"Glucose / metabolic health","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9a06a91d-cafa-5a6e-a9dc-54c99ce6eb8e","max_amount":1500,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Diabetes/pregnancy/drug interaction caution","safety_notes":"Avoid pregnancy/breastfeeding; caution with glucose-lowering meds.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"f33e8948-7256-5894-8b12-6b4bc172a742","alias":"Berberine","normalized_alias":"berberine"},{"id":"6cf05719-eebe-5c93-9ffe-39edaaf28124","source_row_id":97,"name":"L-Citrulline","normalized_name":"l_citrulline","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Amino acid","primary_use_case":"Nitric oxide / circulation","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"f421b032-0490-5e18-8cb7-e5d6861db8c0","max_amount":6000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"BP/nitrates caution","safety_notes":"Caution with low BP, nitrates, PDE5 meds.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"da59d50b-3e45-5236-ac62-9d5f10a7bf61","alias":"L-Citrulline","normalized_alias":"l_citrulline"},{"id":"f205033f-1de9-54a7-a3bb-f52e7737e104","source_row_id":98,"name":"Beetroot extract","normalized_name":"beetroot_extract","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Nitrate source","primary_use_case":"Blood flow / exercise performance","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"08b2d99f-cafd-52e2-a651-f90c0b7d2ec0","max_amount":1000,"max_unit":"mg/day extract","basis_rationale":"Operational cap; nitrate content matters.","confidence":"low","safety_flag":"BP/kidney stone caution","safety_notes":"Track nitrate amount where possible.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"37af2533-e66f-591a-9e65-43114236d03c","alias":"Beetroot extract","normalized_alias":"beetroot_extract"},{"id":"60fc28f2-3244-5e95-985c-36c264394dd8","source_row_id":99,"name":"Hawthorn extract","normalized_name":"hawthorn_extract","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Herbal extract","primary_use_case":"Cardiovascular support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9f704065-a2f4-54ad-9f83-6aa1f762b274","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Heart/BP medication caution","safety_notes":"Avoid automated use in cardiac patients without clinician review.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"29373838-602e-5399-b689-9b612d027e61","alias":"Hawthorn extract","normalized_alias":"hawthorn_extract"},{"id":"50b83f8f-a476-54f8-905b-1df6d98d3aed","source_row_id":100,"name":"Olive leaf extract","normalized_name":"olive_leaf_extract","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Polyphenol extract","primary_use_case":"Blood pressure / metabolic support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"132668a7-0608-54d2-a4cb-d252c1db3db8","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"BP/glucose caution","safety_notes":"Caution with BP/glucose medications.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"97349f57-a370-53bb-aa42-aa21805a0b10","alias":"Olive leaf extract","normalized_alias":"olive_leaf_extract"},{"id":"22d1d5f3-224c-5097-a20e-f9ac91140148","source_row_id":101,"name":"Garlic extract standardized to allicin","normalized_name":"garlic_extract_standardized_to_allicin","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Standardized herbal extract","primary_use_case":"Cardiometabolic support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"e72bfd9c-36cd-58de-84e1-96d10975e60e","max_amount":1200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/BP caution","safety_notes":"Avoid duplicate garlic entries; track total garlic extract.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"d333d20d-af00-5a6a-8db7-7cdf33b91af8","alias":"Garlic extract standardized to allicin","normalized_alias":"garlic_extract_standardized_to_allicin"},{"id":"89ba3e8f-4c45-5037-93ab-d32a38fd4e0d","source_row_id":102,"name":"Policosanol","normalized_name":"policosanol","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Lipid compound","primary_use_case":"Cholesterol support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"59909e77-9da3-5485-8e8f-24c51954c7bf","max_amount":20,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Bleeding caution","safety_notes":"Evidence mixed; use conservative cap.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"53366876-0543-579c-bf62-2540e864097e","alias":"Policosanol","normalized_alias":"policosanol"},{"id":"ed45e60d-a6d4-5dda-8dfe-3671d7121fc5","source_row_id":103,"name":"Plant sterols / stanols","normalized_name":"plant_sterols_stanols","category":"Cardiometabolic","source_status":"recommended_add","ingredient_type":"Functional lipid","primary_use_case":"LDL cholesterol support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"39ce4f69-cb5c-5763-8202-bd167bed1b74","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Fat-soluble vitamin absorption caution","safety_notes":"Usually 1.5-3 g/day range.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"ef81cc2d-e506-540b-bc54-66ca84dc0b1b","alias":"Plant sterols / stanols","normalized_alias":"plant_sterols_stanols"},{"id":"c8ffa899-deea-52da-824e-2fe1f0437a66","source_row_id":104,"name":"Citicoline (CDP-choline)","normalized_name":"citicoline_cdp_choline","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Choline donor","primary_use_case":"Focus / cognition","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"2c65e712-3f4f-5d68-8092-011eac3bbdcb","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Cholinergic caution","safety_notes":"Sum with total choline load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"2ff397fd-1c29-5ea1-8f1c-7538bc9e2724","alias":"Citicoline (CDP-choline)","normalized_alias":"citicoline_cdp_choline"},{"id":"dcc59450-1b3e-54ce-87af-435a33329670","source_row_id":105,"name":"Alpha-GPC","normalized_name":"alpha_gpc","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Choline donor","primary_use_case":"Cognition / acetylcholine support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c39390b9-37b1-5dcc-a312-edeb77defd43","max_amount":600,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Cholinergic caution","safety_notes":"Sum with total choline load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"e2503d7a-9e80-5517-adcb-36170ab25fd5","alias":"Alpha-GPC","normalized_alias":"alpha_gpc"},{"id":"e225c7a6-acb9-5318-aaa3-4fb7d27f195c","source_row_id":106,"name":"Bacopa monnieri","normalized_name":"bacopa_monnieri","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Herbal nootropic","primary_use_case":"Memory / learning","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3970947b-deca-58a3-9237-141394c9693a","max_amount":450,"max_unit":"mg/day extract","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Sedation/GI/thyroid caution","safety_notes":"Use standardized bacosides; caution with sedatives.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"b2fedc5a-8dde-5344-b20b-fc4f6ed3a179","alias":"Bacopa monnieri","normalized_alias":"bacopa_monnieri"},{"id":"a2fbed19-a1db-5753-ba2b-c4b7703ae59b","source_row_id":107,"name":"L-Tyrosine","normalized_name":"l_tyrosine","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Amino acid","primary_use_case":"Stress / dopamine support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"186d2bb2-e26a-56bd-b066-49a3739cd3ca","max_amount":2000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Thyroid/MAOI/BP caution","safety_notes":"Avoid with MAOIs; caution thyroid disease.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"9428ad82-0819-54d8-bc9f-3a8eaea37b0d","alias":"L-Tyrosine","normalized_alias":"l_tyrosine"},{"id":"00c13235-56d2-55e3-ade0-510fd25ffa4a","source_row_id":108,"name":"Uridine monophosphate","normalized_name":"uridine_monophosphate","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Nucleotide","primary_use_case":"Synapse / brain support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"b85fe645-8f27-5b25-9a63-a174cbfe20a5","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Use conservative cap; limited safety data.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"5d5e9d1f-c848-5bd2-be52-ae7bc23d399c","alias":"Uridine monophosphate","normalized_alias":"uridine_monophosphate"},{"id":"4b13d031-fd1c-5acf-95d5-54030093eccd","source_row_id":109,"name":"Saffron extract","normalized_name":"saffron_extract","category":"Brain / Mood / Cognition","source_status":"recommended_add","ingredient_type":"Botanical extract","primary_use_case":"Mood / emotional wellbeing","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4ab7960d-6ff0-5df3-a39a-9fbde37d478c","max_amount":30,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Pregnancy/serotonergic caution","safety_notes":"Avoid pregnancy; caution with serotonergic meds.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"aa58429e-5db2-57b0-a65b-388b3788a44b","alias":"Saffron extract","normalized_alias":"saffron_extract"},{"id":"995bce65-8b91-560a-9669-ffd1a9b53067","source_row_id":110,"name":"Lactobacillus rhamnosus","normalized_name":"lactobacillus_rhamnosus","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Probiotic strain","primary_use_case":"Gut / immune / resilience","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c3e912b7-efee-5a9b-bf62-42f2ddb1ed69","max_amount":10,"max_unit":"billion CFU/day","basis_rationale":"Operational cap; strain-specific.","confidence":"moderate","safety_flag":"Immunocompromised caution","safety_notes":"Probiotic dosing should be by strain and CFU, not mg.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"f7061d34-3640-5ead-8fc0-fb9c4a3fe37a","alias":"Lactobacillus rhamnosus","normalized_alias":"lactobacillus_rhamnosus"},{"id":"5333965c-2ad2-50d3-9617-122f752c3d16","source_row_id":111,"name":"Bifidobacterium longum","normalized_name":"bifidobacterium_longum","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Probiotic strain","primary_use_case":"Gut / mood / immune support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"650b1300-8de7-5f4a-ae16-e471c20f669a","max_amount":10,"max_unit":"billion CFU/day","basis_rationale":"Operational cap; strain-specific.","confidence":"moderate","safety_flag":"Immunocompromised caution","safety_notes":"Probiotic dosing should be by strain and CFU, not mg.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"c971fcc5-1ba8-5865-94fb-ca32cba30ae0","alias":"Bifidobacterium longum","normalized_alias":"bifidobacterium_longum"},{"id":"1deaa8e5-58ec-56fc-ae06-41dc13d698ef","source_row_id":112,"name":"Multi-strain probiotics","normalized_name":"multi_strain_probiotics","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Probiotic blend","primary_use_case":"Microbiome support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3c1602ce-e0b8-544c-a205-fc473075f189","max_amount":50,"max_unit":"billion CFU/day","basis_rationale":"Operational cap; strain-specific.","confidence":"moderate","safety_flag":"Immunocompromised caution","safety_notes":"Require strain IDs and CFU count.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"096c06ca-f1a5-5d7c-9bd6-50bbfa05de53","alias":"Multi-strain probiotics","normalized_alias":"multi_strain_probiotics"},{"id":"6a48f950-f8e6-5497-bba2-61fcdc829002","source_row_id":113,"name":"Saccharomyces boulardii","normalized_name":"saccharomyces_boulardii","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Probiotic yeast","primary_use_case":"Gut resilience / diarrhea support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"9c896500-df7e-5b5f-a9a8-a89390300ce7","max_amount":10,"max_unit":"billion CFU/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Immunocompromised/central line caution","safety_notes":"Avoid in severely immunocompromised users unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"ede67f6e-b10a-556b-8e1c-d9a3f7fa50f7","alias":"Saccharomyces boulardii","normalized_alias":"saccharomyces_boulardii"},{"id":"669f0c4d-d4f1-501a-b496-a04657a70c06","source_row_id":114,"name":"Sodium butyrate","normalized_name":"sodium_butyrate","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Postbiotic / SCFA","primary_use_case":"Colon health / gut barrier","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"6d57b0f0-005d-5c9f-b701-45b27b8cd81b","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"GI caution","safety_notes":"Titrate gradually.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"b1ca7287-7f19-5ae3-88ba-226da56ee092","alias":"Sodium butyrate","normalized_alias":"sodium_butyrate"},{"id":"b95ac0c4-2996-5803-91eb-6d29be41a076","source_row_id":115,"name":"Digestive bitters","normalized_name":"digestive_bitters","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Botanical digestive aid","primary_use_case":"Digestion / appetite signaling","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3dac8323-f868-5d1a-8ad9-cef2a76b51f6","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap; blend dependent.","confidence":"low","safety_flag":"Pregnancy/gallbladder/reflux caution","safety_notes":"Requires ingredient-by-ingredient review.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"14ddd468-cd01-57a3-8d9a-1c749b233aa9","alias":"Digestive bitters","normalized_alias":"digestive_bitters"},{"id":"039c5ce1-31e4-5c17-bc1f-114e5efba0bb","source_row_id":116,"name":"Gentian","normalized_name":"gentian","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Digestive bitter herb","primary_use_case":"Digestion support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"81cb4ee3-2763-54f9-bea5-24a930c59d7c","max_amount":500,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Ulcer/reflux/pregnancy caution","safety_notes":"Avoid in ulcer disease/reflux sensitivity.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"1856c6d9-c89f-5c52-be16-76e8cf4d7694","alias":"Gentian","normalized_alias":"gentian"},{"id":"c4ebf795-ba48-5716-a63d-d995e19eba59","source_row_id":117,"name":"Artichoke extract","normalized_name":"artichoke_extract","category":"Advanced Gut Health","source_status":"recommended_add","ingredient_type":"Digestive / liver botanical","primary_use_case":"Bile flow / digestion","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"cda7d6ea-157b-50d4-abe7-12202d403fad","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Gallbladder/allergy caution","safety_notes":"Avoid with bile duct obstruction.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"c2e69e8c-2e72-5e88-b806-d044e6d9ff3b","alias":"Artichoke extract","normalized_alias":"artichoke_extract"},{"id":"55da9ab8-0b65-5780-ae8b-403d428363c7","source_row_id":118,"name":"Beta-alanine","normalized_name":"beta_alanine","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Performance amino acid","primary_use_case":"Endurance / buffering","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3decf7d5-0f52-5e86-8998-395a901f2694","max_amount":6400,"max_unit":"mg/day","basis_rationale":"Operational cap based on studied divided dosing.","confidence":"moderate","safety_flag":"Paresthesia caution","safety_notes":"Divide doses to reduce tingling.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"6370ff56-ca23-5482-a72d-e2b4009bbf9d","alias":"Beta-alanine","normalized_alias":"beta_alanine"},{"id":"41976380-db79-5d21-88f4-b1a40a54619b","source_row_id":119,"name":"HMB","normalized_name":"hmb","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Leucine metabolite","primary_use_case":"Muscle preservation / aging","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"f4565feb-58c5-580e-8c85-bce7d862cffd","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Review","safety_notes":"Typical performance dose.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"590fa789-b48e-525a-9845-eba1bd6bf0d2","alias":"HMB","normalized_alias":"hmb"},{"id":"01a12bae-e53c-5a82-a401-ecb43c87f0fa","source_row_id":120,"name":"Electrolyte blend with trace minerals","normalized_name":"electrolyte_blend_with_trace_minerals","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Mineral blend","primary_use_case":"Hydration / performance","notes":null,"list_status":"blacklisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"87bf5357-bc16-5179-8209-d8d535f689a2","max_amount":0,"max_unit":"custom","basis_rationale":"Not a single ingredient; validate each mineral separately.","confidence":"high","safety_flag":"Formula logic required","safety_notes":"Set to 0 here; formula must break into sodium/potassium/magnesium/etc and check each ceiling.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"230ae50e-4233-59bc-ba47-ea8d9bd87eb4","alias":"Electrolyte blend with trace minerals","normalized_alias":"electrolyte_blend_with_trace_minerals"},{"id":"3cf87f3b-5365-5917-a38e-5152b1fb7768","source_row_id":121,"name":"Ecdysterone","normalized_name":"ecdysterone","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Phytoecdysteroid","primary_use_case":"Emerging muscle support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"169ea280-898e-5cfc-bf9c-0a1b4c22e9e7","max_amount":500,"max_unit":"mg/day","basis_rationale":"Conservative operational cap.","confidence":"low","safety_flag":"Regulatory/sport caution","safety_notes":"Sports/regulatory status should be checked before use.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"358e0396-8549-5a74-8ff3-3c08ada6da76","alias":"Ecdysterone","normalized_alias":"ecdysterone"},{"id":"7e70e885-43f4-55e8-8120-6ce5dcce3beb","source_row_id":122,"name":"Tongkat Ali (Eurycoma longifolia)","normalized_name":"tongkat_ali_eurycoma_longifolia","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Herbal extract","primary_use_case":"Male vitality / testosterone support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"123c2c81-351b-5f0a-9a2b-aed6a5f6c772","max_amount":400,"max_unit":"mg/day extract","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Hormonal/liver caution","safety_notes":"Use standardized extract; avoid in hormone-sensitive conditions.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"b069357a-05c3-5c52-b3f0-d7f9460b1f5b","alias":"Tongkat Ali (Eurycoma longifolia)","normalized_alias":"tongkat_ali_eurycoma_longifolia"},{"id":"2648263d-18f3-56d7-8cd7-cf72e8e3e495","source_row_id":123,"name":"Shilajit","normalized_name":"shilajit","category":"Performance / Body Composition","source_status":"recommended_add","ingredient_type":"Mineral resin","primary_use_case":"Mitochondrial / vitality support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"befdc999-cf9d-5694-9aba-04ebfb220c16","max_amount":500,"max_unit":"mg/day purified","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Heavy metal contamination caution","safety_notes":"Only purified, tested material; require COA.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"fd8231fe-93a3-59f2-8031-c7034951de5e","alias":"Shilajit","normalized_alias":"shilajit"},{"id":"3bb16f73-a51a-5bab-832e-3e183a1644b2","source_row_id":124,"name":"DIM (Diindolylmethane)","normalized_name":"dim_diindolylmethane","category":"Hormonal / Gender Specific","source_status":"recommended_add","ingredient_type":"Phytonutrient","primary_use_case":"Estrogen metabolism","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"750a4754-ae6d-5874-b351-3a6b1ed6fc11","max_amount":200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Hormonal/pregnancy caution","safety_notes":"Avoid pregnancy and hormone-sensitive conditions unless reviewed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"85d7ea43-f9e5-50d0-8655-cee7f6fb5619","alias":"DIM (Diindolylmethane)","normalized_alias":"dim_diindolylmethane"},{"id":"edbd6c38-9fe3-5aa0-b928-0db5f921c4d9","source_row_id":125,"name":"Vitex (Chasteberry)","normalized_name":"vitex_chasteberry","category":"Hormonal / Gender Specific","source_status":"recommended_add","ingredient_type":"Herbal extract","primary_use_case":"Female cycle support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"da2e7d4e-eea2-5db6-bf63-fbe74c7cdd9c","max_amount":40,"max_unit":"mg/day extract","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Hormonal/pregnancy/OCP caution","safety_notes":"Avoid pregnancy and hormone therapies unless clinician-directed.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"3579203e-c0fc-5cac-be51-5a36f9d4d650","alias":"Vitex (Chasteberry)","normalized_alias":"vitex_chasteberry"},{"id":"dbe1af92-998a-5f2b-844a-8cb34ab28e57","source_row_id":126,"name":"Evening primrose oil","normalized_name":"evening_primrose_oil","category":"Hormonal / Gender Specific","source_status":"recommended_add","ingredient_type":"Fatty acid / botanical oil","primary_use_case":"Female skin/PMS support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"7e81cf06-9024-54f0-9c58-ece2df76f7b5","max_amount":3000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/seizure caution","safety_notes":"Caution with anticoagulants and seizure disorders.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"8a69abef-243f-5f8b-a911-7d86d4964dff","alias":"Evening primrose oil","normalized_alias":"evening_primrose_oil"},{"id":"888fb912-ea97-579b-a2b7-197a1f639166","source_row_id":127,"name":"Saw palmetto","normalized_name":"saw_palmetto","category":"Hormonal / Gender Specific","source_status":"recommended_add","ingredient_type":"Botanical extract","primary_use_case":"Prostate / DHT support","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"ae1421ed-b9bf-5266-8ce7-1b324a505137","max_amount":320,"max_unit":"mg/day extract","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/hormonal caution","safety_notes":"Avoid before surgery; caution hormone therapies.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"015a5698-6dca-5423-adaa-6f88e6c52486","alias":"Saw palmetto","normalized_alias":"saw_palmetto"},{"id":"3b1bded1-a046-54f8-82ee-90317c36f0ad","source_row_id":128,"name":"Fenugreek extract","normalized_name":"fenugreek_extract","category":"Hormonal / Gender Specific","source_status":"recommended_add","ingredient_type":"Botanical extract","primary_use_case":"Glucose / testosterone/libido support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"852862c1-5d9d-5a91-9ed5-f9b7637fb201","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Glucose/pregnancy/allergy caution","safety_notes":"Avoid pregnancy; caution with diabetes meds.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"741552a7-4cba-5b14-8426-3247a55062a7","alias":"Fenugreek extract","normalized_alias":"fenugreek_extract"},{"id":"4dd22287-aec0-587d-8a67-a50f296d16bb","source_row_id":129,"name":"Magnesium threonate","normalized_name":"magnesium_threonate","category":"Sleep Optimization","source_status":"recommended_add","ingredient_type":"Mineral form","primary_use_case":"Brain magnesium / sleep / cognition","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c154a3a2-432c-5762-b86d-e611f4c40ca9","max_amount":2000,"max_unit":"mg/day compound","basis_rationale":"Operational cap; also enforce 350 mg/day elemental supplemental magnesium.","confidence":"moderate","safety_flag":"Magnesium UL logic","safety_notes":"Track elemental magnesium separately.","source_url":"https://ods.od.nih.gov/factsheets/list-VitaminsMinerals/","alias_id":"11261e59-2114-5d36-b52e-7776235f0efb","alias":"Magnesium threonate","normalized_alias":"magnesium_threonate"},{"id":"8c92264e-c4ed-5a62-916e-3f71a6bc75ec","source_row_id":130,"name":"GABA","normalized_name":"gaba","category":"Sleep Optimization","source_status":"recommended_add","ingredient_type":"Neurotransmitter compound","primary_use_case":"Relaxation / sleep support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"4492d217-941b-5901-9f8e-d57c952de676","max_amount":750,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Sedation caution","safety_notes":"Caution with sedatives/alcohol.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"46fc7b09-b690-5a42-bd62-3f24a46812e7","alias":"GABA","normalized_alias":"gaba"},{"id":"c3237767-20e1-5d2f-b2b2-c9442a2d766e","source_row_id":131,"name":"Tart cherry extract","normalized_name":"tart_cherry_extract","category":"Sleep Optimization","source_status":"recommended_add","ingredient_type":"Botanical extract","primary_use_case":"Sleep / recovery","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"1978d049-cdc8-5a4e-a529-a1e1413c7f67","max_amount":1000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Glucose/GI caution","safety_notes":"Extract standardization varies.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"cf545e98-aa07-5591-8991-58e49289b86f","alias":"Tart cherry extract","normalized_alias":"tart_cherry_extract"},{"id":"3481f58d-c561-5d5d-94f2-716aed9275be","source_row_id":132,"name":"Ceramides (oral)","normalized_name":"ceramides_oral","category":"Skin / Beauty / Anti-Aging","source_status":"recommended_add","ingredient_type":"Lipid complex","primary_use_case":"Skin hydration / barrier","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"30f6eed4-0740-520d-af43-7d9f321b3841","max_amount":70,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Use clinically studied ingredient forms.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"3bf072c9-a067-5523-94e5-1c9d375b4f14","alias":"Ceramides (oral)","normalized_alias":"ceramides_oral"},{"id":"4b6364ef-29da-5b68-bca2-283657c2c317","source_row_id":133,"name":"Marine collagen peptides type I/III","normalized_name":"marine_collagen_peptides_type_i_iii","category":"Skin / Beauty / Anti-Aging","source_status":"recommended_add","ingredient_type":"Protein peptide","primary_use_case":"Skin / hair / nails / joints","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"62d8422a-537d-5144-b94f-e6b017b1f6dd","max_amount":10000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Fish/shellfish allergy caution","safety_notes":"Consider total collagen/protein load.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"153ff3f5-60a0-5702-94ba-c816ea21c343","alias":"Marine collagen peptides type I/III","normalized_alias":"marine_collagen_peptides_type_i_iii"},{"id":"616d3f0d-0646-54d4-ad30-18bc6c6208ce","source_row_id":134,"name":"Elastin peptides","normalized_name":"elastin_peptides","category":"Skin / Beauty / Anti-Aging","source_status":"recommended_add","ingredient_type":"Protein peptide","primary_use_case":"Skin elasticity","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"b77a3923-1a74-58ba-88c0-5a48e3d725e4","max_amount":200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Ingredient-specific evidence/safety varies.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"db38b8aa-7b43-5add-8b89-e7bd500a9ed5","alias":"Elastin peptides","normalized_alias":"elastin_peptides"},{"id":"0799b512-bcd3-52de-b6a3-59a23b366f11","source_row_id":135,"name":"Low molecular weight hyaluronic acid","normalized_name":"low_molecular_weight_hyaluronic_acid","category":"Skin / Beauty / Anti-Aging","source_status":"recommended_add","ingredient_type":"Glycosaminoglycan form","primary_use_case":"Skin / joints","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"bc19141c-0a90-5877-8d40-19a6b493a04e","max_amount":200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Review","safety_notes":"Avoid duplicate hyaluronic acid entries; track total HA.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"d2d4a263-6b41-5113-9c7a-fbe63aa19103","alias":"Low molecular weight hyaluronic acid","normalized_alias":"low_molecular_weight_hyaluronic_acid"},{"id":"3fc7016e-80cf-5c2d-9fbf-91708391fb30","source_row_id":136,"name":"Pine bark extract (Pycnogenol)","normalized_name":"pine_bark_extract_pycnogenol","category":"Skin / Beauty / Anti-Aging","source_status":"recommended_add","ingredient_type":"Polyphenol extract","primary_use_case":"Skin / circulation / antioxidant","notes":null,"list_status":"whitelisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"fb8e64a9-5d32-5ec3-bc04-ddb7eb1bf445","max_amount":200,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"moderate","safety_flag":"Bleeding/autoimmune caution","safety_notes":"Caution with anticoagulants/antiplatelets.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"cf2880e1-cce0-57d4-ae8c-237683dcb7d1","alias":"Pine bark extract (Pycnogenol)","normalized_alias":"pine_bark_extract_pycnogenol"},{"id":"ebbedca4-ae2b-5b28-a1e5-549ada6ad059","source_row_id":137,"name":"Ketone esters","normalized_name":"ketone_esters","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Metabolic fuel","primary_use_case":"Performance / cognitive energy","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"46939d9f-94f8-5d2c-8bcb-0ed10a8a824c","max_amount":25000,"max_unit":"mg/day","basis_rationale":"Operational cap; product-specific.","confidence":"low","safety_flag":"GI/metabolic caution","safety_notes":"Advanced ingredient; use clinician/regulatory review.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"919f541b-00b4-521e-a16d-a66bae478164","alias":"Ketone esters","normalized_alias":"ketone_esters"},{"id":"d8325c4c-5737-58e6-b35e-2c8e423e5785","source_row_id":138,"name":"Liposomal NAD boosters","normalized_name":"liposomal_nad_boosters","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Delivery technology","primary_use_case":"NAD pathway support","notes":null,"list_status":"blacklisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"3a472b9e-2aea-554a-b522-04045ae9e076","max_amount":0,"max_unit":"exclude/clinician review","basis_rationale":"Not a specific ingredient; validate exact active ingredient and route.","confidence":"high","safety_flag":"Exclude automated use","safety_notes":"Set to 0 until active ingredient is specified and legally reviewed.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"5f6f1e82-6b4a-509e-81c2-59fd024624e1","alias":"Liposomal NAD boosters","normalized_alias":"liposomal_nad_boosters"},{"id":"be152ac8-5b6e-5f3d-b71c-1e094b576eca","source_row_id":139,"name":"Colostrum","normalized_name":"colostrum","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Bioactive dairy compound","primary_use_case":"Gut / immune support","notes":null,"list_status":"review_required","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"8dda2af1-90f5-5d47-8113-9bc9e435744c","max_amount":5000,"max_unit":"mg/day","basis_rationale":"Operational cap.","confidence":"low","safety_flag":"Dairy allergy/immunocompromised caution","safety_notes":"Use tested material; not for dairy allergy.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"b931302e-00a4-5708-a363-79c0d4a1bda4","alias":"Colostrum","normalized_alias":"colostrum"},{"id":"2892c425-6322-5619-b609-09964e51faa8","source_row_id":140,"name":"Adaptogen blend","normalized_name":"adaptogen_blend","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Combination formula","primary_use_case":"Stress resilience","notes":null,"list_status":"blacklisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"02935d24-287f-5238-87b6-a1f73fd8df07","max_amount":0,"max_unit":"exclude/blend review","basis_rationale":"Blend is not a single ingredient; check each component separately.","confidence":"high","safety_flag":"Exclude automated use","safety_notes":"Set to 0 until each component and dose are specified.","source_url":"https://www.nccih.nih.gov/health/herbsataglance","alias_id":"3c5038bf-cc8d-5419-a960-5d978b1be62a","alias":"Adaptogen blend","normalized_alias":"adaptogen_blend"},{"id":"0857c1ed-58b5-559d-9919-c06103dc07f0","source_row_id":141,"name":"Methylene blue","normalized_name":"methylene_blue","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Advanced compound","primary_use_case":"Mitochondrial/cognition interest","notes":null,"list_status":"blacklisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"c500b982-4068-5b81-b44f-ed1f35d9764f","max_amount":0,"max_unit":"exclude/medical review","basis_rationale":"Drug-like ingredient; not appropriate for automated supplement recommendation.","confidence":"high","safety_flag":"Serotonin syndrome/G6PD/prescription risk","safety_notes":"Exclude from consumer AI formulas unless physician/regulatory protocol approves.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"1c208a72-bdf6-53a4-bf52-1229758628e3","alias":"Methylene blue","normalized_alias":"methylene_blue"},{"id":"6c3ecde8-8075-5268-9cd8-8f140ab0b79f","source_row_id":142,"name":"Nootropic peptides","normalized_name":"nootropic_peptides","category":"Premium / Emerging","source_status":"recommended_add","ingredient_type":"Advanced compound class","primary_use_case":"Cognition","notes":null,"list_status":"blacklisted","is_active":true,"source":"MattaNutra_Ingredient_Safety_Ceilings.xlsx","limit_id":"ddb7476c-49ff-5fa7-bc7b-bb059685ab4c","max_amount":0,"max_unit":"exclude/medical/regulatory review","basis_rationale":"Not a defined supplement ingredient; potential drug/research chemical category.","confidence":"high","safety_flag":"Regulatory/safety risk","safety_notes":"Exclude from MattaNutra consumer supplement formulas.","source_url":"https://www.nccih.nih.gov/health/dietary-and-herbal-supplements","alias_id":"08d72361-3d2d-5ede-9e9a-49dc7f8f3837","alias":"Nootropic peptides","normalized_alias":"nootropic_peptides"}]$mattanutra_supplement_seed$::jsonb) as x(
    alias_id uuid,
    alias text,
    normalized_alias text,
    normalized_name text
  )
)
insert into public.supplement_aliases (
  id,
  supplement_id,
  alias,
  normalized_alias
)
select
  seed.alias_id,
  supplements.id,
  seed.alias,
  seed.normalized_alias
from seed
join public.supplements supplements on supplements.normalized_name = seed.normalized_name
on conflict (normalized_alias) do update
set
  supplement_id = excluded.supplement_id,
  alias = excluded.alias;

create table if not exists public.safety_reviews (
  id uuid primary key,
  ray uuid null,
  plan_id uuid null references public.assessments(plan_id) on delete cascade,
  job_id uuid null references public.jobs(id) on delete set null,
  bpm_event_id uuid null references public.bpm(id) on delete set null,
  notification_job_id uuid null references public.jobs(id) on delete set null,
  formulation_version integer null,
  review_type text not null default 'ingredient_safety',
  status text not null default 'open',
  severity text not null default 'medium',
  supplement_name text not null,
  suggested_dose_value numeric(14, 4) null,
  suggested_dose_unit text null,
  suggested_frequency text null,
  suggested_form text null,
  suggested_timing text null,
  limit_value numeric(14, 4) null,
  limit_unit text null,
  rule_code text null,
  flag_reason text not null,
  ai_suggestion jsonb not null default '{}'::jsonb,
  safety_context jsonb not null default '{}'::jsonb,
  reviewer_id text null,
  reviewer_note text null,
  client_message jsonb not null default '{}'::jsonb,
  client_notification_status text not null default 'not_started',
  opened_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  client_informed_at timestamptz null,
  closed_at timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.safety_reviews
  add column if not exists ray uuid null,
  add column if not exists plan_id uuid null references public.assessments(plan_id) on delete cascade,
  add column if not exists job_id uuid null references public.jobs(id) on delete set null,
  add column if not exists bpm_event_id uuid null references public.bpm(id) on delete set null,
  add column if not exists notification_job_id uuid null references public.jobs(id) on delete set null,
  add column if not exists formulation_version integer null,
  add column if not exists review_type text default 'ingredient_safety',
  add column if not exists status text default 'open',
  add column if not exists severity text default 'medium',
  add column if not exists supplement_name text,
  add column if not exists suggested_dose_value numeric(14, 4) null,
  add column if not exists suggested_dose_unit text null,
  add column if not exists suggested_frequency text null,
  add column if not exists suggested_form text null,
  add column if not exists suggested_timing text null,
  add column if not exists limit_value numeric(14, 4) null,
  add column if not exists limit_unit text null,
  add column if not exists rule_code text null,
  add column if not exists flag_reason text,
  add column if not exists ai_suggestion jsonb default '{}'::jsonb,
  add column if not exists safety_context jsonb default '{}'::jsonb,
  add column if not exists reviewer_id text null,
  add column if not exists reviewer_note text null,
  add column if not exists client_message jsonb default '{}'::jsonb,
  add column if not exists client_notification_status text default 'not_started',
  add column if not exists opened_at timestamptz default now(),
  add column if not exists reviewed_at timestamptz null,
  add column if not exists client_informed_at timestamptz null,
  add column if not exists closed_at timestamptz null,
  add column if not exists updated_at timestamptz default now();

update public.safety_reviews
set
  review_type = case
    when review_type in (
      'ingredient_safety',
      'dose_limit',
      'contraindication',
      'medication_interaction',
      'condition_stop',
      'age_stop',
      'pregnancy_breastfeeding',
      'other'
    ) then review_type
    else 'ingredient_safety'
  end,
  status = case
    when status in (
      'open',
      'in_review',
      'accepted',
      'rejected',
      'revised',
      'escalated',
      'client_notification_queued',
      'client_informed',
      'closed'
    ) then status
    else 'open'
  end,
  severity = case
    when severity in ('low', 'medium', 'high', 'critical') then severity
    else 'medium'
  end,
  supplement_name = coalesce(supplement_name, 'Unknown supplement'),
  flag_reason = coalesce(flag_reason, 'Safety review required.'),
  ai_suggestion = coalesce(ai_suggestion, '{}'::jsonb),
  safety_context = coalesce(safety_context, '{}'::jsonb),
  client_message = coalesce(client_message, '{}'::jsonb),
  client_notification_status = case
    when client_notification_status in (
      'not_started',
      'not_required',
      'queued',
      'sent',
      'failed'
    ) then client_notification_status
    else 'not_started'
  end,
  opened_at = coalesce(opened_at, now()),
  updated_at = coalesce(updated_at, now())
where review_type is null
  or review_type not in (
    'ingredient_safety',
    'dose_limit',
    'contraindication',
    'medication_interaction',
    'condition_stop',
    'age_stop',
    'pregnancy_breastfeeding',
    'other'
  )
  or status is null
  or status not in (
    'open',
    'in_review',
    'accepted',
    'rejected',
    'revised',
    'escalated',
    'client_notification_queued',
    'client_informed',
    'closed'
  )
  or severity is null
  or severity not in ('low', 'medium', 'high', 'critical')
  or supplement_name is null
  or flag_reason is null
  or ai_suggestion is null
  or safety_context is null
  or client_message is null
  or client_notification_status is null
  or client_notification_status not in (
    'not_started',
    'not_required',
    'queued',
    'sent',
    'failed'
  )
  or opened_at is null
  or updated_at is null;

alter table public.safety_reviews
  alter column review_type set default 'ingredient_safety',
  alter column review_type set not null,
  alter column status set default 'open',
  alter column status set not null,
  alter column severity set default 'medium',
  alter column severity set not null,
  alter column supplement_name set not null,
  alter column flag_reason set not null,
  alter column ai_suggestion set default '{}'::jsonb,
  alter column ai_suggestion set not null,
  alter column safety_context set default '{}'::jsonb,
  alter column safety_context set not null,
  alter column client_message set default '{}'::jsonb,
  alter column client_message set not null,
  alter column client_notification_status set default 'not_started',
  alter column client_notification_status set not null,
  alter column opened_at set default now(),
  alter column opened_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.safety_reviews'::regclass
      and conname = 'safety_reviews_type_check'
  ) then
    alter table public.safety_reviews
      add constraint safety_reviews_type_check
      check (
        review_type in (
          'ingredient_safety',
          'dose_limit',
          'contraindication',
          'medication_interaction',
          'condition_stop',
          'age_stop',
          'pregnancy_breastfeeding',
          'other'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.safety_reviews'::regclass
      and conname = 'safety_reviews_status_check'
  ) then
    alter table public.safety_reviews
      add constraint safety_reviews_status_check
      check (
        status in (
          'open',
          'in_review',
          'accepted',
          'rejected',
          'revised',
          'escalated',
          'client_notification_queued',
          'client_informed',
          'closed'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.safety_reviews'::regclass
      and conname = 'safety_reviews_severity_check'
  ) then
    alter table public.safety_reviews
      add constraint safety_reviews_severity_check
      check (severity in ('low', 'medium', 'high', 'critical'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.safety_reviews'::regclass
      and conname = 'safety_reviews_client_notification_status_check'
  ) then
    alter table public.safety_reviews
      add constraint safety_reviews_client_notification_status_check
      check (
        client_notification_status in (
          'not_started',
          'not_required',
          'queued',
          'sent',
          'failed'
        )
      );
  end if;
end $$;

comment on table public.safety_reviews is
  'Operational human-review queue for supplement and dose safety flags raised during formulation checks.';
comment on column public.safety_reviews.bpm_event_id is
  'Optional BPM event showing the business/safety dashboard event that opened this review.';
comment on column public.safety_reviews.ai_suggestion is
  'The exact AI supplement suggestion payload that triggered the safety review.';
comment on column public.safety_reviews.safety_context is
  'Relevant assessment context, rule output, limits, medication flags, or stop-rule evidence.';
comment on column public.safety_reviews.client_message is
  'Draft or final client-facing message after the human decision, localized where needed.';

create index if not exists safety_reviews_status_idx
  on public.safety_reviews (status, severity, opened_at asc);

create index if not exists safety_reviews_plan_idx
  on public.safety_reviews (plan_id, opened_at desc)
  where plan_id is not null;

create index if not exists safety_reviews_job_idx
  on public.safety_reviews (job_id, opened_at desc)
  where job_id is not null;

create index if not exists safety_reviews_ray_idx
  on public.safety_reviews (ray, opened_at desc)
  where ray is not null;

create index if not exists safety_reviews_supplement_idx
  on public.safety_reviews (lower(supplement_name), opened_at desc);

create index if not exists safety_reviews_notification_idx
  on public.safety_reviews (client_notification_status, opened_at asc);

create index if not exists safety_reviews_ai_suggestion_gin_idx
  on public.safety_reviews using gin (ai_suggestion jsonb_path_ops);

create index if not exists safety_reviews_context_gin_idx
  on public.safety_reviews using gin (safety_context jsonb_path_ops);

create table if not exists public.testimonials (
  id uuid primary key,
  locale text not null default 'en',
  status text not null default 'published',
  quote text not null,
  author_name text not null,
  author_title text null,
  author_handle text null,
  author_image_url text null,
  author_image_alt text null,
  sort_order integer not null default 0,
  source_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.testimonials
  add column if not exists locale text default 'en',
  add column if not exists status text default 'published',
  add column if not exists quote text,
  add column if not exists author_name text,
  add column if not exists author_title text null,
  add column if not exists author_handle text null,
  add column if not exists author_image_url text null,
  add column if not exists author_image_alt text null,
  add column if not exists sort_order integer default 0,
  add column if not exists source_agent text null,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.testimonials
set
  locale = coalesce(locale, 'en'),
  status = case
    when status in ('draft', 'review', 'published', 'archived') then status
    else 'published'
  end,
  quote = coalesce(quote, ''),
  author_name = coalesce(author_name, 'MattaNutra reader'),
  sort_order = coalesce(sort_order, 0),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where locale is null
  or status is null
  or status not in ('draft', 'review', 'published', 'archived')
  or quote is null
  or author_name is null
  or sort_order is null
  or metadata is null
  or created_at is null
  or updated_at is null;

alter table public.testimonials
  alter column locale set default 'en',
  alter column locale set not null,
  alter column status set default 'published',
  alter column status set not null,
  alter column quote set not null,
  alter column author_name set not null,
  alter column sort_order set default 0,
  alter column sort_order set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  alter table public.testimonials
    drop constraint if exists blog_testimonials_locale_check;

  alter table public.testimonials
    drop constraint if exists testimonials_locale_check;

  alter table public.testimonials
    add constraint testimonials_locale_check
    check (locale in ('en', 'th'));

  alter table public.testimonials
    drop constraint if exists blog_testimonials_status_check;

  alter table public.testimonials
    drop constraint if exists testimonials_status_check;

  alter table public.testimonials
    add constraint testimonials_status_check
    check (status in ('draft', 'review', 'published', 'archived'));
end $$;

create table if not exists public.blog_posts (
  id uuid primary key,
  locale text not null default 'en',
  slug text not null,
  status text not null default 'draft',
  title text not null,
  subtitle text null,
  excerpt text not null,
  body jsonb not null default '{}'::jsonb,
  image_url text null,
  image_alt text null,
  testimonial_id uuid null references public.testimonials(id) on delete set null,
  tags text[] not null default '{}'::text[],
  seo_title text null,
  seo_description text null,
  social_title text null,
  social_description text null,
  social_image_url text null,
  source_channel text null,
  source_agent text null,
  source_ref text null,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (locale, slug)
);

alter table public.blog_posts
  add column if not exists locale text default 'en',
  add column if not exists slug text,
  add column if not exists status text default 'draft',
  add column if not exists title text,
  add column if not exists subtitle text null,
  add column if not exists excerpt text,
  add column if not exists body jsonb default '{}'::jsonb,
  add column if not exists image_url text null,
  add column if not exists image_alt text null,
  add column if not exists testimonial_id uuid null references public.testimonials(id) on delete set null,
  add column if not exists tags text[] default '{}'::text[],
  add column if not exists seo_title text null,
  add column if not exists seo_description text null,
  add column if not exists social_title text null,
  add column if not exists social_description text null,
  add column if not exists social_image_url text null,
  add column if not exists source_channel text null,
  add column if not exists source_agent text null,
  add column if not exists source_ref text null,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists published_at timestamptz null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.blog_posts
set
  locale = coalesce(locale, 'en'),
  slug = coalesce(slug, id::text),
  status = case
    when status in ('draft', 'review', 'published', 'archived') then status
    else 'draft'
  end,
  title = coalesce(title, 'Untitled article'),
  excerpt = coalesce(excerpt, ''),
  body = coalesce(body, '{}'::jsonb),
  tags = coalesce(tags, '{}'::text[]),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where locale is null
  or slug is null
  or status is null
  or status not in ('draft', 'review', 'published', 'archived')
  or title is null
  or excerpt is null
  or body is null
  or tags is null
  or metadata is null
  or created_at is null
  or updated_at is null;

alter table public.blog_posts
  alter column locale set default 'en',
  alter column locale set not null,
  alter column slug set not null,
  alter column status set default 'draft',
  alter column status set not null,
  alter column title set not null,
  alter column excerpt set not null,
  alter column body set default '{}'::jsonb,
  alter column body set not null,
  alter column tags set default '{}'::text[],
  alter column tags set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  alter table public.blog_posts
    drop constraint if exists blog_posts_locale_check;

  alter table public.blog_posts
    add constraint blog_posts_locale_check
    check (locale in ('en', 'th'));

  alter table public.blog_posts
    drop constraint if exists blog_posts_status_check;

  alter table public.blog_posts
    add constraint blog_posts_status_check
    check (status in ('draft', 'review', 'published', 'archived'));

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.blog_posts'::regclass
      and conname = 'blog_posts_locale_slug_key'
  ) then
    alter table public.blog_posts
      add constraint blog_posts_locale_slug_key unique (locale, slug);
  end if;
end $$;

create index if not exists blog_posts_published_idx
  on public.blog_posts (locale, status, published_at desc nulls last, created_at desc);

create index if not exists blog_posts_status_idx
  on public.blog_posts (status, updated_at desc);

create index if not exists blog_posts_tags_idx
  on public.blog_posts using gin (tags);

drop index if exists public.blog_testimonials_status_idx;

create index if not exists testimonials_status_idx
  on public.testimonials (locale, status, sort_order asc, created_at desc);

insert into public.testimonials (
  id,
  locale,
  status,
  quote,
  author_name,
  author_title,
  author_handle,
  author_image_url,
  author_image_alt,
  sort_order,
  source_agent,
  metadata
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'en',
    'published',
    'I liked that the guidance connected sleep, food, training and supplement choices. It felt practical, not like another generic list.',
    'Daniel P.',
    'Founder, Bangkok',
    '@daniel-wellness',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    'Smiling professional man',
    1,
    'seed',
    '{"seed": true}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'en',
    'published',
    'The useful part was knowing what to prioritise first. I did not want more products; I wanted a clearer decision.',
    'Mai S.',
    'Runner and product lead',
    '@mai-runs',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    'Smiling woman',
    2,
    'seed',
    '{"seed": true}'::jsonb
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'en',
    'published',
    'The reassessment idea made sense to me. My routine changes, so a static plan was never going to be enough.',
    'Arun K.',
    'Consultant',
    '',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    'Smiling consultant',
    3,
    'seed',
    '{"seed": true}'::jsonb
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'th',
    'published',
    'สิ่งที่ชอบคือคำแนะนำไม่ได้แยกอาหารเสริมออกจากการนอน อาหาร และการออกกำลังกาย ทำให้รู้ว่าควรเริ่มตรงไหนก่อน',
    'ธนพล พ.',
    'ผู้ก่อตั้ง, กรุงเทพฯ',
    '@thanapol-wellness',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    'ผู้ชายยิ้ม',
    1,
    'seed',
    '{"seed": true}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'th',
    'published',
    'ประโยชน์คือช่วยจัดลำดับความสำคัญ ไม่ได้ให้ซื้อของเพิ่มไปเรื่อยๆ แต่ช่วยให้ตัดสินใจง่ายขึ้น',
    'เมย์ ส.',
    'นักวิ่งและหัวหน้าทีมผลิตภัณฑ์',
    '@mai-runs',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    'ผู้หญิงยิ้ม',
    2,
    'seed',
    '{"seed": true}'::jsonb
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'th',
    'published',
    'แนวคิดการประเมินซ้ำเหมาะกับผม เพราะกิจวัตรเปลี่ยนอยู่ตลอด แผนสุขภาพจึงควรเปลี่ยนตามชีวิตจริง',
    'อรุณ ก.',
    'ที่ปรึกษา',
    '',
    null,
    null,
    3,
    'seed',
    '{"seed": true, "fallbackImageDemo": true}'::jsonb
  )
on conflict (id) do update
set
  quote = excluded.quote,
  author_name = excluded.author_name,
  author_title = excluded.author_title,
  author_handle = excluded.author_handle,
  author_image_url = excluded.author_image_url,
  author_image_alt = excluded.author_image_alt,
  sort_order = excluded.sort_order,
  source_agent = excluded.source_agent,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.blog_posts (
  id,
  locale,
  slug,
  status,
  title,
  subtitle,
  excerpt,
  body,
  image_url,
  image_alt,
  testimonial_id,
  tags,
  seo_title,
  seo_description,
  social_title,
  social_description,
  social_image_url,
  source_channel,
  source_agent,
  source_ref,
  metadata,
  published_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'en',
    'why-a-healthscore-beats-a-generic-supplement-list',
    'published',
    'Why a HealthScore beats a generic supplement list',
    'A useful plan starts by understanding what is actually holding you back.',
    'A HealthScore helps turn scattered lifestyle answers into a clearer starting point for better nutrition, recovery and supplement decisions.',
    jsonb_build_object(
      'intro', 'Most people do not need a longer supplement list. They need a clearer way to decide what matters first. A HealthScore gives the conversation a starting point before any product is recommended.',
      'points', jsonb_build_array(
        jsonb_build_object('title', 'It creates context.', 'body', 'Sleep, activity, diet, stress and habits influence each other. Scoring these areas together helps avoid treating one symptom in isolation.'),
        jsonb_build_object('title', 'It reduces guesswork.', 'body', 'Instead of starting with a trendy ingredient, the plan starts with the user profile and the strongest opportunity for improvement.'),
        jsonb_build_object('title', 'It supports follow-up.', 'body', 'When the same person returns later, the score gives the business and customer a simple way to talk about what changed.')
      ),
      'sectionTitle', 'The score is not the product',
      'sectionBody', 'The score is the moment of clarity. The formulation, product guidance and advisor support are the next steps that turn that clarity into action.',
      'closing', 'The best HealthScore experience should leave the user thinking: this understands me, and I can see what to do next.'
    ),
    'https://images.unsplash.com/photo-1496128858413-b36217c2ce36?auto=format&fit=crop&w=2400&q=80',
    'Notebook and wellness planning desk',
    '11111111-1111-4111-8111-111111111111',
    array['healthscore','personalisation','wellness'],
    'Why a HealthScore beats a generic supplement list',
    'How a HealthScore creates context before supplement recommendations.',
    'Why a HealthScore beats a generic supplement list',
    'A clearer way to begin personalised nutrition and supplement guidance.',
    'https://images.unsplash.com/photo-1496128858413-b36217c2ce36?auto=format&fit=crop&w=1200&q=80',
    'seed',
    'seed',
    'seed-healthscore',
    '{"seed": true}'::jsonb,
    now() - interval '3 days'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'en',
    'how-to-choose-supplements-without-wasting-money',
    'published',
    'How to choose supplements without wasting money',
    'The useful question is not what is popular. It is what fits your body, diet and routine.',
    'Supplement spending becomes smarter when the plan considers budget, dose, product form and what the user already gets from food.',
    jsonb_build_object(
      'intro', 'The supplement aisle is noisy. The easiest mistake is buying single products one at a time without understanding how they fit together.',
      'points', jsonb_build_array(
        jsonb_build_object('title', 'Start with the gap.', 'body', 'Diet pattern, fish intake, sun exposure, sleep and stress often explain more than a generic bestseller list.'),
        jsonb_build_object('title', 'Respect the budget.', 'body', 'A medium budget should prioritise the highest-confidence choices and avoid stacking products that overlap.'),
        jsonb_build_object('title', 'Check the form.', 'body', 'Capsules, powders and liquids can all be useful, but the right format is the one the customer will actually use.')
      ),
      'sectionTitle', 'Value comes from fit',
      'sectionBody', 'A good recommendation should explain what the product supports, why it is relevant, and how much of the plan it covers.',
      'closing', 'Smart supplement guidance should save research time, reduce trial and error, and help the customer buy fewer wrong things.'
    ),
    'https://images.unsplash.com/photo-1547586696-ea22b4d4235d?auto=format&fit=crop&w=2400&q=80',
    'Mountain landscape and clear path',
    '22222222-2222-4222-8222-222222222222',
    array['supplements','budget','product guidance'],
    'How to choose supplements without wasting money',
    'How personalised guidance can reduce wasted supplement spend.',
    'How to choose supplements without wasting money',
    'Choose supplements by fit, budget and use, not hype.',
    'https://images.unsplash.com/photo-1547586696-ea22b4d4235d?auto=format&fit=crop&w=1200&q=80',
    'seed',
    'seed',
    'seed-budget',
    '{"seed": true}'::jsonb,
    now() - interval '2 days'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    'en',
    'what-changes-after-50-energy-sleep-and-recovery',
    'published',
    'What changes after 50: energy, sleep and recovery',
    'Health goals after 50 are often less about extremes and more about consistency.',
    'After 50, the best wellness plan usually supports sleep quality, muscle maintenance, recovery and practical daily energy.',
    jsonb_build_object(
      'intro', 'Many people over 50 are not trying to become athletes. They want steadier energy, better recovery and confidence that their routine is supporting the next decade.',
      'points', jsonb_build_array(
        jsonb_build_object('title', 'Recovery matters more.', 'body', 'Sleep quality, stress and training load can change how the body responds to the same routine.'),
        jsonb_build_object('title', 'Muscle is a health signal.', 'body', 'Protein intake and resistance activity become more important for everyday strength and resilience.'),
        jsonb_build_object('title', 'Small changes compound.', 'body', 'The biggest gains often come from consistent basics, not an overloaded supplement routine.')
      ),
      'sectionTitle', 'A better plan is easier to repeat',
      'sectionBody', 'A personalised formulation should respect the customer''s appetite for complexity. Too many pills can reduce adherence even when the science is reasonable.',
      'closing', 'For a 52-year-old customer, the winning experience is clear, practical and repeatable.'
    ),
    null,
    null,
    '33333333-3333-4333-8333-333333333333',
    array['healthy aging','energy','recovery'],
    'What changes after 50: energy, sleep and recovery',
    'A practical view of wellness priorities after 50.',
    'What changes after 50: energy, sleep and recovery',
    'How sleep, recovery and consistency shape wellness after 50.',
    null,
    'seed',
    'seed',
    'seed-after-50',
    '{"seed": true}'::jsonb,
    now() - interval '1 day'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'th',
    'why-a-healthscore-beats-a-generic-supplement-list',
    'published',
    'ทำไม HealthScore ถึงดีกว่ารายการอาหารเสริมทั่วไป',
    'แผนที่ดีควรเริ่มจากการเข้าใจว่าสิ่งใดกำลังดึงสุขภาพของคุณไว้',
    'HealthScore ช่วยเปลี่ยนคำตอบเรื่องไลฟ์สไตล์ให้เป็นจุดเริ่มต้นที่ชัดขึ้นสำหรับโภชนาการ การฟื้นตัว และการเลือกอาหารเสริม',
    jsonb_build_object(
      'intro', 'หลายคนไม่ได้ต้องการรายการอาหารเสริมที่ยาวขึ้น แต่ต้องการวิธีตัดสินใจว่าสิ่งใดสำคัญก่อน HealthScore ทำหน้าที่เป็นจุดเริ่มต้นของบทสนทนา ก่อนจะแนะนำผลิตภัณฑ์ใดๆ',
      'points', jsonb_build_array(
        jsonb_build_object('title', 'สร้างบริบทให้คำแนะนำ', 'body', 'การนอน กิจกรรม อาหาร ความเครียด และพฤติกรรมสุขภาพส่งผลต่อกัน การดูร่วมกันช่วยลดการตัดสินใจจากข้อมูลเพียงด้านเดียว'),
        jsonb_build_object('title', 'ลดการเดา', 'body', 'แทนที่จะเริ่มจากส่วนผสมที่กำลังนิยม แผนเริ่มจากโปรไฟล์ของผู้ใช้และโอกาสที่น่าจะสร้างผลลัพธ์มากที่สุด'),
        jsonb_build_object('title', 'รองรับการติดตามผล', 'body', 'เมื่อผู้ใช้กลับมาประเมินอีกครั้ง คะแนนช่วยให้เห็นได้ง่ายว่าสิ่งใดเปลี่ยนไป')
      ),
      'sectionTitle', 'คะแนนไม่ใช่ผลิตภัณฑ์',
      'sectionBody', 'คะแนนคือช่วงเวลาที่ทำให้เห็นภาพชัด ส่วนสูตร คำแนะนำผลิตภัณฑ์ และการดูแลต่อเนื่องคือขั้นตอนที่เปลี่ยนความชัดเจนนั้นให้เป็นการลงมือทำ',
      'closing', 'ประสบการณ์ HealthScore ที่ดีควรทำให้ผู้ใช้รู้สึกว่า แบรนด์เข้าใจฉัน และฉันเห็นขั้นตอนถัดไปแล้ว'
    ),
    'https://images.unsplash.com/photo-1496128858413-b36217c2ce36?auto=format&fit=crop&w=2400&q=80',
    'สมุดบันทึกและโต๊ะวางแผนสุขภาพ',
    '44444444-4444-4444-8444-444444444444',
    array['healthscore','personalisation','wellness'],
    'ทำไม HealthScore ถึงดีกว่ารายการอาหารเสริมทั่วไป',
    'HealthScore ช่วยสร้างบริบทก่อนคำแนะนำอาหารเสริมอย่างไร',
    'ทำไม HealthScore ถึงดีกว่ารายการอาหารเสริมทั่วไป',
    'วิธีเริ่มต้นโภชนาการและอาหารเสริมเฉพาะบุคคลอย่างชัดเจนขึ้น',
    'https://images.unsplash.com/photo-1496128858413-b36217c2ce36?auto=format&fit=crop&w=1200&q=80',
    'seed',
    'seed',
    'seed-healthscore-th',
    '{"seed": true}'::jsonb,
    now() - interval '3 days'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'th',
    'how-to-choose-supplements-without-wasting-money',
    'published',
    'เลือกอาหารเสริมอย่างไรไม่ให้เสียเงินเปล่า',
    'คำถามที่สำคัญไม่ใช่อะไรกำลังนิยม แต่คืออะไรเหมาะกับร่างกาย อาหาร และกิจวัตรของคุณ',
    'การใช้งบกับอาหารเสริมจะฉลาดขึ้นเมื่อแผนดูงบประมาณ ปริมาณ รูปแบบผลิตภัณฑ์ และสิ่งที่คุณได้รับจากอาหารอยู่แล้ว',
    jsonb_build_object(
      'intro', 'โลกของอาหารเสริมมีเสียงรบกวนมาก ความผิดพลาดที่พบบ่อยคือซื้อทีละชิ้นโดยไม่รู้ว่ามันเข้ากับแผนรวมอย่างไร',
      'points', jsonb_build_array(
        jsonb_build_object('title', 'เริ่มจากช่องว่าง', 'body', 'รูปแบบอาหาร การกินปลา แสงแดด การนอน และความเครียดมักอธิบายความต้องการได้ดีกว่ารายการขายดีทั่วไป'),
        jsonb_build_object('title', 'เคารพงบประมาณ', 'body', 'งบปานกลางควรใช้กับสิ่งที่มั่นใจสูงที่สุด และหลีกเลี่ยงผลิตภัณฑ์ที่ซ้ำซ้อนกัน'),
        jsonb_build_object('title', 'ดูรูปแบบการใช้', 'body', 'แคปซูล ผง หรือของเหลวล้วนมีประโยชน์ได้ แต่รูปแบบที่ดีที่สุดคือรูปแบบที่ผู้ใช้ทำได้จริง')
      ),
      'sectionTitle', 'คุณค่ามาจากความเหมาะสม',
      'sectionBody', 'คำแนะนำที่ดีควรอธิบายว่าผลิตภัณฑ์ช่วยอะไร เหตุใดจึงเกี่ยวข้อง และครอบคลุมแผนได้มากแค่ไหน',
      'closing', 'คำแนะนำอาหารเสริมที่ฉลาดควรลดเวลาค้นหา ลดการลองผิดลองถูก และช่วยให้ลูกค้าซื้อของผิดน้อยลง'
    ),
    'https://images.unsplash.com/photo-1547586696-ea22b4d4235d?auto=format&fit=crop&w=2400&q=80',
    'เส้นทางภูเขาที่มองเห็นชัด',
    '55555555-5555-4555-8555-555555555555',
    array['supplements','budget','product guidance'],
    'เลือกอาหารเสริมอย่างไรไม่ให้เสียเงินเปล่า',
    'คำแนะนำเฉพาะบุคคลช่วยลดค่าใช้จ่ายอาหารเสริมที่ไม่จำเป็นได้อย่างไร',
    'เลือกอาหารเสริมอย่างไรไม่ให้เสียเงินเปล่า',
    'เลือกจากความเหมาะสม งบประมาณ และการใช้งานจริง ไม่ใช่กระแส',
    'https://images.unsplash.com/photo-1547586696-ea22b4d4235d?auto=format&fit=crop&w=1200&q=80',
    'seed',
    'seed',
    'seed-budget-th',
    '{"seed": true}'::jsonb,
    now() - interval '2 days'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    'th',
    'what-changes-after-50-energy-sleep-and-recovery',
    'published',
    'หลังอายุ 50 อะไรเปลี่ยนไป: พลังงาน การนอน และการฟื้นตัว',
    'เป้าหมายสุขภาพหลัง 50 มักไม่ใช่ความสุดโต่ง แต่คือความสม่ำเสมอ',
    'หลังอายุ 50 แผนสุขภาพที่ดีมักสนับสนุนคุณภาพการนอน กล้ามเนื้อ การฟื้นตัว และพลังงานที่ใช้ได้จริงในแต่ละวัน',
    jsonb_build_object(
      'intro', 'หลายคนหลังอายุ 50 ไม่ได้ต้องการเป็นนักกีฬา แต่อยากมีพลังงานที่นิ่งขึ้น ฟื้นตัวดีขึ้น และมั่นใจว่ากิจวัตรของตนกำลังสนับสนุนสิบปีข้างหน้า',
      'points', jsonb_build_array(
        jsonb_build_object('title', 'การฟื้นตัวสำคัญขึ้น', 'body', 'คุณภาพการนอน ความเครียด และภาระการออกกำลังกายเปลี่ยนวิธีที่ร่างกายตอบสนองต่อกิจวัตรเดิมได้'),
        jsonb_build_object('title', 'กล้ามเนื้อคือสัญญาณสุขภาพ', 'body', 'โปรตีนและกิจกรรมแรงต้านสำคัญขึ้นต่อความแข็งแรงและความยืดหยุ่นในชีวิตประจำวัน'),
        jsonb_build_object('title', 'การเปลี่ยนแปลงเล็กๆ สะสมผล', 'body', 'ผลลัพธ์ที่ใหญ่ที่สุดมักมาจากพื้นฐานที่ทำสม่ำเสมอ ไม่ใช่สูตรอาหารเสริมที่ซับซ้อนเกินไป')
      ),
      'sectionTitle', 'แผนที่ดีต้องทำซ้ำได้ง่าย',
      'sectionBody', 'สูตรเฉพาะบุคคลควรเคารพความพร้อมของลูกค้าในการจัดการความซับซ้อน ยามากเกินไปอาจทำให้ทำตามยาก แม้เหตุผลทางวิทยาศาสตร์จะดี',
      'closing', 'สำหรับลูกค้าอายุ 52 ปี ประสบการณ์ที่ชนะคือชัดเจน ทำได้จริง และทำซ้ำได้'
    ),
    null,
    null,
    '66666666-6666-4666-8666-666666666666',
    array['healthy aging','energy','recovery'],
    'หลังอายุ 50 อะไรเปลี่ยนไป: พลังงาน การนอน และการฟื้นตัว',
    'มุมมองที่ใช้งานได้จริงต่อสุขภาพหลังอายุ 50',
    'หลังอายุ 50 อะไรเปลี่ยนไป: พลังงาน การนอน และการฟื้นตัว',
    'การนอน การฟื้นตัว และความสม่ำเสมอช่วยวางสุขภาพหลัง 50 อย่างไร',
    null,
    'seed',
    'seed',
    'seed-after-50-th',
    '{"seed": true}'::jsonb,
    now() - interval '1 day'
  )
on conflict (locale, slug) do update
set
  status = excluded.status,
  title = excluded.title,
  subtitle = excluded.subtitle,
  excerpt = excluded.excerpt,
  body = excluded.body,
  image_url = excluded.image_url,
  image_alt = excluded.image_alt,
  testimonial_id = excluded.testimonial_id,
  tags = excluded.tags,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  social_title = excluded.social_title,
  social_description = excluded.social_description,
  social_image_url = excluded.social_image_url,
  source_channel = excluded.source_channel,
  source_agent = excluded.source_agent,
  source_ref = excluded.source_ref,
  metadata = excluded.metadata,
  published_at = excluded.published_at,
  updated_at = now();

-- DOADMIN can apply this script in UAT. If a lower-privilege user reapplies it
-- locally, ownership changes are skipped with notices rather than aborting.
do $$
begin
  begin
    execute 'alter schema public owner to mn';
  exception when others then
    raise notice 'Skipping schema owner change: %', sqlerrm;
  end;

  begin
    execute 'grant usage, create on schema public to mn';
  exception when others then
    raise notice 'Skipping schema grant: %', sqlerrm;
  end;

  begin
    if current_user = 'mn' then
      raise notice 'Skipping database grant: already running as mn';
    else
      execute format('grant connect, create on database %I to mn', current_database());
    end if;
  exception when others then
    raise notice 'Skipping database grant: %', sqlerrm;
  end;

  begin
    execute 'grant all privileges on all tables in schema public to mn';
  exception when others then
    raise notice 'Skipping table grants: %', sqlerrm;
  end;

  begin
    execute 'grant all privileges on all sequences in schema public to mn';
  exception when others then
    raise notice 'Skipping sequence grants: %', sqlerrm;
  end;

  begin
    execute 'alter default privileges in schema public grant all privileges on tables to mn';
  exception when others then
    raise notice 'Skipping default table grants: %', sqlerrm;
  end;

  begin
    execute 'alter default privileges in schema public grant all privileges on sequences to mn';
  exception when others then
    raise notice 'Skipping default sequence grants: %', sqlerrm;
  end;

  begin
    execute 'alter type public.assessment_plan owner to mn';
  exception when others then
    raise notice 'Skipping assessment_plan owner change: %', sqlerrm;
  end;

  begin
    execute 'alter type public.assessment_status owner to mn';
  exception when others then
    raise notice 'Skipping assessment_status owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.assessments owner to mn';
  exception when others then
    raise notice 'Skipping assessments owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.ai_response_cache owner to mn';
  exception when others then
    raise notice 'Skipping ai_response_cache owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.jobs owner to mn';
  exception when others then
    raise notice 'Skipping jobs owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.formulations owner to mn';
  exception when others then
    raise notice 'Skipping formulations owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.recommendations owner to mn';
  exception when others then
    raise notice 'Skipping recommendations owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.job_audit_events owner to mn';
  exception when others then
    raise notice 'Skipping job_audit_events owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.assessment_example_requests owner to mn';
  exception when others then
    raise notice 'Skipping assessment_example_requests owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.cron owner to mn';
  exception when others then
    raise notice 'Skipping cron owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.bpm owner to mn';
  exception when others then
    raise notice 'Skipping bpm owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.supplements owner to mn';
  exception when others then
    raise notice 'Skipping supplements owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.supplement_safety_limits owner to mn';
  exception when others then
    raise notice 'Skipping supplement_safety_limits owner change: %', sqlerrm;
  end;

  begin
    execute 'alter function public.mattanutra_supplement_safety_flags(text) owner to mn';
  exception when others then
    raise notice 'Skipping mattanutra_supplement_safety_flags owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.supplement_aliases owner to mn';
  exception when others then
    raise notice 'Skipping supplement_aliases owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.supplement_admin_audit owner to mn';
  exception when others then
    raise notice 'Skipping supplement_admin_audit owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.safety_reviews owner to mn';
  exception when others then
    raise notice 'Skipping safety_reviews owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.testimonials owner to mn';
  exception when others then
    raise notice 'Skipping testimonials owner change: %', sqlerrm;
  end;

  begin
    execute 'alter table public.blog_posts owner to mn';
  exception when others then
    raise notice 'Skipping blog_posts owner change: %', sqlerrm;
  end;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mn') then
    grant select, insert, update, delete
      on public.supplements,
         public.supplement_safety_limits,
         public.supplement_aliases,
         public.supplement_admin_audit,
         public.safety_reviews
      to mn;

    grant execute
      on function public.mattanutra_supplement_safety_flags(text)
      to mn;
  end if;
exception when others then
  raise notice 'Skipping supplement admin grants: %', sqlerrm;
end $$;
