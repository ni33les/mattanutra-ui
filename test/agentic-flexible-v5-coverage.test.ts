import assert from "node:assert/strict";
import { test } from "node:test";
import { matchPlan, requestedTargetCoverage } from "../lib/agentic/plan/matching.ts";
import { publicOption, publicPlanFields } from "../lib/agentic/public-mapper.ts";
import { recommendWithMatcher } from "../lib/matcher/adapters/web.ts";
import { coveredFormulaNeedCount, marketingCoveragePercentFromNeedCoverage } from "../lib/marketing-coverage.ts";
import { sampleRetailProduct, sampleValueSnapshot } from "./agentic/value/sample-catalogue.ts";
import type { CanonicalPlanState } from "../lib/agentic/plan/types.ts";

const snapshot = sampleValueSnapshot(), target = snapshot.supplements[1]!;
const product = sampleRetailProduct({ id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6", title: "Measured magnesium", name: target.name,
  supplementId: target.supplementId, amount: 50, unit: "mg", unitPriceMinor: 10000, form: "capsule", servingLabel: "1 capsule; 30 capsules per bottle" });
const state: CanonicalPlanState = { acceptedGaps: [], conditionCodes: [], currency: "THB", currentSupplements: [{ name: target.name,
  supplementId: target.supplementId, dailyAmount: 100, unit: "mg" }], destinationCountry: "TH", leftovers: [], locale: "en", medicationCodes: [],
  optimization: "balanced", pinnedCandidateKey: null, profile: { ageYears: 35, lifeStage: "adult" },
  requirements: { productDoses: [{ productId: product.productId, servingsPerDay: 1 }] }, safetyAcknowledgement: null,
  targets: [{ name: target.name, supplementId: target.supplementId, amount: 200, unit: "mg" }] };

test("COVERAGE5-01 target200 current100 new50 remains75 percent and gap50 in every public view", () => {
  const result = matchPlan({ state, snapshot: { ...snapshot, products: [product] } });
  assert.ok(result.selected);
  const published = publicOption(result.selected, result.selected);
  assert.equal(result.selected.coveragePercent, 75);
  assert.equal(published.coveragePercent, 75);
  assert.equal(published.coverage[0]?.coveragePercent, 75);
  assert.equal(published.coverage[0]?.remainingGap, 50);
  assert.equal(published.coverage[0]?.currentAmount, 100);
  assert.equal(published.coverage[0]?.deliveredAmount, 50);
  assert.deepEqual(published.coverageSummary, { coveragePercent: 75, fullyMetCount: 0, requestedCount: 1 });
  const plan = publicPlanFields({ ...result, basket: result.selected.basket, coverage: result.selected.coverage,
    changeSummary: [], questions: [], safetyGuidance: result.selected.safety?.guidance ?? [], status: "ready", summary: "Ready" }) as {
      options: { coveragePercent: number; coverage: { remainingGap: number }[] }[] };
  assert.equal(plan.options[0]?.coveragePercent, 75);
  assert.equal(plan.options[0]?.coverage[0]?.remainingGap, 50);
  const candidate = { ...product.candidate, priceAmount: 100, unitPriceAmount: 100 };
  const web = recommendWithMatcher({ candidates: [candidate], needs: [{ id: "magnesium", sourceId: "magnesium", displayName: "Magnesium",
    normalizedName: "magnesium", category: "Supplement", itemType: "supplement", weight: 1, targetComparableAmount: 200000,
    targetText: "200 mg", targetDose: { amount: 200, unit: "mg", originalText: "200 mg" } }],
    productDoses: [{ productId: candidate.id, servingsPerDay: 1 }], clientContext: { continuedIntake: [{ name: "Magnesium", subjectId: "magnesium", dailyAmount: 100, unit: "mg", sourceId: "customer-current" }] } });
  assert.equal(web.stackCoveragePercent, 75);
});

test("COVERAGE5-02 four fully met targets plus one unresolved target remain80 percent", () => {
  const rows = [0, 1, 2, 3].map(() => ({ coveragePercent: 100, status: "over_target" }));
  rows.push({ coveragePercent: 0, status: "uncovered" });
  assert.deepEqual(requestedTargetCoverage(rows), { coveredCount: 4, requestedCount: 5, coveragePercent: 80 });
  assert.equal(marketingCoveragePercentFromNeedCoverage(rows), 80);
});

test("COVERAGE5-03 a99.9 percent match remains partial and never counts as fully met", () => {
  const partial = { ...product, candidate: { ...product.candidate, facts: product.candidate.facts.map(fact => ({ ...fact, amount: 99.9 })) } };
  const result = matchPlan({ state: { ...state, currentSupplements: [], targets: [{ ...state.targets[0], amount: 100 }] }, snapshot: { ...snapshot, products: [partial] } });
  assert.ok(result.selected);
  const published = publicOption(result.selected, result.selected);
  assert.equal(published.coveragePercent, 99.9);
  assert.equal(published.coverage[0]?.coveragePercent, 99.9);
  assert.equal(published.coverage[0]?.status, "partial");
  assert.deepEqual(published.coverageSummary, { coveragePercent: 99.9, fullyMetCount: 0, requestedCount: 1 });
  assert.equal(coveredFormulaNeedCount([{ coveragePercent: 99.9 }]), 0);
  assert.equal(marketingCoveragePercentFromNeedCoverage([{ coveragePercent: 99.9 }]), 99.9);
});
