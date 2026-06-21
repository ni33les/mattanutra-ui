import type { StockDb } from "@/lib/admin-retail-stock-types";

export async function operationalStockTablesAvailable(sql: StockDb) {
  const rows = await sql<Array<{ available: boolean }>>`
    select (
      to_regclass('public.retail_stock_lots') is not null
      and to_regclass('public.retail_stock_movements') is not null
      and to_regclass('public.retail_stock_reorder_advice') is not null
    ) as available
  `;

  return Boolean(rows[0]?.available);
}

export async function retailOperationsTablesAvailable(sql: StockDb) {
  const rows = await sql<Array<{ available: boolean }>>`
    select (
      to_regclass('public.retail_customer_orders') is not null
      and to_regclass('public.retail_customer_order_lines') is not null
      and to_regclass('public.retail_order_allocations') is not null
    ) as available
  `;

  return Boolean(rows[0]?.available);
}

export async function retailCheckoutPaymentsTableAvailable(sql: StockDb) {
  const rows = await sql<Array<{ available: boolean }>>`
    select to_regclass('public.retail_checkout_payments') is not null as available
  `;

  return Boolean(rows[0]?.available);
}

async function retailShoppingListTablesAvailable(sql: StockDb) {
  const rows = await sql<Array<{ available: boolean }>>`
    select (
      to_regclass('public.retail_shopping_lists') is not null
      and to_regclass('public.retail_shopping_list_lines') is not null
    ) as available
  `;

  return Boolean(rows[0]?.available);
}

export async function ensureRetailShoppingListTablesAvailable(sql: StockDb) {
  if (!(await retailShoppingListTablesAvailable(sql))) {
    throw new Error("Retail shopping list tables are not available");
  }
}
