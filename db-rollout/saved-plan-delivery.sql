-- A saved link is delivered once per plan/address, independently of calculation revisions and display-language changes.
create table if not exists public.saved_plan_delivery_requests (
  id uuid primary key,
  plan_id uuid not null references public.assessments(plan_id) on delete cascade,
  locale text not null references public.site_locales(code),
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'unknown', 'superseded')),
  task_id uuid,
  provider_message_id text,
  error_message text,
  attempts integer not null default 0 check (attempts between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (plan_id, email)
);
create index if not exists saved_plan_delivery_pending_idx on public.saved_plan_delivery_requests(updated_at)
  where status in ('queued', 'failed', 'sending');

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mn') then
    grant select, insert, update, delete on public.saved_plan_delivery_requests to mn;
  end if;
end $$;
