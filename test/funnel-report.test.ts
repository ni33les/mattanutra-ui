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
