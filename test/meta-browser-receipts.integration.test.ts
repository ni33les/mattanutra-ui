import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { after, before, describe, it } from "node:test";
import type Stripe from "stripe";
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { bindMetaContext, enqueueMetaEvent, recordMetaPlanMilestone, requestMetaContext, setMetaConsent } from "../lib/meta-tracking.ts";
import { createStripeCheckoutSession, completeMockPayment } from "../lib/stripe-payments.ts";
import { recordRetailProviderSession, type RetailSessionPayment } from "../lib/retail-checkout-provider-session.ts";

register("../scripts/matcher-http-loader.mjs", import.meta.url);
const { GET: receipts, POST: browserEvent } = await import("../app/api/marketing/events/route.ts");
assert.ok(process.env.TEST_DB_URL, "This integration test requires isolated PostgreSQL");

describe("authoritative browser event receipts", () => {
  const contexts: string[] = [], plans: string[] = [], payments: string[] = [], retail: string[] = [], requestKeys: string[] = [];
  before(async () => {
    fixtureDatabaseUrl();
    Object.assign(process.env, { DB_URL: process.env.TEST_DB_URL, MATTANUTRA_ENV: "dev", STRIPE_PAYMENT_MODE: "mock",
      META_TRACKING_ENABLED: "true", FACEBOOK_PIXEL_ID_DEV: "123456789012345", FACEBOOK_CAPI_ACCESS_TOKEN_DEV: "fixture-not-a-real-token" });
    await getSql()!.unsafe(readFileSync(new URL("../scripts/meta-tracking-schema.sql", import.meta.url), "utf8"));
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async tx => {
      await tx`set local session_replication_role=replica`;
      const events = await tx`select task_id from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      const jobs = await tx`select id from public.tasks where payload->>'paymentId'=any(${payments})`;
      const taskIds = [...events.map(row => row.task_id).filter(Boolean), ...jobs.map(row => row.id)];
      await cleanupFixtureRelationships(tx, { taskIds, planIds: plans });
      await tx`delete from public.task_events where task_id=any(${taskIds}::uuid[])`;
      await tx`delete from public.tasks where id=any(${taskIds}::uuid[])`;
      await tx`delete from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_bindings where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_contexts where id=any(${contexts}::uuid[])`;
      await tx`delete from public.payment_versions where payment_id=any(${payments}::uuid[])`;
      await tx`delete from public.payments where id=any(${payments}::uuid[])`;
      await tx`delete from public.funnel_requests where request_key=any(${requestKeys})`;
      await tx`delete from public.retail_checkout_payments where id=any(${retail}::uuid[])`;
      await tx`delete from public.assessments where plan_id=any(${plans}::uuid[])`;
    });
    await closeSqlPool();
  });
  function request(id?: string, query = "", extraHeaders: Record<string, string> = {}) {
    return new Request(`https://dev.mattanutra.com/api/marketing/events${query}`, { headers: {
      origin: "https://dev.mattanutra.com", "sec-fetch-site": "same-origin",
      ...(id ? { cookie: `mn_marketing=granted; mn_marketing_context=${id}` } : {}), ...extraHeaders
    } });
  }
  async function consent() {
    const id = await setMetaConsent(request(), true, "/en"); contexts.push(id);
    return { id, request: request(id), context: (await requestMetaContext(request(id)))! };
  }
  async function plan() {
    const id = randomUUID(); plans.push(id);
    await getSql()!`insert into public.assessments (plan_id,locale,answers,answer_summary,health_score,contact_email)
      values (${id}::uuid,'en','{}','{}','{}','fixture@example.com')`;
    return id;
  }

  it("exposes a plan Purchase only after verified payment and preserves its original ID and value", async () => {
    const c = await consent(), key = randomUUID(); requestKeys.push(key);
    const session = await createStripeCheckoutSession({ locale: "en", selectedPlan: "precision", sourceSurface: "landing", idempotencyKey: key, request: c.request });
    payments.push(session.paymentId);
    assert.equal((await (await receipts(c.request)).json()).events.length, 0);
    await completeMockPayment({ paymentId: session.paymentId });
    const [stored] = await getSql()!`select id,custom_data from public.meta_conversion_events where context_id=${c.id}::uuid and event_name='Purchase'`;
    const response = await receipts(c.request), body = await response.json();
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(body.environment, "dev"); assert.equal(body.pixelId, "123456789012345");
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].name, "Purchase"); assert.equal(body.events[0].eventId, stored.id);
    assert.equal(body.events[0].data.value, 690); assert.equal(body.events[0].data.currency, "THB");
    assert.equal(body.events[0].data.purchase_type, "plan"); assert.deepEqual(body.events[0].data, stored.custom_data);
    assert.ok(Number.isFinite(Date.parse(body.events[0].occurredAt)));
    assert.deepEqual((await (await receipts(c.request)).json()).events, body.events, "Polling never creates another event");
  });

  it("returns confirmed product purchases and server quiz milestones while browser creation stays forbidden", async () => {
    const c = await consent(), planId = await plan();
    await withDatabaseTransaction(getSql()!, async tx => {
      await bindMetaContext(tx, "plan", planId, c.request);
      for (const name of ["QuizSubmitted", "EmailCapture", "Lead"] as const) await recordMetaPlanMilestone(tx, planId, name, "en");
    });
    const [payment] = await getSql()!<RetailSessionPayment[]>`insert into public.retail_checkout_payments (id,plan_id,amount,currency,stripe_mode,idempotency_key)
      values (${randomUUID()}::uuid,${planId}::uuid,250000000,'THB','test',${randomUUID()}) returning *`;
    retail.push(payment.id);
    await withDatabaseTransaction(getSql()!, tx => bindMetaContext(tx, "retail", payment.id, c.request));
    const session = { id: `cs_fixture_${payment.id}`, payment_status: "unpaid", status: "open", amount_total: 25000,
      currency: "thb", livemode: false, metadata: { paymentId: payment.id } } as Stripe.Checkout.Session;
    await recordRetailProviderSession(getSql()!, payment, session);
    assert.deepEqual(new Set((await (await receipts(c.request)).json()).events.map((event: { name: string }) => event.name)), new Set(["EmailCapture", "Lead"]));
    await recordRetailProviderSession(getSql()!, payment, { ...session, payment_status: "paid", status: "complete" });
    const body = await (await receipts(c.request)).json();
    const purchase = body.events.find((event: { name: string }) => event.name === "Purchase");
    assert.equal(purchase.data.purchase_type, "products"); assert.equal(purchase.data.value, 250); assert.equal(purchase.data.currency, "THB");
    for (const name of ["Purchase", "QuizSubmitted", "Lead", "EmailCapture", "OrderSubmitted", "McpConnectionVerified"]) {
      const rejected = await browserEvent(new Request(c.request.url, { method: "POST", headers: c.request.headers,
        body: JSON.stringify({ name, eventId: randomUUID(), sessionId: randomUUID(), sourceUrl: "/en", data: { value: 1, currency: "USD" } }) }));
      assert.equal(rejected.status, 400, name);
    }
  });

  it("isolates context, consent and destination and never returns matching or unapproved fields", async () => {
    const c = await consent(), outsider = await consent(), planId = await plan();
    const id = await withDatabaseTransaction(getSql()!, async tx => {
      await bindMetaContext(tx, "plan", planId, c.request);
      return recordMetaPlanMilestone(tx, planId, "Lead", "en");
    });
    assert.ok(id);
    await getSql()!`update public.meta_conversion_events set source_url='https://dev.mattanutra.com/en?capability=never-export',
      custom_data=custom_data || '{"email":"fixture@example.com","gender":"female","answers":"never-export","user_data":{"em":"never-export"}}'::jsonb
      where id=${id}::uuid`;
    const response = await receipts(c.request), body = await response.json();
    assert.equal(body.events.length, 1);
    assert.deepEqual(Object.keys(body.events[0]).sort(), ["data", "eventId", "name", "occurredAt"]);
    assert.doesNotMatch(JSON.stringify(body), /fixture@example|never-export|user_data|matching|source_url|female/);
    for (const req of [request(), outsider.request, request(randomUUID()), request(c.id, "", { cookie: `mn_marketing=denied; mn_marketing_context=${c.id}` })]) {
      assert.deepEqual((await (await receipts(req)).json()).events, []);
    }
    for (const headers of [{ origin: "https://untrusted.example" }, { "sec-fetch-site": "cross-site" }] as Record<string, string>[]) {
      assert.equal((await receipts(request(c.id, "", headers))).status, 403);
    }
    const noOrigin = new Headers(c.request.headers); noOrigin.delete("origin");
    assert.equal((await (await receipts(new Request(c.request.url, { headers: noOrigin }))).json()).events.length, 1);
    await getSql()!`update public.meta_tracking_contexts set expires_at=now()-interval '1 second' where id=${c.id}::uuid`;
    assert.deepEqual((await (await receipts(c.request)).json()).events, []);
    await getSql()!`update public.meta_tracking_contexts set expires_at=now()+interval '1 day' where id=${c.id}::uuid`;
    await getSql()!`update public.meta_conversion_events set status='suppressed' where id=${id}::uuid`;
    assert.deepEqual((await (await receipts(c.request)).json()).events, []);
    await getSql()!`update public.meta_conversion_events set status='queued',pixel_id='999999999999999' where id=${id}::uuid`;
    assert.deepEqual((await (await receipts(c.request)).json()).events, []);
    await getSql()!`update public.meta_conversion_events set pixel_id='123456789012345',environment='uat' where id=${id}::uuid`;
    assert.deepEqual((await (await receipts(c.request)).json()).events, []);
    await getSql()!`update public.meta_conversion_events set environment='dev' where id=${id}::uuid`;
    process.env.META_TRACKING_ENABLED = "false";
    try { assert.deepEqual((await (await receipts(c.request)).json()).events, []); }
    finally { process.env.META_TRACKING_ENABLED = "true"; }
    await setMetaConsent(c.request, false);
    assert.deepEqual((await (await receipts(c.request)).json()).events, []);
  });

  it("caps stale receipts and result volume while retaining confirmed events whose CAPI delivery failed", async () => {
    const c = await consent(), now = Date.now();
    async function event(occurredAt: Date) {
      return withDatabaseTransaction(getSql()!, tx => enqueueMetaEvent(tx, { context: c.context, name: "McpConnectionVerified",
        sourceKey: randomUUID(), sourceUrl: "/en/connect", occurredAt, data: { provider: "chatgpt", stage: "connect_verified" } }));
    }
    const old = await event(new Date(now - 11 * 60_000)), future = await event(new Date(now + 60_000));
    const recent: string[] = [];
    for (let i = 0; i < 55; i++) { const id = await event(new Date(now - i * 1000)); assert.ok(id); recent.push(id); }
    for (const [index, status] of ["rejected", "retrying", "sending", "accepted"].entries()) {
      await getSql()!`update public.meta_conversion_events set status=${status} where id=${recent[index]}::uuid`;
    }
    const body = await (await receipts(request(c.id, `?after=${encodeURIComponent(new Date(now - 86400_000).toISOString())}`))).json();
    assert.equal(body.events.length, 50);
    assert.deepEqual(body.events.map((item: { eventId: string }) => item.eventId), recent.slice(0, 50));
    assert.ok(!body.events.some((item: { eventId: string }) => item.eventId === old || item.eventId === future));
    const after = new Date(now - 12_000).toISOString();
    const limited = await (await receipts(request(c.id, `?after=${encodeURIComponent(after)}`))).json();
    assert.equal(limited.events.length, 13);
    assert.ok(limited.events.every((item: { occurredAt: string }) => Date.parse(item.occurredAt) >= Date.parse(after)));
    for (const invalid of ["not-a-date", "1", new Date(Date.now() + 60_000).toISOString()]) {
      assert.equal((await receipts(request(c.id, `?after=${encodeURIComponent(invalid)}`))).status, 400);
    }
  });
});
