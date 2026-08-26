import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import {
  recordAdminAudit,
  type AdminSessionContext
} from "@/lib/admin-access";
import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { hasAdminPermission } from "@/lib/admin-rbac";
import {
  queueAdminOrganisationCommunication,
  queuePlatformAdminCommunication
} from "@/lib/communications";
import { writeBpmEvent } from "@/lib/bpm";
import { getSql } from "@/lib/db";
import { resolveUsdRateForCurrency } from "@/lib/finance-fx";
import {
  FINANCE_ACCOUNT_IDS,
  recordFinanceTransaction
} from "@/lib/finance-ledger";
import type { Locale } from "@/lib/i18n";
import {
  retailFinancialsLabels,
  retailFinancialsStatusLabel
} from "@/lib/retail-financials-labels";
import { AMOUNT_MICROS_PER_UNIT } from "@/lib/stripe-payment-config";

type RetailFinancialsDb = postgres.Sql | postgres.TransactionSql;

export type RetailSettlementStatus =
  | "confirmed"
  | "due"
  | "needs_review"
  | "paid"
  | "pending"
  | "voided";

export type RetailSettlementQuoteLineInput = Readonly<{
  productId: string;
  productTitle?: string | null;
  quantity?: number | null;
  retailerPayableAmount?: number | null;
  retailerPayableNeedsReviewReason?: string | null;
  retailerPayableSource?: string | null;
  /** Pharmacy list price (RRP); preferred payable basis. */
  rrpPriceAmount?: number | null;
  unitPriceAmount?: number | null;
}>;

export type AdminRetailFinancialsRow = Readonly<{
  actualFinanceTransactionId: string | null;
  confirmedAt: string | null;
  confirmedReference: string | null;
  createdAt: string;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  grossCustomerAmount: number;
  id: string;
  itemCount: number;
  mattanutraMarginAmount: number;
  nominalFinanceTransactionId: string | null;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  organisationId: string;
  organisationName: string;
  paidAmount: number | null;
  paidAt: string | null;
  paidMethod: string | null;
  paidReference: string | null;
  paymentId: string | null;
  retailerPayableAmount: number;
  /** Processing/shipping fee retained by platform (customer paid, not retailer payable). */
  shippingFeeAmount: number;
  shippedAt: string | null;
  status: RetailSettlementStatus;
  updatedAt: string;
}>;

export type AdminRetailFinancialsOrganisationSummary = Readonly<{
  actualPayoutAmount: number;
  confirmedAmount: number;
  dueAmount: number;
  grossCustomerAmount: number;
  mattanutraMarginAmount: number;
  needsReviewAmount: number;
  nominalPayoutAmount: number;
  organisationId: string;
  organisationName: string;
  outstandingAmount: number;
  paidAmount: number;
  pendingAmount: number;
  settlementCount: number;
}>;

export type AdminRetailFinancialsData = Readonly<{
  currency: string;
  databaseAvailable: boolean;
  generatedAt: string;
  isPlatformScope: boolean;
  organisationName: string;
  range: AdminDashboardRange;
  rows: AdminRetailFinancialsRow[];
  summaries: AdminRetailFinancialsOrganisationSummary[];
  summary: Readonly<{
    actualPayoutAmount: number;
    confirmedAmount: number;
    dueAmount: number;
    grossCustomerAmount: number;
    mattanutraMarginAmount: number;
    needsReviewAmount: number;
    nominalPayoutAmount: number;
    outstandingAmount: number;
    paidAmount: number;
    pendingAmount: number;
    settlementCount: number;
  }>;
}>;

type SettlementRow = Readonly<{
  actual_finance_transaction_id: string | null;
  confirmed_at: Date | string | null;
  confirmed_reference: string | null;
  created_at: Date | string;
  currency: string;
  customer_email: string | null;
  customer_name: string | null;
  gross_customer_amount: number | string;
  id: string;
  item_count: number | string | null;
  mattanutra_margin_amount: number | string;
  nominal_finance_transaction_id: string | null;
  order_id: string;
  order_number: string;
  order_status: string;
  organisation_id: string;
  organisation_name: string;
  paid_amount: number | string | null;
  paid_at: Date | string | null;
  paid_method: string | null;
  paid_reference: string | null;
  payment_id: string | null;
  retailer_payable_amount: number | string;
  settlement_metadata: unknown;
  shipping_fee_amount: number | string | null;
  shipped_at: Date | string | null;
  status: string;
  updated_at: Date | string;
}>;

type RetailOrderAmountRow = Readonly<{
  currency: string;
  gross_customer_amount: number | string | null;
  missing_payable_line_count: number | string | null;
  organisation_id: string;
  order_number: string;
  retailer_payable_amount: number | string | null;
}>;

type SettlementNotificationDetails = Readonly<{
  currency: string;
  order_number: string | null;
  organisation_id: string;
  organisation_name: string;
  retailer_payable_amount: number | string;
}>;

function toJsonValue(value: unknown): postgres.JSONValue {
  const serialized = JSON.stringify(value ?? {});

  return JSON.parse(serialized === undefined ? "{}" : serialized) as postgres.JSONValue;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function persistedPersonId(value: string | null | undefined) {
  return value?.startsWith("00000000-0000-4000-8000-") ? null : value ?? null;
}

function microsToAmount(value: number | string | null | undefined) {
  return Number(value ?? 0) / AMOUNT_MICROS_PER_UNIT;
}

function amountToMicros(value: number) {
  return Math.max(0, Math.round(value * AMOUNT_MICROS_PER_UNIT));
}

function majorCurrencyAmount(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function positiveMicrosFromMajor(value: unknown) {
  const major = majorCurrencyAmount(value);

  return major === null ? null : amountToMicros(major);
}

/**
 * Unit retailer payable in major currency units.
 * Prefer sellable wholesale (checkout source of truth), then stock wholesale.
 */
export async function resolveRetailerPayableUnitAmount(
  sql: RetailFinancialsDb,
  organisationId: string,
  productId: string
) {
  const sellableRows = await sql<Array<{ wholesale_price_amount: number | string | null }>>`
    select wholesale_price_amount
    from public.retail_sellable_products
    where organisation_id = ${organisationId}::uuid
      and product_id = ${productId}::uuid
      and status <> 'deleted'
      and wholesale_price_amount is not null
      and wholesale_price_amount >= 0
    order by updated_at desc nulls last
    limit 1
  `;
  const fromSellable = majorCurrencyAmount(sellableRows[0]?.wholesale_price_amount);

  if (fromSellable !== null) {
    return fromSellable;
  }

  const stockRows = await sql<Array<{ wholesale_price_amount: number | string | null }>>`
    select wholesale_price_amount
    from public.retail_product_stock
    where organisation_id = ${organisationId}::uuid
      and product_id = ${productId}::uuid
      and status <> 'deleted'
      and wholesale_price_amount is not null
      and wholesale_price_amount >= 0
    order by updated_at desc nulls last
    limit 1
  `;

  return majorCurrencyAmount(stockRows[0]?.wholesale_price_amount);
}

function formatMicrosAmount(amountMicros: number | string | null | undefined, currency: string) {
  const amount = microsToAmount(amountMicros);

  return `${amount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  })} ${currency}`;
}

function dateIso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

async function settlementNotificationDetails(
  sql: RetailFinancialsDb,
  settlementId: string
) {
  const rows = await sql<SettlementNotificationDetails[]>`
    select
      retail_order_settlements.organisation_id::text,
      retail_order_settlements.currency,
      retail_order_settlements.retailer_payable_amount,
      retail_customer_orders.order_number,
      organisations.name as organisation_name
    from public.retail_order_settlements
    join public.organisations
      on organisations.id = retail_order_settlements.organisation_id
    left join public.retail_customer_orders
      on retail_customer_orders.id = retail_order_settlements.retail_customer_order_id
    where retail_order_settlements.id = ${settlementId}::uuid
    limit 1
  `;

  return rows[0] ?? null;
}

async function queuePlatformSettlementNotification(input: Readonly<{
  amountMicros?: number | string | null;
  currency?: string | null;
  eventKey: "platform_retailer_payout_due" | "platform_retailer_settlement_needs_review";
  metadata?: Record<string, unknown>;
  orderNumber?: string | null;
  organisationId: string;
  organisationName?: string | null;
  reason?: string | null;
  settlementId: string;
}>) {
  try {
    const amount =
      input.amountMicros === undefined
        ? null
        : formatMicrosAmount(input.amountMicros, input.currency ?? "");
    const orderNumber = cleanText(input.orderNumber) || "the order";
    const organisationName = cleanText(input.organisationName) || "the retailer";
    const subject = input.eventKey === "platform_retailer_payout_due"
      ? `Retailer payout due: ${orderNumber}`
      : `Retailer settlement review: ${orderNumber}`;
    const body = input.eventKey === "platform_retailer_payout_due"
      ? `${organisationName} has a retailer payout due for ${orderNumber}${amount ? ` (${amount})` : ""}. Review Platform Financials and mark it paid when the transfer is made.`
      : `${organisationName} has a settlement needing review for ${orderNumber}. ${cleanText(input.reason) || "Review the order, refund, and payout state before reconciling."}`;

    await queuePlatformAdminCommunication({
      body,
      eventKey: input.eventKey,
      metadata: {
        amountMicros: input.amountMicros ?? null,
        currency: input.currency ?? null,
        organisationId: input.organisationId,
        orderNumber: input.orderNumber ?? null,
        reason: input.reason ?? null,
        settlementId: input.settlementId,
        source: "retail_financials",
        ...input.metadata
      },
      resourceId: input.settlementId,
      resourceType: "retail_order_settlement",
      subject
    });
  } catch (error) {
    console.warn("Unable to queue platform settlement notification", error);
  }
}

async function queueRetailSettlementNotification(input: Readonly<{
  amountMicros?: number | string | null;
  currency?: string | null;
  eventKey: "retail_settlement_needs_review" | "retail_settlement_payout_paid";
  metadata?: Record<string, unknown>;
  orderNumber?: string | null;
  organisationId: string;
  reason?: string | null;
  settlementId: string;
}>) {
  try {
    const amount =
      input.amountMicros === undefined
        ? null
        : formatMicrosAmount(input.amountMicros, input.currency ?? "");
    const orderNumber = cleanText(input.orderNumber) || "the order";
    const subject = input.eventKey === "retail_settlement_payout_paid"
      ? `Retail payout sent: ${orderNumber}`
      : `Settlement needs review: ${orderNumber}`;
    const body = input.eventKey === "retail_settlement_payout_paid"
      ? `MattaNutra has marked the retailer payout paid for ${orderNumber}${amount ? ` (${amount})` : ""}. Please confirm receipt in Retail Financials when the funds arrive.`
      : `The settlement for ${orderNumber} needs review. ${cleanText(input.reason) || "Check Retail Financials before confirming any payout or adjustment."}`;

    await queueAdminOrganisationCommunication({
      body,
      eventKey: input.eventKey,
      metadata: {
        amountMicros: input.amountMicros ?? null,
        currency: input.currency ?? null,
        orderNumber: input.orderNumber ?? null,
        reason: input.reason ?? null,
        settlementId: input.settlementId,
        source: "retail_financials",
        ...input.metadata
      },
      organisationId: input.organisationId,
      resourceId: input.settlementId,
      resourceType: "retail_order_settlement",
      subject
    });
  } catch (error) {
    console.warn("Unable to queue retail settlement notification", error);
  }
}

function settlementStatus(value: string): RetailSettlementStatus {
  return value === "confirmed" ||
    value === "due" ||
    value === "needs_review" ||
    value === "paid" ||
    value === "voided"
    ? value
    : "pending";
}

function addSummaryAmount(
  summary: {
    actualPayoutAmount: number;
    confirmedAmount: number;
    dueAmount: number;
    grossCustomerAmount: number;
    mattanutraMarginAmount: number;
    needsReviewAmount: number;
    nominalPayoutAmount: number;
    outstandingAmount: number;
    paidAmount: number;
    pendingAmount: number;
    settlementCount: number;
  },
  row: AdminRetailFinancialsRow
) {
  summary.settlementCount += 1;
  summary.grossCustomerAmount += row.grossCustomerAmount;
  summary.mattanutraMarginAmount += row.mattanutraMarginAmount;

  if (row.nominalFinanceTransactionId) {
    summary.nominalPayoutAmount += row.retailerPayableAmount;
  }

  if (row.actualFinanceTransactionId) {
    summary.actualPayoutAmount += row.paidAmount ?? row.retailerPayableAmount;
  }

  if (row.status === "pending") {
    summary.pendingAmount += row.retailerPayableAmount;
    summary.outstandingAmount += row.retailerPayableAmount;
  } else if (row.status === "due") {
    summary.dueAmount += row.retailerPayableAmount;
    summary.outstandingAmount += row.retailerPayableAmount;
  } else if (row.status === "paid") {
    summary.paidAmount += row.paidAmount ?? row.retailerPayableAmount;
  } else if (row.status === "confirmed") {
    summary.confirmedAmount += row.paidAmount ?? row.retailerPayableAmount;
  } else if (row.status === "needs_review") {
    summary.needsReviewAmount += row.retailerPayableAmount;
    summary.outstandingAmount += row.retailerPayableAmount;
  }
}

function emptySummary() {
  return {
    actualPayoutAmount: 0,
    confirmedAmount: 0,
    dueAmount: 0,
    grossCustomerAmount: 0,
    mattanutraMarginAmount: 0,
    needsReviewAmount: 0,
    nominalPayoutAmount: 0,
    outstandingAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    settlementCount: 0
  };
}

function settlementShippingFeeMicros(row: SettlementRow) {
  const metadata =
    row.settlement_metadata &&
    typeof row.settlement_metadata === "object" &&
    !Array.isArray(row.settlement_metadata)
      ? (row.settlement_metadata as Record<string, unknown>)
      : {};
  const fromMetadata = Number(metadata.shippingAmountMicros);

  if (Number.isFinite(fromMetadata) && fromMetadata >= 0) {
    return Math.round(fromMetadata);
  }

  const fromSnapshot = Number(row.shipping_fee_amount);

  if (Number.isFinite(fromSnapshot) && fromSnapshot >= 0) {
    return amountToMicros(fromSnapshot);
  }

  return 0;
}

/**
 * Gross = customer paid total.
 * Payable = pharmacy RRP.
 * Shipping fee = processing fee retained by platform.
 * Margin = platform product cut = gross − payable − shipping.
 */
function settlementPlatformSplit(row: SettlementRow) {
  const grossMicros = Math.max(0, Math.round(Number(row.gross_customer_amount ?? 0)));
  const payableMicros = Math.max(0, Math.round(Number(row.retailer_payable_amount ?? 0)));
  const shippingMicros = Math.min(
    grossMicros,
    Math.max(0, settlementShippingFeeMicros(row))
  );
  const marginMicros = Math.max(0, grossMicros - payableMicros - shippingMicros);

  return {
    grossCustomerAmount: microsToAmount(grossMicros),
    mattanutraMarginAmount: microsToAmount(marginMicros),
    retailerPayableAmount: microsToAmount(payableMicros),
    shippingFeeAmount: microsToAmount(shippingMicros)
  };
}

function mapSettlementRow(row: SettlementRow): AdminRetailFinancialsRow {
  const split = settlementPlatformSplit(row);

  return {
    actualFinanceTransactionId: row.actual_finance_transaction_id,
    confirmedAt: dateIso(row.confirmed_at),
    confirmedReference: row.confirmed_reference,
    createdAt: new Date(row.created_at).toISOString(),
    currency: row.currency,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    grossCustomerAmount: split.grossCustomerAmount,
    id: row.id,
    itemCount: Number(row.item_count ?? 0),
    mattanutraMarginAmount: split.mattanutraMarginAmount,
    nominalFinanceTransactionId: row.nominal_finance_transaction_id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    orderStatus: row.order_status,
    organisationId: row.organisation_id,
    organisationName: row.organisation_name,
    paidAmount: row.paid_amount === null ? null : microsToAmount(row.paid_amount),
    paidAt: dateIso(row.paid_at),
    paidMethod: row.paid_method,
    paidReference: row.paid_reference,
    paymentId: row.payment_id,
    retailerPayableAmount: split.retailerPayableAmount,
    shippingFeeAmount: split.shippingFeeAmount,
    shippedAt: dateIso(row.shipped_at),
    status: settlementStatus(row.status),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export function emptyAdminRetailFinancialsData(
  range: AdminDashboardRange
): AdminRetailFinancialsData {
  return {
    currency: "USD",
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    isPlatformScope: false,
    organisationName: "",
    range,
    rows: [],
    summaries: [],
    summary: emptySummary()
  };
}

export async function retailFinancialTablesAvailable(sql: RetailFinancialsDb) {
  const rows = await sql<Array<{ available: boolean }>>`
    select
      to_regclass('public.finance_accounts') is not null
      and to_regclass('public.organisation_finance_accounts') is not null
      and to_regclass('public.retail_order_settlements') is not null
      and to_regclass('public.retail_customer_orders') is not null
      and to_regclass('public.retail_customer_order_lines') is not null
      as available
  `;

  return Boolean(rows[0]?.available);
}

export async function ensureRetailerSettlementFinanceAccount(
  sql: RetailFinancialsDb,
  organisationId: string
) {
  const existing = await sql<Array<{ finance_account_id: string }>>`
    select finance_account_id::text
    from public.organisation_finance_accounts
    where organisation_id = ${organisationId}::uuid
      and account_role = 'retailer_settlement'
    limit 1
  `;

  if (existing[0]?.finance_account_id) {
    return existing[0].finance_account_id;
  }

  const organisations = await sql<Array<{
    name: string;
    slug: string;
  }>>`
    select name, slug
    from public.organisations
    where id = ${organisationId}::uuid
    limit 1
  `;
  const organisation = organisations[0];

  if (!organisation) {
    throw new Error("Retail organisation was not found");
  }

  const accountName = `Retailer settlement: ${organisation.slug}`;
  const accountRows = await sql<Array<{ id: string }>>`
    insert into public.finance_accounts (
      id,
      name,
      description,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${accountName},
      ${`Settlement payable account for ${organisation.name}.`},
      now(),
      now()
    )
    on conflict (name) do update set
      description = excluded.description,
      updated_at = now()
    returning id::text
  `;
  const accountId = accountRows[0]?.id;

  if (!accountId) {
    throw new Error("Retail finance account could not be created");
  }

  await sql`
    insert into public.organisation_finance_accounts (
      organisation_id,
      account_role,
      finance_account_id,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisationId}::uuid,
      'retailer_settlement',
      ${accountId}::uuid,
      ${sql.json(toJsonValue({ source: "retail_financials" }))}::jsonb,
      now(),
      now()
    )
    on conflict (organisation_id, account_role) do update set
      finance_account_id = excluded.finance_account_id,
      updated_at = now()
  `;

  return accountId;
}

function quoteLineRetailerPayableMicros(line: RetailSettlementQuoteLineInput) {
  const parsedQuantity = Number(line.quantity ?? 1);
  const quantity = Number.isFinite(parsedQuantity)
    ? Math.max(1, Math.round(parsedQuantity))
    : 1;

  // Pharmacy is paid RRP (stored as retailerPayableAmount on quote lines).
  // Number(null) === 0 — only treat real numbers as explicit payable.
  const rawPayable = line.retailerPayableAmount;
  if (typeof rawPayable === "number" && Number.isFinite(rawPayable) && rawPayable > 0) {
    return {
      amount: amountToMicros(rawPayable * quantity),
      missing: false
    };
  }

  // Prefer explicit RRP if present on the line payload.
  const rawRrp = line.rrpPriceAmount;
  if (typeof rawRrp === "number" && Number.isFinite(rawRrp) && rawRrp > 0) {
    return {
      amount: amountToMicros(rawRrp * quantity),
      missing: false
    };
  }

  // Missing RRP: cannot settle cleanly — flag needs_review (do not use customer unit).
  return { amount: 0, missing: true };
}

export async function createPendingRetailOrderSettlement(
  sql: RetailFinancialsDb,
  input: Readonly<{
    checkoutPaymentId: string | null;
    currency: string;
    grossCustomerAmountMicros: number;
    metadata?: Record<string, unknown>;
    orderId: string;
    organisationId: string;
    quoteLines: readonly RetailSettlementQuoteLineInput[];
    /** Processing/shipping fee in micros (platform retained, not retailer payable). */
    shippingAmountMicros?: number | null;
  }>
) {
  if (!(await retailFinancialTablesAvailable(sql))) {
    return null;
  }

  const financeAccountId = await ensureRetailerSettlementFinanceAccount(
    sql,
    input.organisationId
  );
  const payableLines = input.quoteLines.map(quoteLineRetailerPayableMicros);
  const retailerPayableAmount = payableLines.reduce(
    (total, line) => total + line.amount,
    0
  );
  const missingPayableLineCount = payableLines.filter((line) => line.missing).length;
  const initialStatus: RetailSettlementStatus =
    missingPayableLineCount > 0 ? "needs_review" : "pending";
  const reviewReason = missingPayableLineCount > 0
    ? "missing_retailer_payable_price"
    : null;
  const grossCustomerAmount = Math.max(0, Math.round(input.grossCustomerAmountMicros));
  const shippingAmountMicros = Math.max(
    0,
    Math.round(Number(input.shippingAmountMicros) || 0)
  );
  // Platform product margin only — shipping/processing fee is separate.
  const mattanutraMarginAmount = Math.max(
    0,
    grossCustomerAmount - retailerPayableAmount - shippingAmountMicros
  );
  const rows = await sql<Array<{ id: string }>>`
    insert into public.retail_order_settlements (
      organisation_id,
      retail_customer_order_id,
      retail_checkout_payment_id,
      finance_account_id,
      status,
      gross_customer_amount,
      retailer_payable_amount,
      mattanutra_margin_amount,
      amount_unit,
      currency,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${input.organisationId}::uuid,
      ${input.orderId}::uuid,
      ${input.checkoutPaymentId ?? null}::uuid,
      ${financeAccountId}::uuid,
      ${initialStatus},
      ${grossCustomerAmount},
      ${retailerPayableAmount},
      ${mattanutraMarginAmount},
      'micros',
      ${input.currency.trim().toUpperCase()},
      ${sql.json(toJsonValue({
        ...input.metadata,
        accountingBasis: "pending_customer_order_settlement",
        lineCount: input.quoteLines.length,
        missingRetailerPayableCount: missingPayableLineCount,
        reviewReason,
        shippingAmountMicros
      }))}::jsonb,
      now(),
      now()
    )
    on conflict (retail_customer_order_id) do update set
      retail_checkout_payment_id = coalesce(
        public.retail_order_settlements.retail_checkout_payment_id,
        excluded.retail_checkout_payment_id
      ),
      finance_account_id = excluded.finance_account_id,
      -- Re-resolve can clear needs_review once payable prices exist; never demote paid/due/voided.
      status = case
        when public.retail_order_settlements.status in ('paid', 'confirmed', 'due', 'voided')
          then public.retail_order_settlements.status
        else excluded.status
      end,
      gross_customer_amount = excluded.gross_customer_amount,
      retailer_payable_amount = excluded.retailer_payable_amount,
      mattanutra_margin_amount = excluded.mattanutra_margin_amount,
      currency = excluded.currency,
      metadata = public.retail_order_settlements.metadata || excluded.metadata,
      updated_at = now()
    returning id::text
  `;
  const settlementId = rows[0]?.id ?? null;

  if (settlementId) {
    await writeBpmEvent({
      actorType: "system",
      emittedBy: "retail_financials",
      eventName: "retail_settlement_pending_created",
      eventStatus: "pending",
      eventType: "payment",
      properties: {
        checkoutPaymentId: input.checkoutPaymentId,
        orderId: input.orderId,
        organisationId: input.organisationId,
        settlementId
      },
      sql,
      valueAmount: grossCustomerAmount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: input.currency
    });

    await recordAdminAudit({
      action: "admin.retail_settlement_pending_created",
      organisationId: input.organisationId,
      resourceId: settlementId,
      resourceType: "retail_order_settlement",
      metadata: {
        checkoutPaymentId: input.checkoutPaymentId,
        grossCustomerAmount,
        orderId: input.orderId,
        retailerPayableAmount
      }
    });

    if (missingPayableLineCount > 0) {
      await writeBpmEvent({
        actorType: "system",
        emittedBy: "retail_financials",
        eventName: "retail_settlement_needs_review",
        eventStatus: "needs_review",
        eventType: "payment",
        properties: {
          checkoutPaymentId: input.checkoutPaymentId,
          missingRetailerPayableCount: missingPayableLineCount,
          orderId: input.orderId,
          organisationId: input.organisationId,
          reason: reviewReason,
          settlementId
        },
        sql,
        valueAmount: grossCustomerAmount / AMOUNT_MICROS_PER_UNIT,
        valueCurrency: input.currency
      });

      await recordAdminAudit({
        action: "admin.retail_settlement_needs_review",
        organisationId: input.organisationId,
        resourceId: settlementId,
        resourceType: "retail_order_settlement",
        metadata: {
          checkoutPaymentId: input.checkoutPaymentId,
          missingRetailerPayableCount: missingPayableLineCount,
          orderId: input.orderId,
          reason: reviewReason
        }
      });

      const details = await settlementNotificationDetails(sql, settlementId);

      await queuePlatformSettlementNotification({
        amountMicros: retailerPayableAmount,
        currency: input.currency,
        eventKey: "platform_retailer_settlement_needs_review",
        metadata: {
          checkoutPaymentId: input.checkoutPaymentId,
          missingRetailerPayableCount: missingPayableLineCount,
          orderId: input.orderId
        },
        orderNumber: details?.order_number ?? null,
        organisationId: input.organisationId,
        organisationName: details?.organisation_name ?? null,
        reason: reviewReason,
        settlementId
      });

      await queueRetailSettlementNotification({
        amountMicros: retailerPayableAmount,
        currency: input.currency,
        eventKey: "retail_settlement_needs_review",
        metadata: {
          checkoutPaymentId: input.checkoutPaymentId,
          missingRetailerPayableCount: missingPayableLineCount,
          orderId: input.orderId
        },
        orderNumber: details?.order_number ?? null,
        organisationId: input.organisationId,
        reason: reviewReason,
        settlementId
      });
    }
  }

  return settlementId;
}

async function orderSettlementAmounts(
  sql: RetailFinancialsDb,
  orderId: string
) {
  // Gross: pricingSnapshot.totalAmount (customer paid).
  // Payable: RRP from line metadata / sellable RRP (not wholesale).
  // Shipping: pricingSnapshot.shippingAmount (processing fee).
  // Margin: gross − payable − shipping.
  const rows = await sql<Array<RetailOrderAmountRow & {
    shipping_amount: number | string | null;
  }>>`
    select
      retail_customer_orders.organisation_id::text,
      retail_customer_orders.order_number,
      retail_customer_orders.currency,
      coalesce(
        case
          when nullif(retail_customer_orders.metadata #>> '{pricingSnapshot,totalAmount}', '')
            ~ '^[0-9]+(\\.[0-9]+)?$'
            then nullif(
              retail_customer_orders.metadata #>> '{pricingSnapshot,totalAmount}',
              ''
            )::numeric
          else null
        end,
        sum(
          retail_customer_order_lines.quantity_ordered
          * coalesce(retail_customer_order_lines.retail_price_amount, 0)
        ),
        0
      ) as gross_customer_amount,
      coalesce(
        case
          when nullif(retail_customer_orders.metadata #>> '{pricingSnapshot,shippingAmount}', '')
            ~ '^[0-9]+(\\.[0-9]+)?$'
            then nullif(
              retail_customer_orders.metadata #>> '{pricingSnapshot,shippingAmount}',
              ''
            )::numeric
          else null
        end,
        0
      ) as shipping_amount,
      coalesce(sum(
        retail_customer_order_lines.quantity_ordered
        * coalesce(
          case
            when nullif(retail_customer_order_lines.metadata ->> 'rrpPriceAmount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
              then nullif(retail_customer_order_lines.metadata ->> 'rrpPriceAmount', '')::numeric
            when nullif(retail_customer_order_lines.metadata ->> 'retailerPayableAmount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
              then nullif(retail_customer_order_lines.metadata ->> 'retailerPayableAmount', '')::numeric
            else null
          end,
          sellable_rrp.rrp_price_amount,
          0
        )
      ), 0) as retailer_payable_amount,
      count(*) filter (
        where not (
          nullif(retail_customer_order_lines.metadata ->> 'rrpPriceAmount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
          or nullif(retail_customer_order_lines.metadata ->> 'retailerPayableAmount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
          or sellable_rrp.rrp_price_amount is not null
        )
      ) as missing_payable_line_count
    from public.retail_customer_orders
    left join public.retail_customer_order_lines
      on retail_customer_order_lines.customer_order_id = retail_customer_orders.id
    left join lateral (
      select retail_sellable_products.rrp_price_amount
      from public.retail_sellable_products
      where retail_sellable_products.organisation_id = retail_customer_orders.organisation_id
        and retail_sellable_products.product_id = retail_customer_order_lines.product_id
        and retail_sellable_products.status <> 'deleted'
        and retail_sellable_products.rrp_price_amount is not null
        and retail_sellable_products.rrp_price_amount > 0
      order by retail_sellable_products.updated_at desc nulls last
      limit 1
    ) sellable_rrp on true
    where retail_customer_orders.id = ${orderId}::uuid
    group by retail_customer_orders.id
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Customer order was not found");
  }

  const grossCustomerAmount = amountToMicros(Number(row.gross_customer_amount ?? 0));
  const retailerPayableAmount = amountToMicros(Number(row.retailer_payable_amount ?? 0));
  const shippingAmountMicros = amountToMicros(Number(row.shipping_amount ?? 0));

  return {
    currency: row.currency,
    grossCustomerAmount,
    mattanutraMarginAmount: Math.max(
      0,
      grossCustomerAmount - retailerPayableAmount - shippingAmountMicros
    ),
    missingPayableLineCount: Math.max(
      0,
      Math.round(Number(row.missing_payable_line_count ?? 0))
    ),
    orderNumber: row.order_number,
    organisationId: row.organisation_id,
    retailerPayableAmount,
    shippingAmountMicros
  };
}

export async function markRetailOrderSettlementDue(
  sql: RetailFinancialsDb,
  input: Readonly<{
    actorPersonId?: string | null;
    orderId: string;
  }>
) {
  if (!(await retailFinancialTablesAvailable(sql))) {
    return null;
  }

  const amounts = await orderSettlementAmounts(sql, input.orderId);
  const financeAccountId = await ensureRetailerSettlementFinanceAccount(
    sql,
    amounts.organisationId
  );
  const nextStatus: RetailSettlementStatus =
    amounts.missingPayableLineCount > 0 ? "needs_review" : "due";
  const rows = await sql<Array<{
    finance_account_id: string | null;
    id: string;
    nominal_finance_transaction_id: string | null;
    status: string;
  }>>`
    insert into public.retail_order_settlements (
      organisation_id,
      retail_customer_order_id,
      finance_account_id,
      status,
      gross_customer_amount,
      retailer_payable_amount,
      mattanutra_margin_amount,
      amount_unit,
      currency,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${amounts.organisationId}::uuid,
      ${input.orderId}::uuid,
      ${financeAccountId}::uuid,
      ${nextStatus},
      ${amounts.grossCustomerAmount},
      ${amounts.retailerPayableAmount},
      ${amounts.mattanutraMarginAmount},
      'micros',
      ${amounts.currency},
      ${sql.json(toJsonValue({
        accountingBasis: "manual_or_repaired_order_settlement",
        missingRetailerPayableCount: amounts.missingPayableLineCount,
        reviewReason: amounts.missingPayableLineCount > 0
          ? "missing_retailer_payable_price"
          : null,
        shippingAmountMicros: amounts.shippingAmountMicros,
        source: "retail_order_shipped"
      }))}::jsonb,
      now(),
      now()
    )
    on conflict (retail_customer_order_id) do update set
      finance_account_id = coalesce(public.retail_order_settlements.finance_account_id, excluded.finance_account_id),
      metadata = public.retail_order_settlements.metadata || excluded.metadata,
      status = case
        when public.retail_order_settlements.status in ('paid', 'confirmed')
          then public.retail_order_settlements.status
        when public.retail_order_settlements.status in ('pending', 'voided', 'needs_review', 'due')
          then excluded.status
        else public.retail_order_settlements.status
      end,
      -- Refresh zero / pre-paid settlements when recompute finds real amounts.
      gross_customer_amount = case
        when public.retail_order_settlements.status in ('paid', 'confirmed')
          then public.retail_order_settlements.gross_customer_amount
        when public.retail_order_settlements.gross_customer_amount = 0
          or public.retail_order_settlements.status in ('pending', 'voided', 'needs_review', 'due')
          then excluded.gross_customer_amount
        else public.retail_order_settlements.gross_customer_amount
      end,
      retailer_payable_amount = case
        when public.retail_order_settlements.status in ('paid', 'confirmed')
          then public.retail_order_settlements.retailer_payable_amount
        when public.retail_order_settlements.retailer_payable_amount = 0
          or public.retail_order_settlements.status in ('pending', 'voided', 'needs_review', 'due')
          then excluded.retailer_payable_amount
        else public.retail_order_settlements.retailer_payable_amount
      end,
      mattanutra_margin_amount = case
        when public.retail_order_settlements.status in ('paid', 'confirmed')
          then public.retail_order_settlements.mattanutra_margin_amount
        when public.retail_order_settlements.mattanutra_margin_amount = 0
          or public.retail_order_settlements.status in ('pending', 'voided', 'needs_review', 'due')
          then excluded.mattanutra_margin_amount
        else public.retail_order_settlements.mattanutra_margin_amount
      end,
      currency = excluded.currency,
      updated_at = now()
    returning id::text, status, nominal_finance_transaction_id::text, finance_account_id::text
  `;
  const settlement = rows[0] ?? null;

  if (!settlement) {
    return null;
  }

  if (amounts.missingPayableLineCount > 0) {
    await markRetailOrderSettlementNeedsReview(sql, {
      actorPersonId: input.actorPersonId,
      orderId: input.orderId,
      reason: "missing_retailer_payable_price"
    });
    // Continue: still post nominal payout when payable amount is known so
    // the ledger reflects retailer liability even while lines need review.
  }

  if (settlement.nominal_finance_transaction_id) {
    return settlement.id;
  }

  if (amounts.retailerPayableAmount < 1) {
    return settlement.id;
  }

  const fx = await resolveUsdRateForCurrency(amounts.currency, { sql });
  // Single source_ref per settlement: nominal on due, transitions to actual on paid
  // so Nominal|Actual summary switches never double-count the same payout.
  const transactionId = await recordFinanceTransaction({
    amount: amounts.retailerPayableAmount,
    category: "payout",
    currency: amounts.currency,
    description: `Retailer settlement due for order ${amounts.orderNumber}`,
    entryType: "nominal",
    from: "mattanutra:retail-payable",
    fromAccountId: FINANCE_ACCOUNT_IDS.mattanutraRevenue,
    fxRateId: fx.fxRateId,
    metadata: {
      accountingBasis: "retailer_settlement_due",
      orderId: input.orderId,
      orderNumber: amounts.orderNumber,
      organisationId: amounts.organisationId,
      settlementId: settlement.id
    },
    provider: "retail_settlement",
    source: "retail_order_settlement",
    sourceRef: `retail-settlement:${settlement.id}:payout`,
    sql,
    to: `retailer:${amounts.organisationId}:settlement`,
    toAccountId: financeAccountId,
    usdRate: fx.usdRate
  });

  if (transactionId) {
    await sql`
      update public.retail_order_settlements
      set
        nominal_finance_transaction_id = ${transactionId}::uuid,
        updated_at = now()
      where id = ${settlement.id}::uuid
    `;
  }

  await writeBpmEvent({
    actorType: input.actorPersonId ? "admin" : "system",
    emittedBy: "retail_financials",
    eventName: "retail_settlement_due",
    eventStatus: "due",
    eventType: "payment",
    properties: {
      nominalFinanceTransactionId: transactionId,
      orderId: input.orderId,
      organisationId: amounts.organisationId,
      settlementId: settlement.id
    },
    sql,
    valueAmount: amounts.retailerPayableAmount / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: amounts.currency
  });

  await recordAdminAudit({
    action: "admin.retail_settlement_due",
    actorPersonId: input.actorPersonId ?? null,
    organisationId: amounts.organisationId,
    resourceId: settlement.id,
    resourceType: "retail_order_settlement",
    metadata: {
      nominalFinanceTransactionId: transactionId,
      orderId: input.orderId,
      retailerPayableAmount: amounts.retailerPayableAmount
    }
  });

  const details = await settlementNotificationDetails(sql, settlement.id);

  await queuePlatformSettlementNotification({
    amountMicros: amounts.retailerPayableAmount,
    currency: amounts.currency,
    eventKey: "platform_retailer_payout_due",
    metadata: {
      nominalFinanceTransactionId: transactionId,
      orderId: input.orderId
    },
    orderNumber: amounts.orderNumber,
    organisationId: amounts.organisationId,
    organisationName: details?.organisation_name ?? null,
    settlementId: settlement.id
  });

  return settlement.id;
}

export async function markRetailOrderSettlementNeedsReview(
  sql: RetailFinancialsDb,
  input: Readonly<{
    actorPersonId?: string | null;
    orderId: string;
    reason: string;
  }>
) {
  if (!(await retailFinancialTablesAvailable(sql))) {
    return null;
  }

  const rows = await sql<Array<{
    id: string;
    organisation_id: string;
  }>>`
    update public.retail_order_settlements
    set
      status = 'needs_review',
      metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json(toJsonValue({
        reviewReason: input.reason
      }))}::jsonb,
      updated_at = now()
    where retail_customer_order_id = ${input.orderId}::uuid
      and status not in ('voided', 'needs_review')
    returning id::text, organisation_id::text
  `;
  const settlement = rows[0] ?? null;

  if (!settlement) {
    return null;
  }

  await writeBpmEvent({
    actorType: input.actorPersonId ? "admin" : "system",
    emittedBy: "retail_financials",
    eventName: "retail_settlement_needs_review",
    eventStatus: "needs_review",
    eventType: "payment",
    properties: {
      orderId: input.orderId,
      reason: input.reason,
      settlementId: settlement.id
    },
    sql
  });

  await recordAdminAudit({
    action: "admin.retail_settlement_needs_review",
    actorPersonId: input.actorPersonId ?? null,
    organisationId: settlement.organisation_id,
    resourceId: settlement.id,
    resourceType: "retail_order_settlement",
    metadata: {
      orderId: input.orderId,
      reason: input.reason
    }
  });

  const details = await settlementNotificationDetails(sql, settlement.id);

  await queuePlatformSettlementNotification({
    amountMicros: details?.retailer_payable_amount ?? null,
    currency: details?.currency ?? null,
    eventKey: "platform_retailer_settlement_needs_review",
    orderNumber: details?.order_number ?? null,
    organisationId: settlement.organisation_id,
    organisationName: details?.organisation_name ?? null,
    reason: input.reason,
    settlementId: settlement.id
  });

  await queueRetailSettlementNotification({
    amountMicros: details?.retailer_payable_amount ?? null,
    currency: details?.currency ?? null,
    eventKey: "retail_settlement_needs_review",
    orderNumber: details?.order_number ?? null,
    organisationId: settlement.organisation_id,
    reason: input.reason,
    settlementId: settlement.id
  });

  return settlement.id;
}

export async function voidPendingRetailOrderSettlement(
  sql: RetailFinancialsDb,
  input: Readonly<{
    actorPersonId?: string | null;
    orderId: string;
    reason: string;
  }>
) {
  if (!(await retailFinancialTablesAvailable(sql))) {
    return null;
  }

  const rows = await sql<Array<{
    currency: string;
    gross_customer_amount: string | number;
    id: string;
    organisation_id: string;
    refund_finance_transaction_id: string | null;
  }>>`
    update public.retail_order_settlements
    set
      status = 'voided',
      mattanutra_margin_amount = 0,
      metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json(toJsonValue({
        voidReason: input.reason
      }))}::jsonb,
      updated_at = now()
    where retail_customer_order_id = ${input.orderId}::uuid
      and status <> 'voided'
    returning
      id::text,
      organisation_id::text,
      currency,
      gross_customer_amount,
      refund_finance_transaction_id::text
  `;
  const settlement = rows[0] ?? null;

  if (!settlement) {
    const existing = await sql<Array<{ id: string }>>`
      select id::text
      from public.retail_order_settlements
      where retail_customer_order_id = ${input.orderId}::uuid
        and status = 'voided'
      limit 1
    `;
    return existing[0]?.id ?? null;
  }

  if (!settlement.refund_finance_transaction_id) {
    const gross = Math.round(Number(settlement.gross_customer_amount));
    if (gross > 0) {
      const fx = await resolveUsdRateForCurrency(settlement.currency, { sql });
      const transactionId = await recordFinanceTransaction({
        amount: gross,
        category: "refund",
        currency: settlement.currency,
        description: `MCP refund for settlement ${settlement.id}`,
        entryType: "actual",
        from: "mattanutra:retail-revenue",
        fromAccountId: FINANCE_ACCOUNT_IDS.mattanutraRevenue,
        fxRateId: fx.fxRateId,
        metadata: {
          orderId: input.orderId,
          reason: input.reason,
          settlementId: settlement.id
        },
        provider: "mcp_refund",
        source: "retail_order_settlement",
        sourceRef: `retail-settlement:${settlement.id}:refund`,
        sql,
        to: "customer:refund",
        usdRate: fx.usdRate
      });

      if (transactionId) {
        await sql`
          update public.retail_order_settlements
          set refund_finance_transaction_id = ${transactionId}::uuid,
              updated_at = now()
          where id = ${settlement.id}::uuid
        `;
      }
    }
  }

  await writeBpmEvent({
    actorType: input.actorPersonId ? "admin" : "system",
    emittedBy: "retail_financials",
    eventName: "retail_settlement_voided",
    eventStatus: "voided",
    eventType: "payment",
    properties: {
      orderId: input.orderId,
      reason: input.reason,
      settlementId: settlement.id
    },
    sql
  });

  await recordAdminAudit({
    action: "admin.retail_settlement_voided",
    actorPersonId: input.actorPersonId ?? null,
    organisationId: settlement.organisation_id,
    resourceId: settlement.id,
    resourceType: "retail_order_settlement",
    metadata: {
      orderId: input.orderId,
      reason: input.reason
    }
  });

  return settlement.id;
}

async function settlementByIdForContext(
  context: AdminSessionContext,
  settlementId: string
) {
  const sql = getSql();

  if (!sql || !(await retailFinancialTablesAvailable(sql))) {
    throw new Error("Retail financial tables are not available");
  }

  const rows = await sql<Array<{
    currency: string;
    finance_account_id: string | null;
    id: string;
    organisation_id: string;
    retailer_payable_amount: number | string;
    status: string;
  }>>`
    select
      id::text,
      organisation_id::text,
      finance_account_id::text,
      status,
      retailer_payable_amount,
      currency
    from public.retail_order_settlements
    where id = ${settlementId}::uuid
      and (
        ${context.effectiveOrganisation.type === "platform"}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const settlement = rows[0] ?? null;

  if (!settlement) {
    throw new Error("Settlement was not found");
  }

  return { settlement, sql };
}

export async function markRetailSettlementPaid(
  context: AdminSessionContext,
  input: Readonly<{
    paidAmount?: number | null;
    paidAt?: string | null;
    paidMethod?: string | null;
    paidReference?: string | null;
    settlementId: string;
  }>
) {
  if (context.effectiveOrganisation.type !== "platform") {
    throw new Error("Only platform admins can mark retailer payouts paid");
  }

  if (!hasAdminPermission(context, "finance.read")) {
    throw new Error("Finance permission is required");
  }

  const { settlement, sql } = await settlementByIdForContext(
    context,
    input.settlementId
  );
  const paidAmount =
    positiveMicrosFromMajor(input.paidAmount) ??
    Math.max(0, Math.round(Number(settlement.retailer_payable_amount)));
  const financeAccountId =
    settlement.finance_account_id ??
    await ensureRetailerSettlementFinanceAccount(sql, settlement.organisation_id);

  if (paidAmount < 1) {
    throw new Error("Paid amount must be greater than zero");
  }

  const fx = await resolveUsdRateForCurrency(settlement.currency, { sql });
  // Transition the same payout source_ref from nominal → actual (no second row).
  const transactionId = await recordFinanceTransaction({
    amount: paidAmount,
    category: "payout",
    currency: settlement.currency,
    description: "Actual retailer settlement payout",
    entryType: "actual",
    from: "mattanutra:bank",
    fromAccountId: FINANCE_ACCOUNT_IDS.mattanutraBank,
    fxRateId: fx.fxRateId,
    metadata: {
      accountingBasis: "retailer_settlement_paid",
      organisationId: settlement.organisation_id,
      paidMethod: cleanText(input.paidMethod) || null,
      paidReference: cleanText(input.paidReference) || null,
      settlementId: settlement.id
    },
    provider: "manual",
    source: "retail_order_settlement",
    sourceRef: `retail-settlement:${settlement.id}:payout`,
    sql,
    to: `retailer:${settlement.organisation_id}:settlement`,
    toAccountId: financeAccountId,
    usdRate: fx.usdRate
  });

  const rows = await sql<Array<{ id: string }>>`
    update public.retail_order_settlements
    set
      status = 'paid',
      paid_amount = ${paidAmount},
      paid_at = ${input.paidAt ? new Date(input.paidAt) : new Date()},
      paid_method = ${cleanText(input.paidMethod) || null},
      paid_reference = ${cleanText(input.paidReference) || null},
      paid_by_person_id = ${persistedPersonId(context.actorPerson.id)}::uuid,
      actual_finance_transaction_id = ${transactionId ?? null}::uuid,
      nominal_finance_transaction_id = coalesce(
        nominal_finance_transaction_id,
        ${transactionId ?? null}::uuid
      ),
      updated_at = now()
    where id = ${settlement.id}::uuid
      and status in ('due', 'paid', 'needs_review')
    returning id::text
  `;

  if (!rows[0]) {
    throw new Error("Settlement is not payable");
  }

  await writeBpmEvent({
    actorType: "admin",
    emittedBy: "retail_financials",
    eventName: "retail_settlement_payout_paid",
    eventStatus: "paid",
    eventType: "payment",
    properties: {
      actualFinanceTransactionId: transactionId,
      organisationId: settlement.organisation_id,
      settlementId: settlement.id
    },
    sql,
    valueAmount: paidAmount / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: settlement.currency
  });

  await recordAdminAudit({
    action: "admin.retail_settlement_payout_paid",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: settlement.organisation_id,
    resourceId: settlement.id,
    resourceType: "retail_order_settlement",
    metadata: {
      actualFinanceTransactionId: transactionId,
      paidAmount,
      paidMethod: cleanText(input.paidMethod) || null,
      paidReference: cleanText(input.paidReference) || null
    }
  });

  const details = await settlementNotificationDetails(sql, settlement.id);

  await queueRetailSettlementNotification({
    amountMicros: paidAmount,
    currency: settlement.currency,
    eventKey: "retail_settlement_payout_paid",
    metadata: {
      actualFinanceTransactionId: transactionId,
      paidMethod: cleanText(input.paidMethod) || null,
      paidReference: cleanText(input.paidReference) || null
    },
    orderNumber: details?.order_number ?? null,
    organisationId: settlement.organisation_id,
    settlementId: settlement.id
  });

  return settlement.id;
}

export async function confirmRetailSettlementReceived(
  context: AdminSessionContext,
  input: Readonly<{
    confirmedReference?: string | null;
    settlementId: string;
  }>
) {
  if (context.effectiveOrganisation.type !== "tenant") {
    throw new Error("Assume the retailer organisation to confirm receipt");
  }

  if (!hasAdminPermission(context, "finance.read")) {
    throw new Error("Finance permission is required");
  }

  const { settlement, sql } = await settlementByIdForContext(
    context,
    input.settlementId
  );
  const rows = await sql<Array<{ id: string }>>`
    update public.retail_order_settlements
    set
      status = 'confirmed',
      confirmed_at = coalesce(confirmed_at, now()),
      confirmed_reference = ${cleanText(input.confirmedReference) || null},
      confirmed_by_person_id = ${persistedPersonId(context.actorPerson.id)}::uuid,
      updated_at = now()
    where id = ${settlement.id}::uuid
      and status in ('paid', 'confirmed')
    returning id::text
  `;

  if (!rows[0]) {
    throw new Error("Settlement is not awaiting retailer confirmation");
  }

  await writeBpmEvent({
    actorType: "admin",
    emittedBy: "retail_financials",
    eventName: "retail_settlement_payout_confirmed",
    eventStatus: "confirmed",
    eventType: "payment",
    properties: {
      organisationId: settlement.organisation_id,
      settlementId: settlement.id
    },
    sql
  });

  await recordAdminAudit({
    action: "admin.retail_settlement_payout_confirmed",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: settlement.organisation_id,
    resourceId: settlement.id,
    resourceType: "retail_order_settlement",
    metadata: {
      confirmedReference: cleanText(input.confirmedReference) || null
    }
  });

  return settlement.id;
}

export async function markRetailSettlementReview(
  context: AdminSessionContext,
  input: Readonly<{
    reason?: string | null;
    settlementId: string;
  }>
) {
  if (context.effectiveOrganisation.type !== "platform") {
    throw new Error("Only platform admins can mark settlements for review");
  }

  const { settlement, sql } = await settlementByIdForContext(
    context,
    input.settlementId
  );

  await sql`
    update public.retail_order_settlements
    set
      status = 'needs_review',
      metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json(toJsonValue({
        reviewReason: cleanText(input.reason) || "Manual review"
      }))}::jsonb,
      updated_at = now()
    where id = ${settlement.id}::uuid
  `;

  await writeBpmEvent({
    actorType: "admin",
    emittedBy: "retail_financials",
    eventName: "retail_settlement_needs_review",
    eventStatus: "needs_review",
    eventType: "payment",
    properties: {
      organisationId: settlement.organisation_id,
      reason: cleanText(input.reason) || "Manual review",
      settlementId: settlement.id
    },
    sql,
    valueAmount: Number(settlement.retailer_payable_amount) / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: settlement.currency
  });

  await recordAdminAudit({
    action: "admin.retail_settlement_needs_review",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: settlement.organisation_id,
    resourceId: settlement.id,
    resourceType: "retail_order_settlement",
    metadata: {
      reason: cleanText(input.reason) || "Manual review"
    }
  });

  const details = await settlementNotificationDetails(sql, settlement.id);
  const reason = cleanText(input.reason) || "Manual review";

  await queuePlatformSettlementNotification({
    amountMicros: details?.retailer_payable_amount ?? settlement.retailer_payable_amount,
    currency: details?.currency ?? settlement.currency,
    eventKey: "platform_retailer_settlement_needs_review",
    orderNumber: details?.order_number ?? null,
    organisationId: settlement.organisation_id,
    organisationName: details?.organisation_name ?? null,
    reason,
    settlementId: settlement.id
  });

  await queueRetailSettlementNotification({
    amountMicros: details?.retailer_payable_amount ?? settlement.retailer_payable_amount,
    currency: details?.currency ?? settlement.currency,
    eventKey: "retail_settlement_needs_review",
    orderNumber: details?.order_number ?? null,
    organisationId: settlement.organisation_id,
    reason,
    settlementId: settlement.id
  });

  return settlement.id;
}

export async function getAdminRetailFinancialsData(
  context: AdminSessionContext,
  range: AdminDashboardRange
): Promise<AdminRetailFinancialsData> {
  const sql = getSql();

  if (!sql || !(await retailFinancialTablesAvailable(sql))) {
    return emptyAdminRetailFinancialsData(range);
  }

  const start = adminDashboardRangeStart(range);
  const rows = start
    ? await sql<SettlementRow[]>`
        select
          retail_order_settlements.id::text,
          retail_order_settlements.organisation_id::text,
          retail_order_settlements.retail_customer_order_id::text as order_id,
          retail_order_settlements.retail_checkout_payment_id::text as payment_id,
          retail_order_settlements.status,
          retail_order_settlements.currency,
          retail_order_settlements.gross_customer_amount,
          retail_order_settlements.retailer_payable_amount,
          retail_order_settlements.mattanutra_margin_amount,
          retail_order_settlements.paid_amount,
          retail_order_settlements.paid_at,
          retail_order_settlements.paid_method,
          retail_order_settlements.paid_reference,
          retail_order_settlements.confirmed_at,
          retail_order_settlements.confirmed_reference,
          retail_order_settlements.nominal_finance_transaction_id::text,
          retail_order_settlements.actual_finance_transaction_id::text,
          retail_order_settlements.metadata as settlement_metadata,
          retail_order_settlements.created_at,
          retail_order_settlements.updated_at,
          retail_customer_orders.order_number,
          retail_customer_orders.status as order_status,
          retail_customer_orders.customer_name,
          retail_customer_orders.customer_email,
          retail_customer_orders.shipped_at,
          case
            when nullif(retail_customer_orders.metadata #>> '{pricingSnapshot,shippingAmount}', '')
              ~ '^[0-9]+(\\.[0-9]+)?$'
              then nullif(
                retail_customer_orders.metadata #>> '{pricingSnapshot,shippingAmount}',
                ''
              )::numeric
            else null
          end as shipping_fee_amount,
          organisations.name as organisation_name,
          count(retail_customer_order_lines.id)::int as item_count
        from public.retail_order_settlements
        join public.retail_customer_orders
          on retail_customer_orders.id = retail_order_settlements.retail_customer_order_id
        join public.organisations
          on organisations.id = retail_order_settlements.organisation_id
        left join public.retail_customer_order_lines
          on retail_customer_order_lines.customer_order_id = retail_customer_orders.id
        where (
            ${context.effectiveOrganisation.type === "platform"}::boolean
            or retail_order_settlements.organisation_id = ${context.effectiveOrganisation.id}::uuid
          )
          and coalesce(
            retail_order_settlements.confirmed_at,
            retail_order_settlements.paid_at,
            retail_customer_orders.shipped_at,
            retail_order_settlements.updated_at,
            retail_order_settlements.created_at
          ) >= ${start}
        group by
          retail_order_settlements.id,
          retail_customer_orders.id,
          organisations.id
        order by retail_order_settlements.updated_at desc
        limit 5000
      `
    : await sql<SettlementRow[]>`
        select
          retail_order_settlements.id::text,
          retail_order_settlements.organisation_id::text,
          retail_order_settlements.retail_customer_order_id::text as order_id,
          retail_order_settlements.retail_checkout_payment_id::text as payment_id,
          retail_order_settlements.status,
          retail_order_settlements.currency,
          retail_order_settlements.gross_customer_amount,
          retail_order_settlements.retailer_payable_amount,
          retail_order_settlements.mattanutra_margin_amount,
          retail_order_settlements.paid_amount,
          retail_order_settlements.paid_at,
          retail_order_settlements.paid_method,
          retail_order_settlements.paid_reference,
          retail_order_settlements.confirmed_at,
          retail_order_settlements.confirmed_reference,
          retail_order_settlements.nominal_finance_transaction_id::text,
          retail_order_settlements.actual_finance_transaction_id::text,
          retail_order_settlements.metadata as settlement_metadata,
          retail_order_settlements.created_at,
          retail_order_settlements.updated_at,
          retail_customer_orders.order_number,
          retail_customer_orders.status as order_status,
          retail_customer_orders.customer_name,
          retail_customer_orders.customer_email,
          retail_customer_orders.shipped_at,
          case
            when nullif(retail_customer_orders.metadata #>> '{pricingSnapshot,shippingAmount}', '')
              ~ '^[0-9]+(\\.[0-9]+)?$'
              then nullif(
                retail_customer_orders.metadata #>> '{pricingSnapshot,shippingAmount}',
                ''
              )::numeric
            else null
          end as shipping_fee_amount,
          organisations.name as organisation_name,
          count(retail_customer_order_lines.id)::int as item_count
        from public.retail_order_settlements
        join public.retail_customer_orders
          on retail_customer_orders.id = retail_order_settlements.retail_customer_order_id
        join public.organisations
          on organisations.id = retail_order_settlements.organisation_id
        left join public.retail_customer_order_lines
          on retail_customer_order_lines.customer_order_id = retail_customer_orders.id
        where (
            ${context.effectiveOrganisation.type === "platform"}::boolean
            or retail_order_settlements.organisation_id = ${context.effectiveOrganisation.id}::uuid
          )
        group by
          retail_order_settlements.id,
          retail_customer_orders.id,
          organisations.id
        order by retail_order_settlements.updated_at desc
        limit 5000
      `;
  const mapped = rows.map(mapSettlementRow);
  const summary = emptySummary();
  const byOrganisation = new Map<string, {
    actualPayoutAmount: number;
    confirmedAmount: number;
    dueAmount: number;
    grossCustomerAmount: number;
    mattanutraMarginAmount: number;
    needsReviewAmount: number;
    nominalPayoutAmount: number;
    organisationId: string;
    organisationName: string;
    outstandingAmount: number;
    paidAmount: number;
    pendingAmount: number;
    settlementCount: number;
  }>();

  for (const row of mapped) {
    addSummaryAmount(summary, row);

    const organisationSummary = byOrganisation.get(row.organisationId) ?? {
      ...emptySummary(),
      organisationId: row.organisationId,
      organisationName: row.organisationName
    };

    addSummaryAmount(organisationSummary, row);
    byOrganisation.set(row.organisationId, organisationSummary);
  }

  return {
    currency: mapped[0]?.currency ?? context.effectiveOrganisation.currency,
    databaseAvailable: true,
    generatedAt: new Date().toISOString(),
    isPlatformScope: context.effectiveOrganisation.type === "platform",
    organisationName: context.effectiveOrganisation.name,
    range,
    rows: mapped,
    summaries: [...byOrganisation.values()].sort((left, right) =>
      right.outstandingAmount - left.outstandingAmount ||
      left.organisationName.localeCompare(right.organisationName)
    ),
    summary
  };
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);

  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function retailFinancialsCsvStatusLabel(
  status: RetailSettlementStatus,
  locale: Locale,
  isPlatformScope: boolean
) {
  if (!isPlatformScope && status === "paid") {
    return retailFinancialsLabels(locale).received;
  }

  return retailFinancialsStatusLabel(status, locale);
}

export function retailFinancialsCsv(
  data: AdminRetailFinancialsData,
  locale: Locale = "en"
) {
  const labels = retailFinancialsLabels(locale);
  const amountHeader = (label: string) => `${label} (${data.currency})`;
  const header = data.isPlatformScope
    ? [
        labels.organisation,
        labels.orderNumber,
        labels.status,
        labels.orderStatus,
        labels.customer,
        labels.paymentId,
        labels.shippedAt,
        amountHeader(labels.grossCustomerAmount),
        amountHeader(labels.retailerPayableAmount),
        amountHeader(labels.shippingFee),
        amountHeader(labels.mattanutraMarginAmount),
        amountHeader(labels.paidAmount),
        labels.paidAt,
        labels.paidMethod,
        labels.paidReference,
        labels.confirmedAt,
        labels.confirmedReference
      ]
    : [
        labels.orderNumber,
        labels.status,
        labels.orderStatus,
        labels.customer,
        labels.paymentId,
        labels.shippedAt,
        amountHeader(labels.receivable),
        amountHeader(labels.received),
        labels.receivedAt,
        labels.receivedMethod,
        labels.receivedReference,
        labels.confirmedAt,
        labels.confirmedReference
      ];
  const rows = data.rows.map((row) => {
    const base = [
      row.orderNumber,
      retailFinancialsCsvStatusLabel(row.status, locale, data.isPlatformScope),
      row.orderStatus,
      row.customerName ?? row.customerEmail ?? "",
      row.paymentId ?? "",
      row.shippedAt ?? ""
    ];
    const financial = data.isPlatformScope
      ? [
          row.grossCustomerAmount,
          row.retailerPayableAmount,
          row.shippingFeeAmount,
          row.mattanutraMarginAmount
        ]
      : [row.retailerPayableAmount];
    const payment = [
      row.paidAmount ?? "",
      row.paidAt ?? "",
      row.paidMethod ?? "",
      row.paidReference ?? "",
      row.confirmedAt ?? "",
      row.confirmedReference ?? ""
    ];

    return data.isPlatformScope
      ? [
          row.organisationName,
          ...base,
          ...financial,
          ...payment
        ]
      : [...base, ...financial, ...payment];
  });

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
