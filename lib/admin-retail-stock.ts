import { getSql } from "@/lib/db";
import { recordAdminAudit, type AdminSessionContext } from "@/lib/admin-access";
import { retailAgentSessionContext } from "@/lib/admin-retail-agent-session";
import {
  canReadAllRetailStock,
  canWriteRetailStock
} from "@/lib/admin-retail-stock-access";
import { retailCommandIdForTaskType } from "@/lib/admin-retail-operation-tasks";
import { queueRetailStockIntelligenceRefresh } from "@/lib/admin-retail-stock-side-effects";
import { refreshRetailStockReorderAdvice } from "@/lib/admin-retail-stock-reorder-advice";
import {
  recordRetailStockMovement,
  setRetailStockStatus,
  upsertRetailStockItem,
  voidRetailStockMovement
} from "@/lib/admin-retail-stock-mutations";
import {
  advanceRetailCustomerOrder,
  allocateRetailCustomerOrder,
  createRetailCustomerOrder,
  reconcileRetailOrderLifecycle,
  recordRetailCustomerOrderPickupBooked
} from "@/lib/admin-retail-customer-orders";
import {
  ensureRetailOrderShortagesInReorderAdvice,
  ensureRetailStockRow,
  releaseRetailStockOverAllocationsAfterStockCount,
  repairRetailCustomerOrderAllocationIntegrityForSystem
} from "@/lib/admin-retail-stock-allocation-integrity";
import {
  organisationForStockWrite,
  productApproved
} from "@/lib/admin-retail-stock-organisations";
import { ensureRetailShoppingListTablesAvailable } from "@/lib/admin-retail-stock-tables";
import {
  integerOrDefault,
  numberOrNull,
  orderNumber,
  shoppingListStatus
} from "@/lib/admin-retail-stock-codecs";
import {
  assertRetailAgentCommandTask,
  completeRetailCommandTask,
  recordRetailCommandAudit,
  recordRetailCommandBpm,
  retailCommandIdempotencyKey,
  retailCommandRegistry
} from "@/lib/retail-command-registry";
import type {
  CreateRetailShoppingListInput,
  ReopenRetailShoppingListInput,
  RetailAgentCommandInput,
  RetailShoppingListLineInput,
  RetailShoppingListStatus,
  RetailStockSnapshotRow,
  UpdateRetailShoppingListInput,
  UpdateRetailShoppingListResult
} from "@/lib/admin-retail-stock-types";

export { getRetailCustomerOrderActionStates } from "@/lib/admin-retail-order-read-model";
export { getRetailStockPipeline } from "@/lib/admin-retail-stock-pipeline";
export { ensureOrderWorkflowTask } from "@/lib/admin-retail-operation-tasks";
export {
  advanceRetailCustomerOrder,
  allocateRetailCustomerOrder,
  createRetailCustomerOrder,
  ensureRetailOrderShortagesInReorderAdvice,
  recordRetailStockMovement,
  reconcileRetailOrderLifecycle,
  refreshRetailStockReorderAdvice,
  repairRetailCustomerOrderAllocationIntegrityForSystem,
  recordRetailCustomerOrderPickupBooked,
  setRetailStockStatus,
  upsertRetailStockItem,
  voidRetailStockMovement
};

export type * from "@/lib/admin-retail-stock-types";

function textFromPayload(
  payload: Record<string, unknown>,
  key: string
) {
  const value = payload[key];

  return typeof value === "string" ? value.trim() : "";
}

export async function executeRetailAgentCommand(input: RetailAgentCommandInput) {
  const commandId = retailCommandIdForTaskType(input.taskType);

  if (!commandId) {
    throw new Error(`Retail task ${input.taskType} is not agent-executable`);
  }

  const idempotencyKey = retailCommandIdempotencyKey(
    commandId,
    input.payload,
    input.taskId
  );
  let resourceId = input.sourceEntityId;
  let resourceType = input.sourceEntityType;

  try {
    await assertRetailAgentCommandTask({
      commandId,
      organisationId: input.organisationId,
      sourceEntityId: input.sourceEntityId,
      sourceEntityType: input.sourceEntityType,
      taskId: input.taskId
    });

    if (commandId === "refresh_stock_reorder_advice") {
      const stockId =
        textFromPayload(input.payload, "stockId") || input.sourceEntityId;
      const productId = textFromPayload(input.payload, "productId") || null;

      await refreshRetailStockReorderAdvice({
        generatedByTaskId: input.taskId,
        organisationId: input.organisationId,
        productId,
        stockId
      });

      resourceId = stockId ?? productId;
      resourceType = "retail_stock_reorder_advice";
    } else {
      const sql = getSql();

      if (!sql) {
        throw new Error("Database is not configured");
      }

      const context = await retailAgentSessionContext(sql, {
        organisationId: input.organisationId,
        taskId: input.taskId
      });

      if (commandId === "allocate_customer_order") {
        const customerOrderId =
          input.sourceEntityId || textFromPayload(input.payload, "customerOrderId");

        if (!customerOrderId) {
          throw new Error("Retail allocation task is missing a customer order");
        }

        resourceId = await allocateRetailCustomerOrder(context, {
          customerOrderId
        });
        resourceType = "retail_customer_order";
      } else if (commandId === "sync_order_shortages_to_reorder_advice") {
        const customerOrderId =
          input.sourceEntityId || textFromPayload(input.payload, "customerOrderId");

        if (!customerOrderId) {
          throw new Error("Retail shortage sync task is missing a customer order");
        }

        const result = await ensureRetailOrderShortagesInReorderAdvice(context, {
          customerOrderId,
          orderNumber: textFromPayload(input.payload, "orderNumber") || null,
          organisationId: input.organisationId,
          sql
        });

        resourceId = result.refreshedStockRowIds[0] ?? customerOrderId;
        resourceType = result.refreshedStockRowIds.length > 0
          ? "retail_stock_reorder_advice"
          : "retail_customer_order";
      } else if (commandId === "reconcile_customer_order_lifecycle") {
        const customerOrderId =
          input.sourceEntityId || textFromPayload(input.payload, "customerOrderId");

        if (!customerOrderId) {
          throw new Error("Retail lifecycle task is missing a customer order");
        }

        resourceId = await reconcileRetailOrderLifecycle(context, {
          customerOrderId
        });
        resourceType = "retail_customer_order";
      } else {
        throw new Error(`Retail command ${commandId} is not agent-executable`);
      }
    }

    await completeRetailCommandTask({
      commandId,
      result: {
        resourceId,
        resourceType
      },
      taskId: input.taskId
    });
    await recordRetailCommandAudit({
      actorKind: "agent",
      command: retailCommandRegistry[commandId],
      idempotencyKey,
      organisationId: input.organisationId,
      resourceId,
      resourceType,
      taskId: input.taskId
    });
    await recordRetailCommandBpm({
      actorKind: "agent",
      command: retailCommandRegistry[commandId],
      idempotencyKey,
      organisationId: input.organisationId,
      resourceId,
      resourceType,
      status: "succeeded",
      taskId: input.taskId
    });

    return {
      accepted: true,
      commandId,
      idempotencyKey,
      organisationId: input.organisationId,
      resourceId,
      resourceType,
      taskId: input.taskId
    };
  } catch (error) {
    if (commandId) {
      await recordRetailCommandBpm({
        actorKind: "agent",
        command: retailCommandRegistry[commandId],
        idempotencyKey,
        organisationId: input.organisationId,
        resourceId,
        resourceType,
        status: "failed",
        taskId: input.taskId
      });
    }

    throw error;
  }
}

export {
  emptyAdminRetailStockData,
  getAdminRetailStockData
} from "@/lib/admin-retail-stock-data";
export async function createRetailShoppingList(
  context: AdminSessionContext,
  input: CreateRetailShoppingListInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await ensureRetailShoppingListTablesAvailable(sql);

  const organisation = await organisationForStockWrite(
    sql,
    context,
    input.organisationId
  );
  const lines = input.lines.filter((line) => line.productId.trim());

  if (lines.length < 1) {
    throw new Error("At least one shopping list line is required");
  }

  for (const line of lines) {
    if (!(await productApproved(sql, line.productId.trim()))) {
      throw new Error("Only approved master products can be added to shopping lists");
    }
  }

	const listRows = await sql<Array<{ id: string }>>`
	    insert into public.retail_shopping_lists (
	      organisation_id,
	      list_number,
	      status,
	      currency,
	      created_by_person_id,
	      metadata,
	      created_at,
      updated_at
    )
    values (
	      ${organisation.id}::uuid,
	      ${orderNumber("SL")},
	      'active',
	      ${organisation.currency},
	      ${context.actorPerson.id}::uuid,
	      ${sql.json({
	        createdByPersonId: context.actorPerson.id,
        source: "retail_reorder_workflow"
      })},
      now(),
      now()
    )
    returning id::text
  `;
  const shoppingListId = listRows[0]?.id;

  if (!shoppingListId) {
    throw new Error("Shopping list could not be created");
  }

  for (const line of lines) {
	    const requiredQuantity = integerOrDefault(line.requiredQuantity, 0);
	    const unorderedNeedQuantity = integerOrDefault(line.unorderedNeedQuantity, 0);
		    const assignedQuantity = Math.max(
		      0,
		      integerOrDefault(line.assignedQuantity, unorderedNeedQuantity)
		    );
	    const actualQuantity = Math.max(
	      0,
	      integerOrDefault(line.actualQuantity, assignedQuantity)
	    );

	    await sql`
	      insert into public.retail_shopping_list_lines (
        shopping_list_id,
        organisation_id,
        product_id,
	        required_quantity,
	        current_stock_quantity,
	        unordered_need_quantity,
	        assigned_quantity,
	        actual_quantity,
	        stocked_quantity,
	        wholesale_price_amount,
	        retail_price_amount,
	        metadata,
	        created_at,
        updated_at
      )
      values (
        ${shoppingListId}::uuid,
        ${organisation.id}::uuid,
        ${line.productId.trim()}::uuid,
	        ${requiredQuantity},
	        ${integerOrDefault(line.currentStockQuantity, 0)},
	        ${unorderedNeedQuantity},
	        ${assignedQuantity},
	        ${actualQuantity},
	        0,
	        ${numberOrNull(line.wholesalePriceAmount)},
	        ${numberOrNull(line.retailPriceAmount)},
	        ${sql.json({ source: "retail_reorder_workflow" })},
        now(),
        now()
      )
    `;
  }

  await recordAdminAudit({
    action: "admin.retail_shopping_list_created",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: organisation.id,
    resourceId: shoppingListId,
    resourceType: "retail_shopping_list",
    metadata: {
      lineCount: lines.length
    }
  });

  return shoppingListId;
}

export async function reopenRetailShoppingList(
  context: AdminSessionContext,
  input: ReopenRetailShoppingListInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await ensureRetailShoppingListTablesAvailable(sql);

  const listRows = await sql<Array<{
    id: string;
    organisation_id: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, status
    from public.retail_shopping_lists
    where id = ${input.shoppingListId.trim()}::uuid
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const list = listRows[0];

  if (!list) {
    throw new Error("Shopping list not found");
  }

  const previousStatus = shoppingListStatus(list.status);

  if (previousStatus === "active") {
    return list.id;
  }

  await sql`
    update public.retail_shopping_lists
    set status = 'active', updated_at = now()
    where id = ${list.id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_shopping_list_reopened",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: list.organisation_id,
    resourceId: list.id,
    resourceType: "retail_shopping_list",
    metadata: {
      previousStatus,
      status: "active"
    }
  });

  return list.id;
}



export async function updateRetailShoppingList(
  context: AdminSessionContext,
  input: UpdateRetailShoppingListInput
): Promise<UpdateRetailShoppingListResult> {
  const startedAt = Date.now();
  const timingsMs = {
    allocationRetry: 0,
    lineFetch: 0,
    lineUpdates: 0,
    movementCreation: 0,
    reorderAdviceRefresh: 0,
    total: 0
  };

  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await ensureRetailShoppingListTablesAvailable(sql);

  const listRows = await sql<Array<{
    currency: string;
    id: string;
    organisation_id: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, status, currency
    from public.retail_shopping_lists
    where id = ${input.shoppingListId.trim()}::uuid
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const list = listRows[0];

  if (!list) {
    throw new Error("Shopping list not found");
  }

  if (shoppingListStatus(list.status) === "closed") {
    throw new Error("Closed shopping lists cannot be edited");
  }

  let movementCount = 0;
  let movementDeltaUnits = 0;
  let releasedAllocationUnits = 0;
  let refreshedReorderAdviceCount = 0;
  const savedStatus: RetailShoppingListStatus = "closed";
  const affectedProductIds = new Set<string>();
  const affectedStockIds = new Set<string>();
  const affectedOrderIds = new Set<string>();
  const lineIds = [
    ...new Set(
      input.lines
        .map((line) => line.id?.trim() ?? "")
        .filter((lineId) => lineId)
    )
  ];
  const inputLineById = new Map(
    input.lines
      .filter((line): line is RetailShoppingListLineInput & { id: string } =>
        Boolean(line.id?.trim())
      )
      .map((line) => [line.id.trim(), line])
  );
  const lineFetchStartedAt = Date.now();
  const existingRows = lineIds.length > 0
    ? await sql<Array<{
        actual_quantity: number | string;
        assigned_quantity: number | string;
        current_stock_quantity: number | string;
        id: string;
        product_id: string;
        required_quantity: number | string;
        retail_price_amount: number | string | null;
        stocked_quantity: number | string;
        unordered_need_quantity: number | string;
        wholesale_price_amount: number | string | null;
      }>>`
        select
          id::text,
          product_id::text,
          required_quantity,
          current_stock_quantity,
          unordered_need_quantity,
          assigned_quantity,
          actual_quantity,
          stocked_quantity,
          wholesale_price_amount,
          retail_price_amount
        from public.retail_shopping_list_lines
        where id = any(${lineIds}::uuid[])
          and shopping_list_id = ${list.id}::uuid
          and organisation_id = ${list.organisation_id}::uuid
      `
    : [];
  timingsMs.lineFetch = Date.now() - lineFetchStartedAt;

  for (const existing of existingRows) {
    const line = inputLineById.get(existing.id);

    if (!line) {
      continue;
    }

    const requiredQuantity = integerOrDefault(
      line.requiredQuantity,
      integerOrDefault(existing.required_quantity, 0)
    );
    const unorderedNeedQuantity = integerOrDefault(
      line.unorderedNeedQuantity,
      integerOrDefault(existing.unordered_need_quantity, 0)
    );
    const assignedQuantity = Math.max(
      0,
      integerOrDefault(
        line.assignedQuantity,
        integerOrDefault(existing.assigned_quantity, 0)
      )
    );
    const actualQuantity = Math.max(
      0,
      integerOrDefault(
        line.actualQuantity,
        integerOrDefault(existing.actual_quantity, 0)
      )
    );
    const stockedQuantity = integerOrDefault(existing.stocked_quantity, 0);
    const delta = actualQuantity - stockedQuantity;
    const wholesalePriceAmount = numberOrNull(line.wholesalePriceAmount);
    const retailPriceAmount = numberOrNull(line.retailPriceAmount);

    if (delta !== 0) {
      const movementStartedAt = Date.now();
      const stockId = await ensureRetailStockRow(context, {
        organisationId: list.organisation_id,
        productId: existing.product_id,
        wholesalePriceAmount
      });
      affectedProductIds.add(existing.product_id);
      affectedStockIds.add(stockId);

      await recordRetailStockMovement(context, {
        deferAllocationIntegrityRepair: true,
        deferReorderSideEffects: true,
        movementType: delta > 0 ? "receive" : "adjustment",
        notes: null,
        quantity: delta,
        reason:
          delta > 0
            ? "Shopping list stock count saved"
            : "Shopping list stock count reduced",
        stockId,
        unitCostAmount: wholesalePriceAmount
      });
      movementCount += 1;
      movementDeltaUnits += delta;

      if (delta < 0) {
        const release = await releaseRetailStockOverAllocationsAfterStockCount(
          context,
          { sql, stockId }
        );
        releasedAllocationUnits += release.releasedUnits;
        for (const orderId of release.affectedOrderIds) {
          affectedOrderIds.add(orderId);
        }
      }
      timingsMs.movementCreation += Date.now() - movementStartedAt;
    }

    const lineUpdateStartedAt = Date.now();
    await sql`
      update public.retail_shopping_list_lines
      set
        required_quantity = ${requiredQuantity},
        current_stock_quantity = ${integerOrDefault(
          line.currentStockQuantity,
          integerOrDefault(existing.current_stock_quantity, 0)
        )},
        unordered_need_quantity = ${unorderedNeedQuantity},
        assigned_quantity = ${assignedQuantity},
        actual_quantity = ${actualQuantity},
        stocked_quantity = ${actualQuantity},
        wholesale_price_amount = ${wholesalePriceAmount},
        retail_price_amount = ${retailPriceAmount},
        updated_at = now()
      where id = ${existing.id}::uuid
        and shopping_list_id = ${list.id}::uuid
        and organisation_id = ${list.organisation_id}::uuid
    `;

    if (wholesalePriceAmount !== null || retailPriceAmount !== null) {
      await sql`
        insert into public.retail_sellable_products (
          organisation_id,
          product_id,
          status,
          rrp_price_amount,
          wholesale_price_amount,
          currency,
          lead_time_days,
          backorder_policy,
          notes,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${list.organisation_id}::uuid,
          ${existing.product_id}::uuid,
          'active',
          ${retailPriceAmount},
          ${wholesalePriceAmount},
          ${list.currency},
          0,
          'allow',
          null,
          ${sql.json({
            shoppingListId: list.id,
            shoppingListLineId: existing.id,
            updatedByPersonId: context.actorPerson.id,
            updatedVia: "shopping_list_stock_counts"
          })},
          now(),
          now()
        )
        on conflict (organisation_id, product_id)
        do update set
          rrp_price_amount = coalesce(excluded.rrp_price_amount, retail_sellable_products.rrp_price_amount),
          wholesale_price_amount = coalesce(excluded.wholesale_price_amount, retail_sellable_products.wholesale_price_amount),
          metadata = retail_sellable_products.metadata || excluded.metadata,
          updated_at = now()
      `;
    }
    timingsMs.lineUpdates += Date.now() - lineUpdateStartedAt;
  }

  const listUpdateStartedAt = Date.now();
  await sql`
    update public.retail_shopping_lists
    set
      status = ${savedStatus},
      updated_at = now()
    where id = ${list.id}::uuid
  `;
  timingsMs.lineUpdates += Date.now() - listUpdateStartedAt;

  const changedProductIds = [...affectedProductIds];
  const allocationStartedAt = Date.now();
  const awaitingOrderRows = changedProductIds.length > 0
    ? await sql<Array<{ id: string }>>`
        select retail_customer_orders.id::text
        from public.retail_customer_orders
        join public.retail_customer_order_lines
          on retail_customer_order_lines.customer_order_id = retail_customer_orders.id
        where retail_customer_orders.organisation_id = ${list.organisation_id}::uuid
          and retail_customer_orders.status in ('placed', 'awaiting_stock')
          and retail_customer_order_lines.product_id = any(${changedProductIds}::uuid[])
        group by
          retail_customer_orders.id,
          retail_customer_orders.due_at,
          retail_customer_orders.placed_at,
          retail_customer_orders.created_at
        order by
          coalesce(
            retail_customer_orders.due_at,
            retail_customer_orders.placed_at,
            retail_customer_orders.created_at
          ),
          retail_customer_orders.created_at
        limit 50
      `
    : [];

  for (const order of awaitingOrderRows) {
    try {
      await allocateRetailCustomerOrder(context, {
        customerOrderId: order.id
      });
      affectedOrderIds.add(order.id);
    } catch {
      // Leave still-short orders in reorder advice; the order workbench will
      // show the remaining gap.
    }
  }
  timingsMs.allocationRetry = Date.now() - allocationStartedAt;

  if (changedProductIds.length > 0) {
    const adviceStartedAt = Date.now();
    const adviceRefresh = await refreshRetailStockReorderAdvice({
      organisationId: list.organisation_id,
      productIds: changedProductIds
    });
    refreshedReorderAdviceCount = adviceRefresh.refreshed;

    const stockIds = [...affectedStockIds];

    if (stockIds.length > 0) {
      const stockRows = await sql<RetailStockSnapshotRow[]>`
        select
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
        from public.retail_product_stock
        where id = any(${stockIds}::uuid[])
          and organisation_id = ${list.organisation_id}::uuid
          and status <> 'deleted'
      `;

      for (const row of stockRows) {
        await queueRetailStockIntelligenceRefresh(
          row,
          "shopping_list_stock_counts_saved"
        );
      }
    }
    timingsMs.reorderAdviceRefresh = Date.now() - adviceStartedAt;
  }

  timingsMs.total = Date.now() - startedAt;

  await recordAdminAudit({
    action: "admin.retail_shopping_list_updated",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: list.organisation_id,
    resourceId: list.id,
    resourceType: "retail_shopping_list",
    metadata: {
      lineCount: input.lines.length,
      movementCount,
      movementDeltaUnits,
      refreshedReorderAdviceCount,
      releasedAllocationUnits,
      affectedOrderIds: [...affectedOrderIds],
      affectedProductIds: changedProductIds,
      requestedStatus: input.status ? shoppingListStatus(input.status) : null,
      status: savedStatus,
      timingsMs
    }
  });

  return {
    affectedOrderIds: [...affectedOrderIds],
    affectedProductIds: changedProductIds,
    movementCount,
    movementDeltaUnits,
    refreshPending: true,
    refreshedReorderAdviceCount,
    reorderAdviceUpdated: refreshedReorderAdviceCount > 0,
    shoppingListId: list.id,
    status: savedStatus,
    timingsMs
  };
}
