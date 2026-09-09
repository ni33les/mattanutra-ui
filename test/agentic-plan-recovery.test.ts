import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { createAgenticRuntime, type AgenticRuntime } from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import type { AgenticStore } from "../lib/agentic/store/types.ts";
import type { PlanResult } from "../lib/agentic/plan/types.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { handleCompletedFullJsonRpc } from "./helpers/completed-mcp-client.ts";
import { cancelPlanOperation } from "../lib/agentic/plan/operations.ts";
import { resetServiceClock } from "../lib/agentic/qa/service-clock.ts";
import { resetRequestTraces } from "../lib/agentic/qa/request-trace.ts";
import { resetResourcePermits } from "../lib/agentic/qa/resource-permits.ts";
import { resetCataloguePins } from "../lib/agentic/catalogue/pin.ts";
import {
  runAdmittedPlanOperation, resetPlanCreateInflightForTests, setMatcherEnteredForTests,
  setMatcherGateForTests
} from "../lib/agentic/plan/service.ts";

const request = {
  destinationCountry: "TH", locale: "en", optimization: "balanced",
  profile: { ageYears: 38, lifeStage: "adult", sex: "male" }, requirements: {},
  targets: [{ name: "Vitamin D3", amount: 1000, unit: "IU" }]
};
const create = (idempotencyKey: string, input = request) => ({ operation: "create", idempotencyKey, request: input });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function runtimeFor(store: AgenticStore = createMemoryStore()) {
  return createAgenticRuntime({ store, scope: { environment: "dev", tenantScope: "mattanutra", principalScope: "plan-recovery-tests" } });
}
async function call(runtime: AgenticRuntime, args: Record<string, unknown>, complete = true) {
  const response = await (complete ? handleCompletedFullJsonRpc : handleJsonRpc)(runtime, { id: 1, method: "tools/call", params: { name: "plan", arguments: { responseView: "full", ...args } } });
  assert.ok(response?.result?.structuredContent, JSON.stringify(response));
  return response.result.structuredContent as Record<string, unknown> & { error?: { reasonCode: string } };
}
async function storedRevision(runtime: AgenticRuntime) {
  const ids = await runtime.store.listPlanIdsByPrincipal(runtime.scope.principalScope!);
  assert.equal(ids.length, 1);
  const revision = await runtime.store.getPlanRevision(ids[0]!, 1);
  assert.ok(revision);
  return revision;
}
async function operation(runtime: AgenticRuntime, key: string) {
  const row = await runtime.store.getPlanOperationByKey(`dev:mattanutra:${runtime.scope.principalScope}`, key);
  assert.ok(row, "Admitted work must have a durable operation"); return row;
}
async function execute(runtime: AgenticRuntime, key: string, signal?: AbortSignal) {
  const row = await operation(runtime, key);
  return runAdmittedPlanOperation({ store: runtime.store, config: runtime.config, operationId: row.id, signal });
}
async function interrupt(runtime: AgenticRuntime, args: Record<string, unknown>) {
  const admitted = await call(runtime, args, false);
  assert.equal(admitted.status, "processing");
  const gate = deferred(), entered = deferred(), controller = new AbortController();
  setMatcherGateForTests(gate.promise); setMatcherEnteredForTests(entered.resolve);
  const work = execute(runtime, String(args.idempotencyKey), controller.signal);
  try {
    await Promise.race([entered.promise, work.then(result => { throw new Error(`Worker returned before interruption: ${JSON.stringify(result)}`); })]);
    controller.abort(); gate.resolve();
    assert.equal((await work).ok, false);
  } finally { gate.resolve(); setMatcherGateForTests(null); setMatcherEnteredForTests(null); }
  assert.equal((await operation(runtime, String(args.idempotencyKey))).status, "retryable");
  const revision = await storedRevision(runtime);
  assert.equal(revision.status, "processing"); return revision;
}

beforeEach(() => {
  installGoldCatalogue(); resetPlanCreateInflightForTests(); resetServiceClock();
  resetRequestTraces(); resetResourcePermits();
});
afterEach(() => {
  setMatcherGateForTests(null); setMatcherEnteredForTests(null);
  resetPlanCreateInflightForTests(); resetCataloguePins(); uninstallGoldCatalogue();
});

describe("MCP interrupted plan recovery", { timeout: 15_000 }, () => {
  for (const explicitIds of [false, true]) {
    it(`recovers targets and current supplements supplied by ${explicitIds ? "ID" : "name"}`, async () => {
      const runtime = runtimeFor();
      const supplements = fixtureSnapshot().supplements;
      const input = { ...request,
        targets: request.targets.map(target => ({ ...target,
          ...(explicitIds ? { supplementId: supplements.find(item => item.name === target.name)!.supplementId } : {}) })),
        currentSupplements: [{ name: "Magnesium", dailyAmount: 75, daysRemaining: 7, unit: "mg",
          ...(explicitIds ? { supplementId: supplements.find(item => item.name === "Magnesium")!.supplementId } : {}) }]
      };
      const args = create(`recovery-input-${explicitIds}`, input);
      const pending = await interrupt(runtime, args);
      assert.deepEqual((pending.result as PlanResult).pendingInput?.request, input);
      const resumed = await call(runtime, args);
      assert.equal(resumed.ok, true, JSON.stringify(resumed));
      assert.equal(resumed.status, "ready");
      assert.equal(resumed.revision, 1);
      assert.equal(resumed.pendingInput, undefined);
      assert.deepEqual(await call(runtime, args), resumed);
      const complete = (await storedRevision(runtime)).result as PlanResult;
      assert.equal(complete.pendingInput, undefined);
      assert.match(complete.requestSnapshot.currentSupplements[0]!.supplementId, /^sup_/);
    });
  }

  it("a handle poll observes recovered worker completion without changing idempotency identity", async () => {
    const runtime = runtimeFor();
    const args = create("recovery-handle-poll");
    await interrupt(runtime, args);
    const owner = `${runtime.scope.environment}:${runtime.scope.tenantScope}:${runtime.scope.principalScope}`;
    const receipt = await runtime.store.getIdempotency("plan", owner, args.idempotencyKey);
    assert.ok(receipt);
    const { planHandle } = JSON.parse(receipt.responseJson);
    const pending = await call(runtime, { operation: "get", planHandle });
    assert.equal(pending.status, "processing", "GET cannot execute admitted work");
    await execute(runtime, args.idempotencyKey);
    const resumed = await call(runtime, { operation: "get", planHandle });
    assert.equal(resumed.status, "ready", JSON.stringify(resumed));
    assert.equal((await runtime.store.getIdempotency("plan", owner, args.idempotencyKey))?.requestHash, receipt.requestHash);
    assert.deepEqual(await call(runtime, args), resumed);
  });

  it("recovers a legacy processing row only from a verified original request", async () => {
    const runtime = runtimeFor();
    const args = create("recovery-legacy-input");
    const revision = await interrupt(runtime, args);
    const result = { ...revision.result } as PlanResult & { pendingInput?: unknown };
    delete result.pendingInput;
    await runtime.store.updatePlanRevision({ ...revision, result });
    const owner = `${runtime.scope.environment}:${runtime.scope.tenantScope}:${runtime.scope.principalScope}`;
    const receipt = (await runtime.store.getIdempotency("plan", owner, args.idempotencyKey))!;
    const { planHandle } = JSON.parse(receipt.responseJson);
    const poll = await call(runtime, { operation: "get", planHandle });
    assert.equal(poll.status, "processing");
    assert.deepEqual((await operation(runtime, args.idempotencyKey)).command.payload.request, request, "Durable original input survives old processing-row omissions");
    const changed = await call(runtime, create(args.idempotencyKey, { ...request, targets: [{ ...request.targets[0]!, amount: 2000 }] }));
    assert.equal(changed.error?.reasonCode, "idempotency_conflict");
    assert.equal((await call(runtime, args)).status, "ready");
  });

  it("uses the replacement input when explicitly revising an interrupted plan", async () => {
    const runtime = runtimeFor();
    const args = create("recovery-revise-pending");
    await interrupt(runtime, args);
    const owner = `${runtime.scope.environment}:${runtime.scope.tenantScope}:${runtime.scope.principalScope}`;
    const receipt = (await runtime.store.getIdempotency("plan", owner, args.idempotencyKey))!;
    const { planHandle } = JSON.parse(receipt.responseJson);
    await cancelPlanOperation(runtime.store, (await operation(runtime, args.idempotencyKey)).id, new Date().toISOString());
    const changed = await call(runtime, {
      operation: "revise", planHandle, expectedRevision: 1, idempotencyKey: "recovery-replacement-input",
      request: { ...request, targets: [{ ...request.targets[0]!, amount: 2000 }] }
    });
    assert.equal(changed.ok, true, JSON.stringify(changed));
    const [planId] = await runtime.store.listPlanIdsByPrincipal(runtime.scope.principalScope!);
    const result = (await runtime.store.getPlanRevision(planId!, Number(changed.revision)))!.result as PlanResult;
    assert.equal(result.requestSnapshot.targets[0]?.amount, 2000);
  });

  it("does not reinterpret an explicit unknown ID as a valid name on resume", async () => {
    const runtime = runtimeFor();
    const args = create("recovery-invalid-id", { ...request,
      targets: [{ ...request.targets[0]!, supplementId: "sup_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" }] } as typeof request);
    assert.equal((await call(runtime, args)).error?.reasonCode, "incompatible_identity");
    assert.equal((await storedRevision(runtime)).status, "processing");
  });

  it("a conflicting follower cannot evict the original active request", async () => {
    const runtime = runtimeFor(), gate = deferred(), entered = deferred();
    let matchEntries = 0;
    setMatcherGateForTests(gate.promise); setMatcherEnteredForTests(() => { matchEntries++; entered.resolve(); });
    const args = create("recovery-active-conflict");
    const admitted = await call(runtime, args, false);
    const worker = execute(runtime, args.idempotencyKey);
    await entered.promise;
    try {
      const conflict = await call(runtime, create(args.idempotencyKey, { ...request, locale: "th" }), false);
      assert.equal(conflict.error?.reasonCode, "idempotency_conflict");
      const owner = await operation(runtime, args.idempotencyKey);
      assert.equal(owner.status, "running");
      assert.equal((await call(runtime, { operation: "get", planHandle: admitted.planHandle }, false)).status, "processing");
      gate.resolve(); await worker;
      const left = await call(runtime, args), right = await call(runtime, args);
      assert.equal(left.status, "ready"); assert.deepEqual(right, left); assert.equal(matchEntries, 1);
      assert.equal((await operation(runtime, args.idempotencyKey)).id, owner.id);
    } finally { gate.resolve(); await worker; }
  });

  it("late cancelled work cannot remove or overwrite its replacement", async () => {
    const runtime = runtimeFor(), gate = deferred(), entered = deferred();
    const args = create("recovery-late-cancelled");
    const admitted = await call(runtime, args, false);
    setMatcherGateForTests(gate.promise); setMatcherEnteredForTests(entered.resolve);
    const old = execute(runtime, args.idempotencyKey);
    await entered.promise;
    const owner = await operation(runtime, args.idempotencyKey);
    try {
      assert.equal(await cancelPlanOperation(runtime.store, owner.id, new Date().toISOString()), true);
      setMatcherGateForTests(null); setMatcherEnteredForTests(null);
      const replacement = await call(runtime, { operation: "revise", planHandle: admitted.planHandle, expectedRevision: 1,
        idempotencyKey: "recovery-replaced-cancelled", request: { ...request, targets: [{ ...request.targets[0], amount: 2000 }] } });
      assert.equal(replacement.status, "ready", JSON.stringify(replacement));
      const [planId] = await runtime.store.listPlanIdsByPrincipal(runtime.scope.principalScope!);
      const saved = await runtime.store.getPlanRevision(planId!, Number(replacement.revision));
      gate.resolve(); assert.equal((await old).ok, false);
      assert.deepEqual(await runtime.store.getPlanRevision(planId!, Number(replacement.revision)), saved);
      assert.equal((await runtime.store.getPlan(planId!))?.currentRevision, replacement.revision);
      assert.equal((await operation(runtime, args.idempotencyKey)).status, "cancelled");
    } finally { gate.resolve(); await old; }
  });

});
