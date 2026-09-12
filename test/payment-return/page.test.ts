import assert from "node:assert/strict";
import { register } from "node:module";
register("./next-loader.mjs", import.meta.url);
import { beforeEach, mock, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

let failure: Error | null = null;
let stored: Record<string, unknown> | null = null;
let lookupFailure = false;
let recoveredSessions: string[] = [];
let logs: unknown[][] = [];
const session = "cs_test_payment_return_regression";
const planId = "bb3bea86-9517-4aad-aeb7-3643ac8623af";
const payment = () => ({ id: "90666cbf-a8b4-41f5-90d1-e4059d11d867", planId, locale: "en", status: "paid",
  paidAt: "2026-09-12T03:40:11.696Z", fulfillmentStatus: "complete", selectedPlan: "precision", amount: 690000000,
  currency: "THB", customerEmail: null, stripeCheckoutSessionId: session });
mock.module("../../lib/stripe-payments.ts", { namedExports: {
  fulfillCheckoutSession: async () => { if (failure) throw failure; return { payment: stored, status: stored?.planId ? "paid_with_plan" : "paid_reservation" }; },
  getPaymentForCheckoutSession: async (id: string) => { recoveredSessions.push(id); if (lookupFailure) throw new Error("read unavailable"); return stored; },
  paymentReturnDestination: (locale: string, p: Record<string, unknown>) => `/${locale}/nutrition/quiz?payment=${p.id}`
} });
mock.module("../../lib/assessment-store.ts", { namedExports: { getStoredAssessmentPrefill: async () => null, getStoredFormulationResult: async () => null } });
mock.module("../../components/title-bar.tsx", { namedExports: { TitleBar: () => null } });
mock.module("next/navigation", { namedExports: { notFound: () => { throw Error("not_found"); }, redirect: (destination: string) => { throw Object.assign(Error("redirect"), { destination }); } } });
mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
const { default: Page } = await import("../../app/[locale]/nutrition/payment/return/page.tsx");
beforeEach(() => { failure = null; stored = payment(); lookupFailure = false; recoveredSessions = []; logs = []; });
const page = (locale = "en", sessionId: string | undefined = session) => Page({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ session_id: sessionId }) });
const html = async (locale = "en") => renderToStaticMarkup(await page(locale));

for (const locale of ["en", "th", "zh-CN"]) test(`RETURN-01 ${locale}: paid confirmation survives a return-page exception`, async () => {
  failure = Error("Payment changed; retry fulfillment preparation");
  await assert.rejects(page(locale), { destination: `/${locale}/nutrition/progress?plan=${planId}` });
  assert.deepEqual(recoveredSessions, [session]);
  assert.equal(logs.length, 1);
});
test("RETURN-02 pending fulfillment keeps paid access and its plan context", async () => {
  failure = Error("transient provider failure"); stored = { ...payment(), fulfillmentStatus: "pending" };
  await assert.rejects(page(), { destination: `/en/nutrition/progress?plan=${planId}` });
});
test("RETURN-03 paid reservation resumes its existing assessment journey", async () => {
  failure = Error("transient failure"); stored = { ...payment(), planId: null };
  const body = await html(); assert.match(body, /Continue assessment/); assert.match(body, /nutrition\/quiz\?payment=/); assert.doesNotMatch(body, /Return home|quick review/);
});
test("RETURN-04 unknown payment verification retries the same session without claiming receipt", async () => {
  failure = Error("provider unavailable"); stored = null;
  const body = await html(); assert.match(body, /Check again/); assert.match(body, /session_id=cs_test_payment_return_regression/); assert.doesNotMatch(body, /Return home|Payment received|quick review|logged this for review/);
});
test("RETURN-05 lookup failure keeps retry available and records both failures without secrets", async () => {
  failure = Error("secret-provider-token customer@example.test"); lookupFailure = true;
  const body = await html(); assert.match(body, /Check again/); assert.equal(logs.length, 2);
  assert.doesNotMatch(JSON.stringify(logs), /secret-provider-token|customer@example.test|cs_test_payment_return_regression/);
});
test("RETURN-06 unpaid stored checkout is not mistaken for confirmed payment", async () => {
  failure = Error("provider unavailable"); stored = { ...payment(), status: "processing", paidAt: null, fulfillmentStatus: "not_started" };
  const body = await html(); assert.match(body, /Check again/); assert.doesNotMatch(body, /Payment confirmed|Payment received/);
});
test("RETURN-07 ordinary successful return still redirects without a recovery read", async () => {
  await assert.rejects(page(), { destination: `/en/nutrition/progress?plan=${planId}` }); assert.deepEqual(recoveredSessions, []); assert.deepEqual(logs, []);
});
test("RETURN-08 stored expiry remains expired without inventing payment success", async () => {
  failure = Error("provider unavailable"); stored = { ...payment(), status: "expired", paidAt: null, fulfillmentStatus: "not_started" };
  const body = await html(); assert.match(body, /This checkout session has expired/); assert.doesNotMatch(body, /Payment received|quick review/);
});
