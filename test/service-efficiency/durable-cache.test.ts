import assert from "node:assert/strict";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { installCatalogue, goldens } from "../mcp-7-2-3/helpers.ts";
import { runtime, rpc, uninstallRealCatalogue } from "../ax-refinement/helpers.ts";
import { runAdmittedPlanOperation } from "../../lib/agentic/plan/service.ts";

test("EFF-CACHE-07 real durable owners share matching and reuse completed facts without sharing capabilities", { timeout: 30_000 }, async () => {
  await installCatalogue(); const previous = process.env.AX_REFINEMENT_REAL_WORKERS; process.env.AX_REFINEMENT_REAL_WORKERS = "1";
  const original = Worker.prototype.postMessage; let starts = 0;
  Worker.prototype.postMessage = function(message, ...args) { if (message?.kind === "session-start") starts++; return original.call(this, message, ...args); };
  try {
    const apps = [runtime("cache-owner-one"), runtime("cache-owner-two"), runtime("cache-owner-three")];
    const admitted = await Promise.all(apps.map((app, index) => rpc(app, "plan", { operation: "create", idempotencyKey: `efficiency-owner-${index}`, request: goldens.d3 })));
    for (const response of admitted) assert.equal(response.status, "processing", JSON.stringify(response));
    const run = async (index: number) => {
      const app = apps[index], op = await app.store.getPlanOperationByKey(`dev:mattanutra:${app.scope.principalScope}`, `efficiency-owner-${index}`); assert.ok(op);
      const result = await runAdmittedPlanOperation({ config: app.config, store: app.store, operationId: op.id });
      assert.equal(result.ok, true); assert.equal((await app.store.getPlanOperation(op.id))?.status, "complete"); return result;
    };
    const [one, two] = await Promise.all([run(0), run(1)]);
    assert.equal(starts, 1); assert.notEqual(admitted[0].planHandle, admitted[1].planHandle);
    assert.ok(one.ok && two.ok); assert.deepEqual(one.basket, two.basket); assert.deepEqual(one.coverage, two.coverage);
    const three = await run(2); assert.equal(starts, 1); assert.ok(three.ok); assert.deepEqual(three.basket, one.basket);
    const denied = await rpc(apps[2], "plan", { operation: "get", planHandle: admitted[0].planHandle, responseView: "status" }); assert.equal(denied.ok, false);
  } finally { Worker.prototype.postMessage = original; if (previous === undefined) delete process.env.AX_REFINEMENT_REAL_WORKERS; else process.env.AX_REFINEMENT_REAL_WORKERS = previous; uninstallRealCatalogue(); }
});
