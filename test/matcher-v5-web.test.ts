import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeWebRetailerAlternatives, recommendWithMatcher } from "../lib/matcher/adapters/web.ts";
import { matcherSafetyCeilings, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import { PRODUCT_STACK_VARIANT_CONFIGS } from "../lib/product-stack-preferences.ts";
import { recommendProductStackV2 } from "../lib/product-recommendations.ts";
import { toRecommendedProduct } from "../lib/product-recommendation-output.ts";
import type { ProductCandidate, ProductRecommendationNeed } from "../lib/product-recommendation-types.ts";
const names = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
const needs: ProductRecommendationNeed[] = names.map(name => ({ id: name, sourceId: name, displayName: name, normalizedName: name, category: "Supplement", itemType: "supplement", weight: 1, targetComparableAmount: 100000, targetText: "100 mg", targetDose: { amount: 100, unit: "mg", originalText: "100 mg" } }));
function candidate(name: string, amount = 100): ProductCandidate {
 return { id: name, title: name, platform: "manual", productUrl: `https://fixture.example/${name}`, region: "TH", currency: "THB", status: "approved", availabilityStatus: "in_stock", labelStatus: "parsed", automatedSafetyPassed: false, priceAmount: 1,
   administration: { route: "oral", physicalUnit: "capsule", unitsPerServing: 1, doseIncrement: 1, packQuantity: 30, provenance: { status: "verified", sourceUrl: "https://fixture.example/label", sourceText: "1 capsule serving; 30 capsules", verifiedAt: "2026-09-07" } },
   facts: [{ name, normalizedName: name, amount, comparableAmount: amount * 1000, unit: "mg", itemType: "supplement", confidence: "high" }] };
}
test("WEB5-01 compact and balanced have no imposed product count or target-three preference", () => {
 for (const config of PRODUCT_STACK_VARIANT_CONFIGS) { assert.equal(config.maxProducts, null); assert.equal("targetProducts" in config, false); }
 for (const stackPreference of ["compact", "balanced"] as const) {
  const result = recommendWithMatcher({ needs, candidates: names.map(n => candidate(n)), stackPreference, clientContext: { currentSupplements: "none" } });
  assert.equal(result.recommendations.length, 8);
  assert.equal(result.stackCoveragePercent, 100);
 }
});
test("WEB5-02 explicit zero and one preferences do not hide complete eight-product choices", () => {
 for (const maxProducts of [0, 1]) {
  const result = recommendWithMatcher({ needs, candidates: names.map(n => candidate(n)), maxProducts });
  const exact = result.diagnostics.matching!.options.find(option => option.roles?.includes("closest_dose"));
  assert.ok(exact); assert.equal(exact.productIds.length, 8); assert.equal(exact.coveragePercent, 100); assert.equal(exact.purchaseEligible, true);
  assert.ok(result.recommendations.length < 8, "Numerical preferences influence the recommendation without excluding the eight-product choice");
 }
});
test("WEB5-03 legacy entry point uses shared advisory matcher without capping at six", () => {
 assert.equal(recommendProductStackV2({ needs, candidates: names.map(n => candidate(n)) }).recommendations.length, 8);
});
test("WEB5-04 supported quantities above three and below one survive web projection", () => {
 const four = recommendWithMatcher({ needs: [needs[0]], candidates: [candidate(names[0], 25)] });
 assert.equal(four.diagnostics.matching!.options.find(option => option.roles?.includes("closest_dose"))?.dailyServings[0], 4);
 const double = candidate(names[0], 200);
 const half = recommendWithMatcher({ needs: [needs[0]], candidates: [{ ...double, administration: { ...double.administration!, unitsPerServing: 2 } }] });
 assert.equal(half.recommendations[0]?.servingMultiplier, 0.5);
 assert.equal(half.stackCoveragePercent, 100);
 assert.equal(toRecommendedProduct(half.recommendations[0], 100, "run").servingMultiplier, 0.5);
});
test("WEB5-05 web results retain the task catalogue identity for nonempty and empty evaluations", () => {
 for (const candidates of [[candidate(names[0])], []]) {
  const result = recommendWithMatcher({ needs: [needs[0]], candidates, catalogueFingerprint: "valsnap_fixture_current" });
  assert.equal(result.diagnostics.catalogueFingerprint, "valsnap_fixture_current");
 }
});

test("WEB6-01 preferences disclose count, pills and goods deltas without hiding purchase options", () => {
 const result = recommendWithMatcher({ needs, candidates: names.map(n => candidate(n)), maxProducts: 2, budgetAmount: 2, clientContext: { pillLimit: "2", currentSupplements: "none" } });
 const matching = result.diagnostics.matching!;
 assert.equal(matching.operationalStatus, "ready");
 const selected = matching.options.find(option => option.roles?.includes("closest_dose"))!;
 assert.equal(selected.productIds.length, 8);
 assert.equal(selected.doseFit?.total, 0);
 assert.equal(selected.purchaseEligible, true);
 assert.deepEqual(selected.preferences?.map(row => [row.kind, row.preferred, row.actual, row.delta, row.prominent]), [
  ["product_count", 2, 8, 6, true], ["daily_pills", 2, 8, 6, true], ["first_order_goods_price", 200, 800, 600, true]
 ]);
 const unknown = recommendWithMatcher({ needs: [needs[0]], candidates: [{ ...candidate(names[0]), administration: null }], clientContext: { pillLimit: "1" } });
 const option = unknown.diagnostics.matching!.options.find(option => option.purchaseEligible)!;
 assert.equal(option.purchaseEligible, true);
 assert.equal(option.dailyPills, null);
 const pills = option.preferences!.find(row => row.kind === "daily_pills")!;
 assert.equal(pills.status, "unknown"); assert.equal(pills.actual, null); assert.equal(pills.delta, null); assert.equal(pills.prominent, false);
});

test("WEB6-02 useful commercial alternatives remain visible when health-concern search is not needed", () => {
 const priorLimits = matcherSafetyCeilings();
 setMatcherSafetyCeilings([{ subjectId: "alpha", name: "alpha", maxAmount: 1000, maxUnit: "mg", sourceScope: "supplemental" }]);
 try {
 const context = { currentSupplements: "none", ageYears: 40, lifestage: "adult", profileKnown: { ageYears: true, lifeStage: true, sex: true } };
 const input = { needs: [needs[0]], clientContext: context };
 const primary = recommendWithMatcher({ ...input, candidates: [{ ...candidate(names[0]), id: "exact", priceAmount: 10 }] });
 const peer = recommendWithMatcher({ ...input, candidates: [{ ...candidate(names[0], 80), id: "cheaper", priceAmount: 1 }] });
 assert.equal(primary.diagnostics.matching?.alternativeSearch?.status, "not_needed");
 const merged = mergeWebRetailerAlternatives(primary, [peer]);
 assert.equal(merged.diagnostics.matching?.selectedCandidateKey, primary.diagnostics.matching?.selectedCandidateKey);
 assert.deepEqual(merged.recommendations.map(row => row.product.id), ["exact"]);
 assert.ok(merged.diagnostics.matching?.options.some(option => option.productIds[0] === "cheaper" && option.roles?.includes("lower_cost")));
 assert.equal(merged.diagnostics.matching?.options.find(option => option.productIds[0] === "cheaper")?.coveragePercent, 80);
 } finally { setMatcherSafetyCeilings(priorLimits); }
});

test("WEB6-03 a better retailer trade-off removes an outclassed unlabelled option and preserves the selected dose", () => {
 const priorLimits = matcherSafetyCeilings();
 setMatcherSafetyCeilings([{ subjectId: "alpha", name: "alpha", maxAmount: 1000, maxUnit: "mg", sourceScope: "supplemental" }]);
 try {
 const input = { needs: [needs[0]], clientContext: { currentSupplements: "none", ageYears: 40, lifestage: "adult", profileKnown: { ageYears: true, lifeStage: true, sex: true } } };
 const primary = recommendWithMatcher({ ...input, candidates: [
  { ...candidate("alpha"), id: "exact", priceAmount: 10 },
  { ...candidate("alpha", 80), id: "earlier-cheaper", priceAmount: 5 }
 ] });
 const peer = recommendWithMatcher({ ...input, candidates: [{ ...candidate("alpha", 80), id: "better-cheaper", priceAmount: 1 }] });
 const before = primary.diagnostics.matching!;
 assert.ok(before.options.some(option => option.productIds.includes("earlier-cheaper") && option.roles?.includes("lower_cost")));
 const selectedBefore = before.options.find(option => option.candidateKey === before.selectedCandidateKey)!;
 const merged = mergeWebRetailerAlternatives(primary, [peer]);
 const after = merged.diagnostics.matching!;
 assert.equal(after.selectedCandidateKey, before.selectedCandidateKey);
 assert.deepEqual(merged.recommendations, primary.recommendations);
 const selectedAfter = after.options.find(option => option.candidateKey === after.selectedCandidateKey)!;
 assert.ok(selectedAfter.roles?.includes("closest_dose"));
 assert.equal(selectedAfter.priceMinor, 1000);
 assert.deepEqual(selectedAfter.dailyServings, selectedBefore.dailyServings);
 assert.deepEqual(selectedAfter.doseFit, selectedBefore.doseFit);
 assert.equal(after.options.some(option => option.productIds.includes("earlier-cheaper")), false);
 assert.ok(after.options.every(option => option.roles?.length));
 const cheaper = after.options.find(option => option.productIds.includes("better-cheaper"))!;
 assert.ok(cheaper.roles?.includes("lower_cost"));
 assert.equal(cheaper.priceMinor, 100); assert.equal(cheaper.coveragePercent, 80);
 assert.deepEqual(cheaper.dailyServings, [1]);
 } finally { setMatcherSafetyCeilings(priorLimits); }
});
