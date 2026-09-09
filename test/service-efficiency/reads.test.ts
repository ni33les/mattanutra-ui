import assert from "node:assert/strict";
import { test } from "node:test";
import { internalFixture, storedFixture } from "../mcp-conversation-pack/helpers.ts";
import { readPlanStatus, readPlanPresentation } from "../../lib/agentic/presentation/plan-read.ts";
import { admitPlanOperation } from "../../lib/agentic/plan/operations.ts";
import { planTool } from "../../lib/agentic/plan/service.ts";
import { rpc } from "../ax-refinement/helpers.ts";

test("EFF-READ-01 unchanged status reads use projections without full results or transactions", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  const first = await readPlanStatus(app, handle); assert.equal(first.ok, true);
  assert.ok("resultVersion" in first);
  app.store.getPlanRevision = async () => { throw new Error("Full revision fetched by status"); };
  app.store.getCatalogueSnapshot = async () => { throw new Error("Catalogue fetched by status"); };
  app.store.getActivePlanOperation = async () => { throw new Error("Full command fetched by status"); };
  app.store.transaction = async () => { throw new Error("Read used a mutation transaction"); };
  const unchanged = await readPlanStatus(app, handle, first.resultVersion);
  assert.ok(unchanged.ok && "unchanged" in unchanged && unchanged.unchanged);
  assert.ok(Buffer.byteLength(JSON.stringify(unchanged)) < 2000);
});

test("LOCK-READ-05 default get performs no mutation transaction or maintenance write", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  app.store.transaction = async () => { throw new Error("Ordinary GET opened a mutation transaction"); };
  const result = await planTool({ ...app, now: app.now!, payload: { operation: "get", planHandle: handle } });
  assert.ok(result.ok); assert.equal(result.status, "ready");
});

test("LOCK-READ-06 an expired default get presents expiry without persisting it", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  const operation = await admitPlanOperation(app.store, { planId: "conversation-pack-plan", ownerScope: "lock-read",
    key: "expired-default-get", payload: {}, prepared: {}, scope: app.scope, expectedRevision: 1, revision: 2,
    now: "2020-01-01T00:00:00Z" });
  const before = await app.store.getPlanOperation(operation.id);
  app.store.transaction = async () => { throw new Error("GET attempted expiry write"); };
  const result = await planTool({ ...app, now: app.now!, payload: { operation: "get", planHandle: handle } });
  assert.equal(result.ok, false);
  assert.deepEqual(await app.store.getPlanOperation(operation.id), before);
});

test("LOCK-READ-07 stale catalogue projections consistently require refresh across all views", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  const read = app.store.getPlanReadState.bind(app.store);
  app.store.getPlanReadState = async (...args) => {
    const state = await read(...args); assert.ok(state?.projection);
    return { ...state, catalogueRevision: 12, projection: { ...state.projection, catalogueRevision: 11 } };
  };
  for (const view of ["status", "conversation", "full", "details"] as const) {
    const result = await rpc(app, "plan", { operation: "get", planHandle: handle, responseView: view,
      ...(view === "details" ? { expectedRevision: 1, sections: ["advice"] } : {}) });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.status, "needs_input", view);
    // 7.2.4 details exposes status, but has no action/refresh fields. Preserve its schema.
    if (view !== "details") {
      assert.equal(result.refreshRequired, true, view);
      assert.equal((result.nextActions as string[])[0], "change_request", view);
    }
    if (result.operationalDecision) assert.equal((result.operationalDecision as {purchaseEligible: boolean}).purchaseEligible, false);
  }
});

test("EFF-READ-02 expired processing is presented truthfully without mutating the operation", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  const operation = await admitPlanOperation(app.store, { planId: "conversation-pack-plan", ownerScope: "efficiency",
    key: "expired-read", payload: {}, prepared: {}, scope: app.scope, expectedRevision: 1, revision: 2,
    now: "2020-01-01T00:00:00Z" });
  const before = await app.store.getPlanOperation(operation.id);
  const result = await readPlanStatus(app, handle);
  assert.ok(result.ok && "operationStatus" in result);
  assert.equal(result.operationStatus, "failed");
  assert.equal(result.nextActions[0], "refresh_plan");
  assert.deepEqual(await app.store.getPlanOperation(operation.id), before, "GET must not expire or rewrite durable work");
});

test("EFF-READ-03 conversation presentation never acquires a publication or order write lock", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  app.store.getActiveOrderForPlanRevision = async () => { throw new Error("Order write lock requested"); };
  app.store.isCatalogueRevisionCurrent = async () => { throw new Error("Publication lock requested"); };
  app.store.transaction = async () => { throw new Error("Read transaction requested"); };
  const result = await readPlanPresentation(app, handle);
  assert.ok(!("ok" in result) && result.result.selected?.basket.length);
});
