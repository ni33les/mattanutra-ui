import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { installRealCatalogue, uninstallRealCatalogue, runtime, rpc, profile } from "../ax-refinement/helpers.ts";
import { resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { admitPlanOperation, claimPlanOperation, cancelPlanOperation } from "../../lib/agentic/plan/operations.ts";

afterEach(() => { resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });
test("PAY-HANDOFF-01 concise refinement replay and get preserve a held pending revision without a false not-found error", async () => {
  await installRealCatalogue("dev");
  const app = runtime("held-refinement"), ownerScope = "dev:mattanutra:ax-refinement:held-refinement";
  const initial = await rpc(app, "plan", { operation: "create", idempotencyKey: "held-refinement-create", request: profile("A6"), responseView: "full" });
  assert.equal(initial.status, "ready");
  const created = await app.store.getPlanOperationByKey(ownerScope, "held-refinement-create"); assert.ok(created);
  const before = await app.store.getPlanRevision(created.planId, 1); assert.ok(before);
  const payload = { operation: "revise", planHandle: initial.planHandle, expectedRevision: 1, idempotencyKey: "held-refinement-revise", requestPatch: {} };
  const operation = await admitPlanOperation(app.store, { planId: created.planId, ownerScope, key: payload.idempotencyKey,
    payload, expectedRevision: 1, revision: 2, prepared: { ...created.command.prepared, revision: 2, existingPlan: await app.store.getPlan(created.planId), previous: before.result }, scope: app.scope, now: app.now! });
  // An independently held worker lease reproduces the real handoff, without
  // relying on catalogue size or CPU speed to make a request take three seconds.
  const claim = await claimPlanOperation(app.store, operation.id, "held-worker", "2099-01-01T00:00:00Z"); assert.ok(claim);
  for (const args of [payload, { operation: "get", planHandle: initial.planHandle }]) {
    const pending = await rpc(app, "plan", { ...args, responseView: "conversation" });
    assert.equal(pending.ok, true, JSON.stringify(pending));
    assert.equal(pending.status, "processing"); assert.equal(pending.planHandle, initial.planHandle);
    assert.equal(pending.revision, 2); assert.ok(pending.resultVersion); assert.ok(pending.nextActions.includes("poll_plan"));
    const status = await rpc(app, "plan", { operation: "get", planHandle: initial.planHandle, responseView: "status", knownResultVersion: pending.resultVersion });
    assert.equal(status.unchanged, true); assert.equal(status.revision, 1); assert.equal(status.pendingRevision, 2);
    assert.deepEqual(await app.store.getPlanRevision(created.planId, 1), before);
    assert.equal(await app.store.getPlanRevision(created.planId, 2), null);
    assert.equal((await app.store.getActivePlanOperation(created.planId))?.id, operation.id);
  }
  assert.equal(await cancelPlanOperation(app.store, operation.id, app.now!), true);
});
