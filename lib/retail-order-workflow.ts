import type postgres from "postgres";
import { writeBpmEvent } from "@/lib/bpm";
import { formatCurrencyAmount } from "@/lib/currencies";
import { writeFulfillmentBpmEvent } from "@/lib/fulfillment-bpm";
import { isLocale, type Locale } from "@/lib/i18n";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import { siteBaseUrl } from "@/lib/site-url";
import { createTask } from "@/lib/task-service";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";

export type RetailOrderWorkflowDb = postgres.Sql | postgres.TransactionSql;

export type RetailOrderWorkflowStatus =
  | "allocated"
  | "awaiting_stock"
  | "cancelled"
  | "delivered"
  | "draft"
  | "packed"
  | "picking"
  | "placed"
  | "returned"
  | "shipped";

export type RetailOrderWorkflowAction =
  | "cancel"
  | "mark_delivered"
  | "mark_packed"
  | "mark_picking"
  | "mark_shipped"
  | "return";

export type RetailOrderWorkflowEmailEvent =
  | "awaiting_stock"
  | "cancelled"
  | "confirmed"
  | "delivered"
  | "returned"
  | "shipped";

export type RetailOrderWorkflowTaskType =
  | "retail_order_cancel_review"
  | "retail_order_delivery_confirm"
  | "retail_order_pack"
  | "retail_order_pick"
  | "retail_order_return_review"
  | "retail_order_ship";

const RETAIL_ORDER_EMAIL_TASK_PRIORITY = 220;

export type RetailOrderWorkflowTransition = Readonly<{
  bpmEventName: string;
  customerEmailEvent: RetailOrderWorkflowEmailEvent | null;
  nextStatus: RetailOrderWorkflowStatus;
  nextTask: Readonly<{
    reason: string;
    score: number;
    taskType: RetailOrderWorkflowTaskType;
    title: string;
  }> | null;
  requiredTaskTypes: readonly RetailOrderWorkflowTaskType[];
}>;

export const retailOrderWorkflowTransitions = {
  cancel: {
    bpmEventName: "retail_order_cancelled",
    customerEmailEvent: "cancelled",
    nextStatus: "cancelled",
    nextTask: null,
    requiredTaskTypes: ["retail_order_cancel_review"]
  },
  mark_delivered: {
    bpmEventName: "retail_order_delivered",
    customerEmailEvent: "delivered",
    nextStatus: "delivered",
    nextTask: null,
    requiredTaskTypes: ["retail_order_delivery_confirm"]
  },
  mark_packed: {
    bpmEventName: "retail_order_packed",
    customerEmailEvent: null,
    nextStatus: "packed",
    nextTask: {
      reason: "Packed order is ready to ship.",
      score: 720,
      taskType: "retail_order_ship",
      title: "Ship customer order"
    },
    requiredTaskTypes: ["retail_order_pack"]
  },
  mark_picking: {
    bpmEventName: "retail_order_picking",
    customerEmailEvent: null,
    nextStatus: "picking",
    nextTask: {
      reason: "Picked order is ready to pack.",
      score: 640,
      taskType: "retail_order_pack",
      title: "Pack customer order"
    },
    requiredTaskTypes: ["retail_order_pick"]
  },
  mark_shipped: {
    bpmEventName: "retail_order_shipped",
    customerEmailEvent: "shipped",
    nextStatus: "shipped",
    nextTask: {
      reason: "Shipped order is awaiting delivery confirmation.",
      score: 360,
      taskType: "retail_order_delivery_confirm",
      title: "Confirm customer delivery"
    },
    requiredTaskTypes: ["retail_order_ship"]
  },
  return: {
    bpmEventName: "retail_order_returned",
    customerEmailEvent: "returned",
    nextStatus: "returned",
    nextTask: null,
    requiredTaskTypes: ["retail_order_return_review"]
  }
} satisfies Record<RetailOrderWorkflowAction, RetailOrderWorkflowTransition>;

export const retailOrderStatusBpmEventNames = {
  allocated: "retail_order_allocated",
  awaiting_stock: "retail_order_awaiting_stock",
  cancelled: "retail_order_cancelled",
  delivered: "retail_order_delivered",
  draft: "retail_order_created",
  packed: "retail_order_packed",
  picking: "retail_order_picking",
  placed: "retail_order_created",
  returned: "retail_order_returned",
  shipped: "retail_order_shipped"
} satisfies Record<RetailOrderWorkflowStatus, string>;

const emailCopy = {
  awaiting_stock: {
    eyebrow: "Order processing",
    headline: "Your order is being processed",
    intro:
      "Your order is confirmed. Dream Pharmacy is preparing and sourcing your selected products, and your tracking page will update as the order moves forward.",
    subject: "Your Dream Pharmacy order is processing"
  },
  cancelled: {
    eyebrow: "Order cancelled",
    headline: "Your order has been cancelled",
    intro:
      "Your Dream Pharmacy order has been cancelled. The tracking page will show the latest status and any follow-up notes as they are added.",
    subject: "Your Dream Pharmacy order has been cancelled"
  },
  confirmed: {
    eyebrow: "Order confirmed",
    headline: "Your Dream Pharmacy order is confirmed",
    intro:
      "Thank you for trusting MattaNutra. Your selected products have been sent to one pharmacy, and we will keep this tracking page updated as the order moves forward.",
    subject: "Your Dream Pharmacy order is confirmed"
  },
  delivered: {
    eyebrow: "Delivered",
    headline: "Your order has been delivered",
    intro:
      "Your Dream Pharmacy order is marked as delivered. Thank you for choosing MattaNutra.",
    subject: "Your Dream Pharmacy order has been delivered"
  },
  returned: {
    eyebrow: "Returned",
    headline: "Your order has been marked returned",
    intro:
      "Your Dream Pharmacy order has been marked as returned. The tracking page will show the latest status and any follow-up notes as they are added.",
    subject: "Your Dream Pharmacy order has been returned"
  },
  shipped: {
    eyebrow: "Shipped",
    headline: "Your order is on the way",
    intro:
      "Dream Pharmacy has shipped your products. Keep the tracking page handy for delivery updates.",
    subject: "Your Dream Pharmacy order has shipped"
  }
} satisfies Record<
  RetailOrderWorkflowEmailEvent,
  Readonly<{
    eyebrow: string;
    headline: string;
    intro: string;
    subject: string;
  }>
>;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function customerOrderStatusLabel(status: string) {
  if (status === "awaiting_stock") {
    return "Order processing";
  }

  return status.replace(/_/g, " ");
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toJsonValue(value: unknown): postgres.JSONValue {
  const serialized = JSON.stringify(value ?? {});

  return JSON.parse(serialized === undefined ? "{}" : serialized) as postgres.JSONValue;
}

function normalizedLocale(locale: unknown): Locale {
  return isLocale(locale) ? locale : "en";
}

function trackingUrl(locale: Locale, orderNumber: string) {
  return `${siteBaseUrl()}/${locale}/order/track/${encodeURIComponent(orderNumber)}`;
}

function emailRecordForEvent(
  event: RetailOrderWorkflowEmailEvent,
  value: unknown
) {
  const emails = objectValue(objectValue(value).orderWorkflowEmails);

  return objectValue(emails[event]);
}

function formatAmount(amount: number, currency: string) {
  return formatCurrencyAmount("en", amount, currency);
}

function addressLinesForOrder(
  order: Readonly<{ customerName: string | null; metadata: unknown }>
) {
  const metadata = objectValue(order.metadata);
  const address = objectValue(metadata.shippingAddress);
  const deliveryName =
    cleanText(address.customerName) || cleanText(order.customerName);
  const cityLine = [
    address.city,
    address.province,
    address.postalCode
  ].map(cleanText).filter(Boolean).join(", ");

  return [
    deliveryName,
    cleanText(address.addressLine1),
    cleanText(address.addressLine2),
    cityLine,
    cleanText(address.country)
  ].filter(Boolean);
}

function lineCurrency(
  line: Readonly<{ metadata: unknown; orderCurrency: string | null }>
) {
  return cleanText(objectValue(line.metadata).currency) || line.orderCurrency || "THB";
}

function shipmentDetailsFromMetadata(value: unknown) {
  const shipment = objectValue(objectValue(value).shipment);
  const carrierName = cleanText(shipment.carrierName);
  const trackingNumber = cleanText(shipment.trackingNumber);
  const trackingUrl = cleanText(shipment.trackingUrl);

  return carrierName || trackingNumber || trackingUrl
    ? {
        carrierName: carrierName || null,
        trackingNumber: trackingNumber || null,
        trackingUrl: trackingUrl || null
      }
    : null;
}

function buildOrderWorkflowEmailHtml(input: Readonly<{
  addressLines: readonly string[];
  copy: (typeof emailCopy)[RetailOrderWorkflowEmailEvent];
  lines: readonly Readonly<{
    brandName: string | null;
    currency: string;
    etaDate: string | null;
    productTitle: string;
    quantity: number;
    unitPriceAmount: number | null;
  }>[];
  orderNumber: string;
  retailerName: string | null;
  shipment: ReturnType<typeof shipmentDetailsFromMetadata>;
  status: string;
  totalAmount: number;
  totalCurrency: string;
  trackingUrl: string;
}>) {
  const lineItems = input.lines
    .map((line) => {
      const label = [line.brandName, line.productTitle].map(cleanText).filter(Boolean).join(" ");
      const quantity = Math.max(0, Math.round(Number(line.quantity) || 0));
      const lineTotal =
        line.unitPriceAmount === null
          ? null
          : formatAmount(line.unitPriceAmount * quantity, line.currency);

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
            <strong>${escapeHtml(label || line.productTitle)}</strong><br>
            <span style="color:#64748b;">Qty ${escapeHtml(quantity)}${
              line.etaDate ? ` · ETA ${escapeHtml(line.etaDate)}` : ""
            }</span>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;">
            ${lineTotal ? escapeHtml(lineTotal) : ""}
          </td>
        </tr>
      `;
    })
    .join("");
  const shipmentBlock = input.shipment
    ? `
      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:20px;">
        <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;">Shipment</p>
        ${
          input.shipment.carrierName
            ? `<p style="margin:2px 0;">Carrier: ${escapeHtml(input.shipment.carrierName)}</p>`
            : ""
        }
        ${
          input.shipment.trackingNumber
            ? `<p style="margin:2px 0;">Tracking number: ${escapeHtml(input.shipment.trackingNumber)}</p>`
            : ""
        }
        ${
          input.shipment.trackingUrl
            ? `<p style="margin:14px 0 0;"><a href="${escapeHtml(input.shipment.trackingUrl)}" style="color:#0f766e;font-weight:700;">Track shipment</a></p>`
            : ""
        }
      </div>
    `
    : "";

  return `
    <div style="margin:0 auto;max-width:640px;padding:32px 20px;font-family:Arial,sans-serif;color:#173532;">
      <p style="margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">
        ${escapeHtml(input.copy.eyebrow)}
      </p>
      <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:34px;font-weight:500;">
        ${escapeHtml(input.copy.headline)}
      </h1>
      <p style="margin:0 0 24px;color:#475569;line-height:1.6;">
        ${escapeHtml(input.copy.intro)}
      </p>
      <p style="margin:0 0 28px;">
        <a href="${escapeHtml(input.trackingUrl)}" style="display:inline-block;border-radius:999px;background:#0f766e;color:#fff;padding:13px 20px;text-decoration:none;font-weight:700;">
          Track your order
        </a>
      </p>
      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:20px;">
        <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;">Order</p>
        <p style="margin:0 0 4px;font-family:monospace;">${escapeHtml(input.orderNumber)}</p>
        <p style="margin:0;color:#64748b;">${escapeHtml(input.status)}${
          input.retailerName ? ` · ${escapeHtml(input.retailerName)}` : ""
        }</p>
      </div>
      ${shipmentBlock}
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tbody>
          ${lineItems}
          <tr>
            <td style="padding:16px 0;font-weight:700;">Total</td>
            <td style="padding:16px 0;text-align:right;font-weight:700;">${escapeHtml(
              formatAmount(input.totalAmount, input.totalCurrency)
            )}</td>
          </tr>
        </tbody>
      </table>
      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:20px;">
        <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;">Delivery address</p>
        ${input.addressLines
          .map((line) => `<p style="margin:2px 0;">${escapeHtml(line)}</p>`)
          .join("")}
      </div>
      <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
        Bookmark the tracking page so you can return to it quickly. If you have questions, reply to this email.
      </p>
    </div>
  `;
}

export function transitionRetailCustomerOrder(
  action: RetailOrderWorkflowAction
): RetailOrderWorkflowTransition {
  return retailOrderWorkflowTransitions[action];
}

export function retailOrderStatusBpmEventName(status: RetailOrderWorkflowStatus) {
  return retailOrderStatusBpmEventNames[status];
}

export async function recordRetailOrderWorkflowBpm(
  sql: RetailOrderWorkflowDb,
  input: Readonly<{
    actorPersonId?: string | null;
    assumedPersonId?: string | null;
    eventName: string;
    eventStatus: string;
    locale?: unknown;
    metadata?: Record<string, unknown>;
    orderId: string;
    organisationId?: string | null;
    paymentId?: string | null;
    planId?: string | null;
  }>
) {
  await writeFulfillmentBpmEvent({
    eventName: input.eventName,
    eventStatus: input.eventStatus,
    fulfillmentOrderId: input.orderId,
    locale: normalizedLocale(input.locale),
    paymentId: input.paymentId ?? null,
    planId: input.planId ?? null,
    properties: {
      actorPersonId: input.actorPersonId ?? null,
      assumedPersonId: input.assumedPersonId ?? null,
      organisationId: input.organisationId ?? null,
      ...input.metadata
    },
    sql
  });
}

async function recordOrderWorkflowEmailBpm(input: Readonly<{
  event: RetailOrderWorkflowEmailEvent;
  locale: Locale;
  orderId: string;
  orderNumber: string;
  paymentId?: string | null;
  planId?: string | null;
  reason?: string | null;
  sent: boolean;
  sql: RetailOrderWorkflowDb;
}>) {
  await writeBpmEvent({
    actorType: "system",
    emittedBy: "retail_order_workflow",
    eventName: input.sent
      ? `retail_order_${input.event}_email_sent`
      : `retail_order_${input.event}_email_skipped`,
    eventStatus: input.sent ? "sent" : "skipped",
    eventType: "email",
    locale: input.locale,
    planId: input.planId ?? null,
    properties: {
      orderEmailEvent: input.event,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      paymentId: input.paymentId ?? null,
      reason: input.reason ?? null
    },
    sql: input.sql
  });
}

export async function queueRetailOrderWorkflowEmail(input: Readonly<{
  event: RetailOrderWorkflowEmailEvent;
  locale?: unknown;
  orderId: string;
  paymentId?: string | null;
  planId?: string | null;
  sql: RetailOrderWorkflowDb;
}>) {
  const locale = normalizedLocale(input.locale);
  const { created, task } = await createTask({
    actorType: "system",
    businessValue: RETAIL_ORDER_EMAIL_TASK_PRIORITY,
    description:
      "Send a customer-visible retail order email through the platform email dispatcher.",
    groupLabel: "Retail order email",
    idempotencyKey: `retail-order-email:${input.orderId}:${input.event}`,
    idempotencyScope: "active",
    idempotencyScopeKey: `retail-order-email:${input.orderId}`,
    maxAttempts: 2,
    payload: {
      event: input.event,
      locale,
      orderId: input.orderId,
      paymentId: input.paymentId ?? null,
      planId: input.planId ?? null
    },
    planId: input.planId ?? null,
    priorityReason:
      "Customer order email is queued for the platform email dispatcher.",
    priorityScore: RETAIL_ORDER_EMAIL_TASK_PRIORITY,
    reasoningEffort: "none",
    requiredCapabilities: [AGENT_CAPABILITIES.emailSend],
    sourceEntityId: input.orderId,
    sourceEntityType: "retail_customer_order",
    taskType: "send_retail_order_workflow_email",
    title: `Send retail order ${input.event} email`
  });

  await writeBpmEvent({
    actorType: "system",
    emittedBy: "retail_order_workflow",
    eventName: created
      ? "retail_order_email_task_queued"
      : "retail_order_email_task_reused",
    eventStatus: created ? "queued" : "duplicate_reused",
    eventType: "email",
    locale,
    planId: input.planId ?? null,
    properties: {
      orderEmailEvent: input.event,
      orderId: input.orderId,
      paymentId: input.paymentId ?? null,
      priorityScore: RETAIL_ORDER_EMAIL_TASK_PRIORITY,
      taskId: task.id,
      taskType: task.taskType
    },
    severity: "low"
  });

  return {
    reason: created ? "queued" : "already_queued",
    sent: false,
    taskId: task.id
  };
}

export async function sendRetailOrderWorkflowEmailNow(input: Readonly<{
  event: RetailOrderWorkflowEmailEvent;
  locale?: unknown;
  orderId: string;
  paymentId?: string | null;
  planId?: string | null;
  sql: RetailOrderWorkflowDb;
}>) {
  const orderRows = await input.sql<Array<{
    currency: string;
    customer_email: string | null;
    customer_name: string | null;
    id: string;
    metadata: unknown;
    order_number: string;
    organisation_id: string;
    organisation_name: string | null;
    status: string;
  }>>`
    select
      retail_customer_orders.id::text,
      retail_customer_orders.organisation_id::text,
      organisations.name as organisation_name,
      retail_customer_orders.order_number,
      retail_customer_orders.customer_name,
      retail_customer_orders.customer_email,
      retail_customer_orders.status,
      retail_customer_orders.currency,
      retail_customer_orders.metadata
    from public.retail_customer_orders
    left join public.organisations
      on organisations.id = retail_customer_orders.organisation_id
    where retail_customer_orders.id = ${input.orderId}::uuid
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    return { reason: "order_not_found", sent: false };
  }

  const locale = normalizedLocale(input.locale);
  const existing = emailRecordForEvent(input.event, order.metadata);

  if (existing.sent === true) {
    return { reason: "already_sent", sent: true };
  }

  const email = cleanText(order.customer_email).toLowerCase();
  const url = trackingUrl(locale, order.order_number);
  const emailBaseRecord = {
    attemptedAt: new Date().toISOString(),
    event: input.event,
    trackingReference: order.order_number,
    trackingUrl: url
  };

  if (!email) {
    const record = {
      ...emailBaseRecord,
      reason: "customer_email_missing",
      sent: false
    };

    await input.sql`
      update public.retail_customer_orders
      set metadata = jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          array['orderWorkflowEmails', ${input.event}]::text[],
          ${input.sql.json(toJsonValue(record))}::jsonb,
          true
        ),
        updated_at = now()
      where id = ${order.id}::uuid
    `;
    await recordOrderWorkflowEmailBpm({
      event: input.event,
      locale,
      orderId: order.id,
      orderNumber: order.order_number,
      paymentId: input.paymentId ?? null,
      planId: input.planId ?? null,
      reason: "customer_email_missing",
      sent: false,
      sql: input.sql
    });

    return { reason: "customer_email_missing", sent: false };
  }

  const lineRows = await input.sql<Array<{
    brand_name: string | null;
    metadata: unknown;
    product_title: string;
    quantity_ordered: number | string;
    retail_price_amount: number | string | null;
  }>>`
    select
      products.brand_name,
      products.title as product_title,
      retail_customer_order_lines.quantity_ordered,
      retail_customer_order_lines.retail_price_amount,
      retail_customer_order_lines.metadata
    from public.retail_customer_order_lines
    join public.products
      on products.id = retail_customer_order_lines.product_id
    where retail_customer_order_lines.customer_order_id = ${order.id}::uuid
    order by lower(coalesce(products.brand_name, '')), lower(products.title)
  `;
  const lines = lineRows.map((line) => {
    const metadata = objectValue(line.metadata);

    return {
      brandName: line.brand_name,
      currency: lineCurrency({
        metadata: line.metadata,
        orderCurrency: order.currency
      }),
      etaDate: cleanText(metadata.etaDate) || null,
      productTitle: line.product_title,
      quantity: Math.max(0, Math.round(Number(line.quantity_ordered) || 0)),
      unitPriceAmount: numberOrNull(line.retail_price_amount)
    };
  });
  const metadata = objectValue(order.metadata);
  const pricingSnapshot = objectValue(metadata.pricingSnapshot);
  const shipment = shipmentDetailsFromMetadata(order.metadata);
  const totalAmount =
    numberOrNull(pricingSnapshot.totalAmount) ??
    lines.reduce(
      (total, line) =>
        total + (line.unitPriceAmount ?? 0) * Math.max(0, line.quantity),
      0
    );
  const totalCurrency =
    cleanText(pricingSnapshot.currency) || cleanText(order.currency) || "THB";
  const copy = emailCopy[input.event];
  let delivery: { messageId?: string; reason?: string; sent: boolean };

  try {
    delivery = await sendTransactionalEmail({
      html: buildOrderWorkflowEmailHtml({
        addressLines: addressLinesForOrder({
          customerName: order.customer_name,
          metadata: order.metadata
        }),
        copy,
        lines,
        orderNumber: order.order_number,
        retailerName: order.organisation_name,
        shipment: input.event === "shipped" ? shipment : null,
        status: customerOrderStatusLabel(order.status),
        totalAmount,
        totalCurrency,
        trackingUrl: url
      }),
      subject: copy.subject,
      to: email
    });
  } catch (error) {
    delivery = {
      reason: error instanceof Error ? error.message : "email_send_failed",
      sent: false
    };
  }

  const record = {
    ...emailBaseRecord,
    messageId: delivery.messageId ?? null,
    reason: delivery.reason ?? null,
    sent: delivery.sent,
    sentAt: delivery.sent ? new Date().toISOString() : null
  };

  await input.sql`
    update public.retail_customer_orders
    set metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        array['orderWorkflowEmails', ${input.event}]::text[],
        ${input.sql.json(toJsonValue(record))}::jsonb,
        true
      ),
      updated_at = now()
    where id = ${order.id}::uuid
  `;

  if (input.paymentId) {
    await input.sql`
      update public.retail_checkout_payments
      set metadata = jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          array['orderWorkflowEmails', ${input.event}]::text[],
          ${input.sql.json(toJsonValue(record))}::jsonb,
          true
        ),
        updated_at = now()
      where id = ${input.paymentId}::uuid
    `;
  }

  await recordOrderWorkflowEmailBpm({
    event: input.event,
    locale,
    orderId: order.id,
    orderNumber: order.order_number,
    paymentId: input.paymentId ?? null,
    planId: input.planId ?? null,
    reason: delivery.reason ?? null,
    sent: delivery.sent,
    sql: input.sql
  });

  return delivery;
}

export const sendRetailOrderWorkflowEmail = queueRetailOrderWorkflowEmail;
