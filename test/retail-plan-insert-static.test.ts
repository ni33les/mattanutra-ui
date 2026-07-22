import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("retail plan insert static wiring", () => {
  it("exposes a stock-read protected PDF route", () => {
    const route = read(
      "app/api/admin/retail-stock/customer-orders/[orderId]/plan-insert/route.ts"
    );

    assert.match(route, /requireAdminRouteAccess\(\s*request,\s*"stock\.read"/);
    assert.doesNotMatch(route, /hasAdminPermission\(/);
    assert.match(route, /renderRetailPlanInsertPdfForOrder/);
    assert.match(route, /"Content-Type": "application\/pdf"/);
    assert.match(route, /"Cache-Control": "no-store"/);
    assert.match(route, /status: 404/);
  });

  it("adds a visible retail order button and includes the insert in the order pack", () => {
    const view = read("components/admin/retail-stock-view.tsx");
    const documents = read("components/admin/retail-stock/order-documents.ts");
    const content = read("components/admin/dashboard-content.tsx");
    const zh = read("components/admin/dashboard-content.zh-CN.json");

    assert.match(view, /customerOrderDetail\.planInsertAvailable/);
    assert.match(view, /openRetailPlanInsert\(customerOrderDetail, locale\)/);
    assert.match(view, /labels\.stock\.planInsert/);
    assert.match(documents, /retailPlanInsertHref/);
    assert.match(documents, /kind === "order-pack"[\s\S]*openRetailPlanInsert/);
    assert.match(content, /planInsert: "Plan insert"/);
    assert.match(zh, /"planInsert":/);
  });

  it("uses real PDF rendering, local QR generation, and safe image conversion", () => {
    const insert = read("lib/retail-plan-insert.tsx");

    assert.match(insert, /@react-pdf\/renderer/);
    assert.match(insert, /renderToBuffer/);
    assert.match(insert, /QRCode\.toDataURL/);
    assert.match(insert, /sharp\(buffer\)\.png\(\)\.toBuffer/);
    assert.match(insert, /maxProductCards = 4/);
    assert.match(insert, /maxFoodCards = 2/);
    assert.doesNotMatch(insert, /symptom|diagnosis|medical claim/i);
  });

  it("keeps product panel text printable inside the right-side PDF panel", () => {
    const insert = read("lib/retail-plan-insert.tsx");

    assert.match(insert, /const noHyphenation = \(word: string \| null\)/);
    assert.match(insert, /hyphenationCallback=\{noHyphenation\}/);
    assert.match(insert, /function splitProductRecommendationText/);
    assert.match(insert, /function servingDoseText/);
    assert.match(insert, /replace\(\s*\/\^use\\s\+\\d\+\(\?:\\\.\\d\+\)\?\\s\+servings\?/);
    assert.match(insert, /productSectionTitle/);
    assert.match(insert, /fontSize: 20/);
    assert.match(insert, /doseRow: \{[\s\S]*minHeight: 78[\s\S]*paddingRight: 8/);
    assert.match(insert, /productBody: \{[\s\S]*paddingRight: 8[\s\S]*width: 286/);
    assert.match(insert, /compactText\([\s\S]*product\.covers\.join\(" - "\)[\s\S]*58/);
    assert.match(insert, /return splitProductRecommendationText\(recommendation\)\.take/);
    assert.match(insert, /return splitProductRecommendationText\(recommendation\)\.why/);
    assert.doesNotMatch(insert, /return explicit;/);
  });

  it("keeps reveal LINE codes short but makes shipping insert codes last 90 days", () => {
    const communications = [
      read("lib/communications.ts"),
      read("lib/communications-organisation.ts")
    ].join("\n");
    const revealRoute = read("app/api/assessment/[planId]/line-connect/route.ts");
    const insert = read("lib/retail-plan-insert.tsx");

    assert.match(communications, /expiresInMinutes\?: number \| null/);
    assert.match(communications, /Number\(input\.expiresInMinutes\) \|\| 15/);
    assert.match(insert, /panyaInsertExpiryMinutes = 90 \* 24 \* 60/);
    assert.match(insert, /source: "shipping_insert"/);
    assert.doesNotMatch(revealRoute, /expiresInMinutes/);
  });

  it("attaches the insert to retailer order-created emails without blocking send", () => {
    const checkout = read("lib/retail-product-checkout.ts");
    const communications = [
      read("lib/communications.ts"),
      read("lib/communications-dispatch.ts")
    ].join("\n");
    const smtp = read("lib/smtp-email.ts");

    assert.match(checkout, /planInsertOrderId: order\.id/);
    assert.match(checkout, /planId: payment\.plan_id/);
    assert.match(communications, /attachmentsForPreparedEmailMessage/);
    assert.match(communications, /renderRetailPlanInsertPdfForOrder/);
    assert.match(communications, /communication_attachment_failed/);
    assert.match(communications, /attachments: attachmentResult\.attachments/);
    assert.match(smtp, /attachments\?: readonly TransactionalEmailAttachment\[\]/);
    assert.match(smtp, /transporter\.sendMail\(\{[\s\S]*attachments:/);
  });
});
