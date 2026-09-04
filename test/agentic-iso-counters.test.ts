import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import { queryBudgetSnapshot, resetQueryBudget } from "../lib/agentic/plan/query-budget.ts";
import {
  beginDetRun,
  createDetRuntime,
  endDetRun,
  simulateInstanceRestart
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

describe("Slice C run-scoped counters", () => {
  beforeEach(() => {
    beginDetRun("iso");
  });
  afterEach(() => {
    endDetRun();
  });

  it("ISO-RED-01 fresh beginRun starts counters at zero", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const snapshot = queryBudgetSnapshot(String(begun.namespace));
    assert.deepEqual(snapshot, {});
  });

  it("ISO-RED-02 one plan increments only that namespace", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const namespace = String(begun.namespace);
    const before = { ...queryBudgetSnapshot(namespace) };
    await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "iso-plan-02xxxxxxxxxxxx", request: goldenPlanRequest() },
      scope: { ...runtime.scope, principalScope: String(begun.principalScope ?? namespace) },
      store: runtime.store
    });
    const after = queryBudgetSnapshot(namespace);
    assert.notDeepEqual(after, before);
    assert.equal(typeof after["plan.match"] === "number" || typeof after["catalogue.snapshot.TH"] === "number", true);
  });

  it("ISO-RED-03 activity in A cannot change B counters", async () => {
    const runtime = createDetRuntime();
    const runA = await qaCall(runtime, "beginRun", { runId: "A" });
    const runB = await qaCall(runtime, "beginRun", { runId: "B" });
    const nsA = String(runA.namespace);
    const nsB = String(runB.namespace);
    const beforeB = { ...queryBudgetSnapshot(nsB) };
    await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "iso-plan-03xxxxxxxxxxxx", request: goldenPlanRequest() },
      scope: { ...runtime.scope, principalScope: String(runA.principalScope ?? nsA) },
      store: runtime.store
    });
    assert.deepEqual(queryBudgetSnapshot(nsB), beforeB);
  });

  it("ISO-RED-04 observe returns counters for the order namespace", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const namespace = String(begun.namespace);
    const scope = { ...runtime.scope, principalScope: String(begun.principalScope ?? namespace) };
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "iso-plan-04xxxxxxxxxxxx", request: goldenPlanRequest() },
      scope,
      store: runtime.store
    });
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: Number((plan as { revision: number }).revision),
      idempotencyKey: "iso-exec-04xxxxxxxxxxxx",
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: String((plan as { planHandle: string }).planHandle),
      scope,
      store: runtime.store
    });
    const observed = await qaCall(runtime, "observe", {
      namespace,
      orderHandle: String((executed as { orderHandle: string }).orderHandle)
    });
    assert.equal(observed.namespace, namespace);
    const queries = asRecord(observed.queries);
    assert.equal(Object.keys(queries).length > 0, true);
  });

  it("ISO-RED-05 reset removes namespace counters", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const namespace = String(begun.namespace);
    await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "iso-plan-05xxxxxxxxxxxx", request: goldenPlanRequest() },
      scope: { ...runtime.scope, principalScope: String(begun.principalScope ?? namespace) },
      store: runtime.store
    });
    assert.equal(Object.keys(queryBudgetSnapshot(namespace)).length > 0, true);
    await qaCall(runtime, "resetRun", { namespace });
    resetQueryBudget(namespace);
    assert.deepEqual(queryBudgetSnapshot(namespace), {});
  });

  it("ISO-RED-06 replica restart still exposes the same scoped observe queries shape", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const namespace = String(begun.namespace);
    const scope = { ...runtime.scope, principalScope: String(begun.principalScope ?? namespace) };
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "iso-plan-06xxxxxxxxxxxx", request: goldenPlanRequest() },
      scope,
      store: runtime.store
    });
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: Number((plan as { revision: number }).revision),
      idempotencyKey: "iso-exec-06xxxxxxxxxxxx",
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: String((plan as { planHandle: string }).planHandle),
      scope,
      store: runtime.store
    });
    const first = await qaCall(runtime, "observe", {
      namespace,
      orderHandle: String((executed as { orderHandle: string }).orderHandle)
    });
    simulateInstanceRestart();
    const second = await qaCall(runtime, "observe", {
      namespace,
      orderHandle: String((executed as { orderHandle: string }).orderHandle)
    });
    assert.deepEqual(Object.keys(asRecord(first.queries)).sort(), Object.keys(asRecord(second.queries)).sort());
  });
});
