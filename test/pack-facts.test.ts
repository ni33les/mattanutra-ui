import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  packCountFromFacts,
  parsePackCountFromText,
  servingLabelWithPackCount
} from "../lib/agentic/value/pack-facts.ts";

describe("pack count serving labels", () => {
  it("round-trips an optional servings-per-pack value", () => {
    assert.equal(parsePackCountFromText("90 servings per container"), 90);
    assert.equal(
      servingLabelWithPackCount("1 scoop", 90),
      "1 scoop; 90 servings per container"
    );
    assert.equal(servingLabelWithPackCount("1 scoop; 90 servings per container", null), "1 scoop");
    assert.equal(packCountFromFacts([{ servingLabel: "1 scoop" }]), null);
    assert.equal(
      packCountFromFacts([{ servingLabel: "1 scoop; 90 servings per container" }]),
      90
    );
  });
});
