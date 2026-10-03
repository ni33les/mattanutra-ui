create table if not exists public.meta_tracking_contexts (
  id uuid primary key,
  environment text not null check (environment in ('dev','uat','prd')),
  consent_version integer not null default 1,
  consent_granted boolean not null,
  attribution jsonb not null default '{}'::jsonb,
  matching jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create table if not exists public.meta_tracking_bindings (
  resource_type text not null check (resource_type in ('plan','payment','retail','agentic')),
  resource_id text not null,
  context_id uuid not null references public.meta_tracking_contexts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_type, resource_id)
);
create table if not exists public.meta_conversion_events (
  id uuid primary key,
  environment text not null check (environment in ('dev','uat','prd')),
  pixel_id text not null,
  event_name text not null,
  source_key text not null,
  context_id uuid not null references public.meta_tracking_contexts(id) on delete cascade,
  source_url text,
  custom_data jsonb not null,
  occurred_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','sending','accepted','retrying','rejected','suppressed')),
  attempts integer not null default 0,
  task_id uuid,
  lease_id uuid,
  lease_until timestamptz,
  response_code integer,
  response_message text,
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(environment,pixel_id,event_name,source_key)
);
create index if not exists meta_conversion_events_status_idx on public.meta_conversion_events(status,occurred_at);
create index if not exists meta_conversion_events_context_idx on public.meta_conversion_events(context_id);
create index if not exists meta_tracking_bindings_context_idx on public.meta_tracking_bindings(context_id);
