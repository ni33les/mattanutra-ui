import assert from "node:assert/strict";
import { test } from "node:test";
import { requestSetupRecovery } from "../../lib/agentic/mcp/dependency-error.ts";
test("dependency recovery preserves poll identity and does not hide programming faults", () => {
  const call = { method: "tools/call", params: { name: "plan", arguments: { operation: "get", planHandle: "same-plan" } } };
  for (const code of ["57014", "ECONNRESET", "53300"]) {
    const result = requestSetupRecovery({ code }, call, "correlation"); assert.ok(result);
    assert.equal(result.error.retryable, true); assert.deepEqual(result.error.nextActions, ["poll_plan"]);
  }
  assert.equal(requestSetupRecovery(new TypeError("defect"), call, "correlation"), null);
  assert.equal(requestSetupRecovery({ code: "23505" }, call, "correlation"), null);
  const mutation = requestSetupRecovery({ code: "57014" }, { ...call, params: { name: "plan", arguments: { operation: "revise" } } }, "correlation");
  assert.ok(mutation); assert.match(mutation.error.message, /original idempotency key/);
  assert.deepEqual(mutation.error.nextActions, ["retry_same_request"]);
});
