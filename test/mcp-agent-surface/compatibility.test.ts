import assert from "node:assert/strict";
import { test } from "node:test";
import { planResponseView, CLIENT_CONTRACT_VERSION_HEADER } from "../../lib/agentic/contract/presentation-default.ts";

test("AG72-COMPAT-01 legacy omission retires after one release and cannot accept malformed or future pins", () => {
  for (const pin of ["4.0.0", "7.0.0", "7.1", "7.1.9"]) {
    assert.equal(planResponseView(undefined, pin, "7.2.0"), "full");
    assert.equal(planResponseView(undefined, pin, "7.3.0"), "conversation");
    assert.equal(planResponseView("full", pin, "7.3.0"), "full");
    assert.equal(planResponseView("conversation", pin, "7.2.0"), "conversation");
  }
  assert.equal(planResponseView(undefined), "conversation");
  for (const pin of ["", "banana", "7", "07.1.0", "7.2.1", "7.3.0", "8.0.0"]) {
    const result = planResponseView(undefined, pin, "7.2.0");
    assert.ok(typeof result !== "string", `Reject invalid/future pin ${pin}`);
    assert.equal(result.error.reasonCode, "invalid_request");
    assert.equal(result.error.fieldPath, CLIENT_CONTRACT_VERSION_HEADER);
  }
});
