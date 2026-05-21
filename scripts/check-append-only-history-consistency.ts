import { getSql } from "@/lib/db";

const repair = process.argv.includes("--repair");

const repairSql = `
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
  'consistency_repair',
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
  created_at
)
select
  supplements.id,
  1,
  'baseline',
  'system_backfill',
  'append_only_baseline',
  'consistency_repair',
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
);

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
  'consistency_repair',
  '{}'::jsonb,
  to_jsonb(supplement_aliases),
  coalesce(supplement_aliases.created_at, now())
from public.supplement_aliases
where not exists (
  select 1
  from public.supplement_alias_events existing
  where existing.alias_id = supplement_aliases.id
);

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
  'consistency_repair',
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
);
`;

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured");
}

if (repair) {
  await sql.unsafe(repairSql);
}

const rows = await sql<Array<{ area: string; missing_count: number | string }>>`
  select 'assessments_without_events' as area, count(*) as missing_count
  from public.assessments
  where not exists (
    select 1
    from public.assessment_events events
    where events.plan_id = assessments.plan_id
  )
  union all
  select 'supplements_without_versions' as area, count(*) as missing_count
  from public.supplements
  where not exists (
    select 1
    from public.supplement_versions versions
    where versions.supplement_id = supplements.id
  )
  union all
  select 'aliases_without_events' as area, count(*) as missing_count
  from public.supplement_aliases
  where not exists (
    select 1
    from public.supplement_alias_events events
    where events.alias_id = supplement_aliases.id
  )
  union all
  select 'products_without_fact_versions' as area, count(*) as missing_count
  from public.products
  where not exists (
    select 1
    from public.product_fact_versions versions
    where versions.product_id = products.id
  )
`;

const triggerRows = await sql<Array<{ missing_triggers: string[] }>>`
  with expected(trigger_name) as (
    values
      ('assessment_events_no_update_delete'),
      ('supplement_versions_no_update_delete'),
      ('supplement_alias_events_no_update_delete'),
      ('product_fact_versions_no_update_delete'),
      ('product_versions_no_update_delete'),
      ('supplement_safety_limits_no_update_delete'),
      ('product_recommendation_runs_no_update_delete'),
      ('product_recommendation_items_no_update_delete')
  )
  select coalesce(
    array_agg(expected.trigger_name order by expected.trigger_name)
      filter (where triggers.tgname is null),
    '{}'::text[]
  ) as missing_triggers
  from expected
  left join pg_trigger triggers
    on triggers.tgname = expected.trigger_name
   and not triggers.tgisinternal
`;

await sql.end({ timeout: 1 });

const missing = rows.map((row) => ({
  area: row.area,
  missingCount: Number(row.missing_count)
}));
const missingTriggers = triggerRows[0]?.missing_triggers ?? [];
const hasMismatch =
  missing.some((row) => row.missingCount > 0) || missingTriggers.length > 0;

console.log(JSON.stringify({
  missing,
  missingTriggers,
  repair,
  status: hasMismatch ? "mismatch" : "ok"
}, null, 2));

if (hasMismatch) {
  process.exitCode = 1;
}
