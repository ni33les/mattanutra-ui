import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../../lib/matcher/index.ts";
import { canonicalizeCurrents, canonicalizeTargets, canonicalTargetSetHash } from "../../lib/matcher/canonicalizer.ts";
import { compileGroups, productHitsCoverageFloor } from "../../lib/matcher/candidates.ts";
import { DEFAULT_MATCHER_CONFIG } from "../../lib/matcher/config.ts";
import { dominatesAtLayer } from "../../lib/matcher/dominance.ts";
import { searchGroups, seedState, tryAddVariant } from "../../lib/matcher/search.ts";
import { compareDoseFit, doseFitScore } from "../../lib/matcher/dose-fit.ts";
import { scaleAmount } from "../../lib/matcher/dose.ts";
import { safetyCeilingFor } from "../../lib/matcher/safety-ceilings.ts";
import { optionIdFor } from "../../lib/matcher/explainer.ts";
import { hasFewerConcerns, materiallyDifferent } from "../../lib/matcher/selector.ts";
import type { CanonicalRequest, MatcherProduct, ScoredBasket } from "../../lib/matcher/types.ts";

function request(overrides: Partial<CanonicalRequest> = {}): CanonicalRequest {
  return { acceptedGapSubjectIds: [], allowedForms: null, conditionCodes: [], currency: "THB",
    currentSupplements: [], destinationCountry: "TH", dietaryPreference: "any", excludeSubjectIds: [], leftovers: [],
    maxDailyPills: 6, maxPriceMinor: null, maxProductCount: 4, medicationCodes: [], omega3SourcePreference: "any",
    optimization: "lowest_cost", profile: { ageYears: 38, lifeStage: "adult" }, retainProductIds: [], retainSubjectIds: [],
    safetyCeilings: [{ subjectId: "a", name: "A", maxAmount: 200, maxUnit: "mg" }, { subjectId: "b", name: "B", maxAmount: 200, maxUnit: "mg" }],
    selectorMode: "agentic", targets: canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100, unit: "mg" }] }).targets, ...overrides };
}

function product(id: string, a: number, b = 0, price = 10, extra: Partial<MatcherProduct> = {}): MatcherProduct {
  return { productId: id, sellerId: "seller", sellerName: "Seller", retailerSku: id, title: id, source: "fixture",
    currency: "THB", unitPriceMinor: price, form: "capsule", dailyPillsPerServing: 1, productAudience: "both",
    availableCountryCodes: ["TH"], dietarySource: "any", omegaSource: "none", imageUrl: null,
    orderable: true, status: "approved", stockStatus: "in_stock", incompleteCommercialFacts: false,
    prenatalOrFertility: false, unknownSafetyAmount: false, contributionSubjectIds: ["a", ...(b ? ["b"] : [])],
    labelledContributions: [{ subjectId: "a", name: "A", amount: a, unit: "mg" },
      ...(b ? [{ subjectId: "b", name: "B", amount: b, unit: "mg" }] : [])], ...extra };
}

function run(r: CanonicalRequest, products: MatcherProduct[]) {
  return match(r, { catalogueVersion: "advisory-test", availabilityAsOf: "2026-01-01T00:00:00Z", products });
}

function exposure(a: number, b = 0) {
  return new Map([["a", BigInt(Math.round(a * 1e6))], ["b", BigInt(Math.round(b * 1e6))]]);
}

describe("advisory dose fit", () => {
  it("canonicalizes repeated nutrient intake ranges independently of submission order", () => {
    const make = (reverse: boolean) => {
      const rows = [
        { subjectId: "a", name: "A", dailyAmount: 20, minimumDailyAmount: 10, maximumDailyAmount: 30, unit: "mg" as const },
        { subjectId: "a", name: "A", dailyAmount: 20, minimumDailyAmount: 5, maximumDailyAmount: 35, unit: "mg" as const }
      ];
      if (reverse) rows.reverse();
      const currents = canonicalizeCurrents(rows.map((row, index) => ({ ...row, sourceId: `source:${index}` })));
      assert.ok(!("error" in currents)); if ("error" in currents) throw Error(currents.error);
      return request({ currentSupplements: currents, dietaryIntake: currents });
    };
    assert.equal(canonicalTargetSetHash(make(false)), canonicalTargetSetHash(make(true)));
  });

  it("keeps clinical kidney caution separate from the numerical population limit", () => {
    const r = request({ conditionCodes: ["ckd"], targets: canonicalizeTargets({ targets: [
      { subjectId: "mag", name: "Magnesium", amount: 100, unit: "mg" }
    ] }).targets, safetyCeilings: [{ subjectId: "mag", name: "Magnesium", maxAmount: 350, maxUnit: "mg" }] });
    const p = product("mag", 100, 0, 10, { contributionSubjectIds: ["mag"], labelledContributions: [
      { subjectId: "mag", name: "Magnesium", amount: 100, unit: "mg" }
    ] });
    assert.equal(safetyCeilingFor(r.safetyCeilings!, { conditionCodes: r.conditionCodes, name: "Magnesium", subjectId: "mag", profile: r.profile })?.maxAmount, 350);
    const selected = run(r, [p]).selected;
    assert.ok(selected);
    assert.equal(selected.optionRole, "requested_objective");
    assert.equal(selected.safety.hardBlocked, false);
    const advice = selected.safety.findings.find(item => item.code === "condition_review_required");
    assert.equal(advice?.severity, "high");
    assert.equal(advice?.thresholdUnits, null);
    assert.equal(advice?.comparator, null);
    assert.ok(advice?.exposureUnits && advice.exposureUnits > 0n);
  });

  it("reports factual coverage for a collateral-heavy product without a title veto", () => {
    const r = request({ profile: { ageYears: 58, lifeStage: "adult" } });
    const labelled = product("multi", 120, 0, 10, { title: "Multivitamins for 50+", labelledContributions: [
      { subjectId: "a", name: "A", amount: 120, unit: "mg" },
      { subjectId: "b", name: "B", amount: 20, unit: "mg" }
    ] });
    assert.equal(productHitsCoverageFloor(labelled, r, r.targets[0]!), true);
    assert.equal(productHitsCoverageFloor(labelled, { ...r, excludeProductIds: ["multi"] }, r.targets[0]!), false);
    assert.equal(productHitsCoverageFloor({ ...labelled, stockStatus: "unavailable" }, r, r.targets[0]!), false);
  });

  it("penalizes equal under/over proportions equally, starting at the exact target", () => {
    const r = request();
    assert.equal(compareDoseFit(doseFitScore(r, exposure(80)), doseFitScore(r, exposure(120))), 0);
    assert.equal(doseFitScore(r, exposure(100)).total, 0);
    assert.ok(compareDoseFit(doseFitScore(r, exposure(100.000001)), doseFitScore(r, exposure(100))) > 0);
    assert.equal(doseFitScore(r, exposure(120)).over, 0.2);
  });

  it("publishes finite ratios when an exact broad-request sum exceeds Number integer range", () => {
    const inputs = Array.from({ length: 50 }, (_, index) => ({ subjectId: `s${index}`, name: `N${index}`,
      amount: 100_000_000_001 + index * 137, unit: "mg" as const }));
    const targets = canonicalizeTargets({ targets: inputs }).targets;
    assert.equal(targets.length, 50);
    const r = request({ targets, safetyCeilings: [] });
    const score = doseFitScore(r, new Map(inputs.map(target => [target.subjectId, BigInt(1_000_000)])));
    const independent = inputs.reduce((sum, target) => sum + (target.amount - 1) / target.amount, 0);
    assert.equal(Number.isFinite(score.total), true);
    assert.ok(Math.abs(score.total - independent) < 1e-12);
    assert.equal(typeof JSON.parse(JSON.stringify(score)).total, "number");
    assert.ok(compareDoseFit(score, doseFitScore(r, new Map())) < 0);
  });

  it("uses total daily targets for food plus supplements and preserves supplemental targets", () => {
    const current = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 10, unit: "mg", sourceId: "continued" }]);
    const diet = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 40, unit: "mg", sourceId: "diet" }]);
    assert.ok(!("error" in current) && !("error" in diet)); if ("error" in current || "error" in diet) return;
    const products = [product("fifty", 50, 0, 1), product("ninety", 90, 0, 10)];
    const make = (basis: "total_daily" | "supplemental") => request({ safetyCeilings: [], currentSupplements: current, dietaryIntake: diet,
      maxDailyPills: 1, targets: canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100, unit: "mg", basis }] }).targets });
    for (const basis of ["total_daily", "supplemental"] as const) {
      for (const config of [DEFAULT_MATCHER_CONFIG, { ...DEFAULT_MATCHER_CONFIG, exactGroupLimit: 0, exactVariantLimit: 0 }]) {
        const result = match(make(basis), { products, availabilityAsOf: "frozen", catalogueVersion: "frozen" }, config);
        assert.deepEqual(result.selected?.productIds, [basis === "total_daily" ? "fifty" : "ninety"]);
        assert.equal(result.selected?.doseFit?.total, 0);
        assert.equal(result.selected?.doseFit?.perTarget[0]?.basis, basis);
        assert.equal(result.selected?.doseFit?.perTarget[0]?.exposure, 100);
        assert.equal(result.selected?.coverageBySubject.get("a"), 10000);
        assert.deepEqual(result.leftovers, []);
      }
    }
    assert.notEqual(canonicalTargetSetHash(make("total_daily")), canonicalTargetSetHash(make("supplemental")));
  });

  it("counts known food in zero-purchase and candidate coverage without changing source-scoped limits", () => {
    const diet = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 100, unit: "mg", sourceId: "food" }]);
    assert.ok(!("error" in diet)); if ("error" in diet) return;
    const r = request({ dietaryIntake: diet, targets: request().targets.map(target => ({ ...target, basis: "total_daily" })) });
    const result = run(r, [product("extra", 20)]);
    assert.deepEqual(result.selected?.productIds, []);
    assert.equal(result.selected?.coverageBySubject.get("a"), 10000);
    assert.deepEqual(result.leftovers, []);
    const partialDiet = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 40, unit: "mg", sourceId: "food" }]);
    assert.ok(!("error" in partialDiet)); if ("error" in partialDiet) return;
    assert.equal(productHitsCoverageFloor(product("small", 20), { ...r, dietaryIntake: partialDiet }, r.targets[0]!), true);
    assert.equal(productHitsCoverageFloor(product("small", 20), request({ dietaryIntake: partialDiet, maxDailyPills: 3 }), request().targets[0]!), true);
    const limits = doseFitScore({ ...r, safetyCeilings: [
      { subjectId: "a", name: "A", maxAmount: 80, maxUnit: "mg", sourceScope: "supplemental" },
      { subjectId: "a", name: "A", maxAmount: 120, maxUnit: "mg", sourceScope: "total" }
    ] }, exposure(50));
    assert.equal(limits.perTarget[0]?.over, 0.5);
    assert.equal(limits.perLimit.find(row => row.sourceScope === "supplemental")?.exposure, 50);
    assert.equal(limits.perLimit.find(row => row.sourceScope === "total")?.exposure, 150);
    assert.equal(limits.weightedLimit, 0.5);
  });

  it("uses estimated food in worst-case dose-fit bounds without promising known coverage", () => {
    const diet = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 50, minimumDailyAmount: 20, maximumDailyAmount: 80,
      certainty: "estimated", unit: "mg", sourceId: "food" }]);
    assert.ok(!("error" in diet)); if ("error" in diet) return;
    const r = request({ dietaryIntake: diet, safetyCeilings: [], targets: request().targets.map(target => ({ ...target, basis: "total_daily" })) });
    const result = run(r, [product("fifty", 50)]);
    assert.equal(result.selected?.doseFit?.total, 0.3);
    assert.equal(result.selected?.doseFit?.perTarget[0]?.exposureMinimum, 70);
    assert.equal(result.selected?.doseFit?.perTarget[0]?.exposureMaximum, 130);
    assert.equal(result.selected?.doseFit?.perTarget[0]?.conservativeExposure, 70);
    assert.equal(result.selected?.coverageBySubject.get("a"), 5000);
    assert.ok(result.leftovers.some(row => row.reason === "dose_gap"));
  });

  it("compares alternatives using the same known total-daily coverage basis", () => {
    const diet = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 60, unit: "mg", sourceId: "food" }]);
    assert.ok(!("error" in diet)); if ("error" in diet) return;
    const r = request({ dietaryIntake: diet, targets: request().targets.map(target => ({ ...target, basis: "total_daily" })) });
    const selected = run({ ...r, retainProductIds: ["high"] }, [product("high", 100)]).selected!;
    const candidate = run({ ...r, retainProductIds: ["right"] }, [product("right", 40)]).selected!;
    assert.equal(hasFewerConcerns(candidate, selected, r), true);
    const lessCoverage = run({ ...r, maxDailyPills: 1, retainProductIds: ["low"] }, [product("low", 30)]).selected!;
    assert.equal(hasFewerConcerns(lessCoverage, selected, r), false);
  });

  it("penalizes increments above known continued doses without inventing an agreed target", () => {
    const currents = canonicalizeCurrents([{ subjectId: "b", name: "B", dailyAmount: 20, unit: "mg", sourceId: "continued-b" }]);
    assert.ok(!("error" in currents)); if ("error" in currents) return;
    const r = request({ currentSupplements: currents });
    for (const optimization of ["lowest_cost", "fewest_pills", "best_coverage"] as const) {
      const result = run({ ...r, optimization }, [product("cheap-extra-b", 100, 10, 1), product("a-only", 100, 0, 50)]);
      assert.deepEqual(result.selected?.productIds, ["a-only"]);
      assert.equal(result.selected?.doseFit?.perContinuedDose?.[0]?.over, 0);
    }
    const score = doseFitScore(r, exposure(100, 30));
    assert.equal(score.total, 0.5);
    assert.equal(score.under, 0);
    assert.equal(score.perTarget.some(row => row.subjectId === "b"), false);
    assert.deepEqual(score.perContinuedDose?.[0], { subjectId: "b", name: "B", unit: "mg", referenceBasis: "continued_dose",
      referenceDose: 20, sourceIds: ["continued-b"], exposure: 30, exposureMinimum: 30, exposureMaximum: 30,
      conservativeExposure: 30, over: 0.5, certainty: "known" });
    assert.equal(doseFitScore(r, exposure(100, 0)).under, 0);
    const retained = run({ ...r, retainProductIds: ["extra"] }, [product("extra", 100, 10)]).selected!;
    assert.equal(retained.safety.hardBlocked, false);
    assert.ok(retained.safety.findings.some(row => row.code === "continued_dose_increased" && row.action === "inform"));
  });

  it("adds the stronger reference-limit penalty to continued-dose increments", () => {
    const currents = canonicalizeCurrents([{ subjectId: "b", name: "B", dailyAmount: 20, unit: "mg", sourceId: "continued-b" }]);
    assert.ok(!("error" in currents)); if ("error" in currents) return;
    const score = doseFitScore(request({ currentSupplements: currents, safetyCeilings: [{ subjectId: "b", name: "B", maxAmount: 25, maxUnit: "mg" }] }), exposure(100, 30));
    assert.equal(score.over, 0.5);
    assert.equal(score.weightedLimit, 0.4);
    assert.equal(score.total, 0.9);
  });

  it("does not derive a continued-dose denominator from zero or estimated intake", () => {
    for (const row of [{ dailyAmount: 0 }, { dailyAmount: 20, certainty: "estimated" as const },
      { dailyAmount: 20, minimumDailyAmount: 10, maximumDailyAmount: 30 }]) {
      const currents = canonicalizeCurrents([{ subjectId: "b", name: "B", unit: "mg", sourceId: "continued-b", ...row }]);
      assert.ok(!("error" in currents)); if ("error" in currents) continue;
      const score = doseFitScore(request({ currentSupplements: currents, safetyCeilings: [] }), exposure(100, row.dailyAmount + 10));
      assert.equal(score.over, 0);
      assert.deepEqual(score.perContinuedDose, []);
    }
  });

  it("counts only newly added exposure against known stock when other continued intake is estimated", () => {
    const currents = canonicalizeCurrents([
      { subjectId: "b", name: "B", unit: "mg", sourceId: "known-b", dailyAmount: 20, certainty: "known" },
      { subjectId: "b", name: "B", unit: "mg", sourceId: "estimate-b", dailyAmount: 10, certainty: "estimated" }
    ]);
    assert.ok(!("error" in currents)); if ("error" in currents) return;
    const score = doseFitScore(request({ currentSupplements: currents, safetyCeilings: [], estimatedIntakeSubjectIds: ["b"] }), exposure(100, 40));
    assert.equal(score.over, 0.5);
    assert.equal(score.perContinuedDose?.[0]?.referenceDose, 20);
    assert.equal(score.perContinuedDose?.[0]?.exposure, 30);
    assert.deepEqual(score.perContinuedDose?.[0]?.sourceIds, ["known-b"]);
  });

  it("adds twice the normalized limit excess, without turning it into a validity gate", () => {
    const r = request({ safetyCeilings: [{ subjectId: "a", name: "A", maxAmount: 100, maxUnit: "mg" }] });
    const score = doseFitScore(r, exposure(120));
    assert.equal(score.under, 0); assert.equal(score.over, 0.2);
    assert.equal(score.limit, 0.2); assert.equal(score.weightedLimit, 0.4); assert.equal(score.total, 0.6);
    const result = run({ ...r, retainProductIds: ["above"] }, [product("above", 120)]);
    assert.deepEqual(result.selected?.productIds, ["above"]);
    assert.equal(result.selected?.safety.hardBlocked, false);
    assert.equal(result.selected?.safety.requiresAck, false);
    assert.ok(result.selected?.safety.findings.some((row) => row.code === "dose_review_required" && row.action === "inform"));
  });

  it("scores collateral excess before price, pills, or another covered target", () => {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100, unit: "mg" }, { subjectId: "b", name: "B", amount: 100, unit: "mg" }] }).targets;
    for (const optimization of ["lowest_cost", "fewest_pills", "best_coverage"] as const) {
      for (const selectorMode of ["agentic", "web_single"] as const) {
        const result = run(request({ targets, optimization, selectorMode }), [product("cheap-multi", 180, 100, 1), product("a-right", 100, 0, 30), product("b-right", 0, 100, 30)]);
        assert.deepEqual(result.selected?.productIds, ["a-right", "b-right"]);
        assert.equal(result.selected?.doseFit?.total, 0);
      }
    }
  });

  it("permits proportional tradeoffs without a protected-target veto", () => {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100, unit: "mg" }, { subjectId: "b", name: "B", amount: 100, unit: "mg" }] }).targets;
    const currents = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 100, unit: "mg", sourceId: "existing" }]);
    assert.ok(!("error" in currents)); if ("error" in currents) return;
    const result = run(request({ targets, currentSupplements: currents }), [product("tradeoff", 50, 100)]);
    assert.deepEqual(result.selected?.productIds, ["tradeoff"]);
    assert.equal(result.selected?.doseFit?.total, 0.5);
  });

  it("keeps buying nothing when every product worsens total dose fit", () => {
    const result = run(request(), [product("excessive", 260)]);
    assert.ok(result.selected); assert.deepEqual(result.selected.productIds, []);
    assert.equal(result.selected.doseFit?.total, 1);
  });

  it("includes continued intake once and checks incidental and total-source limits", () => {
    const currents = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 30, unit: "mg", sourceId: "existing" }]);
    const diet = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 50, unit: "mg", sourceId: "food" }]);
    assert.ok(!("error" in currents) && !("error" in diet)); if ("error" in currents || "error" in diet) return;
    const r = request({ currentSupplements: currents, dietaryIntake: diet, retainProductIds: ["mixed"], safetyCeilings: [
      { subjectId: "a", name: "A", maxAmount: 100, maxUnit: "mg", sourceScope: "supplemental" },
      { subjectId: "a", name: "A", maxAmount: 120, maxUnit: "mg", sourceScope: "total" },
      { subjectId: "b", name: "B", maxAmount: 10, maxUnit: "mg" }] });
    const result = run(r, [product("mixed", 70, 20)]);
    const fit = result.selected?.doseFit;
    assert.ok(fit);
    assert.equal(fit.perTarget[0]?.exposure, 100);
    assert.equal(fit.perLimit.find((row) => row.subjectId === "a" && row.sourceScope === "supplemental")?.excess, 0);
    assert.equal(fit.perLimit.find((row) => row.subjectId === "a" && row.sourceScope === "total")?.excess, 0.25);
    assert.equal(fit.perLimit.find((row) => row.subjectId === "b")?.excess, 1);
    assert.equal(fit.weightedLimit, 2.5);
  });

  it("uses the worst whole-penalty endpoint for estimated intake", () => {
    const currents = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 80, minimumDailyAmount: 60, maximumDailyAmount: 100, unit: "mg", sourceId: "range" }]);
    assert.ok(!("error" in currents)); if ("error" in currents) return;
    const r = request({ currentSupplements: currents, estimatedIntakeSubjectIds: ["a"] });
    const score = doseFitScore(r, exposure(80));
    assert.equal(score.total, 0.4); assert.equal(score.perTarget[0]?.conservativeExposure, 60);
    const upper = doseFitScore({ ...r, safetyCeilings: [{ subjectId: "a", name: "A", maxAmount: 80, maxUnit: "mg" }] }, exposure(80));
    assert.equal(upper.total, 0.5); assert.equal(upper.perTarget[0]?.conservativeExposure, 100);
  });

  it("keeps unknown intake explicit and offers a known-label alternative without coverage loss", () => {
    const result = run(request({ unknownIntakeSubjectIds: ["*"] }), [product("cheap-unknown", 100, 0, 1, { unknownSafetyAmount: true }), product("known", 100, 0, 20)]);
    assert.equal(result.selected?.doseFit?.perTarget[0]?.certainty, "unknown");
    assert.deepEqual(result.selected?.productIds, ["cheap-unknown"]);
    assert.deepEqual(result.alternatives[0]?.productIds, ["known"]);
    assert.equal(result.alternativeSearch?.status, "found");
  });

  it("keeps exclusions, availability and known demographic product fit enforced", () => {
    const products = [product("excluded", 100, 0, 1), product("unavailable", 100, 0, 1, { stockStatus: "unavailable" }), product("female", 100, 0, 2, { productAudience: "female" }), product("neutral", 100, 0, 20)];
    const r = request({ excludeProductIds: ["excluded"], profile: { ageYears: 38, lifeStage: "adult", sex: "male" } });
    assert.deepEqual(run(r, products).selected?.productIds, ["neutral"]);
    assert.deepEqual(run({ ...r, profileKnown: { sex: false } }, products).selected?.productIds, ["female"]);
  });

  it("uses product and dose identity and gives explicit incomplete-search evidence", () => {
    assert.notEqual(optionIdFor(["seller:a:x1"]), optionIdFor(["seller:a:x2"]));
    assert.equal(materiallyDifferent(
      { sellerId: "one", productIds: ["a"], variantIds: ["one:a:x1"] } as ScoredBasket,
      { sellerId: "two", productIds: ["a"], variantIds: ["two:a:x1"] } as ScoredBasket), false);
    assert.equal(materiallyDifferent({ sellerId: "s", variantIds: ["a:x1"] } as ScoredBasket, { sellerId: "s", variantIds: ["a:x2"] } as ScoredBasket), true);
    const r = request(); const products = Array.from({ length: 10 }, (_, i) => product("p" + i, 80, 0, i + 1));
    const config = { exactGroupLimit: 0, exactVariantLimit: 0, expansionBudget: 1, initialBeamWidth: 1, maxBeamWidth: 1, searchDeadlineMs: 0, usefulCoverageFloor: 90, version: "test" };
    const snapshot = { catalogueVersion: "frozen", availabilityAsOf: "2026-01-01Z", products };
    const a = match(r, snapshot, config), b = match(r, { ...snapshot, products: [...products].reverse() }, { ...config, searchDeadlineMs: 100_000 });
    assert.deepEqual(a, b); assert.equal(a.trimmed, true);
  });

  it("shares the bounded candidate frontier across commercial objectives", () => {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100, unit: "mg" },
      { subjectId: "b", name: "B", amount: 100, unit: "mg" }] }).targets;
    const products = [product("p0", 60, 0, 7), product("p1", 100, 0, 11, { dailyPillsPerServing: 2 }),
      product("p2", 70, 80, 55, { dailyPillsPerServing: 3 }), product("p3", 30, 20, 13),
      product("p4", 100, 100, 55, { dailyPillsPerServing: 3 }), product("p5", 40, 60, 9)];
    const snapshot = { catalogueVersion: "bounded-objectives", availabilityAsOf: "2026-01-01Z", products };
    const config = { ...DEFAULT_MATCHER_CONFIG, exactGroupLimit: 0, exactVariantLimit: 0,
      initialBeamWidth: 2, maxBeamWidth: 2, expansionBudget: 50 };
    const observed = (["lowest_cost", "fewest_pills", "best_coverage", "balanced"] as const).map(optimization => {
      const input = request({ targets, optimization, maxDailyPills: 12 });
      const frontier = searchGroups(compileGroups(input, snapshot), input, config);
      assert.equal(frontier.mode, "bounded");
      assert.equal(frontier.trimmed, true);
      return { frontier: frontier.complete.map(row => row.selectedVariantIds),
        fit: match(input, snapshot, config).selected!.doseFit! };
    });
    for (const result of observed.slice(1)) {
      assert.deepEqual(result.frontier, observed[0]!.frontier);
      assert.equal(compareDoseFit(result.fit, observed[0]!.fit), 0);
    }
  });

  it("prices one purchased pack at two or three daily servings even above a budget preference", () => {
    const single = product("one_pack", 100, 0, 48_500);
    for (const dailyServings of [2, 3]) {
      const targets = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100 * dailyServings, unit: "mg" }] }).targets;
      const input = request({ targets, safetyCeilings: [], maxPriceMinor: 48_500 });
      const result = run(input, [single]);
      assert.deepEqual(result.selected?.variantIds, [`seller:one_pack:x${dailyServings}`]);
      assert.equal(result.selected?.doseFit?.total, 0);
      assert.equal(result.selected?.priceMinor, 48_500);
      assert.equal(result.rejected.some(row => row.reason === "budget"), false);
      const belowPrice = run({ ...input, maxPriceMinor: 48_499 }, [single]);
      assert.deepEqual(belowPrice.selected?.variantIds, [`seller:one_pack:x${dailyServings}`]);
      assert.equal(belowPrice.selected?.priceMinor, 48_500);
      assert.equal(belowPrice.selected?.doseFit?.total, 0);
      assert.equal(belowPrice.rejected.some(row => row.reason === "budget"), false);
    }
  });

  it("uses the quoted pack subtotal only after dose fit and the requested pill objective", () => {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 200, unit: "mg" }] }).targets;
    const products = [product("two_servings", 100, 0, 48_500), product("one_serving", 200, 0, 55_000),
      product("cheap_under", 90, 0, 1)];
    const input = request({ targets, safetyCeilings: [], maxProductCount: 1 });
    const cost = run({ ...input, optimization: "lowest_cost" }, products);
    assert.deepEqual(cost.selected?.variantIds, ["seller:two_servings:x2"]);
    assert.equal(cost.selected?.doseFit?.total, 0);
    assert.equal(cost.selected?.priceMinor, 48_500);
    const pills = run({ ...input, optimization: "fewest_pills" }, products);
    assert.deepEqual(pills.selected?.variantIds, ["seller:one_serving:x1"]);
    assert.equal(pills.selected?.doseFit?.total, 0);
    assert.equal(pills.selected?.priceMinor, 55_000);
  });

  it("sums distinct purchased packs and does not charge another pack for a dose change", () => {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 200, unit: "mg" },
      { subjectId: "b", name: "B", amount: 300, unit: "mg" }] }).targets;
    const products = [product("a_pack", 100, 0, 48_500), product("b_pack", 0, 100, 10_000)];
    const input = request({ targets, safetyCeilings: [], maxPriceMinor: 58_500 });
    const result = run(input, products);
    assert.deepEqual(result.selected?.variantIds.slice().sort(), ["seller:a_pack:x2", "seller:b_pack:x3"]);
    assert.equal(result.selected?.priceMinor, 58_500);
    assert.equal(result.selected?.doseFit?.total, 0);
    const constrained = run({ ...input, maxPriceMinor: 58_499 }, products);
    assert.deepEqual(constrained.selected?.variantIds.slice().sort(), ["seller:a_pack:x2", "seller:b_pack:x3"]);
    assert.equal(constrained.selected?.priceMinor, 58_500);
    assert.equal(constrained.selected?.productCount, 2);
    assert.equal(constrained.selected?.doseFit?.total, 0);
    assert.equal(constrained.lossCertificates?.some(row => row.conflicting_rule_id === "budget"), false);
    const concerned = run(request({ maxPriceMinor: 48_500,
      targets: canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 300, unit: "mg" }] }).targets,
      safetyCeilings: [{ subjectId: "a", name: "A", maxAmount: 250, maxUnit: "mg" }] }), [products[0]!]);
    assert.deepEqual(concerned.selected?.variantIds, ["seller:a_pack:x2"]);
    assert.equal(concerned.lossCertificates?.some(row => row.conflicting_rule_id === "budget"), false);
  });

  it("matches an independent exhaustive tiny oracle across all objectives", () => {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100, unit: "mg" }, { subjectId: "b", name: "B", amount: 100, unit: "mg" }] }).targets;
    const products = [product("p0", 70, 20, 7), product("p1", 30, 60, 11), product("p2", 100, 100, 55)];
    // This oracle deliberately does not call matcher scoring, candidate filtering,
    // search, dominance or comparison helpers. Doses and denominators are integers.
    const options = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (let k = 0; k <= 4; k++) {
      const units = [i, j, k], pills = i + j + k;
      const a = 70 * i + 30 * j + 100 * k, b = 20 * i + 60 * j + 100 * k;
      const penalty = Math.abs(a - 100) + Math.abs(b - 100) + 2 * (Math.max(a - 100, 0) + Math.max(b - 100, 0));
      const price = (i > 0 ? 7 : 0) + (j > 0 ? 11 : 0) + (k > 0 ? 55 : 0), coverage = Math.min(a, 100) + Math.min(b, 100);
      const variants = units.flatMap((count, n) => count ? [`seller:p${n}:x${count}`] : []);
      options.push({ penalty, price, pills, coverage, variants, signature: [variants.length ? "seller" : "", ...variants].join("|") });
    }
    for (const optimization of ["lowest_cost", "fewest_pills", "best_coverage"] as const) {
      const expected = [...options].sort((a, b) => a.penalty - b.penalty ||
        (optimization === "fewest_pills" ? a.pills - b.pills : optimization === "best_coverage" ? b.coverage - a.coverage : 0) ||
        a.price - b.price || a.pills - b.pills || a.variants.length - b.variants.length || a.signature.localeCompare(b.signature))[0]!;
      const result = run(request({ targets, optimization, maxDailyPills: 3, safetyCeilings: [{ subjectId: "a", name: "A", maxAmount: 100, maxUnit: "mg" }, { subjectId: "b", name: "B", maxAmount: 100, maxUnit: "mg" }] }), products);
      assert.deepEqual(result.selected?.variantIds.slice().sort(), expected.variants);
      assert.equal(result.selected?.doseFit?.total, expected.penalty / 100);
    }
  });

  it("preserves equivalent mass units and exact Vitamin D IU conversion", () => {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "d", name: "Vitamin D3", amount: 1000, unit: "IU" }] }).targets;
    const r = request({ targets, safetyCeilings: [{ subjectId: "d", name: "Vitamin D3", maxAmount: 50, maxUnit: "mcg" }] });
    const amount = scaleAmount({ amount: 25, subjectId: "d", subjectName: "Vitamin D3", unit: "mcg" });
    assert.ok(!("reason" in amount)); if ("reason" in amount) return;
    assert.equal(doseFitScore(r, new Map([["d", amount.units]])).total, 0);
  });

  it("validates and fingerprints quantified intake intervals", () => {
    const row = { subjectId: "a", name: "A", dailyAmount: 80, unit: "mg" as const, sourceId: "food" };
    assert.ok("error" in canonicalizeCurrents([{ ...row, minimumDailyAmount: 90 }]));
    assert.ok("error" in canonicalizeCurrents([{ ...row, maximumDailyAmount: NaN }]));
    assert.ok("error" in canonicalizeCurrents([{ ...row, maximumDailyAmount: 1e19 }]));
    assert.ok("error" in canonicalizeCurrents([{ ...row, maximumDailyAmount: 1e100 }]));
    assert.ok("error" in canonicalizeCurrents([{ ...row, dailyAmount: 1e-12 }]));
    assert.ok("error" in canonicalizeCurrents([{ ...row, minimumDailyAmount: 1e-12 }]));
    const tiny = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 1e-12, unit: "mg" }] });
    assert.equal(tiny.targets.length, 0);
    assert.equal(tiny.leftovers[0]?.reason, "unsupported_unit_conversion");
    const left = canonicalizeCurrents([{ ...row, minimumDailyAmount: 20, maximumDailyAmount: 100 }]);
    const right = canonicalizeCurrents([{ ...row, minimumDailyAmount: 50, maximumDailyAmount: 100 }]);
    assert.ok(!("error" in left) && !("error" in right)); if ("error" in left || "error" in right) return;
    assert.notEqual(canonicalTargetSetHash(request({ currentSupplements: left })), canonicalTargetSetHash(request({ currentSupplements: right })));
  });

  it("reports possible limit excess even when the low endpoint drives dose loss", () => {
    const currents = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 80, minimumDailyAmount: 10, maximumDailyAmount: 105, unit: "mg", sourceId: "range" }]);
    assert.ok(!("error" in currents)); if ("error" in currents) return;
    const result = run(request({ currentSupplements: currents, safetyCeilings: [{ subjectId: "a", name: "A", maxAmount: 100, maxUnit: "mg" }] }), []);
    assert.equal(result.selected?.doseFit?.perTarget[0]?.conservativeExposure, 10);
    const warning = result.selected?.safety.findings.find((row) => row.code === "dose_review_required");
    assert.equal(warning?.exposureUnits, BigInt(105_000_000));
    assert.ok(warning?.uncertainty?.includes("amount_is_upper_endpoint_of_estimate"));
  });

  it("does not prune dose choices that improve the low end of uncertain intake", () => {
    const currents = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 100, minimumDailyAmount: 0, maximumDailyAmount: 100, unit: "mg", sourceId: "range" }]);
    assert.ok(!("error" in currents)); if ("error" in currents) return;
    const r = request({ currentSupplements: currents });
    const group = compileGroups(r, { products: [product("add", 20)], availabilityAsOf: "frozen", catalogueVersion: "frozen" })[0]!;
    const zero = { ...seedState(r), nextGroupIndex: 1 };
    const addition = tryAddVariant(seedState(r), group.variants[0]!, group, r)!;
    assert.equal(dominatesAtLayer(zero, addition, r), false);
    assert.ok(doseFitScore(r, addition.exposure).total < doseFitScore(r, zero.exposure).total);
  });

  it("preserves explicit product retention in a narrow beam and never mixes sellers", () => {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100, unit: "mg" }, { subjectId: "b", name: "B", amount: 100, unit: "mg" }] }).targets;
    const r = request({ targets, retainProductIds: ["retain-a", "retain-b"], maxProductCount: 2 });
    const products = [product("cheap-a", 100, 0, 1), product("retain-a", 100, 0, 20), product("retain-b", 0, 100, 20), product("other-seller", 100, 100, 1, { sellerId: "elsewhere" })];
    const result = match(r, { products, availabilityAsOf: "frozen", catalogueVersion: "frozen" }, { ...DEFAULT_MATCHER_CONFIG, exactGroupLimit: 0, exactVariantLimit: 0, initialBeamWidth: 1, maxBeamWidth: 1 });
    assert.deepEqual(result.selected?.productIds, ["retain-a", "retain-b"]);
    assert.equal(result.selected?.sellerId, "seller");
  });

  it("preserves country eligibility while numeric preferences retain the exact affordable dose fit", () => {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100, unit: "mg" }, { subjectId: "b", name: "B", amount: 100, unit: "mg" }] }).targets;
    const r = request({ targets, maxPriceMinor: 20, maxDailyPills: 1, maxProductCount: 1 });
    const result = run(r, [product("a", 100), product("b", 0, 100), product("foreign", 100, 100, 1, { availableCountryCodes: ["US"] }), product("cost", 100, 100, 21), product("heavy", 100, 100, 10, { dailyPillsPerServing: 2 })]);
    assert.deepEqual(result.selected?.productIds, ["heavy"]);
    assert.equal(result.selected?.productCount, 1); assert.equal(result.selected?.dailyPills, 2);
    assert.equal(result.selected?.priceMinor, 10);
    assert.equal(result.selected?.doseFit?.total, 0);
    assert.equal(result.selected?.coveredCount, 2);
    assert.ok(result.targetFrontiers?.find(row => row.subjectId === "a")?.productIds.every(id => ["a", "cost", "heavy"].includes(id)));
    assert.ok(result.targetFrontiers?.find(row => row.subjectId === "b")?.productIds.every(id => ["b", "cost", "heavy"].includes(id)));
    assert.deepEqual(result.leftovers, []);
    assert.ok(result.rejected.some((row) => row.productId === "foreign" && row.reason === "foreign_retailer"));
  });

  it("does not count a conflicting nutrient form even when a catalogue ID is shared", () => {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "omega", name: "EPA", amount: 100, unit: "mg" }] }).targets;
    const candidate = product("dha", 0, 0, 10, { labelledContributions: [{ subjectId: "omega", name: "DHA", amount: 100, unit: "mg" }] });
    const result = run(request({ targets }), [candidate]);
    assert.deepEqual(result.selected?.productIds, []);
    assert.equal(result.selected?.doseFit?.perTarget[0]?.exposure, 0);
  });

  it("deduplicates equivalent labels after unit conversion and sums only distinct omega components", () => {
    const dTargets = canonicalizeTargets({ targets: [{ subjectId: "d", name: "Vitamin D3", amount: 1200, unit: "IU" }] }).targets;
    const duplicate = product("duplicate", 0, 0, 10, { labelledContributions: [
      { subjectId: "d", name: "Vitamin D3", amount: 1000, unit: "IU" },
      { subjectId: "d", name: "Cholecalciferol", amount: 30, unit: "mcg" }
    ] });
    assert.equal(run(request({ targets: dTargets }), [duplicate]).selected?.doseFit?.total, 0);
    const targets = canonicalizeTargets({ targets: [{ subjectId: "omega", name: "Omega-3", amount: 500, unit: "mg" }] }).targets;
    const facts = [{ subjectId: "omega", name: "EPA", amount: 300, unit: "mg" }, { subjectId: "omega", name: "DHA", amount: 200, unit: "mg" }];
    for (const labelledContributions of [facts, [...facts, { subjectId: "omega", name: "Docosahexaenoic acid (DHA)", amount: 200, unit: "mg" }], [...facts, { subjectId: "omega", name: "Omega-3", amount: 500, unit: "mg" }]]) {
      const result = run(request({ targets }), [product("omega", 0, 0, 10, { labelledContributions })]);
      assert.equal(result.selected?.doseFit?.perTarget[0]?.exposure, 500);
      assert.equal(result.selected?.doseFit?.total, 0);
    }
  });

  it("uses known adolescent bands and leaves absent infant references unknown", () => {
    const safetyCeilings = [{ subjectId: "a", name: "A", maxAmount: 200, maxUnit: "mg" as const, lifeStage: "adult" as const },
      { subjectId: "a", name: "A", maxAmount: 110, maxUnit: "mg" as const, lifeStage: "adolescent_14_18" as const }];
    const adolescent = doseFitScore(request({ safetyCeilings, profile: { ageYears: 15, lifeStage: "adult" } }), exposure(120));
    assert.equal(adolescent.perLimit[0]?.limit, 110);
    const infant = run(request({ safetyCeilings, profile: { ageYears: 0, lifeStage: "child" } }), []);
    assert.deepEqual(infant.selected?.doseFit?.perLimit, []);
    assert.ok(infant.selected?.safety.findings.some((row) => row.uncertainty?.includes("unknown_reference_population")));
  });
});
