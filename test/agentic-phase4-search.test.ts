import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../lib/matcher/index.ts";
import { QA_GOLD_CATALOG, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

describe("Phase 4 search does not exhaust on simple targets", () => {
  it("standalone D3 on gold is exact or untrimmed and compact", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [qaTarget("d3", 2000)]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.equal(result.trimmed, false);
    assert.equal(result.searchMode, "exact");
    assert.equal(result.selected.productCount <= 2, true);
  });

  it("standalone vitamin C retains its exact compact fit and reports bounded search honestly", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [qaTarget("c", 500)]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.deepEqual(result.selected.variantIds, ["seller_th:G-C-500:x1"]);
    assert.equal(result.selected.doseFit?.total, 0);
    assert.equal(result.selected.priceMinor, 10000);
    assert.equal(result.selected.dailyPills, 1);
    assert.equal(result.selected.productCount, 1);
    assert.ok(result.searchSummary!.expansionAttempts <= 8000);
    assert.equal(result.searchSummary?.complete, !result.trimmed && result.searchMode === "exact");
    assert.equal(result.searchSummary?.canExpand, !result.searchSummary?.complete);
  });
});
