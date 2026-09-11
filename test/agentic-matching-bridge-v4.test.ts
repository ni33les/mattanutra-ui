import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MAX_PRODUCT_COUNT, REQUIREMENTS_SCHEMA } from "../lib/agentic/contract/schemas.ts";
import { coverageFor, matchPlan, toCanonicalRequest } from "../lib/agentic/plan/matching.ts";
import type { CanonicalPlanState } from "../lib/agentic/plan/types.ts";
import { sampleRetailProduct, sampleValueSnapshot } from "./agentic/value/sample-catalogue.ts";

const snapshot = sampleValueSnapshot();
const d3 = snapshot.supplements[2]!;
const state: CanonicalPlanState = { acceptedGaps: [], conditionCodes: [], currency: "THB", currentSupplements: [], destinationCountry: "TH", leftovers: [], locale: "en", medicationCodes: ["apixaban"], optimization: "lowest_cost", pinnedCandidateKey: null, profile: { ageYears: 35, lifeStage: "adult" }, requirements: {}, safetyAcknowledgement: null, targets: [{ name: d3.name, supplementId: d3.supplementId, amount: 1000, unit: "IU" }] };
function options(unknownDuration = false) {
  const make = (id: string, price: number, omega: boolean) => sampleRetailProduct({ id, title: `D3 ${id}`, name: d3.name, supplementId: d3.supplementId, amount: 1000, unit: "IU", unitPriceMinor: price, form: "capsule", servingLabel: unknownDuration ? "1 capsule" : "1 capsule; 30 capsules per bottle", ...(omega ? { extraFacts: [{ name: "Omega-3", supplementId: "sup_omega3", normalizedName: "omega-3", amount: 1000, unit: "mg", confidence: "high" as const, itemType: "supplement" as const }] } : {}) });
  return matchPlan({ state, snapshot: { ...snapshot, products: [make("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1", 10000, true), make("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2", 11000, false)] } });
}
describe("v4 matching bridge financial and coverage consistency", () => {
  it("keeps small requested contributions and every requested fact in coverage", () => {
    const extra = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu"].map(name => ({ name: `Measured ${name}`, supplementId: `measured_${name}`,
      normalizedName: `measured ${name}`, amount: 1, unit: "mg" as const, confidence: "high" as const, itemType: "supplement" as const }));
    const product = sampleRetailProduct({ id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4", title: "D3 with measured micronutrients", name: d3.name,
      supplementId: d3.supplementId, amount: 1000, unit: "IU", unitPriceMinor: 10000, form: "capsule", servingLabel: "1 capsule; 30 capsules per bottle", extraFacts: extra });
    const result = matchPlan({ state: { ...state, medicationCodes: [], targets: [...state.targets,
      ...extra.map((fact, index) => ({ name: fact.name, supplementId: fact.supplementId, amount: index === 0 ? 1_000_000 : 100, unit: fact.unit }))] }, snapshot: { ...snapshot, products: [product] } });
    assert.ok(result.selected);
    const item = result.selected.basket[0]!;
    assert.equal(item.servingsPerDay, 1);
    assert.equal(item.requestedNutrients?.length, 14);
    for (const fact of extra) {
      const coverage = result.selected.coverage.find(row => row.supplementId === fact.supplementId)!;
      assert.equal(coverage.deliveredAmount, 1);
      assert.equal(coverage.coveragePercent, Math.round(100 / coverage.requestedAmount));
      assert.equal(coverage.status, "partial");
      assert.equal(result.selected.doseFit?.perTarget.find(row => row.subjectId === fact.supplementId)?.exposure, coverage.deliveredAmount);
    }
  });
  it("uses the published default product count in the actual canonical request", () => {
    const request = toCanonicalRequest(state); assert.ok(!("error" in request));
    assert.equal(request.maxProductCount, DEFAULT_MAX_PRODUCT_COUNT);
    assert.equal(request.maxProductCount, REQUIREMENTS_SCHEMA.properties.maxProductCount.default);
    const explicit = toCanonicalRequest({ ...state, requirements: { maxProductCount: 8 } });
    assert.ok(!("error" in explicit)); assert.equal(explicit.maxProductCount, 8);
  });
  it("does not promote 89.6 percent to covered through display rounding", () => {
    const mag = snapshot.supplements[1]!;
    const before = { ...state, targets: [{ name: mag.name, supplementId: mag.supplementId, amount: 250, unit: "mg" as const }], currentSupplements: [{ name: mag.name, supplementId: mag.supplementId, dailyAmount: 224, unit: "mg" as const }] };
    assert.equal(coverageFor(before, null)[0]!.status, "gap");
    assert.equal(coverageFor({ ...before, currentSupplements: [{ ...before.currentSupplements[0]!, dailyAmount: 225 }] }, null)[0]!.status, "gap");
    assert.equal(coverageFor({ ...before, currentSupplements: [{ ...before.currentSupplements[0]!, dailyAmount: 250 }] }, null)[0]!.status, "already_covered");
  });
  it("compares complete option cash schedules including both deliveries", () => {
    const result = options(); assert.ok(result.selected); assert.equal(result.alternatives.length, 1);
    assert.equal(result.selected.economics?.cash90DayMinor, 40000);
    assert.equal(result.alternatives[0]!.economics?.cash90DayMinor, 43000);
    assert.equal(result.alternatives[0]!.tradeOff?.cash90DayDeltaMinor, 3000);
  });
  it("surfaces an increase above known continued intake as advisory reference evidence", () => {
    const mag = snapshot.supplements[1]!;
    const product = sampleRetailProduct({ id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3", title: "D3 with magnesium", name: d3.name, supplementId: d3.supplementId, amount: 1000, unit: "IU", unitPriceMinor: 10000, form: "capsule", servingLabel: "1 capsule; 30 capsules per bottle", extraFacts: [{ name: mag.name, supplementId: mag.supplementId, amount: 50, unit: "mg", normalizedName: "magnesium", confidence: "high", itemType: "supplement" }] });
    const result = matchPlan({ state: { ...state, currentSupplements: [{ name: mag.name, supplementId: mag.supplementId, dailyAmount: 100, unit: "mg", daysRemaining: 90 }] }, snapshot: { ...snapshot, products: [product] } });
    assert.ok(result.selected);
    const advice = result.selected.safety?.guidance.find(item => item.code === "continued_dose_increased");
    assert.ok(advice);
    assert.equal(advice.action, "review"); assert.equal(advice.referenceBasis, "continued_dose");
    assert.equal(advice.threshold, 100); assert.equal(advice.exposure, 150);
    assert.match(advice.message, /100.*150/);
    assert.ok(advice.contributors.some(item => item.source === "selected" && item.amount === 50));
    assert.ok(advice.uncertaintyCodes?.includes("continued_dose_is_not_medical_limit"));
  });
  it("leaves the cash difference unavailable when a pack duration is unknown", () => {
    const result = options(true); assert.ok(result.selected); assert.equal(result.alternatives.length, 1);
    assert.equal(result.selected.economics?.cash90DayMinor, null);
    assert.equal(result.alternatives[0]!.tradeOff?.cash90DayDeltaMinor, null);
  });
});
