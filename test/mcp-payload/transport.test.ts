import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { installRealCatalogue, uninstallRealCatalogue, runtime, rpc, profile } from "../ax-refinement/helpers.ts";
import { resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { AGENTIC_INPUT_SCHEMAS, validateToolIssues } from "../../lib/agentic/contract/index.ts";

afterEach(() => { resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });
test("PAY-TRANSPORT-01 create replay changes presentation without new work, get details recovers context and select confirms another option", async () => {
  await installRealCatalogue("dev");
  const app = runtime("payload-transport");
  const args = { operation: "create", idempotencyKey: "payload-create-replay-01", request: profile("A6") };
  const full = await rpc(app, "plan", args);
  assert.equal(full.ok, true); assert.equal(full.status, "ready");
  const compact = await rpc(app, "plan", { ...args, responseView: "conversation" });
  assert.equal(compact.ok, true); assert.equal(compact.responseView, "conversation");
  assert.equal(compact.planHandle, full.planHandle); assert.equal(compact.revision, full.revision);
  const current = await rpc(app, "plan", { operation: "get", planHandle: full.planHandle, responseView: "conversation" });
  assert.equal(current.selectedOptionId, compact.selectedOptionId);
  const details = await rpc(app, "plan", { operation: "get", planHandle: full.planHandle, responseView: "details", expectedRevision: full.revision, sections: ["request", "products", "advice"] });
  assert.equal(details.ok, true); assert.deepEqual(details.originalRequest, args.request);
  assert.ok(Array.isArray(details.options) && details.options.length > 1);
  const another = details.options[1];
  const selected = await rpc(app, "plan", { operation: "select", planHandle: full.planHandle, expectedRevision: full.revision, optionId: another.optionId, idempotencyKey: "payload-select-other-01", responseView: "conversation" });
  assert.equal(selected.ok, true); assert.equal(selected.selectedOptionId, another.optionId);
  const conflict = await rpc(app, "plan", { ...args, request: { ...args.request, optimization: "fewest_pills" }, responseView: "conversation" });
  assert.equal(conflict.ok, false); assert.equal(conflict.error.reasonCode, "idempotency_conflict");
});

test("PAY-TRANSPORT-02 operation/view matrix rejects unsupported fields and requires fenced batched details", () => {
  const handle = "cap_" + "x".repeat(40);
  const check = (input: unknown) => validateToolIssues(AGENTIC_INPUT_SCHEMAS.plan, input);
  for (const responseView of ["full", "conversation", "status"]) assert.deepEqual(check({ operation: "get", planHandle: handle, responseView }), []);
  assert.deepEqual(check({ operation: "get", planHandle: handle, responseView: "details", expectedRevision: 1, sections: ["coverage", "advice"] }), []);
  for (const input of [
    { operation: "get", planHandle: handle, responseView: "details" },
    { operation: "get", planHandle: handle, responseView: "status", sections: ["products"] },
    { operation: "create", idempotencyKey: "payload-invalid-view-01", request: profile("A6"), responseView: "status" },
    { operation: "get", planHandle: handle, responseView: "details", expectedRevision: 1, sections: ["private"] },
  ]) assert.ok(check(input).length > 0);
});
