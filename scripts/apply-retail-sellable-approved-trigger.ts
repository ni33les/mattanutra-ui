import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to apply the retail sellable approval trigger");
}

try {
  await sql`
    create or replace function public.retail_sellable_requires_approved_product()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.status = 'active'
        and (
          tg_op = 'INSERT'
          or old.status is distinct from 'active'
        )
        and not exists (
          select 1
          from public.products
          where products.id = new.product_id
            and products.status = 'approved'
        )
      then
        raise exception 'Only approved platform products can be selected for retail'
          using errcode = '23514';
      end if;

      return new;
    end
    $$
  `;

  await sql`
    drop trigger if exists retail_sellable_requires_approved_product
      on public.retail_sellable_products
  `;

  await sql`
    create trigger retail_sellable_requires_approved_product
      before insert or update of status, product_id
      on public.retail_sellable_products
      for each row
      execute function public.retail_sellable_requires_approved_product()
  `;

  console.log(JSON.stringify({ retailSellableApprovedTrigger: "applied" }));
} finally {
  await closeSqlPool();
}
