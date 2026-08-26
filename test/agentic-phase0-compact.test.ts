import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileGroups } from "../lib/matcher/candidates.ts";
import { QA_GOLD_CATALOG, qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

function catalog(products: ReturnType<typeof qaProduct>[]) {
  return {
    availabilityAsOf: "2026-08-26T00:00:00.000Z",
    catalogueVersion: "phase0-compact",
    products
  };
}

describe("Phase 0 compact compile", () => {
  it("does not compile D3 carriers when a dedicated covering SKU exists", () => {
    const dedicated = qaProduct({
      facts: [{ amount: 2000, key: "d3" }],
      id: "G-D3-2000",
      priceThb: 160,
      title: "Vitamin D3 2000 IU"
    });
    const carriers = [
      qaProduct({
        facts: [
          { amount: 2000, key: "d3" },
          { amount: 500, key: "c" }
        ],
        id: "G-BETA-GLUCAN",
        priceThb: 80,
        title: "Beta Glucan"
      }),
      qaProduct({
        facts: [
          { amount: 2000, key: "d3" },
          { amount: 57, key: "b12" }
        ],
        id: "G-MULTI-50PLUS",
        priceThb: 50,
        title: "Multivitamins for 50+"
      })
    ];
    const groups = compileGroups(
      qaRequest({ targets: [qaTarget("d3", 2000)] }),
      catalog([carriers[0]!, carriers[1]!, dedicated])
    );
    const ids = groups.map((item) => item.productId);
    assert.equal(ids.includes("G-D3-2000"), true);
    assert.equal(ids.includes("G-BETA-GLUCAN"), false);
    assert.equal(ids.includes("G-MULTI-50PLUS"), false);
  });

  it("still compiles G-C-500 for standalone vitamin C", () => {
    const groups = compileGroups(
      qaRequest({ targets: [qaTarget("c", 500)] }),
      QA_GOLD_CATALOG
    );
    assert.equal(groups.some((item) => item.productId === "G-C-500"), true);
  });

  it("still compiles the official combo and fish oil", () => {
    const groups = compileGroups(qaRequest(), QA_GOLD_CATALOG);
    const ids = new Set(groups.map((item) => item.productId));
    assert.equal(ids.has("G-BASE-COMBO"), true);
    assert.equal(ids.has("G-O3-FISH-1000"), true);
  });
});
