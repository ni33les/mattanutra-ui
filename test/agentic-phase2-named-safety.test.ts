import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateSafety } from "../lib/agentic/plan/safety.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import { setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import type { StackOption } from "../lib/agentic/plan/types.ts";

function optionWithIncidental(
  name: string,
  amount: number,
  unit: "mg" | "mcg" | "g"
): StackOption {
  return {
    basket: [
      {
        availabilityAsOf: "2026-08-25T00:00:00.000Z",
        contributionSupplementIds: ["sup_d3"],
        currency: "THB",
        dailyPills: 1,
        deliveryWindow: null,
        fixture: true,
        form: "capsule",
        imageUrl: null,
        incidentalNutrientNames: [name],
        incidentalNutrients: [{ amount, name, unit }],
        incompleteCommercialFacts: false,
        lineTotalMinor: 100,
        pillsPerServing: 1,
        productId: "prd_d3",
        productName: "Vitamin D3",
        quantity: 1,
        requestedNutrientNames: ["Vitamin D3"],
        retailerSku: "G-D3-2000",
        sellerId: "seller",
        sellerName: "QA",
        servingsPerDay: 1,
        source: "fixture",
        stockStatus: "in_stock",
        unitPriceMinor: 100
      }
    ],
    coverage: [
      {
        coveragePercent: 100,
        currentAmount: 0,
        deliveredAmount: 2000,
        name: "Vitamin D3",
        percentOfUpperLimit: null,
        remainingGap: 0,
        requestedAmount: 2000,
        status: "covered",
        supplementId: "sup_d3",
        totalExposureAmount: 2000,
        unit: "IU",
        upperLimitAmount: 4000
      }
    ],
    coveragePercent: 100,
    dailyPills: 1,
    matcherVersion: "pareto-hybrid-1",
    optionId: "opt_d3",
    reason: "test",
    snapshotId: "snap_named",
    totalPriceMinor: 100
  };
}

describe("Phase 2 named incidental safety", () => {
  it("names the incidental nutrient on a vitamin A UL block", () => {
    setMatcherSafetyCeilings([
      {
        lifeStage: "adult",
        maxAmount: 3000,
        maxUnit: "mcg",
        name: "Vitamin A",
        sourceScope: "supplemental",
        subjectId: "Vitamin A"
      }
    ]);
    const guidance = evaluateSafety({
      locale: "en",
      selected: optionWithIncidental("Vitamin A", 4000, "mcg"),
      state: aug25PlanState()
    });
    const dose = guidance.find(
      (item) => item.code === "dose_review_required" && item.action === "block"
    );
    assert.ok(dose);
    assert.equal(dose.nutrientName, "Vitamin A");
    assert.equal(dose.unit, "mcg");
    assert.equal(dose.threshold, 3000);
    assert.equal(dose.exposure, 4000);
    assert.deepEqual(dose.productIds, ["prd_d3"]);
    assert.notEqual(dose.threshold, 1);
  });

  it("does not emit threshold 1 for 400.2 mg vs a 1 g ceiling", () => {
    setMatcherSafetyCeilings([
      {
        lifeStage: "adult",
        maxAmount: 1,
        maxUnit: "g",
        name: "Beta Glucan",
        sourceScope: "supplemental",
        subjectId: "Beta Glucan"
      }
    ]);
    const guidance = evaluateSafety({
      locale: "en",
      selected: optionWithIncidental("Beta Glucan", 400.2, "mg"),
      state: aug25PlanState()
    });
    const dose = guidance.find((item) => item.code === "dose_review_required");
    assert.equal(dose, undefined);
  });

  it("emits overlap guidance when two selected D3 SKUs contribute", () => {
    const selected: StackOption = {
      ...optionWithIncidental("Vitamin A", 1, "mcg"),
      basket: [
        {
          ...optionWithIncidental("Vitamin A", 1, "mcg").basket[0]!,
          productId: "prd_bio",
          productName: "Bio Calcium+D3",
          requestedNutrientNames: ["Vitamin D3"]
        },
        {
          ...optionWithIncidental("Vitamin A", 1, "mcg").basket[0]!,
          productId: "prd_joint",
          productName: "Joint Mobility Plus",
          requestedNutrientNames: ["Vitamin D3"]
        }
      ],
      coverage: [
        {
          contributors: [
            {
              amount: 600,
              productId: "prd_bio",
              productName: "Bio Calcium+D3",
              source: "selected",
              unit: "IU"
            },
            {
              amount: 1200,
              productId: "prd_joint",
              productName: "Joint Mobility Plus",
              source: "selected",
              unit: "IU"
            }
          ],
          coveragePercent: 90,
          currentAmount: 0,
          deliveredAmount: 1800,
          name: "Vitamin D3",
          percentOfUpperLimit: 45,
          remainingGap: 200,
          requestedAmount: 2000,
          status: "covered",
          supplementId: "sup_d3",
          totalExposureAmount: 1800,
          unit: "IU",
          upperLimitAmount: 4000
        }
      ]
    };
    const guidance = evaluateSafety({
      locale: "en",
      selected,
      state: {
        ...aug25PlanState(),
        targets: [
          {
            amount: 2000,
            name: "Vitamin D3",
            supplementId: "sup_d3",
            unit: "IU"
          }
        ]
      }
    });
    const overlap = guidance.find((item) => item.code === "duplicate_or_overlap");
    assert.ok(overlap);
    assert.equal(overlap.action, "acknowledge");
    assert.equal(overlap.nutrientName, "Vitamin D3");
    assert.equal(overlap.unit, "IU");
    assert.equal(overlap.contributors?.length, 2);
  });
});
