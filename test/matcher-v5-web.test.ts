import assert from "node:assert/strict";
import { test } from "node:test";
import { recommendWithMatcher } from "../lib/matcher/adapters/web.ts";
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
test("WEB5-02 explicit zero and one ceilings are preserved", () => {
 assert.equal(recommendWithMatcher({ needs, candidates: names.map(n => candidate(n)), maxProducts: 0 }).recommendations.length, 0);
 assert.equal(recommendWithMatcher({ needs, candidates: names.map(n => candidate(n)), maxProducts: 1 }).recommendations.length, 1);
});
test("WEB5-03 legacy entry point uses shared advisory matcher without capping at six", () => {
 assert.equal(recommendProductStackV2({ needs, candidates: names.map(n => candidate(n)) }).recommendations.length, 8);
});
test("WEB5-04 supported quantities above three and below one survive web projection", () => {
 const four = recommendWithMatcher({ needs: [needs[0]], candidates: [candidate(names[0], 25)] });
 assert.equal(four.recommendations[0]?.servingMultiplier, 4);
 const double = candidate(names[0], 200);
 const half = recommendWithMatcher({ needs: [needs[0]], candidates: [{ ...double, administration: { ...double.administration!, unitsPerServing: 2 } }] });
 assert.equal(half.recommendations[0]?.servingMultiplier, 0.5);
 assert.equal(half.stackCoveragePercent, 100);
 assert.equal(toRecommendedProduct(half.recommendations[0], 100, "run").servingMultiplier, 0.5);
});
