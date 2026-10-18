import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { after, before, describe, it } from "node:test";
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { bindMetaContext, recordMetaCheckout, setMetaConsent } from "../lib/meta-tracking.ts";

register("../scripts/matcher-http-loader.mjs", import.meta.url);
const { POST: browserEvent } = await import("../app/api/marketing/events/route.ts");
assert.ok(process.env.TEST_DB_URL, "This integration test requires isolated PostgreSQL");

describe("validated browser checkout receipts", () => {
  const contexts: string[] = [], payments: string[] = [], retail: string[] = [];
  const planId = randomUUID();
  before(async () => {
    fixtureDatabaseUrl();
    Object.assign(process.env, { DB_URL: process.env.TEST_DB_URL, MATTANUTRA_ENV: "dev",
      META_TRACKING_ENABLED: "true", FACEBOOK_PIXEL_ID_DEV: "123456789012345", FACEBOOK_CAPI_ACCESS_TOKEN_DEV: "fixture-not-a-real-token" });
    await getSql()!.unsafe(readFileSync(new URL("../scripts/meta-tracking-schema.sql", import.meta.url), "utf8"));
    await getSql()!`insert into public.assessments(plan_id,locale,answers,answer_summary,health_score)
      values (${planId}::uuid,'th','{}','{}','{}')`;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async tx => {
      await tx`set local session_replication_role=replica`;
      const events = await tx`select task_id from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      const taskIds = events.map(row => row.task_id).filter(Boolean);
      await cleanupFixtureRelationships(tx, { taskIds, planIds: [planId] });
      await tx`delete from public.task_events where task_id=any(${taskIds}::uuid[])`;
      await tx`delete from public.tasks where id=any(${taskIds}::uuid[])`;
      await tx`delete from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_bindings where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_contexts where id=any(${contexts}::uuid[])`;
      await tx`delete from public.payment_versions where payment_id=any(${payments}::uuid[])`;
      await tx`delete from public.payments where id=any(${payments}::uuid[])`;
      await tx`delete from public.retail_checkout_payments where id=any(${retail}::uuid[])`;
      await tx`delete from public.assessments where plan_id=${planId}::uuid`;
    });
    await closeSqlPool();
  });

  function request(id?: string) {
    return new Request("https://dev.mattanutra.com/api/marketing/events", { headers: {
      origin: "https://dev.mattanutra.com",
      ...(id ? { cookie: `mn_marketing=granted; mn_marketing_context=${id}` } : {})
    } });
  }
  async function consent() {
    const id = await setMetaConsent(request(), true, "/th"); contexts.push(id);
    return id;
  }
  async function checkout(contextId: string, type: "payment" | "retail" = "payment",
    options: { session?: string | null; status?: string; bind?: boolean } = {}) {
    const id = randomUUID(), sql = getSql()!;
    const session = options.session === undefined ? `cs_fixture_${id}` : options.session;
    const status = options.status ?? "checkout_session_created";
    if (type === "payment") {
      payments.push(id);
      await sql`insert into public.payments(id,plan_id,selected_plan,locale,amount,currency,stripe_mode,status,stripe_checkout_session_id)
        values (${id}::uuid,${planId}::uuid,'precision','th',690000000,'THB','test',${status},${session})`;
    } else {
      retail.push(id);
      await sql`insert into public.retail_checkout_payments(id,plan_id,locale,amount,currency,stripe_mode,status,stripe_checkout_session_id,idempotency_key,metadata)
        values (${id}::uuid,${planId}::uuid,'th',250000000,'THB','test',${status},${session},${randomUUID()},'{"channel":"mcp"}')`;
    }
    if (options.bind !== false) await withDatabaseTransaction(sql, tx => bindMetaContext(tx, type, id, request(contextId)));
    return id;
  }
  async function capture(contextId: string, attemptId: string, eventId = randomUUID()) {
    const response = await browserEvent(new Request(request().url, { method: "POST", headers: request(contextId).headers,
      body: JSON.stringify({ name: "InitiateCheckout", eventId, sessionId: randomUUID(), attemptId,
        sourceUrl: "/en/nutrition/payment/checkout", data: { value: 1, currency: "USD", locale: "en",
          offer: "pro", channel: "retail", planId: randomUUID(), purchase_type: "products" } }) }));
    assert.equal(response.status, 200);
    return response.json();
  }
  async function events(contextId: string) {
    return getSql()!`select id,custom_data,task_id from public.meta_conversion_events where context_id=${contextId}::uuid`;
  }

  it("does not author a checkout from a browser-only UUID or an unbound payment", async () => {
    const context = await consent();
    for (const attempt of [randomUUID(), await checkout(context, "payment", { bind: false }), await checkout(context, "retail", { bind: false })]) {
      assert.deepEqual(await capture(context, attempt), { accepted: false, eventId: null });
    }
    assert.equal((await events(context)).length, 0);
  });

  it("requires a usable saved session before recovering missing receipts", async () => {
    const context = await consent();
    for (const type of ["payment", "retail"] as const) {
      for (const options of [
        { session: null }, { session: " " }, { status: "created" },
        { status: "failed" }, { status: "cancelled" }, { status: "expired" }, { status: "paid" }
      ]) {
        const attempt = await checkout(context, type, options);
        assert.deepEqual(await capture(context, attempt), { accepted: false, eventId: null }, `${type}: ${JSON.stringify(options)}`);
      }
    }
    assert.equal((await events(context)).length, 0);
  });

  it("recovers a plan checkout using saved payment facts and a server event ID", async () => {
    const context = await consent(), attempt = await checkout(context), browserId = randomUUID();
    const receipt = await capture(context, attempt, browserId);
    assert.equal(receipt.accepted, true);
    assert.notEqual(receipt.eventId, browserId);
    assert.deepEqual(receipt.data, { mn_env: "dev", event_schema: "1", channel: "web", plan_id: planId,
      value: 690, currency: "THB", purchase_type: "plan", offer: "precision", locale: "th", funnel_stage: "checkout" });
    const [stored] = await events(context);
    assert.equal(stored.id, receipt.eventId);
    assert.deepEqual(stored.custom_data, receipt.data);
    assert.ok(stored.task_id);
    assert.deepEqual(await capture(context, attempt), receipt);
    assert.equal((await events(context)).length, 1);
  });

  it("recovers retail checkout amounts and its channel from the bound payment", async () => {
    const context = await consent(), attempt = await checkout(context, "retail");
    const receipt = await capture(context, attempt);
    assert.equal(receipt.accepted, true);
    assert.deepEqual(receipt.data, { mn_env: "dev", event_schema: "1", channel: "mcp", plan_id: planId,
      value: 250, currency: "THB", purchase_type: "products", locale: "th", funnel_stage: "checkout" });
  });

  it("cannot create or retrieve another marketing context's checkout receipt", async () => {
    const owner = await consent(), outsider = await consent(), attempt = await checkout(owner);
    assert.deepEqual(await capture(outsider, attempt), { accepted: false, eventId: null });
    assert.equal((await events(owner)).length, 0);
    const receipt = await capture(owner, attempt);
    assert.equal(receipt.accepted, true);
    assert.deepEqual(await capture(outsider, attempt), { accepted: false, eventId: null });
    assert.equal((await events(outsider)).length, 0);
    assert.equal((await events(owner)).length, 1);
  });

  it("returns one durable event and task when browser retries race server capture", async () => {
    const context = await consent(), attempt = await checkout(context);
    const receipts = await Promise.all([capture(context, attempt), capture(context, attempt),
      withDatabaseTransaction(getSql()!, tx => recordMetaCheckout(tx, {
        type: "payment", id: attempt, planId, amount: 690, currency: "THB", locale: "th", selectedPlan: "precision"
      }))]);
    assert.equal(receipts[0].accepted, true);
    assert.deepEqual(receipts[0], receipts[1]);
    const stored = await events(context);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, receipts[0].eventId);
    const tasks = await getSql()!`select id from public.tasks where payload->>'eventId'=${stored[0].id}`;
    assert.deepEqual(tasks.map(row => row.id), [stored[0].task_id]);
  });

  it("preserves confirmed receipts after checkout ends and never revives suppressed delivery", async () => {
    const context = await consent(), attempt = await checkout(context);
    const eventId = await withDatabaseTransaction(getSql()!, tx => recordMetaCheckout(tx, {
      type: "payment", id: attempt, planId, amount: 690, currency: "THB", locale: "th", selectedPlan: "precision"
    }));
    await getSql()!`update public.payments set status='expired' where id=${attempt}::uuid`;
    const receipt = await capture(context, attempt);
    assert.equal(receipt.accepted, true);
    assert.equal(receipt.eventId, eventId);
    assert.equal(receipt.data.value, 690);
    await getSql()!`update public.meta_conversion_events set status='suppressed' where id=${eventId}::uuid`;
    assert.deepEqual(await capture(context, attempt), { accepted: false, eventId: null });
    assert.equal((await events(context)).length, 1);
  });
});
