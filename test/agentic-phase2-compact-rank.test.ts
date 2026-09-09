import assert from "node:assert/strict";
import { compileGroups } from "../lib/matcher/candidates.ts";
import { describe, it } from "node:test";
import { match } from "../lib/matcher/index.ts";
import { QA_GOLD_CATALOG, qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

describe("Phase 2 compactness ranking", () => {
  it("retains all supported doses of an eligible below-floor contributor", () => {
    const request = qaRequest({ targets: [qaTarget("d3", 2000)] });
    const product = qaProduct({ id: "partial", facts: [{ amount: 100, key: "d3" }], priceThb: 10 });
    const groups = compileGroups(request, { products: [product], availabilityAsOf: "frozen", catalogueVersion: "partial" });
    assert.deepEqual(groups.map((row) => row.productId), ["partial"]);
    const doses = groups[0]!.variants.map(row => row.dailyUnits);
    assert.ok(doses.every(Number.isSafeInteger), "whole physical units stay whole");
    for (const supported of [1, 2, 3, 20, 40, 41]) assert.ok(doses.includes(supported));
    assert.equal(groups[0]!.variants.find(row => row.dailyUnits === 20)?.contributions.get("sup_d3")?.units, 2000n * 25n);
    assert.equal(groups[0]!.variants.find(row => row.dailyUnits === 41)?.contributions.get("sup_d3")?.units, 4100n * 25n);
  });

  it("does not double-count duplicate catalog D3 facts on one SKU", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-dup-d3-facts",
      products: [
        qaProduct({
          facts: [
            { amount: 200, key: "d3" },
            { amount: 200, key: "d3" }
          ],
          id: "G-D3-DUP-200",
          pills: 1,
          priceThb: 120,
          title: "Vitamin D3 200 IU"
        })
      ]
    };
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [qaTarget("d3", 2000)]
      }),
      catalog
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-D3-DUP-200"), true);
    const d3 = qaTarget("d3", 2000);
    const units = result.selected.coverageBySubject.get(d3.subjectId) ?? 0;
    const variant = result.selected.variantIds.find((id) =>
      id.includes("G-D3-DUP-200:x")
    );
    const servings = Number(variant?.match(/:x(\d+)$/)?.[1] || 1);
    const expected = Math.round((200 * servings * 10_000) / 2000);
    assert.equal(units, expected);
    assert.equal(units === servings * 2000, false);
  });

  it("does not stuff extra SKUs onto standalone D3 when a covering SKU exists", () => {
    const result = match(
      qaRequest({
        optimization: "balanced",
        targets: [qaTarget("d3", 2000)]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productCount, 1);
    assert.deepEqual(result.selected.productIds, ["G-D3-2000"]);
    assert.equal(result.selected.dailyPills, 1);
    assert.equal(result.selected.priceMinor, 16000);
    const cheaper = match(qaRequest({ optimization: "balanced", targets: [qaTarget("d3", 2000)], productDoses: [{ productId: "G-D3-1000", servingsPerDay: 2 }] }), QA_GOLD_CATALOG).selected;
    assert.ok(cheaper); assert.deepEqual(cheaper.productIds, ["G-D3-1000"]); assert.equal(cheaper.dailyPills, 2);
    assert.equal(cheaper.priceMinor, 10000); assert.equal(cheaper.doseFit?.total, 0); assert.equal(cheaper.purchaseEligible, true);
    assert.equal(result.selected.doseFit?.total, 0);
    assert.equal(result.selected.coveredCount, 1);
  });

  it("uses extra servings of one SKU before adding a second product when coverage is still partial", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-extra-servings",
      products: [
        qaProduct({
          facts: [{ amount: 500, key: "d3" }],
          id: "G-D3-500",
          priceThb: 120,
          title: "Vitamin D3 500 IU"
        }),
        qaProduct({
          facts: [{ amount: 400, key: "d3" }],
          id: "G-JOINT-D3",
          priceThb: 180,
          title: "Joint Mobility D3"
        })
      ]
    };
    const result = match(
      qaRequest({
        optimization: "balanced",
        targets: [qaTarget("d3", 2000)]
      }),
      catalog
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-D3-500"), true);
    const variant = result.selected.variantIds.find((id) =>
      id.includes("G-D3-500:x")
    );
    assert.ok(variant);
    assert.equal(variant, "seller_th:G-D3-500:x4");
    assert.equal(result.selected.doseFit?.total, 0);
    assert.equal(result.selected.priceMinor, 12000);
    assert.equal(result.selected.dailyPills, 4);
    const simpler = result.alternatives.find(option => option.roles?.includes("simpler"));
    assert.deepEqual(simpler?.variantIds, ["seller_th:G-D3-500:x1"]);
    assert.equal(simpler?.doseFit?.total, 0.75);
    assert.equal(simpler?.purchaseEligible, true);
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
    assert.equal(result.selected.productCount, 1);
    assert.deepEqual(result.selected.productIds, ["G-C-500"]);
    assert.equal(result.selected.dailyPills, 1);
    assert.equal(result.selected.priceMinor, 10000);
    const cheaper = match(qaRequest({ optimization: "balanced", targets: [qaTarget("c", 500)], productDoses: [{ productId: "G-INCIDENTAL-C", servingsPerDay: 2 }] }), QA_GOLD_CATALOG).selected;
    assert.ok(cheaper); assert.deepEqual(cheaper.productIds, ["G-INCIDENTAL-C"]); assert.equal(cheaper.dailyPills, 2);
    assert.equal(cheaper.priceMinor, 7000); assert.equal(cheaper.doseFit?.total, 0); assert.equal(cheaper.purchaseEligible, true);
    assert.equal(result.selected.doseFit?.total, 0);
    assert.equal(result.selected.coveredCount, 1);
  });

  it("M-01 remains combo plus the cheaper algae pack at 4 pills", () => {
    const result = match(qaRequest({ optimization: "fewest_pills" }), QA_GOLD_CATALOG);
    assert.deepEqual(result.selected?.productIds, ["G-BASE-COMBO", "G-O3-ALGAE-500"]);
    assert.equal(result.selected?.dailyPills, 4);
    assert.equal(result.selected?.priceMinor, 61000);
    assert.equal(result.selected?.doseFit?.total, 0);
    assert.equal(result.selected?.coveredCount, 5);
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

  it("drops a D3-labelling joint SKU from official when it does not raise covered-count", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-drop-joint",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 120,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [{ amount: 2000, key: "d3" }],
          id: "G-D3-2000",
          pills: 1,
          priceThb: 160,
          title: "Vitamin D3 2000 IU"
        }),
        qaProduct({
          facts: [
            { amount: 400, key: "d3" },
            { amount: 50, key: "c" }
          ],
          id: "G-JOINT-D3-C",
          pills: 2,
          priceThb: 220,
          title: "Joint Mobility Plus"
        })
      ]
    };
    const fewest = match(
      qaRequest({ optimization: "fewest_pills" }),
      catalog
    );
    const balanced = match(
      qaRequest({ optimization: "balanced" }),
      catalog
    );
    assert.ok(fewest.selected);
    assert.ok(balanced.selected);
    assert.equal(fewest.selected.productIds.includes("G-JOINT-D3-C"), false);
    assert.equal(fewest.selected.productIds.includes("G-O3-FISH-1000"), true);
    assert.equal(fewest.selected.productIds.includes("G-MAG-200"), true);
    assert.equal(fewest.selected.dailyPills <= balanced.selected.dailyPills, true);
    assert.equal(fewest.selected.dailyPills <= 7, true);
    assert.equal(fewest.selected.productCount <= 4, true);
    assert.equal(fewest.selected.productIds.includes("G-D3-2000"), true);
  });

  it("keeps Joint Mobility on official when Bio Calcium plus Joint still reach 90% D3", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-joint-plus-bio-calcium",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 120,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [{ amount: 100, key: "b12" }],
          id: "G-MEGA-B",
          pills: 2,
          priceThb: 180,
          title: "Mega B Complex"
        }),
        qaProduct({
          facts: [
            { amount: 600, key: "d3" },
            { amount: 600, key: "calcium" }
          ],
          id: "G-BIO-CAL-D3",
          pills: 3,
          priceThb: 390,
          title: "Bio Calcium+D3"
        }),
        qaProduct({
          facts: [{ amount: 1200, key: "d3" }],
          id: "G-JOINT-D3",
          pills: 3,
          priceThb: 450,
          title: "Blackmores Joint Mobility Plus"
        })
      ]
    };
    const result = match(qaRequest({ optimization: "fewest_pills" }), catalog);
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-JOINT-D3"), true);
    assert.equal(result.selected.productIds.includes("G-MEGA-B"), true);
    const d3 = qaTarget("d3", 2000);
    assert.equal(
      Math.round((result.selected.coverageBySubject.get(d3.subjectId) ?? 0) / 100) >= 90,
      true
    );
  });

  it("keeps live Joint 10 mcg with Bio Calcium 200 IU extra servings to reach 90% D3", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-live-joint-10mcg",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 120,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [{ amount: 100, key: "b12" }],
          id: "G-MEGA-B",
          pills: 2,
          priceThb: 180,
          title: "Mega B Complex"
        }),
        qaProduct({
          facts: [
            { amount: 200, key: "d3" },
            { amount: 600, key: "calcium" }
          ],
          id: "G-BIO-CAL-D3",
          pills: 1,
          priceThb: 390,
          title: "Bio Calcium+D3"
        }),
        qaProduct({
          facts: [
            { amount: 10, key: "d3", name: "Vitamin D3", unit: "mcg" },
            { amount: 50, key: "c" }
          ],
          id: "G-JOINT-D3",
          pills: 1,
          priceThb: 450,
          title: "Blackmores Joint Mobility Plus"
        })
      ]
    };
    const result = match(qaRequest({ optimization: "fewest_pills" }), catalog);
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-JOINT-D3"), true);
    assert.equal(result.selected.productIds.includes("G-BIO-CAL-D3"), true);
    assert.equal(result.selected.productIds.includes("G-MEGA-B"), true);
    const d3 = qaTarget("d3", 2000);
    assert.equal(
      Math.round((result.selected.coverageBySubject.get(d3.subjectId) ?? 0) / 100) >= 90,
      true
    );
  });

  it("keeps the full closest fit above maxDailyPills without a hard-constraint certificate", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-max-pills-cert",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 120,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [{ amount: 100, key: "b12" }],
          id: "G-MEGA-B",
          pills: 2,
          priceThb: 180,
          title: "Mega B Complex"
        }),
        qaProduct({
          facts: [
            { amount: 200, key: "d3" },
            { amount: 600, key: "calcium" }
          ],
          id: "G-BIO-CAL-D3",
          pills: 1,
          priceThb: 390,
          title: "Bio Calcium+D3"
        }),
        qaProduct({
          facts: [
            { amount: 10, key: "d3", name: "Vitamin D3", unit: "mcg" },
            { amount: 50, key: "c" }
          ],
          id: "G-JOINT-D3",
          pills: 1,
          priceThb: 450,
          title: "Blackmores Joint Mobility Plus"
        })
      ]
    };
    const result = match(
      qaRequest({ maxDailyPills: 6, optimization: "fewest_pills" }),
      catalog
    );
    const unrestricted = match(qaRequest({ optimization: "fewest_pills" }), catalog);
    assert.deepEqual(result.selected?.variantIds, unrestricted.selected?.variantIds);
    assert.equal(result.selected?.doseFit?.total, unrestricted.selected?.doseFit?.total);
    assert.ok(result.selected!.dailyPills > 6);
    assert.equal(result.selected!.priceMinor, result.selected!.productIds.reduce((sum, id) => sum + catalog.products.find(product => product.productId === id)!.unitPriceMinor, 0));
    assert.equal(result.lossCertificates?.some(item => item.rejection_class === "hard_constraint" || item.conflicting_rule_id === "max_pills") ?? false, false);
  });

  it("keeps the full closest fit above maxPriceMinor without a hard-constraint certificate", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-budget-cert",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 120,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [{ amount: 100, key: "b12" }],
          id: "G-MEGA-B",
          pills: 2,
          priceThb: 180,
          title: "Mega B Complex"
        }),
        qaProduct({
          facts: [
            { amount: 200, key: "d3" },
            { amount: 600, key: "calcium" }
          ],
          id: "G-BIO-CAL-D3",
          pills: 1,
          priceThb: 3900,
          title: "Bio Calcium+D3"
        }),
        qaProduct({
          facts: [
            { amount: 10, key: "d3", name: "Vitamin D3", unit: "mcg" },
            { amount: 50, key: "c" }
          ],
          id: "G-JOINT-D3",
          pills: 1,
          priceThb: 4500,
          title: "Blackmores Joint Mobility Plus"
        })
      ]
    };
    const unconstrained = match(
      qaRequest({ optimization: "fewest_pills" }),
      catalog
    );
    assert.ok(unconstrained.selected);
    const result = match(
      qaRequest({ maxPriceMinor: 80_000, optimization: "fewest_pills" }),
      catalog
    );
    assert.deepEqual(result.selected?.variantIds, unconstrained.selected?.variantIds);
    assert.equal(result.selected?.doseFit?.total, unconstrained.selected?.doseFit?.total);
    assert.ok(result.selected!.priceMinor > 80_000);
    assert.equal(result.selected!.priceMinor, result.selected!.productIds.reduce((sum, id) => sum + catalog.products.find(product => product.productId === id)!.unitPriceMinor, 0));
    assert.equal(result.lossCertificates?.some(item => item.rejection_class === "hard_constraint" || item.conflicting_rule_id === "budget") ?? false, false);
  });

  it("keeps the labelled D3 contributor and adjusts its quantity before adding collateral C", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-no-covering-d3",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 120,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [{ amount: 400, key: "d3" }],
          id: "G-D3-400",
          pills: 1,
          priceThb: 120,
          title: "Vitamin D3 400 IU"
        }),
        qaProduct({
          facts: [
            { amount: 400, key: "d3" },
            { amount: 50, key: "c" }
          ],
          id: "G-JOINT-D3-C",
          pills: 2,
          priceThb: 220,
          title: "Joint Mobility Plus"
        })
      ]
    };
    const fewest = match(
      qaRequest({ optimization: "fewest_pills" }),
      catalog
    );
    assert.ok(fewest.selected);
    assert.equal(fewest.selected.productIds.includes("G-D3-400"), true);
    assert.equal(fewest.selected.productIds.includes("G-JOINT-D3-C"), false);
    assert.equal(fewest.selected.productIds.includes("G-O3-FISH-1000"), true);
    assert.equal(fewest.selected.productIds.includes("G-MAG-200"), true);
    assert.equal(fewest.selected.productIds.includes("G-C-500"), true);
    const d3 = qaTarget("d3", 2000);
    assert.equal(fewest.selected.coverageBySubject.get(d3.subjectId), 10000);
    assert.ok(fewest.selected.variantIds.includes("seller_th:G-D3-400:x5"));
    assert.equal(fewest.selected.doseFit?.total, 1, "the unavailable B12 target stays in dose loss");
    assert.equal(fewest.selected.priceMinor, 64000);
    assert.equal(fewest.selected.dailyPills, 9);
    assert.equal(
      fewest.rejected.some(
        (item) =>
          item.productId === "G-D3-400" && item.reason === "incidental_only"
      ),
      false
    );
  });

  it("selects a labelled below-floor D3 SKU on standalone D3", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-standalone-d3",
      products: [
        qaProduct({
          facts: [{ amount: 400, key: "d3" }],
          id: "G-D3-400",
          pills: 1,
          priceThb: 120,
          title: "Vitamin D3 400 IU"
        }),
        qaProduct({
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        })
      ]
    };
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [qaTarget("d3", 2000)]
      }),
      catalog
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-D3-400"), true);
    assert.equal(
      result.rejected.some(
        (item) => item.productId === "G-D3-400" && item.reason === "incidental_only"
      ),
      false
    );
  });

  it("uses two multi servings when the complete dose penalty beats standalone magnesium", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-covering-50plus",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 180,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [
            { amount: 600, key: "d3" },
            { amount: 105, key: "mag" },
            { amount: 45, key: "c" }
          ],
          id: "G-50PLUS",
          pills: 1,
          priceThb: 150,
          title: "Multivitamins for 50+"
        })
      ]
    };
    const fewest = match(
      qaRequest({
        optimization: "fewest_pills",
        profile: { ageYears: 52, lifeStage: "adult", sex: "male" }
      }),
      catalog
    );
    assert.ok(fewest.selected);
    assert.equal(fewest.selected.productIds.includes("G-O3-FISH-1000"), true);
    assert.equal(fewest.selected.productIds.includes("G-C-500"), true);
    assert.equal(fewest.selected.productIds.includes("G-MAG-200"), false);
    assert.equal(fewest.selected.doseFit?.total, 1.63);
    assert.equal(fewest.selected.doseFit?.perTarget.find((row) => row.subjectId === "sup_mag")?.exposure, 210);
    const d3Target = qaTarget("d3", 2000);
    const d3Percent = Math.round(
      (fewest.selected.coverageBySubject.get(d3Target.subjectId) ?? 0) / 100
    );
    assert.equal(d3Percent >= 90, false);
    const fiftyServings = fewest.selected.variantIds.filter((id) =>
      id.includes("G-50PLUS:x")
    );
    assert.equal(
      fiftyServings.every((id) => !/:x3$/.test(id)),
      true
    );
  });

  it("combines labelled contributors and reports actual full coverage with collateral penalties", () => {
    const joints = Array.from({ length: 8 }, (_, index) =>
      qaProduct({
        facts: [
          { amount: 400, key: "d3" },
          { amount: 40, key: "c" }
        ],
        id: `G-JOINT-D3-${index + 1}`,
        pills: 2,
        priceThb: 80 + index,
        title: `Joint Mobility ${index + 1}`
      })
    );
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-covering-50plus-noisy",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 180,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [
            { amount: 600, key: "d3" },
            { amount: 105, key: "mag" },
            { amount: 45, key: "c" }
          ],
          id: "G-50PLUS",
          pills: 1,
          priceThb: 150,
          title: "Multivitamins for 50+"
        }),
        ...joints
      ]
    };
    const fewest = match(
      qaRequest({
        optimization: "fewest_pills",
        profile: { ageYears: 52, lifeStage: "adult", sex: "male" }
      }),
      catalog
    );
    assert.ok(fewest.selected);
    assert.equal(fewest.selected.productIds.includes("G-MAG-200"), false);
    assert.equal(fewest.selected.productIds.includes("G-C-500"), true);
    assert.equal(fewest.selected.productIds.includes("G-O3-FISH-1000"), true);
    assert.equal(fewest.selected.productIds.includes("G-50PLUS"), true);
    assert.equal(fewest.selected.doseFit?.total, 1.39);
    const jointCount = fewest.selected.productIds.filter((id) =>
      id.startsWith("G-JOINT-D3-")
    ).length;
    assert.equal(jointCount <= 1, true);
    const d3Target = qaTarget("d3", 2000);
    const d3Percent = Math.round(
      (fewest.selected.coverageBySubject.get(d3Target.subjectId) ?? 0) / 100
    );
    assert.equal(d3Percent, 100);
    assert.equal(fewest.selected.doseFit?.perTarget.find((row) => row.subjectId === "sup_d3")?.exposure, 2000);
  });

  it("keeps an incidental UL concern advisory and includes its twice-weighted penalty", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-b12-incidental-ul",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 180,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [
            { amount: 600, key: "d3" },
            { amount: 105, key: "mag" },
            { amount: 45, key: "c" }
          ],
          id: "G-50PLUS",
          pills: 1,
          priceThb: 150,
          title: "Multivitamins for 50+"
        }),
        qaProduct({
          facts: [
            { amount: 250, key: "b12" },
            { amount: 50, key: "zinc" }
          ],
          id: "G-B12-ZINC-UL",
          pills: 1,
          priceThb: 90,
          title: "Vitamin B12 Zinc Complex"
        })
      ]
    };
    const fewest = match(
      qaRequest({
        optimization: "fewest_pills",
        profile: { ageYears: 52, lifeStage: "adult", sex: "male" }
      }),
      catalog
    );
    assert.ok(fewest.selected);
    assert.equal(fewest.selected.productIds.includes("G-B12-ZINC-UL"), true);
    assert.equal(fewest.selected.doseFit?.weightedLimit, 0.5);
    assert.ok(fewest.selected.safety.findings.some((row) => row.code === "dose_review_required" && row.subjectId === "sup_zinc" && row.action === "inform"));
    const b12Target = qaTarget("b12", 250);
    const b12Percent = Math.round(
      (fewest.selected.coverageBySubject.get(b12Target.subjectId) ?? 0) / 100
    );
    assert.equal(b12Percent, 100);
  });

  it("absorbs a UL-feasible dedicated B12 covering SKU into official", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-b12-covering",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 180,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [
            { amount: 600, key: "d3" },
            { amount: 105, key: "mag" },
            { amount: 45, key: "c" }
          ],
          id: "G-50PLUS",
          pills: 1,
          priceThb: 150,
          title: "Multivitamins for 50+"
        }),
        qaProduct({
          facts: [{ amount: 250, key: "b12" }],
          id: "G-B12-250",
          pills: 1,
          priceThb: 90,
          title: "Vitamin B12 250"
        })
      ]
    };
    const fewest = match(
      qaRequest({
        optimization: "fewest_pills",
        profile: { ageYears: 52, lifeStage: "adult", sex: "male" }
      }),
      catalog
    );
    assert.ok(fewest.selected);
    assert.equal(fewest.selected.productIds.includes("G-B12-250"), true);
    const b12Target = qaTarget("b12", 250);
    const b12Percent = Math.round(
      (fewest.selected.coverageBySubject.get(b12Target.subjectId) ?? 0) / 100
    );
    assert.equal(b12Percent >= 90, true);
  });

  it("compares partial B12 loss with full B12 plus an incidental UL penalty", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-b12-partial-not-empty",
      products: [
        qaProduct({
          facts: [
            { amount: 250, key: "b12" },
            { amount: 50, key: "zinc" }
          ],
          id: "G-B12-ZINC-UL",
          pills: 1,
          priceThb: 90,
          title: "Vitamin B12 Zinc Complex"
        }),
        qaProduct({
          facts: [{ amount: 30, key: "b12" }],
          id: "G-B12-30",
          pills: 1,
          priceThb: 60,
          title: "Vitamin B12 30"
        })
      ]
    };
    const result = match(
      qaRequest({
        optimization: "balanced",
        targets: [qaTarget("b12", 250)]
      }),
      catalog
    );
    assert.ok(result.selected);
    assert.deepEqual(result.selected.variantIds, ["seller_th:G-B12-30:x8"]);
    assert.equal(result.selected.doseFit?.total, (250 - 8 * 30) / 250);
    assert.equal(result.selected.priceMinor, 6000);
    assert.equal(result.selected.dailyPills, 8);
    assert.equal(result.selected.coverageBySubject.get(qaTarget("b12", 250).subjectId), 9600);
    const simpler = result.alternatives.find(option => option.roles?.includes("simpler"));
    assert.deepEqual(simpler?.variantIds, ["seller_th:G-B12-ZINC-UL:x1"]);
    assert.equal(simpler?.doseFit?.total, 2 * (50 - 40) / 40);
    assert.equal(simpler?.priceMinor, 9000);
    assert.equal(simpler?.dailyPills, 1);
    assert.equal(simpler?.purchaseEligible, true, "the serious zinc advice does not prevent purchase");
  });

  it("compares the complete combo dose loss with dedicated magnesium and C", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-mag-d3-combo",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 180,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [
            { amount: 200, key: "mag" },
            { amount: 100, key: "d3" },
            { amount: 60, key: "c" }
          ],
          id: "G-MAG-D3",
          pills: 1,
          priceThb: 90,
          title: "Magnesium + D3"
        }),
        qaProduct({
          facts: [
            { amount: 400, key: "d3" },
            { amount: 50, key: "c" }
          ],
          id: "G-JOINT-D3-C",
          pills: 2,
          priceThb: 80,
          title: "Joint Mobility Plus"
        })
      ]
    };
    const fewest = match(
      qaRequest({ optimization: "fewest_pills" }),
      catalog
    );
    const balanced = match(
      qaRequest({ optimization: "balanced" }),
      catalog
    );
    assert.ok(fewest.selected);
    assert.ok(balanced.selected);
    for (const option of [fewest.selected, balanced.selected]) {
      assert.deepEqual([...option.productIds].sort(), ["G-JOINT-D3-C", "G-MAG-D3", "G-O3-FISH-1000"]);
      assert.ok(option.variantIds.includes("seller_th:G-JOINT-D3-C:x5"));
      // B12 is unavailable, C is 310/500, and D3 is 2100/2000.
      const independentLoss = 1 + (500 - (5 * 50 + 60)) / 500 + (5 * 400 + 100 - 2000) / 2000;
      assert.equal(option.doseFit?.total, independentLoss);
      assert.equal(option.priceMinor, 47000);
      assert.equal(option.dailyPills, 13);
      assert.ok(option.doseFit!.total < 1 + (750 - 500) / 500, "less loss than the dedicated Mg/C basket");
    }
    const simpler = fewest.alternatives.find(option => option.roles?.includes("simpler"));
    assert.deepEqual(simpler?.variantIds, ["seller_th:G-MAG-D3:x1"]);
    assert.equal(simpler?.dailyPills, 1);
    assert.equal(simpler?.purchaseEligible, true);
  });

  it("keeps official gold products and pills across 20 target-order permutations", () => {
    const baseline = match(
      qaRequest({ optimization: "fewest_pills" }),
      QA_GOLD_CATALOG
    );
    assert.ok(baseline.selected);
    const expected = {
      pills: baseline.selected.dailyPills,
      products: [...baseline.selected.productIds]
    };
    const order = [
      qaTarget("d3", 2000),
      qaTarget("omega", 1000),
      qaTarget("mag", 200),
      qaTarget("b12", 250),
      qaTarget("c", 500)
    ];

    for (let index = 0; index < 20; index += 1) {
      const rotated = [...order.slice(index % order.length), ...order.slice(0, index % order.length)];
      const result = match(
        qaRequest({ optimization: "fewest_pills", targets: rotated }),
        QA_GOLD_CATALOG
      );
      assert.deepEqual(result.selected?.productIds, expected.products);
      assert.equal(result.selected?.dailyPills, expected.pills);
    }
  });

  it("keeps useful contributors and rescales a retained SKU when removing collateral excess", () => {
    const catalog = {
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      catalogueVersion: "phase2-official-no-stuff",
      products: [
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          id: "G-MAG-200",
          pills: 1,
          priceThb: 120,
          title: "Magnesium 200"
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
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          pills: 1,
          priceThb: 100,
          title: "Vitamin C 500"
        }),
        qaProduct({
          facts: [{ amount: 200, key: "d3" }],
          id: "G-CALCIUM-D3-200",
          pills: 1,
          priceThb: 175,
          title: "Bio Calcium+D3"
        }),
        qaProduct({
          facts: [{ amount: 50, key: "b12" }],
          id: "G-MEGA-B-50",
          pills: 1,
          priceThb: 97,
          title: "Mega B Complex"
        }),
        qaProduct({
          facts: [
            { amount: 400, key: "d3" },
            { amount: 40, key: "c" }
          ],
          id: "G-JOINT-D3",
          pills: 2,
          priceThb: 220,
          title: "Joint Mobility Plus"
        }),
        qaProduct({
          facts: [
            { amount: 600, key: "d3" },
            { amount: 5, key: "b12" },
            { amount: 90, key: "c" }
          ],
          id: "G-MULTI-50PLUS",
          pills: 1,
          priceThb: 50,
          title: "Multivitamins for 50+"
        })
      ]
    };
    const result = match(qaRequest({ optimization: "fewest_pills" }), catalog);
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-MAG-200"), true);
    assert.equal(result.selected.productIds.includes("G-O3-FISH-1000"), true);
    assert.equal(result.selected.productIds.includes("G-C-500"), true);
    assert.equal(result.selected.productIds.includes("G-CALCIUM-D3-200"), true);
    assert.equal(result.selected.productIds.includes("G-MEGA-B-50"), true);
    assert.equal(result.selected.productIds.includes("G-JOINT-D3"), false);
    assert.equal(result.selected.productIds.includes("G-MULTI-50PLUS"), false);
    assert.equal(result.selected.doseFit?.total, 0);
    assert.ok(result.selected.variantIds.includes("seller_th:G-CALCIUM-D3-200:x10"));
    assert.ok(result.selected.variantIds.includes("seller_th:G-MEGA-B-50:x5"));
    assert.equal(result.selected.priceMinor, 79200);
    assert.equal(result.selected.dailyPills, 19);
    const d3 = qaTarget("d3", 2000);
    assert.equal(
      result.selected.coverageBySubject.get(d3.subjectId),
      10000
    );
  });
});
