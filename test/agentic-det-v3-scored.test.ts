import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CONNECTOR_COPY, englishConnectorWordCount } from "../lib/agentic/discovery/content.ts";
import { checkoutResponsibilityCopy } from "../lib/agentic/responsibility/matrix.ts";
import { RESEARCH_VERSION, RESPONSIBILITY_VERSION } from "../lib/agentic/discovery/versions.ts";
import { FUNNEL_EVENT_TYPES } from "../lib/agentic/funnel/events.ts";
import { recordFunnelEvent, resetFunnelLedger, listFunnelEvents } from "../lib/agentic/funnel/ledger.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { supportTool } from "../lib/agentic/support.ts";
import { queryBudgetSnapshot, resetQueryBudget } from "../lib/agentic/plan/query-budget.ts";
import {
  checkoutContinuityProof,
  goldenPlanRequest,
  isolationProof,
  latencyProof
} from "../lib/agentic/qa/proofs.ts";
import { FULFILMENT_STATUSES } from "../lib/agentic/qa/simulate.ts";
import { QA_PACK_CLOCK } from "../lib/agentic/qa/session.ts";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/instructions.ts";
import {
  beginDetRun,
  canonicalJson,
  createDetRuntime,
  detCall,
  detListTools,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK } from "./agentic/det-v3/manifest.ts";

function structured(response: { result?: { structuredContent?: unknown } } | null) {
  return (response?.result?.structuredContent ?? response?.result ?? {}) as Record<string, unknown>;
}

async function qaCall(
  runtime: ReturnType<typeof createDetRuntime>,
  name: string,
  args: Record<string, unknown> = {}
) {
  return structured(
    await handleQaJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: args, name }
    })
  );
}

async function paidDeliveredJourney(
  runtime: ReturnType<typeof createDetRuntime>,
  input: Readonly<{ namespace: string; principal: string; suffix: string }>
) {
  const scope = { ...runtime.scope, principalScope: input.principal };
  const plan = await planTool({
    config: runtime.config,
    now: DET_V3_CLOCK,
    payload: {
      idempotencyKey: `scored-plan-${input.suffix}xxxx`,
      request: goldenPlanRequest()
    },
    scope,
    store: runtime.store
  });
  assert.equal((plan as { status?: string }).status, "ready", canonicalJson(plan));
  const executed = await executeTool({
    config: runtime.config,
    expectedRevision: (plan as { revision: number }).revision,
    idempotencyKey: `scored-exec-${input.suffix}xxxx`,
    now: DET_V3_CLOCK,
    payment: runtime.payment,
    planHandle: (plan as { planHandle: string }).planHandle,
    scope,
    store: runtime.store
  });
  const orderHandle = String((executed as { orderHandle: string }).orderHandle);
  assert.equal((executed as { paymentStatus?: string }).paymentStatus, "unpaid");
  assert.equal((executed as { checkoutExpiresAt?: string }).checkoutExpiresAt, "2026-09-02T00:15:00.000Z");
  assert.equal((executed as { responsibilityVersion?: string }).responsibilityVersion, RESPONSIBILITY_VERSION);

  const declined = await qaCall(runtime, "simulate", {
    namespace: input.namespace,
    orderHandle,
    scenario: "decline_insufficient_funds"
  });
  assert.equal(declined.paymentStatus, "unpaid");
  assert.equal(declined.timeline, "payment_declined");

  const unpaidFulfilment = await qaCall(runtime, "simulateFulfilment", {
    namespace: input.namespace,
    orderHandle,
    status: "preparing"
  });
  assert.equal((unpaidFulfilment.error as { reasonCode?: string } | undefined)?.reasonCode, "invalid_request");

  const paid = await qaCall(runtime, "simulate", {
    namespace: input.namespace,
    orderHandle,
    scenario: "success"
  });
  assert.equal(paid.paymentStatus, "paid");
  assert.equal(paid.timeline, "paid");
  assert.equal(paid.terminal, false);
  assert.equal(Number(paid.pollAfterSeconds) > 0, true);

  const afterSuccess = await qaCall(runtime, "evidence", { orderHandle, namespace: input.namespace });
  const duplicate = await qaCall(runtime, "simulate", {
    namespace: input.namespace,
    orderHandle,
    scenario: "duplicate_success"
  });
  assert.equal(duplicate.paymentStatus, "paid");

  const evidence = await qaCall(runtime, "evidence", { orderHandle, namespace: input.namespace });
  assert.equal(evidence.paymentConfirmedCount, 1);
  assert.equal(evidence.paymentConfirmedCount, afterSuccess.paymentConfirmedCount);
  assert.equal(evidence.providerEventCount, afterSuccess.providerEventCount);

  const preparing = await qaCall(runtime, "simulateFulfilment", {
    namespace: input.namespace,
    orderHandle,
    status: "preparing"
  });
  assert.equal(preparing.timeline, "preparing");
  assert.equal((preparing.fulfilment as { status?: string } | undefined)?.status, "preparing");
  assert.equal(
    ((preparing.events as Array<{ kind?: string; status?: string }>) ?? []).some(
      (item) => item.kind === "fulfilment" && item.status === "packed"
    ),
    false
  );
  const dispatched = await qaCall(runtime, "simulateFulfilment", {
    namespace: input.namespace,
    orderHandle,
    status: "dispatched"
  });
  assert.equal(dispatched.timeline, "dispatched");
  assert.equal((dispatched.fulfilment as { status?: string } | undefined)?.status, "dispatched");
  assert.equal(
    ((dispatched.events as Array<{ kind?: string; status?: string }>) ?? []).some(
      (item) => item.kind === "fulfilment" && (item.status === "shipped" || item.status === "packed")
    ),
    false
  );

  const created = await supportTool({
    config: runtime.config,
    idempotencyKey: `scored-sup-${input.suffix}xxxx`,
    message: "Where is my order?",
    now: DET_V3_CLOCK,
    orderHandle,
    scope,
    store: runtime.store
  });
  const thread = (created.thread as Array<{ author: string; body: string; sequence: number }>) ?? [];
  const supportHandle = String((created as { supportHandle: string }).supportHandle);
  assert.equal(thread.length, 2);
  assert.equal(thread[0]?.author, "client");
  assert.equal(thread[1]?.author, "support");
  assert.equal(thread[1]?.body, "It is dispatched.");
  assert.equal(thread[0]?.sequence, 1);
  assert.equal(thread[1]?.sequence, 2);

  const delivered = await qaCall(runtime, "simulateFulfilment", {
    namespace: input.namespace,
    orderHandle,
    status: "delivered"
  });
  assert.equal(delivered.timeline, "delivered");
  assert.equal(delivered.paymentStatus, "paid");
  assert.equal(delivered.terminal, true);
  assert.equal(delivered.pollAfterSeconds, 0);
  assert.equal(delivered.nextAction, "none");

  const observed = await qaCall(runtime, "observe", {
    namespace: input.namespace,
    orderHandle
  });
  return {
    delivered,
    evidence,
    executed,
    observed,
    orderHandle,
    plan,
    supportHandle,
    thread
  };
}

beforeEach(() => {
  beginDetRun("scored");
});

afterEach(() => {
  endDetRun();
});

describe("Slice S1 clock and query isolation", () => {
  it("S1-01 golden request has no fixture supplement IDs", () => {
    const encoded = canonicalJson(goldenPlanRequest());
    assert.equal(/"supplementId"/.test(encoded), false);
    assert.equal(/sup_[0-9a-f-]{8}/i.test(encoded), false);
  });

  it("S1-02 QA simulate uses the pack clock, not wall-clock", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    assert.equal(begun.clock, QA_PACK_CLOCK);
    const listed = await handleQaJsonRpc(runtime, { id: 1, method: "tools/list" });
    const simulate = ((listed?.result?.tools as Array<{ name: string; inputSchema?: { properties?: Record<string, unknown> } }>) ?? [])
      .find((item) => item.name === "simulate");
    assert.ok(simulate?.inputSchema?.properties?.namespace);
    const fulfilment = ((listed?.result?.tools as Array<{ name: string; inputSchema?: { properties?: { status?: { enum?: string[] } } } }>) ?? [])
      .find((item) => item.name === "simulateFulfilment");
    assert.deepEqual(fulfilment?.inputSchema?.properties?.status?.enum, [...FULFILMENT_STATUSES]);
  });

  it("S1-03 observe query counters are isolated per beginRun namespace", async () => {
    const runtime = createDetRuntime();
    resetQueryBudget();
    const runA = await qaCall(runtime, "beginRun", { runId: "A" });
    const scopeA = {
      ...runtime.scope,
      principalScope: String(runA.principalScope ?? runA.namespace)
    };
    await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "scored-q-a-xxxxxxxxxxxx", request: goldenPlanRequest() },
      scope: scopeA,
      store: runtime.store
    });
    const observeA1 = await qaCall(runtime, "observe", {
      correlationId: "ns-a",
      namespace: String(runA.namespace)
    });
    const countA = Number((observeA1.queries as Record<string, number> | undefined)?.["catalogue.snapshot.TH"] ?? 0);
    assert.ok(countA >= 1);

    const runB = await qaCall(runtime, "beginRun", { runId: "B" });
    const scopeB = {
      ...runtime.scope,
      principalScope: String(runB.principalScope ?? runB.namespace)
    };
    await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "scored-q-b-xxxxxxxxxxxx", request: goldenPlanRequest() },
      scope: scopeB,
      store: runtime.store
    });
    const observeB = await qaCall(runtime, "observe", {
      correlationId: "ns-b",
      namespace: String(runB.namespace)
    });
    const observeA2 = await qaCall(runtime, "observe", {
      correlationId: "ns-a",
      namespace: String(runA.namespace)
    });
    assert.equal(
      Number((observeA2.queries as Record<string, number> | undefined)?.["catalogue.snapshot.TH"] ?? 0),
      countA
    );
    assert.ok(
      Number((observeB.queries as Record<string, number> | undefined)?.["catalogue.snapshot.TH"] ?? 0) >= 1
    );
    assert.notEqual(queryBudgetSnapshot(String(runA.namespace)), queryBudgetSnapshot(String(runB.namespace)));
  });
});

describe("Slice S2 paid-before-fulfilment and exactly-once", () => {
  it("S2-01 decline then success then pack aliases, exactly-once, terminal delivered", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const journey = await paidDeliveredJourney(runtime, {
      namespace: String(begun.namespace),
      principal: String(begun.principalScope ?? begun.namespace),
      suffix: "s2a"
    });
    assert.equal(journey.delivered.timeline, "delivered");
    assert.equal(journey.evidence.paymentConfirmedCount, 1);
  });
});

describe("Slice S3 support and funnel", () => {
  it("S3-01 nine-event funnel with locale, anonymous correlation, paid, and contribution", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    await qaCall(runtime, "setChannel", {
      acquisitionMinor: 150,
      attribution: "qa_campaign",
      namespace: begun.namespace
    });
    const journey = await paidDeliveredJourney(runtime, {
      namespace: String(begun.namespace),
      principal: String(begun.principalScope ?? begun.namespace),
      suffix: "s3a"
    });
    const events = (journey.observed.events as Array<{
      anonymousCorrelation?: string;
      eventId: string;
      eventType: string;
      locale?: string;
    }>) ?? [];
    const types = events.map((item) => item.eventType);
    for (const eventType of FUNNEL_EVENT_TYPES) {
      assert.equal(types.filter((item) => item === eventType).length, 1, eventType);
    }
    assert.equal(new Set(events.map((item) => item.eventId)).size, events.length);
    for (const event of events) {
      assert.equal(typeof event.locale, "string");
      assert.ok(String(event.locale).length > 0);
      assert.equal(typeof event.anonymousCorrelation, "string");
      assert.ok(String(event.anonymousCorrelation).length > 0);
    }
    assert.equal(typeof journey.observed.contributionMinor, "number");
    assert.notEqual(journey.observed.contributionMinor, null);
    assert.equal(typeof journey.observed.paymentMinor, "number");
    assert.equal(typeof journey.observed.productCostMinor, "number");
    assert.equal(typeof journey.observed.shippingSubsidyMinor, "number");
    assert.equal(typeof journey.observed.paymentFeeMinor, "number");
    assert.equal(typeof journey.observed.acquisitionMinor, "number");
    assert.equal(
      journey.observed.contributionMinor,
      Number(journey.observed.paymentMinor) -
        Number(journey.observed.productCostMinor) -
        Number(journey.observed.shippingSubsidyMinor) -
        Number(journey.observed.paymentFeeMinor) -
        Number(journey.observed.acquisitionMinor)
    );
    assert.equal(journey.observed.attribution, "qa_campaign");
    const again = await qaCall(runtime, "observe", {
      namespace: String(begun.namespace),
      orderHandle: journey.orderHandle
    });
    assert.equal(canonicalJson(journey.observed.queries), canonicalJson(again.queries));
    assert.equal(canonicalJson(journey.observed.events), canonicalJson(again.events));
  });

  it("S3-02 same-event retry is rejected and a different valid event is accepted", () => {
    resetFunnelLedger();
    const first = recordFunnelEvent({
      attribution: "agent_connector",
      correlationId: "corr-s3",
      createdAt: DET_V3_CLOCK,
      eventId: "same-event",
      eventType: "plan_created",
      payload: { locale: "en" }
    });
    const retry = recordFunnelEvent({
      attribution: "agent_connector",
      correlationId: "corr-s3",
      createdAt: DET_V3_CLOCK,
      eventId: "same-event",
      eventType: "plan_created",
      payload: { locale: "en" }
    });
    const next = recordFunnelEvent({
      attribution: "agent_connector",
      correlationId: "corr-s3",
      createdAt: DET_V3_CLOCK,
      eventId: "other-event",
      eventType: "plan_ready",
      payload: { locale: "th" }
    });
    assert.equal(first.accepted, true);
    assert.equal(retry.accepted, false);
    assert.equal(next.accepted, true);
    const events = listFunnelEvents("corr-s3");
    assert.equal(events.length, 2);
    assert.equal(events[0]?.payload.anonymousCorrelation, "corr-s3");
    assert.equal(events[0]?.payload.locale, "en");
    assert.equal(events[1]?.payload.locale, "th");
  });

  it("S3-03 support thread is client then system, not two client messages", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const journey = await paidDeliveredJourney(runtime, {
      namespace: String(begun.namespace),
      principal: String(begun.principalScope ?? begun.namespace),
      suffix: "s3c"
    });
    assert.deepEqual(
      journey.thread.map((item) => item.author),
      ["client", "support"]
    );
    assert.equal(journey.thread[1]?.body, "It is dispatched.");
  });
});

describe("Slice S4 connector copy and versions", () => {
  it("S4-01 connector copy states real-product matching, current-stock, overlap, and the safety boundary", () => {
    assert.equal(englishConnectorWordCount() <= 60, true);
    assert.match(CONNECTOR_COPY.en, /real-product matching/i);
    assert.match(CONNECTOR_COPY.en, /current-stock/i);
    assert.match(CONNECTOR_COPY.en, /overlap optimiz/i);
    assert.match(CONNECTOR_COPY.en, /wellness/i);
    assert.match(CONNECTOR_COPY.en, /not clinical/i);
    assert.match(CONNECTOR_COPY.en, /not diagnosis|not clinical diagnosis/i);
  });

  it("S4-02 responsibility-3.0.0 is on discovery, info, and execute", async () => {
    const runtime = createDetRuntime();
    const listed = await handleJsonRpc(runtime, { id: 1, method: "tools/list" });
    assert.equal(listed?.result?.responsibilityVersion, RESPONSIBILITY_VERSION);
    const init = await handleJsonRpc(runtime, { id: 2, method: "initialize", params: {} });
    assert.equal(init?.result?.responsibilityVersion, RESPONSIBILITY_VERSION);
    assert.match(String(init?.result?.instructions ?? ""), /responsibility-3\.0\.0/);
    const info = await detCall(runtime, "info", { locale: "en" });
    assert.equal(info.responsibilityVersion, RESPONSIBILITY_VERSION);
    const tools = await detListTools(runtime, "en");
    assert.deepEqual(
      tools.map((item) => item.name),
      [...AGENTIC_PUBLIC_TOOLS]
    );
    const listedTools = (listed?.result?.tools as Array<{ name: string; responsibilityVersion?: string }>) ?? [];
    for (const tool of listedTools) {
      assert.equal(tool.responsibilityVersion, RESPONSIBILITY_VERSION, tool.name);
    }
  });

  it("S4-03 evidence claims each carry researchVersion", async () => {
    const runtime = createDetRuntime();
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "scored-ev-plan-xxxxxxxxx", request: goldenPlanRequest() },
      scope: runtime.scope,
      store: runtime.store
    });
    const handle = (plan as { evidenceHandle?: string }).evidenceHandle;
    if (!handle) {
      assert.ok((plan as { status?: string }).status !== "ready");
      return;
    }
    const evidence = await detCall(runtime, "evidence", { evidenceHandle: handle, mode: "summary" });
    assert.equal(evidence.researchVersion, RESEARCH_VERSION);
    const claims = (evidence.claims as Array<{ researchVersion?: string }>) ?? [];
    for (const claim of claims) {
      assert.equal(claim.researchVersion, RESEARCH_VERSION);
    }
  });
});

describe("Slice S5 isolation without fixture SKUs", () => {
  it("S5-01 isolationProof creates Alice's live-named plan and rejects Bob", async () => {
    const runtime = createDetRuntime();
    const proof = await isolationProof(runtime);
    assert.equal(proof.passed, true, canonicalJson(proof.checks));
    const alice = proof.checks.find((item) => item.name === "alice_plan_created");
    assert.equal(alice?.passed, true);
  });

  it("S5-02 checkoutContinuityProof decline then success is exactly-once", async () => {
    const runtime = createDetRuntime();
    const proof = await checkoutContinuityProof(runtime);
    assert.equal(proof.passed, true, canonicalJson(proof.checks));
  });
});

describe("Slice S6 latency", () => {
  it("S6-01 latencyProof is ready and inside in-process budgets", async () => {
    const runtime = createDetRuntime();
    const proof = await latencyProof(runtime);
    assert.equal("reason" in proof && proof.reason === "plan_not_ready", false, canonicalJson(proof));
    assert.equal(proof.passed, true, canonicalJson(proof));
    assert.equal((proof as { sleeps?: number }).sleeps, 0);
    assert.equal((proof as { polling?: boolean }).polling, false);
    const queries = ((proof as { queries?: Record<string, number> }).queries ?? {});
    assert.ok(Object.keys(queries).length >= 1);
    assert.equal((proof as { dependencyBudget?: { sleeps?: number } }).dependencyBudget?.sleeps, 0);
  });

  it("S6-02 gold plan p50/p95 stay inside live limits", async () => {
    const samples: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      const runtime = createDetRuntime({ principal: `s6-${index}` });
      const started = performance.now();
      const plan = await planTool({
        config: runtime.config,
        now: DET_V3_CLOCK,
        payload: {
          idempotencyKey: `scored-lat-${String(index).padStart(12, "0")}`,
          request: goldenPlanRequest()
        },
        scope: runtime.scope,
        store: runtime.store
      });
      samples.push(performance.now() - started);
      assert.equal((plan as { ok?: boolean }).ok, true);
    }
    const sorted = [...samples].sort((left, right) => left - right);
    const p50 = sorted[Math.ceil(0.5 * sorted.length) - 1] ?? 0;
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0;
    assert.ok(p50 <= 5000, `p50 ${p50}`);
    assert.ok(p95 <= 8000, `p95 ${p95}`);
  });
});

describe("Slice 8.2 remaining scored holes", () => {
  it("82-VAL-01 connector copy includes the frozen not-clinical safety boundary", () => {
    assert.match(CONNECTOR_COPY.en, /not clinical/i);
    assert.equal(englishConnectorWordCount() <= 60, true);
  });

  it("82-TRUST-06 checkout and execute expose the complete four-domain summary", async () => {
    const checkout = checkoutResponsibilityCopy("en");
    assert.equal(checkout.version, RESPONSIBILITY_VERSION);
    assert.ok(checkout.guidance);
    assert.ok(checkout.payment);
    assert.ok(checkout.fulfilment);
    assert.ok(checkout.support);
    const runtime = createDetRuntime();
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "scored-82-exec-planxxxx", request: goldenPlanRequest() },
      scope: runtime.scope,
      store: runtime.store
    });
    if ((plan as { status?: string }).status !== "ready") {
      return;
    }
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: (plan as { revision: number }).revision,
      idempotencyKey: "scored-82-exec-execxxxx",
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: (plan as { planHandle: string }).planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    const responsibility = (executed as { responsibility?: { domains?: Array<{ domain: string }>; version?: string } })
      .responsibility;
    assert.equal((executed as { responsibilityVersion?: string }).responsibilityVersion, RESPONSIBILITY_VERSION);
    assert.equal(responsibility?.version, RESPONSIBILITY_VERSION);
    assert.deepEqual(
      (responsibility?.domains ?? []).map((item) => item.domain),
      ["guidance", "payment", "fulfilment", "support"]
    );
  });

  it("82-TECH-04 locale mutation keeps selectionReason.message stable", async () => {
    const runtime = createDetRuntime();
    const en = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "scored-82-loc-enxxxxxxx",
        request: { ...goldenPlanRequest(), locale: "en" }
      },
      scope: runtime.scope,
      store: runtime.store
    });
    const th = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "scored-82-loc-thxxxxxxx",
        request: { ...goldenPlanRequest(), locale: "th" }
      },
      scope: { ...runtime.scope, principalScope: "det-v3-th" },
      store: runtime.store
    });
    const enBasket = ((en as { selected?: { basket?: Array<{ selectionReason?: Record<string, unknown> }> } }).selected
      ?.basket ?? []) as Array<{ selectionReason?: Record<string, unknown> }>;
    const thBasket = ((th as { selected?: { basket?: Array<{ selectionReason?: Record<string, unknown> }> } }).selected
      ?.basket ?? []) as Array<{ selectionReason?: Record<string, unknown> }>;
    if (enBasket[0]?.selectionReason && thBasket[0]?.selectionReason) {
      assert.equal(
        canonicalJson({
          code: enBasket[0].selectionReason.code,
          message: enBasket[0].selectionReason.message,
          messageKey: enBasket[0].selectionReason.messageKey
        }),
        canonicalJson({
          code: thBasket[0].selectionReason.code,
          message: thBasket[0].selectionReason.message,
          messageKey: thBasket[0].selectionReason.messageKey
        })
      );
    }
  });

  it("82-COM-09 canned dispatched line is support, not a second client message", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const journey = await paidDeliveredJourney(runtime, {
      namespace: String(begun.namespace),
      principal: String(begun.principalScope ?? begun.namespace),
      suffix: "82c"
    });
    const again = await supportTool({
      config: runtime.config,
      idempotencyKey: "scored-82-sup-ackxxxxx",
      message: "It is dispatched.",
      now: DET_V3_CLOCK,
      orderHandle: journey.orderHandle,
      scope: {
        ...runtime.scope,
        principalScope: String(begun.principalScope ?? begun.namespace)
      },
      store: runtime.store,
      supportHandle: journey.supportHandle
    });
    const thread = (again as { thread: Array<{ author: string; body: string; sequence: number }> }).thread;
    const dispatched = thread.filter((item) => item.body === "It is dispatched.");
    assert.ok(dispatched.length >= 1);
    assert.equal(dispatched.every((item) => item.author === "support"), true);
    assert.equal(thread.filter((item) => item.author === "client").length, 1);
  });

  it("82-TECH-06 observe reports match queries and a zero-sleep dependency budget", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const scope = {
      ...runtime.scope,
      principalScope: String(begun.principalScope ?? begun.namespace)
    };
    await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "scored-82-obs-planxxxxx", request: goldenPlanRequest() },
      scope,
      store: runtime.store
    });
    const observed = await qaCall(runtime, "observe", {
      correlationId: "tech-06",
      namespace: String(begun.namespace)
    });
    const queries = (observed.queries ?? {}) as Record<string, number>;
    assert.ok(typeof queries["catalogue.snapshot.TH"] === "number");
    assert.ok(typeof queries["plan.match"] === "number");
    const budget = observed.dependencyBudget as { polling?: boolean; sleeps?: number };
    assert.equal(budget.sleeps, 0);
    assert.equal(budget.polling, false);
  });

  it("82-TECH-07 thirty identical cached plans meet live p50/p95", async () => {
    const runtime = createDetRuntime();
    const samples: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      const started = performance.now();
      const plan = await planTool({
        config: runtime.config,
        now: DET_V3_CLOCK,
        payload: {
          idempotencyKey: `scored-82-30-${String(index).padStart(10, "0")}`,
          request: goldenPlanRequest()
        },
        scope: { ...runtime.scope, principalScope: `s82-${index}` },
        store: runtime.store
      });
      samples.push(performance.now() - started);
      assert.equal((plan as { ok?: boolean }).ok, true);
    }
    const sorted = [...samples].sort((left, right) => left - right);
    const p50 = sorted[Math.ceil(0.5 * sorted.length) - 1] ?? 0;
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0;
    assert.ok(p50 <= 5000, `p50 ${p50}`);
    assert.ok(p95 <= 8000, `p95 ${p95}`);
  });
});
