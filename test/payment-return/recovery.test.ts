import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmedPaymentDestination } from "../../lib/payment-recovery.ts";

const id = "1ad4556f-5e1f-4ea7-95df-4a52d12fbbca";
const planId = "750d02b1-3e4c-4623-9e36-e583fe3adcfb";
const session = "cs_test_recovery_fixture";
const paid = { id, planId, status: "paid", paidAt: "2026-10-03T10:01:05Z", stripeCheckoutSessionId: session };

for (const locale of ["en", "th", "zh-CN"] as const) {
  test(`${locale}: confirmed payments use the server return route`, () => {
    assert.equal(confirmedPaymentDestination(paid, id, locale), `/${locale}/nutrition/payment/return?session_id=${session}`);
  });
}
test("completion, processing, expiry and failures without paid evidence never unlock a plan", () => {
  for (const status of ["complete", "processing", "checkout_opened", "expired", "failed", "fulfillment_failed"]) {
    assert.equal(confirmedPaymentDestination({ ...paid, status, paidAt: null }, id, "en"), null);
  }
  assert.equal(confirmedPaymentDestination({ ...paid, status: "processing", paidAt: "not-a-date" }, id, "en"), null);
});
test("a different payment response cannot redirect this checkout", () => {
  assert.equal(confirmedPaymentDestination({ ...paid, id: planId }, id, "en"), null);
  for (const value of [null, true, "paid", {}]) assert.equal(confirmedPaymentDestination(value, id, "en"), null);
});
test("confirmed payment survives fulfillment failure and goes through recovery", () => {
  assert.equal(confirmedPaymentDestination({ ...paid, status: "fulfillment_failed" }, id, "en"), `/en/nutrition/payment/return?session_id=${session}`);
});
test("historical payments without a session retain their plan or reservation", () => {
  assert.equal(confirmedPaymentDestination({ ...paid, stripeCheckoutSessionId: null }, id, "en"), `/en/nutrition/progress?plan=${planId}`);
  assert.equal(confirmedPaymentDestination({ ...paid, stripeCheckoutSessionId: null, planId: null }, id, "en"), `/en/nutrition/quiz?payment=${id}`);
});
test("response URLs and malformed identifiers cannot create an external redirect", () => {
  assert.equal(confirmedPaymentDestination({ ...paid, stripeCheckoutSessionId: "https://facebook.com/", destination: "https://facebook.com/" }, id, "en"), `/en/nutrition/progress?plan=${planId}`);
  assert.equal(confirmedPaymentDestination(paid, "../../outside", "en"), null);
});
