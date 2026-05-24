import { closeSqlPool, getSql } from "@/lib/db";

const schemaSql = `
create table if not exists public.site_locales (
  code text primary key,
  label text not null,
  native_label text not null,
  html_lang text not null,
  direction text not null default 'ltr',
  fallback_locale text null,
  is_public boolean not null default false,
  is_indexable boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_locales_code_check check (code ~ '^[a-z]{2}(-[A-Z0-9]{2,8})?$'),
  constraint site_locales_direction_check check (direction in ('ltr', 'rtl'))
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_locales_fallback_locale_fkey'
      and conrelid = 'public.site_locales'::regclass
  ) then
    alter table public.site_locales
      add constraint site_locales_fallback_locale_fkey
      foreign key (fallback_locale) references public.site_locales(code);
  end if;
end;
$$;

insert into public.site_locales (
  code,
  label,
  native_label,
  html_lang,
  direction,
  fallback_locale,
  is_public,
  is_indexable,
  sort_order
)
values
  ('en', 'EN', 'English', 'en', 'ltr', null, true, true, 10),
  ('th', 'TH', 'ไทย', 'th', 'ltr', 'en', true, true, 20)
on conflict (code) do update set
  label = excluded.label,
  native_label = excluded.native_label,
  html_lang = excluded.html_lang,
  direction = excluded.direction,
  fallback_locale = excluded.fallback_locale,
  is_public = excluded.is_public,
  is_indexable = excluded.is_indexable,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.product_translations (
  product_id uuid not null references public.products(id) on delete cascade,
  locale text not null references public.site_locales(code),
  title text null,
  description text null,
  status text not null default 'draft',
  source text not null default 'migration',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, locale),
  constraint product_translations_status_check check (status in ('complete', 'draft', 'missing'))
);

alter table public.product_translations
  add column if not exists title text null,
  add column if not exists description text null,
  add column if not exists status text default 'draft',
  add column if not exists source text default 'migration',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.product_translations
set
  status = case when status in ('complete', 'draft', 'missing') then status else 'draft' end,
  source = coalesce(nullif(source, ''), 'migration'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.product_translations
  alter column status set default 'draft',
  alter column status set not null,
  alter column source set default 'migration',
  alter column source set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists product_translations_locale_idx
  on public.product_translations (locale, status);

insert into public.product_translations (
  product_id,
  locale,
  title,
  description,
  status,
  source,
  metadata
)
select
  products.id,
  locale_rows.locale,
  nullif(locale_rows.title, ''),
  nullif(locale_rows.description, ''),
  case
    when nullif(locale_rows.title, '') is not null
      and nullif(locale_rows.description, '') is not null
      then 'complete'
    when nullif(locale_rows.title, '') is not null
      or nullif(locale_rows.description, '') is not null
      then 'draft'
    else 'missing'
  end,
  'locale_schema_apply',
  '{}'::jsonb
from public.products
cross join lateral (
  values
    (
      'en',
      coalesce(to_jsonb(products) ->> 'title_en', products.title),
      coalesce(
        to_jsonb(products) ->> 'description_en',
        products.description,
        products.source_snapshot ->> 'descriptionEn'
      )
    ),
    (
      'th',
      coalesce(
        to_jsonb(products) ->> 'title_th',
        products.source_snapshot ->> 'titleTh'
      ),
      coalesce(
        to_jsonb(products) ->> 'description_th',
        products.source_snapshot ->> 'descriptionTh'
      )
    )
) as locale_rows(locale, title, description)
where nullif(locale_rows.title, '') is not null
   or nullif(locale_rows.description, '') is not null
on conflict (product_id, locale) do update set
  title = coalesce(excluded.title, public.product_translations.title),
  description = coalesce(excluded.description, public.product_translations.description),
  status = excluded.status,
  source = excluded.source,
  updated_at = now();

create table if not exists public.product_import_translations (
  import_id uuid not null references public.product_imports(id) on delete cascade,
  locale text not null references public.site_locales(code),
  title text null,
  description text null,
  status text not null default 'draft',
  source text not null default 'migration',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (import_id, locale),
  constraint product_import_translations_status_check check (status in ('complete', 'draft', 'missing'))
);

alter table public.product_import_translations
  add column if not exists title text null,
  add column if not exists description text null,
  add column if not exists status text default 'draft',
  add column if not exists source text default 'migration',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.product_import_translations
set
  status = case when status in ('complete', 'draft', 'missing') then status else 'draft' end,
  source = coalesce(nullif(source, ''), 'migration'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.product_import_translations
  alter column status set default 'draft',
  alter column status set not null,
  alter column source set default 'migration',
  alter column source set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists product_import_translations_locale_idx
  on public.product_import_translations (locale, status);

insert into public.product_import_translations (
  import_id,
  locale,
  title,
  description,
  status,
  source,
  metadata
)
select
  product_imports.id,
  locale_rows.locale,
  nullif(locale_rows.title, ''),
  nullif(locale_rows.description, ''),
  case
    when nullif(locale_rows.title, '') is not null
      and nullif(locale_rows.description, '') is not null
      then 'complete'
    when nullif(locale_rows.title, '') is not null
      or nullif(locale_rows.description, '') is not null
      then 'draft'
    else 'missing'
  end,
  'locale_schema_apply',
  '{}'::jsonb
from public.product_imports
cross join lateral (
  values
    (
      'en',
      coalesce(
        to_jsonb(product_imports) ->> 'title_en',
        product_imports.raw_snapshot ->> 'titleEn',
        product_imports.product_title
      ),
      coalesce(
        to_jsonb(product_imports) ->> 'description_en',
        product_imports.raw_snapshot ->> 'descriptionEn',
        product_imports.raw_snapshot ->> 'description'
      )
    ),
    (
      'th',
      coalesce(
        to_jsonb(product_imports) ->> 'title_th',
        product_imports.raw_snapshot ->> 'titleTh'
      ),
      coalesce(
        to_jsonb(product_imports) ->> 'description_th',
        product_imports.raw_snapshot ->> 'descriptionTh'
      )
    )
) as locale_rows(locale, title, description)
where nullif(locale_rows.title, '') is not null
   or nullif(locale_rows.description, '') is not null
on conflict (import_id, locale) do update set
  title = coalesce(excluded.title, public.product_import_translations.title),
  description = coalesce(excluded.description, public.product_import_translations.description),
  status = excluded.status,
  source = excluded.source,
  updated_at = now();
`;

async function main() {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_CONNECTION is not configured");
  }

  await sql.unsafe(schemaSql);

  const [summary] = await sql<Array<{
    import_translations: number;
    locales: number;
    product_translations: number;
  }>>`
    select
      (select count(*)::int from public.site_locales) as locales,
      (select count(*)::int from public.product_translations) as product_translations,
      (select count(*)::int from public.product_import_translations) as import_translations
  `;

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlPool();
  });
