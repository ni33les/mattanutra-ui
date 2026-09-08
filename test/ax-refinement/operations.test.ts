import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryStore } from "../../lib/agentic/store/memory.ts";
import { admitPlanOperation, claimPlanOperation, failPlanOperation, cancelPlanOperation, updateClaimedOperation } from "../../lib/agentic/plan/operations.ts";

const now = "2026-09-07T00:00:00Z";
async function fixture() {
  const store = createMemoryStore();
  await store.insertPlan({ id: "00000000-0000-4000-8000-000000000001", environment: "dev", tenantScope: "mattanutra", principalScope: "ax-operations", currentRevision: 3, createdAt: now, updatedAt: now });
  const command = { planId: "00000000-0000-4000-8000-000000000001", ownerScope: "dev:mattanutra:ax-operations", key: "ax-refinement-operation-01", payload: { operation: "revise", expectedRevision: 3, requestPatch: { requirements: { excludeProductIds: ["excluded-product"] } } }, expectedRevision: 3, revision: 4, prepared: { searchEffort: "expanded" }, scope: { environment: "dev" as const, tenantScope: "mattanutra", principalScope: "ax-operations" }, now };
  return { store, command };
}

test("AXR-REL-03 retryable failure preserves one admitted operation and its exact request", async () => {
  const { store, command } = await fixture();
  const first = await admitPlanOperation(store, command);
  const claim = await claimPlanOperation(store, first.id, "worker-1", now); assert.ok(claim);
  assert.equal(await failPlanOperation(store, claim, { reason: "dependency_unavailable" }, now), true);
  const retry = await admitPlanOperation(store, command);
  assert.equal(retry.id, first.id); assert.equal(retry.requestHash, first.requestHash);
  const resumed = await claimPlanOperation(store, first.id, "worker-2", now); assert.ok(resumed);
  assert.equal(resumed.command.prepared.searchEffort, "expanded");
  assert.equal((await store.getPlan(command.planId))?.currentRevision, 3);
  assert.equal(await updateClaimedOperation(store, claim, { status: "complete", response: { revision: 4 } }, now), false, "Old lease cannot publish");
});

test("AXR-REL-04 concurrent identical admissions and claims have a single owner", async () => {
  const { store, command } = await fixture();
  const [a, b] = await Promise.all([admitPlanOperation(store, command), admitPlanOperation(store, command)]);
  assert.equal(a.id, b.id); assert.equal(a.taskId, b.taskId);
  await assert.rejects(admitPlanOperation(store, { ...command, payload: { ...command.payload, expectedRevision: 2 } }), /idempotency_conflict/);
  const claims = await Promise.all([claimPlanOperation(store, a.id, "one", now), claimPlanOperation(store, a.id, "two", now)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const active = claims.find(Boolean)!;
  assert.equal(await cancelPlanOperation(store, a.id, now), true);
  assert.equal(await updateClaimedOperation(store, active, { status: "complete", response: { revision: 4 } }, now), false);
  assert.equal((await store.getPlanOperation(a.id))?.status, "cancelled");
});

test("AXR-REL-04 admission and queue insertion roll back together", async () => {
  const { store, command } = await fixture();
  const insert = store.insertPlanOperation;
  store.insertPlanOperation = async record => { await insert(record); throw new Error("queue insert interrupted"); };
  await assert.rejects(admitPlanOperation(store, command), /interrupted/);
  assert.equal(await store.getPlanOperationByKey(command.ownerScope, command.key), null);
});
