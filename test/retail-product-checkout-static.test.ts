import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const checkoutService = readFileSync(
  new URL("../lib/retail-product-checkout.ts", import.meta.url),
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

  it("keeps checkout summary pricing loaded before payment starts", () => {
    assert.match(checkoutPanel, /void loadQuotePreview\(\)/);
    assert.match(checkoutPanel, /<OrderSummary/);
    assert.match(checkoutPanel, /quotePreview=\{quotePreview\}/);
    assert.match(checkoutPanel, /previewOnly: !options\?\.confirmDelivery/);
  });
});
