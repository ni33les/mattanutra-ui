import assert from "node:assert/strict";
import { it } from "node:test";
import { randomUUID } from "node:crypto";
import { metaCustomData } from "../lib/meta-event-policy.ts";
import { journeyChannelForPath } from "../lib/journey-channel.ts";
import { buildAdminFlowData, type FlowRow } from "../lib/admin-flow-data.ts";
import { summarizeMcpFunnel } from "../lib/admin-mcp-funnel.ts";
import { summarizePharmacySources } from "../lib/pharmacy-funnel.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FunnelStageTable } from "../components/admin/funnel-stage-table.tsx";

const time = (minute: number) => new Date(Date.UTC(2026, 9, 4, 0, minute));
const event = (name: string, minute: number, overrides: Partial<FlowRow> = {}): FlowRow => ({
  id: randomUUID(), ray: "visitor", plan_id: null, event_name: name, event_type: "funnel",
  event_status: "observed", selected_plan: null, occurred_at: time(minute), ...overrides
});

const current = { journey_version: "web-products-v1", path: "/en/nutrition/quiz" };
const stage = (flow: ReturnType<typeof buildAdminFlowData>, id: string) => flow.productFunnel?.find(row => row.id === id);

it("reports the current web funnel from visible results and durable paid facts without HealthScore", () => {
  const names = ["web_quiz_landing_viewed", "assessment_started", "assessment_captured", "reveal_page_viewed",
    "product_matches_viewed", "formula_details_viewed", "formula_details_viewed", "product_basket_confirmed",
    "retail_product_checkout_viewed", "web_delivery_details_completed", "retail_product_checkout_session_created"];
  const flow = buildAdminFlowData("all", names.map((name, index) => event(name, index, { ...current, plan_id: "free" })),
    undefined, [{ plan_id: "free", paid_at: time(12) }, { plan_id: "free", paid_at: time(13) }]);
  assert.equal(flow.nodes.find(row => row.id === "healthscoreViewed")?.count, 0);
  assert.deepEqual(flow.productFunnel?.map(stage => stage.id), ["quizLandingViewed", "assessmentStarted", "assessmentCaptured",
    "revealOpened", "resultsDisplayed", "basketConfirmed", "productCheckoutViewed", "deliveryDetailsCompleted",
    "productCheckoutReady", "productPaymentConfirmed"]);
  for (const row of flow.productFunnel ?? []) {
    assert.equal(row.count, 1, row.id);
    if (row.denominator !== null) assert.equal(row.numerator, 1, row.id);
  }
  assert.deepEqual(flow.summary, { entered: 1, reachedResults: 1, converted: 1, conversionRate: 100,
    conversionNumerator: 1, conversionDenominator: 1, reachedHealthScore: 0 });
  assert.deepEqual(flow.series.conversionRate, [100]);
  assert.deepEqual(flow.productEngagement, [{ id: "formulaViewed", count: 1 }, { id: "productsViewed", count: 1 }, { id: "healthscoreDisplayed", count: 0 }]);
});

it("never equates checkout requests, opened telemetry, payment events, or created orders with confirmed payment", () => {
  const flow = buildAdminFlowData("all", ["web_quiz_landing_viewed", "retail_product_checkout_requested", "retail_product_checkout_opened",
    "retail_product_payment_succeeded", "retail_customer_order_created"].map((name, i) => event(name, i, { ...current, plan_id: "unpaid" })));
  assert.equal(stage(flow, "productCheckoutReady")?.count, 0);
  assert.equal(stage(flow, "productPaymentConfirmed")?.count, 0);
  assert.equal(stage(flow, "deliveryDetailsCompleted")?.count, 0);
  assert.equal(flow.summary.converted, 0);
});

it("counts either visible formula or visible products as results without requiring both", () => {
  const flow = buildAdminFlowData("all", [event("formula_details_viewed", 1, { ...current, plan_id: "formula" }),
    event("product_matches_viewed", 2, { ...current, plan_id: "products", ray: "other" })]);
  assert.equal(stage(flow, "resultsDisplayed")?.count, 2);
  assert.equal(stage(flow, "resultsDisplayed")?.numerator, 0);
  assert.equal(flow.summary.entered, 0);
});

it("keeps known legacy plans and unlinked historical arrivals out of the current cohort", () => {
  const flow = buildAdminFlowData("all", [event("assessment_viewed", 0, { path: "/en/nutrition/quiz", ray: "old" }),
    event("web_quiz_landing_viewed", 1, { plan_id: "legacy", event_journey_version: "web-products-v1" }),
    event("assessment_captured", 2, { plan_id: "legacy" }), event("formula_details_viewed", 3, { plan_id: "legacy" }),
    event("payment_succeeded", 4, { plan_id: "legacy", selected_plan: "precision" })]);
  assert.ok(flow.productFunnel?.every(row => row.count === 0));
  assert.equal(flow.nodes.find(row => row.id === "precisionPaid")?.count, 1);
});

it("only treats actual quiz entry as arrival and does not promote generic web traffic", () => {
  const flow = buildAdminFlowData("all", [event("home_viewed", 0), event("web_page_viewed", 1, { path: "/en/nutrition/quiz" }),
    event("reveal_page_viewed", 2), event("retail_product_checkout_viewed", 3),
    event("web_quiz_landing_viewed", 4, { ray: "quiz" }), event("assessment_started", 5, { ray: "quiz" })]);
  assert.equal(flow.summary.entered, 1);
  assert.equal(stage(flow, "assessmentStarted")?.count, 1);
  assert.equal(stage(flow, "revealOpened")?.count, 0);
});

it("links long questionnaire sessions across browser rays using attempt and session identity", () => {
  const flow = buildAdminFlowData("all", [event("assessment_viewed", 0, { path: "/en/nutrition/quiz", session_id: "session", ray: "before" }),
    event("assessment_started", 1, { session_id: "session", attempt_id: "attempt", ray: "before" }),
    event("assessment_captured", 120, { ...current, plan_id: "plan", session_id: "session", attempt_id: "attempt", ray: "after" }),
    event("assessment_started", 130, { ...current, plan_id: "plan", post_completion_review: true })],
    undefined, [{ plan_id: "plan", paid_at: time(140) }]);
  assert.equal(flow.summary.entered, 1);
  assert.equal(stage(flow, "assessmentCaptured")?.numerator, 1);
  assert.equal(flow.summary.conversionRate, 100);
  const review = buildAdminFlowData("all", [event("assessment_started", 1, { ...current, plan_id: "review", post_completion_review: true })]);
  assert.equal(stage(review, "assessmentStarted")?.count, 0);
});

it("does not attach a new abandoned quiz to an existing paid plan sharing its browser ray", () => {
  const flow = buildAdminFlowData("all", [
    event("assessment_captured", 0, { ...current, plan_id: "saved", session_id: "old", attempt_id: "old:attempt" }),
    event("web_quiz_landing_viewed", 1, { session_id: "new", event_journey_version: "web-products-v1" }),
    event("assessment_started", 2, { session_id: "new", attempt_id: "new:attempt", event_journey_version: "web-products-v1" }),
    event("reveal_page_viewed", 3, { ...current, plan_id: "saved", session_id: "old" })
  ], undefined, [{ plan_id: "saved", paid_at: time(4) }]);
  assert.equal(flow.summary.entered, 1);
  assert.equal(flow.summary.converted, 1);
  assert.equal(flow.summary.conversionNumerator, 0);
  assert.equal(stage(flow, "assessmentCaptured")?.numerator, 0);
});

it("retains an explicitly current anonymous start when arrival telemetry is missing", () => {
  const flow = buildAdminFlowData("all", [event("assessment_started", 0, {
    session_id: "session", attempt_id: "session:attempt", event_journey_version: "web-products-v1"
  })]);
  assert.equal(flow.summary.entered, 0);
  assert.equal(stage(flow, "assessmentStarted")?.count, 1);
  assert.equal(stage(flow, "assessmentStarted")?.numerator, 0);
});

it("counts paid journeys without telemetry but only links conversion to an earlier observed quiz", () => {
  const flow = buildAdminFlowData("all", [event("web_quiz_landing_viewed", 5, { ...current, plan_id: "earlier" }),
    event("web_quiz_landing_viewed", 1, { ...current, plan_id: "later" }),
    event("web_quiz_landing_viewed", 1, { ray: "abandoned" })], undefined, [
    { plan_id: "earlier", paid_at: time(0) }, { plan_id: "later", paid_at: time(5) }, { plan_id: "no-events", paid_at: time(5) }]);
  assert.equal(flow.summary.converted, 3);
  assert.equal(flow.summary.conversionNumerator, 1);
  assert.equal(flow.summary.conversionDenominator, 3);
  assert.equal(flow.summary.conversionRate, 33.3);
  assert.equal(flow.series.conversionRate?.[0], 100 / 3);
  assert.equal(flow.series.nodes.productPaymentConfirmed?.[0], 3);
});

it("withholds funnel counts and rates when the event window exceeds the reporting limit", () => {
  const row = event("web_quiz_landing_viewed", 0, { ...current, plan_id: "paid" });
  const flow = buildAdminFlowData("all", Array.from({ length: 100_001 }, () => row), undefined,
    [{ plan_id: "paid", paid_at: time(1) }]);
  assert.equal(flow.databaseAvailable, true);
  assert.equal(flow.reportingLimitExceeded, true);
  assert.equal(flow.productFunnel, undefined);
  assert.equal(flow.productEngagement, undefined);
  assert.equal(flow.summary.conversionNumerator, 0);
  assert.ok(flow.nodes.every(node => node.count === 0));
});

it("counts direct quiz entry, stitches anonymous starts to capture and deduplicates repeats", () => {
  const flow = buildAdminFlowData("all", [event("assessment_viewed",0),event("assessment_started",1),event("assessment_started",2),
    event("assessment_captured",3,{plan_id:"plan"}),event("assessment_submitted",3),event("healthscore_page_viewed",4,{plan_id:"plan"})]);
  const counts = Object.fromEntries(flow.nodes.map(row => [row.id,row.count]));
  assert.equal(counts.landingViewed,1); assert.equal(counts.assessmentStarted,1); assert.equal(counts.assessmentSubmitted,1);
  assert.equal(counts.healthscoreViewed,1); assert.equal(counts.healthscoreDisplayed,0);
  assert.deepEqual(flow.transitions?.assessmentCompletions,{numerator:1,denominator:1});
});

it("separates page arrivals from visible HealthScore and never invents missing starts", () => {
  const flow=buildAdminFlowData("all",[event("assessment_started",1,{ray:"abandoned"}),
    event("assessment_captured",2,{plan_id:"imported",ray:"other"}),
    event("healthscore_page_viewed",3,{plan_id:"imported",ray:"other"}),
    event("healthscore_viewed",4,{plan_id:"imported",ray:"other"})]);
  assert.equal(flow.nodes.find(n=>n.id==="healthscoreViewed")?.count,1);
  assert.equal(flow.nodes.find(n=>n.id==="healthscoreDisplayed")?.count,1);
  assert.deepEqual(flow.transitions?.assessmentCompletions,{numerator:0,denominator:1});
  assert.deepEqual(flow.transitions?.healthScoreViews,{numerator:1,denominator:1});
});

it("does not treat earlier or unrelated purchases as conversion from a later HealthScore view", () => {
  const flow=buildAdminFlowData("all",[event("payment_succeeded",0,{plan_id:"paid",selected_plan:"precision",event_type:"payment"}),
    event("healthscore_viewed",1,{plan_id:"paid"}),event("healthscore_viewed",1,{plan_id:"unpaid",ray:"other"})]);
  assert.equal(flow.nodes.find(n=>n.id==="precisionPaid")?.count,1);
  assert.deepEqual(flow.transitions?.precisionConversions,{numerator:0,denominator:2});
  assert.equal(flow.summary.conversionRate,0);
});

it("keeps product payments and failed checkouts out of paid plan conversions", () => {
  const flow = buildAdminFlowData("all", [
    event("healthscore_viewed", 0, { plan_id: "product-only" }),
    event("retail_product_payment_succeeded", 1, {
      plan_id: "product-only", selected_plan: "precision", event_type: "payment", event_status: "paid"
    }),
    event("checkout_completed", 2, {
      plan_id: "unpaid", selected_plan: "precision", event_type: "payment", event_status: "processing"
    }),
    event("payment_succeeded", 3, {
      plan_id: "failed", selected_plan: "pro", event_type: "payment", event_status: "failed"
    })
  ]);
  const count = (id: string) => flow.nodes.find(row => row.id === id)?.count;
  assert.equal(count("precisionPaid"), 0);
  assert.equal(count("proPaid"), 0);
  assert.equal(count("productPaymentSucceeded"), 1);
  assert.equal(flow.summary.converted, 0);
});

it("counts one plan purchase when payment and fulfillment both succeed", () => {
  const flow = buildAdminFlowData("all", [
    event("healthscore_viewed", 0, { plan_id: "paid" }),
    ...["payment_succeeded", "payment_fulfillment_succeeded"].map((name, index) => event(name, index + 1, {
      plan_id: "paid", selected_plan: "precision", event_type: "payment", event_status: "paid"
    }))
  ]);
  assert.equal(flow.nodes.find(row => row.id === "precisionPaid")?.count, 1);
  assert.deepEqual(flow.transitions?.precisionConversions, { numerator: 1, denominator: 1 });
});

it("shows each rate's recorded base without treating alternative outcomes as drop-offs", () => {
  for (const locale of ["en", "th", "zh-CN"] as const) {
    const html = renderToStaticMarkup(createElement(FunnelStageTable, { locale, caption: "Web", rows: [
      { id: "started", label: "Starts", count: 20, color: "start", numerator: 20, denominator: 174, conversionBasis: "Web journeys" },
      { id: "precision", label: "Precision", count: 4, color: "conversion", numerator: 4, denominator: 8, conversionBasis: "HealthScore arrivals", showDropoff: false },
      { id: "pro", label: "Pro", count: 0, color: "conversion", numerator: 0, denominator: 8, conversionBasis: "HealthScore arrivals", showDropoff: false },
      { id: "orders", label: "Orders", count: 0, color: "order", numerator: 0, denominator: 8, conversionBasis: "HealthScore arrivals", showDropoff: false }
    ] }));
    const rows = [...html.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gs)].slice(1).map(match => match[1]);
    const cells = rows.map(row => [...row.matchAll(/<td\b[^>]*>(.*?)<\/td>/gs)].map(match => match[1]));
    assert.equal(cells[0][1], "154");
    assert.match(cells[0][2], /11\.5%.*20 \/ 174/s);
    for (let i = 1; i < cells.length; i++) {
      assert.equal(cells[i][1], "—");
      assert.match(cells[i][2], i === 1 ? /50%.*4 \/ 8/s : /0%.*0 \/ 8/s);
    }
    assert.doesNotMatch(html, /NaN|Infinity/);
  }
});

it("keeps retail unpaid order count distinct from converted journeys", () => {
  const base={pharmacy:"fixture",source:"in_store" as const,ray:"r",planId:"p"};
  const rows=summarizePharmacySources([
    {...base,id:"l",stage:"landing",occurredAt:time(0)}, {...base,id:"s",stage:"started",occurredAt:time(1)},
    {...base,id:"c",stage:"captured",occurredAt:time(2)}, {...base,id:"r",stage:"revealed",occurredAt:time(3)},
    {...base,id:"o1",orderId:"o1",stage:"orders",occurredAt:time(4)}, {...base,id:"o2",orderId:"o2",stage:"orders",occurredAt:time(5)}
  ]);
  const row=rows.find(row=>row.source==="in_store")!;
  assert.equal(row.orders,2);assert.equal(row.orderedJourneys,1);
  assert.deepEqual(row.transitions?.orders,{numerator:1,denominator:1});
});

it("deduplicates MCP plans, separates QA and locale, and ignores cached info as a visit", () => {
  const base={correlation_id:"plan",attribution:"agent_connector",payload:JSON.stringify({locale:"th"})};
  const rows=summarizeMcpFunnel([
    {...base,event_type:"connector_viewed",created_at:time(0)}, {...base,event_type:"connected",created_at:time(1)},
    {...base,event_type:"connected",created_at:time(2)}, {...base,event_type:"plan_ready",created_at:time(3)},
    {...base,event_type:"plan_ready",created_at:time(4)},
    {...base,correlation_id:"qa",attribution:"qa_campaign",payload:{locale:"en"},event_type:"paid",created_at:time(5)}
  ]);
  assert.equal(rows.length,2);
  const live=rows.find(row=>row.attribution==="agent_connector")!;
  assert.equal(live.connected,1);assert.equal(live.plan_ready,1);assert.equal(live.paid,0);
  assert.deepEqual(live.transitions.plan_ready,{numerator:1,denominator:1});
  assert.equal(rows.find(row=>row.attribution==="qa_campaign")?.paid,1);
  assert.deepEqual(summarizeMcpFunnel([{...base,event_type:"connector_viewed"}]),[]);
});

it("uses one accessible table for every flow and does not display invented rates", () => {
  for(const locale of ["en","th","zh-CN"] as const){
    const html=renderToStaticMarkup(createElement(FunnelStageTable,{locale,caption:"Retail",rows:[
      {id:"start",label:"Started",count:0,color:"start"},
      {id:"complete",label:"Completed",count:11,color:"complete",denominator:0,numerator:0}
    ]}));
    assert.match(html,/<caption/);assert.match(html,/scope="row"/);assert.match(html,/background-color:/);
    assert.doesNotMatch(html,/NaN|Infinity|0%/);assert.match(html,/11/);
  }
});

it("labels Web, Retail and MCP separately without changing acquisition or leaking payloads", () => {
  for(const [path,channel] of [["/en/nutrition/quiz","web"],["/th/retail/shop/quiz","retail"],["/zh-CN/mcp/checkout/secret","mcp"]]){
    assert.equal(journeyChannelForPath(path),channel);
    assert.deepEqual(metaCustomData("QuizStart",{channel,health:"private",source:"facebook"},"prd"),{mn_env:"prd",event_schema:"1",channel});
  }
  assert.equal(metaCustomData("Purchase",{channel:"pharmacy"},"uat").channel,"retail");
  assert.equal(metaCustomData("Purchase",{channel:"mcp_web"},"uat").channel,"mcp");
});
