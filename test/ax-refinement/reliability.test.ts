import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { profile, runtime, rpc, rpcWithTaskExecutor, installRealCatalogue, uninstallRealCatalogue, barrier } from "./helpers.ts";
import { setMatcherGateForTests, setMatcherEnteredForTests, resetPlanCreateInflightForTests, runAdmittedPlanOperation } from "../../lib/agentic/plan/service.ts";
import { advanceServiceClock, useLiveServiceClock } from "../../lib/agentic/qa/service-clock.ts";
import { requestAbortSignal } from "../../lib/agentic/qa/request-trace.ts";
import type { PlanResult } from "../../lib/agentic/plan/types.ts";

afterEach(context => { if (context.name.startsWith("AXR-")) { setMatcherGateForTests(null); setMatcherEnteredForTests(null); resetPlanCreateInflightForTests(); uninstallRealCatalogue(); } });

test("AXR-REL-02 a held real matcher hands off at its existing return budget without publishing a basket", { timeout: 30000 }, async () => {
  await installRealCatalogue();
  const instance = runtime("handoff"), held = barrier(), entered = barrier();
  setMatcherGateForTests(held.promise); setMatcherEnteredForTests(entered.release);
  const pending = rpc(instance, "plan", { operation: "create", idempotencyKey: "ax-refinement-held-a2", request: profile("A2") });
  const response = await pending;
  assert.equal(response.status, "processing");
  const admitted = await instance.store.getPlanOperationByKey("dev:mattanutra:ax-refinement:handoff", "ax-refinement-held-a2");
  assert.ok(admitted); assert.equal(admitted.status, "queued");
  // The controlled latch belongs to the durable operation, not the finished HTTP attempt.
  requestAbortSignal(`plan-operation:${admitted.id}`);
  const executing = runAdmittedPlanOperation({ store: instance.store, config: instance.config, operationId: admitted.id });
  try {
    await entered.promise;
    advanceServiceClock(3000);
    await nextTurn(); await nextTurn();
    assert.equal(response.ok, true);
    assert.equal(response.operationalDecision.nextAction, "poll_plan");
    assert.ok(response.planHandle && response.pollAfterSeconds > 0);
    assert.equal(response.basket, undefined);
    const observed = await rpc(instance, "plan", { operation: "get", planHandle: response.planHandle, responseView: "status" });
    assert.equal(observed.status, "processing");
    assert.equal((await instance.store.getPlanOperation(admitted.id))?.status, "running");
  } finally {
    held.release();
    const finished = await executing;
    assert.equal(finished.ok, true, JSON.stringify(finished));
    assert.notEqual(finished.status, "processing");
    assert.equal((await instance.store.getPlanOperation(admitted.id))?.status, "complete");
  }
});

test("AXR-REL-01 reconstructed A2 expanded exclusions preserve effort, context and one revision per operation", async t => {
  process.env.AX_REFINEMENT_REAL_WORKERS = "1";
  await installRealCatalogue();
  useLiveServiceClock();
  const instance = runtime("a2-expanded");
  const completed = (args: Record<string, unknown>) => rpcWithTaskExecutor(instance, "plan", { responseView: "full", ...args });
  const original = profile("A2");
  let result!: Awaited<ReturnType<typeof rpc>>;
  await t.test("create within the existing client deadline", { timeout: 90000 }, async () => {
    result = await completed({ operation: "create", idempotencyKey: "ax-refinement-a2-create", request: original });
  });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.revision, 1);
  const targets = original.targets.map(row => row.name === "Algae Omega-3" ? { ...row, name: "Omega-3" } : row);
  const patches = [
    { requestPatch: { targets } },
    { requestPatch: {}, searchEffort: "expanded" },
    { requestPatch: { requirements: { excludeProductIds: ["prd_50265f478be551c496f907a01d746dab", "prd_65fd0d6245a04430aae754932a9c3f28"] } } }
  ];
  for (const [index, patch] of patches.entries()) {
    const args = { operation: "revise", idempotencyKey: `ax-refinement-a2-revise-${index}`, planHandle: result.planHandle, expectedRevision: result.revision, ...patch };
    await t.test(`revision ${index + 2} within the existing client deadline`, { timeout: 90000 }, async () => {
      result = await completed(args);
    });
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.revision, index + 2);
    assert.notEqual(result.status, "processing");
    assert.deepEqual(await rpc(instance, "plan", { responseView: "full", ...args }), result);
  }
  assert.equal(result.searchSummary.effort, "expanded");
  assert.equal(result.searchSummary.expansionBudget, 64000);
  assert.ok(result.searchSummary.expansionAttempts <= 64000);
  const planIds = await instance.store.listPlanIdsByPrincipal(instance.scope.principalScope!);
  assert.equal(planIds.length, 1);
  const saved = await instance.store.getPlanRevision(planIds[0], 4); assert.ok(saved);
  const savedRequest = (saved.result as PlanResult).requestSnapshot.originalRequest; assert.ok(savedRequest);
  assert.equal(savedRequest.requirements.omega3SourcePreference, "algae_only");
  assert.equal(savedRequest.requirements.dietaryPreference, "vegan");
  assert.deepEqual(savedRequest.targets, targets);
  const excluded = new Set(patches[2].requestPatch.requirements.excludeProductIds);
  for (const option of result.options) for (const item of option.basket) assert.equal(excluded.has(item.productId), false);
});
