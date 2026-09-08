import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryStore } from "../../lib/agentic/store/memory.ts";
import { admitPlanOperation, claimPlanOperation, updateClaimedOperation } from "../../lib/agentic/plan/operations.ts";

test("expanded_deadline_survives_restart_and_fences_stale_completion", async () => {
  const store = createMemoryStore(); const now = "2026-09-08T10:00:00Z", later = "2026-09-08T10:03:00Z";
  const planId = "00000000-0000-4000-8000-000000000001";
  await store.insertPlan({ id: planId, environment: "dev", tenantScope: "mattanutra", principalScope: "deadline", currentRevision: 1, createdAt: now, updatedAt: now });
  const operation = await admitPlanOperation(store, { planId, ownerScope: "dev:mattanutra:deadline", key: "m722-deadline-operation", expectedRevision: 1, revision: 2,
    payload: { searchEffort: "expanded" }, prepared: {}, scope: { environment: "dev", tenantScope: "mattanutra", principalScope: "deadline" }, now });
  const claim = await claimPlanOperation(store, operation.id, "worker-before-restart", now); assert.ok(claim);
  assert.equal(await claimPlanOperation(store, operation.id, "worker-after-restart", later), null);
  const saved = await store.getPlanOperation(operation.id); assert.ok(saved);
  assert.equal(saved.status, "failed");
  assert.match(JSON.stringify(saved.error), /deadline|timed out/i);
  assert.equal((await store.getPlan(planId))!.currentRevision, 1);
  assert.equal(await updateClaimedOperation(store, claim, { status: "complete", response: { revision: 2 } }, later), false);
});
