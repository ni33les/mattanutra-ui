import { getSql } from "@/lib/db";

const schemaSql = `
create or replace function public.prevent_domain_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is an append-only version table', tg_table_name;
end;
$$;

do $$
begin
  if to_regclass('public.assessment_events') is not null
     and to_regclass('public.legacy_assessment_events') is null then
    alter table public.assessment_events rename to legacy_assessment_events;
  end if;

  if to_regclass('public.supplement_alias_events') is not null
     and to_regclass('public.legacy_supplement_alias_events') is null then
    alter table public.supplement_alias_events rename to legacy_supplement_alias_events;
  end if;

  if to_regclass('public.product_fact_versions') is not null
     and to_regclass('public.legacy_product_fact_versions') is null then
    alter table public.product_fact_versions rename to legacy_product_fact_versions;
  end if;
end $$;

create table if not exists public.assessment_versions (
  plan_id uuid not null,
  version integer not null,
  action text not null,
  actor text not null default 'system',
  reason text not null,
  source text not null default 'application',
  task_id uuid null,
  request_id text null,
  snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (plan_id, version)
);

create table if not exists public.nutrition_plan_versions (
  plan_id uuid not null,
  version integer not null,
  action text not null,
  actor text not null default 'system',
  reason text not null,
  source text not null default 'application',
  task_id uuid null,
  request_id text null,
  snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (plan_id, version)
);

alter table public.supplement_versions
  add column if not exists snapshot jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.product_versions
  add column if not exists reason text null,
  add column if not exists source text default 'application',
  add column if not exists task_id uuid null,
  add column if not exists request_id text null,
  add column if not exists snapshot jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.product_versions
  drop constraint if exists product_versions_product_id_fkey;

alter table public.assessment_versions
  alter column snapshot set default '{}'::jsonb,
  alter column snapshot set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

alter table public.nutrition_plan_versions
  alter column snapshot set default '{}'::jsonb,
  alter column snapshot set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

alter table public.supplement_versions
  alter column snapshot set default '{}'::jsonb,
  alter column snapshot set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

alter table public.product_versions
  alter column source set default 'application',
  alter column source set not null,
  alter column snapshot set default '{}'::jsonb,
  alter column snapshot set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

insert into public.assessment_versions (
  plan_id,
  version,
  action,
  actor,
  reason,
  source,
  snapshot,
  metadata
)
select
  assessments.plan_id,
  1,
  'baseline',
  'system_backfill',
  'versioned_projection_baseline',
  'schema_backfill',
  to_jsonb(assessments),
  '{}'::jsonb
from public.assessments
where not exists (
  select 1
  from public.assessment_versions existing
  where existing.plan_id = assessments.plan_id
);

insert into public.nutrition_plan_versions (
  plan_id,
  version,
  action,
  actor,
  reason,
  source,
  snapshot,
  metadata
)
select
  assessments.plan_id,
  1,
  'baseline',
  'system_backfill',
  'versioned_projection_baseline',
  'schema_backfill',
  jsonb_build_object(
    'selectedPlan', assessments.selected_plan,
    'formulations', coalesce(formulation_rows.formulations, '[]'::jsonb),
    'recommendations', coalesce(recommendation_rows.recommendations, '[]'::jsonb)
  ),
  '{}'::jsonb
from public.assessments
left join lateral (
  select jsonb_agg(to_jsonb(formulations) order by formulations.version asc) as formulations
  from public.formulations
  where formulations.plan_id = assessments.plan_id
) formulation_rows on true
left join lateral (
  select jsonb_agg(to_jsonb(recommendations) order by recommendations.version asc) as recommendations
  from public.recommendations
  where recommendations.plan_id = assessments.plan_id
) recommendation_rows on true
where not exists (
  select 1
  from public.nutrition_plan_versions existing
  where existing.plan_id = assessments.plan_id
);

insert into public.supplement_versions (
  supplement_id,
  version,
  action,
  actor,
  change_reason,
  source,
  before_payload,
  after_payload,
  snapshot,
  metadata
)
select
  supplements.id,
  1,
  'baseline',
  'system_backfill',
  'versioned_projection_baseline',
  'schema_backfill',
  '{}'::jsonb,
  jsonb_build_object(
    'supplement', to_jsonb(supplements),
    'aliases', coalesce(alias_rows.aliases, '[]'::jsonb),
    'safetyLimits', coalesce(limit_rows.limits, '[]'::jsonb)
  ),
  jsonb_build_object(
    'supplement', to_jsonb(supplements),
    'aliases', coalesce(alias_rows.aliases, '[]'::jsonb),
    'safetyLimits', coalesce(limit_rows.limits, '[]'::jsonb)
  ),
  '{}'::jsonb
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
);

insert into public.product_versions (
  product_id,
  version,
  actor,
  change_note,
  reason,
  source,
  title,
  title_en,
  title_th,
  brand_name,
  normalized_brand_name,
  image_url,
  product_url,
  normalized_url,
  description,
  description_en,
  description_th,
  fda_approval_number,
  product_kind,
  product_audience,
  status,
  label_status,
  availability_status,
  affiliate_status,
  price_amount,
  currency,
  validation_status,
  validation_reasons,
  validation_summary,
  validation_checked_at,
  facts_snapshot,
  source_snapshot,
  snapshot,
  metadata
)
select
  products.id,
  1,
  'system_backfill',
  'versioned_projection_baseline',
  'versioned_projection_baseline',
  'schema_backfill',
  products.title,
  products.title_en,
  products.title_th,
  products.brand_name,
  products.normalized_brand_name,
  products.image_url,
  products.product_url,
  products.normalized_url,
  products.description,
  products.description_en,
  products.description_th,
  products.fda_approval_number,
  products.product_kind,
  products.product_audience,
  products.status,
  products.label_status,
  products.availability_status,
  products.affiliate_status,
  products.price_amount,
  products.currency,
  products.validation_status,
  products.validation_reasons,
  products.validation_summary,
  products.validation_checked_at,
  coalesce(fact_rows.facts, '[]'::jsonb),
  products.source_snapshot,
  jsonb_build_object(
    'product', to_jsonb(products),
    'facts', coalesce(fact_rows.facts, '[]'::jsonb)
  ),
  '{}'::jsonb
from public.products
left join lateral (
  select jsonb_agg(to_jsonb(product_facts) order by product_facts.created_at asc) as facts
  from public.product_facts
  where product_facts.product_id = products.id
) fact_rows on true
where not exists (
  select 1
  from public.product_versions existing
  where existing.product_id = products.id
);

create index if not exists assessment_versions_latest_idx
  on public.assessment_versions (plan_id, version desc, created_at desc);

create index if not exists nutrition_plan_versions_latest_idx
  on public.nutrition_plan_versions (plan_id, version desc, created_at desc);

create index if not exists supplement_versions_latest_idx
  on public.supplement_versions (supplement_id, version desc);

create index if not exists product_versions_latest_idx
  on public.product_versions (product_id, version desc);

drop trigger if exists assessment_versions_no_update_delete on public.assessment_versions;
create trigger assessment_versions_no_update_delete
  before update or delete on public.assessment_versions
  for each row execute function public.prevent_domain_version_mutation();

drop trigger if exists nutrition_plan_versions_no_update_delete on public.nutrition_plan_versions;
create trigger nutrition_plan_versions_no_update_delete
  before update or delete on public.nutrition_plan_versions
  for each row execute function public.prevent_domain_version_mutation();

drop trigger if exists supplement_versions_no_update_delete on public.supplement_versions;
create trigger supplement_versions_no_update_delete
  before update or delete on public.supplement_versions
  for each row execute function public.prevent_domain_version_mutation();

drop trigger if exists product_versions_no_update_delete on public.product_versions;
create trigger product_versions_no_update_delete
  before update or delete on public.product_versions
  for each row execute function public.prevent_domain_version_mutation();

drop trigger if exists supplement_safety_limits_no_update_delete on public.supplement_safety_limits;
create trigger supplement_safety_limits_no_update_delete
  before update or delete on public.supplement_safety_limits
  for each row execute function public.prevent_domain_version_mutation();

drop trigger if exists product_recommendation_runs_no_update_delete on public.product_recommendation_runs;
create trigger product_recommendation_runs_no_update_delete
  before update or delete on public.product_recommendation_runs
  for each row execute function public.prevent_domain_version_mutation();

drop trigger if exists product_recommendation_items_no_update_delete on public.product_recommendation_items;
create trigger product_recommendation_items_no_update_delete
  before update or delete on public.product_recommendation_items
  for each row execute function public.prevent_domain_version_mutation();
`;

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured");
}

await sql.unsafe(schemaSql);
await sql.end({ timeout: 1 });

console.log("Core append-only versioned model schema applied.");
