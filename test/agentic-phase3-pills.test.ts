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
    dedicatedPartialCount: 0,
    exposure: { provenance: [], totals: new Map() },
    incidentalCount: 0,
    oversupplyScore: 0,
    priceMinor: 65000,
    productCount: overrides.productIds.length,
    reason: "",
    requestedLabelCount: 0,
    titleExactCount: 0,
    safety: emptySafety(),
    sellerId: "seller_th",
    variantIds: [],
    ...overrides
  };
}

describe("Phase 3 fewest_pills ranking", () => {
  it("does not let coverage-Pareto pick a larger stack when pills and products are worse", () => {
    const tight = scored({
      aggregateCoverage: 9_200,
      coveredCount: 5,
      coverageBySubject: new Map([
        ["sup_d3", 10_000],
        ["sup_omega", 9_000],
        ["sup_mag", 10_000],
        ["sup_b12", 6_000],
        ["sup_c", 9_000]
      ]),
      dailyPills: 6,
      productCount: 4,
      productIds: ["A", "B", "C", "D"],
      priceMinor: 70000
    });
    const loose = scored({
      aggregateCoverage: 9_800,
      coveredCount: 5,
      coverageBySubject: new Map([
        ["sup_d3", 10_000],
        ["sup_omega", 12_000],
        ["sup_mag", 10_000],
        ["sup_b12", 8_000],
        ["sup_c", 10_000]
      ]),
      dailyPills: 7,
      productCount: 5,
      productIds: ["A", "B", "C", "D", "E"],
      priceMinor: 80000
    });
    assert.equal(
      compareBaskets(
        tight,
        loose,
        qaRequest({ optimization: "fewest_pills" })
      ) < 0,
      true
    );
  });

  it("keeps labelled dedicated partials over a lower-pill covering-only stack", () => {
    const withPartials = scored({
      coveredCount: 3,
      dailyPills: 10,
      dedicatedPartialCount: 2,
      productIds: ["A", "B", "C", "D", "E"],
      priceMinor: 472500
    });
    const coveringOnly = scored({
      coveredCount: 3,
      dailyPills: 4,
      dedicatedPartialCount: 0,
      productIds: ["A", "B", "C"],
      priceMinor: 152800
    });
    assert.equal(
      compareBaskets(
        withPartials,
        coveringOnly,
        qaRequest({ optimization: "fewest_pills" })
      ) < 0,
      true
    );
  });

  it("counts a labelled B12-only complex as a dedicated partial", () => {
    const withMegaB = scored({
      coveredCount: 3,
      dailyPills: 10,
      dedicatedPartialCount: 2,
      productIds: ["MAG", "O3", "C", "D3", "B12"],
      priceMinor: 472500
    });
    const coveringOnly = scored({
      coveredCount: 3,
      dailyPills: 4,
      dedicatedPartialCount: 0,
      productIds: ["MAG", "O3", "C"],
      priceMinor: 152800
    });
    assert.equal(
      compareBaskets(
        withMegaB,
        coveringOnly,
        qaRequest({ optimization: "fewest_pills" })
      ) < 0,
      true
    );
  });

  it("among the same dedicated-partial count, fewest_pills picks fewer pills", () => {
    const tenPills = scored({
      coveredCount: 3,
      dailyPills: 10,
      dedicatedPartialCount: 2,
      productIds: ["A", "B", "C", "D", "E"],
      priceMinor: 472500
    });
    const elevenPills = scored({
      coveredCount: 3,
      dailyPills: 11,
      dedicatedPartialCount: 2,
      productIds: ["A", "B", "C", "D", "F"],
      priceMinor: 511100
    });
    assert.equal(
      compareBaskets(
        tenPills,
        elevenPills,
        qaRequest({ optimization: "fewest_pills" })
      ) < 0,
      true
    );
  });

  it("unconstrained fewest_pills is not strictly worse on pills and products than a 4/7 cap", () => {
    const products = [
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
        facts: [{ amount: 250, key: "b12" }],
        id: "G-B12-250",
        pills: 1,
        priceThb: 140
      }),
      qaProduct({
        facts: [{ amount: 500, key: "c" }],
        id: "G-C-500",
        pills: 1,
        priceThb: 120
      }),
      qaProduct({
        facts: [
          { amount: 2000, key: "d3" },
          { amount: 200, key: "mag" },
          { amount: 8, key: "b12" }
        ],
        id: "G-EXTRA-PARTIAL",
        pills: 2,
        priceThb: 250
      })
    ];
    const unconstrained = match(
      qaRequest({
        maxProductCount: 8,
        optimization: "fewest_pills",
        targets: [
          qaTarget("d3", 2000),
          qaTarget("omega", 1000),
          qaTarget("mag", 200),
          qaTarget("b12", 250),
          qaTarget("c", 500)
        ]
      }),
      catalog(products)
    );
    const capped = match(
      qaRequest({
        maxDailyPills: 7,
        maxProductCount: 4,
        optimization: "fewest_pills",
        targets: [
          qaTarget("d3", 2000),
          qaTarget("omega", 1000),
          qaTarget("mag", 200),
          qaTarget("b12", 250),
          qaTarget("c", 500)
        ]
      }),
      catalog(products)
    );
    assert.ok(unconstrained.selected);
    assert.ok(capped.selected);
    if (unconstrained.selected.coveredCount === capped.selected.coveredCount) {
      const worseOnBoth =
        unconstrained.selected.dailyPills > capped.selected.dailyPills &&
        unconstrained.selected.productCount > capped.selected.productCount;
      assert.equal(worseOnBoth, false);
    }
  });

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

  it("picks dedicated MAGNESIUM over MAGNESIUM+D3 when both cover Mag at the floor", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [
          qaTarget("d3", 2000),
          qaTarget("omega", 1000),
          qaTarget("mag", 200),
          qaTarget("b12", 250),
          qaTarget("c", 500)
        ]
      }),
      catalog([
        qaProduct({
          facts: [
            { amount: 200, key: "d3" },
            { amount: 600, key: "calcium" }
          ],
          id: "prd_bio_calcium_d3",
          pills: 3,
          priceThb: 390,
          title: "Bio Calcium+D3"
        }),
        qaProduct({
          dietary: "fish",
          facts: [{ amount: 1000, key: "omega" }],
          form: "softgel",
          id: "prd_vistra_omega",
          omega: "fish",
          pills: 2,
          priceThb: 850,
          title: "Vistra Omega 3"
        }),
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "prd_magnesium",
          pills: 1,
          priceThb: 290,
          title: "MAGNESIUM"
        }),
        qaProduct({
          facts: [
            { amount: 200, key: "mag" },
            { amount: 400, key: "d3" }
          ],
          id: "prd_magnesium_d3",
          pills: 1,
          priceThb: 250,
          title: "MAGNESIUM+D3 50'S"
        }),
        qaProduct({
          facts: [{ amount: 100, key: "b12" }],
          id: "prd_mega_b",
          pills: 2,
          priceThb: 390,
          title: "Mega B Complex"
        }),
        qaProduct({
          facts: [{ amount: 500, key: "c" }],
          id: "prd_bio_c",
          pills: 2,
          priceThb: 390,
          title: "BIO C"
        })
      ])
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("prd_magnesium"), true);
    assert.equal(result.selected.productIds.includes("prd_magnesium_d3"), false);
    assert.equal(result.selected.productIds.includes("prd_mega_b"), true);
    assert.equal(result.selected.productIds.includes("prd_vistra_omega"), true);
  });
});
