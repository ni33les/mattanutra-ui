import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { before, after, describe, it } from "node:test";
import type Stripe from "stripe";
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import { closeSqlPool, databaseTransactionActive, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { bindMetaContext, enqueueMetaEvent, recordMetaPurchase, requestMetaContext, setMetaConsent, setMetaPreference } from "../lib/meta-tracking.ts";
import { sendMetaEvent } from "../lib/meta-dispatch.ts";
import { createStripeCheckoutSession, completeMockPayment } from "../lib/stripe-payments.ts";
import { recordRetailProviderSession, type RetailSessionPayment } from "../lib/retail-checkout-provider-session.ts";
import { register } from "node:module";
register("../scripts/matcher-http-loader.mjs", import.meta.url);
const { POST: browserEvent } = await import("../app/api/marketing/events/route.ts");
const { POST: savePreference } = await import("../app/api/marketing/consent/route.ts");

assert.ok(process.env.TEST_DB_URL, "This integration test requires isolated PostgreSQL");
describe("preference-controlled, durable and isolated Meta delivery", () => {
  const contexts: string[] = [], payments: string[] = [], retail: string[] = [], requestKeys: string[] = [];
  const planId = randomUUID();
  before(async () => {
    fixtureDatabaseUrl();
    Object.assign(process.env, { DB_URL: process.env.TEST_DB_URL, MATTANUTRA_ENV: "dev", STRIPE_PAYMENT_MODE: "mock",
      META_TRACKING_ENABLED: "true", FACEBOOK_PIXEL_ID_DEV: "123456789012345", FACEBOOK_CAPI_ACCESS_TOKEN_DEV: "fixture-not-a-real-token" });
    await getSql()!.unsafe(readFileSync(new URL("../scripts/meta-tracking-schema.sql", import.meta.url), "utf8"));
    await getSql()!`insert into public.assessments (plan_id,locale,answers,answer_summary,health_score)
      values (${planId}::uuid,'en','{}','{}','{}')`;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async tx => {
      await tx`set local session_replication_role=replica`;
      const events = await tx`select task_id from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      const jobs = await tx`select id from public.tasks where payload->>'paymentId'=any(${payments})`;
      const taskIds = [...events.map(r=>r.task_id).filter(Boolean), ...jobs.map(r=>r.id)];
      await cleanupFixtureRelationships(tx, { taskIds, planIds: [planId] });
      await tx`delete from public.task_events where task_id=any(${taskIds}::uuid[])`;
      await tx`delete from public.tasks where id=any(${taskIds}::uuid[])`;
      await tx`delete from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_bindings where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_contexts where id=any(${contexts}::uuid[])`;
      await tx`delete from public.payment_versions where payment_id=any(${payments}::uuid[])`;
      await tx`delete from public.payments where id=any(${payments}::uuid[])`;
      await tx`delete from public.funnel_requests where request_key=any(${requestKeys})`;
      await tx`delete from public.retail_checkout_payments where id=any(${retail}::uuid[])`;
      await tx`delete from public.assessments where plan_id=${planId}::uuid`;
    });
    await closeSqlPool();
  });
  function request(contextId?: string, granted = true) {
    return new Request("https://dev.mattanutra.com/api/assessment", { headers: { origin: "https://dev.mattanutra.com", "user-agent": "Fixture browser", "x-forwarded-for": "192.0.2.15",
      ...(contextId ? { cookie: `mn_marketing=${granted ? "granted" : "denied"}; mn_marketing_context=${contextId}; _fbp=fb.1.1770000000000.12345` } : {}) } });
  }
  async function consent(source: "explicit" | "site_default" = "explicit") {
    const id = (await setMetaPreference(request(), true, "https://dev.mattanutra.com/en?fbclid=fixtureClick", source)).id; contexts.push(id);
    return { id, request: request(id), context: (await requestMetaContext(request(id)))! };
  }
  async function queued() {
    const c = await consent();
    const id = await withDatabaseTransaction(getSql()!, tx => enqueueMetaEvent(tx, { context: c.context, name: "PageView", sourceKey: randomUUID(), sourceUrl: "/en" }));
    assert.ok(id); return { ...c, eventId: id };
  }
  it("requires an enabled tracking context and refuses browser-authored purchases", async () => {
    assert.equal(await requestMetaContext(request()), null);
    const c = await consent();
    assert.equal(await requestMetaContext(request(c.id, false)), null);
    const response = await browserEvent(new Request("https://dev.mattanutra.com/api/marketing/events", {
      method: "POST", headers: request(c.id).headers, body: JSON.stringify({ name: "Purchase", eventId: randomUUID(), sessionId: randomUUID(), sourceUrl: "/en", data: { value: 690, currency: "THB" } }) }));
    assert.equal(response.status, 400);
  });
  it("records automatic activation separately and keeps a saved opt-out on automatic retries", async () => {
    const saved = await setMetaPreference(request(), true, "/en", "site_default"); contexts.push(saved.id);
    assert.equal(saved.granted, true);
    assert.ok(await requestMetaContext(request(saved.id)));
    assert.equal((await getSql()!`select preference_source from public.meta_tracking_contexts where id=${saved.id}::uuid`)[0].preference_source, "site_default");
    await setMetaConsent(request(saved.id), false);
    // A stale browser tab still thinks the old cookie is granted.
    const retried = await setMetaPreference(request(saved.id), true, "/en", "site_default");
    assert.deepEqual(retried, { id: saved.id, granted: false });
    const [row] = await getSql()!`select consent_granted,preference_source,matching from public.meta_tracking_contexts where id=${saved.id}::uuid`;
    assert.equal(row.consent_granted, false); assert.equal(row.preference_source, "explicit"); assert.deepEqual(row.matching, {});
    assert.equal(await requestMetaContext(request(saved.id)), null);
  });
  it("does not initialise tracking when the browser has already opted out", async () => {
    const response = await savePreference(new Request("https://dev.mattanutra.com/api/marketing/consent", { method: "POST",
      headers: { origin: "https://dev.mattanutra.com", cookie: "mn_marketing=denied", "content-type": "application/json" },
      body: JSON.stringify({ granted: true, source: "site_default" }) }));
    assert.equal(response.status, 200); assert.equal((await response.json()).granted, false); assert.equal(response.headers.get("set-cookie"), null);
  });
  it("saves preferences and enqueues events on the www production alias behind the hosting proxy", async () => {
    const keys = ["MATTANUTRA_ENV", "FACEBOOK_CAPI_ACCESS_TOKEN_PRD"] as const;
    const old = keys.map(key => process.env[key]);
    try {
      process.env.MATTANUTRA_ENV = "prd"; process.env.FACEBOOK_CAPI_ACCESS_TOKEN_PRD = "fixture-not-a-real-token";
      const headers = { origin: "https://www.mattanutra.com", "content-type": "application/json" };
      const response = await savePreference(new Request("http://0.0.0.0:8080/api/marketing/consent", { method: "POST", headers,
        body: JSON.stringify({ granted: true, source: "site_default", sourceUrl: "https://www.mattanutra.com/en" }) }));
      assert.equal(response.status, 200); assert.equal((await response.json()).granted, true);
      const cookie = response.headers.get("set-cookie")!;
      const id = cookie.match(/mn_marketing_context=([a-f0-9-]{36})/)?.[1]; assert.ok(id); contexts.push(id);
      assert.match(cookie, /Secure/);
      const event = await browserEvent(new Request("http://0.0.0.0:8080/api/marketing/events", { method: "POST", headers: { ...headers, cookie: `mn_marketing=granted; mn_marketing_context=${id}` },
        body: JSON.stringify({ name: "PageView", eventId: randomUUID(), sessionId: randomUUID(), sourceUrl: "https://www.mattanutra.com/en" }) }));
      assert.equal(event.status, 200); assert.equal((await event.json()).accepted, true);
      const [row] = await getSql()!`select custom_data,source_url from public.meta_conversion_events where context_id=${id}::uuid`;
      assert.equal(row.custom_data.mn_env, "prd"); assert.equal(row.source_url, "https://mattanutra.com/en");
    } finally { keys.forEach((key,i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i]; }); }
  });
  it("queues an automatically enabled 690 THB purchase only after confirmation and once on replay", async () => {
    const c = await consent("site_default"), key = randomUUID(); requestKeys.push(key);
    const session = await createStripeCheckoutSession({ locale: "en", selectedPlan: "precision", sourceSurface: "landing", idempotencyKey: key, request: c.request });
    payments.push(session.paymentId);
    assert.equal((await getSql()!`select count(*)::int as n from public.meta_conversion_events where context_id=${c.id}::uuid`)[0].n,0);
    await completeMockPayment({ paymentId: session.paymentId });
    await completeMockPayment({ paymentId: session.paymentId });
    const events = await getSql()!`select * from public.meta_conversion_events where context_id=${c.id}::uuid and event_name='Purchase'`;
    assert.equal(events.length,1); assert.equal(events[0].custom_data.value,690); assert.equal(events[0].custom_data.currency,"THB");
    assert.equal(events[0].custom_data.mn_env,"dev"); assert.ok(events[0].task_id);
  });
  it("commits retail confirmation and outbox together and deduplicates the corresponding MCP purchase", async () => {
    const c = await consent();
    const [p] = await getSql()!<RetailSessionPayment[]>`insert into public.retail_checkout_payments (id,plan_id,amount,currency,stripe_mode,idempotency_key)
      values (${randomUUID()}::uuid,${planId}::uuid,250000000,'THB','test',${randomUUID()}) returning *`;
    retail.push(p.id);
    await withDatabaseTransaction(getSql()!, tx=>bindMetaContext(tx,"retail",p.id,c.request,{ email: " Fixture@Example.com ",phone: "+66812345678" }));
    const session = { id: `cs_fixture_${p.id}`, payment_status:"paid",status:"complete",amount_total:25000,currency:"thb",livemode:false,metadata:{paymentId:p.id} } as Stripe.Checkout.Session;
    await assert.rejects(withDatabaseTransaction(getSql()!, async tx => { await recordRetailProviderSession(tx,p,session); throw new Error("interrupted"); }), /interrupted/);
    assert.equal((await getSql()!`select paid_at from public.retail_checkout_payments where id=${p.id}::uuid`)[0].paid_at,null);
    assert.equal((await getSql()!`select count(*)::int as n from public.meta_conversion_events where context_id=${c.id}::uuid`)[0].n,0);
    await recordRetailProviderSession(getSql()!,p,session);
    await recordRetailProviderSession(getSql()!,p,session);
    const orderId = randomUUID();
    await withDatabaseTransaction(getSql()!, async tx => {
      await bindMetaContext(tx,"agentic",orderId,c.request);
      await recordMetaPurchase(tx,{type:"agentic",id:orderId,sessionId:session.id,planId,amount:250,currency:"THB",mode:"test",paidAt:new Date()});
    });
    assert.equal((await getSql()!`select count(*)::int as n from public.meta_conversion_events where source_key=${`purchase:${session.id}`}`)[0].n,1);
  });
  it("retries outside database transactions with original event ID/time and only allowed fields", async () => {
    const c = await queued();
    await getSql()!`update public.meta_conversion_events set custom_data=custom_data || '{"email":"private","supplements":["private"],"healthscore":74}'::jsonb where id=${c.eventId}::uuid`;
    const bodies: Array<{ data: Array<{ event_name: string; event_id: string; event_time: number; custom_data: Record<string,unknown>; user_data: Record<string,unknown> }> }> = [];
    const fake: typeof fetch = async (_url,init) => {
      assert.equal(databaseTransactionActive(),false);
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(bodies.length === 1 ? {error:{code:1,is_transient:true}} : {events_received:1}), {status:bodies.length === 1 ? 503 : 200});
    };
    await assert.rejects(sendMetaEvent(c.eventId,fake),/temporarily unavailable/);
    assert.equal((await sendMetaEvent(c.eventId,fake)).status,"accepted");
    assert.deepEqual(bodies[0],bodies[1]);
    assert.equal(bodies[0].data[0].event_name,"DEV_PageView");
    assert.equal(bodies[0].data[0].user_data.client_user_agent,"Fixture browser");
    assert.equal(bodies[0].data[0].user_data.client_ip_address,"192.0.2.15");
    assert.doesNotMatch(JSON.stringify(bodies),/private|healthscore|supplements/);
    await sendMetaEvent(c.eventId,async()=>{throw new Error("must not resubmit an accepted event");});
  });
  it("serializes concurrent dispatch without keeping a transaction open during HTTP", async () => {
    const c=await queued(); let release!:()=>void, started!:()=>void;
    const hold=new Promise<void>(r=>{release=r;}), entered=new Promise<void>(r=>{started=r;});
    const first=sendMetaEvent(c.eventId,async()=>{assert.equal(databaseTransactionActive(),false);started();await hold;return new Response('{"events_received":1}');});
    await entered;
    try { await assert.rejects(sendMetaEvent(c.eventId),/already running/); } finally { release(); }
    assert.equal((await first).status,"accepted");
  });
  it("suppresses queued events and clears matching data after withdrawal", async () => {
    const c=await queued(); await setMetaConsent(c.request,false);
    assert.equal((await sendMetaEvent(c.eventId,async()=>{throw new Error("no network after withdrawal");})).status,"suppressed");
    assert.deepEqual((await getSql()!`select matching from public.meta_tracking_contexts where id=${c.id}::uuid`)[0].matching,{});
  });
  it("does not call a rejected Meta response accepted and bounds transient retries", async () => {
    const c=await queued();
    assert.equal((await sendMetaEvent(c.eventId,async()=>new Response('{"error":{"code":100}}',{status:400}))).status,"rejected");
    const exhausted=await queued(); await getSql()!`update public.meta_conversion_events set attempts=8 where id=${exhausted.eventId}::uuid`;
    assert.equal((await sendMetaEvent(exhausted.eventId,async()=>new Response('{}',{status:503}))).status,"rejected");
  });
  it("suppresses destination/environment changes and never exports a test purchase as production", async () => {
    const c=await queued(); await getSql()!`update public.meta_conversion_events set environment='uat' where id=${c.eventId}::uuid`;
    assert.equal((await sendMetaEvent(c.eventId,async()=>{throw new Error("wrong environment");})).status,"suppressed");
    process.env.MATTANUTRA_ENV="prd"; process.env.FACEBOOK_CAPI_ACCESS_TOKEN_PRD="fixture";
    try { assert.equal(await recordMetaPurchase(getSql()!,{type:"payment",id:randomUUID(),sessionId:null,planId:null,amount:690,currency:"THB",mode:"test",paidAt:new Date()}),null); }
    finally {process.env.MATTANUTRA_ENV="dev"; delete process.env.FACEBOOK_CAPI_ACCESS_TOKEN_PRD;}
  });
});
