import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const customerPricing = readFileSync(
  new URL("../lib/customer-pricing.ts", import.meta.url),
  "utf8"
);
const sellability = readFileSync(
  new URL("../lib/retail-sellability.ts", import.meta.url),
  "utf8"
);
const cart = readFileSync(
  new URL("../lib/retail-cart-availability.ts", import.meta.url),
  "utf8"
);
const search = readFileSync(
  new URL("../lib/admin-product-search.ts", import.meta.url),
  "utf8"
);
const checkout = readFileSync(
  new URL("../lib/retail-product-checkout.ts", import.meta.url),
  "utf8"
);
const financials = readFileSync(
  new URL("../lib/admin-retail-financials.ts", import.meta.url),
  "utf8"
);
const productHelpers = readFileSync(
  new URL("../components/admin/product-view-helpers.ts", import.meta.url),
  "utf8"
);

describe("retail sellability and platform margin pricing", () => {
  it("defines programmatic RRP + platform percent customer pricing", () => {
    assert.match(customerPricing, /DEFAULT_CUSTOMER_PRICE_MARGIN_PERCENT = 10/);
    assert.match(
      customerPricing,
      /Math\.round\(rrp \* \(1 \+ normalizeCustomerPriceMarginPercent\(marginPercent\) \/ 100\)\)/
    );
    assert.match(sellability, /assessRetailSellability/);
    assert.match(sellability, /pharmacyUnitPayable/);
    assert.match(sellability, /missing_retail_price/);
    assert.match(sellability, /out_of_stock_no_backorder/);
    assert.match(sellability, /customerPriceFromRpp/);
  });

  it("does not alias sellable RRP as a customer-price override", () => {
    assert.doesNotMatch(cart, /rrp_price_amount as retail_override_price_amount/);
    assert.doesNotMatch(search, /rrp_price_amount as retail_override_price_amount/);
    assert.match(cart, /Missing retail price \(RRP\)/);
    assert.match(cart, /customerPriceFromRpp\(/);
    assert.match(search, /customerPriceFromRpp\(rrpPriceAmount/);
    assert.match(search, /availableNow <= 0 && !backorderAllowed/);
  });

  it("checkout pays pharmacy RRP and records platform margin", () => {
    assert.match(checkout, /pharmacyRrpPayableAmounts/);
    assert.match(checkout, /retailerPayableSource: "rrp"/);
    assert.match(checkout, /platformMarginPercent/);
    assert.match(checkout, /rrpPriceAmount/);
    assert.match(checkout, /getCustomerPriceMarginPercent/);
    assert.match(financials, /Pharmacy is paid RRP/);
    assert.match(financials, /line\.rrpPriceAmount/);
  });

  it("exposes product admin sellable and ineligible filter metrics", () => {
    assert.match(productHelpers, /productsSellable/);
    assert.match(productHelpers, /productsIneligible/);
    assert.match(productHelpers, /productIsCustomerSellable/);
    assert.match(productHelpers, /sellable: "Sellable"/);
    assert.match(productHelpers, /ineligible: "Ineligible"/);
  });
});
