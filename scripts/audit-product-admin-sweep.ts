import { closeSqlPool, getSql } from "@/lib/db";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is not configured");
}

const countryCode = (argValue("country") ?? "TH").trim().toUpperCase() || "TH";
const limit = positiveInt(argValue("limit"), 20);

try {
  const [tableRows, summaryRows, blockedRows, orphanRows, upcRows] =
    await Promise.all([
      sql<Array<{
        product_brand_countries: boolean;
        product_countries: boolean;
        product_facts: boolean;
        product_identifiers: boolean;
        products: boolean;
        supplements: boolean;
      }>>`
        select
          to_regclass('public.products') is not null as products,
          to_regclass('public.product_brands') is not null as product_brands,
          to_regclass('public.product_brand_countries') is not null as product_brand_countries,
          to_regclass('public.product_countries') is not null as product_countries,
          to_regclass('public.product_facts') is not null as product_facts,
          to_regclass('public.product_identifiers') is not null as product_identifiers,
          to_regclass('public.supplements') is not null as supplements
      `,
      sql<Array<{
        approved_but_not_matchable: number;
        approved_missing_image: number;
        approved_products: number;
        approved_unapproved_brand: number;
        approved_unparsed_label: number;
        approved_validation_not_pass: number;
        approved_without_country: number;
        eligible_products: number;
        ignored_products: number;
        pending_products: number;
        total_products: number;
      }>>`
        select
          count(*)::int as total_products,
          count(*) filter (where products.status = 'approved')::int as approved_products,
          count(*) filter (where products.status = 'pending_review')::int as pending_products,
          count(*) filter (where products.status = 'ignored')::int as ignored_products,
          count(*) filter (
            where products.status = 'approved'
              and coalesce(product_brands.status, '') <> 'approved'
          )::int as approved_unapproved_brand,
          count(*) filter (
            where products.status = 'approved'
              and (products.image_url is null or btrim(products.image_url) = '')
          )::int as approved_missing_image,
          count(*) filter (
            where products.status = 'approved'
              and products.label_status <> 'parsed'
          )::int as approved_unparsed_label,
          count(*) filter (
            where products.status = 'approved'
              and coalesce(products.validation_status, '') <> 'pass'
          )::int as approved_validation_not_pass,
          count(*) filter (
            where products.status = 'approved'
              and not exists (
                select 1
                from public.product_countries product_countries
                where product_countries.product_id = products.id
                  and product_countries.country_code = ${countryCode}
              )
          )::int as approved_without_country,
          count(*) filter (
            where products.status = 'approved'
              and coalesce(product_brands.status, '') = 'approved'
              and products.label_status = 'parsed'
              and coalesce(products.validation_status, '') = 'pass'
              and exists (
                select 1
                from public.product_countries product_countries
                where product_countries.product_id = products.id
                  and product_countries.country_code = ${countryCode}
              )
              and (
                product_brands.id is null
                or not exists (
                  select 1
                  from public.product_brand_countries product_brand_countries
                  where product_brand_countries.brand_id = product_brands.id
                )
                or exists (
                  select 1
                  from public.product_brand_countries product_brand_countries
                  where product_brand_countries.brand_id = product_brands.id
                    and product_brand_countries.country_code = ${countryCode}
                )
              )
          )::int as eligible_products,
          count(*) filter (
            where products.status = 'approved'
              and (
                coalesce(product_brands.status, '') <> 'approved'
                or products.label_status <> 'parsed'
                or coalesce(products.validation_status, '') <> 'pass'
                or products.image_url is null
                or btrim(products.image_url) = ''
                or not exists (
                  select 1
                  from public.product_countries product_countries
                  where product_countries.product_id = products.id
                    and product_countries.country_code = ${countryCode}
                )
              )
          )::int as approved_but_not_matchable
        from public.products products
        left join public.product_brands product_brands
          on product_brands.id = products.brand_id
      `,
      sql<Array<{
        brand_name: string | null;
        brand_status: string | null;
        country_codes: string[] | null;
        id: string;
        label_status: string;
        reason: string;
        title: string;
        updated_at: string;
        validation_status: string | null;
        validation_summary: string | null;
      }>>`
        select
          products.id::text,
          products.title,
          products.brand_name,
          product_brands.status as brand_status,
          products.label_status,
          products.validation_status,
          products.validation_summary,
          products.updated_at::text,
          coalesce(country_rows.country_codes, '{}'::text[]) as country_codes,
          case
            when coalesce(product_brands.status, '') <> 'approved' then 'brand_not_approved'
            when products.image_url is null or btrim(products.image_url) = '' then 'missing_image'
            when products.label_status <> 'parsed' then 'label_not_parsed'
            when coalesce(products.validation_status, '') <> 'pass' then 'validation_not_pass'
            when not (${countryCode} = any(coalesce(country_rows.country_codes, '{}'::text[]))) then 'country_not_available'
            else 'unknown'
          end as reason
        from public.products products
        left join public.product_brands product_brands
          on product_brands.id = products.brand_id
        left join lateral (
          select array_agg(product_countries.country_code order by product_countries.country_code) as country_codes
          from public.product_countries product_countries
          where product_countries.product_id = products.id
        ) country_rows on true
        where products.status = 'approved'
          and (
            coalesce(product_brands.status, '') <> 'approved'
            or products.label_status <> 'parsed'
            or coalesce(products.validation_status, '') <> 'pass'
            or products.image_url is null
            or btrim(products.image_url) = ''
            or not (${countryCode} = any(coalesce(country_rows.country_codes, '{}'::text[])))
          )
        order by products.updated_at desc
        limit ${limit}
      `,
      sql<Array<{
        fact_id: string;
        fact_name: string;
        matched_supplement_count: number;
        normalized_name: string | null;
        product_id: string;
        product_title: string;
      }>>`
        select
          product_facts.id::text as fact_id,
          product_facts.product_id::text,
          products.title as product_title,
          product_facts.name as fact_name,
          product_facts.normalized_name,
          count(distinct coalesce(supplements.id, alias_supplements.id))::int as matched_supplement_count
        from public.product_facts product_facts
        join public.products products
          on products.id = product_facts.product_id
        left join public.supplements supplements
          on product_facts.item_type = 'supplement'
          and supplements.list_status = 'active'
          and supplements.normalized_name = product_facts.normalized_name
        left join public.supplement_aliases supplement_aliases
          on product_facts.item_type = 'supplement'
          and supplement_aliases.normalized_alias = product_facts.normalized_name
        left join public.supplements alias_supplements
          on alias_supplements.id = supplement_aliases.supplement_id
          and alias_supplements.list_status = 'active'
        where product_facts.item_type = 'supplement'
          and product_facts.supplement_id is null
          and product_facts.normalized_name is not null
          and product_facts.normalized_name <> ''
        group by
          product_facts.id,
          product_facts.product_id,
          products.title,
          product_facts.name,
          product_facts.normalized_name
        order by matched_supplement_count desc, product_facts.name asc
        limit ${limit}
      `,
      sql<Array<{
        active_upc_identifiers: number;
        constraint_definition: string | null;
        upc_constraint_present: boolean;
        upc_type_allowed: boolean;
      }>>`
        select
          exists (
            select 1
            from pg_constraint
            where conname = 'product_identifiers_upc_check'
              and conrelid = 'public.product_identifiers'::regclass
          ) as upc_constraint_present,
          coalesce((
            select pg_get_constraintdef(pg_constraint.oid)
            from pg_constraint
            where conname = 'product_identifiers_type_check'
              and conrelid = 'public.product_identifiers'::regclass
            limit 1
          ), '') as constraint_definition,
          coalesce((
            select pg_get_constraintdef(pg_constraint.oid) ilike '%upc%'
            from pg_constraint
            where conname = 'product_identifiers_type_check'
              and conrelid = 'public.product_identifiers'::regclass
            limit 1
          ), false) as upc_type_allowed,
          (
            select count(*)::int
            from public.product_identifiers
            where product_identifiers.identifier_type = 'upc'
              and product_identifiers.status = 'active'
          ) as active_upc_identifiers
      `
    ]);

  console.log(JSON.stringify({
    countryCode,
    generatedAt: new Date().toISOString(),
    limit,
    samples: {
      approvedButNotMatchable: blockedRows,
      unlinkedSupplementFacts: orphanRows
    },
    summary: summaryRows[0] ?? null,
    tables: tableRows[0] ?? null,
    upc: upcRows[0] ?? null
  }, null, 2));
} finally {
  await closeSqlPool();
}
