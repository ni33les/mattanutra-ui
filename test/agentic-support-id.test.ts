import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUuid, supportMessageId } from "../lib/agentic/contract/ids.ts";

describe("support message identity", () => {
  it("COM-SUPPORT-ID message ids are deterministic postgres UUIDs", () => {
    const caseId = "11111111-1111-4111-8111-111111111111";
    const first = supportMessageId(caseId, 1);
    const replay = supportMessageId(caseId, 1);
    const second = supportMessageId(caseId, 2);
    assert.equal(isUuid(first), true, first);
    assert.equal(first.startsWith("msg_"), false, first);
    assert.equal(first, replay);
    assert.notEqual(first, second);
    assert.equal(isUuid(second), true, second);
  });
});
