import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("DEV mock payment completion", () => {
  it("returns the paid destination without waiting on mock Stripe follow-up", async () => {
    const source = await readFile("lib/stripe-payments.ts", "utf8");
    const panel = await readFile(
      "components/nutrition-flow/stripe-checkout-panel.tsx",
      "utf8"
    );

    assert.match(
      source,
      /status: "paid"[\s\S]*void finishMockPaymentSideEffects\([\s\S]*return \{[\s\S]*destination/
    );
    assert.match(source, /async function finishMockPaymentSideEffects/);
    assert.match(
      source,
      /finishMockPaymentSideEffects[\s\S]*recordMockStripePayoutLifecycle/
    );
    assert.match(source, /currentPayment\.stripe_mode !== "mock"/);
    assert.match(source, /Unable to complete mock payment/);
    assert.match(
      source,
      /setTimeout\(\(\) => \{[\s\S]*finishMockPaymentSideEffects/
    );
    assert.match(panel, /signal: controller.signal/);
    assert.match(
      panel,
      /if \(body\.mock\) \{\s*setIsMockCheckout\(true\);\s*return body;/
    );
    assert.match(panel, /action="\/api\/payments\/mock-pay"/);
    assert.doesNotMatch(panel, /MOCK_PAYMENT_COMPLETION_DELAY_MS/);

    const form = await readFile(
      "components/nutrition-flow/mock-payment-form.tsx",
      "utf8"
    );
    const page = await readFile(
      "app/[locale]/nutrition/payment/checkout/page.tsx",
      "utf8"
    );
    const route = await readFile("app/api/payments/mock-pay/route.ts", "utf8");

    assert.match(form, /action="\/api\/payments\/mock-pay"/);
    assert.match(form, /type="submit"/);
    assert.match(page, /MockPaymentForm/);
    assert.match(route, /createStripeCheckoutSession/);
    assert.match(route, /completeMockPayment/);
    assert.match(route, /NextResponse\.redirect/);
  });
});
