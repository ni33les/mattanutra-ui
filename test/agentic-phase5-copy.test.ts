import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { AGENTIC_TOOL_DESCRIPTIONS } from "../lib/agentic/contract/index.ts";

describe("Phase 5 discovery copy", () => {
  it("generates plan-tool recognised names from the same fixture list info uses", () => {
    const description = AGENTIC_TOOL_DESCRIPTIONS.plan;
    assert.match(description, /Vitamin K2/);
    assert.doesNotMatch(description, /K2 unrecognized/i);
    assert.doesNotMatch(description, /unrecognised.{0,40}Vitamin K2/i);
    assert.doesNotMatch(description, /welness/i);
    assert.match(
      description,
      /processing plan is polled with the same idempotencyKey and planHandle/i
    );
    for (const item of FIXTURE_SUPPLEMENTS) {
      assert.match(
        description,
        new RegExp(item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      );
    }
  });
});
