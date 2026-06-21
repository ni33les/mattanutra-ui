import { getSql } from "@/lib/db";
import { recordAdminAudit, type AdminSessionContext } from "@/lib/admin-access";
import {
  canReadAllRetailStock,
  canWriteRetailStock
} from "@/lib/admin-retail-stock-access";
import { queueRetailOperationTask } from "@/lib/admin-retail-operation-tasks";
import {
  queueRetailStockIntelligenceRefresh,
  queueStockReviewTasks,
  recordRetailStockSnapshot
} from "@/lib/admin-retail-stock-side-effects";
import { refreshRetailStockReorderAdvice } from "@/lib/admin-retail-stock-reorder-advice";
import { repairRetailStockAllocationIntegrity } from "@/lib/admin-retail-stock-allocation-integrity";
import {
  organisationForStockWrite,
  productApproved
} from "@/lib/admin-retail-stock-organisations";
import { operationalStockTablesAvailable } from "@/lib/admin-retail-stock-tables";
import {
  integerOrDefault,
  isoDateOrNull,
  movementDelta,
  movementType,
  numberOrNull,
  stockBackorderPolicy,
  stockStatus
} from "@/lib/admin-retail-stock-codecs";
import type {
  RecordRetailStockMovementInput,
  RetailStockSnapshotRow,
  RetailStockStatus,
  StockDb,
  UpsertRetailStockItemInput
} from "@/lib/admin-retail-stock-types";

export async function upsertRetailStockItem(
  context: AdminSessionContext,
  input: UpsertRetailStockItemInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const organisation = await organisationForStockWrite(
    sql,
    context,
    input.organisationId
  );
  const productId = input.productId.trim();

  if (!(await productApproved(sql, productId))) {
    throw new Error("Only approved master products can be stocked");
  }

  const existingRows = await sql<Array<{ id: string; status: string }>>`
    select id::text, status
    from public.retail_product_stock
    where organisation_id = ${organisation.id}::uuid
      and product_id = ${productId}::uuid
    limit 1
  `;
  const status = stockStatus(input.status);
  const backorderPolicy = stockBackorderPolicy(input.backorderPolicy);
  const retailPriceAmount = numberOrNull(input.retailPriceAmount);
  const wholesalePriceAmount = numberOrNull(input.wholesalePriceAmount);

  const sellableRows = await sql<Array<{ id: string }>>`
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
      ${organisation.id}::uuid,
      ${productId}::uuid,
      ${status},
      ${retailPriceAmount},
      ${wholesalePriceAmount},
      ${organisation.currency},
      ${integerOrDefault(input.leadTimeDays, 0)},
      ${backorderPolicy},
      ${input.notes?.trim() || null},
      ${sql.json({
        updatedByPersonId: context.actorPerson.id,
        updatedVia: "admin_sellable_catalogue"
      })},
      now(),
      now()
    )
    on conflict (organisation_id, product_id)
    do update set
      status = excluded.status,
      rrp_price_amount = excluded.rrp_price_amount,
      wholesale_price_amount = excluded.wholesale_price_amount,
      currency = excluded.currency,
      lead_time_days = excluded.lead_time_days,
      backorder_policy = excluded.backorder_policy,
      notes = excluded.notes,
      metadata = retail_sellable_products.metadata || excluded.metadata,
      updated_at = now()
    returning id::text
  `;
  const sellableId = sellableRows[0]?.id ?? null;

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
      ${productId}::uuid,
      ${status},
      ${integerOrDefault(input.stockQuantity, 0)},
      ${integerOrDefault(input.leadTimeDays, 0)},
      ${wholesalePriceAmount},
      null,
      ${organisation.currency},
      ${input.notes?.trim() || null},
      ${sql.json({
        updatedByPersonId: context.actorPerson.id,
        updatedVia: "admin_stock"
      })},
      now(),
      now()
    )
    on conflict (organisation_id, product_id)
    do update set
      status = excluded.status,
      stock_quantity = excluded.stock_quantity,
      lead_time_days = excluded.lead_time_days,
      wholesale_price_amount = excluded.wholesale_price_amount,
      retail_price_amount = excluded.retail_price_amount,
      currency = excluded.currency,
      notes = excluded.notes,
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

  const stockRow = rows[0] ?? null;
  const id = stockRow?.id ?? null;

  if (id && stockRow) {
    await recordRetailStockSnapshot(
      sql,
      context,
      stockRow,
      existingRows[0] ? "updated" : "created",
      {
        previousStatus: existingRows[0]?.status ?? null
      }
    );

    await recordAdminAudit({
      action: existingRows[0] ? "admin.stock_updated" : "admin.stock_created",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: organisation.id,
      resourceId: id,
      resourceType: "retail_product_stock",
      metadata: {
        currency: organisation.currency,
        backorderPolicy,
        leadTimeDays: integerOrDefault(input.leadTimeDays, 0),
        previousStatus: existingRows[0]?.status ?? null,
        productId,
        retailPriceAmount,
        retailSellableProductId: sellableId,
        status,
        stockQuantity: integerOrDefault(input.stockQuantity, 0),
        wholesalePriceAmount
      }
    });

    await refreshRetailStockReorderAdvice({
      organisationId: organisation.id,
      productId,
      stockId: id
    });
    await repairRetailStockAllocationIntegrity(context, {
      source: "admin_stock_update",
      sql,
      stockId: id
    });
    await queueRetailStockIntelligenceRefresh(
      stockRow,
      existingRows[0] ? "stock_updated" : "stock_created"
    );
    await queueStockReviewTasks(
      stockRow,
      existingRows[0] ? "stock_updated" : "stock_created"
    );
  }

  return id;
}

async function stockRowForMovement(
  sql: StockDb,
  context: AdminSessionContext,
  stockId: string
) {
  const rows = await sql<Array<RetailStockSnapshotRow>>`
    select
      retail_product_stock.id::text,
      retail_product_stock.organisation_id::text,
      retail_product_stock.product_id::text,
      retail_product_stock.status,
      retail_product_stock.stock_quantity,
      retail_product_stock.lead_time_days,
      retail_product_stock.wholesale_price_amount,
      retail_product_stock.retail_price_amount,
      retail_product_stock.currency,
      retail_product_stock.notes
    from public.retail_product_stock
    join public.organisations
      on organisations.id = retail_product_stock.organisation_id
    where retail_product_stock.id = ${stockId}::uuid
      and retail_product_stock.status <> 'deleted'
      and organisations.organisation_type = 'tenant'
      and organisations.status = 'active'
      and (
        ${canReadAllRetailStock(context)}::boolean
        or retail_product_stock.organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;

  if (!rows[0]) {
    throw new Error("Stock row not found");
  }

  return rows[0];
}

export async function recordRetailStockMovement(
  context: AdminSessionContext,
  input: RecordRetailStockMovementInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!(await operationalStockTablesAvailable(sql))) {
    throw new Error("Retail stock movement tables are not available");
  }

  const type = movementType(input.movementType);

  if (type === "void") {
    throw new Error("Use the void movement action to void stock movements");
  }

  const delta = movementDelta(type, input.quantity);
  const stockId = input.stockId.trim();
  const unitCostAmount = numberOrNull(input.unitCostAmount);
  let movementId = "";
  let stockRow: RetailStockSnapshotRow | null = null;

  {
    const tx = sql;
    const before = await stockRowForMovement(tx, context, stockId);
    const beforeQuantity = integerOrDefault(before.stock_quantity, 0);
    const nextQuantity = beforeQuantity + delta;

    if (nextQuantity < 0) {
      throw new Error("Stock movement cannot make stock negative");
    }

    let lotId = input.lotId?.trim() || null;

    if (type === "receive") {
      const lotRows = await tx<Array<{ id: string }>>`
        insert into public.retail_stock_lots (
          retail_product_stock_id,
          organisation_id,
          product_id,
          status,
          received_quantity,
          remaining_quantity,
          wholesale_price_amount,
          currency,
          expires_at,
          received_at,
          notes,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${before.id}::uuid,
          ${before.organisation_id}::uuid,
          ${before.product_id}::uuid,
          ${delta > 0 ? "active" : "depleted"},
          ${Math.max(0, delta)},
          ${Math.max(0, delta)},
          ${unitCostAmount},
          ${before.currency},
          ${isoDateOrNull(input.expiresAt)},
          now(),
          ${input.notes?.trim() || null},
          ${tx.json({
            createdByPersonId: context.actorPerson.id,
            source: "admin_stock_movement"
          })},
          now(),
          now()
        )
        returning id::text
      `;
      lotId = lotRows[0]?.id ?? null;
    } else if (lotId && delta < 0) {
      const lotRows = await tx<Array<{ id: string }>>`
        update public.retail_stock_lots
        set
          remaining_quantity = remaining_quantity + ${delta},
          status = case
            when remaining_quantity + ${delta} = 0 then 'depleted'
            else status
          end,
          updated_at = now()
        where id = ${lotId}::uuid
          and retail_product_stock_id = ${before.id}::uuid
          and status in ('active', 'depleted')
          and remaining_quantity + ${delta} >= 0
        returning id::text
      `;

      if (!lotRows[0]) {
        throw new Error("Lot does not have enough remaining stock");
      }
    } else if (lotId && delta > 0) {
      await tx`
        update public.retail_stock_lots
        set
          remaining_quantity = remaining_quantity + ${delta},
          received_quantity = received_quantity + ${delta},
          status = 'active',
          updated_at = now()
        where id = ${lotId}::uuid
          and retail_product_stock_id = ${before.id}::uuid
          and status <> 'deleted'
      `;
    }

    const movementRows = await tx<Array<{ id: string }>>`
      insert into public.retail_stock_movements (
        retail_product_stock_id,
        lot_id,
        organisation_id,
        product_id,
        movement_type,
        quantity_delta,
        unit_cost_amount,
        retail_price_amount,
        currency,
        reason,
        notes,
        actor_person_id,
        source,
        metadata,
        occurred_at,
        created_at
      )
      values (
        ${before.id}::uuid,
        ${lotId}::uuid,
        ${before.organisation_id}::uuid,
        ${before.product_id}::uuid,
        ${type},
        ${delta},
        ${unitCostAmount},
        ${null},
        ${before.currency},
        ${input.reason?.trim() || null},
        ${input.notes?.trim() || null},
        ${context.actorPerson.id}::uuid,
        'admin',
        ${tx.json({
          assumedPersonId: context.assumedPerson?.id ?? null,
          source: "admin_stock_movement"
        })},
        now(),
        now()
      )
      returning id::text
    `;
    movementId = movementRows[0]?.id ?? "";

    const updatedRows = await tx<RetailStockSnapshotRow[]>`
      update public.retail_product_stock
      set
        stock_quantity = ${nextQuantity},
        wholesale_price_amount = coalesce(${unitCostAmount}, wholesale_price_amount),
        retail_price_amount = retail_price_amount,
        metadata = metadata || ${tx.json({
          lastMovementId: movementId,
          movementType: type,
          updatedByPersonId: context.actorPerson.id,
          updatedVia: "admin_stock_movement"
        })},
        updated_at = now()
      where id = ${before.id}::uuid
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
    stockRow = updatedRows[0] ?? null;

    if (stockRow) {
      await recordRetailStockSnapshot(tx, context, stockRow, "movement", {
        movementId,
        movementType: type,
        quantityDelta: delta
      });
    }
  }

  if (!stockRow) {
    throw new Error("Stock movement could not be recorded");
  }
  const recordedStockRow = stockRow as RetailStockSnapshotRow;

  await recordAdminAudit({
    action: "admin.stock_movement_recorded",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: recordedStockRow.organisation_id,
    resourceId: movementId,
    resourceType: "retail_stock_movement",
    metadata: {
      movementType: type,
      productId: recordedStockRow.product_id,
      quantityDelta: delta,
      stockId: recordedStockRow.id
    }
  });

  if (!input.deferReorderSideEffects) {
    try {
      await refreshRetailStockReorderAdvice({
        organisationId: recordedStockRow.organisation_id,
        productId: recordedStockRow.product_id,
        stockId: recordedStockRow.id
      });
      await queueRetailStockIntelligenceRefresh(
        recordedStockRow,
        "stock_movement_recorded"
      );
      await queueStockReviewTasks(recordedStockRow, "stock_movement_recorded");
    } catch (error) {
      console.warn("Unable to refresh retail stock advice after movement", error);
    }
  }

  if (delta < 0 && !input.deferAllocationIntegrityRepair) {
    await repairRetailStockAllocationIntegrity(context, {
      source: "stock_movement_reduced_stock",
      sql,
      stockId: recordedStockRow.id
    });
  }

  if (
    type === "adjustment" ||
    type === "expiry_write_off" ||
    Math.abs(delta) * (unitCostAmount ?? 0) >= 5000
  ) {
    await queueRetailOperationTask({
      description: "Review a stock exception movement before the operational record is relied on.",
      idempotencyKey: `${movementId}:movement-review`,
      organisationId: recordedStockRow.organisation_id,
      priorityReason:
        type === "expiry_write_off"
          ? "Stock was written off for expiry."
          : "Manual stock movement needs review.",
      priorityScore: type === "expiry_write_off" ? 620 : 460,
      profitImpactAmount: Math.abs(delta) * (unitCostAmount ?? 0),
      profitImpactCurrency: recordedStockRow.currency,
      sourceEntityId: movementId,
      sourceEntityType: "retail_stock_movement",
      taskType: "retail_stock_movement_review",
      title: "Review stock movement"
    });
  }

  return movementId;
}

export async function voidRetailStockMovement(
  context: AdminSessionContext,
  input: Readonly<{
    movementId: string;
    notes?: string | null;
    reason?: string | null;
  }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!(await operationalStockTablesAvailable(sql))) {
    throw new Error("Retail stock movement tables are not available");
  }

  let voidId = "";
  let stockRow: RetailStockSnapshotRow | null = null;
  let voidDelta = 0;

  {
    const tx = sql;
    const movementRows = await tx<Array<{
      currency: string;
      id: string;
      lot_id: string | null;
      movement_type: string;
      organisation_id: string;
      product_id: string;
      quantity_delta: number | string;
      retail_price_amount: number | string | null;
      retail_product_stock_id: string;
      unit_cost_amount: number | string | null;
    }>>`
      select
        retail_stock_movements.id::text,
        retail_stock_movements.retail_product_stock_id::text,
        retail_stock_movements.lot_id::text,
        retail_stock_movements.organisation_id::text,
        retail_stock_movements.product_id::text,
        retail_stock_movements.movement_type,
        retail_stock_movements.quantity_delta,
        retail_stock_movements.unit_cost_amount,
        retail_stock_movements.retail_price_amount,
        retail_stock_movements.currency
      from public.retail_stock_movements
      join public.organisations
        on organisations.id = retail_stock_movements.organisation_id
      where retail_stock_movements.id = ${input.movementId.trim()}::uuid
        and retail_stock_movements.movement_type <> 'void'
        and organisations.status = 'active'
        and (
          ${canReadAllRetailStock(context)}::boolean
          or retail_stock_movements.organisation_id = ${context.effectiveOrganisation.id}::uuid
        )
        and not exists (
          select 1
          from public.retail_stock_movements voids
          where voids.voids_movement_id = retail_stock_movements.id
            and voids.movement_type = 'void'
        )
      limit 1
    `;
    const original = movementRows[0];

    if (!original) {
      throw new Error("Movement cannot be voided");
    }

    const before = await stockRowForMovement(
      tx,
      context,
      original.retail_product_stock_id
    );
    const originalDelta = integerOrDefault(original.quantity_delta, 0);
    voidDelta = -originalDelta;
    const nextQuantity = integerOrDefault(before.stock_quantity, 0) + voidDelta;

    if (nextQuantity < 0) {
      throw new Error("Void would make stock negative");
    }

    if (original.lot_id) {
      await tx`
        update public.retail_stock_lots
        set
          remaining_quantity = greatest(0, least(received_quantity, remaining_quantity + ${voidDelta})),
          status = case
            when greatest(0, least(received_quantity, remaining_quantity + ${voidDelta})) = 0 then 'depleted'
            else 'active'
          end,
          updated_at = now()
        where id = ${original.lot_id}::uuid
          and retail_product_stock_id = ${before.id}::uuid
      `;
    }

    const voidRows = await tx<Array<{ id: string }>>`
      insert into public.retail_stock_movements (
        retail_product_stock_id,
        lot_id,
        organisation_id,
        product_id,
        movement_type,
        quantity_delta,
        unit_cost_amount,
        retail_price_amount,
        currency,
        reason,
        notes,
        voids_movement_id,
        actor_person_id,
        source,
        metadata,
        occurred_at,
        created_at
      )
      values (
        ${before.id}::uuid,
        ${original.lot_id}::uuid,
        ${before.organisation_id}::uuid,
        ${before.product_id}::uuid,
        'void',
        ${voidDelta},
        ${numberOrNull(original.unit_cost_amount)},
        ${numberOrNull(original.retail_price_amount)},
        ${before.currency},
        ${input.reason?.trim() || "Void stock movement"},
        ${input.notes?.trim() || null},
        ${original.id}::uuid,
        ${context.actorPerson.id}::uuid,
        'admin',
        ${tx.json({
          assumedPersonId: context.assumedPerson?.id ?? null,
          source: "admin_stock_void"
        })},
        now(),
        now()
      )
      returning id::text
    `;
    voidId = voidRows[0]?.id ?? "";

    const updatedRows = await tx<RetailStockSnapshotRow[]>`
      update public.retail_product_stock
      set
        stock_quantity = ${nextQuantity},
        metadata = metadata || ${tx.json({
          lastMovementId: voidId,
          voidedMovementId: original.id,
          updatedByPersonId: context.actorPerson.id,
          updatedVia: "admin_stock_void"
        })},
        updated_at = now()
      where id = ${before.id}::uuid
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
    stockRow = updatedRows[0] ?? null;

    if (stockRow) {
      await recordRetailStockSnapshot(tx, context, stockRow, "movement", {
        movementId: voidId,
        movementType: "void",
        quantityDelta: voidDelta,
        voidedMovementId: original.id
      });
    }
  }

  if (!stockRow) {
    throw new Error("Stock movement could not be voided");
  }
  const voidedStockRow = stockRow as RetailStockSnapshotRow;

  await recordAdminAudit({
    action: "admin.stock_movement_voided",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: voidedStockRow.organisation_id,
    resourceId: voidId,
    resourceType: "retail_stock_movement",
    metadata: {
      movementId: input.movementId,
      productId: voidedStockRow.product_id,
      quantityDelta: voidDelta,
      stockId: voidedStockRow.id
    }
  });

  await refreshRetailStockReorderAdvice({
    organisationId: voidedStockRow.organisation_id,
    productId: voidedStockRow.product_id,
    stockId: voidedStockRow.id
  });
  if (voidDelta < 0) {
    await repairRetailStockAllocationIntegrity(context, {
      source: "stock_movement_void_reduced_stock",
      sql,
      stockId: voidedStockRow.id
    });
  }
  await queueRetailStockIntelligenceRefresh(voidedStockRow, "stock_movement_voided");
  await queueStockReviewTasks(voidedStockRow, "stock_movement_voided");

  return voidId;
}

export async function setRetailStockStatus(
  context: AdminSessionContext,
  input: Readonly<{
    id: string;
    status: RetailStockStatus;
  }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rows = await sql<RetailStockSnapshotRow[]>`
    update public.retail_product_stock
    set
      status = ${stockStatus(input.status)},
      metadata = metadata || ${sql.json({
        statusUpdatedByPersonId: context.actorPerson.id,
        statusUpdatedVia: "admin_stock"
      })},
      updated_at = now()
    where id = ${input.id.trim()}::uuid
      and organisation_id in (
        select id
        from public.organisations
        where organisation_type = 'tenant'
          and status = 'active'
          and (
            ${canReadAllRetailStock(context)}::boolean
            or id = ${context.effectiveOrganisation.id}::uuid
          )
      )
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
    throw new Error("Stock row not found");
  }

  await sql`
    update public.retail_sellable_products
    set
      status = ${stockStatus(input.status)},
      metadata = metadata || ${sql.json({
        statusUpdatedByPersonId: context.actorPerson.id,
        statusUpdatedVia: "admin_stock"
      })},
      updated_at = now()
    where organisation_id = ${rows[0].organisation_id}::uuid
      and product_id = ${rows[0].product_id}::uuid
  `;

  await recordRetailStockSnapshot(sql, context, rows[0], "status_changed", {
    status: stockStatus(input.status)
  });

  await recordAdminAudit({
    action: "admin.stock_status_updated",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: rows[0].organisation_id,
    resourceId: rows[0].id,
    resourceType: "retail_product_stock",
    metadata: {
      status: stockStatus(input.status)
    }
  });

  await refreshRetailStockReorderAdvice({
    organisationId: rows[0].organisation_id,
    productId: rows[0].product_id,
    stockId: rows[0].id
  });
  await repairRetailStockAllocationIntegrity(context, {
    source: "stock_status_changed",
    sql,
    stockId: rows[0].id
  });
  await queueRetailStockIntelligenceRefresh(rows[0], "stock_status_updated");
  await queueStockReviewTasks(rows[0], "stock_status_updated");

  return rows[0].id;
}
