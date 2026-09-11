import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverageFor, requestedTargetCoverage } from "../lib/agentic/plan/matching.ts";
import { baselineCoverageEquivalent, buildEconomics, enrichBasketPackFacts } from "../lib/agentic/value/economics.ts";
import type { BasketItem, CanonicalPlanState, CoverageRow } from "../lib/agentic/plan/types.ts";
import { sampleValueSnapshot } from "./agentic/value/sample-catalogue.ts";

const snapshot = sampleValueSnapshot();
const nutrient = snapshot.supplements[1]!;
const product = snapshot.products[1]!;
const state: CanonicalPlanState = {
  acceptedGaps: [], conditionCodes: [], currency: "THB", currentSupplements: [], destinationCountry: "TH",
  leftovers: [], locale: "en", medicationCodes: [], optimization: "lowest_cost", pinnedCandidateKey: null,
  profile: { ageYears: 35, lifeStage: "adult" }, requirements: {}, safetyAcknowledgement: null,
  targets: [{ name: nutrient.name, supplementId: nutrient.supplementId, amount: 300, unit: "mg" }]
};
const row: CoverageRow = { name: nutrient.name, supplementId: nutrient.supplementId, requestedAmount: 300, unit: "mg",
  currentAmount: 0, deliveredAmount: 300, totalExposureAmount: 300, coveragePercent: 100, status: "covered",
  remainingGap: 0, percentOfUpperLimit: null, upperLimitAmount: null };
function basket(servingsPerDay: number): BasketItem {
  return enrichBasketPackFacts({ availabilityAsOf: snapshot.availabilityAsOf, contributionSupplementIds: [nutrient.supplementId],
    currency: "THB", dailyPills: servingsPerDay, deliveryWindow: "3-5 days", fixture: false, form: "capsule", imageUrl: null,
    incidentalNutrientNames: [], incidentalNutrients: [], incompleteCommercialFacts: false, lineTotalMinor: product.unitPriceMinor,
    pillsPerServing: 1, productId: product.productId, productName: product.candidate.title, quantity: 1,
    requestedNutrientNames: [nutrient.name], requestedNutrients: [{ name: nutrient.name, amount: 150 * servingsPerDay, unit: "mg" }],
    retailerSku: product.retailerSku, sellerId: product.sellerId, sellerName: product.sellerName,
    servingsPerDay, servingsPerPack: 90, source: "retail", stockStatus: "in_stock", unitPriceMinor: product.unitPriceMinor });
}

describe("honest requested coverage and equivalent savings", () => {
  it("rounds total consumed cost once, after adding fractional product costs", () => {
    const cheap = { ...basket(1), unitPriceMinor: 1, lineTotalMinor: 1, servingsPerPack: 7 };
    const result = buildEconomics({ coverage: [row], items: [cheap, { ...cheap, productId: "prd_second_rounding_fixture" }], snapshot, state });
    assert.equal(result.consumption30DayMinor, 9);
    assert.equal(result.consumption90DayMinor, 26);
  });
  it("rounds exact half-minor-unit costs up without binary floating-point drift", () => {
    for (const [price, pack, daily, expected] of [[5, 108, 3, 13], [5, 10.8, 0.3, 13], [1, 180, 1, 1]]) {
      const item = { ...basket(daily!), unitPriceMinor: price!, lineTotalMinor: price!, servingsPerPack: pack! };
      const result = buildEconomics({ coverage: [row], items: [item], snapshot, state });
      assert.equal(result.consumption90DayMinor, expected);
    }
  });
  it("leftovers reconcile with the published 90-day refill schedule at day 30", () => {
    const item = enrichBasketPackFacts({ ...basket(2), servingsPerPack: 30 });
    assert.equal(item.daysOfSupply, 15);
    assert.equal(item.leftoverServings30, 120);
    assert.equal(item.leftoverServings90, 0);
    const prepaid = enrichBasketPackFacts({ ...item, quantity: 3 });
    assert.equal(prepaid.leftoverServings30, 30);
    assert.equal(prepaid.leftoverServings90, 0);
  });
  it("four covered targets and one unresolved target report 80%, regardless of excess", () => {
    const rows = [0, 1, 2, 3].map(i => ({ ...row, supplementId: `target-${i}`, totalExposureAmount: 600, status: "over_target" as const }));
    rows.push({ ...row, supplementId: "unresolved", coveragePercent: 0, totalExposureAmount: 0, status: "uncovered" } as CoverageRow);
    assert.deepEqual(requestedTargetCoverage(rows), { coveredCount: 4, requestedCount: 5, coveragePercent: 80 });
  });
  it("keeps unresolved requested targets but never counts an unresolved current supplement as a target", () => {
    const coverage = coverageFor({ ...state, leftovers: [
      { name: "Unknown target", amount: 25, unit: "mg", reason: "not_in_catalogue", source: "target", requestIndex: 1, severity: "high" },
      { name: "Unknown current", amount: 10, unit: "mg", reason: "not_in_catalogue", source: "current_supplement", requestIndex: 0, severity: "high" }
    ] }, null);
    assert.equal(coverage.length, 2);
    assert.equal(coverage[1]?.unresolved, true);
    assert.equal(coverage[1]?.requestedAmount, 25);
    assert.equal(coverage.some(item => item.name === "Unknown current"), false);
  });
  it("does not call an underdosed baseline equivalent to a fully covered basket", () => {
    assert.equal(baselineCoverageEquivalent({ coverage: [row], baselineItems: [basket(1)], snapshot, state }), false);
    assert.equal(baselineCoverageEquivalent({ coverage: [row], baselineItems: [basket(2)], snapshot, state }), true);
  });
  it("compares equal partial coverage but rejects different partial coverage", () => {
    const partial = { ...row, deliveredAmount: 150, totalExposureAmount: 150, coveragePercent: 50, status: "partial" as const };
    assert.equal(baselineCoverageEquivalent({ coverage: [partial], baselineItems: [basket(1)], snapshot, state }), true);
    assert.equal(baselineCoverageEquivalent({ coverage: [partial], baselineItems: [basket(2)], snapshot, state }), false);
  });
  it("missing baseline products produce an actionable unavailable comparison", () => {
    const result = buildEconomics({ coverage: [row], items: [basket(2)], snapshot,
      state: { ...state, baseline: { type: "current_basket", items: [{ productId: "prd_missing", quantity: 1 }] } } });
    assert.equal(result.comparisonComplete, false);
    assert.equal(result.savings90DayMinor, null);
    assert.equal(result.savingClaim, "none");
    assert.ok(result.unavailableReasons.some(reason => reason.reasonCode === "baseline_product_unavailable"));
  });
  it("requires an explicit daily dose for a comparison basket", () => {
    const result = buildEconomics({ coverage: [row], items: [basket(2)], snapshot,
      state: { ...state, baseline: { type: "current_basket", items: [{ productId: product.productId, quantity: 1 }] } } });
    assert.equal(result.savings90DayMinor, null);
    assert.equal(result.baseline.cash90DayMinor, null);
    assert.ok(result.unavailableReasons.some(reason => reason.reasonCode === "baseline_dose_unknown"));
  });
  it("does not count a continued product twice to claim savings", () => {
    const result = buildEconomics({ coverage: [{ ...row, currentAmount: 150, deliveredAmount: 150 }], items: [basket(1)], snapshot,
      state: { ...state, currentSupplements: [{ name: nutrient.name, supplementId: nutrient.supplementId, dailyAmount: 150, unit: "mg", productId: product.productId, daysRemaining: 30 }],
        baseline: { type: "current_basket", items: [{ productId: product.productId, quantity: 1, dailyServings: 1 }] } } });
    assert.equal(result.comparisonComplete, false);
    assert.equal(result.savings90DayMinor, null);
    assert.ok(result.unavailableReasons.some(reason => reason.reasonCode === "baseline_inventory_overlap"));
  });

});
