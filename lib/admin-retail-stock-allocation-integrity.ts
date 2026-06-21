import { getSql } from "@/lib/db";
import { recordAdminAudit, type AdminSessionContext } from "@/lib/admin-access";
import { retailAgentSessionContext } from "@/lib/admin-retail-agent-session";
import { recordRetailOrderBpmEvent } from "@/lib/admin-retail-order-bpm-events";
import {
  canWriteRetailStock,
  persistedActorPersonId,
  retailActorMetadata
} from "@/lib/admin-retail-stock-access";
import { integerOrDefault, numberOrNull } from "@/lib/admin-retail-stock-codecs";
import {
  organisationForStockWrite,
  productApproved
} from "@/lib/admin-retail-stock-organisations";
import { recordRetailStockSnapshot } from "@/lib/admin-retail-stock-side-effects";
import { retailOperationsTablesAvailable } from "@/lib/admin-retail-stock-tables";
import {
  cancelStaleOrderWorkflowTasks,
  ensureOrderWorkflowTask
} from "@/lib/admin-retail-operation-tasks";
import {
  aggregateRetailStockPipelineRows,
  getRetailStockPipeline
} from "@/lib/admin-retail-stock-pipeline";
import { refreshRetailStockReorderAdvice } from "@/lib/admin-retail-stock-reorder-advice";
import type {
  AdminRetailStockPipelineRow,
  RetailOrderReorderAdviceShortageResult,
  RetailStockSnapshotRow,
  StockDb
} from "@/lib/admin-retail-stock-types";

export async function ensureRetailStockRow(
  context: AdminSessionContext,
  input: Readonly<{
    organisationId: string;
    productId: string;
    snapshotSource?: string | null;
    source?: string | null;
    sql?: StockDb;
    wholesalePriceAmount?: number | null;
  }>
) {
  const sql = input.sql ?? getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const existing = await sql<Array<{ id: string }>>`
    select id::text
    from public.retail_product_stock
    where organisation_id = ${input.organisationId}::uuid
      and product_id = ${input.productId}::uuid
      and status <> 'deleted'
    limit 1
  `;

  if (existing[0]?.id) {
    return existing[0].id;
  }

  const organisation = await organisationForStockWrite(
    sql,
    context,
    input.organisationId
  );

  if (!(await productApproved(sql, input.productId))) {
    throw new Error("Only approved master products can be stocked");
  }

  const rows = await sql<RetailStockSnapshotRow[]>`
    insert into public.retail_product_stock (
      organisation_id,
      product_id,
      status,
      stock_quantity,
      lead_time_days,
      wholesale_price_amount,
      retail_price_amount,
      currency,
      notes,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisation.id}::uuid,
      ${input.productId}::uuid,
      'active',
      0,
      0,
      ${numberOrNull(input.wholesalePriceAmount)},
      null,
      ${organisation.currency},
      null,
      ${sql.json({
        createdByPersonId: context.actorPerson.id,
        source: input.source ?? "admin_stock_receiving"
      })},
      now(),
      now()
    )
    on conflict (organisation_id, product_id)
    do update set
      status = case
        when retail_product_stock.status = 'deleted' then 'active'
        else retail_product_stock.status
      end,
      wholesale_price_amount = coalesce(
        excluded.wholesale_price_amount,
        retail_product_stock.wholesale_price_amount
      ),
      currency = excluded.currency,
      metadata = retail_product_stock.metadata || excluded.metadata,
      updated_at = now()
    returning
      id::text,
      organisation_id::text,
      product_id::text,
      status,
      stock_quantity,
      lead_time_days,
      wholesale_price_amount,
      retail_price_amount,
      currency,
      notes
  `;

  if (!rows[0]) {
    throw new Error("Stock row could not be created");
  }

  await recordRetailStockSnapshot(sql, context, rows[0], "created", {
    source: input.snapshotSource ?? "shopping_list_receiving"
  });

  return rows[0].id;
}

export async function ensureRetailOrderShortagesInReorderAdvice(
  context: AdminSessionContext,
  input: Readonly<{
    customerOrderId: string;
    orderNumber?: string | null;
    organisationId: string;
    sql?: StockDb;
  }>
): Promise<RetailOrderReorderAdviceShortageResult> {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = input.sql ?? getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const pipelineRows = await getRetailStockPipeline({
    customerOrderId: input.customerOrderId,
    locale: context.effectivePerson.preferredLocale,
    organisationIds: [input.organisationId],
    sql
  });
  const shortageByProduct = new Map<
    string,
    Readonly<{
      productTitle: string;
      unorderedNeedUnits: number;
    }>
  >();

  for (const row of pipelineRows) {
    if (!row.productId || row.unorderedNeedUnits < 1) {
      continue;
    }

    const current = shortageByProduct.get(row.productId);

    shortageByProduct.set(row.productId, {
      productTitle: row.productTitle ?? row.productId,
      unorderedNeedUnits:
        (current?.unorderedNeedUnits ?? 0) + row.unorderedNeedUnits
    });
  }

  const productIds = [...shortageByProduct.keys()];

  if (productIds.length === 0) {
    return {
      lineCount: 0,
      productIds: [],
      refreshedStockRowIds: [],
      shortageUnits: 0
    };
  }

  const stockRows = await sql<Array<{
    id: string;
    product_id: string;
    stock_quantity: number | string | null;
    wholesale_price_amount: number | string | null;
  }>>`
    select
      id::text,
      product_id::text,
      stock_quantity,
      wholesale_price_amount
    from public.retail_product_stock
    where organisation_id = ${input.organisationId}::uuid
      and product_id = any(${productIds}::uuid[])
      and status <> 'deleted'
  `;
  const stockByProductId = new Map(stockRows.map((row) => [row.product_id, row]));
  const actorPersonId = persistedActorPersonId(context);
  const actorMetadata = retailActorMetadata(context);
  let shortageUnits = 0;
  const touchedProductIds: string[] = [];
  const refreshedStockRowIds: string[] = [];

  for (const productId of productIds) {
    const shortage = shortageByProduct.get(productId);
    const unorderedNeedUnits = shortage?.unorderedNeedUnits ?? 0;

    if (unorderedNeedUnits < 1) {
      continue;
    }

    let stock = stockByProductId.get(productId) ?? null;

    if (!stock) {
      const stockId = await ensureRetailStockRow(context, {
        organisationId: input.organisationId,
        productId,
        snapshotSource: "retail_order_shortage_reorder_advice",
        source: "retail_order_shortage_reorder_advice",
        sql,
        wholesalePriceAmount: null
      });

      stock = {
        id: stockId,
        product_id: productId,
        stock_quantity: 0,
        wholesale_price_amount: null
      };
      stockByProductId.set(productId, stock);
    }

    await refreshRetailStockReorderAdvice({
      organisationId: input.organisationId,
      productId,
      stockId: stock.id
    });

    shortageUnits += unorderedNeedUnits;
    touchedProductIds.push(productId);
    refreshedStockRowIds.push(stock.id);
  }

  await recordAdminAudit({
    action: "admin.retail_reorder_advice_shortages_reconciled",
    actorPersonId,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: input.organisationId,
    resourceId: input.customerOrderId,
    resourceType: "retail_customer_order",
    metadata: {
      actorMetadata,
      customerOrderId: input.customerOrderId,
      lineCount: touchedProductIds.length,
      orderNumber: input.orderNumber ?? null,
      productIds: touchedProductIds,
      shortageUnits
    }
  });

  return {
    lineCount: touchedProductIds.length,
    productIds: touchedProductIds,
    refreshedStockRowIds,
    shortageUnits
  };
}

function orderPipelineFullyBacked(pipeline: AdminRetailStockPipelineRow | null) {
  return Boolean(
    pipeline &&
      pipeline.customerDemandUnits > 0 &&
      pipeline.backedAllocatedUnits >= pipeline.customerDemandUnits &&
      pipeline.unorderedNeedUnits < 1
  );
}


async function repairRetailOrdersAwaitingStockAfterAllocationRelease(
  context: AdminSessionContext,
  input: Readonly<{
    orderIds: readonly string[];
    organisationId: string;
    source: string;
    sql: StockDb;
  }>
) {
  const orderIds = [...new Set(input.orderIds.filter(Boolean))];

  if (orderIds.length === 0) {
    return { repairedOrderCount: 0, shortageUnits: 0 };
  }

  const orderRows = await input.sql<Array<{
    due_at: Date | string | null;
    id: string;
    order_number: string;
    status: string;
  }>>`
    select id::text, order_number, due_at, status
    from public.retail_customer_orders
    where organisation_id = ${input.organisationId}::uuid
      and id = any(${orderIds}::uuid[])
      and status in ('placed', 'awaiting_stock', 'allocated', 'picking', 'packed')
  `;
  let shortageUnits = 0;

  for (const order of orderRows) {
    const shortageRepair = await ensureRetailOrderShortagesInReorderAdvice(context, {
      customerOrderId: order.id,
      orderNumber: order.order_number,
      organisationId: input.organisationId,
      sql: input.sql
    });

    shortageUnits += shortageRepair.shortageUnits;

    await cancelStaleOrderWorkflowTasks(input.sql, context, {
      expectedTaskTypes: ["retail_shopping_list_review"],
      orderId: order.id,
      organisationId: input.organisationId,
      reason: "allocation_no_longer_backed_by_stock",
      status: "awaiting_stock"
    });

    await ensureOrderWorkflowTask(input.sql, context, {
      dueAt: order.due_at,
      orderId: order.id,
      organisationId: input.organisationId,
      taskType: "retail_shopping_list_review"
    });

    await recordRetailOrderBpmEvent(input.sql, context, {
      eventName: "retail_order_allocation_integrity_repaired",
      eventStatus: "awaiting_stock",
      metadata: {
        previousStatus: order.status,
        reorderAdviceLineCount: shortageRepair.lineCount,
        reorderAdviceShortageUnits: shortageRepair.shortageUnits,
        source: input.source
      },
      orderId: order.id,
      organisationId: input.organisationId
    });
  }

  return {
    repairedOrderCount: orderRows.length,
    shortageUnits
  };
}

export async function repairRetailStockAllocationIntegrity(
  context: AdminSessionContext,
  input: Readonly<{
    source: string;
    sql: StockDb;
    stockId: string;
  }>
) {
  const stockRows = await input.sql<Array<{
    organisation_id: string;
    product_id: string;
    status: string;
    stock_quantity: number | string;
  }>>`
    select organisation_id::text, product_id::text, status, stock_quantity
    from public.retail_product_stock
    where id = ${input.stockId}::uuid
      and status <> 'deleted'
    limit 1
  `;
  const stock = stockRows[0];

  if (!stock) {
    return {
      affectedOrderIds: [] as string[],
      releasedUnits: 0,
      repairedOrderCount: 0,
      shortageUnits: 0
    };
  }

  const allocationRows = await input.sql<Array<{
    allocation_id: string;
    customer_order_id: string;
    customer_order_line_id: string;
    quantity_allocated: number | string;
  }>>`
    select
      retail_order_allocations.id::text as allocation_id,
      retail_order_allocations.customer_order_id::text,
      retail_order_allocations.customer_order_line_id::text,
      retail_order_allocations.quantity_allocated
    from public.retail_order_allocations
    join public.retail_customer_orders
      on retail_customer_orders.id = retail_order_allocations.customer_order_id
    where retail_order_allocations.retail_product_stock_id = ${input.stockId}::uuid
      and retail_order_allocations.status in ('active', 'picked')
      and retail_customer_orders.status in ('placed', 'awaiting_stock', 'allocated', 'picking', 'packed')
    order by
      coalesce(
        retail_customer_orders.due_at,
        retail_customer_orders.placed_at,
        retail_customer_orders.created_at
      ) desc,
      retail_order_allocations.created_at desc
  `;
  const availableStockUnits =
    stock.status === "active" ? integerOrDefault(stock.stock_quantity, 0) : 0;
  let excessUnits = Math.max(
    0,
    allocationRows.reduce(
      (total, allocation) =>
        total + integerOrDefault(allocation.quantity_allocated, 0),
      0
    ) - availableStockUnits
  );

  if (excessUnits < 1) {
    return {
      affectedOrderIds: [] as string[],
      releasedUnits: 0,
      repairedOrderCount: 0,
      shortageUnits: 0
    };
  }

  const affectedOrderIds = new Set<string>();
  let releasedUnits = 0;

  for (const allocation of allocationRows) {
    if (excessUnits < 1) {
      break;
    }

    const allocatedUnits = integerOrDefault(allocation.quantity_allocated, 0);
    const releaseUnits = Math.min(excessUnits, allocatedUnits);

    if (releaseUnits < 1) {
      continue;
    }

    if (releaseUnits >= allocatedUnits) {
      await input.sql`
        update public.retail_order_allocations
        set
          status = 'cancelled',
          metadata = metadata || ${input.sql.json({
            releasedByPersonId: context.actorPerson.id,
            releasedUnits: releaseUnits,
            source: input.source
          })},
          updated_at = now()
        where id = ${allocation.allocation_id}::uuid
      `;
    } else {
      await input.sql`
        update public.retail_order_allocations
        set
          quantity_allocated = quantity_allocated - ${releaseUnits},
          metadata = metadata || ${input.sql.json({
            releasedByPersonId: context.actorPerson.id,
            releasedUnits: releaseUnits,
            source: input.source
          })},
          updated_at = now()
        where id = ${allocation.allocation_id}::uuid
      `;
    }

    await input.sql`
      update public.retail_customer_order_lines
      set
        quantity_allocated = greatest(0, quantity_allocated - ${releaseUnits}),
        updated_at = now()
      where id = ${allocation.customer_order_line_id}::uuid
    `;

    affectedOrderIds.add(allocation.customer_order_id);
    excessUnits -= releaseUnits;
    releasedUnits += releaseUnits;
  }

  const orderIds = [...affectedOrderIds];

  if (releasedUnits > 0 && orderIds.length > 0) {
    await input.sql`
      update public.retail_customer_orders
      set status = 'awaiting_stock', updated_at = now()
      where id = any(${orderIds}::uuid[])
        and status in ('placed', 'awaiting_stock', 'allocated', 'picking', 'packed')
    `;

    await recordAdminAudit({
      action: "admin.retail_stock_allocations_released",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: stock.organisation_id,
      resourceId: input.stockId,
      resourceType: "retail_product_stock",
      metadata: {
        affectedOrderIds: orderIds,
        productId: stock.product_id,
        releasedUnits,
        source: input.source
      }
    });
  }

  const orderRepair = await repairRetailOrdersAwaitingStockAfterAllocationRelease(
    context,
    {
      orderIds,
      organisationId: stock.organisation_id,
      source: input.source,
      sql: input.sql
    }
  );

  return {
    affectedOrderIds: orderIds,
    releasedUnits,
    repairedOrderCount: orderRepair.repairedOrderCount,
    shortageUnits: orderRepair.shortageUnits
  };
}

export async function releaseRetailStockOverAllocationsAfterStockCount(
  context: AdminSessionContext,
  input: Readonly<{
    sql: StockDb;
    stockId: string;
  }>
) {
  return repairRetailStockAllocationIntegrity(context, {
    ...input,
    source: "shopping_list_stock_count_reduced"
  });
}

export async function repairCustomerOrderAllocationIntegrity(
  context: AdminSessionContext,
  input: Readonly<{
    customerOrderId: string;
    dueAt?: Date | string | null;
    orderNumber: string;
    organisationId: string;
    source: string;
    sql: StockDb;
  }>
) {
  const stockRows = await input.sql<Array<{ stock_id: string }>>`
    select distinct retail_product_stock_id::text as stock_id
    from public.retail_order_allocations
    where customer_order_id = ${input.customerOrderId}::uuid
      and organisation_id = ${input.organisationId}::uuid
      and status in ('active', 'picked')
  `;
  let releasedUnits = 0;

  for (const row of stockRows) {
    const repair = await repairRetailStockAllocationIntegrity(context, {
      source: input.source,
      sql: input.sql,
      stockId: row.stock_id
    });

    releasedUnits += repair.releasedUnits;
  }

  const pipeline = aggregateRetailStockPipelineRows(
    await getRetailStockPipeline({
      customerOrderId: input.customerOrderId,
      locale: context.effectivePerson.preferredLocale,
      organisationIds: [input.organisationId],
      sql: input.sql
    }),
    input.customerOrderId
  );

  if (orderPipelineFullyBacked(pipeline)) {
    return { fullyBacked: true, releasedUnits };
  }

  await input.sql`
    update public.retail_customer_orders
    set status = 'awaiting_stock', updated_at = now()
    where id = ${input.customerOrderId}::uuid
      and organisation_id = ${input.organisationId}::uuid
      and status in ('allocated', 'picking', 'packed')
  `;

  const shortageRepair = await ensureRetailOrderShortagesInReorderAdvice(context, {
    customerOrderId: input.customerOrderId,
    orderNumber: input.orderNumber,
    organisationId: input.organisationId,
    sql: input.sql
  });

  await cancelStaleOrderWorkflowTasks(input.sql, context, {
    expectedTaskTypes: ["retail_shopping_list_review"],
    orderId: input.customerOrderId,
    organisationId: input.organisationId,
    reason: "allocation_no_longer_backed_by_stock",
    status: "awaiting_stock"
  });

  await ensureOrderWorkflowTask(input.sql, context, {
    dueAt: input.dueAt ?? null,
    orderId: input.customerOrderId,
    organisationId: input.organisationId,
    taskType: "retail_shopping_list_review"
  });

  await recordAdminAudit({
    action: "admin.retail_order_allocation_integrity_repaired",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: input.organisationId,
    resourceId: input.customerOrderId,
    resourceType: "retail_customer_order",
    metadata: {
      backedAllocatedUnits: pipeline?.backedAllocatedUnits ?? 0,
      customerDemandUnits: pipeline?.customerDemandUnits ?? 0,
      releasedUnits,
      reorderAdviceLineCount: shortageRepair.lineCount,
      reorderAdviceShortageUnits: shortageRepair.shortageUnits,
      source: input.source,
      unorderedNeedUnits: pipeline?.unorderedNeedUnits ?? 0
    }
  });

  await recordRetailOrderBpmEvent(input.sql, context, {
    eventName: "retail_order_allocation_integrity_repaired",
    eventStatus: "awaiting_stock",
    metadata: {
      backedAllocatedUnits: pipeline?.backedAllocatedUnits ?? 0,
      customerDemandUnits: pipeline?.customerDemandUnits ?? 0,
      releasedUnits,
      reorderAdviceLineCount: shortageRepair.lineCount,
      reorderAdviceShortageUnits: shortageRepair.shortageUnits,
      source: input.source,
      unorderedNeedUnits: pipeline?.unorderedNeedUnits ?? 0
    },
    orderId: input.customerOrderId,
    organisationId: input.organisationId
  });

  return { fullyBacked: false, releasedUnits };
}

export async function repairRetailCustomerOrderAllocationIntegrityForSystem(
  input: Readonly<{
    customerOrderId: string;
    organisationId: string;
    source: string;
    sql?: StockDb;
    taskId?: string | null;
  }>
) {
  const sql = input.sql ?? getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const orderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    order_number: string;
  }>>`
    select id::text, order_number, due_at
    from public.retail_customer_orders
    where id = ${input.customerOrderId}::uuid
      and organisation_id = ${input.organisationId}::uuid
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order not found");
  }

  const context = await retailAgentSessionContext(sql, {
    organisationId: input.organisationId,
    taskId: input.taskId ?? `allocation-integrity:${input.customerOrderId}`
  });

  return repairCustomerOrderAllocationIntegrity(context, {
    customerOrderId: order.id,
    dueAt: order.due_at,
    orderNumber: order.order_number,
    organisationId: input.organisationId,
    source: input.source,
    sql
  });
}
