import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverageFor, matchPlan, toCanonicalRequest } from "../lib/agentic/plan/matching.ts";
import { normalizePlanRequest, planRematchFingerprint } from "../lib/agentic/plan/normalize.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { publicCoverage, publicOption } from "../lib/agentic/public-mapper.ts";
import { sampleRetailProduct, sampleValueSnapshot } from "./agentic/value/sample-catalogue.ts";
import type { CanonicalPlanState } from "../lib/agentic/plan/types.ts";
const snapshot = sampleValueSnapshot(), target = snapshot.supplements[1]!;
const state: CanonicalPlanState = { acceptedGaps: [], conditionCodes: [], currency: "THB", currentSupplements: [], destinationCountry: "TH", leftovers: [], locale: "en", medicationCodes: [], optimization: "balanced", pinnedCandidateKey: null, profile: { ageYears: 35, lifeStage: "adult" }, requirements: {}, safetyAcknowledgement: null, targets: [{ name: target.name, supplementId: target.supplementId, amount: 100, unit: "mg" }] };
const baseProduct = sampleRetailProduct({ id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5", title: "Magnesium measured fixture", name: target.name, supplementId: target.supplementId, amount: 200, unit: "mg", unitPriceMinor: 10000, form: "capsule", servingLabel: "2 capsules; 60 capsules per bottle" });
const product = { ...baseProduct, dailyPills: 2, candidate: { ...baseProduct.candidate, administration: { ...baseProduct.candidate.administration!, unitsPerServing: 2 } } };

describe("v5 MCP bridge preserves evaluated doses and conversation identity", () => {
  it("does not floor or clamp one physical capsule from a two-capsule labelled serving", () => {
    const result = matchPlan({ state, snapshot: { ...snapshot, products: [product] } });
    assert.ok(result.selected); assert.equal(result.selected.basket[0].servingsPerDay, 0.5);
    assert.equal(result.selected.basket[0].dailyPills, 1); assert.equal(result.selected.coverage[0].deliveredAmount, 100);
    assert.equal(result.selected.doseFit?.perTarget[0].exposure, 100);
  });
  it("retains a selectable nonempty fallback when overdose makes an empty basket the closest fit", () => {
    const result = matchPlan({ state: { ...state, targets: [{ ...state.targets[0], amount: 30 }] }, snapshot: { ...snapshot, products: [product] } });
    assert.equal(result.selected?.basket.length, 0);
    assert.ok(result.alternatives.some(option => option.purchaseEligible && option.basket.length && option.roles?.includes("purchase_fallback")));
  });
  it("canonicalizes range units and rejects a range that does not contain its target", async () => {
    const request = { locale: "en", destinationCountry: "TH", optimization: "balanced", profile: {}, requirements: {}, targets: [{ name: target.name, amount: 100, unit: "mg", acceptableRange: { minimum: 0.09, maximum: 0.11, unit: "g" } }] };
    const normalized = await normalizePlanRequest({ request, snapshot, config: loadAgenticConfig() });
    assert.ok(!("error" in normalized)); const canonical = toCanonicalRequest(normalized.state); assert.ok(!("error" in canonical));
    assert.equal(canonical.targets[0].acceptableMinimum, 90); assert.equal(canonical.targets[0].acceptableMaximum, 110);
    const bad = await normalizePlanRequest({ request: { ...request, targets: [{ ...request.targets[0], acceptableRange: { minimum: 0.101, maximum: 0.11, unit: "g" } }] }, snapshot, config: loadAgenticConfig() });
    assert.ok("error" in bad); assert.equal(bad.error.fieldPath, "request.targets[0].acceptableRange");
  });
  it("reports the same current, new and remaining quantities without inventing total certainty", () => {
    const withCurrent = { ...state, currentSupplements: [{ name: target.name, supplementId: target.supplementId, dailyAmount: 100, unit: "mg" as const }], targets: [{ ...state.targets[0], amount: 200 }] };
    const row = coverageFor(withCurrent, null, [{ requestedNutrients: [{ name: target.name, amount: 50, unit: "mg" }], productId: product.productId, productName: "Measured fixture" } as never])[0]!;
    const output = publicCoverage(row); assert.equal(output.currentAmount, 100); assert.equal(output.deliveredAmount, 50); assert.equal(output.coveragePercent, 75); assert.equal(output.remainingGap, 50); assert.equal(output.quantifiedExposureAmount, 150);
  });
  it("includes quantities and search effort in matching identity", () => {
    assert.notEqual(planRematchFingerprint(state), planRematchFingerprint({ ...state, searchEffort: "expanded" }));
    assert.notEqual(planRematchFingerprint(state), planRematchFingerprint({ ...state, requirements: { productDoses: [{ productId: product.productId, servingsPerDay: 0.5 }] } }));
  });
  it("keeps unverified label evidence visible without inventing pill counts or blocking purchase", () => {
    const uncertain = { ...product, dailyPills: 0, form: "unknown", candidate: { ...product.candidate, administration: null, facts: product.candidate.facts.map(fact => ({ ...fact, confidence: "moderate" as const, sourceUrl: "https://fixture.example/unverified-label", sourceText: "Unverified reported label" })) } };
    const result = matchPlan({ state: { ...state, requirements: { productDoses: [{ productId: uncertain.productId, servingsPerDay: 1 }] } }, snapshot: { ...snapshot, products: [uncertain] } });
    assert.ok(result.selected); const output = publicOption(result.selected, result.selected);
    assert.equal(output.purchaseEligible, true); assert.equal(output.basket[0].dailyPills, null);
    assert.equal(output.basket[0].labelledFacts[0].confidence, "moderate");
    assert.equal(output.basket[0].labelledFacts[0].sourceUrl, "https://fixture.example/unverified-label");
    assert.ok(output.advice?.some(advice => advice.code === "unverified_product_facts" && advice.action === "review"));
  });

});
