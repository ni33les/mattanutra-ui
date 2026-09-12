import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import Stripe from "stripe";
import { closeSqlPool } from "../../lib/db.ts";
import { fulfillCheckoutSession, handleStripeWebhookPayload, bindPaidReservationToAssessment } from "../../lib/stripe-payments.ts";
import { fulfillWebPayment, enqueueWebPaymentFulfillment } from "../../lib/web-payment-fulfillment.ts";
import { paymentFulfillmentEvidence } from "../../lib/payment-fulfillment-evidence.ts";
import { isolated, paidFixture } from "./helpers.ts";
after(closeSqlPool);

test("PAY-RECOVER-01 historical live return uses completion evidence without provider access", async () => {
  await isolated(async sql => {
    const p = await paidFixture(sql);
    const session = `cs_historical_${randomUUID()}`;
    // Model a historical live provider identity without making a network call.
    await sql`update payments set stripe_mode='live',stripe_checkout_session_id=${session} where id=${p.id}::uuid`;
    await sql`update finance_transactions set metadata=metadata || ${sql.json({ stripeCheckoutSessionId: session })} where source_ref=${`stripe:payment:${p.id}:nominal-revenue`}`;
    const result = await fulfillCheckoutSession(session, { source: "return_page" });
    assert.equal(result.payment.fulfillmentStatus, "complete");
    assert.equal((await sql`select count(*)::int as n from tasks where payload->>'paymentId'=${p.id}`)[0].n, 0);
  });
});
test("PAY-RECOVER-02 accounting-only reservation recovery does not obtain a new FX rate", async () => {
  await isolated(async sql => {
    const p = await paidFixture(sql, { plan: false, receipt: false }); let sessionCalls = 0;
    const result = await fulfillWebPayment(p.id, { session: async () => { sessionCalls++; return null; }, rate: async () => { throw new Error("Existing booking must not request FX"); } });
    assert.equal(result.fulfillmentStatus, "complete"); assert.equal(sessionCalls, 1);
  });
});
test("PAY-RECOVER-03 paid and accounting or telemetry alone never proves plan completion", async () => {
  for (const options of [{ adoption: false }, { accounting: false }, { receipt: false }]) await isolated(async sql => {
    const p = await paidFixture(sql, options); assert.notEqual((await paymentFulfillmentEvidence(sql, p)).status, "complete");
    assert.ok(await enqueueWebPaymentFulfillment(sql, p));
  });
});
test("PAY-RECOVER-04 reservation evidence cannot complete a newly bound assessment", async () => {
  await isolated(async sql => {
    const p = await paidFixture(sql, { plan: false }); assert.equal((await paymentFulfillmentEvidence(sql, p)).status, "complete");
    const planId = randomUUID(); await sql`insert into assessments(plan_id,locale,status,answers,answer_summary) values (${planId}::uuid,'en','captured','{}','{}')`;
    const bound = await bindPaidReservationToAssessment({ paymentId: p.id, planId, locale: "en" });
    assert.equal(bound?.fulfillmentStatus, "pending");
    assert.equal((await sql`select count(*)::int as n from tasks where payload->>'paymentId'=${p.id}`)[0].n, 1);
  });
});
test("PAY-RECOVER-05 obsolete task and duplicate signed webhook do not restart completed historical work", async () => {
  await isolated(async sql => {
    const p = await paidFixture(sql); const before = await sql`select row_to_json(p)::text as exact from payments p where id=${p.id}::uuid`;
    assert.equal((await fulfillWebPayment(p.id)).fulfillmentStatus, "complete");
    const secret = "whsec_payment_replay_fixture";
    Object.assign(process.env, { STRIPE_SECRET_KEY: "sk_test_payment_replay_fixture", STRIPE_WEBHOOK_SECRET_FAT: secret });
    const payload = JSON.stringify({ id: `evt_${randomUUID()}`, object: "event", type: "checkout.session.completed", livemode: false,
      data: { object: { id: p.stripe_checkout_session_id, object: "checkout.session", payment_status: "paid", metadata: { paymentId: p.id } } } });
    const delivery = { payload, payloadShape: "fat" as const, signature: Stripe.webhooks.generateTestHeaderString({ payload, secret }) };
    await handleStripeWebhookPayload(delivery); await handleStripeWebhookPayload(delivery);
    assert.deepEqual(await sql`select row_to_json(p)::text as exact from payments p where id=${p.id}::uuid`, before);
    assert.equal((await sql`select count(*)::int as n from tasks where payload->>'paymentId'=${p.id}`)[0].n, 0);
  });
});
test("PAY-RECOVER-06 conflicting accounting is rejected before fulfillment admission", async () => {
  await isolated(async sql => {
    const p = await paidFixture(sql, { receipt: false });
    await assert.rejects(enqueueWebPaymentFulfillment(sql, { ...p, amount: 790000000 }), { code: "payment_accounting_conflict" });
    assert.equal((await sql`select count(*)::int as n from tasks where payload->>'paymentId'=${p.id}`)[0].n, 0);
  });
});
test("PAY-RECOVER-07 missing completion receipt resumes without repeating proven plan adoption", async () => {
  await isolated(async sql => {
    const p = await paidFixture(sql, { receipt: false });
    const [before] = await sql`select row_to_json(a)::text as exact from assessments a where plan_id=${p.plan_id}::uuid`;
    await fulfillWebPayment(p.id, { session: async () => null, rate: async () => { throw new Error("No new booking"); } });
    const [after] = await sql`select row_to_json(a)::text as exact from assessments a where plan_id=${p.plan_id}::uuid`;
    assert.deepEqual(after, before);
    assert.equal((await sql`select count(*)::int as n from tasks where plan_id=${p.plan_id}::uuid`)[0].n, 0);
  });
});
