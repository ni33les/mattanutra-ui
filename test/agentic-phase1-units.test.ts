import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureSnapshot, FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { freezeCatalogueSnapshot } from "../lib/agentic/catalogue/freeze.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import { convertAmount, scaleAmount } from "../lib/matcher/dose.ts";
import { match } from "../lib/matcher/index.ts";
import { qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

function supplement(name: string) {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

function catalog(products: ReturnType<typeof qaProduct>[]) {
  return {
    availabilityAsOf: "2026-08-25T00:00:00.000Z",
    catalogueVersion: "phase1-units",
    products
  };
}

describe("Phase 1 unit canonicalization", () => {
  it("converts D3 IU and mcg through the same scaled mass", () => {
    const iu = scaleAmount({
      amount: 2000,
      subjectId: "sup_d3",
      subjectName: "Vitamin D3",
      unit: "IU"
    });
    const mcg = scaleAmount({
      amount: 50,
      subjectId: "sup_d3",
      subjectName: "Vitamin D3",
      unit: "mcg"
    });
    assert.equal("reason" in iu, false);
    assert.equal("reason" in mcg, false);
    if ("reason" in iu || "reason" in mcg) {
      return;
    }
    assert.equal(iu.units, mcg.units);
    assert.equal(iu.dim, mcg.dim);
    assert.equal(convertAmount({
      amount: 2000,
      fromUnit: "IU",
      subjectId: "sup_d3",
      subjectName: "Vitamin D3",
      toUnit: "mcg"
    }), 50);
    assert.equal(convertAmount({
      amount: 2000,
      fromUnit: "i.u.",
      subjectId: "sup_d3",
      subjectName: "Vitamin D3",
      toUnit: "mcg"
    }), 50);
  });

  it("converts magnesium mg and g through the same scaled mass", () => {
    const mg = scaleAmount({
      amount: 200,
      subjectId: "sup_mag",
      subjectName: "Magnesium",
      unit: "mg"
    });
    const grams = scaleAmount({
      amount: 0.2,
      subjectId: "sup_mag",
      subjectName: "Magnesium",
      unit: "g"
    });
    assert.equal("reason" in mg, false);
    assert.equal("reason" in grams, false);
    if ("reason" in mg || "reason" in grams) {
      return;
    }
    assert.equal(mg.units, grams.units);
    assert.equal(convertAmount({
      amount: 350,
      fromUnit: "mg",
      subjectId: "sup_mag",
      subjectName: "Magnesium",
      toUnit: "g"
    }), 0.35);
  });

  it("selects the same D3 stack for 2000 IU and 50 mcg on a mixed-unit catalogue", () => {
    const products = [
      qaProduct({
        facts: [{ amount: 600, key: "d3" }],
        id: "G-D3-600-IU",
        pills: 1,
        priceThb: 80
      }),
      qaProduct({
        facts: [{ amount: 50, key: "d3", unit: "mcg" }],
        id: "G-D3-50-MCG",
        pills: 1,
        priceThb: 90
      })
    ];
    const iu = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [qaTarget("d3", 2000, "IU")]
      }),
      catalog(products)
    );
    const mcg = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [qaTarget("d3", 50, "mcg")]
      }),
      catalog(products)
    );
    assert.ok(iu.selected);
    assert.ok(mcg.selected);
    assert.deepEqual(iu.selected?.productIds, mcg.selected?.productIds);
    assert.equal(iu.selected?.dailyPills, mcg.selected?.dailyPills);
    assert.deepEqual(iu.selected?.productIds, ["G-D3-50-MCG"]);
    assert.equal(iu.selected?.dailyPills, 1);
  });

  it("selects the same magnesium stack for 200 mg and 0.2 g", () => {
    const products = [
      qaProduct({
        facts: [{ amount: 200, key: "mag" }],
        id: "G-MAG-200",
        priceThb: 190
      }),
      qaProduct({
        facts: [{ amount: 300, key: "mag" }],
        id: "G-MAG-300",
        priceThb: 210
      })
    ];
    const mg = match(
      qaRequest({
        optimization: "lowest_cost",
        targets: [qaTarget("mag", 200, "mg")]
      }),
      catalog(products)
    );
    const grams = match(
      qaRequest({
        optimization: "lowest_cost",
        targets: [qaTarget("mag", 0.2, "g")]
      }),
      catalog(products)
    );
    assert.deepEqual(mg.selected?.productIds, grams.selected?.productIds);
    assert.equal(mg.selected?.productIds.includes("G-MAG-200"), true);
  });

  it("nets a 1000 IU current against a 50 mcg D3 target", () => {
    const snapshot = freezeCatalogueSnapshot({
      ...fixtureSnapshot("2026-08-25T00:00:00.000Z"),
      catalogueVersion: "phase1-units"
    });
    const d3 = supplement("Vitamin D3");
    const state = aug25PlanState({
      currentSupplements: [
        {
          dailyAmount: 1000,
          name: "Vitamin D3",
          supplementId: d3.supplementId,
          unit: "IU"
        }
      ],
      targets: [
        {
          amount: 50,
          name: "Vitamin D3",
          supplementId: d3.supplementId,
          unit: "mcg"
        }
      ]
    });
    const matched = matchPlan({ snapshot, state });
    assert.ok(matched.selected);
    const row = matched.selected.coverage[0];
    assert.ok(row);
    assert.equal(row.unit, "mcg");
    assert.equal(row.requestedAmount, 50);
    assert.equal(row.currentAmount, 25);
    assert.equal(row.remainingGap, 25);
    assert.equal(row.totalExposureAmount, row.currentAmount + row.deliveredAmount);
  });

  it("keeps fixture D3 IU and mcg plans on the same products and equivalent UL", () => {
    const snapshot = freezeCatalogueSnapshot({
      ...fixtureSnapshot("2026-08-25T00:00:00.000Z"),
      catalogueVersion: "phase1-units"
    });
    const d3 = supplement("Vitamin D3");
    const mag = supplement("Magnesium");
    const iu = matchPlan({
      snapshot,
      state: aug25PlanState({
        targets: [{ amount: 2000, name: "Vitamin D3", supplementId: d3.supplementId, unit: "IU" }]
      })
    });
    const mcg = matchPlan({
      snapshot,
      state: aug25PlanState({
        targets: [{ amount: 50, name: "Vitamin D3", supplementId: d3.supplementId, unit: "mcg" }]
      })
    });
    assert.ok(iu.selected);
    assert.ok(mcg.selected);
    assert.deepEqual(
      iu.selected.basket.map((item) => item.productId),
      mcg.selected.basket.map((item) => item.productId)
    );
    assert.equal(iu.selected.dailyPills, mcg.selected.dailyPills);
    assert.equal(iu.selected.coverage[0]?.upperLimitAmount, 4000);
    assert.equal(mcg.selected.coverage[0]?.upperLimitAmount, 100);

    const mg = matchPlan({
      snapshot,
      state: aug25PlanState({
        targets: [{ amount: 200, name: "Magnesium", supplementId: mag.supplementId, unit: "mg" }]
      })
    });
    const grams = matchPlan({
      snapshot,
      state: aug25PlanState({
        targets: [{ amount: 0.2, name: "Magnesium", supplementId: mag.supplementId, unit: "g" }]
      })
    });
    assert.ok(mg.selected);
    assert.ok(grams.selected);
    assert.deepEqual(
      mg.selected.basket.map((item) => item.productId),
      grams.selected.basket.map((item) => item.productId)
    );
    assert.equal(mg.selected.coverage[0]?.status, grams.selected.coverage[0]?.status);
    assert.equal(mg.selected.coverage[0]?.upperLimitAmount, 350);
    assert.equal(grams.selected.coverage[0]?.upperLimitAmount, 0.35);
  });
});
