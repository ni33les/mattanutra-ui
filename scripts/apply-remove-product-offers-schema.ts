import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_CONNECTION is required to remove product offer schema");
}

try {
  await sql.unsafe(`
    alter table if exists public.product_recommendation_items
      drop constraint if exists product_recommendation_items_offer_id_fkey;

    alter table if exists public.product_recommendation_decisions
      drop constraint if exists product_recommendation_decisions_offer_id_fkey;

    alter table if exists public.product_imports
      drop constraint if exists product_imports_offer_id_fkey;

    alter table if exists public.product_recommendation_items
      drop column if exists offer_id;

    alter table if exists public.product_recommendation_decisions
      drop column if exists offer_id;

    alter table if exists public.product_imports
      drop column if exists offer_id,
      drop column if exists affiliate_status;

    alter table if exists public.product_versions
      drop column if exists affiliate_status;

    alter table if exists public.products
      drop constraint if exists products_affiliate_status_check,
      drop column if exists affiliate_status,
      drop column if exists affiliate_checked_at;

    drop table if exists public.product_affiliate_links cascade;
    drop table if exists public.product_offers cascade;
  `);

  const [remaining] = await sql<Array<{
    legacyColumns: number;
    productAffiliateLinks: string | null;
    productOffers: string | null;
  }>>`
    select
      to_regclass('public.product_offers')::text as "productOffers",
      to_regclass('public.product_affiliate_links')::text as "productAffiliateLinks",
      (
        select count(*)::int
        from information_schema.columns
        where table_schema = 'public'
          and (
            (table_name in (
              'product_imports',
              'product_recommendation_decisions',
              'product_recommendation_items'
            ) and column_name = 'offer_id')
            or (table_name in ('product_imports', 'product_versions', 'products') and column_name = 'affiliate_status')
            or (table_name = 'products' and column_name = 'affiliate_checked_at')
          )
      ) as "legacyColumns"
  `;

  console.log("[product-offers:schema:remove]", remaining ?? {});
} finally {
  await closeSqlPool();
}
