import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { before, after, describe, it } from "node:test";
import type Stripe from "stripe";
import postgres from "postgres";
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import { closeSqlPool, databaseTransactionActive, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { bindMetaContext, enqueueMetaEvent, recordMetaPurchase, requestMetaContext, setMetaConsent, setMetaPreference } from "../lib/meta-tracking.ts";
import { sendMetaEvent } from "../lib/meta-dispatch.ts";
import { metaCampaignReport } from "../lib/meta-campaign-report.ts";
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
  async function consent(source: "explicit" | "site_default" = "explicit", url = "https://dev.mattanutra.com/en?fbclid=fixtureClick&campaign_id=111&adset_id=222&ad_id=333") {
    const id = (await setMetaPreference(request(), true, url, source)).id; contexts.push(id);
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
  it("captures the first ad before PageView and preserves it through untagged recovery and repeated events", async () => {
    const c = await consent("site_default");
    assert.deepEqual(c.context.attribution, { campaign_id: "111", adset_id: "222", ad_id: "333" });
    const headers = new Headers(c.request.headers);
    headers.set("cookie", `${headers.get("cookie")}; _fbc=fb.1.1760000000000.staleClick`);
    const returning = new Request(c.request.url, { headers });
    await setMetaPreference(returning, true, "/en/nutrition/payment/return", "site_default");
    assert.equal((await requestMetaContext(returning))!.matching.fbc, c.context.matching.fbc);
    const eventId = randomUUID();
    const body = { name: "PageView", eventId, sessionId: randomUUID(), sourceUrl: "/en?fbclid=fixtureClick&campaign_id=111&adset_id=222&ad_id=333", data: { channel: "web", locale: "en", stage: "landing" } };
    for (let i=0;i<2;i++) {
      const response = await browserEvent(new Request("https://dev.mattanutra.com/api/marketing/events", { method: "POST", headers, body: JSON.stringify(body) }));
      assert.equal(response.status,200);
    }
    const [event] = await getSql()!`select custom_data,matching from public.meta_conversion_events where id=${eventId}::uuid`;
    assert.equal(event.matching.fbc,c.context.matching.fbc); assert.equal(event.custom_data.ad_id,"333");
    assert.equal((await getSql()!`select count(*)::int as n from public.meta_conversion_events where context_id=${c.id}::uuid`)[0].n,1);
    await setMetaPreference(returning,true,"/th?campaign_id=444&fbclid=newClick","site_default");
    assert.deepEqual((await requestMetaContext(returning))!.attribution,{ campaign_id: "444" });
    await setMetaPreference(returning,true,"/en?fbclid=anotherClick","site_default");
    assert.deepEqual((await requestMetaContext(returning))!.attribution,{});
  });
  it("serializes competing attribution updates and rechecks withdrawal before enqueue", async () => {
    const locker = postgres(process.env.TEST_DB_URL!, { max: 1, onnotice() {} });
    const observer = postgres(process.env.TEST_DB_URL!, { max: 1, onnotice() {} });
    try {
      for (const withdraw of [false, true]) {
        const c = await consent();
        let release!:()=>void, entered!:()=>void;
        const hold = new Promise<void>(resolve=>{release=resolve;}), locked = new Promise<void>(resolve=>{entered=resolve;});
        const writer = withDatabaseTransaction(locker,async tx=>{
          await tx`select id from public.meta_tracking_contexts where id=${c.id}::uuid for update`;
          entered(); await hold;
          await tx`update public.meta_tracking_contexts set attribution='{"campaign_id":"999"}',matching='{"fbc":"fb.1.1780000000000.newClick"}',consent_granted=${!withdraw} where id=${c.id}::uuid`;
        });
        await locked;
        const eventId = randomUUID();
        const saving = browserEvent(new Request("https://dev.mattanutra.com/api/marketing/events", { method: "POST", headers: c.request.headers,
          body: JSON.stringify({ name: "PageView", eventId, sessionId: randomUUID(), sourceUrl: "/en", data: { channel: "web", locale: "en" } }) }));
        try {
          let blocked = false;
          for (let attempt=0;attempt<100;attempt++) {
            const [state] = await observer`select exists(select 1 from pg_stat_activity where datname=current_database()
              and wait_event_type='Lock' and query like '%select matching,attribution,consent_granted,expires_at%') as blocked`;
            if (state.blocked) { blocked=true; break; }
            await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.ok(blocked,"A competing capture must wait for its own context writer");
          assert.ok(await requestMetaContext(c.request,observer),"Ordinary reads remain nonblocking before the writer commits");
        } finally { release(); await writer; }
        const response = await saving; assert.equal(response.status,200);
        assert.equal((await response.json()).accepted,!withdraw);
        const rows = await observer`select custom_data,matching from public.meta_conversion_events where id=${eventId}::uuid`;
        assert.equal(rows.length,withdraw?0:1);
        if (!withdraw) { assert.equal(rows[0].custom_data.campaign_id,"999"); assert.equal(rows[0].matching.fbc,"fb.1.1780000000000.newClick"); }
      }
    } finally { await Promise.all([locker.end(),observer.end()]); }
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
    assert.equal(events[0].custom_data.purchase_type,"plan"); assert.equal(events[0].custom_data.offer,"precision");
    assert.equal(events[0].custom_data.channel,"web"); assert.equal(events[0].custom_data.locale,"en");
    assert.equal(events[0].custom_data.campaign_id,"111"); assert.equal(events[0].custom_data.adset_id,"222"); assert.equal(events[0].custom_data.ad_id,"333");
    assert.equal(events[0].matching.fbc,c.context.matching.fbc);
    const outbound: Record<string, unknown>[] = [];
    await sendMetaEvent(events[0].id, async (_url, init) => { outbound.push(JSON.parse(String(init?.body)).data[0]); return new Response('{"events_received":1}'); });
    assert.equal(outbound[0].event_name,"DEV_Purchase"); assert.equal(outbound[0].action_source,"website");
    assert.deepEqual(outbound[0].custom_data,events[0].custom_data);
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
    const [event] = await getSql()!`select custom_data,matching from public.meta_conversion_events where source_key=${`purchase:${session.id}`}`;
    assert.equal(event.custom_data.purchase_type,"products"); assert.equal(event.custom_data.offer,undefined);
    assert.match(event.matching.em[0],/^[a-f0-9]{64}$/); assert.match(event.matching.ph[0],/^[a-f0-9]{64}$/);
  });
  it("records Pro separately from Precision with the actual payment locale and amount", async () => {
    const c = await consent(), key = randomUUID(); requestKeys.push(key);
    const session = await createStripeCheckoutSession({ locale: "zh-CN", selectedPlan: "pro", sourceSurface: "landing", idempotencyKey: key, request: c.request });
    payments.push(session.paymentId);
    await completeMockPayment({ paymentId: session.paymentId });
    const [event] = await getSql()!`select custom_data from public.meta_conversion_events where context_id=${c.id}::uuid and event_name='Purchase'`;
    const [payment] = await getSql()!`select amount from public.payments where id=${session.paymentId}::uuid`;
    assert.equal(event.custom_data.offer,"pro"); assert.equal(event.custom_data.purchase_type,"plan");
    assert.equal(event.custom_data.locale,"zh-CN"); assert.equal(event.custom_data.value,Number(payment.amount)/1_000_000);
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
    // A later ad visit must not rewrite an event that is waiting to retry.
    await setMetaPreference(c.request,true,"/en?fbclid=laterClick&campaign_id=999","site_default");
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
    assert.deepEqual((await getSql()!`select matching from public.meta_conversion_events where id=${c.eventId}::uuid`)[0].matching,{});
  });
  it("clears accepted matching snapshots on withdrawal without altering delivery evidence", async () => {
    const c = await queued();
    await sendMetaEvent(c.eventId,async()=>new Response('{"events_received":1}'));
    await setMetaConsent(c.request,false);
    const [event] = await getSql()!`select status,response_message,matching from public.meta_conversion_events where id=${c.eventId}::uuid`;
    assert.equal(event.status,"accepted"); assert.equal(event.response_message,"events_received:1"); assert.deepEqual(event.matching,{});
  });
  it("reports unique visitors, currencies, offers and delivery separately without inventing attribution", async () => {
    const sql = getSql()!, c = await consent(), other = await consent();
    const config = { environment: "dev" as const, enabled: true, pixelId: "987654321012345" };
    const dimensions = { campaign_id: "100", adset_id: "200", ad_id: "300", channel: "web", locale: "th" };
    const add = async (name: string, data: Record<string,unknown> = {}, status = "accepted", context = c.id, environment = "dev", time = "2026-10-05T00:00:00Z") => {
      const id = randomUUID();
      await sql`insert into public.meta_conversion_events (id,environment,pixel_id,event_name,source_key,context_id,custom_data,status,occurred_at)
        values (${id}::uuid,${environment},${config.pixelId},${name},${id},${context}::uuid,${sql.json(data)},${status},${time})`;
    };
    await add("PageView",dimensions); await add("PageView",dimensions); await add("PageView",dimensions,"accepted",other.id);
    await add("QuizSubmitted",dimensions); await add("InitiateCheckout",dimensions);
    const sale = { ...dimensions, purchase_type: "plan", offer: "precision", value: 690, currency: "THB" };
    await add("Purchase",sale); await add("Purchase",sale,"retrying"); await add("Purchase",{...sale,offer:"pro",value:100,currency:"USD"},"rejected");
    await add("Purchase",{...sale,campaign_id:"101",channel:"pharmacy",locale:"en",purchase_type:"products",offer:undefined,value:250},"accepted",other.id);
    await add("Purchase",{...sale,channel:"mcp_web",locale:"zh-CN",purchase_type:"products",offer:undefined},"suppressed");
    await add("Purchase",{value:690,currency:"THB"});
    await add("Purchase",sale,"accepted",c.id,"uat");
    await add("Purchase",sale,"accepted",c.id,"dev","2026-09-01T00:00:00Z");
    const report = await metaCampaignReport(sql,config,"2026-10-01T00:00:00Z");
    assert.deepEqual(report.activity,[{campaignId:"100",adsetId:"200",adId:"300",channel:"web",locale:"th",visitors:2,starts:0,completions:1,checkouts:1,purchasingVisitors:1,purchaseRate:50}]);
    const plan = report.sales.find(row=>row.channel==="web" && row.currency==="THB")!;
    assert.equal(plan.purchases,2); assert.equal(plan.revenue,1380); assert.equal(plan.accepted,1); assert.equal(plan.pending,1); assert.equal(plan.failed,0);
    assert.equal(report.sales.find(row=>row.currency==="USD")!.revenue,100);
    assert.equal(report.sales.find(row=>row.channel==="retail")!.purchaseType,"products");
    assert.equal(report.sales.find(row=>row.channel==="mcp")!.failed,1);
    assert.equal(report.sales.find(row=>row.channel==="unknown")!.offer,"unknown");
    assert.equal(report.sales.reduce((sum,row)=>sum+row.purchases,0),6);
    assert.equal(report.adsReportingConnected,false); assert.equal(report.limited,false);
    assert.doesNotMatch(JSON.stringify(report),/fb\.1|Fixture|client_ip|client_user|email|phone/);
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
