import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalizeCurrents, canonicalizeTargets } from "../lib/matcher/canonicalizer.ts";
import { freezeSelectionCoverage } from "../lib/matcher/freeze-selection-coverage.ts";
import { reduceSelectionCoverage } from "../lib/matcher/selection-coverage.ts";
import type { ProductRecommendationNeed } from "../lib/product-recommendation-types.ts";
import { product, request } from "./matcher/flexible-v5-fixtures.ts";

function need(subjectId: string, amount = 100): ProductRecommendationNeed {
  return { id: `supplement:${subjectId}`, sourceId: subjectId, normalizedName: subjectId, displayName: subjectId.toUpperCase(),
    itemType: "supplement", aliasKeys: [subjectId], category: "Foundation", weight: 1,
    targetDose: { amount, unit: "mg", originalText: `${amount} mg` }, targetComparableAmount: amount, targetText: `${amount} mg` };
}

test("removing and undoing products recounts overlapping contributions at the original dose", () => {
  const targets = canonicalizeTargets({ targets: [
    { subjectId: "a", name: "A", amount: 100, unit: "mg" },
    { subjectId: "b", name: "B", amount: 100, unit: "mg" }
  ] }).targets;
  const snapshot = freezeSelectionCoverage({ request: request({ targets }), needs: [need("a"), need("b")],
    products: [product("multi", { a: 30, b: 50 }), product("single", { a: 40 })],
    basket: { productIds: ["multi", "single"], variantDoses: [{ productId: "multi", dailyUnits: 2, dailyPills: 2 }, { productId: "single", dailyUnits: 1, dailyPills: 1 }] } });
  assert.ok(snapshot);
  const frozen = JSON.parse(JSON.stringify(snapshot));
  const full = reduceSelectionCoverage(frozen, ["multi", "single"]);
  assert.equal(full.status, "verified");
  assert.equal(full.coveragePercent, 100);
  const withoutSingle = reduceSelectionCoverage(frozen, ["multi"]);
  assert.deepEqual(withoutSingle.needCoverage.map(row => row.coveragePercent), [60, 100]);
  assert.equal(withoutSingle.coveragePercent, 80);
  assert.deepEqual(withoutSingle.removedNeedIds, ["supplement:a"]);
  assert.deepEqual(reduceSelectionCoverage(frozen, ["single"]).needCoverage.map(row => row.coveragePercent), [40, 0]);
  assert.equal(reduceSelectionCoverage(frozen, []).coveragePercent, 0);
  assert.deepEqual(reduceSelectionCoverage(frozen, ["multi", "single"]), full);
  assert.deepEqual(snapshot.products.map(row => row.dailyUnits), [2, 1]);
});

test("continued intake and diet preserve supplemental versus total-daily target basis", () => {
  const known = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 20, unit: "mg", sourceId: "continued" }]);
  const food = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 30, unit: "mg", sourceId: "diet" }]);
  assert.ok(!("error" in known) && !("error" in food));
  for (const basis of ["supplemental", "total_daily"] as const) {
    const targets = canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100, unit: "mg", basis }] }).targets;
    const snapshot = freezeSelectionCoverage({ request: request({ targets, currentSupplements: known, dietaryIntake: food }),
      needs: [need("a")], products: [product("added", { a: 50 })], basket: { productIds: ["added"], variantDoses: [{ productId: "added", dailyUnits: 1, dailyPills: 1 }] } });
    assert.equal(reduceSelectionCoverage(snapshot, ["added"]).coveragePercent, basis === "supplemental" ? 70 : 100);
    assert.equal(reduceSelectionCoverage(snapshot, []).coveragePercent, basis === "supplemental" ? 20 : 50);
  }
});

test("uncertain intake and unverified product amounts never become guaranteed coverage", () => {
  const current = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 50, minimumDailyAmount: 20, maximumDailyAmount: 80, unit: "mg", sourceId: "estimated" }]);
  assert.ok(!("error" in current));
  const uncertain = product("uncertain", { a: 100 }, 100, { unknownSafetyAmount: true, labelledContributions: [{ subjectId: "a", name: "A", amount: 100, unit: "mg", confidence: "low", mappingStatus: "unverified" }] });
  const snapshot = freezeSelectionCoverage({ request: request({ currentSupplements: current }), needs: [need("a")], products: [uncertain],
    basket: { productIds: ["uncertain"], variantDoses: [{ productId: "uncertain", dailyUnits: 1, dailyPills: 1 }] } });
  assert.ok(snapshot);
  assert.equal(reduceSelectionCoverage(snapshot, ["uncertain"]).coveragePercent, 0);
});

test("legacy, malformed, duplicate and foreign selections do not invent a percentage", () => {
  const snapshot = freezeSelectionCoverage({ request: request(), needs: [need("a")], products: [product("one", { a: 100 })],
    basket: { productIds: ["one"], variantDoses: [{ productId: "one", dailyUnits: 1, dailyPills: 1 }] } });
  assert.ok(snapshot);
  for (const result of [reduceSelectionCoverage(undefined, ["one"]), reduceSelectionCoverage(snapshot, ["foreign"]),
    reduceSelectionCoverage(snapshot, ["one", "one"]), reduceSelectionCoverage({ ...snapshot, products: [{ ...snapshot.products[0], contributions: [{ subjectId: "a", dim: "mass_ng", units: "corrupt" }] }] }, ["one"])]) {
    assert.equal(result.status, "unknown");
    assert.equal(result.coveragePercent, null);
  }
});

test("omega totals and EPA/DHA components are not double-counted when removing a product", () => {
  const targets = canonicalizeTargets({ targets: [{ subjectId: "omega_3", name: "Omega 3", amount: 1000, unit: "mg" }] }).targets;
  const oil = product("oil", {}, 100, { contributionSubjectIds: ["omega_3"], labelledContributions: [
    { subjectId: "omega_3", name: "Omega 3", amount: 500, unit: "mg" },
    { subjectId: "epa", name: "EPA", amount: 300, unit: "mg" },
    { subjectId: "dha", name: "DHA", amount: 200, unit: "mg" }
  ] });
  const snapshot = freezeSelectionCoverage({ request: request({ targets }), needs: [{ ...need("omega_3", 1000), displayName: "Omega 3" }], products: [oil],
    basket: { productIds: ["oil"], variantDoses: [{ productId: "oil", dailyUnits: 1, dailyPills: 1 }] } });
  assert.equal(reduceSelectionCoverage(snapshot, ["oil"]).coveragePercent, 50);
  assert.equal(reduceSelectionCoverage(snapshot, []).coveragePercent, 0);
});
