import { getSql } from "@/lib/db";
import type { AdminSessionContext } from "@/lib/admin-access";
import { type Locale } from "@/lib/i18n";
import {
  canReadAllRetailStock,
  canRouteRegionalCheckout,
  canWriteRetailStock
} from "@/lib/admin-retail-stock-access";
import {
  ensureRetailShoppingListTablesAvailable,
  operationalStockTablesAvailable,
  retailCheckoutPaymentsTableAvailable,
  retailOperationsTablesAvailable
} from "@/lib/admin-retail-stock-tables";
import { loadRetailOrganisations } from "@/lib/admin-retail-stock-organisations";
import {
  integerOrDefault,
  isoDateTime,
  isoDateTimeOrNull,
  numberOrNull,
  objectRecord,
  priorityBand,
  stringMetadata
} from "@/lib/admin-retail-stock-codecs";
import {
  mapCustomerOrderLineRow,
  mapCustomerOrderRow
} from "@/lib/admin-retail-order-read-model";
import {
  mapRetailCarrierAccountRow,
  mapRetailProductOptionRow,
  mapRetailShoppingListLineRow,
  mapRetailShoppingListRow,
  mapRetailStockLotRow,
  mapRetailStockMovementRow,
  mapRetailStockReorderAdviceRow,
  mapRetailStockRow
} from "@/lib/admin-retail-stock-read-model";
import {
  aggregateRetailStockPipelineRows,
  getRetailStockPipeline,
  localizedProductTitleExpression,
  productIdentifiersLateralJoin,
  retailStockPipelineKey
} from "@/lib/admin-retail-stock-pipeline";
import type {
  AdminRetailCustomerOrderShipment,
  AdminRetailOperationsTask,
  AdminRetailStockData
} from "@/lib/admin-retail-stock-types";

export function emptyAdminRetailStockData(): AdminRetailStockData {
  return {
    approvedProductCount: 0,
    auditEvents: [],
    canFilterOrganisation: false,
    canRouteRegionalCheckout: false,
    canWrite: false,
    carrierAccounts: [],
    customerOrderLines: [],
    customerOrders: [],
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    lots: [],
    movements: [],
    organisations: [],
    pipeline: [],
    productOptions: [],
    reorderAdvice: [],
    rows: [],
    shoppingListLines: [],
    shoppingLists: [],
    tasks: []
  };
}

export async function getAdminRetailStockData(
  context: AdminSessionContext,
  locale: Locale
): Promise<AdminRetailStockData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminRetailStockData();
  }

  const organisations = await loadRetailOrganisations(sql, context);
  const organisationIds = organisations.map((organisation) => organisation.id);
  const productTitle = localizedProductTitleExpression(sql, locale);
  const [stockRows, productRows] = organisationIds.length === 0
    ? [[], await sql<Array<{
        brand_name: string | null;
        ean13: string | null;
        id: string;
        image_url: string | null;
        manufacturer_sku: string | null;
        product_kind: string;
        title: string;
      }>>`
        select
          products.id::text,
          ${productTitle} as title,
          products.brand_name,
          products.image_url,
          identifiers.ean13,
          identifiers.manufacturer_sku,
          products.product_kind
        from public.products
        left join public.product_translations
          on product_translations.product_id = products.id
          and product_translations.locale = ${locale}
          and product_translations.status <> 'missing'
        ${productIdentifiersLateralJoin(sql)}
        where products.status = 'approved'
          and not (
            lower(coalesce(products.normalized_brand_name, products.brand_name, '')) in ('dhc', 'dmc')
            and coalesce(products.source_url, '') ilike '%dhc.co.jp%'
          )
        order by lower(${productTitle}), lower(coalesce(products.brand_name, ''))
        limit 1000
      `]
    : await Promise.all([
        sql<Array<{
          backorder_policy: string | null;
          brand_name: string | null;
          currency: string;
          ean13: string | null;
          id: string;
          image_url: string | null;
          lead_time_days: number | string;
          manufacturer_sku: string | null;
          notes: string | null;
          organisation_id: string;
          organisation_name: string;
          product_id: string;
          product_kind: string;
          product_status: string;
          product_title: string;
          retail_price_amount: string | number | null;
          retail_override_price_amount: string | number | null;
          retail_sellable_product_id: string | null;
          status: string;
          stock_quantity: number | string;
          updated_at: Date | string;
          wholesale_price_amount: string | number | null;
        }>>`
          select
            retail_product_stock.id::text,
            retail_sellable_products.id::text as retail_sellable_product_id,
            retail_product_stock.organisation_id::text,
            organisations.name as organisation_name,
            retail_product_stock.product_id::text,
            ${productTitle} as product_title,
            products.brand_name,
            products.image_url,
            identifiers.ean13,
            identifiers.manufacturer_sku,
            products.product_kind,
            products.status as product_status,
            coalesce(retail_sellable_products.status, retail_product_stock.status) as status,
            retail_product_stock.stock_quantity,
            coalesce(retail_sellable_products.lead_time_days, retail_product_stock.lead_time_days) as lead_time_days,
            coalesce(retail_sellable_products.wholesale_price_amount, retail_product_stock.wholesale_price_amount) as wholesale_price_amount,
            retail_sellable_products.rrp_price_amount as retail_price_amount,
            retail_sellable_products.rrp_price_amount as retail_override_price_amount,
            coalesce(retail_sellable_products.currency, retail_product_stock.currency) as currency,
            coalesce(retail_sellable_products.notes, retail_product_stock.notes) as notes,
            coalesce(retail_sellable_products.backorder_policy, 'allow') as backorder_policy,
            retail_product_stock.updated_at
          from public.retail_product_stock
          join public.organisations
            on organisations.id = retail_product_stock.organisation_id
          join public.products
            on products.id = retail_product_stock.product_id
          left join public.retail_sellable_products
            on retail_sellable_products.organisation_id = retail_product_stock.organisation_id
            and retail_sellable_products.product_id = retail_product_stock.product_id
            and retail_sellable_products.status <> 'deleted'
          left join public.product_translations
            on product_translations.product_id = products.id
            and product_translations.locale = ${locale}
            and product_translations.status <> 'missing'
          ${productIdentifiersLateralJoin(sql)}
          where retail_product_stock.organisation_id = any(${organisationIds}::uuid[])
            and retail_product_stock.status <> 'deleted'
          order by lower(organisations.name), lower(${productTitle})
        `,
        sql<Array<{
          brand_name: string | null;
          ean13: string | null;
          id: string;
          image_url: string | null;
          manufacturer_sku: string | null;
          product_kind: string;
          title: string;
        }>>`
          select
            products.id::text,
            ${productTitle} as title,
            products.brand_name,
            products.image_url,
            identifiers.ean13,
            identifiers.manufacturer_sku,
            products.product_kind
          from public.products
          left join public.product_translations
            on product_translations.product_id = products.id
            and product_translations.locale = ${locale}
            and product_translations.status <> 'missing'
          ${productIdentifiersLateralJoin(sql)}
          where products.status = 'approved'
            and not (
              lower(coalesce(products.normalized_brand_name, products.brand_name, '')) in ('dhc', 'dmc')
              and coalesce(products.source_url, '') ilike '%dhc.co.jp%'
            )
          order by lower(${productTitle}), lower(coalesce(products.brand_name, ''))
          limit 1000
        `
      ]);

  const operationalTablesAvailable = organisationIds.length > 0
    ? await operationalStockTablesAvailable(sql)
    : false;
  const [lotRows, movementRows, adviceRows] =
    operationalTablesAvailable
      ? await Promise.all([
          sql<Array<{
            currency: string;
            expires_at: Date | string | null;
            id: string;
            notes: string | null;
            organisation_id: string;
            product_id: string;
            product_title: string;
            received_at: Date | string;
            received_quantity: number | string;
            remaining_quantity: number | string;
            retail_product_stock_id: string;
            status: string;
            wholesale_price_amount: string | number | null;
          }>>`
            select
              retail_stock_lots.id::text,
              retail_stock_lots.retail_product_stock_id::text,
              retail_stock_lots.organisation_id::text,
              retail_stock_lots.product_id::text,
              ${productTitle} as product_title,
              retail_stock_lots.status,
              retail_stock_lots.received_quantity,
              retail_stock_lots.remaining_quantity,
              retail_stock_lots.wholesale_price_amount,
              retail_stock_lots.currency,
              retail_stock_lots.expires_at,
              retail_stock_lots.received_at,
              retail_stock_lots.notes
            from public.retail_stock_lots
            join public.products
              on products.id = retail_stock_lots.product_id
            left join public.product_translations
              on product_translations.product_id = products.id
              and product_translations.locale = ${locale}
              and product_translations.status <> 'missing'
            where retail_stock_lots.organisation_id = any(${organisationIds}::uuid[])
              and retail_stock_lots.status <> 'deleted'
            order by retail_stock_lots.received_at desc
            limit 500
          `,
          sql<Array<{
            currency: string;
            id: string;
            is_voided: boolean;
            lot_id: string | null;
            movement_type: string;
            notes: string | null;
            occurred_at: Date | string;
            organisation_id: string;
            organisation_name: string;
            product_id: string;
            product_title: string;
            quantity_delta: number | string;
            reason: string | null;
            retail_price_amount: string | number | null;
            retail_product_stock_id: string;
            unit_cost_amount: string | number | null;
            voids_movement_id: string | null;
          }>>`
            select
              retail_stock_movements.id::text,
              retail_stock_movements.retail_product_stock_id::text,
              retail_stock_movements.lot_id::text,
              retail_stock_movements.organisation_id::text,
              organisations.name as organisation_name,
              retail_stock_movements.product_id::text,
              ${productTitle} as product_title,
              retail_stock_movements.movement_type,
              retail_stock_movements.quantity_delta,
              retail_stock_movements.unit_cost_amount,
              retail_stock_movements.retail_price_amount,
              retail_stock_movements.currency,
              retail_stock_movements.reason,
              retail_stock_movements.notes,
              retail_stock_movements.voids_movement_id::text,
              exists (
                select 1
                from public.retail_stock_movements voids
                where voids.voids_movement_id = retail_stock_movements.id
                  and voids.movement_type = 'void'
              ) as is_voided,
              retail_stock_movements.occurred_at
            from public.retail_stock_movements
            join public.organisations
              on organisations.id = retail_stock_movements.organisation_id
            join public.products
              on products.id = retail_stock_movements.product_id
            left join public.product_translations
              on product_translations.product_id = products.id
              and product_translations.locale = ${locale}
              and product_translations.status <> 'missing'
            where retail_stock_movements.organisation_id = any(${organisationIds}::uuid[])
            order by retail_stock_movements.occurred_at desc
            limit 500
          `,
          sql<Array<{
            calculated_at: Date | string;
            confidence: string;
            current_stock_quantity: number | string;
            days_cover: string | number | null;
            id: string;
            lead_time_days: number | string;
            organisation_id: string;
            organisation_name: string;
            outflow_units_30d: number | string;
            product_id: string;
            product_title: string;
            recommendation_pressure_count: number | string;
            reorder_by: Date | string | null;
            retail_product_stock_id: string;
            risk_level: string;
            suggested_order_quantity: number | string;
          }>>`
            select
              retail_stock_reorder_advice.id::text,
              retail_stock_reorder_advice.retail_product_stock_id::text,
              retail_stock_reorder_advice.organisation_id::text,
              organisations.name as organisation_name,
              retail_stock_reorder_advice.product_id::text,
              ${productTitle} as product_title,
              retail_stock_reorder_advice.risk_level,
              retail_stock_reorder_advice.confidence,
              retail_stock_reorder_advice.current_stock_quantity,
              retail_stock_reorder_advice.outflow_units_30d,
              retail_stock_reorder_advice.recommendation_pressure_count,
              retail_stock_reorder_advice.lead_time_days,
              retail_stock_reorder_advice.days_cover,
              retail_stock_reorder_advice.reorder_by,
              retail_stock_reorder_advice.suggested_order_quantity,
              retail_stock_reorder_advice.calculated_at
            from public.retail_stock_reorder_advice
            join public.organisations
              on organisations.id = retail_stock_reorder_advice.organisation_id
            join public.products
              on products.id = retail_stock_reorder_advice.product_id
            left join public.product_translations
              on product_translations.product_id = products.id
              and product_translations.locale = ${locale}
              and product_translations.status <> 'missing'
            where retail_stock_reorder_advice.organisation_id = any(${organisationIds}::uuid[])
              and (
                retail_stock_reorder_advice.risk_level <> 'ok'
                or retail_stock_reorder_advice.suggested_order_quantity > 0
              )
            order by
              case retail_stock_reorder_advice.risk_level
                when 'out_of_stock' then 0
                when 'reorder' then 1
                when 'watch' then 2
                else 3
              end,
              retail_stock_reorder_advice.calculated_at desc
          `
        ])
      : [[], [], []];
  const operationsTablesAvailable = organisationIds.length > 0
    ? await retailOperationsTablesAvailable(sql)
    : false;
  const checkoutPaymentsTableReady = operationsTablesAvailable
    ? await retailCheckoutPaymentsTableAvailable(sql)
    : false;
  const checkoutPaymentPlanSelect = checkoutPaymentsTableReady
    ? sql`checkout_payment.plan_id`
    : sql`null::text as plan_id`;
  const checkoutPaymentJoin = checkoutPaymentsTableReady
    ? sql`
        left join lateral (
          select retail_checkout_payments.plan_id::text
          from public.retail_checkout_payments
          where retail_checkout_payments.retail_customer_order_id = retail_customer_orders.id
            or retail_checkout_payments.id::text = retail_customer_orders.metadata ->> 'checkoutPaymentId'
          order by retail_checkout_payments.updated_at desc
          limit 1
        ) checkout_payment on true
      `
    : sql``;
  const checkoutPaymentGroupBy = checkoutPaymentsTableReady
    ? sql`, checkout_payment.plan_id`
    : sql``;
  const shipmentTablesReady = organisationIds.length > 0
    ? (await sql<Array<{ ready: boolean }>>`
        select to_regclass('public.retail_order_shipments') is not null as ready
      `)[0]?.ready === true
    : false;
  const carrierTablesReady = organisationIds.length > 0
    ? (await sql<Array<{ ready: boolean }>>`
        select to_regclass('public.retail_carrier_accounts') is not null as ready
      `)[0]?.ready === true
    : false;
  const carrierAccountRows = carrierTablesReady
    ? await sql<Array<{
        capabilities: string[];
        carrier_id: string;
        display_name: string | null;
        id: string;
        last_test_status: string | null;
        last_tested_at: Date | string | null;
        organisation_id: string;
        status: string;
        updated_at: Date | string;
      }>>`
        select
          id::text,
          organisation_id::text,
          carrier_id,
          display_name,
          status,
          capabilities,
          last_tested_at,
          last_test_status,
          updated_at
        from public.retail_carrier_accounts
        where organisation_id = any(${organisationIds}::uuid[])
          and status <> 'deleted'
        order by carrier_id, updated_at desc
      `
    : [];
  const [
    taskRows,
    customerOrderRows,
    customerOrderLineRows,
    customerOrderShipmentRows
  ] = operationsTablesAvailable
    ? await Promise.all([
        sql<Array<{
          actor_type: string;
          agent_name: string | null;
          claimed_at: Date | string | null;
          claimed_by_email: string | null;
          claimed_by_name: string | null;
          claimed_by_person_id: string | null;
          due_at: Date | string | null;
          id: string;
          organisation_id: string;
          organisation_name: string;
          payload: unknown;
          priority_reason: string | null;
          priority_score: number | string | null;
          profit_impact_amount: number | string | null;
          profit_impact_currency: string | null;
          scheduled_for: Date | string;
          source_entity_id: string | null;
          source_entity_type: string | null;
          status: string;
          task_type: string;
          title: string;
          updated_at: Date | string;
        }>>`
          select
            tasks.id::text,
            tasks.actor_type,
            tasks.organisation_id::text,
            organisations.name as organisation_name,
            tasks.task_type,
            tasks.title,
            tasks.status,
            tasks.payload,
            tasks.priority_score,
            tasks.priority_reason,
            tasks.profit_impact_amount,
            tasks.profit_impact_currency,
            tasks.scheduled_for,
            case
              when tasks.context ? 'claimedByPersonId' then tasks.started_at
              else null
            end as claimed_at,
            tasks.context->>'claimedByPersonId' as claimed_by_person_id,
            coalesce(
              claimed_people.display_name,
              tasks.context->>'claimedByDisplayName'
            ) as claimed_by_name,
            coalesce(
              claimed_people.email,
              tasks.context->>'claimedByEmail'
            ) as claimed_by_email,
            reserved_agents.name as agent_name,
            tasks.due_at,
            tasks.source_entity_type,
            tasks.source_entity_id::text,
            tasks.updated_at
          from public.tasks
          join public.organisations
            on organisations.id = tasks.organisation_id
          left join public.people claimed_people
            on claimed_people.id::text = tasks.context->>'claimedByPersonId'
          left join public.agents reserved_agents
            on reserved_agents.id = tasks.reserved_by_agent_id
          where tasks.organisation_id = any(${organisationIds}::uuid[])
            and (tasks.task_type like 'retail_%' or tasks.task_type like 'carrier_%')
          order by
            case when tasks.status in ('completed', 'cancelled', 'skipped') then 1 else 0 end,
            coalesce(tasks.priority_score, tasks.business_value) desc,
            coalesce(tasks.due_at, tasks.scheduled_for) asc,
            tasks.updated_at desc
          limit 300
        `,
        sql<Array<{
          currency: string;
          customer_email: string | null;
          customer_name: string | null;
          delivered_at: Date | string | null;
          due_at: Date | string | null;
          id: string;
          line_count: number | string;
          metadata: unknown;
          notes: string | null;
          order_number: string;
          ordered_units: number | string;
          organisation_id: string;
          organisation_name: string;
          plan_id: string | null;
          placed_at: Date | string | null;
          shipped_at: Date | string | null;
          shipped_units: number | string;
          source: string;
          status: string;
          total_retail_amount: number | string | null;
          updated_at: Date | string;
        }>>`
          select
            retail_customer_orders.id::text,
            retail_customer_orders.organisation_id::text,
            organisations.name as organisation_name,
            retail_customer_orders.order_number,
            retail_customer_orders.source,
            retail_customer_orders.customer_name,
            retail_customer_orders.customer_email,
            retail_customer_orders.status,
            retail_customer_orders.currency,
            retail_customer_orders.due_at,
            retail_customer_orders.placed_at,
            retail_customer_orders.shipped_at,
            retail_customer_orders.delivered_at,
            retail_customer_orders.notes,
            retail_customer_orders.metadata,
            retail_customer_orders.updated_at,
            ${checkoutPaymentPlanSelect},
            count(retail_customer_order_lines.id)::int as line_count,
            coalesce(sum(retail_customer_order_lines.quantity_ordered), 0)::int as ordered_units,
            coalesce(sum(retail_customer_order_lines.quantity_shipped), 0)::int as shipped_units,
            sum(retail_customer_order_lines.quantity_ordered * retail_customer_order_lines.retail_price_amount) as total_retail_amount
          from public.retail_customer_orders
          join public.organisations
            on organisations.id = retail_customer_orders.organisation_id
          left join public.retail_customer_order_lines
            on retail_customer_order_lines.customer_order_id = retail_customer_orders.id
          ${checkoutPaymentJoin}
          where retail_customer_orders.organisation_id = any(${organisationIds}::uuid[])
          group by retail_customer_orders.id, organisations.name${checkoutPaymentGroupBy}
          order by retail_customer_orders.updated_at desc
          limit 200
        `,
        sql<Array<{
          customer_order_id: string;
          ean13: string | null;
          id: string;
          manufacturer_sku: string | null;
          metadata: unknown;
          notes: string | null;
          product_id: string;
          product_title: string;
          quantity_allocated: number | string;
          quantity_ordered: number | string;
          quantity_shipped: number | string;
          retail_price_amount: number | string | null;
        }>>`
          select
            retail_customer_order_lines.id::text,
            retail_customer_order_lines.customer_order_id::text,
            retail_customer_order_lines.product_id::text,
            ${productTitle} as product_title,
            identifiers.ean13,
            identifiers.manufacturer_sku,
            retail_customer_order_lines.quantity_ordered,
            retail_customer_order_lines.quantity_allocated,
            retail_customer_order_lines.quantity_shipped,
            retail_customer_order_lines.retail_price_amount,
            retail_customer_order_lines.metadata,
            retail_customer_order_lines.notes
          from public.retail_customer_order_lines
          join public.products
            on products.id = retail_customer_order_lines.product_id
          left join public.product_translations
            on product_translations.product_id = products.id
            and product_translations.locale = ${locale}
            and product_translations.status <> 'missing'
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
          where retail_customer_order_lines.organisation_id = any(${organisationIds}::uuid[])
          order by retail_customer_order_lines.created_at desc
          limit 500
        `,
        shipmentTablesReady
          ? sql<Array<{
              carrier_id: string | null;
              carrier_name: string | null;
              customer_order_id: string;
              exception_code: string | null;
              exception_message: string | null;
              label_metadata: unknown;
              label_status: string | null;
              label_url: string | null;
              metadata: unknown;
              pickup_booked_at: Date | string | null;
              pickup_provider_status: string | null;
              pickup_window_end: Date | string | null;
              pickup_window_start: Date | string | null;
              status: string | null;
              tracking_number: string | null;
              tracking_url: string | null;
            }>>`
              select distinct on (retail_order_shipments.retail_customer_order_id)
                retail_order_shipments.retail_customer_order_id::text as customer_order_id,
                retail_order_shipments.carrier_id,
                retail_order_shipments.carrier_name,
                retail_order_shipments.exception_code,
                retail_order_shipments.exception_message,
                retail_order_shipments.label_metadata,
                retail_order_shipments.label_status,
                retail_order_shipments.label_url,
                retail_order_shipments.metadata,
                retail_order_shipments.pickup_booked_at,
                retail_order_shipments.pickup_provider_status,
                retail_order_shipments.pickup_window_end,
                retail_order_shipments.pickup_window_start,
                retail_order_shipments.status,
                retail_order_shipments.tracking_number,
                retail_order_shipments.tracking_url
              from public.retail_order_shipments
              join public.retail_customer_orders
                on retail_customer_orders.id = retail_order_shipments.retail_customer_order_id
              where retail_customer_orders.organisation_id = any(${organisationIds}::uuid[])
              order by
                retail_order_shipments.retail_customer_order_id,
                retail_order_shipments.updated_at desc
            `
          : Promise.resolve([])
      ])
    : [[], [], [], []];
  if (organisationIds.length > 0) {
    await ensureRetailShoppingListTablesAvailable(sql);
  }
  const shoppingListTablesReady = organisationIds.length > 0;
  const [shoppingListRows, shoppingListLineRows] = shoppingListTablesReady
    ? await Promise.all([
        sql<Array<{
          actual_units: number | string;
          created_at: Date | string;
          currency: string;
          id: string;
          line_count: number | string;
          list_number: string;
          organisation_id: string;
          organisation_name: string;
          required_units: number | string;
          status: string;
          stocked_units: number | string;
          updated_at: Date | string;
        }>>`
          select
            retail_shopping_lists.id::text,
            retail_shopping_lists.organisation_id::text,
            organisations.name as organisation_name,
            retail_shopping_lists.list_number,
            retail_shopping_lists.status,
            retail_shopping_lists.currency,
            retail_shopping_lists.created_at,
            retail_shopping_lists.updated_at,
            count(retail_shopping_list_lines.id)::int as line_count,
            coalesce(sum(retail_shopping_list_lines.required_quantity), 0)::int as required_units,
            coalesce(sum(retail_shopping_list_lines.actual_quantity), 0)::int as actual_units,
            coalesce(sum(retail_shopping_list_lines.stocked_quantity), 0)::int as stocked_units
          from public.retail_shopping_lists
          join public.organisations
            on organisations.id = retail_shopping_lists.organisation_id
          left join public.retail_shopping_list_lines
            on retail_shopping_list_lines.shopping_list_id = retail_shopping_lists.id
          where retail_shopping_lists.organisation_id = any(${organisationIds}::uuid[])
          group by retail_shopping_lists.id, organisations.name
          order by retail_shopping_lists.updated_at desc
          limit 50
        `,
        sql<Array<{
          actual_quantity: number | string;
          assigned_quantity: number | string;
	          brand_name: string | null;
          current_stock_quantity: number | string;
          ean13: string | null;
	          id: string;
          manufacturer_sku: string | null;
          organisation_id: string;
          product_id: string;
          product_title: string;
          required_quantity: number | string;
          retail_price_amount: number | string | null;
          shopping_list_id: string;
          stocked_quantity: number | string;
          unordered_need_quantity: number | string;
          wholesale_price_amount: number | string | null;
        }>>`
          select
            retail_shopping_list_lines.id::text,
            retail_shopping_list_lines.shopping_list_id::text,
            retail_shopping_list_lines.organisation_id::text,
            retail_shopping_list_lines.product_id::text,
	            ${productTitle} as product_title,
            products.brand_name,
            identifiers.ean13,
            identifiers.manufacturer_sku,
	            retail_shopping_list_lines.required_quantity,
            retail_shopping_list_lines.current_stock_quantity,
            retail_shopping_list_lines.unordered_need_quantity,
            retail_shopping_list_lines.assigned_quantity,
            retail_shopping_list_lines.actual_quantity,
            retail_shopping_list_lines.stocked_quantity,
            retail_shopping_list_lines.wholesale_price_amount,
            retail_shopping_list_lines.retail_price_amount
          from public.retail_shopping_list_lines
          join public.products
            on products.id = retail_shopping_list_lines.product_id
	          left join public.product_translations
	            on product_translations.product_id = products.id
	            and product_translations.locale = ${locale}
	            and product_translations.status <> 'missing'
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
	          where retail_shopping_list_lines.organisation_id = any(${organisationIds}::uuid[])
          order by retail_shopping_list_lines.created_at asc
          limit 500
        `
      ])
    : [[], []];
  const pipelineRows = operationsTablesAvailable
    ? await getRetailStockPipeline({
        locale,
        organisationIds,
        sql
      })
    : [];
  const pipelineByLineKey = new Map(
    pipelineRows.map((row) => [
      retailStockPipelineKey(row.customerOrderLineId, row.productId),
      row
    ])
  );
  const pipelineByOrderId = new Map(
    [...new Set(pipelineRows.map((row) => row.customerOrderId).filter(Boolean))]
      .map((orderId) => [
        orderId as string,
        aggregateRetailStockPipelineRows(pipelineRows, orderId as string)
      ])
  );
  const shipmentByOrderId = new Map<string, AdminRetailCustomerOrderShipment>(
    customerOrderShipmentRows.map((row) => {
      const labelMetadata = objectRecord(row.label_metadata);
      const metadata = objectRecord(row.metadata);

      return [
        row.customer_order_id,
        {
          carrierId: row.carrier_id,
          carrierName: row.carrier_name,
          exceptionCode: row.exception_code,
          exceptionMessage: row.exception_message,
          labelContentBase64: stringMetadata(labelMetadata.contentBase64),
          labelContentType: stringMetadata(labelMetadata.contentType),
          labelStatus: row.label_status,
          labelUrl: row.label_url,
          pickupBookedAt: isoDateTimeOrNull(row.pickup_booked_at),
          pickupProviderStatus: row.pickup_provider_status,
          pickupWindowEnd: isoDateTimeOrNull(row.pickup_window_end),
          pickupWindowStart: isoDateTimeOrNull(row.pickup_window_start),
          shippedAt: null,
          shippedByPersonId: null,
          shipmentNotes:
            stringMetadata(metadata.shipmentNotes) ??
            stringMetadata(metadata.requestedShipmentNotes),
          status: row.status,
          trackingNumber: row.tracking_number,
          trackingUrl: row.tracking_url
        }
      ];
    })
  );
  const [adminAuditRows, taskEventRows] = organisationIds.length > 0
    ? await Promise.all([
        sql<Array<{
          action: string;
          actor_email: string | null;
          actor_name: string | null;
          created_at: Date | string;
          id: string;
          metadata: unknown;
          organisation_id: string;
          organisation_name: string;
          resource_id: string | null;
          resource_type: string | null;
        }>>`
          select
            admin_audit_events.id::text,
            admin_audit_events.organisation_id::text,
            organisations.name as organisation_name,
            admin_audit_events.action,
            admin_audit_events.resource_type,
            admin_audit_events.resource_id,
            admin_audit_events.metadata,
            coalesce(actor_people.display_name, actor_people.email) as actor_name,
            actor_people.email as actor_email,
            admin_audit_events.created_at
          from public.admin_audit_events
          join public.organisations
            on organisations.id = admin_audit_events.organisation_id
          left join public.people actor_people
            on actor_people.id = admin_audit_events.actor_person_id
          where admin_audit_events.organisation_id = any(${organisationIds}::uuid[])
          order by admin_audit_events.created_at desc
          limit 150
        `,
        operationsTablesAvailable
          ? sql<Array<{
              agent_name: string | null;
              event_payload: unknown;
              event_status: string;
              event_type: string;
              id: string;
              occurred_at: Date | string;
              organisation_id: string;
              organisation_name: string;
              resource_id: string | null;
              resource_type: string | null;
              severity: string;
            }>>`
              select
                task_events.id::text,
                tasks.organisation_id::text,
                organisations.name as organisation_name,
                task_events.event_type,
                task_events.event_status,
                task_events.severity,
                task_events.event_payload,
                task_events.occurred_at,
                agents.name as agent_name,
                tasks.task_type as resource_type,
                tasks.id::text as resource_id
              from public.task_events
              join public.tasks
                on tasks.id = task_events.task_id
              join public.organisations
                on organisations.id = tasks.organisation_id
              left join public.agents
                on agents.id = task_events.agent_id
              where tasks.organisation_id = any(${organisationIds}::uuid[])
                and tasks.task_type like 'retail_%'
              order by task_events.occurred_at desc
              limit 150
            `
          : Promise.resolve([])
      ])
    : [[], []];
  const auditEvents = [
    ...adminAuditRows.map((row) => ({
      action: row.action,
      actorEmail: row.actor_email,
      actorName: row.actor_name,
      agentName: null,
      details: objectRecord(row.metadata),
      id: row.id,
      occurredAt: isoDateTime(row.created_at),
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      resourceId: row.resource_id,
      resourceType: row.resource_type,
      severity: null,
      source: "admin" as const,
      status: null
    })),
    ...taskEventRows.map((row) => ({
      action: row.event_type,
      actorEmail: null,
      actorName: null,
      agentName: row.agent_name,
      details: objectRecord(row.event_payload),
      id: row.id,
      occurredAt: isoDateTime(row.occurred_at),
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      resourceId: row.resource_id,
      resourceType: row.resource_type,
      severity: row.severity,
      source: "task" as const,
      status: row.event_status
    }))
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 200);
  const tasks: AdminRetailOperationsTask[] = taskRows.map((row) => {
    const priorityScore = integerOrDefault(row.priority_score, 200);
    const payload = objectRecord(row.payload);
    const payloadProductId = stringMetadata(payload.productId);
    const taskPipeline =
      row.source_entity_type === "retail_customer_order" && row.source_entity_id
        ? payloadProductId
          ? pipelineRows.find(
              (pipeline) =>
                pipeline.customerOrderId === row.source_entity_id &&
                pipeline.productId === payloadProductId
            ) ?? pipelineByOrderId.get(row.source_entity_id) ?? null
          : pipelineByOrderId.get(row.source_entity_id) ?? null
        : payloadProductId
          ? pipelineRows.find(
              (pipeline) =>
                pipeline.organisationId === row.organisation_id &&
                pipeline.productId === payloadProductId
            ) ?? null
          : null;

    return {
      actorType: row.actor_type,
      agentName: row.agent_name,
      claimedAt: isoDateTimeOrNull(row.claimed_at),
      claimedByEmail: row.claimed_by_email,
      claimedByName: row.claimed_by_name,
      claimedByPersonId: row.claimed_by_person_id,
      dueAt: isoDateTimeOrNull(row.due_at),
      id: row.id,
      isAgentTask:
        row.actor_type !== "human" ||
        row.task_type === "retail_stock_forecast_refresh",
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      pipeline: taskPipeline,
      priorityBand: priorityBand(priorityScore),
      priorityReason: row.priority_reason,
      priorityScore,
      profitImpactAmount: numberOrNull(row.profit_impact_amount),
      profitImpactCurrency: row.profit_impact_currency,
      scheduledFor: isoDateTime(row.scheduled_for),
      sourceEntityId: row.source_entity_id,
      sourceEntityType: row.source_entity_type,
      status: row.status,
      taskType: row.task_type,
      title: row.title,
      updatedAt: isoDateTime(row.updated_at)
    };
  });
  const tasksByCustomerOrderId = new Map<string, AdminRetailOperationsTask[]>();

  for (const task of tasks) {
    if (
      task.sourceEntityType !== "retail_customer_order" ||
      !task.sourceEntityId
    ) {
      continue;
    }

    const existing = tasksByCustomerOrderId.get(task.sourceEntityId) ?? [];

    existing.push(task);
    tasksByCustomerOrderId.set(task.sourceEntityId, existing);
  }

  const approvedCountRows = await sql<Array<{ n: number }>>`
    select count(*)::int as n
    from public.products
    where status = 'approved'
  `;

  return {
    approvedProductCount: approvedCountRows[0]?.n ?? 0,
    auditEvents,
    canFilterOrganisation: canReadAllRetailStock(context),
    canRouteRegionalCheckout: canRouteRegionalCheckout(context),
    canWrite: canWriteRetailStock(context),
    carrierAccounts: carrierAccountRows.map(mapRetailCarrierAccountRow),
    customerOrderLines: customerOrderLineRows.map((row) =>
      mapCustomerOrderLineRow(
        row,
        pipelineByLineKey.get(retailStockPipelineKey(row.id, row.product_id)) ?? null
      )
    ),
    customerOrders: customerOrderRows.map((row) =>
      mapCustomerOrderRow({
        auditEvents,
        latestShipment: shipmentByOrderId.get(row.id) ?? null,
        pipeline: pipelineByOrderId.get(row.id) ?? null,
        relatedTasks: tasksByCustomerOrderId.get(row.id) ?? [],
        row
      })
    ),
    databaseAvailable: true,
    generatedAt: new Date().toISOString(),
    lots: lotRows.map(mapRetailStockLotRow),
    movements: movementRows.map(mapRetailStockMovementRow),
    organisations,
    pipeline: pipelineRows,
    productOptions: productRows.map(mapRetailProductOptionRow),
    reorderAdvice: adviceRows.map(mapRetailStockReorderAdviceRow),
    rows: stockRows.map(mapRetailStockRow),
    shoppingListLines: shoppingListLineRows.map(mapRetailShoppingListLineRow),
    shoppingLists: shoppingListRows.map(mapRetailShoppingListRow),
    tasks
  };
}
