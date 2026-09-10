import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recommendWithMatcher } from "../lib/matcher/adapters/web.ts";
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import { executeTaskWorkItem } from "../lib/task-execution.ts";
import type { ProductCandidate, ProductRecommendationNeed, ProductRecommendationResult } from "../lib/product-recommendation-types.ts";

function need(name: string, weight = 1): ProductRecommendationNeed {
  return { id: name, sourceId: name, displayName: name, normalizedName: name, category: "Supplement", itemType: "supplement", weight,
    targetComparableAmount: 100000, targetText: "100 mg/day", targetDose: { amount: 100, unit: "mg", originalText: "100 mg/day" } };
}
function product(id: string, amounts: Record<string, number>, priceAmount = 10, retailer = "seller"): ProductCandidate {
  return { id, title: id, currency: "THB", priceAmount, productUrl: `https://example.test/${id}`, region: "TH", status: "approved", platform: "manual",
    availabilityStatus: "in_stock", availableCountryCodes: ["TH"], automatedSafetyPassed: false, labelStatus: "parsed", selectedRetailerOrganisationId: retailer,
    facts: Object.entries(amounts).map(([name, amount]) => ({ name, normalizedName: name, amount, comparableAmount: amount * 1000, unit: "mg", itemType: "supplement", confidence: "high" })) };
}

describe("web advisory matching boundaries", () => {
  it("M721-WORKER-01 equal-dose retailer selection prefers verified easier routines before price", async () => {
    setMatcherSafetyCeilings([]);
    try {
      const candidates = [product("ten-pills", { a: 10 }, 1, "cheap"), product("one-pill", { a: 100 }, 2, "easy")].map(row => ({ ...row,
        administration: { route: "oral", physicalUnit: "tablet", unitsPerServing: 1, doseIncrement: 1, packQuantity: 60,
          provenance: { status: "verified", sourceUrl: "https://example.test/label", sourceText: "one tablet serving", verifiedAt: "2026-09-08" } } as const }));
      const result = await executeTaskWorkItem({ taskType: "generate_product_recommendations", taskId: "fixture", planId: "fixture", countryCode: "TH", stackPreference: "balanced",
        clientSex: null, clientContext: { currentSupplements: "none" }, needs: [need("a")],
        retailerCandidateSets: candidates.map(row => ({ candidates: [row], organisationId: row.selectedRetailerOrganisationId!, organisationName: "Fixture", currency: "THB", dispatchCity: null, etaDate: null, productCount: 1, subtotalAmount: row.priceAmount! })) });
      const recommendations = (result as { recommendations: ProductRecommendationResult }).recommendations;
      assert.deepEqual(recommendations.recommendations.map(row => row.product.id), ["one-pill"]);
      assert.equal(recommendations.diagnostics.matching?.options[0]?.doseFit?.total, 0);
    } finally { resetMatcherSafetyCeilings(); }
  });
  it("counts all five requested targets with no offset for over-target delivery", () => {
    setMatcherSafetyCeilings([]);
    try {
      const result = recommendWithMatcher({ needs: [need("a", 100), need("b"), need("c"), need("d"), need("unresolved")],
        candidates: [product("four", { a: 110, b: 110, c: 110, d: 110 })], clientContext: { currentSupplements: "none" } });
      assert.equal(result.stackCoveragePercent, 80);
      assert.equal(result.diagnostics.matching?.options[0]?.coveragePercent, 80);
      assert.equal(result.diagnostics.unmatchedNeeds.find(row => row.id === "unresolved")?.coveragePercent, 0);
      const advice = result.diagnostics.matching?.options[0]?.advice.find(row => row.code === "target_exceeded");
      assert.equal(advice?.severity, "info");
      assert.equal(advice?.referenceDose?.amount, 100);
      assert.equal(advice?.referenceLimit, null, "an agreed target is not a medical limit");
      assert.equal(result.diagnostics.matchedNeeds[0]?.targetBasis, "supplemental");
    } finally { resetMatcherSafetyCeilings(); }
  });
  it("explains an increase above reported continued intake without inventing a target or medical limit", () => {
    setMatcherSafetyCeilings([]);
    try {
      const result = recommendWithMatcher({ needs: [need("a")], candidates: [product("combo", { a: 100, b: 5 })],
        clientContext: { continuedIntake: [{ subjectId: "b", name: "b", dailyAmount: 10, unit: "mg", sourceId: "reported-b" }], unknownIntakeSubjectIds: [] } });
      const advice = result.diagnostics.matching?.options[0]?.advice.find(row => row.code === "continued_dose_increased");
      assert.equal(advice?.severity, "info");
      assert.equal(advice?.amount, 15);
      assert.deepEqual(advice?.referenceDose, { amount: 10, unit: "mg", basis: "continued_dose" });
      assert.equal(advice?.referenceLimit, null);
      assert.equal(result.clientNeeds.some(row => row.displayName === "b"), false);
      assert.equal(result.diagnostics.matching?.options[0]?.doseFit?.total, 0.5);
      assert.match(typeof advice?.message === "string" ? advice.message : advice?.message.en ?? "", /not a medical limit or an agreed target/);
    } finally { resetMatcherSafetyCeilings(); }
  });
  it("preserves unverified form metadata without claiming a pill count and applies exclusions to all options", () => {
    setMatcherSafetyCeilings([]);
    try {
      const powder = { ...product("powder", { a: 100 }), matchingFacts: { form: "powder", dailyPillsPerServing: 0, dietarySource: "plant" as const, omegaSource: "none" as const } };
      const result = recommendWithMatcher({ needs: [need("a")], candidates: [powder, product("excluded", { a: 100 })],
        clientContext: { currentSupplements: "none", excludeProductIds: ["excluded"] } });
      assert.deepEqual(result.recommendations.map(row => row.product.id), ["powder"]);
      assert.equal(result.recommendations[0]?.product.matchingFacts?.form, "powder");
      assert.equal(result.diagnostics.matching?.options[0]?.dailyPills, null);
      assert.ok(result.diagnostics.matching?.options.every(option => !option.productIds.includes("excluded")));
    } finally { resetMatcherSafetyCeilings(); }
  });
  it("reports zero pills for verified oral powder administration while retaining exclusions", () => {
    setMatcherSafetyCeilings([]);
    try {
      const powder: ProductCandidate = { ...product("powder", { a: 100 }), administration: {
        route: "oral", physicalUnit: "g", unitsPerServing: 3.5, doseIncrement: 0.5, packQuantity: 105,
        provenance: { status: "verified", sourceUrl: "https://example.test/powder", sourceText: "Synthetic label: 100 mg a per measured 3.5 g powder serving, 105 g pack.", verifiedAt: "2026-09-07T00:00:00Z" }
      } };
      const result = recommendWithMatcher({ needs: [need("a")], candidates: [powder, product("excluded", { a: 100 })],
        clientContext: { currentSupplements: "none", excludeProductIds: ["excluded"] } });
      assert.deepEqual(result.recommendations.map(row => row.product.id), ["powder"]);
      assert.equal(result.recommendations[0]?.servingMultiplier, 1);
      assert.equal(result.stackCoveragePercent, 100);
      assert.equal(result.diagnostics.matching?.options[0]?.dailyPills, 0);
      assert.ok(result.diagnostics.matching?.options.every(option => !option.productIds.includes("excluded")));
    } finally { resetMatcherSafetyCeilings(); }
  });
  it("reports possible limit exposure even when the lower estimate endpoint determines the dose-fit penalty", () => {
    setMatcherSafetyCeilings([{ subjectId: "a", name: "a", maxAmount: 100, maxUnit: "mg" }]);
    try {
      const result = recommendWithMatcher({ needs: [need("a")], candidates: [product("small", { a: 10 })],
        clientContext: { ageYears: 40, lifestage: "adult", continuedIntake: [{ subjectId: "a", name: "a", dailyAmount: 50, minimumDailyAmount: 0, maximumDailyAmount: 100, unit: "mg", sourceId: "continued" }], estimatedIntakeSubjectIds: ["a"] } });
      const closest = result.diagnostics.matching?.options.find(option => option.roles?.includes("closest_dose"));
      assert.ok(closest, "The original dose-fit estimate remains an exposed purchase choice");
      const advice = closest.advice.find(row => row.code === "reference_limit_exceeded");
      assert.ok(advice, JSON.stringify(result.diagnostics.matching));
      assert.equal(advice.amountRange?.maximum, 120);
      assert.equal(advice.referenceLimit?.amount, 100);
      assert.ok((closest.doseFit?.perTarget[0]?.conservativeExposure ?? Infinity) < 100);
    } finally { resetMatcherSafetyCeilings(); }
  });
  it("keeps dose-fit ahead of price when the worker selects between retailers", async () => {
    setMatcherSafetyCeilings([]);
    try {
      const cheap = [product("cheap", { a: 180, b: 100 }, 1, "cheap-seller")];
      const exact = [product("a-exact", { a: 100 }, 100, "exact-seller"), product("b-exact", { b: 100 }, 100, "exact-seller")];
      const result = await executeTaskWorkItem({ taskType: "generate_product_recommendations", taskId: "fixture", planId: "fixture", countryCode: "TH", stackPreference: "balanced",
        clientSex: null, clientContext: { currentSupplements: "none" }, needs: [need("a"), need("b")],
        retailerCandidateSets: [cheap, exact].map(candidates => ({ candidates, organisationId: candidates[0]!.selectedRetailerOrganisationId!, organisationName: "Fixture", currency: "THB", dispatchCity: null, etaDate: null, productCount: candidates.length, subtotalAmount: candidates.reduce((sum, row) => sum + row.priceAmount!, 0) })) });
      const recommendations = (result as { recommendations: ProductRecommendationResult }).recommendations;
      assert.deepEqual(recommendations.recommendations.map(row => row.product.id).sort(), ["a-exact", "b-exact"]);
      assert.equal(recommendations.diagnostics.matching?.options[0]?.doseFit?.total, 0);
    } finally { resetMatcherSafetyCeilings(); }
  });
});
