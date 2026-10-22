import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, it, mock } from "node:test";
import type postgres from "postgres";
import { fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";
import { emptyAdminDashboardFilters } from "../lib/admin-dashboard-filters.ts";

fixtureDatabaseUrl();
const db=await import("../lib/db.ts"), sql=db.getSql()!;
let scoped: postgres.Sql | postgres.TransactionSql = sql;
mock.module("../lib/db.ts", {namedExports:{...db,getSql:()=>scoped}});
const {funnelBpmSource}=await import("../lib/admin-funnel-events.ts");
const {metaResourceChannel}=await import("../lib/meta-tracking.ts");
const {getAdminFlowData}=await import("../lib/admin-flow-data.ts");
const {getAdminDashboardData}=await import("../lib/admin-dashboard-data.ts");
const {getAdminExternalQueryData}=await import("../lib/admin-query-data.ts");
after(db.closeSqlPool);

it("queries real SQL: recovers web history while excluding retail and MCP bridge assessments",async()=>{
  const rollback=new Error("fixture rollback");
  try{await sql.begin(async tx=>{
    scoped=tx;
    const campaign=`fixture-funnel-${randomUUID()}`,web=randomUUID(),retail=randomUUID(),mcp=randomUUID();
    for(const [id,answers] of [[web,{}],[retail,{inStorePharmacy:{slug:"fixture",acquisition:{source:"in_store",ray:randomUUID()}}}],[mcp,{channel:"mcp",source:"mcp"}]] as const){
      await tx`insert into public.assessments(plan_id,locale,selected_plan,status,answers) values(${id}::uuid,'en','precision','captured',${tx.json(answers)})`;
    }
    assert.equal(await metaResourceChannel(tx,web,"plan",web),"web");
    assert.equal(await metaResourceChannel(tx,retail,"plan",retail),"retail");
    assert.equal(await metaResourceChannel(tx,mcp,"plan",mcp),"mcp");
    assert.equal(await metaResourceChannel(tx,null,"agentic","order-opaque"),"mcp");
    const ray=randomUUID();let minute=0;
    async function add(name:string,plan:string|null,path:string,source="direct",eventRay=ray){
      const at=new Date(Date.UTC(2026,9,4,0,minute++));
      await tx`insert into public.bpm(id,ray,plan_id,event_name,event_type,event_status,path,traffic_source,utm_campaign,locale,properties,occurred_at)
        values(${randomUUID()}::uuid,${eventRay}::uuid,${plan}::uuid,${name},'funnel','observed',${path},${source},${campaign},'en','{}',${at})`;
    }
    await add("assessment_viewed",null,"/en/nutrition/quiz");
    await add("chat_start",null,"/en/nutrition/quiz");
    await add("chat_start",null,"/en/nutrition/quiz");
    await add("assessment_captured",web,"/en/nutrition/quiz");
    await add("page_viewed",web,"/en/nutrition/healthscore");
    // Server events may have no route/attribution; durable assessment provenance is decisive.
    await add("assessment_captured",retail,"","direct",randomUUID());
    await add("healthscore_viewed",mcp,"/en/nutrition/healthscore","direct",randomUUID());
    await add("chat_start",null,"/en/retail/fixture/quiz","pharmacy",randomUUID());
    await add("page_viewed",null,"/en/mcp/checkout/token","direct",randomUUID());
    const channels=await tx`select journey_channel,count(*)::int as n from ${funnelBpmSource(tx as unknown as postgres.Sql)} where utm_campaign=${campaign} group by 1`;
    assert.deepEqual(Object.fromEntries(channels.map(row=>[row.journey_channel,row.n])),{web:5,retail:2,mcp:2});
    const flow=await getAdminFlowData("all",{...emptyAdminDashboardFilters,campaign});
    assert.equal(flow.databaseAvailable,true);
    const count=(id:string)=>flow.nodes.find(row=>row.id===id)?.count;
    assert.equal(count("landingViewed"),1);assert.equal(count("assessmentStarted"),1);assert.equal(count("assessmentSubmitted"),1);
    assert.equal(count("healthscoreViewed"),1);assert.equal(count("healthscoreDisplayed"),0);
    assert.deepEqual(flow.transitions?.assessmentCompletions,{numerator:1,denominator:1});
    const report=await getAdminExternalQueryData("campaigns",new URLSearchParams({range:"all",campaign}));
    const data=report.data as {journeyChannel:string;summary:{landed:number;assessmentStarts:number;assessmentCompletions:number;healthScoreViews:number};healthScoreDisplayed:number};
    assert.equal(data.journeyChannel,"web");assert.equal(data.summary.landed,1);assert.equal(data.summary.assessmentStarts,1);
    assert.equal(data.summary.assessmentCompletions,1);assert.equal(data.summary.healthScoreViews,1);assert.equal(data.healthScoreDisplayed,0);
    await add("healthscore_viewed",web,"/en/nutrition/healthscore");
    const displayed=await getAdminFlowData("all",{...emptyAdminDashboardFilters,campaign});
    assert.equal(displayed.nodes.find(row=>row.id==="healthscoreViewed")?.count,1);
    assert.equal(displayed.nodes.find(row=>row.id==="healthscoreDisplayed")?.count,1);
    throw rollback;
  });}catch(error){if(error!==rollback)throw error;}finally{scoped=sql;}
});

it("excludes automated and demo events consistently and separates product payments from plan purchases", async () => {
  const rollback = new Error("fixture rollback");
  try { await sql.begin(async tx => {
    scoped = tx;
    const campaign = `fixture-funnel-${randomUUID()}`, paid = randomUUID(), productOnly = randomUUID();
    for (const plan of [paid, productOnly]) {
      await tx`insert into public.assessments(plan_id,locale,selected_plan,status,answers)
        values(${plan}::uuid,'en','precision','captured','{}')`;
    }
    async function add(input: {
      name?: string; plan?: string; agent?: string; emitter?: string;
      properties?: Record<string, unknown>; status?: string;
    }) {
      await tx`insert into public.bpm(id,ray,plan_id,event_name,event_type,event_status,selected_plan,path,
        traffic_source,utm_campaign,locale,user_agent,emitted_by,properties,occurred_at)
        values(${randomUUID()}::uuid,${randomUUID()}::uuid,${input.plan ?? null}::uuid,
          ${input.name ?? "home_viewed"},${input.plan ? "payment" : "traffic"},${input.status ?? "paid"},
          ${input.plan ? "precision" : null},'/en','direct',${campaign},'en',${input.agent ?? null},
          ${input.emitter ?? null},${tx.json(input.properties ?? {})},now())`;
    }
    await add({ agent: "Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36" });
    await add({ name: "payment_succeeded", plan: paid });
    await add({ name: "payment_fulfillment_succeeded", plan: paid });
    await add({ name: "retail_product_payment_succeeded", plan: productOnly });
    await add({ name: "checkout_completed", plan: productOnly, status: "processing" });
    for (const agent of ["Googlebot/2.1", "Mozilla/5.0 HeadlessChrome/153.0.0.0", "meta-externalagent/1.1", "Playwright"]) {
      await add({ agent });
    }
    await add({ emitter: "dev_campaign_seed" });
    await add({ properties: { seedName: "campaign-demo" } });
    await add({ name: "plan_paid", plan: productOnly, emitter: "payment_skip_mock" });
    await add({ name: "payment_succeeded", plan: productOnly, properties: { mocked: true } });
    await add({ name: "plan_paid", plan: productOnly, properties: { paymentSkipped: true } });

    const filters = { ...emptyAdminDashboardFilters, campaign };
    const flow = await getAdminFlowData("all", filters);
    assert.equal(flow.databaseAvailable, true);
    const count = (id: string) => flow.nodes.find(row => row.id === id)?.count;
    assert.equal(count("landingViewed"), 1);
    assert.equal(count("precisionPaid"), 1);
    assert.equal(count("productPaymentSucceeded"), 1);
    const dashboard = await getAdminDashboardData("all", filters);
    assert.equal(dashboard.databaseAvailable, true);
    assert.equal(dashboard.kpis.find(row => row.id === "precision")?.value, 1);
    const report = await getAdminExternalQueryData("campaigns", new URLSearchParams({ range: "all", campaign }));
    const data = report.data as { summary: { landed: number; precisionConversions: number } };
    assert.equal(data.summary.landed, 1);
    assert.equal(data.summary.precisionConversions, 1);
    const [raw] = await tx`select count(*)::int as n from public.bpm where utm_campaign=${campaign}`;
    assert.equal(raw.n, 14, "Reporting exclusions preserve the original audit events");
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; } finally { scoped = sql; }
});

it("loads the current funnel through the real instrumented pool without eager SQL fragments", async () => {
  assert.equal(scoped, sql);
  const flow = await getAdminFlowData("all", { ...emptyAdminDashboardFilters, campaign: `fixture-empty-${randomUUID()}` });
  assert.equal(flow.databaseAvailable, true);
  assert.equal(flow.productFunnel?.length, 10);
  assert.ok(flow.productFunnel?.every(stage => stage.count === 0));
  assert.equal(flow.summary.conversionNumerator, 0);
  assert.equal(flow.summary.conversionDenominator, 0);
});

it("uses current live paid facts, frozen acquisition and observed quiz identity with matching time and locale filters", async () => {
  const rollback = new Error("fixture rollback");
  try { await sql.begin(async tx => {
    scoped = tx;
    const campaign = `fixture-current-funnel-${randomUUID()}`;
    const ray = randomUUID(), session = randomUUID(), attempt = `${session}:start`;
    const base = Date.now() - 3 * 60 * 60_000;
    const at = (minute: number) => new Date(base + minute * 60_000);
    async function assessment(input: { legacy?: boolean; answers?: Record<string, unknown> } = {}) {
      const id = randomUUID();
      await tx`insert into public.assessments(plan_id,locale,selected_plan,status,answers,journey_version,acquisition_attribution)
        values(${id}::uuid,'en',${input.legacy ? "precision" : null},'captured',${tx.json(input.answers ?? {})},
          ${input.legacy ? null : "web-products-v1"},${tx.json({ attribution: { utmCampaign: campaign, utmSource: "meta" } })})`;
      return id;
    }
    async function payment(plan: string, input: { mode?: string; status?: string; paid?: boolean; metadata?: Record<string, unknown>; minute?: number } = {}) {
      const id = randomUUID();
      await tx`insert into public.retail_checkout_payments(id,plan_id,locale,status,amount,currency,stripe_mode,idempotency_key,metadata,paid_at)
        values(${id}::uuid,${plan}::uuid,'en',${input.status ?? "paid"},100000000,'THB',${input.mode ?? "live"},${id},
          ${tx.json(input.metadata ?? {})},${input.paid === false ? null : at(input.minute ?? 130)})`;
    }
    async function add(name: string, minute: number, plan: string | null, properties: Record<string, unknown> = {}, eventRay = ray) {
      await tx`insert into public.bpm(id,ray,plan_id,event_name,event_type,event_status,path,utm_source,utm_campaign,locale,properties,occurred_at)
        values(${randomUUID()}::uuid,${eventRay}::uuid,${plan}::uuid,${name},'funnel','observed','/en/nutrition/quiz','meta',${campaign},'en',
          ${tx.json(properties)},${at(minute)})`;
    }
    const paid = await assessment(), eventless = await assessment(), unpaid = await assessment(), legacy = await assessment({ legacy: true });
    await add("web_quiz_landing_viewed", 0, null, { sessionId: session, journeyVersion: "web-products-v1" });
    await add("chat_start", 1, null, { sessionId: session, attemptId: attempt, journeyVersion: "web-products-v1" });
    await add("assessment_captured", 120, paid, { sessionId: session, attemptId: attempt }, randomUUID());
    await add("reveal_page_viewed", 121, paid);
    await add("product_matches_viewed", 122, paid);
    await add("product_basket_confirmed", 123, paid);
    await add("retail_product_checkout_viewed", 124, paid);
    await add("web_delivery_details_completed", 125, paid);
    await add("retail_product_checkout_session_created", 126, paid);
    await payment(paid, { status: "fulfillment_failed" });
    await payment(paid, { minute: 131 });
    await payment(eventless);
    await payment(unpaid, { status: "processing", paid: false });
    await add("retail_product_payment_succeeded", 132, unpaid);
    await add("retail_customer_order_created", 133, unpaid);
    await payment(legacy);
    await add("assessment_viewed", 0, legacy);
    await add("assessment_captured", 1, legacy);
    await add("web_quiz_landing_viewed", 0, null, { sessionId: randomUUID(), journeyVersion: "web-products-v1" }, randomUUID());
    // Missing payment telemetry is not a missing sale; unrelated evidence is never a sale.
    await payment(await assessment(), { mode: "test" });
    await payment(await assessment(), { mode: "mock" });
    await payment(await assessment(), { metadata: { internal_test: true } });
    await payment(await assessment(), { metadata: { channel: "mcp" } });
    await payment(await assessment({ answers: { channel: "mcp" } }));
    await payment(await assessment({ answers: { inStorePharmacy: { slug: "fixture" } } }));
    const internal = await assessment({ answers: { internal_test: true } });
    await payment(internal);
    await add("web_quiz_landing_viewed", 0, internal);
    await add("formula_details_viewed", 1, internal);
    const marked = await assessment();
    await payment(marked);
    await add("assessment_captured", 0, marked, { stripeMode: "test" });
    await add("web_quiz_landing_viewed", 1, marked);
    await add("product_matches_viewed", 2, marked);
    await payment(await assessment(), { metadata: { acquisitionAttribution: { attribution: { utmCampaign: "different-frozen-campaign" } } } });

    const filters = { ...emptyAdminDashboardFilters, campaign };
    const flow = await getAdminFlowData("all", filters);
    assert.equal(flow.databaseAvailable, true);
    assert.deepEqual(flow.summary, { entered: 2, reachedResults: 1, converted: 2, conversionRate: 50,
      conversionNumerator: 1, conversionDenominator: 2, reachedHealthScore: 0 });
    assert.deepEqual(flow.productFunnel?.find(row => row.id === "assessmentCaptured"),
      { id: "assessmentCaptured", count: 1, denominator: 1, numerator: 1 });
    assert.equal(flow.productFunnel?.find(row => row.id === "productPaymentConfirmed")?.count, 2);
    assert.equal(flow.productReport?.sales.paidPayments, 3);
    assert.equal(flow.productReport?.sales.paidJourneys, 2);
    assert.equal(flow.productReport?.sales.fulfillmentFailed, 1);
    assert.equal(flow.productReport?.sales.paymentsMissingEvent, 3);
    assert.equal(flow.series.conversionRate?.at(-1), 50);
    assert.equal(flow.series.nodes.productPaymentConfirmed?.at(-1), 2);
    const recent = await getAdminFlowData("hour", filters);
    assert.equal(recent.summary.entered, 0, "An earlier quiz is not manufactured inside the current time window");
    assert.equal(recent.summary.converted, 2);
    assert.equal(recent.summary.conversionNumerator, 0);
    const thai = await getAdminFlowData("all", { ...filters, locale: "th" });
    assert.equal(thai.summary.entered, 0);
    assert.equal(thai.summary.converted, 0);
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; } finally { scoped = sql; }
});
