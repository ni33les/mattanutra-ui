import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import * as references from "../../lib/matcher/safety-ceilings.ts";
import { installCatalogue, goldens } from "../mcp-7-2-3/helpers.ts";
import { runtime, rpc, uninstallRealCatalogue } from "../ax-refinement/helpers.ts";
import { runAdmittedPlanOperation } from "../../lib/agentic/plan/service.ts";
import { replaceCatalogueSnapshot } from "../../lib/agentic/catalogue/snapshot.ts";
import { resetCataloguePins } from "../../lib/agentic/catalogue/pin.ts";
import { matchPlan } from "../../lib/agentic/plan/matching.ts";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import type { AgenticStore } from "../../lib/agentic/store/types.ts";

afterEach(uninstallRealCatalogue);

test("LOCK-SNAPSHOT-02 concurrent reference scopes keep their immutable facts after a refresh", async () => {
  assert.equal(typeof references.runWithMatcherSafetySnapshot, "function");
  references.setMatcherSafetyCeilings([{ subjectId: "d3", name: "Vitamin D3", maxAmount: 100, maxUnit: "mcg" }], { runtimeRevision: 1, fingerprint: "a".repeat(64) });
  const old = references.captureMatcherSafetySnapshot(1);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = references.runWithMatcherSafetySnapshot(old, async () => {
    await gate;
    assert.equal(references.matcherSafetyCeilings()[0]?.maxAmount, 100);
    assert.equal(references.matcherSafetyReferenceIdentity()?.runtimeRevision, 1);
    assert.throws(() => { (references.matcherSafetyCeilings()[0] as { maxAmount: number }).maxAmount = 300; });
  });
  references.setMatcherSafetyCeilings([{ subjectId: "d3", name: "Vitamin D3", maxAmount: 50, maxUnit: "mcg" }], { runtimeRevision: 2, fingerprint: "b".repeat(64) });
  release(); await pending;
  assert.equal(references.matcherSafetyCeilings()[0]?.maxAmount, 50);
  assert.equal(references.captureMatcherSafetySnapshot(1).identity?.runtimeRevision, 1);
  assert.throws(() => references.captureMatcherSafetySnapshot(3), /reference.*snapshot/i);
});

test("LOCK-SNAPSHOT-03 interrupted durable matching restores its catalogue and references after both change", { timeout: 30_000 }, async () => {
  const frozen = await installCatalogue(), app = runtime("immutable-restart");
  const previous = process.env.AX_REFINEMENT_REAL_WORKERS; process.env.AX_REFINEMENT_REAL_WORKERS = "1";
  const normalized = await normalizePlanRequest({ config: app.config, snapshot: frozen.snapshot, request: goldens.d3 });
  assert.ok("state" in normalized);
  const expected = matchPlan({ snapshot: frozen.snapshot, state: normalized.state });
  const transaction = app.store.transaction.bind(app.store);
  let interrupt = true;
  const wrap = (store: AgenticStore): AgenticStore => ({ ...store,
    transaction: work => store.transaction(tx => work(wrap(tx))),
    updatePlanOperation: async (record, version) => {
      const checkpoint = record.checkpoint as { search?: { expansionAttempts: number }; reservedAttempts?: number } | null;
      if (interrupt && checkpoint?.search?.expansionAttempts === 4000 && checkpoint.reservedAttempts! > 0) {
        interrupt = false; throw new Error("Injected restart before second dispatch");
      }
      return store.updatePlanOperation(record, version);
    }
  });
  app.store.transaction = work => transaction(tx => work(wrap(tx)));
  try {
    const created = await rpc(app, "plan", { operation: "create", idempotencyKey: "immutable-restart-create", request: goldens.d3 });
    const op = await app.store.getPlanOperationByKey("dev:mattanutra:ax-refinement:immutable-restart", "immutable-restart-create"); assert.ok(op);
    const failed = await runAdmittedPlanOperation({ config: app.config, store: app.store, operationId: op.id });
    assert.equal(interrupt, false, "the real matcher must reach the interruption barrier");
    assert.equal(failed.ok, false);
    assert.equal((await app.store.getPlanOperation(op.id))?.status, "retryable");
    resetCataloguePins();
    replaceCatalogueSnapshot({ ...frozen.snapshot, runtimeRevision: frozen.snapshot.runtimeRevision! + 1, catalogueVersion: `${frozen.snapshot.catalogueVersion}-changed`, products: [] });
    references.resetMatcherSafetyCeilings();
    references.setMatcherSafetyCeilings([], { runtimeRevision: frozen.snapshot.runtimeRevision! + 1, fingerprint: "b".repeat(64) });
    const recovered = await runAdmittedPlanOperation({ config: app.config, store: app.store, operationId: op.id });
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    const saved = await app.store.getPlanRevision(op.planId, 1); assert.ok(saved);
    assert.deepEqual(saved.result.selected, expected.selected);
    const terminal = await app.store.getPlanOperation(op.id); assert.equal(terminal?.status, "complete");
    assert.equal(terminal?.referenceIdentity, String(frozen.provenance.reconstructedReferenceFingerprint));
    const read = app.store.getPlanReadState.bind(app.store);
    app.store.getPlanReadState = async (...args) => { const row = await read(...args); return row ? { ...row, catalogueRevision: frozen.snapshot.runtimeRevision! + 1 } : row; };
    const status = await rpc(app, "plan", { operation: "get", planHandle: created.planHandle, responseView: "status" });
    assert.equal(status.refreshRequired, true); assert.equal(status.status, "needs_input");
    for (const responseView of ["conversation", "full"] as const) {
      const replay = await rpc(app, "plan", { operation: "create", idempotencyKey: "immutable-restart-create", request: goldens.d3, responseView });
      assert.equal(replay.status, "needs_input", `same-key ${responseView} must not claim the stale receipt is checkout-ready`);
      assert.equal(replay.refreshRequired, true);
      assert.equal((replay.nextActions as string[])[0], "change_request");
    }
    assert.equal(((await app.store.getPlanOperation(op.id))?.response as {status?:string})?.status, "ready", "presentation must preserve the immutable receipt");
  } finally { if (previous === undefined) delete process.env.AX_REFINEMENT_REAL_WORKERS; else process.env.AX_REFINEMENT_REAL_WORKERS = previous; }
});
