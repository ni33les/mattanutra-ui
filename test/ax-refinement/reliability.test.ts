import { publicProfile } from "./helpers.ts";
import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { runtime, rpc, installRealCatalogue, uninstallRealCatalogue, barrier } from "./helpers.ts";
import { setMatcherGateForTests, setMatcherEnteredForTests, resetPlanCreateInflightForTests, runAdmittedPlanOperation } from "../../lib/agentic/plan/service.ts";
import { advanceServiceClock, useLiveServiceClock } from "../../lib/agentic/qa/service-clock.ts";
import { requestAbortSignal } from "../../lib/agentic/qa/request-trace.ts";
import type { PlanResult } from "../../lib/agentic/plan/types.ts";

afterEach(context => { if (context.name.startsWith("AXR-")) { setMatcherGateForTests(null); setMatcherEnteredForTests(null); resetPlanCreateInflightForTests(); uninstallRealCatalogue(); } });

test("AXR-REL-02 a held real matcher hands off at its existing return budget without publishing a basket", { timeout: 30000 }, async () => {
  await installRealCatalogue();
  const instance = runtime("handoff"), held = barrier(), entered = barrier();
  setMatcherGateForTests(held.promise); setMatcherEnteredForTests(entered.release);
  const pending = rpc(instance, "plan", { idempotencyKey: "ax-refinement-held-a2", ...publicProfile("A2") });
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
    assert.equal(response.nextAction, "poll_plan");
    assert.ok(response.planHandle && response.pollAfterSeconds > 0);
    assert.equal(response.basket, undefined);
    const observed = await rpc(instance, "plan", { planHandle: response.planHandle });
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
  const completed = async (args: Record<string, unknown>) => {
    const started = performance.now();
    const admitted = await rpc(instance, "plan", args);
    assert.ok(performance.now() - started < 90000, "Admission must meet the existing HTTP client deadline");
    if (admitted.status === "processing") {
      const operation = await instance.store.getPlanOperationByKey("dev:mattanutra:ax-refinement:a2-expanded", String(args.idempotencyKey));
      assert.ok(operation, "The admitted request must already have a durable execution owner");
      const finished = await runAdmittedPlanOperation({ store: instance.store, config: instance.config, operationId: operation.id });
      assert.equal(finished.ok, true, JSON.stringify(finished));
    }
    const pollStarted = performance.now();
    const result = await rpc(instance, "plan", { planHandle: admitted.planHandle });
    assert.ok(performance.now() - pollStarted < 90000, "Read must meet the existing HTTP client deadline");
    assert.ok(performance.now() - started < 175000, "Durable matching must meet its unchanged overall deadline");
    assert.notEqual(result.status, "processing"); assert.notEqual(result.status, "failed");
    return result;
  };
  const original = publicProfile("A2");
  let result!: Awaited<ReturnType<typeof rpc>>;
  await t.test("create meets separate HTTP and durable operation deadlines", { timeout: 185000 }, async () => {
    result = await completed({ idempotencyKey: "ax-refinement-a2-create", ...original });
  });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.revision, 1);
  const originalIngredient = (result.choices as Array<{ingredients: {ingredientId:string; name:string}[]}>)[0].ingredients.find(row => row.name === "Algae Omega-3");
  assert.ok(originalIngredient, "Preserve the original source-specific target before refining it");
  // Current protocol preserves target wording; refine a weight instead of renaming a saved identity.
  const patches = [
    { scoring: { weights: { pills: 0.5 } } },
    { scoring: {}, searchEffort: "expanded" },
    { requirements: { excludeProductIds: ["prd_50265f478be551c496f907a01d746dab", "prd_65fd0d6245a04430aae754932a9c3f28"] } }
  ];
  for (const [index, patch] of patches.entries()) {
    const args = { idempotencyKey: `ax-refinement-a2-revise-${index}`, planHandle: result.planHandle, expectedRevision: result.revision, ...patch };
    await t.test(`revision ${index + 2} meets separate HTTP and durable operation deadlines`, { timeout: 185000 }, async () => {
      result = await completed(args);
    });
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.revision, index + 2);
    assert.notEqual(result.status, "processing");
    assert.deepEqual(await rpc(instance, "plan", args), result);
  }
  const planIds = await instance.store.listPlanIdsByPrincipal(instance.scope.principalScope!);
  assert.equal(planIds.length, 1);
  const saved = await instance.store.getPlanRevision(planIds[0], 4); assert.ok(saved);
  assert.equal(saved.result.searchSummary?.effort, "expanded");
  assert.equal(saved.result.searchSummary?.expansionBudget, 64000);
  assert.ok(saved.result.searchSummary!.expansionAttempts <= 64000);
  const savedRequest = (saved.result as PlanResult).requestSnapshot.originalRequest; assert.ok(savedRequest);
  assert.equal(savedRequest.requirements.omega3SourcePreference, "algae_only");
  assert.equal(savedRequest.requirements.dietaryPreference, "vegan");
  assert.deepEqual(savedRequest.targets.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !["ingredientId", "supplementId"].includes(key)))), original.targets);
  const excluded = new Set(patches[2].requirements!.excludeProductIds);
  for (const option of [saved.result.selected, ...(saved.result.alternatives ?? [])].filter(Boolean)) for (const item of option!.basket) assert.equal(excluded.has(item.productId), false);
});
