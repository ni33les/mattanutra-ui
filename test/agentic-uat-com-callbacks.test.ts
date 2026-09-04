import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { applyVerifiedPaymentEvent } from "../lib/agentic/commerce/state.ts";
import { mockEventForScenario } from "../lib/agentic/commerce/payment.ts";
import { processOmsOutbox, applyFulfilmentEvent } from "../lib/agentic/retail/mock-thailand.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { orderTool } from "../lib/agentic/commerce/order.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import { flushFunnelProcessCache, listFunnelEvents } from "../lib/agentic/funnel/ledger.ts";
import { resetQaSessions } from "../lib/agentic/qa/session.ts";
import {
  beginDetRun,
  createDetRuntime,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK } from "./agentic/det-v3/manifest.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function structured(response: { result?: { structuredContent?: unknown } } | null) {
  return asRecord(response?.result?.structuredContent ?? response?.result);
}

async function qaCall(
  runtime: ReturnType<typeof createDetRuntime>,
  name: string,
  args: Record<string, unknown>
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

async function unpaidOrder(suffix: string) {
  const runtime = createDetRuntime();
  const begun = await qaCall(runtime, "beginRun", { runId: "A" });
  const namespace = String(begun.namespace);
  await qaCall(runtime, "setChannel", {
    acquisitionMinor: 1000,
    attribution: "agent_connector",
    namespace
  });
  const scope = {
    ...runtime.scope,
    principalScope: String(begun.principalScope ?? namespace)
  };
  const plan = await planTool({
    config: runtime.config,
    now: DET_V3_CLOCK,
    payload: { idempotencyKey: `uat-plan-${suffix}xxxxxxxx`, request: goldenPlanRequest() },
    scope,
    store: runtime.store
  });
  const executed = await executeTool({
    config: runtime.config,
    expectedRevision: Number((plan as { revision: number }).revision),
    idempotencyKey: `uat-exec-${suffix}xxxxxxxx`,
    now: DET_V3_CLOCK,
    payment: runtime.payment,
    planHandle: String((plan as { planHandle: string }).planHandle),
    scope,
    store: runtime.store
  });
  const orderHandle = String((executed as { orderHandle: string }).orderHandle);
  const capability = await resolveCapability({
    action: "order.read",
    config: runtime.config,
    handle: orderHandle,
    now: DET_V3_CLOCK,
    resourceType: "order",
    scope,
    store: runtime.store
  });
  assert.ok(capability);
  const order = await runtime.store.getOrder(capability.resourceId);
  assert.ok(order?.providerSessionId);
  return { runtime, scope, namespace, orderHandle, order };
}

describe("UAT COM callback and fulfilment determinism", () => {
  beforeEach(() => {
    beginDetRun("uat-com");
  });
  afterEach(() => {
    endDetRun();
  });

  it("UAT-COM-05-RED-01 success then decline does not reopen a paid order", async () => {
    const { runtime, order } = await unpaidOrder("05a");
    const success = mockEventForScenario({
      amountMinor: order.totalPriceMinor,
      currency: order.currency,
      orderId: order.id,
      providerSessionId: order.providerSessionId!,
      scenario: "success"
    });
    await applyVerifiedPaymentEvent({ event: success, now: DET_V3_CLOCK, store: runtime.store });
    const decline = mockEventForScenario({
      amountMinor: order.totalPriceMinor,
      currency: order.currency,
      orderId: order.id,
      providerSessionId: order.providerSessionId!,
      scenario: "decline_insufficient_funds"
    });
    const late = await applyVerifiedPaymentEvent({
      event: { ...decline, providerEventId: "evt_late_decline_after_paid" },
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    const attempts = await runtime.store.listPaymentAttempts(order.id);
    assert.equal(late?.order.paymentStatus, "paid");
    assert.notEqual(late?.order.paymentStatus, "unpaid");
    assert.equal(attempts.length, 1);
  });

  it("UAT-COM-05-RED-02 return and webhook success share one confirmation", async () => {
    const { runtime, order } = await unpaidOrder("05b");
    const sessionId = order.providerSessionId!;
    const first = await applyVerifiedPaymentEvent({
      event: {
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        providerEventId: `return:${sessionId}`,
        providerSessionId: sessionId,
        reason: null,
        scenario: "success",
        status: "succeeded"
      },
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    const second = await applyVerifiedPaymentEvent({
      event: {
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        providerEventId: "evt_webhook_duplicate_success",
        providerSessionId: sessionId,
        reason: null,
        scenario: "success",
        status: "succeeded"
      },
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    const audits = await runtime.store.listPaymentAudits(order.id);
    const confirmed = audits.filter((item) => item.type === "payment_confirmed");
    const attempts = await runtime.store.listPaymentAttempts(order.id);
    assert.equal(first?.applied, true);
    assert.equal(second?.applied, false);
    assert.equal(confirmed.length, 1);
    assert.equal(attempts.length, 1);
    assert.equal(second?.order.stateVersion, first?.order.stateVersion);
    assert.equal(second?.order.paymentStatus, "paid");
  });

  it("UAT-COM-04-RED decline then success then late decline stays paid", async () => {
    const { runtime, order } = await unpaidOrder("04");
    const sessionId = order.providerSessionId!;
    const declined = await applyVerifiedPaymentEvent({
      event: mockEventForScenario({
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        orderId: order.id,
        providerSessionId: sessionId,
        scenario: "decline_insufficient_funds"
      }),
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    assert.equal(declined?.order.paymentStatus, "unpaid");
    assert.equal(declined?.order.orderStatus, "open");
    assert.equal(declined?.order.latestPaymentAttempt, "declined");
    const paid = await applyVerifiedPaymentEvent({
      event: mockEventForScenario({
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        orderId: order.id,
        providerSessionId: sessionId,
        scenario: "success"
      }),
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    assert.equal(paid?.order.paymentStatus, "paid");
    assert.equal(paid?.order.stateVersion, 2);
    const late = await applyVerifiedPaymentEvent({
      event: {
        ...mockEventForScenario({
          amountMinor: order.totalPriceMinor,
          currency: order.currency,
          orderId: order.id,
          providerSessionId: sessionId,
          scenario: "decline_insufficient_funds"
        }),
        providerEventId: "evt_late_9995"
      },
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    assert.equal(late?.order.paymentStatus, "paid");
  });

  it("UAT-MKT-04-RED stripe-shaped decline then return and webhook keep one paid event", async () => {
    const { runtime, order } = await unpaidOrder("mkt04");
    const sessionId = order.providerSessionId!;
    await applyVerifiedPaymentEvent({
      event: {
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        providerEventId: "evt_stripe_9995_decline",
        providerSessionId: sessionId,
        reason: "insufficient_funds",
        scenario: "decline_insufficient_funds",
        status: "declined"
      },
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    await applyVerifiedPaymentEvent({
      event: {
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        providerEventId: `return:${sessionId}`,
        providerSessionId: sessionId,
        reason: null,
        scenario: "success",
        status: "succeeded"
      },
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    await applyVerifiedPaymentEvent({
      event: {
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        providerEventId: "evt_stripe_webhook_paid",
        providerSessionId: sessionId,
        reason: null,
        scenario: "success",
        status: "succeeded"
      },
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    const types = listFunnelEvents(order.planId).map((item) => item.eventType);
    assert.equal(types.filter((item) => item === "paid").length, 1);
    assert.equal(types.filter((item) => item === "payment_declined").length, 1);
    assert.ok(types.indexOf("payment_declined") < types.indexOf("paid"));
  });

  it("UAT-COM-05-RED-03 concurrent success callbacks confirm once", async () => {
    const { runtime, order } = await unpaidOrder("05c");
    const sessionId = order.providerSessionId!;
    const [first, second] = await Promise.all([
      applyVerifiedPaymentEvent({
        event: {
          amountMinor: order.totalPriceMinor,
          currency: order.currency,
          providerEventId: `return:${sessionId}`,
          providerSessionId: sessionId,
          reason: null,
          scenario: "success",
          status: "succeeded"
        },
        now: DET_V3_CLOCK,
        store: runtime.store
      }),
      applyVerifiedPaymentEvent({
        event: {
          amountMinor: order.totalPriceMinor,
          currency: order.currency,
          providerEventId: "evt_webhook_race_success",
          providerSessionId: sessionId,
          reason: null,
          scenario: "success",
          status: "succeeded"
        },
        now: DET_V3_CLOCK,
        store: runtime.store
      })
    ]);
    const attempts = await runtime.store.listPaymentAttempts(order.id);
    const audits = await runtime.store.listPaymentAudits(order.id);
    const paid = first?.order.paymentStatus === "paid" || second?.order.paymentStatus === "paid";
    assert.equal(paid, true);
    assert.equal(attempts.length, 1);
    assert.equal(audits.filter((item) => item.type === "payment_confirmed").length, 1);
  });

  it("UAT-COM-06-RED thailand_uat adapter still advances OMS after paid", async () => {
    const { runtime, order } = await unpaidOrder("06");
    await applyVerifiedPaymentEvent({
      event: mockEventForScenario({
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        orderId: order.id,
        providerSessionId: order.providerSessionId!,
        scenario: "success"
      }),
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    await processOmsOutbox({
      adapter: "thailand_uat",
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    const after = await runtime.store.getOrder(order.id);
    assert.notEqual(after?.fulfilmentStatus, "not_started");
  });

  it("UAT-COM-07-RED and UAT-COM-10-RED delivered is the terminal order read", async () => {
    const { runtime, scope, orderHandle, order } = await unpaidOrder("07");
    await applyVerifiedPaymentEvent({
      event: mockEventForScenario({
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        orderId: order.id,
        providerSessionId: order.providerSessionId!,
        scenario: "success"
      }),
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    await applyFulfilmentEvent({
      now: DET_V3_CLOCK,
      orderId: order.id,
      status: "shipped",
      store: runtime.store
    });
    await applyFulfilmentEvent({
      now: DET_V3_CLOCK,
      orderId: order.id,
      status: "delivered",
      store: runtime.store
    });
    const view = await orderTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store
    });
    assert.equal((view as { paymentStatus?: string }).paymentStatus, "paid");
    assert.equal((view as { timeline?: string }).timeline, "delivered");
    const types = listFunnelEvents(order.planId).map((item) => item.eventType);
    assert.equal(types.filter((item) => item === "paid").length, 1);
    assert.equal(types.filter((item) => item === "dispatched").length, 1);
    assert.equal(types.filter((item) => item === "delivered").length, 1);
    const again = await applyFulfilmentEvent({
      now: DET_V3_CLOCK,
      orderId: order.id,
      status: "processing",
      store: runtime.store
    });
    assert.equal(again?.fulfilmentStatus, "delivered");
    assert.equal(listFunnelEvents(order.planId).filter((item) => item.eventType === "delivered").length, 1);
  });

  it("UAT-COM-REPLICA observe survives instance cache flush", async () => {
    const { runtime, namespace, orderHandle, order } = await unpaidOrder("rep");
    await qaCall(runtime, "simulate", {
      namespace,
      orderHandle,
      scenario: "success"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace,
      orderHandle,
      status: "dispatched"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace,
      orderHandle,
      status: "delivered"
    });
    const first = await qaCall(runtime, "observe", { namespace, orderHandle });
    flushFunnelProcessCache();
    resetQaSessions();
    const second = await qaCall(runtime, "observe", { namespace, orderHandle });
    const firstEvents = ((first.events as Array<{ eventType: string }>) ?? []).map((item) => item.eventType);
    const secondEvents = ((second.events as Array<{ eventType: string }>) ?? []).map((item) => item.eventType);
    assert.equal(first.attribution, "agent_connector");
    assert.equal(second.attribution, "agent_connector");
    assert.equal(asRecord(asRecord(second.contribution).inputs).acquisitionCostMinor, 1000);
    assert.deepEqual(secondEvents, firstEvents);
    assert.ok(firstEvents.length >= 7);
    void order;
  });

  it("UAT-MKT-08-RED stripe-shaped pay keeps paid-order attribution exactly once", async () => {
    const { runtime, namespace, orderHandle, order } = await unpaidOrder("mkt08");
    await applyVerifiedPaymentEvent({
      event: {
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        providerEventId: `return:${order.providerSessionId}`,
        providerSessionId: order.providerSessionId!,
        reason: null,
        scenario: "success",
        status: "succeeded"
      },
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    flushFunnelProcessCache();
    resetQaSessions();
    const observed = await qaCall(runtime, "observe", { namespace, orderHandle });
    const types = ((observed.events as Array<{ eventType: string }>) ?? []).map((item) => item.eventType);
    assert.equal(observed.attribution, "agent_connector");
    assert.equal(types.filter((item) => item === "paid").length, 1);
  });
});
