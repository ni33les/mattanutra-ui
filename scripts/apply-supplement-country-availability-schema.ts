import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to apply supplement country availability schema");
}

try {
  await sql`
    create table if not exists public.supplement_country_availability (
      supplement_id uuid not null,
      country_code text not null,
      status text not null,
      reason text,
      source text not null default 'admin_dashboard',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint supplement_country_availability_pkey
        primary key (supplement_id, country_code),
      constraint supplement_country_availability_country_code_check
        check (country_code ~ '^[A-Z]{2}$'),
      constraint supplement_country_availability_status_check
        check (status in ('allowed', 'blocked'))
    )
  `;

  await sql`
    alter table public.supplement_country_availability
      add column if not exists reason text,
      add column if not exists source text not null default 'admin_dashboard',
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now()
  `;

  await sql`
    alter table public.supplement_country_availability
      drop constraint if exists supplement_country_availability_supplement_id_fkey,
      drop constraint if exists supplement_country_availability_country_code_check,
      drop constraint if exists supplement_country_availability_status_check
  `;

  await sql`
    alter table public.supplement_country_availability
      add constraint supplement_country_availability_supplement_id_fkey
        foreign key (supplement_id) references public.supplements(id) on delete cascade,
      add constraint supplement_country_availability_country_code_check
        check (country_code ~ '^[A-Z]{2}$'),
      add constraint supplement_country_availability_status_check
        check (status in ('allowed', 'blocked'))
  `;

  await sql`
    create index if not exists supplement_country_availability_country_idx
      on public.supplement_country_availability (country_code, status, updated_at desc)
  `;

  console.log(JSON.stringify({ ok: true, table: "supplement_country_availability" }));
} finally {
  await closeSqlPool();
}
