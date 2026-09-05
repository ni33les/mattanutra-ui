import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { V15_TEST_IDS } from "./agentic/v15/manifest.ts";

describe("v1.5 joined non-latency gate", () => {
  it("JOIN-NL-01 pack manifest lists every clock, event, counter and join id", () => {
    assert.equal(V15_TEST_IDS.includes("CLOCK-RED-01"), true);
    assert.equal(V15_TEST_IDS.includes("EVENT-RED-01"), true);
    assert.equal(V15_TEST_IDS.includes("COUNT-RED-01"), true);
    assert.equal(V15_TEST_IDS.includes("JOIN-NL-09"), true);
    assert.equal(V15_TEST_IDS.length, 8 + 8 + 10 + 9);
  });
});
