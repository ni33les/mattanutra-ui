import { getSql } from "@/lib/db";
import { recordAdminAudit, type AdminSessionContext } from "@/lib/admin-access";
import { queueAdminOrganisationCommunication } from "@/lib/communications";
import { type Locale } from "@/lib/i18n";
import { addTaskEvent } from "@/lib/task-service";
import { resolveUsdRateForCurrency } from "@/lib/finance-fx";
import {
  createPendingRetailOrderSettlement,
  markRetailOrderSettlementDue,
  markRetailOrderSettlementNeedsReview,
  resolveRetailerPayableUnitAmount,
  voidPendingRetailOrderSettlement
} from "@/lib/admin-retail-financials";
import { FINANCE_ACCOUNT_IDS, recordFinanceTransaction } from "@/lib/finance-ledger";
import { AMOUNT_MICROS_PER_UNIT } from "@/lib/stripe-payment-config";
import { recordRetailOrderBpmEvent } from "@/lib/admin-retail-order-bpm-events";
import { canReadAllRetailStock, canWriteRetailStock } from "@/lib/admin-retail-stock-access";
import {
  assertOrderWorkflowTaskClaimable,
  cancelStaleOrderWorkflowTasks,
  completeOrderWorkflowTask,
  ensureOrderWorkflowTask,
  queueRetailOperationTask,
  retailCommandIdForTaskType
} from "@/lib/admin-retail-operation-tasks";
import { recordRetailStockMovement } from "@/lib/admin-retail-stock-mutations";
import {
  ensureRetailOrderShortagesInReorderAdvice,
  repairCustomerOrderAllocationIntegrity
} from "@/lib/admin-retail-stock-allocation-integrity";
import {
  organisationForStockWrite,
  productApproved
} from "@/lib/admin-retail-stock-organisations";
import { retailOperationsTablesAvailable } from "@/lib/admin-retail-stock-tables";
import {
  getRetailCartLineAvailability,
  normalizeRetailRoutingPreference,
  resolveRegionalBasketAvailability,
  type RegionalBasketAvailability
} from "@/lib/retail-cart-availability";
import { resolveFlatRateShippingCharge } from "@/lib/shipping-fees";
import {
  customerOrderStatus,
  integerOrDefault,
  objectRecord,
  orderNumber,
  stringMetadata
} from "@/lib/admin-retail-stock-codecs";
import {
  aggregateRetailStockPipelineRows,
  getRetailStockPipeline
} from "@/lib/admin-retail-stock-pipeline";
import {
  retailOrderStatusBpmEventName,
  sendRetailOrderWorkflowEmail,
  transitionRetailCustomerOrder
} from "@/lib/retail-order-workflow";
import {
  expectedTaskTypeForStage,
  retailOrderWorkflowTaskDetails,
  workflowStageForStatus,
  workflowTaskTypeForAction
} from "@/lib/retail-order-workflow-rules";
import type {
  CreateRetailCustomerOrderInput,
  RetailCustomerOrderLineAvailability,
  RetailCustomerOrderStatus,
  StockDb
} from "@/lib/admin-retail-stock-types";

async function customerOrderPickupInProgressFromShipmentTable(
  sql: StockDb,
  orderId: string
) {
  const ready = (await sql<Array<{ ready: boolean }>>`
    select to_regclass('public.retail_order_shipments') is not null as ready
  `)[0]?.ready === true;

  if (!ready) {
    return false;
  }

  const rows = await sql<Array<{ in_progress: boolean }>>`
    select exists (
      select 1
      from public.retail_order_shipments
      where retail_customer_order_id = ${orderId}::uuid
        and (
          pickup_booked_at is not null
          or status = 'pickup_booked'
          or lower(coalesce(pickup_provider_status, '')) in ('booked', 'queued', 'requested')
        )
    ) as in_progress
  `;

  return rows[0]?.in_progress === true;
}

export async function createRetailCustomerOrder(
  context: AdminSessionContext,
  input: CreateRetailCustomerOrderInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const requestedLines = input.lines.filter((line) => line.productId.trim());
  let routingSnapshot: RegionalBasketAvailability | null = null;
  let routedOrganisationId =
    input.selectedRetailerOrganisationId ?? input.organisationId;
  let lines = requestedLines;

  if (input.shippingCountry) {
    routingSnapshot = await resolveRegionalBasketAvailability({
      lines: requestedLines.map((line) => ({
        productId: line.productId,
        quantity: line.quantityOrdered
      })),
      preference: normalizeRetailRoutingPreference(input.routingPreference),
      shippingCountry: input.shippingCountry,
      sql
    });

    if (!routingSnapshot.selectedRetailer || !routingSnapshot.canCheckout) {
      throw new Error("No single local retailer can fulfill the full basket");
    }

    if (
      input.selectedRetailerOrganisationId &&
      input.selectedRetailerOrganisationId !==
        routingSnapshot.selectedRetailer.organisationId
    ) {
      throw new Error("Selected retailer does not match regional routing");
    }

    routedOrganisationId = routingSnapshot.selectedRetailer.organisationId;
    lines = requestedLines;
  }

  const organisation = await organisationForStockWrite(
    sql,
    context,
    routedOrganisationId,
    { allowPlatformActorAll: Boolean(input.shippingCountry) }
  );

  if (lines.length < 1) {
    throw new Error("At least one payable customer order line is required");
  }

  for (const line of lines) {
    if (!(await productApproved(sql, line.productId.trim()))) {
      throw new Error("Only approved master products can be sold");
    }

    if (integerOrDefault(line.quantityOrdered, 0) < 1) {
      throw new Error("Customer order quantity is required");
    }
  }

  const preparedLines: RetailCustomerOrderLineAvailability[] = [];

  for (const line of lines) {
    const productId = line.productId.trim();
    const quantityOrdered = integerOrDefault(line.quantityOrdered, 1);
    const availability = await getRetailCartLineAvailability({
      organisationId: organisation.id,
      productId,
      quantity: quantityOrdered,
      sql
    });

    if (!availability.canCheckout) {
      throw new Error(availability.reason);
    }

    const priceAmount = availability.unitPriceAmount;

    if (priceAmount === null) {
      throw new Error("Master List country RRP is required before checkout");
    }

    preparedLines.push({
      availabilityStatus: availability.availabilityStatus,
      backorderQuantity: availability.backorderQuantity,
      currency: availability.currency,
      etaDate: availability.etaDate,
      line,
      priceAmount,
      quantityAvailableNow: availability.quantityAvailableNow,
      reason: availability.reason,
      retailSellableProductId: availability.retailSellableProductId,
      // Prefer sellable wholesale from availability (same source as checkout).
      wholesalePriceAmount: availability.wholesalePriceAmount
    });
  }

  const orderNumberValue = input.orderNumber?.trim() || orderNumber("SO");
  const orderSource = input.source === "checkout" ? "checkout" : "manual";
  const hasBackorder = preparedLines.some(
    (line) => line.availabilityStatus === "backorder"
  );
  const initialStatus: RetailCustomerOrderStatus = hasBackorder
    ? "awaiting_stock"
    : "placed";
  const orderCurrency =
    preparedLines.find((line) => line.currency)?.currency ?? organisation.currency;
  const subtotalAmount = preparedLines.reduce(
    (total, preparedLine) =>
      total +
      preparedLine.priceAmount *
        integerOrDefault(preparedLine.line.quantityOrdered, 1),
    0
  );
  const taxAmount = 0;
  const shipping = await resolveFlatRateShippingCharge({
    organisationId: organisation.id,
    sql
  });
  const shippingAmount = shipping.amount;
  const totalAmount = subtotalAmount + taxAmount + shippingAmount;
  const fx = await resolveUsdRateForCurrency(orderCurrency, { sql });
  const latestEtaDate = preparedLines
    .map((line) => line.etaDate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const orderRows = await sql<Array<{ id: string }>>`
    insert into public.retail_customer_orders (
      organisation_id,
      order_number,
      source,
      customer_name,
      customer_email,
      status,
      currency,
      due_at,
      placed_at,
      notes,
      created_by_person_id,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisation.id}::uuid,
      ${orderNumberValue},
      ${orderSource},
      ${input.customerName?.trim() || null},
      ${input.customerEmail?.trim() || null},
      ${initialStatus},
      ${orderCurrency},
      ${input.dueAt ? new Date(input.dueAt) : null},
      now(),
      ${input.notes?.trim() || null},
      ${context.actorPerson.id}::uuid,
      ${sql.json({
        assumedPersonId: context.assumedPerson?.id ?? null,
        fulfillmentPromise: {
          backorderLineCount: preparedLines.filter(
            (line) => line.availabilityStatus === "backorder"
          ).length,
          etaDate: latestEtaDate,
          mode: hasBackorder ? "backorder" : "stock"
        },
        pricingSnapshot: {
          currency: orderCurrency,
          fxFallbackUsed: fx.fallbackUsed,
          fxProvider: fx.provider,
          fxRateId: fx.fxRateId,
          fxSource: fx.source,
          shippingAmount,
          shippingSource: shipping.source,
          subtotalAmount,
          taxAmount,
          totalAmount,
          usdRate: fx.usdRate
        },
        regionalRouting: routingSnapshot
          ? {
              etaDate: routingSnapshot.etaDate,
              payableLineCount: routingSnapshot.payableLines.length,
              preference: routingSnapshot.preference,
              selectedRetailerOrganisationId:
                routingSnapshot.selectedRetailer?.organisationId ?? null,
              selectedRetailerName:
                routingSnapshot.selectedRetailer?.organisationName ?? null,
              shippingCountry: routingSnapshot.shippingCountry,
              subtotalAmount: routingSnapshot.subtotalAmount,
              unavailableLines: routingSnapshot.unavailableLines.map((line) => ({
                productId: line.productId,
                quantityRequested: line.quantityRequested,
                reason: line.reason
              }))
            }
          : null,
        source:
          orderSource === "checkout"
            ? "regional_checkout"
            : "admin_retail_operations"
      })},
      now(),
      now()
    )
    returning id::text
  `;
  const orderId = orderRows[0]?.id;

  if (!orderId) {
    throw new Error("Customer order could not be created");
  }

  // Payable: availability sellable wholesale → shared resolver (sellable then stock).
  const wholesaleByProduct = new Map<string, number | null>();
  for (const preparedLine of preparedLines) {
    const productId = preparedLine.line.productId.trim();
    if (wholesaleByProduct.has(productId)) {
      continue;
    }
    const fromAvailability =
      preparedLine.wholesalePriceAmount !== null &&
      Number.isFinite(preparedLine.wholesalePriceAmount) &&
      preparedLine.wholesalePriceAmount >= 0
        ? preparedLine.wholesalePriceAmount
        : null;
    const resolved =
      fromAvailability ??
      (await resolveRetailerPayableUnitAmount(sql, organisation.id, productId));
    wholesaleByProduct.set(productId, resolved);
  }

  for (const preparedLine of preparedLines) {
    const line = preparedLine.line;
    const productId = line.productId.trim();
    const retailerPayableAmount = wholesaleByProduct.get(productId) ?? null;

    await sql`
      insert into public.retail_customer_order_lines (
        customer_order_id,
        organisation_id,
        product_id,
        quantity_ordered,
        retail_price_amount,
        notes,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${orderId}::uuid,
        ${organisation.id}::uuid,
        ${productId}::uuid,
        ${integerOrDefault(line.quantityOrdered, 1)},
        ${preparedLine.priceAmount},
        ${line.notes?.trim() || null},
        ${sql.json({
          availabilityStatus: preparedLine.availabilityStatus,
          backorderQuantity: preparedLine.backorderQuantity,
          currency: orderCurrency,
          etaDate: preparedLine.etaDate,
          fxRateId: fx.fxRateId,
          lineSubtotalAmount:
            preparedLine.priceAmount *
            integerOrDefault(line.quantityOrdered, 1),
          priceSource: "master_list_country_rrp_margin",
          quantityAvailableNow: preparedLine.quantityAvailableNow,
          reason: preparedLine.reason,
          retailSellableProductId: preparedLine.retailSellableProductId,
          retailerPayableAmount,
          retailerPayableSource:
            retailerPayableAmount === null ? "missing" : "wholesale_price",
          shippingAmount,
          shippingSource: shipping.source,
          source:
            orderSource === "checkout"
              ? "regional_checkout"
              : "admin_retail_operations",
          taxAmount: 0,
          usdRate: fx.usdRate
        })},
        now(),
        now()
      )
    `;
  }
  const orderPipelineRows = await getRetailStockPipeline({
    customerOrderId: orderId,
    locale: context.effectivePerson.preferredLocale,
    organisationIds: [organisation.id],
    sql
  });
  const orderPipelineByProductId = new Map(
    orderPipelineRows.map((row) => [row.productId, row])
  );

  await recordAdminAudit({
    action: "admin.retail_customer_order_created",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: organisation.id,
    resourceId: orderId,
    resourceType: "retail_customer_order",
    metadata: {
      backorderLineCount: preparedLines.filter(
        (line) => line.availabilityStatus === "backorder"
      ).length,
      lineCount: preparedLines.length,
      regionalRouting: routingSnapshot
        ? {
            etaDate: routingSnapshot.etaDate,
            payableLineCount: routingSnapshot.payableLines.length,
            preference: routingSnapshot.preference,
            selectedRetailerOrganisationId:
              routingSnapshot.selectedRetailer?.organisationId ?? null,
            shippingCountry: routingSnapshot.shippingCountry,
            unavailableLineCount: routingSnapshot.unavailableLines.length
          }
        : null,
      status: initialStatus,
      orderNumber: orderNumberValue
    }
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName:
      orderSource === "checkout"
        ? "retail_checkout_order_created"
        : "retail_manual_order_created",
    eventStatus: initialStatus,
    metadata: {
      backorderLineCount: preparedLines.filter(
        (line) => line.availabilityStatus === "backorder"
      ).length,
      lineCount: preparedLines.length,
      orderNumber: orderNumberValue,
      routingPreference: routingSnapshot?.preference ?? null,
      selectedRetailerOrganisationId: organisation.id,
      shippingCountry: routingSnapshot?.shippingCountry ?? null,
      subtotalAmount,
      unavailableLineCount: routingSnapshot?.unavailableLines.length ?? 0
    },
    orderId,
    organisationId: organisation.id
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: retailOrderStatusBpmEventName(initialStatus),
    eventStatus: initialStatus,
    metadata: {
      backorderLineCount: preparedLines.filter(
        (line) => line.availabilityStatus === "backorder"
      ).length,
      lineCount: preparedLines.length,
      orderNumber: orderNumberValue,
      source: orderSource
    },
    orderId,
    organisationId: organisation.id
  });

  // Finance: pending settlement + nominal customer revenue for admin/manual orders.
  // Checkout path already records Stripe revenue + settlement in retail-product-checkout.
  if (orderSource !== "checkout") {
    try {
      const grossCustomerAmountMicros = Math.max(
        0,
        Math.round(totalAmount * AMOUNT_MICROS_PER_UNIT)
      );

      await createPendingRetailOrderSettlement(sql, {
        checkoutPaymentId: null,
        currency: orderCurrency,
        grossCustomerAmountMicros,
        metadata: {
          orderNumber: orderNumberValue,
          source: "admin_retail_operations"
        },
        orderId,
        organisationId: organisation.id,
        quoteLines: preparedLines.map((preparedLine) => {
          const productId = preparedLine.line.productId.trim();
          const quantity = integerOrDefault(preparedLine.line.quantityOrdered, 1);
          const wholesale = wholesaleByProduct.get(productId) ?? null;
          return {
            productId,
            productTitle: null,
            quantity,
            retailerPayableAmount: wholesale,
            retailerPayableNeedsReviewReason:
              wholesale === null ? "missing_wholesale_price" : null,
            retailerPayableSource:
              wholesale === null ? "missing" : "wholesale_price",
            unitPriceAmount: preparedLine.priceAmount
          };
        })
      });

      if (grossCustomerAmountMicros > 0) {
        await recordFinanceTransaction({
          amount: grossCustomerAmountMicros,
          category: "revenue",
          currency: orderCurrency,
          description: `Admin retail order ${orderNumberValue}`,
          entryType: "nominal",
          from: `customer:${input.customerEmail?.trim() || orderId}`,
          metadata: {
            orderId,
            orderNumber: orderNumberValue,
            organisationId: organisation.id,
            source: "admin_retail_operations"
          },
          provider: "admin",
          source: "admin_retail_order",
          sourceRef: `admin-retail-order:${orderId}:customer-inflow`,
          sql,
          to: "mattanutra:retail-revenue",
          toAccountId: FINANCE_ACCOUNT_IDS.mattanutraRevenue,
          fxRateId: fx.fxRateId,
          usdRate: fx.usdRate
        });
      }
    } catch (error) {
      console.warn("Unable to record admin retail order finance", error);
    }
  }

  try {
    await queueAdminOrganisationCommunication({
      eventKey: "retail_order_created",
      metadata: {
        orderNumber: orderNumberValue,
        source: orderSource
      },
      organisationId: organisation.id,
      resourceId: orderId,
      resourceType: "retail_customer_order"
    });

    if (initialStatus === "awaiting_stock") {
      await queueAdminOrganisationCommunication({
        eventKey: "retail_order_awaiting_stock",
        metadata: {
          orderNumber: orderNumberValue,
          source: orderSource
        },
        organisationId: organisation.id,
        resourceId: orderId,
        resourceType: "retail_customer_order"
      });
    }
  } catch (error) {
    console.warn("Unable to queue retail organisation order notification", error);
  }

  await sendRetailOrderWorkflowEmail({
    event: "confirmed",
    locale: context.effectivePerson.preferredLocale,
    orderId,
    sql
  });

  if (initialStatus === "awaiting_stock") {
    await sendRetailOrderWorkflowEmail({
      event: "awaiting_stock",
      locale: context.effectivePerson.preferredLocale,
      orderId,
      sql
    });
  }

  await queueRetailOperationTask({
    commandId: "allocate_customer_order",
    description: hasBackorder
      ? "Allocate available stock and keep the remaining quantity in reorder advice."
      : "Allocate stock to this customer order.",
    dueAt: input.dueAt ?? null,
    idempotencyKey: `${orderId}:allocate`,
    organisationId: organisation.id,
    priorityReason: hasBackorder
      ? "Customer order includes backordered lines."
      : "Customer order is placed and needs stock allocation.",
    priorityScore: hasBackorder ? 780 : input.dueAt ? 620 : 520,
    sourceEntityId: orderId,
    sourceEntityType: "retail_customer_order",
    taskType: "retail_customer_order_allocate",
    title: "Allocate customer order"
  });

  for (const preparedLine of preparedLines) {
    if (preparedLine.availabilityStatus !== "backorder") {
      continue;
    }

    const productId = preparedLine.line.productId.trim();
    const pipeline = orderPipelineByProductId.get(productId) ?? null;
    const unorderedNeedUnits =
      pipeline?.unorderedNeedUnits ?? preparedLine.backorderQuantity ?? 0;
    const productName = pipeline?.productTitle ?? productId;

    if (unorderedNeedUnits < 1) {
      continue;
    }

    await queueRetailOperationTask({
      commandId: "sync_order_shortages_to_reorder_advice",
      description:
        "Review reorder advice for this retailer and create a shopping list when ready to buy.",
      dueAt: preparedLine.etaDate,
      idempotencyKey: `${orderId}:${productId}:backorder-reorder-review`,
      organisationId: organisation.id,
      payload: {
        backorderQuantity: preparedLine.backorderQuantity,
        customerOrderId: orderId,
        orderNumber: orderNumberValue,
        productId,
        productName,
        quantityAvailableNow:
          pipeline?.availableNowUnits ?? preparedLine.quantityAvailableNow,
        unorderedNeedUnits
      },
      priorityReason:
        `${productName} for ${orderNumberValue}: demand ${
          pipeline?.customerDemandUnits ??
          integerOrDefault(preparedLine.line.quantityOrdered, 1)
        }, allocated ${pipeline?.allocatedUnits ?? 0}, available ${
          pipeline?.availableNowUnits ?? preparedLine.quantityAvailableNow
        }, unordered ${unorderedNeedUnits}.`,
      priorityScore: 860,
      profitImpactAmount:
        preparedLine.priceAmount * integerOrDefault(preparedLine.line.quantityOrdered, 1),
      profitImpactCurrency: organisation.currency,
      sourceEntityId: orderId,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_shopping_list_review",
      title: `Order ${Math.max(1, unorderedNeedUnits)} units for ${orderNumberValue}`
    });

  }

  await ensureRetailOrderShortagesInReorderAdvice(context, {
    customerOrderId: orderId,
    orderNumber: orderNumberValue,
    organisationId: organisation.id,
    sql
  });

  return orderId;
}

async function queueCustomerOrderStockGapTasks(
  sql: StockDb,
  input: Readonly<{
    gaps: readonly Readonly<{
      productId: string;
      remaining: number;
    }>[];
    locale: Locale;
    order: Readonly<{
      id: string;
      organisation_id: string;
      order_number: string;
    }>;
  }>
) {
  if (input.gaps.length === 0) {
    return;
  }

  const gapPipelineRows = await getRetailStockPipeline({
    customerOrderId: input.order.id,
    locale: input.locale,
    organisationIds: [input.order.organisation_id],
    sql
  });
  const gapPipelineByProductId = new Map(
    gapPipelineRows.map((row) => [row.productId, row])
  );

  for (const gap of input.gaps) {
    const pipeline = gapPipelineByProductId.get(gap.productId) ?? null;
    const unorderedNeedUnits = pipeline?.unorderedNeedUnits ?? gap.remaining;
    const productName = pipeline?.productTitle ?? gap.productId;

    if (unorderedNeedUnits < 1) {
      continue;
    }

    await queueRetailOperationTask({
      commandId: "sync_order_shortages_to_reorder_advice",
      description:
        "Review reorder advice, then create a shopping list when ready to buy.",
      idempotencyKey: `${input.order.id}:${gap.productId}:awaiting-stock`,
      organisationId: input.order.organisation_id,
      payload: {
        customerOrderId: input.order.id,
        orderNumber: input.order.order_number,
        productId: gap.productId,
        productName,
        quantityAvailableNow: pipeline?.availableNowUnits ?? 0,
        unorderedNeedUnits
      },
      priorityReason:
        `${productName} for ${input.order.order_number}: demand ${
          pipeline?.customerDemandUnits ?? gap.remaining
        }, allocated ${pipeline?.allocatedUnits ?? 0}, available ${
          pipeline?.availableNowUnits ?? 0
        }, unordered ${unorderedNeedUnits}.`,
      priorityScore: 780,
      sourceEntityId: input.order.id,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_shopping_list_review",
      title: `Order ${unorderedNeedUnits} units for ${input.order.order_number}`
    });
  }
}

export async function allocateRetailCustomerOrder(
  context: AdminSessionContext,
  input: Readonly<{ customerOrderId: string }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const orderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    organisation_id: string;
    order_number: string;
  }>>`
    select id::text, organisation_id::text, order_number, due_at
    from public.retail_customer_orders
    where id = ${input.customerOrderId.trim()}::uuid
      and status in ('placed', 'awaiting_stock', 'allocated')
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order cannot be allocated");
  }

  const lineRows = await sql<Array<{
    id: string;
    product_id: string;
    quantity_allocated: number | string;
    quantity_ordered: number | string;
  }>>`
    select id::text, product_id::text, quantity_ordered, quantity_allocated
    from public.retail_customer_order_lines
    where customer_order_id = ${order.id}::uuid
    order by created_at asc
  `;
  let fullyAllocated = true;
  let hadRemaining = false;
  const allocationPlans: Array<{
    lineId: string;
    productId: string;
    quantity: number;
    stockId: string;
  }> = [];
  const gapPlans: Array<{
    productId: string;
    remaining: number;
  }> = [];

  for (const line of lineRows) {
    const remaining =
      integerOrDefault(line.quantity_ordered, 0) -
      integerOrDefault(line.quantity_allocated, 0);

    if (remaining < 1) {
      continue;
    }

    hadRemaining = true;

    const stockRows = await sql<Array<{
      available_quantity: number | string;
      id: string;
    }>>`
      select
        retail_product_stock.id::text,
        (
          retail_product_stock.stock_quantity
          - coalesce(active_allocations.quantity_allocated, 0)
        )::int as available_quantity
      from public.retail_product_stock
      left join lateral (
        select sum(retail_order_allocations.quantity_allocated)::int as quantity_allocated
        from public.retail_order_allocations
        where retail_order_allocations.retail_product_stock_id = retail_product_stock.id
          and retail_order_allocations.status in ('active', 'picked')
      ) active_allocations on true
      where retail_product_stock.organisation_id = ${order.organisation_id}::uuid
        and retail_product_stock.product_id = ${line.product_id}::uuid
        and retail_product_stock.status = 'active'
        and retail_product_stock.stock_quantity > 0
      order by retail_product_stock.updated_at asc
      limit 1
    `;
    const stock = stockRows[0];
    const available = integerOrDefault(stock?.available_quantity, 0);
    const allocationQuantity = stock ? Math.min(remaining, available) : 0;

    if (allocationQuantity < remaining) {
      fullyAllocated = false;
      gapPlans.push({
        productId: line.product_id,
        remaining: remaining - allocationQuantity
      });
    }

    if (!stock || allocationQuantity < 1) {
      continue;
    }

    allocationPlans.push({
      lineId: line.id,
      productId: line.product_id,
      quantity: allocationQuantity,
      stockId: stock.id
    });
  }

  if (hadRemaining && allocationPlans.length === 0) {
    await queueCustomerOrderStockGapTasks(sql, {
      gaps: gapPlans,
      locale: context.effectivePerson.preferredLocale,
      order
    });
    await ensureRetailOrderShortagesInReorderAdvice(context, {
      customerOrderId: order.id,
      orderNumber: order.order_number,
        organisationId: order.organisation_id,
        sql
      });
    await sql`
      update public.retail_customer_orders
      set status = 'awaiting_stock', updated_at = now()
      where id = ${order.id}::uuid
    `;
    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_awaiting_stock",
      eventStatus: "awaiting_stock",
      metadata: {
        gapUnits: gapPlans.reduce((total, gap) => total + gap.remaining, 0),
        reason: "no_live_stock"
      },
      orderId: order.id,
      organisationId: order.organisation_id
    });
    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_allocation_blocked",
      eventStatus: "no_live_stock",
      metadata: {
        gapUnits: gapPlans.reduce((total, gap) => total + gap.remaining, 0),
        reason: "no_live_stock"
      },
      orderId: order.id,
      organisationId: order.organisation_id
    });
    try {
      await queueAdminOrganisationCommunication({
        eventKey: "retail_order_awaiting_stock",
        metadata: {
          gapUnits: gapPlans.reduce((total, gap) => total + gap.remaining, 0),
          reason: "no_live_stock",
          source: "retail_order_allocation"
        },
        organisationId: order.organisation_id,
        resourceId: order.id,
        resourceType: "retail_customer_order"
      });
    } catch (error) {
      console.warn("Unable to queue retail organisation stock notification", error);
    }
    await sendRetailOrderWorkflowEmail({
      event: "awaiting_stock",
      locale: context.effectivePerson.preferredLocale,
      orderId: order.id,
      sql
    });

    throw new Error(
      "No live stock is available to allocate. Review reorder advice."
    );
  }

  await ensureOrderWorkflowTask(sql, context, {
    dueAt: order.due_at,
    orderId: order.id,
    organisationId: order.organisation_id,
    taskType: "retail_customer_order_allocate"
  });

  for (const allocation of allocationPlans) {
    await sql`
      insert into public.retail_order_allocations (
        customer_order_id,
        customer_order_line_id,
        retail_product_stock_id,
        organisation_id,
        product_id,
        quantity_allocated,
        status,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${order.id}::uuid,
        ${allocation.lineId}::uuid,
        ${allocation.stockId}::uuid,
        ${order.organisation_id}::uuid,
        ${allocation.productId}::uuid,
        ${allocation.quantity},
        'active',
        ${sql.json({
          allocatedByPersonId: context.actorPerson.id,
          source: "admin_retail_operations"
        })},
        now(),
        now()
      )
    `;

    await sql`
      update public.retail_customer_order_lines
      set
        quantity_allocated = quantity_allocated + ${allocation.quantity},
        updated_at = now()
      where id = ${allocation.lineId}::uuid
    `;
  }

  await queueCustomerOrderStockGapTasks(sql, {
    gaps: gapPlans,
    locale: context.effectivePerson.preferredLocale,
    order
  });
  const reorderAdviceShortageRepair = fullyAllocated
    ? null
    : await ensureRetailOrderShortagesInReorderAdvice(context, {
        customerOrderId: order.id,
        orderNumber: order.order_number,
        organisationId: order.organisation_id,
        sql
      });
  const nextStatus: RetailCustomerOrderStatus = fullyAllocated
    ? "allocated"
    : "awaiting_stock";

  await sql`
    update public.retail_customer_orders
    set status = ${nextStatus}, updated_at = now()
    where id = ${order.id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_customer_order_allocated",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: order.organisation_id,
    resourceId: order.id,
    resourceType: "retail_customer_order",
    metadata: {
      allocatedUnits: allocationPlans.reduce(
        (total, allocation) => total + allocation.quantity,
        0
      ),
      gapUnits: gapPlans.reduce((total, gap) => total + gap.remaining, 0),
      reorderAdviceLineCount: reorderAdviceShortageRepair?.lineCount ?? 0,
      reorderAdviceShortageUnits:
        reorderAdviceShortageRepair?.shortageUnits ?? 0,
      status: nextStatus
    }
  });

  if (fullyAllocated) {
    await completeOrderWorkflowTask(sql, context, {
      action: "allocate",
      orderId: order.id,
      organisationId: order.organisation_id,
      taskTypes: ["retail_customer_order_allocate"]
    });
  } else {
    const allocationTaskRows = await sql<Array<{ id: string }>>`
      select id::text
      from public.tasks
      where organisation_id = ${order.organisation_id}::uuid
        and source_entity_type = 'retail_customer_order'
        and source_entity_id = ${order.id}::uuid
        and task_type = 'retail_customer_order_allocate'
        and status not in ('completed', 'cancelled', 'skipped')
      order by updated_at asc
      limit 1
    `;
    const allocationTaskId = allocationTaskRows[0]?.id ?? null;

    await sql`
      update public.tasks
      set
        status = 'queued',
        reserved_by_agent_id = null,
        lease_until = null,
        context = coalesce(context, '{}'::jsonb)
          - 'claimedByPersonId'
          - 'claimedByDisplayName'
          - 'claimedByEmail',
        updated_at = now()
      where organisation_id = ${order.organisation_id}::uuid
        and source_entity_type = 'retail_customer_order'
        and source_entity_id = ${order.id}::uuid
        and task_type = 'retail_customer_order_allocate'
        and status not in ('completed', 'cancelled', 'skipped')
    `;

    if (allocationTaskId) {
      await addTaskEvent({
        eventPayload: {
          actorPersonId: context.actorPerson.id,
          allocatedUnits: allocationPlans.reduce(
            (total, allocation) => total + allocation.quantity,
            0
          ),
          gapUnits: gapPlans.reduce((total, gap) => total + gap.remaining, 0),
          source: "retail_order_workflow"
        },
        eventStatus: "succeeded",
        eventType: "retail_order_partial_allocation_requeued",
        severity: "medium",
        taskId: allocationTaskId
      });
    }
  }

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: retailOrderStatusBpmEventName(nextStatus),
    eventStatus: nextStatus,
    metadata: {
      fullyAllocated,
      status: nextStatus
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  if (!fullyAllocated) {
    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_allocation_blocked",
      eventStatus: nextStatus,
      metadata: {
        fullyAllocated,
        status: nextStatus
      },
      orderId: order.id,
      organisationId: order.organisation_id
    });
    try {
      await queueAdminOrganisationCommunication({
        eventKey: "retail_order_awaiting_stock",
        metadata: {
          source: "retail_order_allocation",
          status: nextStatus
        },
        organisationId: order.organisation_id,
        resourceId: order.id,
        resourceType: "retail_customer_order"
      });
    } catch (error) {
      console.warn("Unable to queue retail organisation stock notification", error);
    }
    await sendRetailOrderWorkflowEmail({
      event: "awaiting_stock",
      locale: context.effectivePerson.preferredLocale,
      orderId: order.id,
      sql
    });
  }

  if (fullyAllocated) {
    try {
      await queueAdminOrganisationCommunication({
        eventKey: "retail_order_ready_to_pack",
        metadata: {
          source: "retail_order_allocation"
        },
        organisationId: order.organisation_id,
        resourceId: order.id,
        resourceType: "retail_customer_order"
      });
    } catch (error) {
      console.warn("Unable to queue retail organisation ready-to-pack notification", error);
    }

    await queueRetailOperationTask({
      commandId: "advance_customer_order",
      description: "Pack the allocated order before booking courier pickup.",
      dueAt: order.due_at,
      idempotencyKey: `${order.id}:pack`,
      organisationId: order.organisation_id,
      priorityReason: "Order has allocated stock and is ready to pack.",
      priorityScore: 720,
      sourceEntityId: order.id,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_order_pack",
      title: "Pack customer order"
    });
  }

  return order.id;
}

export async function advanceRetailCustomerOrder(
  context: AdminSessionContext,
  input: Readonly<{
    action:
      | "cancel"
      | "mark_delivered"
      | "mark_packed"
      | "mark_picking"
      | "mark_shipped"
      | "return";
    carrierName?: string | null;
    customerOrderId: string;
    shipmentNotes?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
  }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const orderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    metadata: unknown;
    organisation_id: string;
    order_number: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, order_number, status, due_at, metadata
    from public.retail_customer_orders
    where id = ${input.customerOrderId.trim()}::uuid
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order not found");
  }

  const transition = transitionRetailCustomerOrder(input.action);
  const nextStatus = transition.nextStatus as RetailCustomerOrderStatus;
  const requiredTaskTypes = [...transition.requiredTaskTypes];
  const actionTaskType = workflowTaskTypeForAction(input.action);
  const existingShipmentMetadata = objectRecord(
    objectRecord(order.metadata).shipment
  );
  const shipmentMetadata =
    input.action === "mark_shipped"
      ? {
          ...existingShipmentMetadata,
          carrierName:
            input.carrierName?.trim() ||
            stringMetadata(existingShipmentMetadata.carrierName) ||
            null,
          shippedAt: new Date().toISOString(),
          shippedByPersonId: context.actorPerson.id,
          shipmentNotes:
            input.shipmentNotes?.trim() ||
            stringMetadata(existingShipmentMetadata.shipmentNotes) ||
            null,
          trackingNumber:
            input.trackingNumber?.trim() ||
            stringMetadata(existingShipmentMetadata.trackingNumber) ||
            null,
          trackingUrl:
            input.trackingUrl?.trim() ||
            stringMetadata(existingShipmentMetadata.trackingUrl) ||
            null
        }
      : null;

  if (actionTaskType) {
    await ensureOrderWorkflowTask(sql, context, {
      dueAt: order.due_at,
      orderId: order.id,
      organisationId: order.organisation_id,
      taskType: actionTaskType
    });
  }

  await assertOrderWorkflowTaskClaimable(sql, context, {
    orderId: order.id,
    organisationId: order.organisation_id,
    taskTypes: requiredTaskTypes
  });

  if (input.action === "mark_shipped") {
    const integrity = await repairCustomerOrderAllocationIntegrity(context, {
      customerOrderId: order.id,
      dueAt: order.due_at,
      orderNumber: order.order_number,
      organisationId: order.organisation_id,
      source: "ship_order_preflight",
      sql
    });

    if (!integrity.fullyBacked) {
      throw new Error(
        "Stock changed after allocation. The order has been moved back to Awaiting Stock."
      );
    }

    const allocationRows = await sql<Array<{
      customer_order_line_id: string;
      id: string;
      product_id: string;
      quantity_allocated: number | string;
      retail_product_stock_id: string;
    }>>`
      select
        id::text,
        customer_order_line_id::text,
        retail_product_stock_id::text,
        product_id::text,
        quantity_allocated
      from public.retail_order_allocations
      where customer_order_id = ${order.id}::uuid
        and status in ('active', 'picked')
    `;

    for (const allocation of allocationRows) {
      const quantity = integerOrDefault(allocation.quantity_allocated, 0);

      if (quantity < 1) {
        continue;
      }

      await recordRetailStockMovement(context, {
        deferAllocationIntegrityRepair: true,
        movementType: "sale",
        quantity,
        reason: "Customer order shipped",
        stockId: allocation.retail_product_stock_id
      });

      await sql`
        update public.retail_customer_order_lines
        set
          quantity_shipped = least(quantity_ordered, quantity_shipped + ${quantity}),
          updated_at = now()
        where id = ${allocation.customer_order_line_id}::uuid
      `;

      await sql`
        update public.retail_order_allocations
        set status = 'shipped', updated_at = now()
        where id = ${allocation.id}::uuid
      `;
    }
  }

  if (input.action === "return") {
    const shippedRows = await sql<Array<{
      product_id: string;
      quantity_shipped: number | string;
      retail_product_stock_id: string | null;
    }>>`
      select
        retail_customer_order_lines.product_id::text,
        retail_customer_order_lines.quantity_shipped,
        (
          select retail_order_allocations.retail_product_stock_id::text
          from public.retail_order_allocations
          where retail_order_allocations.customer_order_line_id = retail_customer_order_lines.id
          order by retail_order_allocations.created_at desc
          limit 1
        ) as retail_product_stock_id
      from public.retail_customer_order_lines
      where retail_customer_order_lines.customer_order_id = ${order.id}::uuid
        and retail_customer_order_lines.quantity_shipped > 0
    `;

    for (const line of shippedRows) {
      if (!line.retail_product_stock_id) {
        continue;
      }

      await recordRetailStockMovement(context, {
        movementType: "return",
        quantity: integerOrDefault(line.quantity_shipped, 0),
        reason: "Customer order returned",
        stockId: line.retail_product_stock_id
      });
    }
  }

  await sql`
    update public.retail_customer_orders
    set
      status = ${nextStatus},
      shipped_at = case when ${nextStatus} = 'shipped' then now() else shipped_at end,
      delivered_at = case when ${nextStatus} = 'delivered' then now() else delivered_at end,
      metadata = case
        when ${shipmentMetadata !== null}::boolean then jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          '{shipment}',
          ${sql.json(shipmentMetadata ?? {})}::jsonb,
          true
        )
        else metadata
      end,
      updated_at = now()
    where id = ${order.id}::uuid
  `;

  if (input.action === "mark_shipped") {
    await markRetailOrderSettlementDue(sql, {
      actorPersonId: context.actorPerson.id,
      orderId: order.id
    });
  } else if (input.action === "cancel") {
    if (order.status === "shipped" || order.status === "delivered" || order.status === "returned") {
      await markRetailOrderSettlementNeedsReview(sql, {
        actorPersonId: context.actorPerson.id,
        orderId: order.id,
        reason: "Order cancelled after shipment"
      });
    } else {
      await voidPendingRetailOrderSettlement(sql, {
        actorPersonId: context.actorPerson.id,
        orderId: order.id,
        reason: "Order cancelled before shipment"
      });
    }
  } else if (input.action === "return") {
    await markRetailOrderSettlementNeedsReview(sql, {
      actorPersonId: context.actorPerson.id,
      orderId: order.id,
      reason: "Order returned after shipment"
    });
  }

  if (input.action === "mark_shipped") {
    if (order.status === "allocated") {
      await recordRetailOrderBpmEvent(sql, context, {
        eventName: "retail_order_picking",
        eventStatus: "picking",
        metadata: {
          action: input.action,
          implicit: true,
          source: "one_click_ship",
          toStatus: "picking"
        },
        orderId: order.id,
        organisationId: order.organisation_id
      });
    }

    if (order.status === "allocated" || order.status === "picking") {
      await recordRetailOrderBpmEvent(sql, context, {
        eventName: "retail_order_packed",
        eventStatus: "packed",
        metadata: {
          action: input.action,
          implicit: true,
          source: "one_click_ship",
          toStatus: "packed"
        },
        orderId: order.id,
        organisationId: order.organisation_id
      });
    }
  }

  await recordAdminAudit({
    action: "admin.retail_customer_order_advanced",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: order.organisation_id,
    resourceId: order.id,
    resourceType: "retail_customer_order",
    metadata: {
      action: input.action,
      fromStatus: order.status,
      shipment: shipmentMetadata
        ? {
            carrierName: shipmentMetadata.carrierName,
            hasTrackingUrl: Boolean(shipmentMetadata.trackingUrl),
            trackingNumber: shipmentMetadata.trackingNumber
          }
        : null,
      toStatus: nextStatus
    }
  });

  const completionTaskTypes =
    input.action === "mark_shipped"
      ? ["retail_order_pick", "retail_order_pack", "retail_order_ship"]
      : requiredTaskTypes;

  if (completionTaskTypes.length > 0) {
    await completeOrderWorkflowTask(sql, context, {
      action: input.action,
      orderId: order.id,
      organisationId: order.organisation_id,
      taskTypes: completionTaskTypes
    });
  }

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: transition.bpmEventName,
    eventStatus: nextStatus,
    metadata: {
      action: input.action,
      fromStatus: order.status,
      shipment: shipmentMetadata
        ? {
            carrierName: shipmentMetadata.carrierName,
            hasTrackingUrl: Boolean(shipmentMetadata.trackingUrl),
            trackingNumber: shipmentMetadata.trackingNumber
          }
        : null,
      toStatus: nextStatus
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  if (transition.customerEmailEvent) {
    await sendRetailOrderWorkflowEmail({
      event: transition.customerEmailEvent,
      locale: context.effectivePerson.preferredLocale,
      orderId: order.id,
      sql
    });
  }

  try {
    const adminEventKey =
      input.action === "cancel"
        ? "retail_order_cancelled"
        : input.action === "mark_delivered"
          ? "retail_order_delivered"
          : input.action === "mark_packed"
            ? "retail_order_ready_to_ship"
            : input.action === "mark_shipped"
              ? "retail_order_shipped"
              : input.action === "return"
                ? "retail_order_returned"
                : null;

    if (adminEventKey) {
      await queueAdminOrganisationCommunication({
        eventKey: adminEventKey,
        metadata: {
          action: input.action,
          fromStatus: order.status,
          source: "retail_order_transition",
          toStatus: nextStatus
        },
        organisationId: order.organisation_id,
        resourceId: order.id,
        resourceType: "retail_customer_order"
      });
    }
  } catch (error) {
    console.warn("Unable to queue retail organisation workflow notification", error);
  }

  const nextTask = transition.nextTask;

  if (nextTask) {
    await queueRetailOperationTask({
      commandId: "advance_customer_order",
      description: nextTask.reason,
      dueAt: order.due_at,
      idempotencyKey: `${order.id}:${nextTask.taskType}`,
      organisationId: order.organisation_id,
      priorityReason: nextTask.reason,
      priorityScore: nextTask.score,
      sourceEntityId: order.id,
      sourceEntityType: "retail_customer_order",
      taskType: nextTask.taskType,
      title: nextTask.title
    });
  }

  return order.id;
}

export async function recordRetailCustomerOrderPickupBooked(
  context: AdminSessionContext,
  input: Readonly<{
    customerOrderId: string;
    pickupProviderStatus?: string | null;
    shipmentId?: string | null;
  }>
) {
  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const orderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    organisation_id: string;
    order_number: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, order_number, status, due_at
    from public.retail_customer_orders
    where id = ${input.customerOrderId.trim()}::uuid
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order not found");
  }

  const status = customerOrderStatus(order.status);

  if (status !== "allocated" && status !== "picking" && status !== "packed") {
    return order.id;
  }

  await ensureOrderWorkflowTask(sql, context, {
    dueAt: order.due_at,
    orderId: order.id,
    organisationId: order.organisation_id,
    taskType: "retail_order_ship"
  });
  await assertOrderWorkflowTaskClaimable(sql, context, {
    orderId: order.id,
    organisationId: order.organisation_id,
    taskTypes: ["retail_order_ship"]
  });
  const shipTaskRows = await sql<Array<{ id: string }>>`
    update public.tasks
    set
      context = coalesce(context, '{}'::jsonb) || ${sql.json({
        action: "book_pickup",
        pickupProviderStatus: input.pickupProviderStatus?.trim() || null,
        shipmentId: input.shipmentId ?? null,
        workflowAction: "book_pickup"
      })}::jsonb,
      updated_at = now()
    where organisation_id = ${order.organisation_id}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${order.id}::uuid
      and task_type = 'retail_order_ship'
      and status not in ('completed', 'cancelled', 'skipped')
    returning id::text
  `;

  for (const task of shipTaskRows) {
    await addTaskEvent({
      eventPayload: {
        actorPersonId: context.actorPerson.id,
        pickupProviderStatus: input.pickupProviderStatus?.trim() || null,
        shipmentId: input.shipmentId ?? null,
        source: "retail_order_workflow"
      },
      eventStatus: "succeeded",
      eventType: "retail_order_pickup_booked",
      severity: "low",
      taskId: task.id
    });
  }

  await recordAdminAudit({
    action: "admin.retail_customer_order_pickup_booked",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: order.organisation_id,
    resourceId: order.id,
    resourceType: "retail_customer_order",
      metadata: {
        action: "book_pickup",
        fromStatus: status,
        pickupProviderStatus: input.pickupProviderStatus?.trim() || null,
        shipmentId: input.shipmentId ?? null,
      workflowAction: "book_pickup"
    }
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: "retail_order_pickup_booked",
    eventStatus: "pickup_booked",
    metadata: {
      action: "book_pickup",
      fromStatus: status,
      pickupProviderStatus: input.pickupProviderStatus?.trim() || null,
      shipmentId: input.shipmentId ?? null,
      workflowAction: "book_pickup"
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  return order.id;
}

export async function reconcileRetailOrderLifecycle(
  context: AdminSessionContext,
  input: Readonly<{ customerOrderId: string }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const orderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    organisation_id: string;
    order_number: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, order_number, status, due_at
    from public.retail_customer_orders
    where id = ${input.customerOrderId.trim()}::uuid
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order not found");
  }

  const status = customerOrderStatus(order.status);

  if (status === "allocated" || status === "picking" || status === "packed") {
    const integrity = await repairCustomerOrderAllocationIntegrity(context, {
      customerOrderId: order.id,
      dueAt: order.due_at,
      orderNumber: order.order_number,
      organisationId: order.organisation_id,
      source: "order_lifecycle_recheck",
      sql
    });

    if (!integrity.fullyBacked) {
      return order.id;
    }

    if (await customerOrderPickupInProgressFromShipmentTable(sql, order.id)) {
      await ensureOrderWorkflowTask(sql, context, {
        dueAt: order.due_at,
        orderId: order.id,
        organisationId: order.organisation_id,
        taskType: "retail_order_ship"
      });
      const staleCancelledCount = await cancelStaleOrderWorkflowTasks(sql, context, {
        expectedTaskTypes: ["retail_order_ship"],
        orderId: order.id,
        organisationId: order.organisation_id,
        reason: "pickup_in_progress",
        status: order.status
      });

      await recordAdminAudit({
        action: "admin.retail_order_lifecycle_reconciled",
        actorPersonId: context.actorPerson.id,
        assumedPersonId: context.assumedPerson?.id ?? null,
        organisationId: order.organisation_id,
        resourceId: order.id,
        resourceType: "retail_customer_order",
        metadata: {
          pickupInProgress: true,
          repaired: staleCancelledCount > 0,
          staleCancelledCount,
          status: order.status
        }
      });

      await recordRetailOrderBpmEvent(sql, context, {
        eventName: "retail_order_lifecycle_reconciled",
        eventStatus: staleCancelledCount > 0 ? "repaired" : "on_track",
        metadata: {
          pickupInProgress: true,
          repaired: staleCancelledCount > 0,
          staleCancelledCount,
          status: order.status
        },
        orderId: order.id,
        organisationId: order.organisation_id
      });

      return order.id;
    }
  }

  const stage = workflowStageForStatus(status);
  const pipeline = aggregateRetailStockPipelineRows(
    await getRetailStockPipeline({
      customerOrderId: order.id,
      locale: context.effectivePerson.preferredLocale,
      organisationIds: [order.organisation_id],
      sql
    }),
    order.id
  );
  const expectedTaskType =
    status === "placed" || status === "awaiting_stock"
      ? !pipeline
        ? null
        : pipeline.customerDemandUnits > pipeline.allocatedUnits &&
            pipeline.availableNowUnits > 0
          ? "retail_customer_order_allocate"
          : pipeline.unorderedNeedUnits > 0
            ? "retail_shopping_list_review"
            : null
      : expectedTaskTypeForStage(stage);
  const expectedTaskTypes = expectedTaskType ? [expectedTaskType] : [];
  const staleCancelledCount = await cancelStaleOrderWorkflowTasks(sql, context, {
    expectedTaskTypes,
    orderId: order.id,
    organisationId: order.organisation_id,
    reason: "order_stage_changed",
    status: order.status
  });

  if (!expectedTaskType) {
    await recordAdminAudit({
      action: "admin.retail_order_lifecycle_reconciled",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: order.organisation_id,
      resourceId: order.id,
      resourceType: "retail_customer_order",
      metadata: {
        repaired: staleCancelledCount > 0,
        stage,
        staleCancelledCount,
        status: order.status
      }
    });

    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_lifecycle_reconciled",
      eventStatus: staleCancelledCount > 0 ? "repaired" : "on_track",
      metadata: {
        repaired: staleCancelledCount > 0,
        stage,
        staleCancelledCount,
        status: order.status
      },
      orderId: order.id,
      organisationId: order.organisation_id
    });

    return order.id;
  }

  const reorderAdviceShortageRepair =
    expectedTaskType === "retail_shopping_list_review"
      ? await ensureRetailOrderShortagesInReorderAdvice(context, {
          customerOrderId: order.id,
          orderNumber: order.order_number,
          organisationId: order.organisation_id,
          sql
        })
      : null;
  const taskRows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.tasks
      where organisation_id = ${order.organisation_id}::uuid
        and source_entity_type = 'retail_customer_order'
        and source_entity_id = ${order.id}::uuid
        and task_type = any(${expectedTaskTypes}::text[])
        and status not in ('completed', 'cancelled', 'skipped')
    ) as exists
  `;
  const hasExpectedTask = Boolean(taskRows[0]?.exists);
  let repaired = (reorderAdviceShortageRepair?.shortageUnits ?? 0) > 0;
  repaired = repaired || staleCancelledCount > 0;

  if (!hasExpectedTask) {
    const taskDetails = retailOrderWorkflowTaskDetails(expectedTaskType);

    await queueRetailOperationTask({
      commandId: retailCommandIdForTaskType(expectedTaskType) ?? undefined,
      description: taskDetails.description,
      dueAt: order.due_at,
      idempotencyKey: `${order.id}:${expectedTaskType}:reconcile`,
      organisationId: order.organisation_id,
      priorityReason: taskDetails.priorityReason,
      priorityScore: taskDetails.priorityScore,
      sourceEntityId: order.id,
      sourceEntityType: "retail_customer_order",
      taskType: expectedTaskType,
      title: taskDetails.title
    });
    repaired = true;
  }

  await recordAdminAudit({
    action: "admin.retail_order_lifecycle_reconciled",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: order.organisation_id,
    resourceId: order.id,
    resourceType: "retail_customer_order",
    metadata: {
      expectedTaskType,
      repaired,
      reorderAdviceLineCount: reorderAdviceShortageRepair?.lineCount ?? 0,
      reorderAdviceShortageUnits:
        reorderAdviceShortageRepair?.shortageUnits ?? 0,
      stage,
      staleCancelledCount,
      status: order.status
    }
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: "retail_order_lifecycle_reconciled",
    eventStatus: repaired ? "repaired" : "on_track",
    metadata: {
      expectedTaskType,
      repaired,
      reorderAdviceLineCount: reorderAdviceShortageRepair?.lineCount ?? 0,
      reorderAdviceShortageUnits:
        reorderAdviceShortageRepair?.shortageUnits ?? 0,
      stage,
      staleCancelledCount,
      status: order.status
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  return order.id;
}
