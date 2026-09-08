import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { profile, runtime, rpc, installRealCatalogue, uninstallRealCatalogue, barrier } from "./helpers.ts";
import { setMatcherGateForTests, setMatcherEnteredForTests, resetPlanCreateInflightForTests, runAdmittedPlanOperation } from "../../lib/agentic/plan/service.ts";
import { advanceServiceClock } from "../../lib/agentic/qa/service-clock.ts";
import type { PlanResult } from "../../lib/agentic/plan/types.ts";

afterEach(() => { setMatcherGateForTests(null); setMatcherEnteredForTests(null); resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });

test("AXR-REL-02 a held real matcher hands off at its existing return budget without publishing a basket", { timeout: 30000 }, async () => {
  await installRealCatalogue();
  const instance = runtime("handoff"), held = barrier(), entered = barrier();
  setMatcherGateForTests(held.promise); setMatcherEnteredForTests(entered.release);
  let response: Record<string, any> | undefined;
  const pending = rpc(instance, "plan", { operation: "create", idempotencyKey: "ax-refinement-held-a2", request: profile("A2") }).then(value => { response = value; return value; });
  try {
    await Promise.race([entered.promise, pending.then(result => { throw new Error(`Returned before barrier: ${JSON.stringify(result)}`); })]);
    advanceServiceClock(3000);
    await nextTurn(); await nextTurn();
    assert.ok(response, "The 3-second handoff must return while matching remains held");
    assert.equal(response.status, "processing");
    assert.equal(response.ok, true);
    assert.equal(response.operationalDecision.nextAction, "poll_plan");
    assert.ok(response.planHandle && response.pollAfterSeconds > 0);
    assert.equal(response.basket, undefined);
  } finally {
    held.release(); await pending;
    const admitted = await instance.store.getPlanOperationByKey("dev:mattanutra:ax-refinement:handoff", "ax-refinement-held-a2");
    assert.ok(admitted);
    const finished = await runAdmittedPlanOperation({ store: instance.store, config: instance.config, operationId: admitted.id });
    assert.equal(finished.ok, true, JSON.stringify(finished));
    assert.notEqual(finished.status, "processing");
    assert.equal((await instance.store.getPlanOperation(admitted.id))?.status, "complete");
  }
});

test("AXR-REL-01 reconstructed A2 expanded exclusions preserve effort, context and one revision per operation", { timeout: 90000 }, async () => {
  process.env.AX_REFINEMENT_REAL_WORKERS = "1";
  await installRealCatalogue();
  const instance = runtime("a2-expanded");
  const original = profile("A2");
  let result = await rpc(instance, "plan", { operation: "create", idempotencyKey: "ax-refinement-a2-create", request: original });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.revision, 1);
  const targets = original.targets.map(row => row.name === "Algae Omega-3" ? { ...row, name: "Omega-3" } : row);
  const patches = [
    { requestPatch: { targets } },
    { requestPatch: {}, searchEffort: "expanded" },
    { requestPatch: { requirements: { excludeProductIds: ["prd_50265f478be551c496f907a01d746dab", "prd_65fd0d6245a04430aae754932a9c3f28"] } } }
  ];
  for (const [index, patch] of patches.entries()) {
    const args = { operation: "revise", idempotencyKey: `ax-refinement-a2-revise-${index}`, planHandle: result.planHandle, expectedRevision: result.revision, ...patch };
    result = await rpc(instance, "plan", args);
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.revision, index + 2);
    assert.notEqual(result.status, "processing");
    assert.deepEqual(await rpc(instance, "plan", args), result);
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
