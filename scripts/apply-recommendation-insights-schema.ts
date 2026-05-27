import { getSql } from "@/lib/db";
import {
  productDecisionRowsFromStoredRun,
  projectSupplementRecommendationSelections,
  writeProductRecommendationDecisionRows
} from "@/lib/recommendation-selection-projections";

const sql = getSql();

if (!sql) {
  throw new Error("DB_CONNECTION is required to apply recommendation insights schema");
}

await sql`
  create table if not exists public.supplement_recommendation_selections (
    id uuid default gen_random_uuid() not null primary key,
    plan_id uuid not null references public.assessments(plan_id) on delete cascade,
    formulation_version integer not null,
    task_id uuid references public.tasks(id) on delete set null,
    model_version text,
    item_id text not null,
    supplement_id uuid references public.supplements(id) on delete set null,
    supplement_name jsonb default '{}'::jsonb not null,
    supplement_name_text text not null,
    category text not null,
    status text not null check (status = any (array['covered', 'add', 'review']::text[])),
    effectiveness_rank integer not null,
    daily_dose jsonb default '{}'::jsonb not null,
    daily_dose_text text not null,
    dose_amount numeric,
    dose_unit text,
    dose_parse_status text default 'unparsed' not null check (dose_parse_status = any (array['parsed', 'unparsed']::text[])),
    safety_action text,
    safety_visibility text,
    is_current boolean default false not null,
    generated_at timestamptz default now() not null,
    created_at timestamptz default now() not null,
    unique (plan_id, formulation_version, item_id)
  )
`;

await sql`
  create table if not exists public.product_recommendation_decisions (
    id uuid default gen_random_uuid() not null primary key,
    run_id uuid not null references public.product_recommendation_runs(id) on delete cascade,
    plan_id uuid references public.assessments(plan_id) on delete set null,
    task_id uuid references public.tasks(id) on delete set null,
    product_id uuid not null references public.products(id) on delete restrict,
    product_title text not null,
    outcome text not null check (outcome = any (array['chosen', 'near_miss', 'rejected']::text[])),
    dedupe_key text not null,
    rank integer,
    score numeric,
    product_coverage_percent numeric,
    stack_contribution_percent numeric,
    serving_multiplier integer default 1 not null check (serving_multiplier >= 1),
    covered_needs jsonb default '[]'::jsonb not null,
    reason text,
    offer_id uuid references public.product_offers(id) on delete set null,
    url_used text,
    price_amount numeric,
    currency text default 'THB' not null,
    unknown_at_recommendation boolean default false not null,
    is_current boolean default false not null,
    generated_at timestamptz default now() not null,
    created_at timestamptz default now() not null,
    unique (run_id, dedupe_key)
  )
`;

await sql`create index if not exists supplement_recommendation_selections_current_idx on public.supplement_recommendation_selections (is_current, status, generated_at desc)`;
await sql`create index if not exists supplement_recommendation_selections_plan_idx on public.supplement_recommendation_selections (plan_id, formulation_version desc)`;
await sql`create index if not exists supplement_recommendation_selections_supplement_idx on public.supplement_recommendation_selections (supplement_id, generated_at desc) where supplement_id is not null`;
await sql`create index if not exists product_recommendation_decisions_current_idx on public.product_recommendation_decisions (is_current, outcome, generated_at desc)`;
await sql`create index if not exists product_recommendation_decisions_product_idx on public.product_recommendation_decisions (product_id, outcome, generated_at desc)`;
await sql`create index if not exists product_recommendation_decisions_run_idx on public.product_recommendation_decisions (run_id, outcome)`;

const formulationRows = await sql<Array<{
  formulation: unknown;
  generated_at: Date | string;
  model_version: string | null;
  plan_id: string;
  version: number | string;
}>>`
  select
    plan_id::text,
    version,
    formulation,
    model_version,
    generated_at
  from public.formulations
  order by plan_id asc, generated_at asc, version asc
`;

let supplementRows = 0;

for (const row of formulationRows) {
  const formulation = objectValue(row.formulation);
  const supplementBreakdown = Array.isArray(formulation.supplementBreakdown)
    ? formulation.supplementBreakdown
    : null;

  if (!supplementBreakdown) {
    continue;
  }

  supplementRows += await projectSupplementRecommendationSelections(sql, {
    formulation: { supplementBreakdown } as never,
    formulationVersion: Number(row.version) || 1,
    generatedAt: row.generated_at,
    modelVersion: row.model_version,
    task: { planId: row.plan_id }
  });
}

const runRows = await sql<Array<{
  diagnostics: unknown;
  exclusions: unknown;
  generated_at: Date | string;
  id: string;
  plan_id: string | null;
  task_id: string | null;
}>>`
  select
    id::text,
    plan_id::text,
    task_id::text,
    diagnostics,
    exclusions,
    generated_at
  from public.product_recommendation_runs
  where status in ('completed', 'partial')
  order by plan_id asc nulls last, generated_at asc, created_at asc
`;

let productRows = 0;

for (const run of runRows) {
  const itemRows = await sql<Array<{
    covered_needs: unknown;
    currency: string | null;
    offer_id: string | null;
    price_amount: number | string | null;
    product_coverage_percent: number | string | null;
    product_id: string;
    product_title: string;
    rank: number | string | null;
    score: number | string | null;
    serving_multiplier: number | string | null;
    stack_contribution_percent: number | string | null;
    unknown_at_recommendation: boolean | null;
    url_used: string | null;
  }>>`
    select
      product_recommendation_items.product_id::text,
      products.title as product_title,
      product_recommendation_items.rank,
      product_recommendation_items.score,
      product_recommendation_items.product_coverage_percent,
      product_recommendation_items.stack_contribution_percent,
      product_recommendation_items.serving_multiplier,
      product_recommendation_items.covered_needs,
      product_recommendation_items.offer_id::text,
      product_recommendation_items.url_used,
      product_recommendation_items.price_amount,
      product_recommendation_items.currency,
      product_recommendation_items.unknown_at_recommendation
    from public.product_recommendation_items
    join public.products
      on products.id = product_recommendation_items.product_id
    where product_recommendation_items.run_id = ${run.id}::uuid
    order by product_recommendation_items.rank asc
  `;
  const decisions = productDecisionRowsFromStoredRun({
    diagnostics: run.diagnostics,
    exclusions: run.exclusions,
    items: itemRows
  });

  productRows += await writeProductRecommendationDecisionRows(sql, {
    generatedAt: run.generated_at,
    planId: run.plan_id,
    rows: decisions,
    runId: run.id,
    taskId: run.task_id
  });
}

console.log(
  `[recommendation-insights-schema] ready; projected ${supplementRows} supplement selection${supplementRows === 1 ? "" : "s"} and ${productRows} product decision${productRows === 1 ? "" : "s"}.`
);

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}
