import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { adminNotificationLineMessage, buildAdminNotification, notificationSource } from "../lib/admin-notification.ts";
import { adminCommunicationEventKeys } from "../lib/communications-shared.ts";
import { adminViewAllowed, permissionsForRole } from "../lib/admin-rbac.ts";
import type { AdminDashboardView } from "../components/admin/dashboard-content.tsx";

const orderId = "b52ba237-0a2e-4ffb-ac84-a72868504a25";
const originalEnvironment = process.env.MATTANUTRA_ENV;
before(() => { process.env.MATTANUTRA_ENV = "prd"; });
after(() => { if (originalEnvironment === undefined) delete process.env.MATTANUTRA_ENV; else process.env.MATTANUTRA_ENV = originalEnvironment; });

function order(paymentStatus: string, orderStatus = "placed") {
  return buildAdminNotification({ eventKey: "retail_order_created", resourceId: orderId, resourceType: "retail_customer_order",
    metadata: { orderNumber: "PH-B52BA237", orderStatus, paymentStatus, orderSource: "pharmacy", customerName: "Private customer", lineCount: 4 },
    subject: "New paid order", body: "This should never override the verified payment state." });
}

describe("recipient-facing admin notifications", () => {
  it("describes unpaid orders as created, and only confirmed payments as paid", () => {
    for (const status of ["unpaid", "unknown", "placed", "allocated", "picking", "packed", "shipped", "failed", "refunded"])
      assert.equal(order(status).body, "PH-B52BA237 created.", status);
    for (const status of ["paid", "fulfilled"]) assert.equal(order(status).body, "PH-B52BA237 paid.");
    assert.equal(order("unpaid", "awaiting_stock").body, "PH-B52BA237 created — on backorder.");
    assert.equal(order("paid", "awaiting_stock").body, "PH-B52BA237 paid — on backorder.");
    assert.equal(order("paid", "allocated").body, "PH-B52BA237 paid.");
  });

  it("links the order reference to the existing order detail route without a bearer token", () => {
    const copy = order("unpaid"), url = new URL(copy.metadata.notification.href);
    assert.equal(url.origin, "https://mattanutra.com");
    assert.equal(url.pathname, "/en/admin/dashboard");
    assert.equal(url.searchParams.get("view"), "retail-customer-orders");
    assert.equal(url.searchParams.get("order"), orderId);
    assert.equal(url.searchParams.has("access_token"), false);
    assert.match(copy.html, />PH-B52BA237<\/a> created\./);
    assert.equal(copy.metadata.source, "pharmacy");
  });

  it("covers every configured pharmacy and platform event with concise copy and an allowed destination", () => {
    assert.equal(adminCommunicationEventKeys.length, 24);
    for (const eventKey of adminCommunicationEventKeys) {
      const copy = buildAdminNotification({ eventKey, resourceId: orderId, resourceType: "retail_customer_order", metadata: {
        orderNumber: "PH-B52BA237", paymentStatus: "paid", amountMicros: 690_000_000, currency: "THB",
        customerName: "Private customer", errorMessage: "Internal exception and raw stack", checkoutPaymentId: "private-payment"
      } });
      assert.ok(copy.body.length < 100, `${eventKey}: ${copy.body}`);
      assert.doesNotMatch(copy.body, /\n|Status:|Source:|Reference:|Basket:|Private customer|Internal exception|private-payment|paid and created/);
      assert.ok(copy.metadata.notification.label);
      const view = new URL(copy.metadata.notification.href).searchParams.get("view") as AdminDashboardView;
      const platform = eventKey.startsWith("platform_");
      assert.equal(adminViewAllowed({ role: platform ? "platform_owner" : "retail_admin", permissions: permissionsForRole(platform ? "platform_owner" : "retail_admin") }, view, platform ? "platform" : "tenant"), true, eventKey);
      assert.match(copy.html, /<a href="https:\/\/mattanutra\.com\//);
    }
  });

  it("distinguishes expired payments, cancelled payouts and unconfirmed revenue", () => {
    assert.equal(buildAdminNotification({ eventKey: "platform_payment_failed", metadata: { paymentStatus: "expired" } }).body, "Payment expired.");
    assert.equal(buildAdminNotification({ eventKey: "platform_payment_failed", metadata: { paymentStatus: "cancelled" } }).body, "Payment cancelled.");
    assert.equal(buildAdminNotification({ eventKey: "platform_payout_failed", metadata: { stripePayoutStatus: "canceled" } }).body, "Payout cancelled.");
    assert.equal(buildAdminNotification({ eventKey: "platform_revenue_received", metadata: { paymentStatus: "unpaid", amountMicros: 690_000_000, currency: "THB" } }).body, "Payment needs review.");
    assert.equal(buildAdminNotification({ eventKey: "platform_revenue_received", metadata: { paymentStatus: "fulfilled", amountMicros: 690_000_000, currency: "THB" } }).body, "690 THB received.");
  });

  it("keeps source to the real sales channel instead of workflow names or Stripe mode", () => {
    assert.equal(notificationSource({ orderSource: "pharmacy", source: "carrier_event_process" }), "pharmacy");
    assert.equal(notificationSource({ channel: "mcp", source: "retail_product_checkout" }), "mcp");
    assert.equal(notificationSource({ channel: "web", source: "retail_product_checkout" }), "web");
    assert.equal(notificationSource({ sourceSurface: "healthscore", stripeMode: "live" }), "web");
    assert.equal(notificationSource({ source: "communication_dispatch", stripeMode: "live" }), null);
  });

  it("uses the correct environment and localized destination, with one compact test marker", () => {
    try {
      for (const env of ["dev", "uat"] as const) {
        process.env.MATTANUTRA_ENV = env;
        const copy = buildAdminNotification({ eventKey: "retail_order_shipped", metadata: { locale: "th", orderNumber: "PH-123", mattanutraEnv: "prd" } });
        assert.equal(copy.body, `[${env.toUpperCase()}] PH-123 shipped.`);
        assert.ok(copy.metadata.notification.href.startsWith(`https://${env}.mattanutra.com/th/admin/dashboard?`));
      }
    } finally { process.env.MATTANUTRA_ENV = "prd"; }
  });

  it("renders a clickable reference in LINE with the same sentence as email", () => {
    const copy = order("paid", "awaiting_stock"), message = adminNotificationLineMessage(copy.body, copy.metadata);
    assert.ok(message);
    assert.equal(message.type, "flex");
    assert.equal(message.altText, copy.body);
    const component = message.contents.body.contents[0];
    assert.equal(component.action.uri, copy.metadata.notification.href);
    assert.equal(component.contents.map(span => span.text).join(""), copy.body);
    assert.equal(component.contents.find(span => span.text === "PH-B52BA237")?.decoration, "underline");
    assert.equal(adminNotificationLineMessage("Customer message", {}), null);
    assert.equal(adminNotificationLineMessage(copy.body, { notification: { ...copy.metadata.notification, href: "https://attacker.example/order" } }), null);
    assert.equal(adminNotificationLineMessage(copy.body, { notification: { ...copy.metadata.notification, href: copy.metadata.notification.href + "&access_token=private" } }), null);
  });

  it("escapes labels in email and encodes link parameters safely", () => {
    const copy = buildAdminNotification({ eventKey: "retail_order_created", resourceType: "retail_customer_order", resourceId: orderId + "&access_token=private", metadata: { orderNumber: '<img src=x onerror="alert(1)">' } });
    assert.doesNotMatch(copy.html, /<img/);
    assert.match(copy.html, /&lt;img/);
    assert.equal(new URL(copy.metadata.notification.href).searchParams.has("order"), false);
  });
});
