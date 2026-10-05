import type { AdminCommunicationEventKey } from "@/lib/communications-shared";
import { notificationEnvironmentCode } from "@/lib/admin-notification-environment";

type Metadata = Record<string, unknown>;
export type NotificationSource = "web" | "retail" | "mcp";
export type NotificationLink = { label: string; href: string };
export type AdminNotificationInput = {
  eventKey: AdminCommunicationEventKey;
  metadata?: Metadata;
  resourceType?: string | null;
  resourceId?: string | null;
  body?: string | null;
  subject?: string | null;
};

function text(value: unknown, limit = 100) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}
function object(value: unknown): Metadata {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Metadata : {};
}
export function isPaymentExpiryNotification(eventKey: string, metadata: unknown) {
  return eventKey === "payment_expired" || (eventKey === "platform_payment_failed" && object(metadata).paymentStatus === "expired");
}
function uuid(value: unknown) {
  return typeof value === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value) ? value : null;
}
export function notificationSource(metadata: Metadata): NotificationSource | null {
  // The originating sales channel takes precedence over a later workflow trigger.
  for (const value of [metadata.orderSource, metadata.channel, metadata.source, metadata.sourceSurface]) {
    const source = text(value).toLowerCase();
    if (["web", "retail", "mcp"].includes(source)) return source as NotificationSource;
    if (["pharmacy", "manual"].includes(source)) return "retail";
    if (["agentic", "mcp_web"].includes(source)) return "mcp";
    if (["healthscore", "landing", "retail_checkout_session_api", "plan_checkout_session_api"].includes(source)) return "web";
  }
  return null;
}
function amount(metadata: Metadata) {
  const currency = text(metadata.currency || metadata.settlementCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return "";
  for (const key of ["amountMicros", "paidAmountMicros", "retailerPayableAmountMicros", "totalAmountMicros"] as const) {
    const raw = metadata[key];
    if (!["number", "string"].includes(typeof raw) || raw === "" || (typeof raw === "string" && !raw.trim())) continue;
    const value = Number(raw) / 1_000_000;
    if (Number.isFinite(value) && value >= 0) return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
  }
  return "";
}
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** A short status with actionable commercial facts. Raw diagnostics stay in metadata. */
export function buildAdminNotification(input: AdminNotificationInput) {
  const metadata = input.metadata ?? {};
  const environment = notificationEnvironmentCode(metadata);
  const prefix = environment === "prd" ? "" : `[${environment.toUpperCase()}] `;
  const order = text(metadata.orderNumber) || "Order";
  const paid = ["paid", "bound", "fulfilled"].includes(text(metadata.paymentStatus));
  const backorder = ["awaiting_stock", "backorder"].includes(text(metadata.orderStatus || metadata.status));
  const money = amount(metadata);
  const paymentState = text(metadata.paymentStatus);
  const cancelled = ["cancelled", "canceled"].includes(paymentState);
  const payoutCancelled = ["cancelled", "canceled"].includes(text(metadata.stripePayoutStatus));
  type Copy = { label: string; state: string; view: string };
  const orderCopy = (state: string): Copy => ({ label: order, state, view: "retail-customer-orders" });
  const settlementCopy = (state: string, platform = false): Copy => ({
    label: text(metadata.orderNumber) || "Settlement", state, view: platform ? "settlements" : "retail-financials"
  });
  const copies: Record<AdminCommunicationEventKey, Copy> = {
    admin_test_message: { label: "Test notification", state: "", view: "communications" },
    retail_order_created: orderCopy(`${paid ? "paid" : "created"}${backorder ? " — on backorder" : ""}`),
    retail_order_awaiting_stock: orderCopy("on backorder"),
    retail_order_cancelled: orderCopy("cancelled"),
    retail_order_delivered: orderCopy("delivered"),
    retail_order_pickup_booked: orderCopy("pickup booked"),
    retail_order_ready_to_pack: orderCopy("ready to pack"),
    retail_order_ready_to_ship: orderCopy("ready to ship"),
    retail_order_returned: orderCopy("returned"),
    retail_order_shipment_exception: orderCopy("delivery needs attention"),
    retail_order_shipped: orderCopy("shipped"),
    retail_settlement_needs_review: settlementCopy("payout needs review"),
    retail_settlement_payout_paid: settlementCopy("payout sent"),
    platform_checkout_failed: { label: "Checkout", state: "failed", view: "financials" },
    platform_payment_failed: { label: "Payment", state: paymentState === "expired" ? "expired" : cancelled ? "cancelled" : "failed", view: "financials" },
    platform_payout_failed: { label: "Payout", state: payoutCancelled ? "cancelled" : "failed", view: "financials" },
    platform_revenue_received: { label: paid && money ? money : "Payment", state: paid ? "received" : "needs review", view: "financials" },
    platform_retailer_payout_due: settlementCopy(`payout due${money ? ` (${money})` : ""}`, true),
    platform_retailer_settlement_needs_review: settlementCopy("payout needs review", true),
    platform_carrier_integration_failed: { label: "Carrier update", state: "failed", view: "alerts" },
    platform_communication_failed: { label: "Notification delivery", state: "failed", view: "communications" },
    platform_task_stuck: { label: text(metadata.taskTitle) || "Task", state: "needs attention", view: "visibility" },
    platform_technical_alert: { label: "Platform issue", state: "needs attention", view: "alerts" },
    platform_worker_unavailable: { label: text(metadata.workerName) || "Worker", state: "unavailable", view: "agents" }
  };
  const copy = copies[input.eventKey];
  const locale = ["en", "th", "zh-CN"].includes(text(metadata.locale)) ? text(metadata.locale) : "en";
  const origin = environment === "prd" ? "https://mattanutra.com" : `https://${environment}.mattanutra.com`;
  const url = new URL(`/${locale}/admin/dashboard`, origin);
  url.searchParams.set("view", copy.view);
  url.searchParams.set("range", "all");
  const orderId = uuid(metadata.orderId) || (input.resourceType === "retail_customer_order" ? uuid(input.resourceId) : null);
  if (copy.view === "retail-customer-orders" && orderId) url.searchParams.set("order", orderId);
  const taskId = uuid(metadata.taskId) || (input.resourceType === "task" ? uuid(input.resourceId) : null);
  if (copy.view === "visibility" && taskId) url.searchParams.set("task", taskId);
  const link = { label: "Open in admin", href: url.href };
  const ending = `${copy.state ? ` ${copy.state}` : ""}.`;
  const title = `${prefix}${copy.label}${ending}`;
  const source = notificationSource(metadata);
  const details: string[] = [];
  if (text(metadata.orderNumber) && copy.label !== text(metadata.orderNumber)) details.push(`Order: ${text(metadata.orderNumber)}`);
  if (money && !title.includes(money)) details.push(`${copy.view === "retail-customer-orders" ? metadata.amountIsSubtotal === true ? "Products subtotal" : "Order total" : "Amount"}: ${money}`);
  const offer = text(metadata.selectedPlan);
  if (source) details.push(`Flow: ${{ web: "Web", retail: "Retail", mcp: "MCP" }[source]}${["precision", "pro"].includes(offer) ? ` · ${offer === "pro" ? "Pro" : "Precision"}` : ""}`);
  if (copy.view === "retail-customer-orders") {
    const paymentLabels: Record<string, string> = { paid: "Paid", bound: "Paid", fulfilled: "Paid", unpaid: "Unpaid", processing: "Processing", failed: "Failed", expired: "Expired", refunded: "Refunded", partially_refunded: "Partially refunded", cancelled: "Cancelled", canceled: "Cancelled" };
    if (paymentLabels[paymentState]) details.push(`Payment: ${paymentLabels[paymentState]}${paymentState === "unpaid" && metadata.paymentMethod === "pay_at_till" ? " — pay at checkout" : ""}`);
  }
  const paymentId = uuid(metadata.paymentId) || uuid(metadata.checkoutPaymentId)
    || (["payment", "retail_checkout_payment"].includes(input.resourceType ?? "") ? uuid(input.resourceId) : null);
  const settlementId = uuid(metadata.settlementId) || (input.resourceType === "retail_order_settlement" ? uuid(input.resourceId) : null);
  const reference = settlementId || paymentId || taskId || (!text(metadata.orderNumber) ? orderId : null) || (!orderId ? uuid(input.resourceId) : null);
  if (reference) details.push(`${settlementId ? "Settlement" : paymentId ? "Payment reference" : taskId ? "Task reference" : "Reference"}: ${reference}`);
  if (input.eventKey === "platform_payout_failed" && /^po_[a-zA-Z0-9]+$/.test(text(metadata.stripePayoutId))) details.push(`Payout reference: ${text(metadata.stripePayoutId)}`);
  if (input.eventKey === "platform_communication_failed" && ["email", "line"].includes(text(metadata.channelType))) details.push(`Channel: ${text(metadata.channelType) === "line" ? "LINE" : "Email"}`);
  const body = [title, ...details, `${link.label}: ${link.href}`].join("\n");
  const storedMetadata = { ...metadata };
  delete storedMetadata.source;
  return {
    body,
    subject: `${title.slice(0, -1)}${source ? ` · ${{ web: "Web", retail: "Retail", mcp: "MCP" }[source]}` : ""}`,
    html: `<!doctype html><html><body><p><strong>${escapeHtml(title)}</strong></p>${details.length ? `<p>${details.map(escapeHtml).join("<br>")}</p>` : ""}<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p></body></html>`,
    metadata: { ...storedMetadata, ...(source ? { source } : {}), notification: { version: 2, ...link, title, details } }
  };
}

/** Customer conversations keep their text transport; queued version-one cards remain readable. */
export function adminNotificationLineMessage(body: string, metadata: unknown) {
  const link = object(object(metadata).notification);
  if ((link.version !== 1 && link.version !== 2) || typeof link.label !== "string" || typeof link.href !== "string") return null;
  let url: URL;
  try { url = new URL(link.href); } catch { return null; }
  if (url.protocol !== "https:" || !["mattanutra.com", "dev.mattanutra.com", "uat.mattanutra.com"].includes(url.host)
    || !/^\/(en|th|zh-CN)\/admin\/dashboard$/.test(url.pathname) || url.username || url.password || url.searchParams.has("access_token")) return null;
  if (link.version === 2) {
    if (typeof link.title !== "string" || !link.title || !Array.isArray(link.details) || link.details.length > 8
      || !link.details.every(value => typeof value === "string" && value.length <= 250)) return null;
    return {
      type: "flex", altText: body.slice(0, 400),
      contents: { type: "bubble", body: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: link.title, weight: "bold", wrap: true },
        ...link.details.map(detail => ({ type: "text", text: detail as string, size: "sm", color: "#4B5563", wrap: true }))
      ] }, footer: { type: "box", layout: "vertical", contents: [
        { type: "button", style: "link", color: "#126B4F", action: { type: "uri", label: link.label, uri: url.href } }
      ] } }
    };
  }
  const index = body.indexOf(link.label);
  if (index < 0 || !link.label) return null;
  const before = body.slice(0, index), after = body.slice(index + link.label.length);
  return {
    type: "flex", altText: body.slice(0, 400),
    contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [{
      type: "text", wrap: true, action: { type: "uri", uri: url.href },
      contents: [
        ...(before ? [{ type: "span", text: before }] : []),
        { type: "span", text: link.label, color: "#126B4F", decoration: "underline" },
        ...(after ? [{ type: "span", text: after }] : [])
      ]
    }] } }
  };
}
