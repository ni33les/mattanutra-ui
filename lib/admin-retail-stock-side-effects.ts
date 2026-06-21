import type { AdminSessionContext } from "@/lib/admin-access";
import {
  integerOrDefault,
  numberOrNull,
  stockStatus
} from "@/lib/admin-retail-stock-codecs";
import {
  humanReviewDueAt,
  queueRetailOperationTask
} from "@/lib/admin-retail-operation-tasks";
import type {
  RetailStockSnapshotEvent,
  RetailStockSnapshotRow,
  StockDb
} from "@/lib/admin-retail-stock-types";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { createTask } from "@/lib/task-service";

export async function recordRetailStockSnapshot(
  sql: StockDb,
  context: AdminSessionContext,
  row: RetailStockSnapshotRow,
  eventType: RetailStockSnapshotEvent,
  metadata: Record<string, unknown>
) {
  await sql`
    insert into public.retail_product_stock_snapshots (
      retail_product_stock_id,
      organisation_id,
      product_id,
      event_type,
      status,
      stock_quantity,
      lead_time_days,
      wholesale_price_amount,
      retail_price_amount,
      currency,
      notes,
      actor_person_id,
      metadata,
      recorded_at
    )
    values (
      ${row.id}::uuid,
      ${row.organisation_id}::uuid,
      ${row.product_id}::uuid,
      ${eventType},
      ${stockStatus(row.status)},
      ${integerOrDefault(row.stock_quantity, 0)},
      ${integerOrDefault(row.lead_time_days, 0)},
      ${numberOrNull(row.wholesale_price_amount)},
      ${numberOrNull(row.retail_price_amount)},
      ${row.currency},
      ${row.notes},
      ${context.actorPerson.id}::uuid,
      ${sql.json({
        ...metadata,
        assumedPersonId: context.assumedPerson?.id ?? null,
        source: "admin_stock"
      })},
      now()
    )
  `;
}

export async function queueRetailStockIntelligenceRefresh(
  row: RetailStockSnapshotRow,
  reason: string
) {
  try {
    await createTask({
      actorType: "system",
      description:
        "Refresh reorder advice from stock movements and recommendation pressure.",
      idempotencyKey: row.id,
      idempotencyScope: "active",
      idempotencyScopeKey: "retail_stock_forecast_refresh",
      maxAttempts: 3,
      organisationId: row.organisation_id,
      payload: {
        productId: row.product_id,
        reason,
        source: "admin_stock",
        stockId: row.id
      },
      priorityReason: "Refresh stock forecast after stock changed.",
      requiredCapabilities: [AGENT_CAPABILITIES.retailStockForecast],
      taskType: "retail_stock_forecast_refresh",
      title: "Refresh retail stock advice"
    });
  } catch (error) {
    console.warn("Unable to queue retail stock advice refresh", error);
  }
}

export async function queueStockReviewTasks(
  row: RetailStockSnapshotRow,
  reason: string
) {
  const stockQuantity = integerOrDefault(row.stock_quantity, 0);
  const retailPriceAmount = numberOrNull(row.retail_price_amount);
  const stockoutImpact = Math.max(0, stockQuantity === 0 ? retailPriceAmount ?? 0 : 0);

  if (stockQuantity === 0) {
    await queueRetailOperationTask({
      description: "Review out-of-stock retail inventory and decide whether to reorder.",
      dueAt: humanReviewDueAt(),
      idempotencyKey: `${row.id}:low-stock`,
      organisationId: row.organisation_id,
      priorityReason: "Product is out of stock.",
      priorityScore: 360,
      profitImpactAmount: stockoutImpact,
      profitImpactCurrency: row.currency,
      sourceEntityId: row.id,
      sourceEntityType: "retail_product_stock",
      taskType: "retail_stock_low_stock_review",
      title: "Review retail stockout"
    });
  }

  if (reason === "stock_movement_recorded") {
    return;
  }
}
