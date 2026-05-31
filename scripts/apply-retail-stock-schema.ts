import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_CONNECTION is required to apply the retail stock schema");
}

try {
  await sql`
    alter table public.organisations
      add column if not exists currency text not null default 'THB'
  `;

  await sql`
    update public.organisations
    set currency = case when organisation_type = 'platform' then 'USD' else 'THB' end
    where currency is null or currency !~ '^[A-Z]{3}$'
  `;

  await sql`
    update public.organisations
    set currency = 'USD'
    where organisation_type = 'platform'
      and lower(slug) = 'mattanutra'
      and currency = 'THB'
  `;

  await sql`
    alter table public.organisations
      drop constraint if exists organisations_currency_check
  `;

  await sql`
    alter table public.organisations
      add constraint organisations_currency_check check (currency ~ '^[A-Z]{3}$')
  `;

  await sql`
    create table if not exists public.finance_fx_rates (
      id uuid primary key default gen_random_uuid(),
      base_currency text not null,
      quote_currency text not null,
      provider text not null,
      source text not null,
      bid numeric(20,10),
      ask numeric(20,10),
      mid numeric(20,10) not null,
      fetched_at timestamptz not null default now(),
      valid_at timestamptz not null default now(),
      expires_at timestamptz not null,
      raw_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint finance_fx_rates_currency_check check (
        base_currency ~ '^[A-Z]{3}$' and quote_currency ~ '^[A-Z]{3}$'
      ),
      constraint finance_fx_rates_mid_check check (mid > 0),
      constraint finance_fx_rates_spread_check check (
        (bid is null or bid > 0) and (ask is null or ask > 0)
      )
    )
  `;

  await sql`
    create index if not exists finance_fx_rates_pair_valid_idx
      on public.finance_fx_rates (
        base_currency,
        quote_currency,
        provider,
        valid_at desc,
        expires_at desc
      )
  `;

  await sql`
    alter table public.finance_transactions
      add column if not exists fx_rate_id uuid
  `;

  await sql`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.finance_transactions'::regclass
          and conname = 'finance_transactions_fx_rate_id_fkey'
      ) then
        alter table public.finance_transactions
          add constraint finance_transactions_fx_rate_id_fkey
          foreign key (fx_rate_id)
          references public.finance_fx_rates(id)
          on delete restrict;
      end if;
    end
    $$;
  `;

  await sql`
    create index if not exists finance_transactions_fx_rate_idx
      on public.finance_transactions (fx_rate_id)
      where fx_rate_id is not null
  `;

  await sql`
    create table if not exists public.retail_product_stock (
      id uuid primary key default gen_random_uuid(),
      organisation_id uuid not null references public.organisations(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      status text not null default 'active',
      stock_quantity integer not null default 0,
      lead_time_days integer not null default 0,
      wholesale_price_amount numeric(20,6),
      retail_price_amount numeric(20,6),
      currency text not null,
      expires_at date,
      notes text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint retail_product_stock_org_product_key unique (organisation_id, product_id),
      constraint retail_product_stock_status_check check (
        status in ('active', 'disabled', 'deleted')
      ),
      constraint retail_product_stock_quantity_check check (stock_quantity >= 0),
      constraint retail_product_stock_lead_time_check check (lead_time_days >= 0),
      constraint retail_product_stock_currency_check check (currency ~ '^[A-Z]{3}$'),
      constraint retail_product_stock_price_check check (
        (wholesale_price_amount is null or wholesale_price_amount >= 0)
        and (retail_price_amount is null or retail_price_amount >= 0)
      ),
      constraint retail_product_stock_active_price_check check (
        status <> 'active' or retail_price_amount is not null
      )
    )
  `;

  await sql`
    create index if not exists retail_product_stock_org_status_idx
      on public.retail_product_stock (organisation_id, status, updated_at desc)
  `;

  await sql`
    create index if not exists retail_product_stock_product_idx
      on public.retail_product_stock (product_id)
  `;

  console.log(JSON.stringify({ retailStockSchema: "applied" }));
} finally {
  await closeSqlPool();
}
