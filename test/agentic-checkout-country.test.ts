import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { AgenticCheckoutPanel } from "../components/agentic-checkout-panel.tsx";

function htmlFor(country: string) {
  return renderToStaticMarkup(
    createElement(AgenticCheckoutPanel, {
      checkoutAccess: "chk_test_access_token_32chars_min",
      country,
      currency: "THB",
      expired: false,
      items: [
        {
          dailyPills: 1,
          form: "capsule",
          lineTotalMinor: 10000,
          productName: "BIO C",
          quantity: 1
        }
      ],
      locale: "en",
      orderReference: "MN-TEST",
      paid: false,
      shippingMinor: 0,
      subtotalMinor: 10000,
      successUrl: "/en/order/track/x",
      taxMinor: 0,
      totalPriceMinor: 10000
    })
  );
}

describe("agentic checkout country field", () => {
  it("renders one named enabled country field defaulting to TH", () => {
    const html = htmlFor("TH");
    assert.match(html, /name="country"/);
    assert.match(html, /<select[^>]*name="country"/);
    assert.equal(/name="country"[^>]*disabled/.test(html), false);
    assert.equal(/<select[^>]*name="country"[^>]*disabled/.test(html), false);
    assert.equal(html.includes('type="hidden"') && /<input[^>]*name="country"/.test(html), false);
    assert.match(html, /value="TH"/);
    assert.match(html, />Thailand</);
    assert.equal(html.includes('id="countryDisplay"'), false);
  });

  it("does not render an empty hidden-only country field when destination is missing", () => {
    const html = htmlFor("");
    assert.match(html, /<select[^>]*name="country"/);
    assert.equal(/<input[^>]*type="hidden"[^>]*name="country"/.test(html), false);
    assert.equal(/<input[^>]*name="country"[^>]*type="hidden"/.test(html), false);
    assert.match(html, /value="TH"/);
  });

  it("keeps a named country field and refund scenario on the paid checkout", () => {
    const html = renderToStaticMarkup(
      createElement(AgenticCheckoutPanel, {
        checkoutAccess: "chk_test_access_token_32chars_min",
        country: "TH",
        currency: "THB",
        expired: false,
        items: [
          {
            dailyPills: 1,
            form: "capsule",
            lineTotalMinor: 10000,
            productName: "BIO C",
            quantity: 1
          }
        ],
        locale: "en",
        orderReference: "MN-TEST",
        paid: true,
        refundable: true,
        shippingMinor: 0,
        subtotalMinor: 10000,
        successUrl: "/en/order/track/x",
        taxMinor: 0,
        totalPriceMinor: 10000
      })
    );
    assert.match(html, /<select[^>]*name="country"/);
    assert.match(html, /name="scenario"/);
    assert.match(html, /value="refund"/);
    assert.match(html, /method="post"/);
  });
});
