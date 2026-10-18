import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Stripe from "stripe";
import { isInternalTestMetadata, stripeInternalTestMetadata } from "../lib/payment-internal-test.ts";

describe("explicit internal payment test markers", () => {
  it("recognises stored JSON and Stripe metadata without treating false strings as true", () => {
    for (const marker of [true, "true", 1, "1"]) assert.equal(isInternalTestMetadata({ internal_test: marker }), true);
    for (const marker of [false, "false", 0, "0", "", null, undefined, "yes", {}, []]) {
      assert.equal(isInternalTestMetadata({ internal_test: marker }), false);
    }
    for (const metadata of [null, undefined, true, "true", [{ internal_test: true }]]) {
      assert.equal(isInternalTestMetadata(metadata), false);
    }
  });

  it("copies only a positive marker from a verified session or expanded payment intent", () => {
    assert.deepEqual(stripeInternalTestMetadata({ metadata: { internal_test: "true", unrelated: "private" }, payment_intent: "pi_fixture" }), { internal_test: true });
    assert.deepEqual(stripeInternalTestMetadata({ metadata: { internal_test: "false" },
      payment_intent: { metadata: { internal_test: "true", unrelated: "private" } } as unknown as Stripe.PaymentIntent }), { internal_test: true });
    assert.deepEqual(stripeInternalTestMetadata({ metadata: { internal_test: "false" }, payment_intent: null }), {});
    assert.deepEqual(stripeInternalTestMetadata({ metadata: null, payment_intent: "pi_fixture" }), {});
    assert.deepEqual({ internal_test: true, ...stripeInternalTestMetadata({ metadata: { internal_test: "false" }, payment_intent: null }) }, { internal_test: true });
  });
});
