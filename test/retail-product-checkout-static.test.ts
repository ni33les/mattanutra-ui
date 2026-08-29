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
const checkoutPage = readFileSync(
  new URL("../app/[locale]/basket/checkout/page.tsx", import.meta.url),
  "utf8"
);
const revealPage = readFileSync(
  new URL("../components/reveal-final-results.tsx", import.meta.url),
  "utf8"
);
const revealFinalPage = readFileSync(
  new URL("../components/reveal-final-results.tsx", import.meta.url),
  "utf8"
);
const revealCopy = readFileSync(
  new URL("../components/formulation-reveal-copy.ts", import.meta.url),
  "utf8"
);
const revealCopyMessages = JSON.parse(
  readFileSync(new URL("../content/i18n/source/en.json", import.meta.url), "utf8")
) as Record<string, { defaultMessage?: string }>;
const adminProductSearch = readFileSync(
  new URL("../lib/admin-product-search.ts", import.meta.url),
  "utf8"
);
const taskExecution = readFileSync(
  new URL("../lib/task-execution.ts", import.meta.url),
  "utf8"
);
const assessmentStore = readFileSync(
  new URL("../lib/assessment-store.ts", import.meta.url),
  "utf8"
);

function defaultMessage(id: string) {
  return revealCopyMessages[id]?.defaultMessage ?? "";
}

describe("retail product checkout static contracts", () => {
  it("keeps order-number and legacy token tracking compatibility", () => {
    assert.match(checkoutService, /getTrackingOrderByReference/);
    assert.match(checkoutService, /tracking_token_hash = \$\{hashToken\(trackingReference\)\}/);
    assert.match(checkoutService, /upper\(retail_customer_orders\.order_number\) = upper\(\$\{trackingReference\}\)/);
    assert.match(checkoutService, /trackingReference: orderNumber/);
    assert.match(trackingPage, /getTrackingOrderByReference\(token, locale\)/);
  });

  it("shows Nong Mata connection on tracking only until LINE is connected", () => {
    assert.match(checkoutService, /has_active_line_channel/);
    assert.match(checkoutService, /plan_communication_identities/);
    assert.match(checkoutService, /communication_channels\.channel_type = 'line'/);
    assert.match(checkoutService, /hasActiveLineChannel: row\.has_active_line_channel === true/);
    assert.match(trackingPage, /!order\.hasActiveLineChannel/);
    assert.match(trackingPage, /presentation="inline_qr"/);
    assert.match(trackingPage, /showEyebrow=\{false\}/);
    assert.match(trackingPage, /source="order_tracking"/);
    assert.match(trackingPage, /lineConnectedBody/);
    assert.match(trackingPage, /lineConnectedTitle/);
  });

  it("drives tracking timeline dots from order status and omits estimated delivery", () => {
    assert.match(trackingPage, /function trackingTimelineActive/);
    assert.match(trackingPage, /function buildOrderTrackingTimeline/);
    assert.match(trackingPage, /sm:grid-cols-3/);
    assert.doesNotMatch(trackingPage, /active: true, label: copy\.paid/);
    assert.doesNotMatch(trackingPage, /copy\.eta/);
    assert.doesNotMatch(trackingPage, /latestEta/);
    assert.doesNotMatch(trackingPage, /line\.etaDate/);
    assert.match(trackingPage, /shippedStatuses/);
  });

  it("does not render a bookmark tracking button", () => {
    assert.doesNotMatch(trackingPage, /BookmarkTrackingButton/);
    assert.doesNotMatch(trackingPage, /bookmark-tracking-button/);
    assert.doesNotMatch(trackingPage, /Bookmark tracking page/);
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

  it("carries a clicked reveal pharmacy option into checkout routing", () => {
    assert.match(revealPage, /export function RevealFinalResultsPage/);
    assert.match(revealFinalPage, /setRetailerSelection/);
    assert.match(revealFinalPage, /params\.set\("retailer", selectedRetailerOrganisationId\)/);
    assert.doesNotMatch(revealFinalPage, /formatRevealEta\(locale, option\.etaDate\)/);
    assert.match(revealFinalPage, /retailerDispatchNote\(finalCopy, option\)/);
    assert.match(revealFinalPage, /selectedRetailerDispatchNote/);
    assert.match(revealFinalPage, /bestValueRetailerOrganisationId/);
    assert.match(revealFinalPage, /fastestRetailerOrganisationId/);
    assert.match(revealFinalPage, /finalCopy\.bestValue/);
    assert.match(revealFinalPage, /finalCopy\.fastest/);
    assert.match(revealCopy, /getNamespace<RevealCopy>\(locale, "customer\.revealFinalCopy"\)/);
    assert.equal(defaultMessage("customer.revealFinalCopy.bestValue"), "Best value");
    assert.equal(defaultMessage("customer.revealFinalCopy.fastest"), "Fastest");
    assert.equal(
      defaultMessage("customer.revealFinalCopy.deliveryNote"),
      "Express delivery · Pharmacy dispatch"
    );
    assert.equal(
      defaultMessage("customer.revealFinalCopy.deliveryNoteTemplate"),
      "Express delivery · {dispatchCity} dispatch"
    );
    assert.match(adminProductSearch, /organisations\.metadata as organisation_metadata/);
    assert.match(adminProductSearch, /dispatchCity: organisationDispatchCity/);
    assert.match(taskExecution, /dispatchCity: input\.candidateSet\.dispatchCity/);
    assert.match(taskExecution, /dispatchCity: option\.dispatchCity/);
    assert.match(assessmentStore, /dispatchCity:[\s\S]{0,120}retailerOption\.dispatchCity/);
    assert.match(revealFinalPage, /retailerDispatchNote/);
    assert.doesNotMatch(revealFinalPage, /\{option\.productCount \?\? 0\} products/);
    assert.match(checkoutPage, /query\.retailer/);
    assert.match(checkoutPage, /selectedRetailerOrganisationId=\{selectedRetailerOrganisationId\}/);
    assert.match(checkoutPanel, /selectedRetailerOrganisationId/);
    assert.match(checkoutPanel, /body\.availability\.selectedRetailer\?\.organisationId/);
  });

  it("uses the shared order workflow email service for checkout fulfilment", () => {
    assert.match(checkoutService, /sendRetailOrderWorkflowEmail/);
    assert.match(checkoutService, /event: "confirmed"/);
    assert.match(checkoutService, /event: "awaiting_stock"/);
    assert.match(checkoutService, /schedulePanyaReorderCallbackForOrder/);
    assert.match(checkoutService, /source: "retail_checkout_fulfilled"/);
    assert.doesNotMatch(checkoutService, /retail_order_confirmation_email_sent/);
    assert.match(workflowService, /queueRetailOrderWorkflowEmail/);
    assert.match(workflowService, /send_retail_order_workflow_email/);
    assert.match(workflowService, /RETAIL_ORDER_EMAIL_TASK_PRIORITY = 220/);
    assert.match(workflowService, /sendTransactionalEmail/);
    assert.match(workflowService, /orderWorkflowEmails/);
    assert.match(workflowService, /customer_email_missing/);
  });

  it("flows customer-visible order milestones through LINE when connected", () => {
    assert.match(workflowService, /queueRetailOrderCustomerLineUpdate/);
    assert.match(workflowService, /channelType: "line"/);
    assert.match(workflowService, /queueCustomerChatCommunicationDispatchTask/);
    assert.match(workflowService, /orderWorkflowLine/);
    assert.match(workflowService, /retail_order_\$\{input\.event\}_line_queued/);
    assert.match(workflowService, /retail_order_\$\{input\.event\}_line_no_channel/);
    assert.match(workflowService, /await queueRetailOrderCustomerLineUpdate/);
  });

  it("runs agentic checkout on the same web session, BPM, finance and fulfilment rail", () => {
    const execute = readFileSync(
      new URL("../lib/agentic/commerce/execute.ts", import.meta.url),
      "utf8"
    );
    const sessionApi = readFileSync(
      new URL("../app/api/retail/checkout/session/route.ts", import.meta.url),
      "utf8"
    );
    const stripeAdapter = readFileSync(
      new URL("../lib/agentic/commerce/stripe-adapter.ts", import.meta.url),
      "utf8"
    );
    assert.match(checkoutService, /mode\?: "web" \| "agentic"/);
    assert.match(checkoutService, /agentAuthorized/);
    assert.match(checkoutService, /frozenLines/);
    assert.match(checkoutService, /channel: checkoutMode === "agentic" \? "mcp" : "web"/);
    assert.match(checkoutService, /kind: "retail_product_checkout"/);
    assert.match(checkoutService, /retail_product_checkout_requested/);
    assert.match(checkoutService, /retail_product_payment_succeeded/);
    assert.match(checkoutService, /queuePlatformRetailRevenueNotification/);
    assert.match(checkoutService, /recordRetailCheckoutFinance/);
    assert.match(checkoutService, /sendRetailOrderWorkflowEmail/);
    assert.match(sessionApi, /mode === "agentic"/);
    assert.match(checkoutPage, /mode === "agentic"/);
    assert.doesNotMatch(checkoutPage, /AgenticCheckoutPanel/);
    assert.match(checkoutPage, /ProductBasketCheckoutPanel/);
    assert.match(checkoutPage, /mockPayment=\{stripePaymentConfig\(\)\.mode === "mock"\}/);
    assert.match(checkoutPanel, /name="scenario"/);
    assert.match(checkoutPanel, /decline_insufficient_funds/);
    assert.match(checkoutPanel, /runMockPayment/);
    assert.match(checkoutPanel, /agentAuthorized/);
    assert.match(checkoutPanel, /mode: checkoutMode/);
    assert.match(checkoutService, /projectRetailPaidOntoAgenticOrder/);
    assert.match(execute, /\/basket\/checkout\?mode=agentic/);
    assert.doesNotMatch(execute, /\/mcp\/checkout\/\$\{/);
    assert.doesNotMatch(
      stripeAdapter,
      /await joinMcpPaidOrderToRetail\(\{\s*now,\s*order: applied\.order/
    );
  });

	it("uses customer-facing wording for awaiting-stock order updates", () => {
	    assert.match(trackingPage, /awaiting_stock: "Order processing"/);
	    assert.match(trackingPage, /const displayStatus = displayOrderStatus\(order\)/);
	    assert.match(trackingPage, /statusLabel\(locale, displayStatus\)/);
	    assert.match(workflowService, /eyebrow: "Order processing"/);
    assert.match(workflowService, /customerOrderStatusLabel\(order\.status\)/);
    assert.doesNotMatch(workflowService, /eyebrow: "Awaiting stock"/);
    assert.doesNotMatch(workflowService, /We are sourcing your products/);
  });
});
