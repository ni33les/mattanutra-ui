import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mockEventForScenario } from "../lib/agentic/commerce/payment.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import { listFunnelEvents } from "../lib/agentic/funnel/ledger.ts";
import { FUNNEL_EVENT_TYPES } from "../lib/agentic/funnel/events.ts";
import {
  beginDetRun,
  canonicalJson,
  createDetRuntime,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK } from "./agentic/det-v3/manifest.ts";

const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const COMPACT_32 = /(?:^|_)[0-9a-f]{32}(?:$|_)/i;

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

async function journey(suffix: string) {
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
    payload: { idempotencyKey: `evt-plan-${suffix}xxxxxxxxx`, request: goldenPlanRequest() },
    scope,
    store: runtime.store
  });
  const executed = await executeTool({
    config: runtime.config,
    expectedRevision: Number((plan as { revision: number }).revision),
    idempotencyKey: `evt-exec-${suffix}xxxxxxxxx`,
    now: DET_V3_CLOCK,
    payment: runtime.payment,
    planHandle: String((plan as { planHandle: string }).planHandle),
    scope,
    store: runtime.store
  });
  const orderHandle = String((executed as { orderHandle: string }).orderHandle);
  await qaCall(runtime, "simulate", {
    namespace,
    orderHandle,
    scenario: "decline_insufficient_funds"
  });
  await qaCall(runtime, "simulate", { namespace, orderHandle, scenario: "success" });
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
  const observed = await qaCall(runtime, "observe", { namespace, orderHandle });
  return { observed, orderHandle, namespace, runtime, planId: String((plan as { planHandle?: string }).planHandle) };
}

describe("Slice E canonicalizable payment event IDs", () => {
  beforeEach(() => {
    beginDetRun("evt");
  });
  afterEach(() => {
    endDetRun();
  });

  it("EVENT-RED-01 generated payment IDs use a hyphenated UUID", () => {
    const event = mockEventForScenario({
      amountMinor: 39800,
      currency: "THB",
      orderId: "11111111-1111-4111-8111-111111111111",
      providerSessionId: "mock_cs_test",
      scenario: "success"
    });
    assert.match(event.providerEventId, UUID);
    assert.equal(COMPACT_32.test(event.providerEventId), false);
    const declined = mockEventForScenario({
      amountMinor: 39800,
      currency: "THB",
      orderId: "11111111-1111-4111-8111-111111111111",
      providerSessionId: "mock_cs_test",
      scenario: "decline_insufficient_funds"
    });
    assert.match(declined.providerEventId, UUID);
    assert.equal(COMPACT_32.test(declined.providerEventId), false);
  });

  it("EVENT-RED-02 nine funnel event IDs are unique", async () => {
    const { observed } = await journey("02");
    const events = (observed.events as Array<{ eventId: string; eventType: string }>) ?? [];
    assert.equal(events.length, 9);
    assert.equal(new Set(events.map((item) => item.eventId)).size, 9);
    assert.deepEqual(
      events.map((item) => item.eventType),
      [...FUNNEL_EVENT_TYPES]
    );
  });

  it("EVENT-RED-03 duplicate payment reuses identity and adds no event", async () => {
    const { observed, namespace, orderHandle, runtime } = await journey("03");
    const before = ((observed.events as Array<{ eventId: string }>) ?? []).map((item) => item.eventId);
    await qaCall(runtime, "simulate", { namespace, orderHandle, scenario: "duplicate_success" });
    const after = await qaCall(runtime, "observe", { namespace, orderHandle });
    const ids = ((after.events as Array<{ eventId: string }>) ?? []).map((item) => item.eventId);
    assert.deepEqual(ids, before);
  });

  it("EVENT-RED-04 payment event IDs are canonicalizable UUIDs in observe", async () => {
    const { observed } = await journey("04");
    const payment = ((observed.events as Array<{ eventId: string; eventType: string }>) ?? []).filter(
      (item) => item.eventType === "payment_declined" || item.eventType === "paid"
    );
    assert.equal(payment.length, 2);
    for (const item of payment) {
      assert.match(item.eventId, UUID);
      assert.equal(COMPACT_32.test(item.eventId), false);
    }
  });

  it("EVENT-RED-05 funnel remains sequence 1-9 in required order", async () => {
    const { observed } = await journey("05");
    const events = (observed.events as Array<{ sequence: number; eventType: string }>) ?? [];
    assert.deepEqual(
      events.map((item) => item.sequence),
      [1, 2, 3, 4, 5, 6, 7, 8, 9]
    );
    assert.deepEqual(
      events.map((item) => item.eventType),
      [...FUNNEL_EVENT_TYPES]
    );
    void canonicalJson(events);
    void listFunnelEvents;
  });
});
