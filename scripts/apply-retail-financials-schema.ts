import { getSql } from "@/lib/db";

const schemaSql = `
create table if not exists public.organisation_finance_accounts (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  account_role text not null,
  finance_account_id uuid not null references public.finance_accounts(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, account_role),
  constraint organisation_finance_accounts_role_check check (
    account_role in ('retailer_settlement')
  )
);

create table if not exists public.retail_order_settlements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  retail_customer_order_id uuid not null references public.retail_customer_orders(id) on delete cascade,
  retail_checkout_payment_id uuid null references public.retail_checkout_payments(id) on delete set null,
  finance_account_id uuid null references public.finance_accounts(id) on delete restrict,
  status text not null default 'pending',
  gross_customer_amount bigint not null default 0,
  retailer_payable_amount bigint not null default 0,
  mattanutra_margin_amount bigint not null default 0,
  paid_amount bigint null,
  amount_unit text not null default 'micros',
  currency text not null,
  paid_at timestamptz null,
  paid_method text null,
  paid_reference text null,
  paid_by_person_id uuid null references public.people(id) on delete set null,
  confirmed_at timestamptz null,
  confirmed_reference text null,
  confirmed_by_person_id uuid null references public.people(id) on delete set null,
  nominal_finance_transaction_id uuid null references public.finance_transactions(id) on delete set null,
  actual_finance_transaction_id uuid null references public.finance_transactions(id) on delete set null,
  refund_finance_transaction_id uuid null references public.finance_transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retail_order_settlements_amount_unit_check check (amount_unit = 'micros'),
  constraint retail_order_settlements_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint retail_order_settlements_amount_check check (
    gross_customer_amount >= 0
    and retailer_payable_amount >= 0
    and mattanutra_margin_amount >= 0
    and (paid_amount is null or paid_amount >= 0)
  ),
  constraint retail_order_settlements_status_check check (
    status in ('pending', 'due', 'paid', 'confirmed', 'needs_review', 'voided')
  )
);

alter table public.retail_order_settlements
  add column if not exists retail_checkout_payment_id uuid null references public.retail_checkout_payments(id) on delete set null,
  add column if not exists finance_account_id uuid null references public.finance_accounts(id) on delete restrict,
  add column if not exists gross_customer_amount bigint not null default 0,
  add column if not exists retailer_payable_amount bigint not null default 0,
  add column if not exists mattanutra_margin_amount bigint not null default 0,
  add column if not exists paid_amount bigint null,
  add column if not exists amount_unit text not null default 'micros',
  add column if not exists currency text,
  add column if not exists paid_at timestamptz null,
  add column if not exists paid_method text null,
  add column if not exists paid_reference text null,
  add column if not exists paid_by_person_id uuid null references public.people(id) on delete set null,
  add column if not exists confirmed_at timestamptz null,
  add column if not exists confirmed_reference text null,
  add column if not exists confirmed_by_person_id uuid null references public.people(id) on delete set null,
  add column if not exists nominal_finance_transaction_id uuid null references public.finance_transactions(id) on delete set null,
  add column if not exists actual_finance_transaction_id uuid null references public.finance_transactions(id) on delete set null,
  add column if not exists refund_finance_transaction_id uuid null references public.finance_transactions(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.retail_order_settlements
set
  amount_unit = coalesce(nullif(amount_unit, ''), 'micros'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.retail_order_settlements
  alter column amount_unit set default 'micros',
  alter column amount_unit set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.retail_order_settlements
  drop constraint if exists retail_order_settlements_order_key,
  drop constraint if exists retail_order_settlements_amount_unit_check,
  drop constraint if exists retail_order_settlements_currency_check,
  drop constraint if exists retail_order_settlements_amount_check,
  drop constraint if exists retail_order_settlements_status_check;

alter table public.retail_order_settlements
  add constraint retail_order_settlements_order_key unique (retail_customer_order_id),
  add constraint retail_order_settlements_amount_unit_check check (amount_unit = 'micros'),
  add constraint retail_order_settlements_currency_check check (currency ~ '^[A-Z]{3}$'),
  add constraint retail_order_settlements_amount_check check (
    gross_customer_amount >= 0
    and retailer_payable_amount >= 0
    and mattanutra_margin_amount >= 0
    and (paid_amount is null or paid_amount >= 0)
  ),
  add constraint retail_order_settlements_status_check check (
    status in ('pending', 'due', 'paid', 'confirmed', 'needs_review', 'voided')
  );

create index if not exists organisation_finance_accounts_account_idx
  on public.organisation_finance_accounts (finance_account_id);

create index if not exists retail_order_settlements_org_status_idx
  on public.retail_order_settlements (organisation_id, status, updated_at desc);

create index if not exists retail_order_settlements_checkout_payment_idx
  on public.retail_order_settlements (retail_checkout_payment_id)
  where retail_checkout_payment_id is not null;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mn') then
    grant usage on schema public to mn;
    grant select, insert, update, delete on table
      public.organisation_finance_accounts,
      public.retail_order_settlements
    to mn;
  end if;
end $$;

comment on table public.organisation_finance_accounts is
  'Links organisations to first-class finance accounts used for settlement and reconciliation.';

comment on table public.retail_order_settlements is
  'Retailer settlement projection for paid customer orders. Pending at payment, due on shipment, paid by platform, confirmed by retailer.';
`;

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured");
}

await sql.unsafe(schemaSql);
await sql.end({ timeout: 5 });

console.log("Retail financials schema applied.");
