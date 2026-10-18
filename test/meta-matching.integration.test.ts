import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { META_EVENTS, metaEventEnabled } from "../lib/meta-event-policy.ts";
import { metaContactMatching, metaHashedMatching } from "../lib/meta-matching.ts";
import { bindMetaContext, enqueueMetaEvent, recordMetaPlanMilestone, recordMetaPurchase, requestMetaContext, setMetaConsent, type MetaContext } from "../lib/meta-tracking.ts";
import { sendMetaEvent } from "../lib/meta-dispatch.ts";

assert.ok(process.env.TEST_DB_URL, "This integration test requires isolated PostgreSQL");
describe("customer matching across Meta events", () => {
  const contexts: string[] = [], plans: string[] = [], retail: string[] = [], payments: string[] = [];
  before(async () => {
    fixtureDatabaseUrl();
    Object.assign(process.env, { DB_URL: process.env.TEST_DB_URL, MATTANUTRA_ENV: "dev", META_TRACKING_ENABLED: "true",
      FACEBOOK_PIXEL_ID_DEV: "123456789012345", FACEBOOK_CAPI_ACCESS_TOKEN_DEV: "fixture-not-a-real-token" });
    await getSql()!.unsafe(readFileSync(new URL("../scripts/meta-tracking-schema.sql", import.meta.url), "utf8"));
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async tx => {
      await tx`set local session_replication_role=replica`;
      const events = await tx`select task_id from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      const taskIds = events.map(row => row.task_id).filter(Boolean);
      await cleanupFixtureRelationships(tx, { taskIds, planIds: plans });
      await tx`delete from public.task_events where task_id=any(${taskIds}::uuid[])`;
      await tx`delete from public.tasks where id=any(${taskIds}::uuid[])`;
      await tx`delete from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_bindings where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_contexts where id=any(${contexts}::uuid[])`;
      await tx`delete from public.retail_checkout_payments where id=any(${retail}::uuid[])`;
      await tx`delete from public.payments where id=any(${payments}::uuid[])`;
      await tx`delete from public.assessments where plan_id=any(${plans}::uuid[])`;
    });
    await closeSqlPool();
  });

  function request(id?: string) {
    return new Request("https://dev.mattanutra.com/en", { headers: {
      ...(id ? { cookie: `mn_marketing=granted; mn_marketing_context=${id}` } : {}), "user-agent": "Test browser"
    } });
  }
  async function consent() {
    const id = await setMetaConsent(request(), true, "/en"); contexts.push(id);
    return { id, request: request(id), context: (await requestMetaContext(request(id)))! };
  }
  async function plan() {
    const id = randomUUID(); plans.push(id);
    await getSql()!`insert into public.assessments (plan_id,locale,answers,answer_summary,health_score,first_name,contact_email)
      values (${id}::uuid,'en','{"country":"TH","sex":"female","age":"35","meds":"never-export"}','{}','{}','Fixture','fixture@example.com')`;
    return id;
  }
  async function capture(context: MetaContext, name: typeof META_EVENTS[number], data: Record<string, unknown> = {}) {
    const id = await withDatabaseTransaction(getSql()!, tx => enqueueMetaEvent(tx, { context, name,
      sourceKey: randomUUID(), sourceUrl: "/en", data: { value: 250, currency: "THB", ...data } }));
    assert.ok(id); return id;
  }
  async function deliver(id: string) {
    let event: { user_data: Record<string, unknown>; custom_data: Record<string, unknown> } | undefined;
    await sendMetaEvent(id, async (_url, init) => {
      event = JSON.parse(String(init?.body)).data[0]; return new Response('{"events_received":1}');
    });
    assert.ok(event); return event;
  }

  it("enriches Lead immediately and later ViewContent without changing the anonymous PageView", async () => {
    const c = await consent(), early = await capture(c.context, "PageView"), planId = await plan();
    const submitted = await withDatabaseTransaction(getSql()!, async tx => {
      await bindMetaContext(tx, "plan", planId, c.request);
      return recordMetaPlanMilestone(tx, planId, "Lead", "en");
    });
    assert.ok(submitted);
    const viewed = await capture((await requestMetaContext(c.request))!, "ViewContent");
    const expected = metaContactMatching({ email: "fixture@example.com", firstName: "Fixture", country: "TH" });
    for (const id of [submitted, viewed]) {
      const outbound = await deliver(id);
      assert.deepEqual(metaHashedMatching(outbound.user_data), expected);
      assert.equal(outbound.user_data.ge, undefined); assert.equal(outbound.user_data.db, undefined);
      assert.doesNotMatch(JSON.stringify(outbound), /fixture@example|never-export|female|Fixture/);
      for (const key of Object.keys(expected)) assert.equal(outbound.custom_data[key], undefined);
    }
    assert.deepEqual(metaHashedMatching((await deliver(early)).user_data), {});
  });

  it("gives every event the available persisted checkout and assessment identifiers", async () => {
    const c = await consent(), planId = await plan(), paymentId = randomUUID(); retail.push(paymentId);
    await getSql()!`insert into public.retail_checkout_payments
      (id,plan_id,amount,currency,stripe_mode,idempotency_key,customer_email,customer_phone,customer_name,shipping_address)
      values (${paymentId}::uuid,${planId}::uuid,250000000,'THB','test',${randomUUID()},'fixture@example.com','+66812345678','Fixture Customer',
      '{"country":"TH","city":"Bangkok","province":"Bangkok","postalCode":"10110","addressLine1":"never-export"}')`;
    await withDatabaseTransaction(getSql()!, tx => bindMetaContext(tx, "retail", paymentId, c.request));
    const expected = metaContactMatching({ email: "fixture@example.com", phone: "+66812345678", firstName: "Fixture",
      country: "TH", city: "Bangkok", region: "Bangkok", postalCode: "10110" });
    for (const name of META_EVENTS.filter(metaEventEnabled)) {
      const outbound = await deliver(await capture((await requestMetaContext(c.request))!, name));
      assert.deepEqual(metaHashedMatching(outbound.user_data), expected, name);
      assert.equal(outbound.user_data.ln, undefined, "A full delivery name does not provide an unambiguous surname");
      assert.doesNotMatch(JSON.stringify(outbound), /fixture@example|never-export|Fixture Customer|Bangkok|66812345678/);
    }
  });

  it("never resolves identity through an unbound browser-supplied plan ID or raw event data", async () => {
    const owner = await consent(), stranger = await consent(), planId = await plan();
    await withDatabaseTransaction(getSql()!, tx => bindMetaContext(tx, "plan", planId, owner.request));
    const event = await deliver(await capture(stranger.context, "ViewContent", { planId, email: "untrusted@example.com",
      firstName: "Untrusted", gender: "female", dateOfBirth: "1990-01-01", user_data: { em: "untrusted@example.com" } }));
    assert.deepEqual(metaHashedMatching(event.user_data), {});
    assert.doesNotMatch(JSON.stringify(event), /untrusted|Untrusted|female|1990-01-01/);
  });

  it("keeps known plan identity when a newer checkout has no attached plan", async () => {
    const c = await consent(), planId = await plan(), paymentId = randomUUID(); payments.push(paymentId);
    await withDatabaseTransaction(getSql()!, tx => bindMetaContext(tx, "plan", planId, c.request));
    await getSql()!`insert into public.payments (id,selected_plan,amount,currency,stripe_mode,customer_email)
      values (${paymentId}::uuid,'precision',690000000,'THB','mock','fixture@example.com')`;
    await withDatabaseTransaction(getSql()!, tx => bindMetaContext(tx, "payment", paymentId, c.request));
    const event = await deliver(await capture((await requestMetaContext(c.request))!, "PageView"));
    assert.deepEqual(metaHashedMatching(event.user_data), metaContactMatching({ email: "fixture@example.com", firstName: "Fixture", country: "TH" }));
  });

  it("uses the confirmed purchase's own contact and excludes another customer's newer checkout identity", async () => {
    const c = await consent(), planId = await plan(), olderId = randomUUID(), newerId = randomUUID();
    retail.push(olderId, newerId);
    await getSql()!`insert into public.retail_checkout_payments
      (id,plan_id,amount,currency,stripe_mode,idempotency_key,customer_email,customer_phone,shipping_address)
      values (${olderId}::uuid,${planId}::uuid,250000000,'THB','test',${randomUUID()},'fixture@example.com','+66812345678',
      '{"country":"TH","city":"Bangkok","province":"Bangkok","postalCode":"10110"}'),
      (${newerId}::uuid,${planId}::uuid,250000000,'THB','test',${randomUUID()},'different@example.com','+442079460958',
      '{"country":"GB","city":"London","province":"London","postalCode":"SW1A 1AA"}')`;
    await withDatabaseTransaction(getSql()!, async tx => {
      await bindMetaContext(tx, "plan", planId, c.request, { email: "fixture@example.com", firstName: "Fixture" });
      await bindMetaContext(tx, "retail", olderId, c.request, { email: "fixture@example.com", phone: "+66812345678", country: "TH" });
    });
    await withDatabaseTransaction(getSql()!, tx => bindMetaContext(tx, "retail", newerId, c.request, { email: "different@example.com", phone: "+442079460958", country: "GB" }));
    const current = (await requestMetaContext(c.request))!;
    assert.equal(current.matching.fn, undefined, "Changing identity drops stale names and geography");
    const purchaseId = await withDatabaseTransaction(getSql()!, tx => recordMetaPurchase(tx, {
      type: "retail", id: olderId, planId, sessionId: `fixture_${olderId}`, amount: 250, currency: "THB", locale: "en", mode: "test",
      paidAt: new Date(), email: "fixture@example.com"
    }));
    assert.ok(purchaseId);
    assert.deepEqual(metaHashedMatching((await deliver(purchaseId)).user_data), metaContactMatching({ email: "fixture@example.com", phone: "+66812345678",
      firstName: "Fixture", country: "TH", city: "Bangkok", region: "Bangkok", postalCode: "10110" }));
    const browser = await deliver(await capture((await requestMetaContext(c.request))!, "ViewContent"));
    assert.deepEqual(metaHashedMatching(browser.user_data), metaContactMatching({ email: "different@example.com", phone: "+442079460958",
      country: "GB", city: "London", region: "London", postalCode: "SW1A 1AA" }));
    assert.equal(browser.user_data.fn, undefined, "The related assessment's different customer is not mixed into this checkout");
  });

  it("withdrawal clears the enriched identifiers and suppresses queued delivery", async () => {
    const c = await consent(), planId = await plan();
    await withDatabaseTransaction(getSql()!, tx => bindMetaContext(tx, "plan", planId, c.request));
    const id = await capture((await requestMetaContext(c.request))!, "ViewContent");
    assert.ok((await getSql()!`select matching from public.meta_conversion_events where id=${id}::uuid`)[0].matching.fn);
    await setMetaConsent(c.request, false);
    assert.deepEqual((await getSql()!`select matching from public.meta_tracking_contexts where id=${c.id}::uuid`)[0].matching, {});
    assert.deepEqual((await getSql()!`select matching from public.meta_conversion_events where id=${id}::uuid`)[0].matching, {});
    assert.equal((await sendMetaEvent(id, async () => { throw new Error("Delivery after withdrawal"); })).status, "suppressed");
  });
});
