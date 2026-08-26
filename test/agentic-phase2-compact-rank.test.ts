import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../lib/matcher/index.ts";
import { QA_GOLD_CATALOG, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

describe("Phase 2 compactness ranking", () => {
  it("does not stuff extra SKUs onto standalone D3 when a covering SKU exists", () => {
    const result = match(
      qaRequest({
        optimization: "balanced",
        targets: [qaTarget("d3", 2000)]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productCount <= 2, true);
    assert.equal(result.selected.productIds.includes("G-D3-2000"), true);
  });

  it("does not stuff extra SKUs onto standalone vitamin C", () => {
    const result = match(
      qaRequest({
        optimization: "balanced",
        targets: [qaTarget("c", 500)]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productCount <= 2, true);
    assert.equal(result.selected.productIds.includes("G-C-500"), true);
  });

  it("M-01 remains combo plus fish oil at 4 pills", () => {
    const result = match(qaRequest({ optimization: "fewest_pills" }), QA_GOLD_CATALOG);
    assert.deepEqual(result.selected?.productIds, ["G-BASE-COMBO", "G-O3-FISH-1000"]);
    assert.equal(result.selected?.dailyPills, 4);
  });
});
