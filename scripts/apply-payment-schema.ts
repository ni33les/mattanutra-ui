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

create table if not exists public.payments (
  id uuid primary key,
  plan_id uuid null references public.assessments(plan_id) on delete set null,
  selected_plan public.assessment_plan not null,
  locale text not null default 'en',
  source_surface text not null default 'healthscore',
  status text not null default 'created',
  amount bigint not null,
  amount_unit text not null default 'micros',
  currency text not null default 'THB',
  stripe_mode text not null default 'test',
  stripe_checkout_session_id text null,
  stripe_payment_intent_id text null,
  stripe_customer_id text null,
  stripe_price_id text null,
  customer_email text null,
  customer_email_opted_in boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz null,
  bound_at timestamptz null
);

alter table public.payments
  add column if not exists plan_id uuid null references public.assessments(plan_id) on delete set null,
  add column if not exists selected_plan public.assessment_plan,
  add column if not exists locale text default 'en',
  add column if not exists source_surface text default 'healthscore',
  add column if not exists status text default 'created',
  add column if not exists amount bigint,
  add column if not exists amount_unit text default 'micros',
  add column if not exists currency text default 'THB',
  add column if not exists stripe_mode text default 'test',
  add column if not exists stripe_checkout_session_id text null,
  add column if not exists stripe_payment_intent_id text null,
  add column if not exists stripe_customer_id text null,
  add column if not exists stripe_price_id text null,
  add column if not exists customer_email text null,
  add column if not exists customer_email_opted_in boolean default false,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists paid_at timestamptz null,
  add column if not exists bound_at timestamptz null;

update public.payments
set
  selected_plan = coalesce(selected_plan, 'precision'::public.assessment_plan),
  locale = case when locale in ('en', 'th') then locale else 'en' end,
  source_surface = case when source_surface in ('landing', 'healthscore') then source_surface else 'healthscore' end,
  status = case
    when status in (
      'created',
      'checkout_session_created',
      'checkout_opened',
      'processing',
      'paid',
      'failed',
      'cancelled',
      'expired',
      'fulfillment_failed',
      'bound'
    ) then status
    else 'created'
  end,
  amount = case when amount > 0 then amount else 690000000 end,
  amount_unit = 'micros',
  currency = coalesce(nullif(currency, ''), 'THB'),
  stripe_mode = case when stripe_mode in ('test', 'live', 'mock') then stripe_mode else 'test' end,
  customer_email_opted_in = coalesce(customer_email_opted_in, false),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.payments
  alter column selected_plan set not null,
  alter column locale set default 'en',
  alter column locale set not null,
  alter column source_surface set default 'healthscore',
  alter column source_surface set not null,
  alter column status set default 'created',
  alter column status set not null,
  alter column amount set not null,
  alter column amount_unit set default 'micros',
  alter column amount_unit set not null,
  alter column currency set default 'THB',
  alter column currency set not null,
  alter column stripe_mode set default 'test',
  alter column stripe_mode set not null,
  alter column customer_email_opted_in set default false,
  alter column customer_email_opted_in set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.payments
  drop constraint if exists payments_status_check,
  drop constraint if exists payments_locale_check,
  drop constraint if exists payments_source_surface_check,
  drop constraint if exists payments_amount_check,
  drop constraint if exists payments_amount_unit_check,
  drop constraint if exists payments_currency_check,
  drop constraint if exists payments_stripe_mode_check;

alter table public.payments
  add constraint payments_status_check check (
    status in (
      'created',
      'checkout_session_created',
      'checkout_opened',
      'processing',
      'paid',
      'failed',
      'cancelled',
      'expired',
      'fulfillment_failed',
      'bound'
    )
  ),
  add constraint payments_locale_check check (locale in ('en', 'th')),
  add constraint payments_source_surface_check check (source_surface in ('landing', 'healthscore')),
  add constraint payments_amount_check check (amount > 0),
  add constraint payments_amount_unit_check check (amount_unit = 'micros'),
  add constraint payments_currency_check check (currency ~ '^[A-Z]{3}$'),
  add constraint payments_stripe_mode_check check (stripe_mode in ('test', 'live', 'mock'));

create unique index if not exists payments_stripe_checkout_session_idx
  on public.payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists payments_plan_idx
  on public.payments (plan_id, created_at desc)
  where plan_id is not null;

create index if not exists payments_status_idx
  on public.payments (status, created_at desc);

create table if not exists public.payment_versions (
  payment_id uuid not null references public.payments(id) on delete restrict,
  version integer not null,
  action text not null,
  actor text not null default 'system',
  reason text not null,
  source text not null default 'application',
  plan_id uuid null references public.assessments(plan_id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (payment_id, version)
);

alter table public.payment_versions
  add column if not exists payment_id uuid references public.payments(id) on delete restrict,
  add column if not exists version integer,
  add column if not exists action text,
  add column if not exists actor text default 'system',
  add column if not exists reason text,
  add column if not exists source text default 'application',
  add column if not exists plan_id uuid null references public.assessments(plan_id) on delete set null,
  add column if not exists snapshot jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

drop trigger if exists payment_versions_no_update_delete
  on public.payment_versions;

update public.payment_versions
set
  version = coalesce(version, 1),
  action = coalesce(nullif(action, ''), 'legacy_payment_version_backfill'),
  actor = coalesce(nullif(actor, ''), 'system'),
  reason = coalesce(nullif(reason, ''), 'payment_schema_apply_backfill'),
  source = coalesce(nullif(source, ''), 'schema_apply'),
  snapshot = coalesce(snapshot, '{}'::jsonb),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now());

alter table public.payment_versions
  alter column payment_id set not null,
  alter column version set not null,
  alter column action set not null,
  alter column actor set default 'system',
  alter column actor set not null,
  alter column reason set not null,
  alter column source set default 'application',
  alter column source set not null,
  alter column snapshot set default '{}'::jsonb,
  alter column snapshot set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists payment_versions_latest_idx
  on public.payment_versions (payment_id, version desc, created_at desc);

create trigger payment_versions_no_update_delete
  before update or delete on public.payment_versions
  for each row execute function public.prevent_domain_version_mutation();

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  payload_shape text not null default 'fat',
  stripe_mode text not null,
  event_type text not null,
  payment_id uuid null references public.payments(id) on delete set null,
  stripe_checkout_session_id text null,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  error_message text null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null
);

alter table public.stripe_webhook_events
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists stripe_event_id text,
  add column if not exists payload_shape text default 'fat',
  add column if not exists stripe_mode text,
  add column if not exists event_type text,
  add column if not exists payment_id uuid null references public.payments(id) on delete set null,
  add column if not exists stripe_checkout_session_id text null,
  add column if not exists status text default 'received',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists error_message text null,
  add column if not exists received_at timestamptz default now(),
  add column if not exists processed_at timestamptz null;

update public.stripe_webhook_events
set
  id = coalesce(id, gen_random_uuid()),
  stripe_event_id = coalesce(stripe_event_id, 'legacy_missing_' || gen_random_uuid()::text),
  payload_shape = case when payload_shape in ('fat', 'thin') then payload_shape else 'fat' end,
  stripe_mode = case when stripe_mode in ('test', 'live', 'mock') then stripe_mode else 'test' end,
  event_type = coalesce(nullif(event_type, ''), 'legacy.unknown'),
  status = case when status in ('received', 'processed', 'ignored', 'failed') then status else 'ignored' end,
  payload = coalesce(payload, '{}'::jsonb),
  received_at = coalesce(received_at, now());

alter table public.stripe_webhook_events
  alter column stripe_event_id set not null,
  alter column payload_shape set default 'fat',
  alter column payload_shape set not null,
  alter column stripe_mode set not null,
  alter column event_type set not null,
  alter column status set default 'received',
  alter column status set not null,
  alter column payload set default '{}'::jsonb,
  alter column payload set not null,
  alter column received_at set default now(),
  alter column received_at set not null;

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_payload_shape_check,
  drop constraint if exists stripe_webhook_events_stripe_mode_check,
  drop constraint if exists stripe_webhook_events_status_check;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_payload_shape_check check (payload_shape in ('fat', 'thin')),
  add constraint stripe_webhook_events_stripe_mode_check check (stripe_mode in ('test', 'live', 'mock')),
  add constraint stripe_webhook_events_status_check check (
    status in ('received', 'processed', 'ignored', 'failed')
  );

create index if not exists stripe_webhook_events_payment_idx
  on public.stripe_webhook_events (payment_id, received_at desc)
  where payment_id is not null;

create unique index if not exists stripe_webhook_events_stripe_event_id_idx
  on public.stripe_webhook_events (stripe_event_id);

comment on table public.payments is
  'Current payment projection. payment_versions is the append-only source-of-truth.';

comment on table public.payment_versions is
  'Append-only payment state versions.';

comment on table public.stripe_webhook_events is
  'Idempotency and diagnostics for Stripe webhook processing.';

do $$
begin
  if to_regclass('public.finance_accounts') is not null then
    insert into public.finance_accounts (
      id,
      name,
      description,
      created_at,
      updated_at
    )
    values
      (
        '33333333-3333-4333-8333-333333333333'::uuid,
        'Stripe',
        'Stripe payment processing and settlement.',
        now(),
        now()
      ),
      (
        '44444444-4444-4444-8444-444444444444'::uuid,
        'MattaNutra revenue',
        'MattaNutra customer payment revenue.',
        now(),
        now()
      ),
      (
        '55555555-5555-4555-8555-555555555555'::uuid,
        'Stripe clearing',
        'Stripe clearing account for customer payments before payout reconciliation.',
        now(),
        now()
      ),
      (
        '66666666-6666-4666-8666-666666666666'::uuid,
        'MattaNutra bank',
        'MattaNutra bank or settlement account for Stripe payouts.',
        now(),
        now()
      )
    on conflict (id) do update set
      name = excluded.name,
      description = excluded.description,
      updated_at = now();
  end if;
end $$;

do $$
begin
  if to_regclass('public.finance_transactions') is not null then
    if exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_transactions'::regclass
        and conname = 'finance_transactions_category_check'
    ) then
      alter table public.finance_transactions
        drop constraint finance_transactions_category_check;
    end if;

    alter table public.finance_transactions
      add constraint finance_transactions_category_check
      check (category in ('ai', 'hosting', 'other', 'payment_fee', 'payout', 'refund', 'revenue'));
  end if;
end $$;
`;

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured");
}

await sql.unsafe(schemaSql);

const [payments, paymentVersions, webhookEvents] = await Promise.all([
  sql`
    select count(*)::int as count
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payments'
  `,
  sql`
    select count(*)::int as count
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_versions'
  `,
  sql`
    select count(*)::int as count
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stripe_webhook_events'
  `
]);

await sql.end({ timeout: 1 });

console.log(JSON.stringify({
  paymentVersionsColumns: paymentVersions[0]?.count ?? 0,
  paymentsColumns: payments[0]?.count ?? 0,
  stripeWebhookEventsColumns: webhookEvents[0]?.count ?? 0
}, null, 2));
