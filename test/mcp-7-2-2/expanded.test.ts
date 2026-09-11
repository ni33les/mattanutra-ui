import { startMemoryTaskExecutor } from "../helpers/completed-mcp-client.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { installRealCatalogue, uninstallRealCatalogue, runtime, publicProfile, rpc } from "../ax-refinement/helpers.ts";
import { resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { useLiveServiceClock } from "../../lib/agentic/qa/service-clock.ts";

const app = runtime("m722-expanded");
let initial: Record<string, unknown>, concurrent: Record<string, unknown>, completed: Record<string, unknown>, elapsedMs: number, initialRevision: number;
let stopWorker: (() => Promise<void>) | undefined;
before(async () => {
  stopWorker = startMemoryTaskExecutor(app); process.env.AX_REFINEMENT_REAL_WORKERS = "1"; await installRealCatalogue("dev"); useLiveServiceClock(); });
after(async () => {
  await stopWorker?.(); resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });
const request = publicProfile("A2");
request.targets = request.targets.map(row => row.name === "Algae Omega-3" ? { ...row, name: "Omega-3" } : row);
request.requirements = { ...request.requirements, excludeProductIds: ["prd_50265f478be551c496f907a01d746dab"] };
test("test_expanded_single_job_reaches_terminal_state", { timeout: 185000 }, async () => {
  let base = await rpc(app, "plan", { idempotencyKey: "m722-expanded-base-01", ...request, requirements: { ...request.requirements, excludeProductIds: [] } });
  const baseStarted = performance.now();
  while (base.status === "processing" && performance.now() - baseStarted < 30000) {
    await delay(1000); base = await rpc(app, "plan", { planHandle: base.planHandle });
  }
  assert.equal(base.ok, true); assert.notEqual(base.status, "processing", "A committed standard revision is required");
  const start = performance.now();
  initial = await rpc(app, "plan", { planHandle: base.planHandle, expectedRevision: base.revision,
    idempotencyKey: "m722-expanded-revise-01", searchEffort: "expanded", requirements: { excludeProductIds: request.requirements.excludeProductIds } });
  initialRevision = Number(base.revision);
  assert.equal(initial.status, "processing", "Concurrent request requires active expanded work");
  concurrent = await rpc(app, "plan", { planHandle: initial.planHandle, expectedRevision: initial.revision, idempotencyKey: "m722-expanded-competing", searchEffort: "expanded", requirements: { excludeProductIds: [] } });
  completed = initial;
  while (completed.status === "processing" && performance.now() - start < 180000) {
    await delay(1000);
    completed = await rpc(app, "plan", { planHandle: initial.planHandle });
  }
  elapsedMs = performance.now() - start;
  assert.ok(elapsedMs <= 180000); assert.notEqual(completed.status, "processing");
  assert.equal(completed.ok, true, JSON.stringify(completed));
  const ids = await app.store.listPlanIdsByPrincipal(app.scope.principalScope!); assert.equal(ids.length, 1);
  const saved = await app.store.getPlanRevision(ids[0], Number(completed.revision)); assert.ok(saved);
  const search = saved.result.searchSummary!;
  assert.ok(search.expansionAttempts > 8000); assert.equal(search.expansionBudget, 64000);
});
test("test_second_expanded_while_processing_is_rejected_or_coalesced", async () => {
  assert.ok(initial && completed && concurrent, "Expanded fixture must have executed");
  assert.equal(concurrent.ok, false); assert.equal((concurrent.error as { reasonCode: string }).reasonCode, "stale_revision");
  const replay = await rpc(app, "plan", { planHandle: initial.planHandle, expectedRevision: initialRevision,
    idempotencyKey: "m722-expanded-revise-01", searchEffort: "expanded", requirements: { excludeProductIds: request.requirements.excludeProductIds } });
  assert.equal(replay.planHandle, initial.planHandle); assert.equal(replay.revision, completed.revision);
  assert.deepEqual(replay, completed);
});
test("test_expanded_does_not_relax_constraints", async () => {
  assert.ok(completed?.planHandle, "A real completed operation is required");
  const full = await rpc(app, "plan", { planHandle: completed.planHandle });
  assert.equal(full.ok, true); assert.equal((full.choices as unknown[]).length, 1);
  const options = full.choices as { products: { productId: string }[] }[];
  assert.ok(options.some(option => option.products.length));
  for (const option of options) for (const item of option.products) assert.ok(!request.requirements.excludeProductIds!.includes(item.productId));
  const ids = await app.store.listPlanIdsByPrincipal(app.scope.principalScope!); assert.equal(ids.length, 1);
  const revision = await app.store.getPlanRevision(ids[0], Number(completed.revision)); assert.ok(revision);
  const saved = (revision.result as { requestSnapshot: { originalRequest: typeof request } }).requestSnapshot.originalRequest;
  assert.equal(saved.requirements.dietaryPreference, "vegan"); assert.equal(saved.requirements.omega3SourcePreference, "algae_only");
  assert.deepEqual(saved.targets.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !["ingredientId", "supplementId"].includes(key)))), request.targets);
});
