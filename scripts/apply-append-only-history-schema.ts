import { getSql } from "@/lib/db";

const schemaSql = `
create or replace function public.prevent_domain_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create table if not exists public.assessment_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  event_type text not null,
  actor text not null default 'system',
  change_reason text not null,
  source text not null default 'application',
  task_id uuid null,
  request_id text null,
  before_payload jsonb not null default '{}'::jsonb,
  after_payload jsonb not null default '{}'::jsonb,
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists assessment_events_plan_idx
  on public.assessment_events (plan_id, occurred_at asc, created_at asc);

insert into public.assessment_events (
  plan_id,
  event_type,
  actor,
  change_reason,
  source,
  before_payload,
  after_payload,
  event_payload,
  occurred_at,
  created_at
)
select
  assessments.plan_id,
  'baseline',
  'system_backfill',
  'append_only_baseline',
  'schema_backfill',
  '{}'::jsonb,
  to_jsonb(assessments),
  '{}'::jsonb,
  coalesce(assessments.captured_at, now()),
  now()
from public.assessments
where not exists (
  select 1
  from public.assessment_events existing
  where existing.plan_id = assessments.plan_id
    and existing.event_type = 'baseline'
    and existing.change_reason = 'append_only_baseline'
);

drop trigger if exists assessment_events_no_update_delete
  on public.assessment_events;

create trigger assessment_events_no_update_delete
  before update or delete on public.assessment_events
  for each row execute function public.prevent_domain_history_mutation();

create table if not exists public.supplement_versions (
  supplement_id uuid not null,
  version integer not null,
  action text not null,
  actor text not null default 'system',
  change_reason text not null,
  source text not null default 'application',
  before_payload jsonb not null default '{}'::jsonb,
  after_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (supplement_id, version)
);

create index if not exists supplement_versions_latest_idx
  on public.supplement_versions (supplement_id, version desc);

insert into public.supplement_versions (
  supplement_id,
  version,
  action,
  actor,
  change_reason,
  source,
  before_payload,
  after_payload,
  created_at
)
select
  supplements.id,
  1,
  'baseline',
  'system_backfill',
  'append_only_baseline',
  'schema_backfill',
  '{}'::jsonb,
  jsonb_build_object(
    'supplement', to_jsonb(supplements),
    'aliases', coalesce(alias_rows.aliases, '[]'::jsonb),
    'safetyLimits', coalesce(limit_rows.limits, '[]'::jsonb)
  ),
  now()
from public.supplements
left join lateral (
  select jsonb_agg(to_jsonb(supplement_aliases) order by supplement_aliases.created_at asc) as aliases
  from public.supplement_aliases
  where supplement_aliases.supplement_id = supplements.id
) alias_rows on true
left join lateral (
  select jsonb_agg(to_jsonb(supplement_safety_limits) order by supplement_safety_limits.version asc) as limits
  from public.supplement_safety_limits
  where supplement_safety_limits.supplement_id = supplements.id
) limit_rows on true
where not exists (
  select 1
  from public.supplement_versions existing
  where existing.supplement_id = supplements.id
    and existing.action = 'baseline'
    and existing.change_reason = 'append_only_baseline'
);

drop trigger if exists supplement_versions_no_update_delete
  on public.supplement_versions;

create trigger supplement_versions_no_update_delete
  before update or delete on public.supplement_versions
  for each row execute function public.prevent_domain_history_mutation();

create table if not exists public.supplement_alias_events (
  id uuid primary key default gen_random_uuid(),
  alias_id uuid null,
  supplement_id uuid null,
  normalized_alias text null,
  action text not null,
  actor text not null default 'system',
  change_reason text not null,
  source text not null default 'application',
  before_payload jsonb not null default '{}'::jsonb,
  after_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists supplement_alias_events_supplement_idx
  on public.supplement_alias_events (supplement_id, created_at asc)
  where supplement_id is not null;

create index if not exists supplement_alias_events_alias_idx
  on public.supplement_alias_events (normalized_alias, created_at asc)
  where normalized_alias is not null;

insert into public.supplement_alias_events (
  alias_id,
  supplement_id,
  normalized_alias,
  action,
  actor,
  change_reason,
  source,
  before_payload,
  after_payload,
  created_at
)
select
  supplement_aliases.id,
  supplement_aliases.supplement_id,
  supplement_aliases.normalized_alias,
  'baseline',
  'system_backfill',
  'append_only_baseline',
  'schema_backfill',
  '{}'::jsonb,
  to_jsonb(supplement_aliases),
  coalesce(supplement_aliases.created_at, now())
from public.supplement_aliases
where not exists (
  select 1
  from public.supplement_alias_events existing
  where existing.alias_id = supplement_aliases.id
    and existing.action = 'baseline'
    and existing.change_reason = 'append_only_baseline'
);

drop trigger if exists supplement_alias_events_no_update_delete
  on public.supplement_alias_events;

create trigger supplement_alias_events_no_update_delete
  before update or delete on public.supplement_alias_events
  for each row execute function public.prevent_domain_history_mutation();

create table if not exists public.product_fact_versions (
  product_id uuid not null,
  version integer not null,
  action text not null,
  actor text not null default 'system',
  change_reason text not null,
  source text not null default 'application',
  before_facts_snapshot jsonb not null default '[]'::jsonb,
  after_facts_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (product_id, version)
);

create index if not exists product_fact_versions_latest_idx
  on public.product_fact_versions (product_id, version desc);

insert into public.product_fact_versions (
  product_id,
  version,
  action,
  actor,
  change_reason,
  source,
  before_facts_snapshot,
  after_facts_snapshot,
  created_at
)
select
  products.id,
  1,
  'baseline',
  'system_backfill',
  'append_only_baseline',
  'schema_backfill',
  '[]'::jsonb,
  coalesce(fact_rows.facts, '[]'::jsonb),
  now()
from public.products
left join lateral (
  select jsonb_agg(to_jsonb(product_facts) order by product_facts.created_at asc) as facts
  from public.product_facts
  where product_facts.product_id = products.id
) fact_rows on true
where not exists (
  select 1
  from public.product_fact_versions existing
  where existing.product_id = products.id
    and existing.action = 'baseline'
    and existing.change_reason = 'append_only_baseline'
);

drop trigger if exists product_fact_versions_no_update_delete
  on public.product_fact_versions;

create trigger product_fact_versions_no_update_delete
  before update or delete on public.product_fact_versions
  for each row execute function public.prevent_domain_history_mutation();

drop trigger if exists product_versions_no_update_delete
  on public.product_versions;

create trigger product_versions_no_update_delete
  before update or delete on public.product_versions
  for each row execute function public.prevent_domain_history_mutation();

drop trigger if exists supplement_safety_limits_no_update_delete
  on public.supplement_safety_limits;

create trigger supplement_safety_limits_no_update_delete
  before update or delete on public.supplement_safety_limits
  for each row execute function public.prevent_domain_history_mutation();

drop trigger if exists product_recommendation_runs_no_update_delete
  on public.product_recommendation_runs;

create trigger product_recommendation_runs_no_update_delete
  before update or delete on public.product_recommendation_runs
  for each row execute function public.prevent_domain_history_mutation();

drop trigger if exists product_recommendation_items_no_update_delete
  on public.product_recommendation_items;

create trigger product_recommendation_items_no_update_delete
  before update or delete on public.product_recommendation_items
  for each row execute function public.prevent_domain_history_mutation();
`;

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured");
}

await sql.unsafe(schemaSql);
await sql.end({ timeout: 1 });

console.log("Append-only history schema applied.");
