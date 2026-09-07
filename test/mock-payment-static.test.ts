import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("DEV mock payment completion", () => {
  it("returns the paid destination after durable fulfillment scheduling, without running optional Stripe follow-up", async () => {
    const source = await readFile("lib/stripe-payments.ts", "utf8");
    const panel = await readFile(
      "components/nutrition-flow/stripe-checkout-panel.tsx",
      "utf8"
    );

    const completion = source.slice(source.indexOf("export async function completeMockPayment"), source.indexOf("export async function notifyWebPaymentFulfilled"));
    assert.match(completion, /withDatabaseTransaction[\s\S]*status: "paid"[\s\S]*await enqueueWebPaymentFulfillment\(tx, paid\)[\s\S]*destination/);
    assert.match(completion, /current\.stripe_mode !== "mock"/);
    assert.match(completion, /only available in dev mock mode/);
    assert.doesNotMatch(completion, /setTimeout|recordMockStripePayoutLifecycle|queuePlatformPaymentNotification/);
    assert.match(source, /notifyWebPaymentFulfilled[\s\S]*recordMockStripePayoutLifecycle/);
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
