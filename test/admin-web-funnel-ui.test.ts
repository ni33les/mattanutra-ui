import assert from "node:assert/strict";
import { it, mock } from "node:test";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WebProductReportPanel } from "../components/admin/web-product-report.tsx";
import type { AdminContent } from "../components/admin/dashboard-content.tsx";
import { webProductFunnelCopy } from "../lib/web-product-funnel-copy.ts";
import { emptyAdminDashboardFilters } from "../lib/admin-dashboard-filters.ts";
import type { AdminFlowData } from "../lib/admin-flow-data.ts";
import type { WebProductReport } from "../lib/admin-web-product-report.ts";

register("./payment-return/next-loader.mjs", import.meta.url);
register("./pharmacy-reveal/style-loader.mjs", import.meta.url);
register("./mcp-tool-card/config-loader.mjs", import.meta.url);
mock.module("../components/admin/questionnaire-funnel.tsx", { namedExports: { QuestionnaireFunnel: () => null } });
const { BusinessFunnelTable, AdminAtAGlanceView, webProductSummaryMetrics } = await import("../components/admin/business-overview.tsx");
const { AdminFlowView } = await import("../components/admin/flow-view.tsx");
const { BusinessTrendChart } = await import("../components/admin/dashboard-shared.tsx");
const labels = { atAGlance: { landingVisitors: "Legacy landing", assessmentStarts: "Legacy starts", assessmentCompletions: "Legacy completions",
  healthScoreViews: "HealthScore", precisionConversions: "Precision", proConversions: "Pro", productOrders: "Orders",
  editTargets: "Edit legacy targets", cancel: "Cancel", saveTargets: "Save", target: "Target" } } as AdminContent;

const stageIds = ["quizLandingViewed", "assessmentStarted", "assessmentCaptured", "revealOpened", "resultsDisplayed",
  "basketConfirmed", "productCheckoutViewed", "deliveryDetailsCompleted", "productCheckoutReady", "productPaymentConfirmed"] as const;
const report: WebProductReport = {
  generation: [{ stage: "formula", tasks: 3, queued: 1, running: 0, completed: 1, failed: 1, review: 0,
    cancelled: 0, retries: 2, errorEvents: 4, timedCompletions: 1, medianSeconds: 12.5, p90Seconds: 12.5 },
  { stage: "products", tasks: 0, queued: 0, running: 0, completed: 0, failed: 0, review: 0,
    cancelled: 0, retries: 0, errorEvents: 0, timedCompletions: 0, medianSeconds: null, p90Seconds: null }],
  sales: { paidPayments: 3, paidJourneys: 2, orders: 1, shipped: 1, delivered: 0, cancelled: 0, returned: 0,
    fulfillmentFailed: 1, paidWithoutOrder: 2, paymentsWithEvent: 2, paymentsMissingEvent: 1,
    revenue: [{ currency: "THB", amountMicros: "1000000000" }], paymentEvents: 5, eventPaymentIds: 3, eventsWithoutPaidPayment: 1 },
  campaigns: []
};
function fixture(): AdminFlowData {
  return {
    databaseAvailable: true, generatedAt: "2026-10-22T00:00:00.000Z", range: "all", edges: [],
    nodes: [...stageIds.map((id, index) => ({ id, count: 20 - index })),
      { id: "formulaViewed", count: 5 }, { id: "productsViewed", count: 7 }, { id: "healthscoreDisplayed", count: 3 },
      { id: "healthscoreViewed", count: 9 }, { id: "precisionPaid", count: 50 }, { id: "proPaid", count: 60 },
      { id: "retailOrderCreated", count: 70 }],
    productEngagement: [{ id: "formulaViewed", count: 2 }, { id: "productsViewed", count: 4 }, { id: "healthscoreDisplayed", count: 1 }],
    productFunnel: stageIds.map((id, index) => ({ id, count: 20 - index,
      denominator: index ? 21 - index : null, numerator: index ? 20 - index : null })),
    series: { bucketLabels: ["2026-10-22"], conversionRate: [5], nodes: {
      quizLandingViewed: [20], resultsDisplayed: [8], productPaymentConfirmed: [2],
      precisionPaid: [50], proPaid: [60], retailOrderCreated: [70]
    } },
    summary: { entered: 20, reachedResults: 8, converted: 2, conversionRate: 5, reachedHealthScore: 9, conversionNumerator: 1, conversionDenominator: 20 },
    targets: { assessmentCompletions: 65, assessmentStarts: 30, healthScoreViews: 95, landingVisitors: 100,
      precisionConversions: 5, proConversions: 1, productOrders: 5 }, productReport: report
  };
}

for (const locale of ["en", "th", "zh-CN"] as const) {
  it(`${locale}: main journey has ten current stages, with optional views and legacy targets separated`, () => {
    const html = renderToStaticMarkup(createElement(BusinessFunnelTable, { flowData: fixture(), locale, labels, showTargets: true }));
    const current = html.split('data-testid="current-web-funnel"')[1].split('</table>')[0];
    const rows = [...current.matchAll(/<th scope="row"[^>]*>(.*?)<\/th>/gs)].map(match => match[1].replace(/<[^>]+>/g, ""));
    assert.deepEqual(rows, stageIds.map(id => webProductFunnelCopy[locale].stages[id]));
    assert.doesNotMatch(current, /HealthScore|Precision|<input|Formula viewed|Products viewed/);
    assert.match(current, /19 \/ 20/);
    assert.ok(current.includes(webProductFunnelCopy[locale].stages.quizLandingViewed));
    const legacy = html.match(/<details\b[^>]*data-testid="legacy-web-funnel"[^>]*>(.*?)<\/details>/s);
    assert.ok(legacy);
    assert.doesNotMatch(legacy[0].split(">")[0], /\bopen\b/);
    assert.ok(legacy[1].includes(labels.atAGlance.editTargets));
    assert.ok(!html.split('data-testid="legacy-web-funnel"')[0].includes(labels.atAGlance.editTargets));
    const engagement = html.split('data-testid="optional-web-engagement"')[1].split('</section>')[0];
    for (const id of ["formulaViewed", "productsViewed", "healthscoreDisplayed"]) assert.ok(engagement.includes(webProductFunnelCopy[locale].stages[id]));
    assert.doesNotMatch(engagement, /%|<table/);
    assert.deepEqual([...engagement.matchAll(/<dd[^>]*>(\d+)<\/dd>/g)].map(match => match[1]), ["2", "4", "1"]);
    assert.doesNotMatch(html, /NaN|Infinity/);
  });

  it(`${locale}: headline cards use live paying journeys and backend linked conversion, not legacy outcomes`, () => {
    const metrics = webProductSummaryMetrics(fixture(), locale);
    assert.deepEqual(metrics.map(metric => metric.id), ["quizLandingViewed", "resultsDisplayed", "productPaymentConfirmed", "conversionRate"]);
    assert.deepEqual(metrics.map(metric => metric.value), ["20", "8", "2", "5%"]);
    assert.deepEqual(metrics[2].series, [2]);
    assert.deepEqual(metrics[3].series, [5]);
    const html = renderToStaticMarkup(createElement(AdminFlowView, { flowData: fixture(), locale, labels, accessToken: "" }));
    assert.ok(html.includes(webProductFunnelCopy[locale].conversionNote));
    assert.ok(html.includes(webProductFunnelCopy[locale].summary.reachedResults));
  });
}

it("shows an unknown rate for absent landing tracking even when live payments exist", () => {
  const flow = fixture();
  const metrics = webProductSummaryMetrics({ ...flow, summary: { ...flow.summary, entered: 0, converted: 2, conversionDenominator: 0, conversionNumerator: 0 } }, "en");
  assert.equal(metrics[2].value, "2");
  assert.equal(metrics[3].value, "—");
});

it("keeps fulfillment and task timing diagnostics explicit and preserves missing timing values", () => {
  const html = renderToStaticMarkup(createElement(WebProductReportPanel, { report, locale: "en" }));
  assert.match(html, /Live payments and fulfillment/);
  assert.match(html, /Payments missing event/);
  assert.match(html, /Fulfillment failed/);
  assert.match(html, /wall-clock seconds/);
  assert.match(html, /not browser reveal latency or CPU time/);
  assert.match(html, /role="region"[^>]*tabindex="0"/);
  assert.match(html, /12\.5/);
  assert.match(html, />—<\/td>/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

it("shows unavailable diagnostics rather than presenting missing report data as zero sales", () => {
  const html = renderToStaticMarkup(createElement(WebProductReportPanel, { locale: "en" }));
  assert.match(html, /Data unavailable/);
  assert.doesNotMatch(html, /<dd/);
});


it("leaves gaps for conversion buckets without quiz arrivals and preserves real zero rates", () => {
  const flow = fixture();
  const data = { ...flow, series: { bucketLabels: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    nodes: { quizLandingViewed: [10, 4, 0, 2, 8] }, conversionRate: [0, 25, 0, 50, 0] } };
  const metrics = webProductSummaryMetrics(data, "en");
  const conversion = metrics[3];
  assert.deepEqual(conversion.seriesDefined, [true, true, false, true, true]);
  for (const metric of metrics.slice(0, 3)) assert.equal(metric.seriesDefined, undefined);
  const html = renderToStaticMarkup(createElement(BusinessTrendChart, { bucketLabels: data.series.bucketLabels, locale: "en", metric: conversion }));
  const circles = [...html.matchAll(/<circle\b[^>]*cx="([^"]+)"[^>]*cy="([^"]+)"/g)];
  assert.deepEqual(circles.map(match => Number(match[1])), [28, 239, 661, 872]);
  assert.equal(Number(circles[0][2]), Number(circles.at(-1)![2]), "real zero conversions remain visible at both ends");
  const lines = [...html.matchAll(/<polyline\b[^>]*points="([^"]*)"/g)].map(match => match[1].split(" ").map(point => Number(point.split(",")[0])));
  assert.equal(lines.length, 2);
  for (const line of lines) assert.ok(!(line.some(x => x < 450) && line.some(x => x > 450)), "no line bridges the unobserved bucket");
  const missing = renderToStaticMarkup(createElement(BusinessTrendChart, { bucketLabels: data.series.bucketLabels, locale: "en",
    metric: { ...conversion, seriesDefined: [false, false, false, false, false] } }));
  assert.doesNotMatch(missing, /<circle\b|<polyline\b/);
  const normal = renderToStaticMarkup(createElement(BusinessTrendChart, { bucketLabels: data.series.bucketLabels, locale: "en",
    metric: { ...conversion, seriesDefined: undefined } }));
  assert.equal([...normal.matchAll(/<circle\b/g)].length, 5, "unmasked metrics keep their existing behavior");
});


for (const locale of ["en", "th", "zh-CN"] as const) {
  it(`${locale}: reporting-limit states hide partial web metrics and preserve independent diagnostics in Flow and Glance`, () => {
    const flowData = { ...fixture(), reportingLimitExceeded: true };
    const flow = createElement(AdminFlowView, { flowData, locale, labels, accessToken: "" });
    const glanceProps = { flowData, locale, labels: { ...labels, reviewQueue: { unknown: "Unknown" } }, accessToken: "",
      alertsData: { summary: { critical: 0, high: 0 } }, communicationsData: { summary: { failed: 0, noChannel: 0 } },
      data: { range: "all" }, filters: emptyAdminDashboardFilters, reviewQueueData: { summary: { total: 0, unknown: 0 } }
    } as Parameters<typeof AdminAtAGlanceView>[0];
    for (const view of [flow, createElement(AdminAtAGlanceView, glanceProps)]) {
      const html = renderToStaticMarkup(view);
      assert.ok(html.includes(webProductFunnelCopy[locale].reportingLimit));
      assert.match(html, /role="status" data-testid="web-reporting-limit"/);
      assert.doesNotMatch(html, /data-testid="(?:web-product-summary|web-conversion-basis|current-web-funnel|legacy-web-funnel|optional-web-engagement)"/);
      assert.match(html, /data-testid="web-product-diagnostics"/);
      assert.match(html, /data-testid="pharmacy-source-funnel"/);
      assert.match(html, /data-testid="mcp-funnel"/);
      assert.doesNotMatch(html, /NaN|Infinity/);
    }
  });
}
