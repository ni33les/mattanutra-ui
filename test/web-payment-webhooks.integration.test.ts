import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import Stripe from "stripe";
import { getSql, closeSqlPool, withDatabaseTransaction } from "../lib/db.ts";
import { handleStripeWebhookPayload } from "../lib/stripe-payments.ts";
const databaseUrl = process.env.TEST_DB_URL;
describe("signed webhook interruption and replay", { skip: !databaseUrl }, () => {
  const paymentId = randomUUID(), eventId = `evt_fixture_${randomUUID()}`, sessionId = `mock_cs_${paymentId}`;
  const secret = "whsec_local_fixture";
  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review/);
    Object.assign(process.env, { DB_URL: databaseUrl, MATTANUTRA_ENV: "dev", STRIPE_PAYMENT_MODE: "mock",
      STRIPE_SECRET_KEY: "sk_test_local_fixture", STRIPE_WEBHOOK_SECRET_FAT: secret });
    await getSql()!`insert into public.payments (id, selected_plan, status, amount, paid_at, stripe_mode, stripe_checkout_session_id)
      values (${paymentId}::uuid, 'precision', 'paid', 690000000, now(), 'mock', ${sessionId})`;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async sql => {
      await sql`set local session_replication_role = replica`;
      await sql`delete from public.stripe_webhook_events where stripe_event_id = ${eventId}`;
      await sql`delete from public.task_events where task_id in (select id from public.tasks where payload->>'paymentId' = ${paymentId})`;
      await sql`delete from public.task_comments where task_id in (select id from public.tasks where payload->>'paymentId' = ${paymentId})`;
      await sql`delete from public.tasks where payload->>'paymentId' = ${paymentId}`;
      await sql`delete from public.payment_versions where payment_id = ${paymentId}::uuid`;
      await sql`delete from public.payments where id = ${paymentId}::uuid`;
    });
    await closeSqlPool();
  });
  function delivery() {
    const payload = JSON.stringify({ id: eventId, object: "event", type: "checkout.session.completed", livemode: false,
      data: { object: { id: sessionId, object: "checkout.session", payment_status: "paid", metadata: { paymentId } } } });
    return { payload, payloadShape: "fat" as const, signature: Stripe.webhooks.generateTestHeaderString({ payload, secret }) };
  }
  it("resumes a received event and retries unfinished work even after its event was processed", async () => {
    const sql = getSql()!;
    // Crash after inserting the event, before applying it.
    await sql`insert into public.stripe_webhook_events (stripe_event_id, payload_shape, stripe_mode, event_type, status, payload)
      values (${eventId}, 'fat', 'mock', 'checkout.session.completed', 'received', '{}')`;
    assert.equal((await handleStripeWebhookPayload(delivery())).ok, true);
    const tasks = () => sql`select id, status from public.tasks where payload->>'paymentId' = ${paymentId} and task_type = 'fulfill_web_payment'`;
    assert.equal((await tasks()).length, 1);
    assert.equal((await sql`select status from public.stripe_webhook_events where stripe_event_id = ${eventId}`)[0].status, "processed");
    await Promise.all([handleStripeWebhookPayload(delivery()), handleStripeWebhookPayload(delivery())]);
    assert.equal((await tasks()).length, 1);
    await sql`update public.tasks set status = 'failed' where payload->>'paymentId' = ${paymentId}`;
    await sql`update public.payments set fulfillment_status = 'failed' where id = ${paymentId}::uuid`;
    assert.equal((await handleStripeWebhookPayload(delivery())).ok, true);
    const retried = await tasks();
    assert.equal(retried.length, 2); assert.equal(retried.filter(t => t.status === "queued").length, 1);
  });
});
