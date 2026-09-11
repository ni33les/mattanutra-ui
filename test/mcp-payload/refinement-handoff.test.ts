import { publicProfile } from "../ax-refinement/helpers.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { installRealCatalogue, uninstallRealCatalogue, runtime, rpc, rpcWithTaskExecutor } from "../ax-refinement/helpers.ts";
import { resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { admitPlanOperation, claimPlanOperation, cancelPlanOperation } from "../../lib/agentic/plan/operations.ts";

afterEach(() => { resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });
test("PAY-HANDOFF-01 concise refinement replay and get preserve a held pending revision without a false not-found error", async () => {
  await installRealCatalogue("dev");
  const app = runtime("held-refinement"), ownerScope = "dev:mattanutra:ax-refinement:held-refinement";
  const initial = await rpcWithTaskExecutor(app, "plan", { idempotencyKey: "held-refinement-create", ...publicProfile("A6") });
  assert.equal(initial.status, "ready");
  const created = await app.store.getPlanOperationByKey(ownerScope, "held-refinement-create"); assert.ok(created);
  const before = await app.store.getPlanRevision(created.planId, 1); assert.ok(before);
  const payload = { planHandle: initial.planHandle, expectedRevision: 1, idempotencyKey: "held-refinement-revise", scoring: {} };
  const executionNow = new Date().toISOString();
  const operation = await admitPlanOperation(app.store, { planId: created.planId, ownerScope, key: payload.idempotencyKey,
    payload, expectedRevision: 1, revision: 2, prepared: { ...created.command.prepared, revision: 2, existingPlan: await app.store.getPlan(created.planId), previous: before.result }, scope: app.scope, now: app.now!, admittedAt: executionNow });
  // An independently held worker lease reproduces the real handoff, without
  // relying on catalogue size or CPU speed to make a request take three seconds.
  const claim = await claimPlanOperation(app.store, operation.id, "held-worker", executionNow); assert.ok(claim);
  for (const args of [payload, { planHandle: initial.planHandle }]) {
    const pending = await rpc(app, "plan", args);
    assert.equal(pending.ok, true, JSON.stringify(pending));
    assert.equal(pending.status, "processing"); assert.equal(pending.planHandle, initial.planHandle);
    assert.equal(pending.revision, "idempotencyKey" in args ? 2 : 1); assert.equal(pending.nextAction, "poll_plan");
    const status = await rpc(app, "plan", { planHandle: initial.planHandle });
    assert.equal(status.status, "processing"); assert.equal(status.revision, 1);
    assert.equal((await app.store.getPlan(created.planId))?.currentRevision, 1);
    assert.deepEqual(await app.store.getPlanRevision(created.planId, 1), before);
    assert.equal(await app.store.getPlanRevision(created.planId, 2), null);
    assert.equal((await app.store.getActivePlanOperation(created.planId))?.id, operation.id);
  }
  assert.equal(await cancelPlanOperation(app.store, operation.id, app.now!), true);
});
