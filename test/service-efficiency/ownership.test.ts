import assert from "node:assert/strict";
import { test } from "node:test";
import { installRealCatalogue, uninstallRealCatalogue, runtime, rpc, profile } from "../ax-refinement/helpers.ts";
import { setMatcherGateForTests, resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { cancelPlanOperation } from "../../lib/agentic/plan/operations.ts";

test("EFF-OWNER-01 HTTP admission leaves matching ownership to the durable task executor", async () => {
  await installRealCatalogue("dev");
  let release!: () => void; setMatcherGateForTests(new Promise<void>(resolve => { release = resolve; }));
  const app = runtime("eff-owned"), key = "eff-owned-create";
  try {
    const result = await rpc(app, "plan", { operation: "create", idempotencyKey: key, request: profile("A6") });
    assert.equal(result.ok, true);
    const operation = await app.store.getPlanOperationByKey("dev:mattanutra:ax-refinement:eff-owned", key); assert.ok(operation);
    try { assert.equal(operation.status, "queued"); assert.equal(operation.leaseToken, null); }
    finally { await cancelPlanOperation(app.store, operation.id, new Date().toISOString()); }
  } finally { release(); setMatcherGateForTests(null); resetPlanCreateInflightForTests(); uninstallRealCatalogue(); }
});
