import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to apply the product identifier schema");
}

try {
  await sql`
    create table if not exists public.product_identifiers (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references public.products(id) on delete cascade,
      identifier_type text not null,
      identifier_value text not null,
      normalized_value text not null,
      source text not null default 'admin',
      confidence text not null default 'medium',
      evidence_url text,
      status text not null default 'active',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint product_identifiers_type_check check (
        identifier_type in ('ean13', 'manufacturer_sku', 'retailer_local_code', 'supplier_code')
      ),
      constraint product_identifiers_confidence_check check (
        confidence in ('trusted', 'high', 'medium', 'low')
      ),
      constraint product_identifiers_status_check check (
        status in ('active', 'disabled', 'deleted')
      ),
      constraint product_identifiers_value_check check (
        length(trim(identifier_value)) > 0 and length(trim(normalized_value)) > 0
      ),
      constraint product_identifiers_ean13_check check (
        identifier_type <> 'ean13' or normalized_value ~ '^[0-9]{13}$'
      )
    )
  `;

  await sql`
    create table if not exists public.product_identifier_candidates (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references public.products(id) on delete cascade,
      identifier_type text not null,
      identifier_value text not null,
      normalized_value text not null,
      source text not null default 'unknown',
      confidence text not null default 'medium',
      evidence_url text,
      status text not null default 'pending',
      conflict_product_ids uuid[] not null default '{}'::uuid[],
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint product_identifier_candidates_type_check check (
        identifier_type in ('ean13', 'manufacturer_sku', 'retailer_local_code', 'supplier_code')
      ),
      constraint product_identifier_candidates_confidence_check check (
        confidence in ('trusted', 'high', 'medium', 'low')
      ),
      constraint product_identifier_candidates_status_check check (
        status in ('pending', 'approved', 'rejected', 'conflict')
      ),
      constraint product_identifier_candidates_value_check check (
        length(trim(identifier_value)) > 0 and length(trim(normalized_value)) > 0
      ),
      constraint product_identifier_candidates_ean13_check check (
        identifier_type <> 'ean13' or normalized_value ~ '^[0-9]{13}$'
      )
    )
  `;

  await sql`
    delete from public.product_identifier_candidates
    where identifier_type = 'internal_sku'
  `;

  await sql`
    delete from public.product_identifiers
    where identifier_type = 'internal_sku'
  `;

  await sql`
    alter table public.product_identifiers
    drop constraint if exists product_identifiers_type_check
  `;

  await sql`
    alter table public.product_identifiers
    add constraint product_identifiers_type_check check (
      identifier_type in ('ean13', 'manufacturer_sku', 'retailer_local_code', 'supplier_code')
    )
  `;

  await sql`
    alter table public.product_identifier_candidates
    drop constraint if exists product_identifier_candidates_type_check
  `;

  await sql`
    alter table public.product_identifier_candidates
    add constraint product_identifier_candidates_type_check check (
      identifier_type in ('ean13', 'manufacturer_sku', 'retailer_local_code', 'supplier_code')
    )
  `;

  await sql`
    create unique index if not exists product_identifiers_product_type_value_key
      on public.product_identifiers (product_id, identifier_type, normalized_value)
  `;

  await sql`
    create unique index if not exists product_identifiers_active_type_value_key
      on public.product_identifiers (identifier_type, normalized_value)
      where status = 'active'
  `;

  await sql`
    create index if not exists product_identifiers_product_type_idx
      on public.product_identifiers (product_id, identifier_type, status, updated_at desc)
  `;

  await sql`
    create unique index if not exists product_identifier_candidates_product_source_key
      on public.product_identifier_candidates (
        product_id,
        identifier_type,
        normalized_value,
        source
      )
  `;

  await sql`
    create index if not exists product_identifier_candidates_status_idx
      on public.product_identifier_candidates (
        status,
        identifier_type,
        updated_at desc
      )
  `;

  await sql`
    create table if not exists public.retail_product_cost_observations (
      id uuid primary key default gen_random_uuid(),
      organisation_id uuid references public.organisations(id) on delete set null,
      product_id uuid not null references public.products(id) on delete cascade,
      source text not null default 'hygeia_import',
      ean13 text,
      wholesale_price_amount numeric(20,6),
      retail_price_amount numeric(20,6),
      currency text not null default 'THB',
      observed_at timestamptz not null default now(),
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      constraint retail_product_cost_observations_currency_check check (
        currency ~ '^[A-Z]{3}$'
      ),
      constraint retail_product_cost_observations_ean13_check check (
        ean13 is null or ean13 ~ '^[0-9]{13}$'
      ),
      constraint retail_product_cost_observations_price_check check (
        (wholesale_price_amount is null or wholesale_price_amount >= 0)
        and (retail_price_amount is null or retail_price_amount >= 0)
      )
    )
  `;

  await sql`
    create index if not exists retail_product_cost_observations_product_idx
      on public.retail_product_cost_observations (product_id, observed_at desc)
  `;

  await sql`
    create index if not exists retail_product_cost_observations_org_idx
      on public.retail_product_cost_observations (organisation_id, observed_at desc)
      where organisation_id is not null
  `;

  await sql`
    do $$
    begin
      if exists (select 1 from pg_roles where rolname = 'mn') then
        grant usage on schema public to mn;
        grant select, insert, update, delete on table
          public.product_identifiers,
          public.product_identifier_candidates,
          public.retail_product_cost_observations
        to mn;
      end if;
    end
    $$;
  `;

  const rows = await sql<Array<{
    candidates: number;
    costObservations: number;
    identifiers: number;
  }>>`
    select
      (select count(*)::int from public.product_identifiers) as identifiers,
      (select count(*)::int from public.product_identifier_candidates) as candidates,
      (select count(*)::int from public.retail_product_cost_observations) as "costObservations"
  `;

  console.log("[product-identifiers:schema]", rows[0] ?? {});
} finally {
  await closeSqlPool();
}
