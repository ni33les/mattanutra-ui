import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const checkoutService = readFileSync(
  new URL("../lib/retail-product-checkout.ts", import.meta.url),
  "utf8"
);
const workflowService = readFileSync(
  new URL("../lib/retail-order-workflow.ts", import.meta.url),
  "utf8"
);
const trackingPage = readFileSync(
  new URL("../app/[locale]/order/track/[token]/page.tsx", import.meta.url),
  "utf8"
);
const checkoutPanel = readFileSync(
  new URL("../components/retail-checkout/product-basket-checkout-panel.tsx", import.meta.url),
  "utf8"
);

describe("retail product checkout static contracts", () => {
  it("keeps order-number and legacy token tracking compatibility", () => {
    assert.match(checkoutService, /getTrackingOrderByReference/);
    assert.match(checkoutService, /tracking_token_hash = \$\{hashToken\(trackingReference\)\}/);
    assert.match(checkoutService, /upper\(retail_customer_orders\.order_number\) = upper\(\$\{trackingReference\}\)/);
    assert.match(checkoutService, /trackingReference: orderNumber/);
    assert.match(trackingPage, /getTrackingOrderByReference\(token, locale\)/);
  });

  it("surfaces shipment metadata on tracking and shipped emails", () => {
    assert.match(checkoutService, /retail_customer_orders\.metadata as order_metadata/);
    assert.match(checkoutService, /shipment: shipmentFromMetadata\(row\.order_metadata\)/);
    assert.match(trackingPage, /order\.shipment\.carrierName/);
    assert.match(trackingPage, /order\.shipment\.trackingNumber/);
    assert.match(trackingPage, /order\.shipment\.trackingUrl/);
    assert.match(trackingPage, /Track shipment/);
    assert.match(workflowService, /shipmentDetailsFromMetadata/);
    assert.match(workflowService, /Track shipment/);
    assert.match(workflowService, /input\.event === "shipped" \? shipment : null/);
  });

  it("keeps checkout summary pricing loaded before payment starts", () => {
    assert.match(checkoutPanel, /void loadQuotePreview\(\)/);
    assert.match(checkoutPanel, /<OrderSummary/);
    assert.match(checkoutPanel, /quotePreview=\{quotePreview\}/);
    assert.match(checkoutPanel, /previewOnly: !options\?\.confirmDelivery/);
  });

  it("uses the shared order workflow email service for checkout fulfilment", () => {
    assert.match(checkoutService, /sendRetailOrderWorkflowEmail/);
    assert.match(checkoutService, /event: "confirmed"/);
    assert.match(checkoutService, /event: "awaiting_stock"/);
    assert.doesNotMatch(checkoutService, /retail_order_confirmation_email_sent/);
    assert.match(workflowService, /queueRetailOrderWorkflowEmail/);
    assert.match(workflowService, /send_retail_order_workflow_email/);
    assert.match(workflowService, /RETAIL_ORDER_EMAIL_TASK_PRIORITY = 220/);
    assert.match(workflowService, /sendTransactionalEmail/);
    assert.match(workflowService, /orderWorkflowEmails/);
    assert.match(workflowService, /customer_email_missing/);
  });

  it("uses customer-facing wording for awaiting-stock order updates", () => {
    assert.match(trackingPage, /awaiting_stock: "Order processing"/);
    assert.match(trackingPage, /statusLabel\(locale, order\.status\)/);
    assert.match(workflowService, /eyebrow: "Order processing"/);
    assert.match(workflowService, /customerOrderStatusLabel\(order\.status\)/);
    assert.doesNotMatch(workflowService, /eyebrow: "Awaiting stock"/);
    assert.doesNotMatch(workflowService, /We are sourcing your products/);
  });
});
