import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to apply Panya schema");
}

try {
  await sql`
    create table if not exists public.panya_config_versions (
      id uuid primary key default gen_random_uuid(),
      version integer not null,
      status text not null default 'active',
      config jsonb not null default '{}'::jsonb,
      created_by_person_id uuid null references public.people(id) on delete set null,
      activated_by_person_id uuid null references public.people(id) on delete set null,
      activated_at timestamptz null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint panya_config_versions_status_check check (
        status in ('draft', 'active', 'archived')
      )
    )
  `;

  await sql`
    alter table public.panya_config_versions
      add column if not exists version integer not null default 1,
      add column if not exists status text not null default 'active',
      add column if not exists config jsonb not null default '{}'::jsonb,
      add column if not exists created_by_person_id uuid null references public.people(id) on delete set null,
      add column if not exists activated_by_person_id uuid null references public.people(id) on delete set null,
      add column if not exists activated_at timestamptz null,
      add column if not exists metadata jsonb not null default '{}'::jsonb,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now()
  `;

  await sql`
    alter table public.panya_config_versions
      drop constraint if exists panya_config_versions_status_check
  `;

  await sql`
    alter table public.panya_config_versions
      add constraint panya_config_versions_status_check check (
        status in ('draft', 'active', 'archived')
      )
  `;

  await sql`
    create unique index if not exists panya_config_versions_active_idx
      on public.panya_config_versions (status)
      where status = 'active'
  `;

  await sql`
    create unique index if not exists panya_config_versions_version_idx
      on public.panya_config_versions (version)
  `;

  await sql`
    create table if not exists public.panya_daily_usage (
      id uuid primary key default gen_random_uuid(),
      conversation_key text not null,
      plan_id uuid null references public.assessments(plan_id) on delete set null,
      identity_id uuid null references public.communication_identities(id) on delete set null,
      channel_id uuid null references public.communication_channels(id) on delete set null,
      usage_day date not null,
      timezone text not null,
      entitlement text not null,
      source text not null default 'line',
      user_message_count integer not null default 0,
      quota_limit integer not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint panya_daily_usage_entitlement_check check (
        entitlement in ('living_protocol', 'right_amount_formula', 'unpaid')
      ),
      constraint panya_daily_usage_count_check check (
        user_message_count >= 0 and quota_limit > 0
      )
    )
  `;

  await sql`
    alter table public.panya_daily_usage
      add column if not exists conversation_key text,
      add column if not exists plan_id uuid null references public.assessments(plan_id) on delete set null,
      add column if not exists identity_id uuid null references public.communication_identities(id) on delete set null,
      add column if not exists channel_id uuid null references public.communication_channels(id) on delete set null,
      add column if not exists usage_day date,
      add column if not exists timezone text,
      add column if not exists entitlement text,
      add column if not exists source text not null default 'line',
      add column if not exists user_message_count integer not null default 0,
      add column if not exists quota_limit integer not null default 12,
      add column if not exists metadata jsonb not null default '{}'::jsonb,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now()
  `;

  await sql`
    update public.panya_daily_usage
    set
      conversation_key = coalesce(nullif(conversation_key, ''), coalesce(identity_id::text, 'no-identity') || ':' || coalesce(plan_id::text, id::text)),
      usage_day = coalesce(usage_day, current_date),
      timezone = coalesce(nullif(timezone, ''), 'UTC'),
      entitlement = coalesce(nullif(entitlement, ''), 'unpaid'),
      quota_limit = greatest(coalesce(quota_limit, 12), 1),
      metadata = coalesce(metadata, '{}'::jsonb),
      updated_at = now()
  `;

  await sql`
    alter table public.panya_daily_usage
      alter column conversation_key set not null,
      alter column usage_day set not null,
      alter column timezone set not null,
      alter column entitlement set not null,
      drop constraint if exists panya_daily_usage_entitlement_check,
      drop constraint if exists panya_daily_usage_count_check
  `;

  await sql`
    alter table public.panya_daily_usage
      add constraint panya_daily_usage_entitlement_check check (
        entitlement in ('living_protocol', 'right_amount_formula', 'unpaid')
      ),
      add constraint panya_daily_usage_count_check check (
        user_message_count >= 0 and quota_limit > 0
      )
  `;

  await sql`
    create unique index if not exists panya_daily_usage_unique_day_idx
      on public.panya_daily_usage (conversation_key, usage_day)
  `;

  await sql`
    create index if not exists panya_daily_usage_plan_idx
      on public.panya_daily_usage (plan_id, usage_day desc)
      where plan_id is not null
  `;

  await sql`
    create index if not exists panya_daily_usage_channel_idx
      on public.panya_daily_usage (channel_id, usage_day desc)
      where channel_id is not null
  `;

  await sql`
    do $$
    begin
      if exists (select 1 from pg_roles where rolname = 'mn') then
        grant usage on schema public to mn;
        grant select, insert, update, delete on table
          public.panya_config_versions,
          public.panya_daily_usage
        to mn;
      end if;
    end $$
  `;
} finally {
  await closeSqlPool();
}

console.log("Panya schema applied.");
