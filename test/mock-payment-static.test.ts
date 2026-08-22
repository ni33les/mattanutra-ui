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
    assert.match(panel, /signal: controller.signal/);
    assert.doesNotMatch(panel, /MOCK_PAYMENT_COMPLETION_DELAY_MS/);
  });
});
