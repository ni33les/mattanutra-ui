import { getSql } from "@/lib/db";

type TableOwnershipRow = Readonly<{
  current_user: string;
  product_imports_owner: string | null;
  product_versions_owner: string | null;
  products_owner: string | null;
}>;

function requireOwnerMode() {
  return (
    process.env.REQUIRE_OWNER === "1" ||
    process.argv.includes("--require-owner")
  );
}

async function main() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const ownershipRows = await sql<Array<TableOwnershipRow>>`
    select
      current_user::text as current_user,
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'products') as products_owner,
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'product_imports') as product_imports_owner,
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'product_versions') as product_versions_owner
  `;
  const ownership = ownershipRows[0];
  const ownsLegacyTables = Boolean(
    ownership &&
    ownership.current_user === ownership.products_owner &&
    ownership.current_user === ownership.product_imports_owner &&
    ownership.current_user === ownership.product_versions_owner
  );

  await sql.begin(async (tx) => {
    await tx`
      insert into public.product_translations (
        product_id,
        locale,
        title,
        description,
        status,
        source,
        metadata,
        created_at,
        updated_at
      )
      select
        products.id,
        translation.locale,
        translation.title,
        translation.description,
        case
          when translation.title is not null and translation.description is not null then 'complete'
          when translation.title is not null or translation.description is not null then 'draft'
          else 'missing'
        end,
        'legacy_translation_cleanup',
        jsonb_build_object('cleanup', 'legacy_fixed_locale_columns'),
        now(),
        now()
      from public.products
      cross join lateral (
        values
          (
            'en',
            nullif(coalesce(
              to_jsonb(products) ->> 'title_en',
              products.source_snapshot -> 'translations' -> 'en' ->> 'title',
              products.source_snapshot ->> 'titleEn'
            ), ''),
            nullif(coalesce(
              to_jsonb(products) ->> 'description_en',
              products.source_snapshot -> 'translations' -> 'en' ->> 'description',
              products.source_snapshot ->> 'descriptionEn'
            ), '')
          ),
          (
            'th',
            nullif(coalesce(
              to_jsonb(products) ->> 'title_th',
              products.source_snapshot -> 'translations' -> 'th' ->> 'title',
              products.source_snapshot ->> 'titleTh'
            ), ''),
            nullif(coalesce(
              to_jsonb(products) ->> 'description_th',
              products.source_snapshot -> 'translations' -> 'th' ->> 'description',
              products.source_snapshot ->> 'descriptionTh'
            ), '')
          )
      ) as translation(locale, title, description)
      where translation.title is not null
        or translation.description is not null
      on conflict (product_id, locale) do update set
        title = coalesce(public.product_translations.title, excluded.title),
        description = coalesce(public.product_translations.description, excluded.description),
        status = case
          when coalesce(public.product_translations.title, excluded.title) is not null
            and coalesce(public.product_translations.description, excluded.description) is not null
            then 'complete'
          when coalesce(public.product_translations.title, excluded.title) is not null
            or coalesce(public.product_translations.description, excluded.description) is not null
            then 'draft'
          else public.product_translations.status
        end,
        metadata = public.product_translations.metadata || excluded.metadata,
        updated_at = now()
    `;

    await tx`
      insert into public.product_import_translations (
        import_id,
        locale,
        title,
        description,
        status,
        source,
        metadata,
        created_at,
        updated_at
      )
      select
        product_imports.id,
        translation.locale,
        translation.title,
        translation.description,
        case
          when translation.title is not null and translation.description is not null then 'complete'
          when translation.title is not null or translation.description is not null then 'draft'
          else 'missing'
        end,
        'legacy_translation_cleanup',
        jsonb_build_object('cleanup', 'legacy_fixed_locale_columns'),
        now(),
        now()
      from public.product_imports
      cross join lateral (
        values
          (
            'en',
            nullif(coalesce(
              to_jsonb(product_imports) ->> 'title_en',
              product_imports.raw_snapshot -> 'translations' -> 'en' ->> 'title',
              product_imports.raw_snapshot ->> 'titleEn'
            ), ''),
            nullif(coalesce(
              to_jsonb(product_imports) ->> 'description_en',
              product_imports.raw_snapshot -> 'translations' -> 'en' ->> 'description',
              product_imports.raw_snapshot ->> 'descriptionEn'
            ), '')
          ),
          (
            'th',
            nullif(coalesce(
              to_jsonb(product_imports) ->> 'title_th',
              product_imports.raw_snapshot -> 'translations' -> 'th' ->> 'title',
              product_imports.raw_snapshot ->> 'titleTh'
            ), ''),
            nullif(coalesce(
              to_jsonb(product_imports) ->> 'description_th',
              product_imports.raw_snapshot -> 'translations' -> 'th' ->> 'description',
              product_imports.raw_snapshot ->> 'descriptionTh'
            ), '')
          )
      ) as translation(locale, title, description)
      where translation.title is not null
        or translation.description is not null
      on conflict (import_id, locale) do update set
        title = coalesce(public.product_import_translations.title, excluded.title),
        description = coalesce(public.product_import_translations.description, excluded.description),
        status = case
          when coalesce(public.product_import_translations.title, excluded.title) is not null
            and coalesce(public.product_import_translations.description, excluded.description) is not null
            then 'complete'
          when coalesce(public.product_import_translations.title, excluded.title) is not null
            or coalesce(public.product_import_translations.description, excluded.description) is not null
            then 'draft'
          else public.product_import_translations.status
        end,
        metadata = public.product_import_translations.metadata || excluded.metadata,
        updated_at = now()
    `;
  });

  if (!ownsLegacyTables) {
    const message = [
      "[translations:schema:cleanup] Translation table backfill complete.",
      `Connected role ${ownership?.current_user ?? "unknown"} does not own legacy product tables`,
      `(owners: products=${ownership?.products_owner ?? "unknown"},`,
      `product_imports=${ownership?.product_imports_owner ?? "unknown"},`,
      `product_versions=${ownership?.product_versions_owner ?? "unknown"}).`,
      "Skipped owner-only product_versions snapshot backfill and legacy column drops.",
      "Re-run with the table-owner migration connection to finish the schema cleanup."
    ].join(" ");

    if (requireOwnerMode()) {
      throw new Error(message);
    }

    console.warn(message);
    await sql.end({ timeout: 5 });
    return;
  }

  await sql.begin(async (tx) => {
    await tx`alter table public.product_versions disable trigger user`;
    await tx`
      update public.product_versions
      set snapshot = jsonb_set(
        coalesce(snapshot, '{}'::jsonb),
        '{translations}',
        coalesce(snapshot -> 'translations', legacy_translation_rows.translations),
        true
      )
      from (
        select
          product_versions.product_id,
          product_versions.version,
          jsonb_strip_nulls(jsonb_build_object(
            'en', jsonb_strip_nulls(jsonb_build_object(
              'title', to_jsonb(product_versions) ->> 'title_en',
              'description', to_jsonb(product_versions) ->> 'description_en'
            )),
            'th', jsonb_strip_nulls(jsonb_build_object(
              'title', to_jsonb(product_versions) ->> 'title_th',
              'description', to_jsonb(product_versions) ->> 'description_th'
            ))
          )) as translations
        from public.product_versions
      ) legacy_translation_rows
      where product_versions.product_id = legacy_translation_rows.product_id
        and product_versions.version = legacy_translation_rows.version
        and legacy_translation_rows.translations <> '{}'::jsonb
    `;
    await tx`alter table public.product_versions enable trigger user`;

    await tx`alter table public.products drop column if exists title_en`;
    await tx`alter table public.products drop column if exists title_th`;
    await tx`alter table public.products drop column if exists description_en`;
    await tx`alter table public.products drop column if exists description_th`;
    await tx`alter table public.product_imports drop column if exists title_en`;
    await tx`alter table public.product_imports drop column if exists title_th`;
    await tx`alter table public.product_imports drop column if exists description_en`;
    await tx`alter table public.product_imports drop column if exists description_th`;
    await tx`alter table public.product_versions drop column if exists title_en`;
    await tx`alter table public.product_versions drop column if exists title_th`;
    await tx`alter table public.product_versions drop column if exists description_en`;
    await tx`alter table public.product_versions drop column if exists description_th`;
  });

  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error("Failed to apply legacy translation cleanup schema", error);
  process.exitCode = 1;
});
