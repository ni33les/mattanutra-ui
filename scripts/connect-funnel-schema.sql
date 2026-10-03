create table if not exists public.connect_attempts (
  id uuid primary key,
  environment text not null check (environment in ('dev','uat','prd')),
  provider text not null check (provider in ('claude','perplexity','chatgpt','grok')),
  locale text not null check (locale in ('en','th','zh-CN')),
  owner_hash text not null,
  visitor_id uuid not null,
  campaign jsonb not null default '{}'::jsonb,
  meta_context_id uuid references public.meta_tracking_contexts(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  meta_recorded_at timestamptz
);
create index if not exists connect_attempts_pending_meta on public.connect_attempts(environment, verified_at)
  where verified_at is not null and meta_recorded_at is null;
create table if not exists public.connect_funnel_events (
  id uuid primary key,
  environment text not null check (environment in ('dev','uat','prd')),
  event_name text not null check (event_name in ('page_viewed','provider_selected','url_copied','provider_opened','prompt_copied','verified')),
  provider text check (provider in ('claude','perplexity','chatgpt','grok')),
  locale text not null check (locale in ('en','th','zh-CN')),
  visitor_id uuid not null,
  attempt_id uuid references public.connect_attempts(id) on delete set null,
  campaign jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  check (event_name <> 'verified' or attempt_id is not null)
);
create unique index if not exists connect_funnel_verified_once on public.connect_funnel_events(attempt_id) where event_name='verified';
create index if not exists connect_funnel_events_report on public.connect_funnel_events(environment, occurred_at);
