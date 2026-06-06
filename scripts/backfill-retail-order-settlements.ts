import { closeSqlPool, getSql } from "@/lib/db";
import {
  createPendingRetailOrderSettlement,
  markRetailOrderSettlementDue,
  markRetailOrderSettlementNeedsReview,
  voidPendingRetailOrderSettlement,
  type RetailSettlementQuoteLineInput
} from "@/lib/admin-retail-financials";
import { AMOUNT_MICROS_PER_UNIT } from "@/lib/stripe-payment-config";

const RETAILER_PAYABLE_KEY = "retailerPayableAmount";
const RETAILER_PAYABLE_SOURCE_KEY = "retailerPayableSource";
const RETAILER_PAYABLE_REVIEW_KEY = "retailerPayableNeedsReviewReason";
const LEGACY_PAYABLE_KEYS = [
  ["retailer", "Settlement", "Amount"].join(""),
  ["deli", "ght", "Settlement", "Amount"].join(""),
  ["dr", "eam", "Settlement", "Amount"].join("")
];

type OrderRow = Readonly<{
  checkout_payment_id: string | null;
  currency: string;
  id: string;
  organisation_id: string;
  order_number: string;
  status: string;
}>;

type LineRow = Readonly<{
  id: string;
  metadata: Record<string, unknown> | string | null;
  product_id: string;
  product_title: string | null;
  quantity_ordered: number | string | null;
  retail_price_amount: number | string | null;
  wholesale_price_amount: number | string | null;
}>;

type RepairedLine = Readonly<{
  grossAmount: number;
  lineId: string;
  metadata: Record<string, unknown>;
  missingPayable: boolean;
  productId: string;
  productTitle: string | null;
  quantity: number;
  retailerPayableAmount: number | null;
  retailerPayableSource: "legacy_metadata" | "missing" | "wholesale_price";
  unitPriceAmount: number;
}>;

function toJsonValue(value: unknown) {
  const serialized = JSON.stringify(value ?? {});

  return JSON.parse(serialized === undefined ? "{}" : serialized);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      return metadataRecord(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }

  return {};
}

function moneyOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function moneyOrZero(value: unknown) {
  return moneyOrNull(value) ?? 0;
}

function lineQuantity(line: LineRow) {
  const parsed = Number(line.quantity_ordered ?? 1);

  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 1;
}

function legacyPayableAmount(metadata: Record<string, unknown>, unitPriceAmount: number) {
  for (const key of LEGACY_PAYABLE_KEYS) {
    const amount = moneyOrNull(metadata[key]);

    if (amount !== null && amount < unitPriceAmount) {
      return amount;
    }
  }

  return null;
}

function repairedLine(line: LineRow): RepairedLine {
  const metadata = metadataRecord(line.metadata);
  const unitPriceAmount = moneyOrZero(line.retail_price_amount);
  const quantity = lineQuantity(line);
  const wholesalePayable = moneyOrNull(line.wholesale_price_amount);
  const existingPayable = moneyOrNull(metadata[RETAILER_PAYABLE_KEY]);
  const legacyPayable = legacyPayableAmount(metadata, unitPriceAmount);
  const retailerPayableAmount =
    wholesalePayable ??
    (existingPayable !== null && existingPayable < unitPriceAmount ? existingPayable : null) ??
    legacyPayable;
  const retailerPayableSource = wholesalePayable !== null
    ? "wholesale_price"
    : retailerPayableAmount !== null
      ? "legacy_metadata"
      : "missing";
  const nextMetadata = { ...metadata };

  for (const key of LEGACY_PAYABLE_KEYS) {
    delete nextMetadata[key];
  }

  nextMetadata[RETAILER_PAYABLE_KEY] = retailerPayableAmount;
  nextMetadata[RETAILER_PAYABLE_SOURCE_KEY] = retailerPayableSource;

  if (retailerPayableAmount === null) {
    nextMetadata[RETAILER_PAYABLE_REVIEW_KEY] = "missing_retailer_payable_price";
  } else {
    delete nextMetadata[RETAILER_PAYABLE_REVIEW_KEY];
  }

  return {
    grossAmount: unitPriceAmount * quantity,
    lineId: line.id,
    metadata: nextMetadata,
    missingPayable: retailerPayableAmount === null,
    productId: line.product_id,
    productTitle: line.product_title,
    quantity,
    retailerPayableAmount,
    retailerPayableSource,
    unitPriceAmount
  };
}

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to repair retail settlements");
}

try {
  const orders = await sql<OrderRow[]>`
    select
      retail_customer_orders.id::text,
      retail_customer_orders.organisation_id::text,
      retail_customer_orders.order_number,
      retail_customer_orders.status,
      retail_customer_orders.currency,
      coalesce(
        nullif(retail_customer_orders.metadata ->> 'checkoutPaymentId', ''),
        nullif(retail_customer_orders.metadata ->> 'checkout_payment_id', '')
      ) as checkout_payment_id
    from public.retail_customer_orders
    left join public.retail_order_settlements
      on retail_order_settlements.retail_customer_order_id = retail_customer_orders.id
    where retail_customer_orders.source = 'checkout'
      and retail_customer_orders.status not in ('draft')
      and (
        retail_order_settlements.id is null
        or exists (
          select 1
          from public.retail_customer_order_lines
          where retail_customer_order_lines.customer_order_id = retail_customer_orders.id
            and not (coalesce(retail_customer_order_lines.metadata, '{}'::jsonb) ? ${RETAILER_PAYABLE_KEY})
        )
        or retail_order_settlements.paid_amount > retail_order_settlements.retailer_payable_amount
      )
    order by retail_customer_orders.created_at asc
  `;
  let createdOrUpdated = 0;
  let due = 0;
  let metadataRepaired = 0;
  let missingPayable = 0;
  let overpaidSettlementsRepaired = 0;
  let review = 0;
  let voided = 0;
  let skipped = 0;

  for (const order of orders) {
    const lines = await sql<LineRow[]>`
      select
        retail_customer_order_lines.id::text,
        retail_customer_order_lines.product_id::text,
        products.title as product_title,
        retail_customer_order_lines.quantity_ordered,
        retail_customer_order_lines.retail_price_amount,
        retail_customer_order_lines.metadata,
        sellable.wholesale_price_amount
      from public.retail_customer_order_lines
      left join public.products
        on products.id = retail_customer_order_lines.product_id
      left join lateral (
        select retail_sellable_products.wholesale_price_amount
        from public.retail_sellable_products
        where retail_sellable_products.organisation_id = ${order.organisation_id}::uuid
          and retail_sellable_products.product_id = retail_customer_order_lines.product_id
          and retail_sellable_products.status <> 'deleted'
        order by retail_sellable_products.updated_at desc
        limit 1
      ) sellable on true
      where retail_customer_order_lines.customer_order_id = ${order.id}::uuid
      order by retail_customer_order_lines.created_at asc
    `;

    if (lines.length === 0) {
      skipped += 1;
      continue;
    }

    const repairedLines = lines.map(repairedLine);

    for (const line of repairedLines) {
      const original = metadataRecord(lines.find((row) => row.id === line.lineId)?.metadata);
      const next = line.metadata;

      if (JSON.stringify(original) !== JSON.stringify(next)) {
        await sql`
          update public.retail_customer_order_lines
          set
            metadata = ${sql.json(toJsonValue(next))}::jsonb,
            updated_at = now()
          where id = ${line.lineId}::uuid
        `;
        metadataRepaired += 1;
      }
    }

    const quoteLines: RetailSettlementQuoteLineInput[] = repairedLines.map((line) => ({
      productId: line.productId,
      productTitle: line.productTitle,
      quantity: line.quantity,
      retailerPayableAmount: line.retailerPayableAmount,
      retailerPayableNeedsReviewReason: line.missingPayable
        ? "missing_retailer_payable_price"
        : null,
      retailerPayableSource: line.retailerPayableSource,
      unitPriceAmount: line.unitPriceAmount
    }));
    const grossCustomerAmountMicros = repairedLines.reduce(
      (total, line) =>
        total + Math.round(line.grossAmount * AMOUNT_MICROS_PER_UNIT),
      0
    );
    const settlementId = await createPendingRetailOrderSettlement(sql, {
      checkoutPaymentId: order.checkout_payment_id,
      currency: order.currency,
      grossCustomerAmountMicros,
      metadata: {
        backfilledAt: new Date().toISOString(),
        orderNumber: order.order_number,
        source: "backfill_retail_order_settlements"
      },
      orderId: order.id,
      organisationId: order.organisation_id,
      quoteLines
    });

    if (!settlementId) {
      skipped += 1;
      continue;
    }

    createdOrUpdated += 1;

    const repairedPaidRows = await sql<Array<{
      actual_finance_transaction_id: string | null;
      retailer_payable_amount: number | string;
    }>>`
      update public.retail_order_settlements
      set
        paid_amount = retailer_payable_amount,
        metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json(toJsonValue({
          paidAmountRepairedAt: new Date().toISOString(),
          paidAmountRepairReason: "paid_amount_exceeded_retailer_payable",
          source: "backfill_retail_order_settlements"
        }))}::jsonb,
        updated_at = now()
      where retail_customer_order_id = ${order.id}::uuid
        and paid_amount is not null
        and paid_amount > retailer_payable_amount
      returning
        actual_finance_transaction_id::text,
        retailer_payable_amount
    `;

    for (const row of repairedPaidRows) {
      if (!row.actual_finance_transaction_id) {
        continue;
      }

      await sql`
        update public.finance_transactions
        set
          amount = ${row.retailer_payable_amount},
          metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json(toJsonValue({
            amountRepairedAt: new Date().toISOString(),
            amountRepairReason: "retailer_settlement_paid_amount_repaired",
            source: "backfill_retail_order_settlements"
          }))}::jsonb,
          updated_at = now()
        where id = ${row.actual_finance_transaction_id}::uuid
      `;
    }

    overpaidSettlementsRepaired += repairedPaidRows.length;

    if (repairedLines.some((line) => line.missingPayable)) {
      missingPayable += 1;
      await markRetailOrderSettlementNeedsReview(sql, {
        orderId: order.id,
        reason: "missing_retailer_payable_price"
      });
      review += 1;
      continue;
    }

    if (order.status === "shipped" || order.status === "delivered") {
      await markRetailOrderSettlementDue(sql, { orderId: order.id });
      due += 1;
    } else if (order.status === "returned") {
      await markRetailOrderSettlementNeedsReview(sql, {
        orderId: order.id,
        reason: "Backfilled returned order"
      });
      review += 1;
    } else if (order.status === "cancelled") {
      await voidPendingRetailOrderSettlement(sql, {
        orderId: order.id,
        reason: "Backfilled cancelled order"
      });
      voided += 1;
    }
  }

  console.log(JSON.stringify({
    createdOrUpdated,
    due,
    metadataRepaired,
    missingPayable,
    overpaidSettlementsRepaired,
    review,
    skipped,
    totalCandidates: orders.length,
    voided
  }));
} finally {
  await closeSqlPool();
}
