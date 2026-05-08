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
