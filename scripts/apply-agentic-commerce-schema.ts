import postgres from "postgres";

const schemaSql = `
create table if not exists public.agentic_plans (
  id uuid primary key,
  environment text not null,
  tenant_scope text not null,
  principal_scope text,
  current_revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agentic_plan_revisions (
  plan_id uuid not null references public.agentic_plans(id) on delete restrict,
  revision integer not null,
  status text not null,
  request_snapshot jsonb not null,
  result jsonb not null,
  catalogue_version text not null,
  guidance_rules_version text not null,
  availability_as_of timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, revision)
);

create table if not exists public.agentic_capabilities (
  id uuid primary key,
  capability_hash text not null unique,
  resource_type text not null,
  resource_id uuid not null,
  environment text not null,
  tenant_scope text not null,
  principal_scope text,
  allowed_actions text[] not null,
  issued_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  key_version integer not null default 1
);

create table if not exists public.agentic_idempotency_records (
  operation text not null,
  owner_scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  resource_ids jsonb not null default '{}'::jsonb,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (operation, owner_scope, idempotency_key)
);

create table if not exists public.agentic_orders (
  id uuid primary key,
  reference text not null unique,
  plan_id uuid not null references public.agentic_plans(id) on delete restrict,
  plan_revision integer not null,
  environment text not null,
  tenant_scope text not null,
  principal_scope text,
  destination_country text not null,
  currency text not null,
  total_price_minor bigint not null,
  order_status text not null,
  payment_status text not null,
  fulfilment_status text not null,
  state_version integer not null default 1,
  provider_session_id text unique,
  checkout_url text,
  checkout_expires_at timestamptz,
  checkout_access_hash text,
  frozen_plan jsonb not null,
  latest_payment_attempt text,
  latest_payment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz
);

create table if not exists public.agentic_order_items (
  id uuid primary key,
  order_id uuid not null references public.agentic_orders(id) on delete restrict,
  product_id text not null,
  product_name text not null,
  retailer_sku text not null,
  seller_id text not null,
  seller_name text not null,
  quantity integer not null,
  form text not null,
  daily_pills numeric not null,
  unit_price_minor bigint not null,
  line_total_minor bigint not null,
  currency text not null
);

create table if not exists public.agentic_checkout_sessions (
  id uuid primary key,
  order_id uuid not null references public.agentic_orders(id) on delete restrict,
  access_hash text not null,
  provider_session_id text,
  encrypted_address text,
  shipping_minor bigint,
  tax_minor bigint,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.agentic_payment_attempts (
  id uuid primary key,
  order_id uuid not null references public.agentic_orders(id) on delete restrict,
  status text not null,
  reason text,
  provider_event_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.agentic_provider_events (
  id uuid primary key,
  provider text not null,
  provider_event_id text not null,
  order_id uuid not null references public.agentic_orders(id) on delete restrict,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.agentic_payment_audits (
  id uuid primary key,
  order_id uuid not null references public.agentic_orders(id) on delete restrict,
  type text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists agentic_payment_audits_initial_confirmed_idx
  on public.agentic_payment_audits (order_id)
  where type = 'payment_confirmed';

create table if not exists public.agentic_outbox_events (
  id uuid primary key,
  type text not null,
  order_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.agentic_retail_order_links (
  order_id uuid primary key references public.agentic_orders(id) on delete restrict,
  adapter text not null,
  retailer_reference text not null,
  created_at timestamptz not null default now(),
  unique (adapter, retailer_reference)
);

create table if not exists public.agentic_fulfilment_events (
  id uuid primary key,
  order_id uuid not null references public.agentic_orders(id) on delete restrict,
  status text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists agentic_orders_plan_revision_idx
  on public.agentic_orders (plan_id, plan_revision);

create index if not exists agentic_fulfilment_events_order_created_idx
  on public.agentic_fulfilment_events (order_id, created_at);

create index if not exists agentic_idempotency_execute_order_idx
  on public.agentic_idempotency_records ((resource_ids->>'orderId'))
  where operation = 'execute';

create table if not exists public.agentic_support_cases (
  id uuid primary key,
  order_id uuid not null references public.agentic_orders(id) on delete restrict,
  case_reference text not null unique,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agentic_support_messages (
  id uuid primary key,
  case_id uuid not null references public.agentic_support_cases(id) on delete restrict,
  author text not null,
  body text not null,
  sequence integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.agentic_support_messages
  add column if not exists sequence integer;

update public.agentic_support_messages
  set sequence = 0
  where sequence is null;

create table if not exists public.agentic_feedback (
  id uuid primary key,
  plan_id uuid not null references public.agentic_plans(id) on delete restrict,
  revision integer not null,
  option_id text,
  consent_confirmed boolean not null,
  summary text,
  points text[] not null default '{}',
  rating integer,
  created_at timestamptz not null default now()
);

create table if not exists public.agentic_funnel_events (
  event_id text primary key,
  correlation_id text not null,
  event_type text not null,
  attribution text not null,
  payload jsonb not null default '{}'::jsonb,
  sequence integer not null,
  created_at timestamptz not null
);

create index if not exists agentic_funnel_events_correlation_idx
  on public.agentic_funnel_events (correlation_id, sequence);

create table if not exists public.agentic_matcher_events (
  id uuid primary key,
  plan_id uuid not null references public.agentic_plans(id) on delete restrict,
  revision integer not null,
  requested_names jsonb not null default '[]'::jsonb,
  requested_doses jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  selected_option_id text,
  coverage_percent integer,
  product_ids jsonb not null default '[]'::jsonb,
  product_skus jsonb not null default '[]'::jsonb,
  leftovers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agentic_matcher_events_plan_idx
  on public.agentic_matcher_events (plan_id, revision);

create index if not exists agentic_matcher_events_created_idx
  on public.agentic_matcher_events (created_at desc);

create or replace view public.agentic_catalogue_gaps as
select
  leftover->>'name' as requested_name,
  leftover->>'reason' as miss_reason,
  leftover->>'severity' as miss_severity,
  count(*)::int as frequency,
  max(events.created_at) as last_seen_at,
  (
    case leftover->>'severity'
      when 'high' then 30
      when 'medium' then 20
      else 10
    end * count(*)
  )::int as add_priority
from public.agentic_matcher_events as events
cross join lateral jsonb_array_elements(
  case jsonb_typeof(events.leftovers)
    when 'array' then events.leftovers
    when 'string' then jsonb_build_array(
      jsonb_build_object('name', events.leftovers #>> '{}')
    )
    else '[]'::jsonb
  end
) as leftover
group by 1, 2, 3;

create table if not exists public.agentic_qa_catalogues (
  snapshot_id text primary key,
  catalogue_version text not null,
  snapshot_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agentic_qa_published (
  id text primary key,
  snapshot_id text not null
);

create table if not exists public.agentic_qa_namespaces (
  namespace text primary key,
  run_id text not null,
  now_clock text not null,
  principal_scope text not null,
  build_id text not null,
  snapshot_id text not null,
  acquisition_minor integer not null default 0,
  attribution text not null,
  client_key text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.agentic_qa_namespaces
  add column if not exists client_key text;

alter table public.agentic_qa_namespaces
  add column if not exists query_counts jsonb not null default '{}'::jsonb;

alter table public.agentic_qa_namespaces
  add column if not exists context_version integer not null default 1;

create index if not exists agentic_qa_namespaces_client_key_idx
  on public.agentic_qa_namespaces (client_key, expires_at);

create table if not exists public.agentic_qa_scenario_runs (
  id uuid primary key,
  handle_hash text not null unique,
  idempotency_key text not null,
  owner_scope text not null,
  request_hash text not null,
  scenario text not null,
  resource_type text not null,
  resource_id uuid,
  resource_fingerprint text not null,
  status text not null,
  assertions jsonb not null default '[]'::jsonb,
  evidence_handle_hash text,
  evidence_checksum text,
  evidence_payload jsonb,
  accepted_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  unique (owner_scope, idempotency_key)
);
`;

function connectionString() {
  return (
    process.env.DB_SCHEMA_URL?.trim() ||
    process.env.DB_OWNER_URL?.trim() ||
    process.env.PRD_DB_OWNER_URL?.trim() ||
    process.env.DB_URL?.trim() ||
    ""
  );
}

function shouldUseSsl(connection: string) {
  const url = new URL(connection);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  return (
    url.hostname.endsWith(".db.ondigitalocean.com") ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  );
}

const connection = connectionString();

if (!connection) {
  throw new Error("DB_SCHEMA_URL, DB_OWNER_URL, or DB_URL is required to apply agentic commerce schema");
}

const sql = postgres(connection, {
  connection: {
    application_name:
      process.env.DB_APPLICATION_NAME ?? "mattanutra-agentic-schema"
  },
  idle_timeout: 5,
  max: 1,
  prepare: false,
  ...(shouldUseSsl(connection) ? { ssl: "require" } : {})
});

await sql.unsafe(schemaSql);

await sql.unsafe(`
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mn') then
    grant select, insert, update, delete on
      public.agentic_plans,
      public.agentic_plan_revisions,
      public.agentic_capabilities,
      public.agentic_idempotency_records,
      public.agentic_orders,
      public.agentic_order_items,
      public.agentic_checkout_sessions,
      public.agentic_payment_attempts,
      public.agentic_provider_events,
      public.agentic_payment_audits,
      public.agentic_outbox_events,
      public.agentic_retail_order_links,
      public.agentic_fulfilment_events,
      public.agentic_support_cases,
      public.agentic_support_messages,
      public.agentic_feedback,
      public.agentic_matcher_events,
      public.agentic_qa_scenario_runs
    to mn;
    grant select on public.agentic_catalogue_gaps to mn;
  end if;
end
$$;
`);

console.log("Agentic commerce schema applied");
await sql.end({ timeout: 5 });
