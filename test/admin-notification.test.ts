import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { adminNotificationLineMessage, buildAdminNotification, notificationSource } from "../lib/admin-notification.ts";
import { adminCommunicationEventKeys } from "../lib/communications-shared.ts";
import { adminViewAllowed, permissionsForRole } from "../lib/admin-rbac.ts";
import type { AdminDashboardView } from "../components/admin/dashboard-content.tsx";

const orderId = "b52ba237-0a2e-4ffb-ac84-a72868504a25", paymentId = "af8c28db-4b71-4a9b-95e8-b9f1c838cda7";
const originalEnvironment = process.env.MATTANUTRA_ENV;
before(() => { process.env.MATTANUTRA_ENV = "prd"; });
after(() => { if (originalEnvironment === undefined) delete process.env.MATTANUTRA_ENV; else process.env.MATTANUTRA_ENV = originalEnvironment; });
const headline = (copy: ReturnType<typeof buildAdminNotification>) => copy.body.split("\n")[0];
function order(paymentStatus: string, orderStatus = "placed") {
  return buildAdminNotification({ eventKey: "retail_order_created", resourceId: orderId, resourceType: "retail_customer_order",
    metadata: { orderNumber: "PH-B52BA237", orderStatus, paymentStatus, orderSource: "pharmacy", amountMicros: 1_250_500_000, currency: "THB", paymentMethod: "pay_at_till", customerName: "Private customer" },
    subject: "New paid order", body: "This must not override the verified payment state." });
}

describe("informative admin notifications", () => {
  it("shows order value, Retail flow, unpaid till status and an explicit admin link", () => {
    const copy = order("unpaid");
    assert.equal(headline(copy), "PH-B52BA237 created.");
    assert.match(copy.body, /Order total: 1,250\.5 THB\nFlow: Retail\nPayment: Unpaid — pay at till/);
    assert.ok(copy.body.includes(`Open in admin: ${copy.metadata.notification.href}`));
    assert.equal(new URL(copy.metadata.notification.href).searchParams.get("order"), orderId);
    assert.match(copy.html, />Open in admin<\/a>/);assert.match(copy.html, /Order total: 1,250\.5 THB/);
    assert.doesNotMatch(copy.body + copy.html, /Private customer|must not override|paid and created/);
    assert.equal(copy.metadata.source, "retail");
  });
  it("describes only confirmed payments as paid", () => {
    for (const status of ["unpaid", "unknown", "placed", "allocated", "picking", "packed", "shipped", "failed", "refunded"])
      assert.equal(headline(order(status)), "PH-B52BA237 created.", status);
    for (const status of ["paid", "bound", "fulfilled"]) assert.equal(headline(order(status)), "PH-B52BA237 paid.");
    assert.equal(headline(order("unpaid", "awaiting_stock")), "PH-B52BA237 created — on backorder.");
    assert.equal(headline(order("paid", "awaiting_stock")), "PH-B52BA237 paid — on backorder.");
  });
  it("includes the full payment reference, flow and offer without duplicating the amount", () => {
    const copy = buildAdminNotification({ eventKey: "platform_revenue_received", resourceType: "payment", resourceId: paymentId,
      metadata: { paymentStatus: "bound", amountMicros: "690000000", currency: "THB", sourceSurface: "healthscore", selectedPlan: "precision" } });
    assert.equal(headline(copy), "690 THB received.");assert.match(copy.body, /Flow: Web · Precision/);
    assert.ok(copy.body.includes(`Payment reference: ${paymentId}`));assert.equal(copy.body.match(/690 THB/g)?.length, 1);
    assert.match(copy.subject, /Web$/);assert.equal(new URL(copy.metadata.notification.href).searchParams.get("view"), "financials");
  });
  it("covers every event with concise facts and an allowed admin destination", () => {
    assert.equal(adminCommunicationEventKeys.length, 24);
    for (const eventKey of adminCommunicationEventKeys) {
      const copy = buildAdminNotification({ eventKey, resourceId: orderId, resourceType: "retail_customer_order", metadata: {
        orderNumber: "PH-B52BA237", paymentStatus: "paid", amountMicros: 690_000_000, currency: "THB", orderSource: "mcp",
        customerName: "Private customer", errorMessage: "Internal exception and raw stack", checkoutPaymentId: "private-payment"
      } });
      assert.ok(copy.body.length < 750, eventKey);assert.match(copy.body, /Flow: MCP/);
      assert.doesNotMatch(copy.body + copy.html, /Private customer|Internal exception|private-payment|access_token=/);
      const view = new URL(copy.metadata.notification.href).searchParams.get("view") as AdminDashboardView;
      const platform = eventKey.startsWith("platform_");
      assert.equal(adminViewAllowed({ role: platform ? "platform_owner" : "retail_admin", permissions: permissionsForRole(platform ? "platform_owner" : "retail_admin") }, view, platform ? "platform" : "tenant"), true, eventKey);
    }
  });
  it("shows failed-payment amounts and settlement or payout references accurately", () => {
    const failed = buildAdminNotification({ eventKey: "platform_payment_failed", resourceType: "payment", resourceId: paymentId,
      metadata: { paymentStatus: "expired", amountMicros: 690_000_000, currency: "THB" } });
    assert.equal(headline(failed), "Payment expired.");assert.match(failed.body, /Amount: 690 THB/);assert.ok(failed.body.includes(paymentId));
    const settlement = buildAdminNotification({ eventKey: "retail_settlement_payout_paid", resourceType: "retail_order_settlement", resourceId: paymentId,
      metadata: { orderNumber: "PH-123", amountMicros: 580_000_000, currency: "THB", orderSource: "pharmacy" } });
    assert.match(settlement.body, /PH-123 payout sent\./);assert.match(settlement.body, /Amount: 580 THB/);assert.ok(settlement.body.includes(`Settlement: ${paymentId}`));
    const payout = buildAdminNotification({ eventKey: "platform_payout_failed", metadata: { stripePayoutStatus: "canceled", stripePayoutId: "po_123ABC", amountMicros: 420_000_000, currency: "THB" } });
    assert.equal(headline(payout), "Payout cancelled.");assert.match(payout.body, /Amount: 420 THB/);assert.match(payout.body, /Payout reference: po_123ABC/);
    assert.equal(headline(buildAdminNotification({ eventKey: "platform_revenue_received", metadata: { paymentStatus: "unpaid", amountMicros: 690_000_000, currency: "THB" } })), "Payment needs review.");
  });
  it("does not invent unknown amounts or flows", () => {
    for (const amountMicros of [null, undefined, "", " ", false, -1, "bad", Infinity]) {
      const copy = buildAdminNotification({ eventKey: "platform_checkout_failed", metadata: { amountMicros, currency: "THB", source: "communication_dispatch" } });
      assert.doesNotMatch(copy.body, /Amount:|Flow:|NaN|Infinity/);
    }
    assert.equal(notificationSource({ orderSource: "pharmacy", source: "carrier_event_process" }), "retail");
    assert.equal(notificationSource({ channel: "mcp", source: "retail_product_checkout" }), "mcp");
    assert.equal(notificationSource({ source: "manual" }), "retail");
    assert.equal(notificationSource({ sourceSurface: "healthscore", stripeMode: "live" }), "web");
    assert.equal(notificationSource({ source: "communication_dispatch", stripeMode: "live" }), null);
  });
  it("retains environment labels and the correct localized admin destination", () => {
    try { for (const env of ["dev", "uat"] as const) {
      process.env.MATTANUTRA_ENV = env;
      for (const locale of ["en", "th", "zh-CN"]) {
        const copy = buildAdminNotification({ eventKey: "retail_order_shipped", metadata: { locale, orderNumber: "PH-123", mattanutraEnv: "prd" } });
        assert.equal(headline(copy), `[${env.toUpperCase()}] PH-123 shipped.`);
        assert.ok(copy.metadata.notification.href.startsWith(`https://${env}.mattanutra.com/${locale}/admin/dashboard?`));
      }
    } } finally { process.env.MATTANUTRA_ENV = "prd"; }
  });
  it("renders the same LINE facts with an admin button and preserves old cards", () => {
    const copy = order("paid", "awaiting_stock"), message = adminNotificationLineMessage(copy.body, copy.metadata);
    assert.ok(message);assert.equal(message.type, "flex");assert.equal(message.altText, copy.body.slice(0, 400));
    assert.ok("footer" in message.contents);
    assert.equal(message.contents.footer?.contents[0].action.uri, copy.metadata.notification.href);
    assert.equal(message.contents.footer?.contents[0].action.label, "Open in admin");
    assert.ok(JSON.stringify(message).includes("Order total: 1,250.5 THB"));assert.ok(JSON.stringify(message).includes("Flow: Retail"));
    const old = adminNotificationLineMessage("PH-123 shipped.", { notification: { version: 1, label: "PH-123", href: copy.metadata.notification.href } });
    assert.ok(old);assert.equal(old.type, "flex");assert.equal(adminNotificationLineMessage("Customer message", {}), null);
    assert.equal(adminNotificationLineMessage(copy.body, { notification: { ...copy.metadata.notification, href: "https://attacker.example/order" } }), null);
    assert.equal(adminNotificationLineMessage(copy.body, { notification: { ...copy.metadata.notification, href: copy.metadata.notification.href + "&access_token=private" } }), null);
  });
  it("escapes labels in email and excludes invalid identifiers from links", () => {
    const copy = buildAdminNotification({ eventKey: "retail_order_created", resourceType: "retail_customer_order", resourceId: orderId + "&access_token=private", metadata: { orderNumber: '<img src=x onerror="alert(1)">' } });
    assert.doesNotMatch(copy.html, /<img/);assert.match(copy.html, /&lt;img/);
    assert.equal(new URL(copy.metadata.notification.href).searchParams.has("order"), false);
  });
});
