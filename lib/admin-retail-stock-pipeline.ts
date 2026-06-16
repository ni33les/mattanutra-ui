import type postgres from "postgres";
import { getSql } from "@/lib/db";
import { integerOrDefault } from "@/lib/admin-retail-stock-codecs";
import type { Locale } from "@/lib/i18n";
import type {
  AdminRetailStockPipelineRow,
  RetailStockPipelineStatus
} from "@/lib/admin-retail-stock";

type StockDb = postgres.Sql | postgres.TransactionSql;

export function retailStockPipelineStatus(input: Readonly<{
  allocatedUnits: number;
  availableNowUnits: number;
  customerDemandUnits: number;
  unorderedNeedUnits: number;
}>): RetailStockPipelineStatus {
  if (input.unorderedNeedUnits > 0) {
    return "unordered";
  }

  if (
    input.allocatedUnits > 0 &&
    input.allocatedUnits < input.customerDemandUnits
  ) {
    return "partially_allocated";
  }

  if (input.availableNowUnits > 0 || input.allocatedUnits >= input.customerDemandUnits) {
    return "available_now";
  }

  return "backorder";
}

export function aggregateRetailStockPipelineRows(
  rows: readonly AdminRetailStockPipelineRow[],
  customerOrderId: string
): AdminRetailStockPipelineRow | null {
  const orderRows = rows.filter((row) => row.customerOrderId === customerOrderId);

  if (orderRows.length === 0) {
    return null;
  }

  const totals = orderRows.reduce(
    (total, row) => ({
      allocatedUnits: total.allocatedUnits + row.allocatedUnits,
      availableNowUnits: total.availableNowUnits + row.availableNowUnits,
      backedAllocatedUnits:
        total.backedAllocatedUnits + row.backedAllocatedUnits,
      customerDemandUnits: total.customerDemandUnits + row.customerDemandUnits,
      shippedUnits: total.shippedUnits + row.shippedUnits,
      unorderedNeedUnits: total.unorderedNeedUnits + row.unorderedNeedUnits
    }),
    {
      allocatedUnits: 0,
      availableNowUnits: 0,
      backedAllocatedUnits: 0,
      customerDemandUnits: 0,
      shippedUnits: 0,
      unorderedNeedUnits: 0
    }
  );

  return {
    ...totals,
    customerOrderId,
    customerOrderLineId: null,
    organisationId: orderRows[0]?.organisationId ?? "",
    orderNumber: orderRows[0]?.orderNumber ?? null,
    productId: null,
    productTitle: null,
    status: retailStockPipelineStatus({
      ...totals,
      allocatedUnits: totals.backedAllocatedUnits
    })
  };
}

export function retailStockPipelineKey(
  customerOrderLineId: string | null | undefined,
  productId: string | null | undefined
) {
  return `${customerOrderLineId ?? "product"}:${productId ?? "all"}`;
}

export async function getRetailStockPipeline(input: Readonly<{
  customerOrderId?: string | null;
  locale: Locale;
  organisationIds: readonly string[];
  productId?: string | null;
  sql?: StockDb;
}>): Promise<AdminRetailStockPipelineRow[]> {
  const sql = input.sql ?? getSql();

  if (!sql || input.organisationIds.length === 0) {
    return [];
  }

  const productTitle = localizedProductTitleExpression(sql, input.locale);
  const rows = await sql<Array<{
    active_allocated_units: number | string | null;
    allocated_units: number | string | null;
    customer_demand_units: number | string | null;
    customer_order_id: string;
    customer_order_line_id: string;
    order_number: string;
    organisation_id: string;
    physical_stock_units: number | string | null;
    product_id: string;
    product_title: string;
    shipped_units: number | string | null;
  }>>`
    with order_lines as (
      select
        retail_customer_order_lines.id,
        retail_customer_order_lines.customer_order_id,
        retail_customer_order_lines.organisation_id,
        retail_customer_order_lines.product_id,
        greatest(
          retail_customer_order_lines.quantity_ordered
            - retail_customer_order_lines.quantity_shipped,
          0
        )::int as customer_demand_units,
        retail_customer_order_lines.quantity_allocated::int as allocated_units,
        retail_customer_order_lines.quantity_shipped::int as shipped_units,
        retail_customer_orders.order_number
      from public.retail_customer_order_lines
      join public.retail_customer_orders
        on retail_customer_orders.id = retail_customer_order_lines.customer_order_id
      where retail_customer_order_lines.organisation_id = any(${input.organisationIds}::uuid[])
        and retail_customer_orders.status not in ('cancelled', 'delivered', 'returned')
        and (
          ${input.customerOrderId ?? null}::uuid is null
          or retail_customer_order_lines.customer_order_id = ${input.customerOrderId ?? null}::uuid
        )
        and (
          ${input.productId ?? null}::uuid is null
          or retail_customer_order_lines.product_id = ${input.productId ?? null}::uuid
        )
    ),
    physical_stock as (
      select
        organisation_id,
        product_id,
        coalesce(sum(stock_quantity), 0)::int as physical_stock_units
      from public.retail_product_stock
      where organisation_id = any(${input.organisationIds}::uuid[])
        and status = 'active'
      group by organisation_id, product_id
    ),
    active_allocations as (
      select
        organisation_id,
        product_id,
        coalesce(sum(quantity_allocated), 0)::int as active_allocated_units
      from public.retail_order_allocations
      where organisation_id = any(${input.organisationIds}::uuid[])
        and status in ('active', 'picked')
      group by organisation_id, product_id
    )
    select
      order_lines.id::text as customer_order_line_id,
      order_lines.customer_order_id::text,
      order_lines.organisation_id::text,
      order_lines.product_id::text,
      order_lines.order_number,
      ${productTitle} as product_title,
      order_lines.customer_demand_units,
      order_lines.allocated_units,
      order_lines.shipped_units,
      coalesce(physical_stock.physical_stock_units, 0)::int as physical_stock_units,
      coalesce(active_allocations.active_allocated_units, 0)::int as active_allocated_units
    from order_lines
    join public.products
      on products.id = order_lines.product_id
    left join public.product_translations
      on product_translations.product_id = products.id
      and product_translations.locale = ${input.locale}
      and product_translations.status <> 'missing'
    left join physical_stock
      on physical_stock.organisation_id = order_lines.organisation_id
      and physical_stock.product_id = order_lines.product_id
    left join active_allocations
      on active_allocations.organisation_id = order_lines.organisation_id
      and active_allocations.product_id = order_lines.product_id
    order by order_lines.order_number, lower(${productTitle})
  `;

  return rows.map((row) => {
    const customerDemandUnits = integerOrDefault(row.customer_demand_units, 0);
    const allocatedUnits = Math.min(
      customerDemandUnits,
      integerOrDefault(row.allocated_units, 0)
    );
    const activeAllocatedUnits = integerOrDefault(row.active_allocated_units, 0);
    const physicalStockUnits = integerOrDefault(row.physical_stock_units, 0);
    const otherActiveAllocatedUnits = Math.max(
      0,
      activeAllocatedUnits - allocatedUnits
    );
    const stockPotentiallyBackingThisLine = Math.max(
      0,
      physicalStockUnits - otherActiveAllocatedUnits
    );
    const backedAllocatedUnits = Math.min(
      allocatedUnits,
      stockPotentiallyBackingThisLine
    );
    const availableNowUnits = Math.max(0, physicalStockUnits - activeAllocatedUnits);
    const shippedUnits = integerOrDefault(row.shipped_units, 0);
    const unorderedNeedUnits = Math.max(
      0,
      customerDemandUnits - backedAllocatedUnits - availableNowUnits
    );
    const statusInput = {
      allocatedUnits: backedAllocatedUnits,
      availableNowUnits,
      customerDemandUnits,
      unorderedNeedUnits
    };

    return {
      allocatedUnits,
      availableNowUnits,
      backedAllocatedUnits,
      customerDemandUnits,
      customerOrderId: row.customer_order_id,
      customerOrderLineId: row.customer_order_line_id,
      organisationId: row.organisation_id,
      orderNumber: row.order_number,
      productId: row.product_id,
      productTitle: row.product_title,
      shippedUnits,
      status: retailStockPipelineStatus(statusInput),
      unorderedNeedUnits
    };
  });
}

export function localizedProductTitleExpression(
  sql: StockDb,
  locale: Locale
) {
  return sql`
    coalesce(
      nullif(product_translations.title, ''),
      case
        when ${locale} = 'th' then nullif(products.title_th, '')
        when ${locale} = 'en' then nullif(products.title_en, '')
        else null
      end,
      nullif(products.title, ''),
      'Untitled product'
    )
  `;
}

export function productIdentifiersLateralJoin(sql: StockDb) {
  return sql`
    left join lateral (
      select
        max(product_identifiers.identifier_value) filter (
          where product_identifiers.identifier_type = 'ean13'
        ) as ean13,
        max(product_identifiers.identifier_value) filter (
          where product_identifiers.identifier_type = 'manufacturer_sku'
        ) as manufacturer_sku
      from public.product_identifiers
      where product_identifiers.product_id = products.id
        and product_identifiers.status = 'active'
        and product_identifiers.identifier_type in ('ean13', 'manufacturer_sku')
    ) identifiers on true
  `;
}
