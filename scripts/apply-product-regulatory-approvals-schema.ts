import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_CONNECTION is required to apply the product regulatory approvals schema");
}

try {
  await sql`
    create table if not exists public.product_regulatory_approvals (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references public.products(id) on delete cascade,
      scope_type text not null,
      scope_code text not null,
      agency_code text not null,
      agency_name text not null,
      approval_type text not null default 'product_registration',
      approval_number text not null,
      status text not null default 'verified',
      source text,
      evidence_url text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint product_regulatory_approvals_scope_type_check check (
        scope_type in ('country', 'region')
      ),
      constraint product_regulatory_approvals_scope_check check (
        (
          scope_type = 'country'
          and scope_code ~ '^[A-Z]{2}$'
        )
        or (
          scope_type = 'region'
          and scope_code ~ '^[A-Z0-9_]{2,20}$'
        )
      ),
      constraint product_regulatory_approvals_agency_code_check check (
        agency_code ~ '^[A-Z0-9_]{2,40}$'
      ),
      constraint product_regulatory_approvals_approval_type_check check (
        approval_type in ('product_registration')
      ),
      constraint product_regulatory_approvals_status_check check (
        status in ('sourced', 'verified', 'rejected', 'expired')
      ),
      constraint product_regulatory_approvals_approval_number_check check (
        length(trim(approval_number)) > 0
      ),
      constraint product_regulatory_approvals_unique_key unique (
        product_id,
        scope_type,
        scope_code,
        agency_code,
        approval_type,
        approval_number
      )
    )
  `;

  await sql`
    alter table public.product_regulatory_approvals
      add column if not exists source text,
      add column if not exists evidence_url text,
      add column if not exists metadata jsonb not null default '{}'::jsonb,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now()
  `;

  await sql`
    alter table public.product_regulatory_approvals
      drop constraint if exists product_regulatory_approvals_scope_type_check,
      drop constraint if exists product_regulatory_approvals_scope_check,
      drop constraint if exists product_regulatory_approvals_agency_code_check,
      drop constraint if exists product_regulatory_approvals_approval_type_check,
      drop constraint if exists product_regulatory_approvals_status_check,
      drop constraint if exists product_regulatory_approvals_approval_number_check
  `;

  await sql`
    alter table public.product_regulatory_approvals
      add constraint product_regulatory_approvals_scope_type_check check (
        scope_type in ('country', 'region')
      ),
      add constraint product_regulatory_approvals_scope_check check (
        (
          scope_type = 'country'
          and scope_code ~ '^[A-Z]{2}$'
        )
        or (
          scope_type = 'region'
          and scope_code ~ '^[A-Z0-9_]{2,20}$'
        )
      ),
      add constraint product_regulatory_approvals_agency_code_check check (
        agency_code ~ '^[A-Z0-9_]{2,40}$'
      ),
      add constraint product_regulatory_approvals_approval_type_check check (
        approval_type in ('product_registration')
      ),
      add constraint product_regulatory_approvals_status_check check (
        status in ('sourced', 'verified', 'rejected', 'expired')
      ),
      add constraint product_regulatory_approvals_approval_number_check check (
        length(trim(approval_number)) > 0
      )
  `;

  await sql`
    create unique index if not exists product_regulatory_approvals_unique_key
      on public.product_regulatory_approvals (
        product_id,
        scope_type,
        scope_code,
        agency_code,
        approval_type,
        approval_number
      )
  `;

  await sql`
    create index if not exists product_regulatory_approvals_product_idx
      on public.product_regulatory_approvals (product_id, status, updated_at desc)
  `;

  await sql`
    create index if not exists product_regulatory_approvals_scope_idx
      on public.product_regulatory_approvals (scope_type, scope_code, agency_code, status)
  `;

  await sql`
    create index if not exists product_regulatory_approvals_number_idx
      on public.product_regulatory_approvals (approval_number)
  `;

  await sql`
    insert into public.product_regulatory_approvals (
      product_id,
      scope_type,
      scope_code,
      agency_code,
      agency_name,
      approval_type,
      approval_number,
      status,
      source,
      evidence_url,
      metadata,
      created_at,
      updated_at
    )
    select
      products.id,
      'country',
      'TH',
      'TH_FDA',
      'Thai FDA',
      'product_registration',
      btrim(products.fda_approval_number),
      'verified',
      'legacy_products_fda_approval_number',
      products.source_url,
      jsonb_build_object(
        'migratedFrom', 'products.fda_approval_number',
        'migratedAt', now()
      ),
      now(),
      now()
    from public.products
    where nullif(btrim(coalesce(products.fda_approval_number, '')), '') is not null
    on conflict (
      product_id,
      scope_type,
      scope_code,
      agency_code,
      approval_type,
      approval_number
    )
    do update set
      agency_name = excluded.agency_name,
      status = case
        when public.product_regulatory_approvals.status = 'verified'
          then public.product_regulatory_approvals.status
        else excluded.status
      end,
      evidence_url = coalesce(public.product_regulatory_approvals.evidence_url, excluded.evidence_url),
      metadata = public.product_regulatory_approvals.metadata || excluded.metadata,
      updated_at = now()
  `;

  await sql`
    do $$
    begin
      if exists (select 1 from pg_roles where rolname = 'mn') then
        grant usage on schema public to mn;
        grant select, insert, update, delete on table
          public.product_regulatory_approvals
        to mn;
      end if;
    end
    $$;
  `;

  const rows = await sql<Array<{
    approvals: number;
    thaiFdaApprovals: number;
  }>>`
    select
      (select count(*)::int from public.product_regulatory_approvals) as approvals,
      (
        select count(*)::int
        from public.product_regulatory_approvals
        where scope_type = 'country'
          and scope_code = 'TH'
          and agency_code = 'TH_FDA'
      ) as "thaiFdaApprovals"
  `;

  console.log("[product-regulatory-approvals:schema]", rows[0] ?? {});
} finally {
  await closeSqlPool();
}
