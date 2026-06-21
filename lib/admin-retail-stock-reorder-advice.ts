import { getSql } from "@/lib/db";
import { integerOrDefault } from "@/lib/admin-retail-stock-codecs";
import {
  humanReviewDueAt,
  queueRetailOperationTask
} from "@/lib/admin-retail-operation-tasks";
import { operationalStockTablesAvailable } from "@/lib/admin-retail-stock-tables";
import type {
  RetailStockAdviceConfidence,
  RetailStockReorderRisk
} from "@/lib/admin-retail-stock-types";

export async function refreshRetailStockReorderAdvice(input: Readonly<{
  generatedByTaskId?: string | null;
  organisationId: string;
  productId?: string | null;
  productIds?: readonly string[] | null;
  stockId?: string | null;
  stockIds?: readonly string[] | null;
}>) {
  const sql = getSql();

  if (!sql || !(await operationalStockTablesAvailable(sql))) {
    return { refreshed: 0 };
  }
  const productIds = [
    ...new Set([
      ...(input.productId ? [input.productId] : []),
      ...((input.productIds ?? []).filter((id) => id.trim()).map((id) => id.trim()))
    ])
  ];
  const stockIds = [
    ...new Set([
      ...(input.stockId ? [input.stockId] : []),
      ...((input.stockIds ?? []).filter((id) => id.trim()).map((id) => id.trim()))
    ])
  ];

  const stockRows = await sql<Array<{
    id: string;
    lead_time_days: number | string;
    organisation_id: string;
    outflow_units_30d: number | string;
    product_id: string;
    recommendation_pressure_count: number | string;
    stock_quantity: number | string;
  }>>`
    select
      retail_product_stock.id::text,
      retail_product_stock.organisation_id::text,
      retail_product_stock.product_id::text,
      retail_product_stock.stock_quantity,
      coalesce(retail_sellable_products.lead_time_days, retail_product_stock.lead_time_days) as lead_time_days,
      coalesce(outflow.outflow_units_30d, 0)::int as outflow_units_30d,
      coalesce(pressure.recommendation_pressure_count, 0)::int as recommendation_pressure_count
    from public.retail_product_stock
    left join public.retail_sellable_products
      on retail_sellable_products.organisation_id = retail_product_stock.organisation_id
      and retail_sellable_products.product_id = retail_product_stock.product_id
      and retail_sellable_products.status <> 'deleted'
    left join lateral (
      select abs(coalesce(sum(retail_stock_movements.quantity_delta), 0))::int as outflow_units_30d
      from public.retail_stock_movements
      where retail_stock_movements.retail_product_stock_id = retail_product_stock.id
        and retail_stock_movements.quantity_delta < 0
        and retail_stock_movements.occurred_at >= now() - interval '30 days'
        and not exists (
          select 1
          from public.retail_stock_movements voids
          where voids.voids_movement_id = retail_stock_movements.id
            and voids.movement_type = 'void'
        )
    ) outflow on true
    left join lateral (
      select count(*)::int as recommendation_pressure_count
      from public.product_recommendation_decisions
      where product_recommendation_decisions.product_id = retail_product_stock.product_id
        and product_recommendation_decisions.outcome in ('chosen', 'near_miss')
        and product_recommendation_decisions.generated_at >= now() - interval '30 days'
    ) pressure on true
    where retail_product_stock.organisation_id = ${input.organisationId}::uuid
      and retail_product_stock.status <> 'deleted'
      and (${stockIds.length === 0}::boolean or retail_product_stock.id = any(${stockIds}::uuid[]))
      and (${productIds.length === 0}::boolean or retail_product_stock.product_id = any(${productIds}::uuid[]))
  `;

  for (const row of stockRows) {
    const currentStock = integerOrDefault(row.stock_quantity, 0);
    const leadTimeDays = integerOrDefault(row.lead_time_days, 0);
    const outflowUnits30d = integerOrDefault(row.outflow_units_30d, 0);
    const recommendationPressureCount = integerOrDefault(
      row.recommendation_pressure_count,
      0
    );
    const demandUnits30d = Math.max(
      outflowUnits30d,
      Math.ceil(recommendationPressureCount * 0.5)
    );
    const dailyDemand = demandUnits30d > 0 ? demandUnits30d / 30 : 0;
    const daysCover = dailyDemand > 0 ? currentStock / dailyDemand : null;
    const targetCoverDays = Math.max(14, leadTimeDays + 14);
    const suggestedOrderQuantity = Math.max(
      0,
      Math.ceil(dailyDemand * targetCoverDays - currentStock)
    );
    const reorderBy = daysCover === null
      ? null
      : new Date(
          Date.now() +
            Math.max(0, Math.floor(daysCover - leadTimeDays)) *
              24 *
              60 *
              60 *
              1000
        )
          .toISOString()
          .slice(0, 10);
    const riskLevel: RetailStockReorderRisk =
      currentStock === 0
        ? "out_of_stock"
        : daysCover !== null && daysCover <= leadTimeDays + 7
          ? "reorder"
          : recommendationPressureCount >= 5 &&
              currentStock <= Math.max(1, recommendationPressureCount)
            ? "watch"
            : "ok";
    const confidence: RetailStockAdviceConfidence =
      outflowUnits30d >= 5
        ? "high"
        : recommendationPressureCount >= 5
          ? "medium"
          : "low";

    await sql`
      insert into public.retail_stock_reorder_advice (
        retail_product_stock_id,
        organisation_id,
        product_id,
        risk_level,
        confidence,
        current_stock_quantity,
        outflow_units_30d,
        recommendation_pressure_count,
        lead_time_days,
        days_cover,
        reorder_by,
        suggested_order_quantity,
        generated_by_task_id,
        inputs,
        calculated_at,
        created_at,
        updated_at
      )
      values (
        ${row.id}::uuid,
        ${row.organisation_id}::uuid,
        ${row.product_id}::uuid,
        ${riskLevel},
        ${confidence},
        ${currentStock},
        ${outflowUnits30d},
        ${recommendationPressureCount},
        ${leadTimeDays},
        ${daysCover},
        ${reorderBy},
        ${suggestedOrderQuantity},
        ${input.generatedByTaskId ?? null}::uuid,
        ${sql.json({
          demandUnits30d,
          source: "retail_stock_forecast_refresh",
          targetCoverDays
        })},
        now(),
        now(),
        now()
      )
      on conflict (organisation_id, product_id)
      do update set
        retail_product_stock_id = excluded.retail_product_stock_id,
        risk_level = excluded.risk_level,
        confidence = excluded.confidence,
        current_stock_quantity = excluded.current_stock_quantity,
        outflow_units_30d = excluded.outflow_units_30d,
        recommendation_pressure_count = excluded.recommendation_pressure_count,
        lead_time_days = excluded.lead_time_days,
        days_cover = excluded.days_cover,
        reorder_by = excluded.reorder_by,
        suggested_order_quantity = excluded.suggested_order_quantity,
        generated_by_task_id = excluded.generated_by_task_id,
        inputs = excluded.inputs,
        calculated_at = now(),
        updated_at = now()
    `;

    if (
      riskLevel === "out_of_stock" ||
      riskLevel === "reorder" ||
      riskLevel === "watch"
    ) {
      const priorityScore =
        riskLevel === "out_of_stock"
          ? 360
          : riskLevel === "reorder"
            ? 640
            : 360;
      const priorityReason =
        riskLevel === "out_of_stock"
          ? "Customer demand cannot be fulfilled because stock is zero."
          : riskLevel === "reorder"
            ? "Lead time means reorder should be reviewed now."
            : "Demand pressure is rising relative to available stock.";

      await queueRetailOperationTask({
        description: "Review reorder advice and add any shortages to the shopping list.",
        dueAt:
          reorderBy && riskLevel !== "out_of_stock"
            ? reorderBy
            : humanReviewDueAt(),
        idempotencyKey: `${row.id}:reorder:${riskLevel}`,
        organisationId: row.organisation_id,
        payload: {
          productId: row.product_id,
          stockId: row.id,
          suggestedOrderQuantity
        },
        priorityReason,
        priorityScore,
        sourceEntityId: row.id,
        sourceEntityType: "retail_product_stock",
        taskType:
          riskLevel === "out_of_stock"
            ? "retail_stock_low_stock_review"
            : "retail_stock_reorder_review",
        title:
          riskLevel === "out_of_stock"
            ? "Review stockout"
            : "Review reorder advice"
      });
    }
  }

  return { refreshed: stockRows.length };
}
