import { getSql } from "@/lib/db";

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
  created_at timestamptz not null default now()
);

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

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured");
}

await sql.unsafe(schemaSql);

console.log("Agentic commerce schema applied");
