import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createHash } from "node:crypto";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { supportTool } from "../lib/agentic/support.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { goldenPlanRequest, latencyProof } from "../lib/agentic/qa/proofs.ts";
import { QA_PACK_CLOCK } from "../lib/agentic/qa/session.ts";
import {
  beginDetRun,
  canonicalJson,
  createDetRuntime,
  endDetRun,
  firstDivergence
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

function hash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function stripOpaque(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripOpaque);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === "formulaId") {
      next[key] = child;
      continue;
    }
    if (
      /handle|Handle|Id$|id$|Url$|url$|reference|Reference|namespace|correlation/i.test(key) &&
      typeof child === "string"
    ) {
      next[key] = "[opaque]";
      continue;
    }
    next[key] = stripOpaque(child);
  }
  return next;
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

async function completeJourney(runId: string, suffix: string) {
  const runtime = createDetRuntime({ now: QA_PACK_CLOCK });
  const begun = await qaCall(runtime, "beginRun", { runId });
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
    payload: { idempotencyKey: `det-plan-${runId}-${suffix}xxxx`, request: goldenPlanRequest() },
    scope,
    store: runtime.store
  });
  const executed = await executeTool({
    config: runtime.config,
    expectedRevision: Number((plan as { revision: number }).revision),
    idempotencyKey: `det-exec-${runId}-${suffix}xxxx`,
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
  await qaCall(runtime, "simulateFulfilment", { namespace, orderHandle, status: "dispatched" });
  await qaCall(runtime, "simulateFulfilment", { namespace, orderHandle, status: "delivered" });
  const opened = await supportTool({
    config: runtime.config,
    idempotencyKey: `det-sup-${runId}-${suffix}xxxxx`,
    message: "Where is my synthetic order?",
    now: DET_V3_CLOCK,
    orderHandle,
    scope,
    store: runtime.store
  });
  await supportTool({
    config: runtime.config,
    idempotencyKey: `det-sup-r-${runId}-${suffix}xxxx`,
    message: "It is dispatched.",
    now: DET_V3_CLOCK,
    orderHandle,
    scope,
    store: runtime.store,
    supportHandle: String((opened as { supportHandle: string }).supportHandle)
  });
  const observed = await qaCall(runtime, "observe", { namespace, orderHandle });
  const observed2 = await qaCall(runtime, "observe", { namespace, orderHandle });
  const proof = await latencyProof(runtime);
  return {
    contribution: observed.contribution,
    events: ((observed.events as Array<{ eventType: string; sequence: number }>) ?? []).map((item) => ({
      eventType: item.eventType,
      sequence: item.sequence
    })),
    proof,
    replay: stripOpaque(opened),
    observe: stripOpaque(observed),
    observe2: stripOpaque(observed2),
    thread: ((opened as { thread: Array<{ author: string; body: string; sequence: number }> }).thread ?? []).map(
      (item) => ({ author: item.author, body: item.body, sequence: item.sequence })
    )
  };
}

describe("DET A/B integration", () => {
  beforeEach(() => {
    beginDetRun("det-ab");
  });
  afterEach(() => {
    endDetRun();
  });

  it("DET-01 two namespaces produce identical scored business evidence", async () => {
    const a = await completeJourney("A", "01");
    const b = await completeJourney("B", "01");
    assert.equal(firstDivergence(a.observe, b.observe), null);
    assert.equal(canonicalJson(a.thread), canonicalJson(b.thread));
    assert.equal(canonicalJson(a.events), canonicalJson(b.events));
    assert.equal(canonicalJson(a.contribution), canonicalJson(b.contribution));
  });

  it("DET-02 latencyProof observe support and funnel are canonical-identical", async () => {
    const a = await completeJourney("A", "02");
    const b = await completeJourney("B", "02");
    assert.equal(canonicalJson(a.proof), canonicalJson(b.proof));
    assert.equal(canonicalJson(a.observe), canonicalJson(b.observe));
    assert.equal(canonicalJson(a.observe2), canonicalJson(b.observe2));
    assert.equal(canonicalJson(a.replay), canonicalJson(b.replay));
    assert.equal(canonicalJson(a.events), canonicalJson(b.events));
  });

  it("DET-03 canonical comparison reports zero differing JSON paths", async () => {
    const a = await completeJourney("A", "03");
    const b = await completeJourney("B", "03");
    assert.equal(firstDivergence(a, b), null);
  });

  it("DET-04 funnel and support arrays use explicit sequence", async () => {
    const a = await completeJourney("A", "04");
    assert.deepEqual(
      a.events.map((item) => item.sequence),
      [1, 2, 3, 4, 5, 6, 7, 8, 9]
    );
    assert.deepEqual(
      a.thread.map((item) => item.sequence),
      [1, 2]
    );
  });

  it("DET-05 fake clock is the pack clock", async () => {
    assert.equal(QA_PACK_CLOCK, DET_V3_CLOCK);
    const a = await completeJourney("A", "05");
    assert.equal(a.thread.length >= 2, true);
  });

  it("DET-06 second local execution yields the same canonical hashes", async () => {
    const first = await completeJourney("A", "06");
    const second = await completeJourney("A", "06b");
    assert.equal(hash(first.proof), hash(second.proof));
    assert.equal(hash(first.thread), hash(second.thread));
    assert.equal(hash(first.events), hash(second.events));
    assert.equal(hash(first.contribution), hash(second.contribution));
  });
});
