import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../lib/matcher/index.ts";
import { QA_GOLD_CATALOG, qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

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

  it("keeps dedicated C and fish oil in an official-shaped request when a 50+ multi exists", () => {
    const result = match(
      qaRequest({ optimization: "fewest_pills" }),
      {
        availabilityAsOf: "2026-08-26T00:00:00.000Z",
        catalogueVersion: "phase2-standalone-winners",
        products: [
          qaProduct({
            facts: [{ amount: 500, key: "c" }],
            id: "G-C-500",
            priceThb: 100,
            title: "Vitamin C 500"
          }),
          qaProduct({
            dietary: "fish",
            facts: [{ amount: 1000, key: "omega" }],
            form: "softgel",
            id: "G-O3-FISH-1000",
            omega: "fish",
            pills: 2,
            priceThb: 300,
            title: "G-O3-FISH-1000 Fish Oil"
          }),
          qaProduct({
            facts: [{ amount: 200, key: "mag" }],
            form: "capsule",
            id: "G-MAG-200",
            priceThb: 120,
            title: "Magnesium 200"
          }),
          qaProduct({
            facts: [{ amount: 2000, key: "d3" }],
            id: "G-D3-2000",
            priceThb: 160,
            title: "Vitamin D3 2000 IU"
          }),
          qaProduct({
            facts: [{ amount: 250, key: "b12" }],
            id: "G-B12-250",
            priceThb: 90,
            title: "Vitamin B12 250 mcg"
          }),
          qaProduct({
            facts: [
              { amount: 600, key: "d3" },
              { amount: 90, key: "c" },
              { amount: 210, key: "mag" },
              { amount: 5, key: "b12" }
            ],
            id: "G-MULTI-50PLUS",
            priceThb: 50,
            title: "Multivitamins for 50+"
          })
        ]
      }
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-C-500"), true);
    assert.equal(result.selected.productIds.includes("G-O3-FISH-1000"), true);
  });
});
