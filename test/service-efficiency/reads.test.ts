import assert from "node:assert/strict";
import { test } from "node:test";
import { internalFixture, storedFixture } from "../mcp-conversation-pack/helpers.ts";
import { readPlanState, readPlanPresentation } from "../../lib/agentic/presentation/plan-read.ts";
import { admitPlanOperation } from "../../lib/agentic/plan/operations.ts";
import { simplePlanTool } from "../../lib/agentic/plan/simple-service.ts";
import { rpc } from "../ax-refinement/helpers.ts";

test("EFF-READ-01 unchanged status reads use projections without full results or transactions", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  const first = await readPlanState(app, handle); assert.ok(!("ok" in first));
  assert.ok("resultVersion" in first);
  app.store.getPlanRevision = async () => { throw new Error("Full revision fetched by status"); };
  app.store.getCatalogueSnapshot = async () => { throw new Error("Catalogue fetched by status"); };
  app.store.getActivePlanOperation = async () => { throw new Error("Full command fetched by status"); };
  app.store.transaction = async () => { throw new Error("Read used a mutation transaction"); };
  const unchanged = await readPlanState(app, handle);
  assert.ok("resultVersion" in unchanged); assert.equal(unchanged.resultVersion, first.resultVersion);
  assert.equal(unchanged.result, null); assert.equal(unchanged.operation, null);
});

test("LOCK-READ-05 default get performs no mutation transaction or maintenance write", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  app.store.transaction = async () => { throw new Error("Ordinary GET opened a mutation transaction"); };
  const result = await simplePlanTool(app, { planHandle: handle });
  assert.ok(result.ok); assert.equal(result.status, "ready");
});

test("LOCK-READ-06 an expired default get presents expiry without persisting it", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  const operation = await admitPlanOperation(app.store, { planId: "conversation-pack-plan", ownerScope: "lock-read",
    key: "expired-default-get", payload: {}, prepared: {}, scope: app.scope, expectedRevision: 1, revision: 2,
    now: "2020-01-01T00:00:00Z" });
  const before = await app.store.getPlanOperation(operation.id);
  app.store.transaction = async () => { throw new Error("GET attempted expiry write"); };
  const result = await simplePlanTool(app, { planHandle: handle });
  assert.ok(result.ok); assert.equal(result.status, "failed");
  assert.deepEqual(await app.store.getPlanOperation(operation.id), before);
});

test("LOCK-READ-07 stale catalogue projections require refresh in the unified decision", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  const read = app.store.getPlanReadState.bind(app.store);
  app.store.getPlanReadState = async (...args) => {
    const state = await read(...args); assert.ok(state?.projection);
    return { ...state, catalogueRevision: 12, projection: { ...state.projection, catalogueRevision: 11 } };
  };
  const result = await rpc(app, "plan", { planHandle: handle });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.status, "needs_input");
  assert.equal(result.refreshRequired, true); assert.equal(result.nextAction, "change_request");

});

test("EFF-READ-02 expired processing is presented truthfully without mutating the operation", async () => {
  const { app, handle } = await storedFixture(internalFixture());
  const operation = await admitPlanOperation(app.store, { planId: "conversation-pack-plan", ownerScope: "efficiency",
    key: "expired-read", payload: {}, prepared: {}, scope: app.scope, expectedRevision: 1, revision: 2,
    now: "2020-01-01T00:00:00Z" });
  const before = await app.store.getPlanOperation(operation.id);
  const result = await readPlanState(app, handle);
  assert.ok("operation" in result);
  assert.equal(result.operation?.status, "failed");
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
