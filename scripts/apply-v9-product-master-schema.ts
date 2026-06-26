import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to apply the v9 product master schema");
}

try {
  await sql`
    alter table public.products
      drop constraint if exists products_platform_check
  `;
  await sql`
    alter table public.products
      add constraint products_platform_check check (
        platform = any(array[
          'lazada',
          'manual',
          'shopee',
          'wholesale_pharmacy_import'
        ]::text[])
      )
  `;
  console.log(JSON.stringify({ v9ProductMasterSchema: "applied" }));
} finally {
  await closeSqlPool();
}
