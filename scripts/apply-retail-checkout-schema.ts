import { getSql } from "@/lib/db";

const schemaSql = `
create table if not exists public.retail_checkout_payments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.assessments(plan_id) on delete restrict,
  recommendation_run_id uuid null references public.product_recommendation_runs(id) on delete set null,
  retail_customer_order_id uuid null references public.retail_customer_orders(id) on delete set null,
  selected_retailer_organisation_id uuid null references public.organisations(id) on delete restrict,
  locale text not null default 'en',
  status text not null default 'created',
  amount bigint not null,
  amount_unit text not null default 'micros',
  currency text not null default 'THB',
  stripe_mode text not null default 'mock',
  stripe_checkout_session_id text null,
  stripe_payment_intent_id text null,
  stripe_customer_id text null,
  customer_email text null,
  customer_name text null,
  customer_phone text null,
  shipping_address jsonb not null default '{}'::jsonb,
  selected_item_ids text[] not null default '{}'::text[],
  removed_item_ids text[] not null default '{}'::text[],
  quote_lines jsonb not null default '[]'::jsonb,
  routing_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  tracking_token_hash text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz null,
  fulfilled_at timestamptz null,
  constraint retail_checkout_payments_status_check check (
    status in (
      'created',
      'checkout_session_created',
      'checkout_opened',
      'processing',
      'paid',
      'fulfilled',
      'failed',
      'cancelled',
      'expired',
      'fulfillment_failed'
    )
  ),
  constraint retail_checkout_payments_locale_check check (locale in ('en', 'th', 'zh-CN')),
  constraint retail_checkout_payments_amount_check check (amount > 0),
  constraint retail_checkout_payments_amount_unit_check check (amount_unit = 'micros'),
  constraint retail_checkout_payments_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint retail_checkout_payments_stripe_mode_check check (stripe_mode in ('test', 'live', 'mock'))
);

create unique index if not exists retail_checkout_payments_idempotency_active_idx
  on public.retail_checkout_payments (idempotency_key)
  where status not in ('paid', 'fulfilled', 'failed', 'cancelled', 'expired', 'fulfillment_failed');

create unique index if not exists retail_checkout_payments_stripe_session_idx
  on public.retail_checkout_payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists retail_checkout_payments_tracking_token_idx
  on public.retail_checkout_payments (tracking_token_hash)
  where tracking_token_hash is not null;

create index if not exists retail_checkout_payments_plan_idx
  on public.retail_checkout_payments (plan_id, created_at desc);

create table if not exists public.retail_checkout_payment_versions (
  payment_id uuid not null references public.retail_checkout_payments(id) on delete restrict,
  version integer not null,
  action text not null,
  actor text not null,
  reason text,
  snapshot jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (payment_id, version)
);

create index if not exists retail_checkout_payment_versions_latest_idx
  on public.retail_checkout_payment_versions (payment_id, version desc, created_at desc);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mn') then
    grant usage on schema public to mn;
    grant select, insert, update, delete on table
      public.retail_checkout_payments,
      public.retail_checkout_payment_versions
    to mn;

    if to_regclass('public.finance_accounts') is not null then
      grant select, insert, update on table public.finance_accounts to mn;
    end if;
  end if;
end $$;
`;

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured");
}

await sql.unsafe(schemaSql);

console.log("Retail checkout schema applied");
