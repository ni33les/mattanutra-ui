import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../lib/matcher/index.ts";
import { compareBaskets, selectOptions } from "../lib/matcher/selector.ts";
import {
  QA_GOLD_CATALOG,
  bruteForceMatch,
  pickCatalog,
  qaProduct,
  qaRequest,
  qaTarget
} from "../lib/matcher/qa/index.ts";
import { DEFAULT_MATCHER_CONFIG } from "../lib/matcher/config.ts";
import type { ScoredBasket } from "../lib/matcher/types.ts";

function catalog(products: ReturnType<typeof qaProduct>[]) {
  return {
    availabilityAsOf: "2026-08-25T00:00:00.000Z",
    catalogueVersion: "phase3-pills",
    products
  };
}

function emptySafety() {
  return { findings: [], hardBlocked: false, requiresAck: false };
}

function scored(
  overrides: Partial<ScoredBasket> & { productIds: readonly string[] }
): ScoredBasket {
  return {
    aggregateCoverage: 10_000,
    coverageBySubject: new Map(),
    coveredCount: 3,
    dailyPills: 4,
    exposure: { provenance: [], totals: new Map() },
    incidentalCount: 0,
    oversupplyScore: 0,
    priceMinor: 65000,
    productCount: overrides.productIds.length,
    reason: "",
    safety: emptySafety(),
    sellerId: "seller_th",
    variantIds: [],
    ...overrides
  };
}

describe("Phase 3 fewest_pills ranking", () => {
  it("M-01 still selects G-BASE-COMBO + G-O3-FISH-1000 at 4 pills", () => {
    const result = match(
      qaRequest({ optimization: "fewest_pills" }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.deepEqual(result.selected.productIds, [
      "G-BASE-COMBO",
      "G-O3-FISH-1000"
    ]);
    assert.equal(result.selected.dailyPills, 4);
  });

  it("among stacks covering the same targets, fewer pills beat more pills", () => {
    const dedicated = scored({
      productIds: ["G-D3-2000", "G-O3-FISH-1000", "G-MAG-200"],
      dailyPills: 4,
      productCount: 3,
      priceMinor: 65000
    });
    const pile = scored({
      productIds: ["A", "B", "C", "D"],
      dailyPills: 8,
      productCount: 4,
      priceMinor: 40000,
      incidentalCount: 6
    });
    assert.equal(
      compareBaskets(
        dedicated,
        pile,
        qaRequest({ optimization: "fewest_pills", targets: [] })
      ) < 0,
      true
    );
    const picked = selectOptions({
      baskets: [pile, dedicated],
      request: qaRequest({ optimization: "fewest_pills" })
    });
    assert.deepEqual(picked.selected?.productIds, dedicated.productIds);
  });

  it("picks dedicated D3+omega+mag singles over a higher-pill multi pile", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [
          qaTarget("d3", 2000),
          qaTarget("omega", 1000),
          qaTarget("mag", 200)
        ]
      }),
      catalog([
        qaProduct({
          facts: [{ amount: 2000, key: "d3" }],
          id: "G-D3-2000",
          pills: 1,
          priceThb: 160
        }),
        qaProduct({
          dietary: "fish",
          facts: [{ amount: 1000, key: "omega" }],
          form: "softgel",
          id: "G-O3-FISH-1000",
          omega: "fish",
          pills: 2,
          priceThb: 300
        }),
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 190
        }),
        qaProduct({
          facts: [
            { amount: 600, key: "d3" },
            { amount: 105, key: "mag" },
            { amount: 50, key: "c" }
          ],
          id: "G-MULTI-50PLUS",
          pills: 1,
          priceThb: 220
        })
      ])
    );
    assert.ok(result.selected);
    assert.equal(result.selected.dailyPills <= 4, true);
    assert.equal(result.selected.productIds.includes("G-D3-2000"), true);
    assert.equal(result.selected.productIds.includes("G-O3-FISH-1000"), true);
    assert.equal(result.selected.productIds.includes("G-MAG-200"), true);
  });

  it("oracle still agrees on fewest_pills for seed 20260825", () => {
    const gold = pickCatalog(QA_GOLD_CATALOG, 6, 20260825);
    const request = qaRequest({
      maxProductCount: 3,
      optimization: "fewest_pills",
      targets: [qaTarget("d3", 2000), qaTarget("c", 500), qaTarget("mag", 200)]
    });
    const config = {
      ...DEFAULT_MATCHER_CONFIG,
      exactGroupLimit: 12,
      exactVariantLimit: 24,
      searchDeadlineMs: 5_000
    };
    const matcher = match(request, gold, config);
    const oracle = bruteForceMatch(request, gold, config);
    assert.equal(oracle.trimmed, false);
    assert.deepEqual(
      matcher.selected?.productIds ?? [],
      oracle.selected?.productIds ?? []
    );
  });
});
