import { publicProfile } from "./helpers.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { runtime, rpc, installRealCatalogue, uninstallRealCatalogue } from "./helpers.ts";
import { admitPlanOperation, claimPlanOperation, updateClaimedOperation } from "../../lib/agentic/plan/operations.ts";
import { runAdmittedPlanOperation, resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { businessError } from "../../lib/agentic/contract/errors.ts";

afterEach(() => { resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });

test("AXR-REL-03 polling reports failed refinement instead of returning the previous ready revision", async () => {
  await installRealCatalogue();
  const instance = runtime("failed-poll"), key = "ax-failed-poll-create";
  const initial = await rpc(instance, "plan", { idempotencyKey: key, ...publicProfile("A6") });
  const ownerScope = "dev:mattanutra:ax-refinement:failed-poll";
  const created = await instance.store.getPlanOperationByKey(ownerScope, key); assert.ok(created);
  const completed = await runAdmittedPlanOperation({ store: instance.store, config: instance.config, operationId: created.id });
  assert.equal(completed.ok, true); assert.equal(completed.revision, 1);
  const before = await instance.store.getPlanRevision(created.planId, 1); assert.ok(before);
  const payload = { planHandle: initial.planHandle, expectedRevision: 1, idempotencyKey: "ax-failed-poll-expand", scoring: {}, searchEffort: "expanded" };
  const failed = await admitPlanOperation(instance.store, { planId: created.planId, ownerScope, key: payload.idempotencyKey,
    payload, expectedRevision: 1, revision: 2, prepared: { ...created.command.prepared, revision: 2 }, scope: instance.scope, now: "2026-09-08T00:00:00Z" });
  const claim = await claimPlanOperation(instance.store, failed.id, "failed-worker", "2026-09-08T00:00:00Z"); assert.ok(claim);
  assert.equal(await updateClaimedOperation(instance.store, claim, { status: "failed", error: businessError({ reasonCode: "stale_revision", message: "Checkpoint input changed" }) }, "2026-09-08T00:00:01Z"), true);
  const polled = await rpc(instance, "plan", { planHandle: initial.planHandle });
  assert.equal(polled.ok, true);
  assert.equal(polled.status, "failed");
  assert.equal(polled.revision, 1);
  assert.equal(polled.nextAction, "change_request");
  assert.match(String(polled.summary), /scoring/);
  assert.equal((await instance.store.getPlanOperation(failed.id))?.error?.error.reasonCode, "stale_revision");
  const previous = await rpc(instance, "plan", { planHandle: initial.planHandle });
  assert.deepEqual(previous, polled);
  const replay = await rpc(instance, "plan", payload);
  assert.equal(replay.ok, false); assert.equal(replay.error.reasonCode, "stale_revision");
  assert.deepEqual(await instance.store.getPlanRevision(created.planId, 1), before);
  assert.equal((await instance.store.getPlan(created.planId))?.currentRevision, 1);
});
