import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalizeCurrents, canonicalizeTargets } from "../../lib/matcher/canonicalizer.ts";
import { doseFitScore } from "../../lib/matcher/dose-fit.ts";
import { add, compare, divide, fromDecimal, multiply, rational, serialize, toNumber } from "../../lib/matcher/experiments/rational.ts";
import { listProfiles, profileDefinition, resolveProfile, withPreferenceWeight } from "../../lib/matcher/experiments/profiles.ts";
import { compareScores, scoreBasket, scoreExposure } from "../../lib/matcher/experiments/score.ts";
import { match } from "../../lib/matcher/index.ts";
import { catalog, product, request } from "./flexible-v5-fixtures.ts";

const actual = { productCount: 1, dailyPills: 1, priceMinor: 100, currency: "THB" };
const exposure = (values: Record<string, number>) => new Map(Object.entries(values).map(([id, amount]) => [id, BigInt(Math.round(amount * 1e6))]));
const profile = (nutrient: string, preference = "off") => resolveProfile(`nutrient-${nutrient}__preferences-${preference}`);
const exact = (value: ReturnType<typeof rational> | null) => value && serialize(value);

test("EXP-SCORE-01 rational arithmetic preserves decimal coefficients and tiny ordering differences", () => {
  assert.deepEqual(serialize(add(fromDecimal("0.1"), fromDecimal("0.2"))), { numerator: "3", denominator: "10" });
  assert.equal(compare(fromDecimal("1.00000000000000000001"), rational(1n)), 1);
  assert.deepEqual(serialize(divide(multiply(rational(7n, 3n), rational(9n, 14n)), rational(2n))), { numerator: "3", denominator: "4" });
  assert.throws(() => rational(1n, 0n), /zero/i);
  for (const bad of [NaN, Infinity, "Infinity", "", "0x10"]) assert.throws(() => fromDecimal(bad));
});

test("EXP-SCORE-02 nine immutable named sets preserve the baseline alias and validate profile identity", () => {
  const profiles = listProfiles();assert.equal(profiles.length, 9);assert.equal(new Set(profiles.map(row => row.hash)).size, 9);
  assert.deepEqual(resolveProfile("baseline"), profile("linear"));
  assert.equal(Object.isFrozen(profiles), true);assert.equal(Object.isFrozen(profiles[0]), true);
  assert.equal(Object.isFrozen(profiles[0]!.nutrientAlpha), true);
  for (const bad of ["missing", null, {}, { ...profiles[0], hash: "bad" }, { ...profiles[0], surprise: true }]) assert.throws(() => resolveProfile(bad));
  const changed = withPreferenceWeight(profile("mixed", "quadratic"), "0.125");
  assert.notEqual(changed.hash, profile("mixed", "quadratic").hash);
  assert.deepEqual(serialize(changed.preferenceWeight!), { numerator: "1", denominator: "8" });
  assert.deepEqual(resolveProfile(changed), changed);
  for (const bad of [-1, "-0.1", NaN, Infinity]) assert.throws(() => withPreferenceWeight(changed, bad));
});

test("EXP-SCORE-03 baseline exactly preserves proportional target loss and current production display totals", () => {
  const input = request();
  for (const value of [0, 80, 100, 100.000001, 120, 300]) {
    const doses = exposure({ a: value });const baseline = scoreExposure(resolveProfile("baseline"), input, doses, actual);
    assert.equal(toNumber(baseline.nutrientTotal), doseFitScore(input, doses).total);
    assert.equal(compare(baseline.total!, baseline.nutrientTotal), 0);
  }
  assert.deepEqual(exact(scoreExposure(resolveProfile("baseline"), input, exposure({ a: 120 }), actual).total), { numerator: "1", denominator: "5" });
});

test("EXP-SCORE-04 linear, mixed and quadratic penalties apply per nutrient with symmetric under/over", () => {
  const expected = { linear: "1/5", mixed: "3/25", quadratic: "1/25" };
  for (const [curve, ratio] of Object.entries(expected)) {
    const low = scoreExposure(profile(curve), request(), exposure({ a: 80 }), actual);
    const high = scoreExposure(profile(curve), request(), exposure({ a: 120 }), actual);
    const [numerator, denominator] = ratio.split("/");
    assert.deepEqual(exact(low.total), { numerator, denominator });assert.equal(compareScores(low, high), 0);
  }
  const input = request({ targets: canonicalizeTargets({ targets: ["a", "b"].map(id => ({ subjectId: id, name: id, amount: 100, unit: "mg" as const })) }).targets });
  const squared = scoreExposure(profile("quadratic"), input, exposure({ a: 80, b: 80 }), actual);
  assert.deepEqual(exact(squared.total), { numerator: "2", denominator: "25" }, "square each deviation, not their sum");
});

test("EXP-SCORE-05 reference excess remains twice proportional in every function set", () => {
  const input = request({ safetyCeilings: [{ subjectId: "a", name: "A", maxAmount: 100, maxUnit: "mg", sourceScope: "supplemental" }] });
  for (const set of listProfiles()) {
    const result = scoreExposure(set, input, exposure({ a: 120 }), actual);
    assert.deepEqual(exact(result.components.safety), { numerator: "2", denominator: "5" });
    assert.equal(result.perLimit[0]?.sourceScope, "supplemental");assert.equal(toNumber(result.perLimit[0]!.deviation), 0.2);
  }
});

test("EXP-SCORE-06 continued-dose numerator excludes existing estimates and denominator uses only known intake", () => {
  const currents = canonicalizeCurrents([{ subjectId: "b", name: "B", dailyAmount: 20, unit: "mg", sourceId: "known" },
    { subjectId: "b", name: "B", dailyAmount: 10, unit: "mg", sourceId: "estimated", certainty: "estimated" }]);
  assert.ok(!("error" in currents));if ("error" in currents) throw Error(currents.error);
  const input = request({ currentSupplements: currents });
  const baseline = scoreExposure(profile("linear"), input, exposure({ a: 100, b: 40 }), actual);
  const squared = scoreExposure(profile("quadratic"), input, exposure({ a: 100, b: 40 }), actual);
  assert.deepEqual(exact(baseline.total), { numerator: "1", denominator: "2" });assert.deepEqual(exact(squared.total), { numerator: "1", denominator: "4" });
  assert.equal(toNumber(squared.perContinuedDose[0]!.referenceDose), 20e6);assert.equal(toNumber(squared.perContinuedDose[0]!.added), 10e6);
  const requested = { ...input, targets: canonicalizeTargets({ targets: [{ subjectId: "b", name: "B", amount: 40, unit: "mg" }] }).targets };
  assert.equal(scoreExposure(profile("quadratic"), requested, exposure({ b: 40 }), actual).perContinuedDose.length, 0);
});

test("EXP-SCORE-07 profile evaluates the whole worst-case interval rather than transforming baseline's chosen endpoint", () => {
  const currents = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 80, minimumDailyAmount: 40, maximumDailyAmount: 120, certainty: "estimated", unit: "mg", sourceId: "range" }]);
  assert.ok(!("error" in currents));if ("error" in currents) throw Error(currents.error);
  const input = request({ currentSupplements: currents, safetyCeilings: [{ subjectId: "a", name: "A", maxAmount: 100, maxUnit: "mg", sourceScope: "supplemental" }] });
  const baseline = scoreExposure(profile("linear"), input, exposure({ a: 80 }), actual);
  const squared = scoreExposure(profile("quadratic"), input, exposure({ a: 80 }), actual);
  assert.equal(toNumber(baseline.perTarget[0]!.conservativeExposure), 40e6);
  assert.equal(toNumber(squared.perTarget[0]!.conservativeExposure), 120e6);
  assert.deepEqual(exact(baseline.total), { numerator: "3", denominator: "5" });
  assert.deepEqual(exact(squared.total), { numerator: "11", denominator: "25" });
});

test("EXP-SCORE-08 total versus supplemental scopes and accepted ranges retain their original meaning", () => {
  const food = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 40, unit: "mg", sourceId: "food" }]);
  assert.ok(!("error" in food));if ("error" in food) throw Error(food.error);
  const input = request({ dietaryIntake: food, targets: canonicalizeTargets({ targets: [{ subjectId: "a", name: "A", amount: 100, unit: "mg", basis: "total_daily", acceptableMinimum: 90, acceptableMaximum: 120 }] }).targets,
    safetyCeilings: [{ subjectId: "a", name: "A", maxAmount: 80, maxUnit: "mg", sourceScope: "supplemental" }, { subjectId: "a", name: "A", maxAmount: 120, maxUnit: "mg", sourceScope: "total" }] });
  const result = scoreExposure(profile("quadratic"), input, exposure({ a: 70 }), actual);
  assert.deepEqual(exact(result.total), { numerator: "1", denominator: "100" });assert.equal(result.perTarget[0]!.withinAcceptableRange, true);
  assert.equal(toNumber(result.perLimit.find(row => row.sourceScope === "supplemental")!.exposure), 70e6);
  assert.equal(toNumber(result.perLimit.find(row => row.sourceScope === "total")!.exposure), 110e6);
});

test("EXP-SCORE-09 positive preferences normalize overruns independently and weight their sum by one quarter", () => {
  const input = request({ maxProductCount: 2, maxDailyPills: 2, maxPriceMinor: 10000 });
  const quantities = { ...actual, productCount: 3, dailyPills: 3, priceMinor: 15000 };
  const linear = scoreExposure(profile("linear", "linear"), input, exposure({ a: 100 }), quantities);
  const quadratic = scoreExposure(profile("linear", "quadratic"), input, exposure({ a: 100 }), quantities);
  assert.deepEqual(exact(linear.preferenceTotal), { numerator: "3", denominator: "8" });
  assert.deepEqual(exact(quadratic.preferenceTotal), { numerator: "3", denominator: "16" });
  assert.equal(scoreExposure(profile("linear", "quadratic"), input, exposure({ a: 100 }), actual).total?.num, 0n);
});

test("EXP-SCORE-10 zero preference uses explicit unit scales and never divides by zero", () => {
  const input = request({ maxProductCount: 0, maxDailyPills: 0, maxPriceMinor: 0 });
  const result = scoreExposure(profile("linear", "quadratic"), input, exposure({ a: 100 }), { ...actual, productCount: 2, dailyPills: 2, priceMinor: 10000 });
  assert.deepEqual(exact(result.preferenceTotal), { numerator: "9", denominator: "4" });
  assert.throws(() => scoreExposure(profile("linear", "quadratic"), { ...input, currency: "USD" }, exposure({ a: 100 }), { ...actual, currency: "USD" }), /currency/i);
});

test("EXP-SCORE-11 unknown active preference cannot win through a fabricated zero; off and zero weight do not demand it", () => {
  const input = request({ maxDailyPills: 2 });const unknown = { ...actual, dailyPills: null };
  const result = scoreExposure(profile("linear", "quadratic"), input, exposure({ a: 100 }), unknown);
  assert.equal(result.complete, false);assert.equal(result.total, null);assert.equal(result.preferenceTotal, null);assert.deepEqual(result.missingComponents, ["daily_pills"]);
  assert.throws(() => compareScores(result, result), /incomplete/i);
  assert.equal(scoreExposure(resolveProfile("baseline"), input, exposure({ a: 100 }), unknown).complete, true);
  assert.equal(scoreExposure(withPreferenceWeight(profile("linear", "quadratic"), "0"), input, exposure({ a: 100 }), unknown).complete, true);
});

test("EXP-SCORE-12 scoring alternates profiles without cache contamination and rejects malformed actuals", () => {
  const input = request(),doses = exposure({ a: 120 });
  const before = scoreExposure(profile("linear"), input, doses, actual);
  assert.notDeepEqual(exact(before.total), exact(scoreExposure(profile("quadratic"), input, doses, actual).total));
  assert.deepEqual(exact(before.total), exact(scoreExposure(profile("linear"), input, doses, actual).total));
  for (const quantities of [{ ...actual, productCount: -1 }, { ...actual, dailyPills: Infinity }, { ...actual, priceMinor: 0.5 }, { ...actual, currency: "USD" }]) assert.throws(() => scoreExposure(profile("linear"), input, doses, quantities));
});

test("EXP-SCORE-13 custom descriptors round-trip exact alpha, individual weights and declared zero scales", () => {
  const definition = { ...profileDefinition(profile("quadratic", "quadratic")), id: "custom-quarter", nutrientAlpha: "0.25",
    preferenceWeights: { productCount: "0.1", dailyPills: "0.2", priceMinor: "0.3" },zeroPreferenceScales: { productCount: "2", dailyPills: "2", priceMinor: "20000", currency: "THB" } };
  const set = resolveProfile(definition);assert.equal(set.nutrientCurve, "custom");assert.equal(set.preferenceWeight, null);
  assert.equal(resolveProfile(JSON.parse(JSON.stringify(profileDefinition(set)))).hash, set.hash);
  const result = scoreExposure(set, request({ maxProductCount: 0, maxDailyPills: 0, maxPriceMinor: 0 }), exposure({ a: 120 }), { ...actual, productCount: 2, dailyPills: 2, priceMinor: 20000 });
  assert.deepEqual(exact(result.nutrientTotal), { numerator: "4", denominator: "25" });assert.deepEqual(exact(result.preferenceTotal), { numerator: "3", denominator: "5" });
  assert.deepEqual(exact(result.total), { numerator: "19", denominator: "25" });
  for (const bad of [{ ...definition, nutrientAlpha: "1.01" }, { ...definition, nutrientAlpha: "-0.01" },
    { ...definition, preferenceWeights: { ...definition.preferenceWeights, dailyPills: "-1" } },
    { ...definition, zeroPreferenceScales: { ...definition.zeroPreferenceScales, dailyPills: "0" } },
    { ...definition, zeroPreferenceScales: { ...definition.zeroPreferenceScales, priceMinor: "0.5" } },
    { ...definition, zeroPreferenceScales: { ...definition.zeroPreferenceScales, currency: "thb" } }]) assert.throws(() => resolveProfile(bad));
});

test("EXP-SCORE-14 unknown nutrient evidence stays conditional and cannot become an invented zero fact", () => {
  const input = request({ unknownIntakeSubjectIds: ["a"], maxDailyPills: 2 });
  const result = scoreExposure(profile("mixed", "quadratic"), input, exposure({ a: 80 }), actual);
  assert.equal(result.complete, true);assert.equal(result.nutrientEvidenceComplete, false);assert.equal(result.perTarget[0]?.certainty, "unknown");
  assert.deepEqual(result.uncertaintyNotes, ["unknown_intake:a"]);
  assert.deepEqual(exact(result.nutrientTotal), { numerator: "3", denominator: "25" });
  const unknownPrice = scoreExposure(profile("linear", "linear"), request({ maxPriceMinor: 100 }), exposure({ a: 100 }), { ...actual, priceMinor: null });
  assert.equal(unknownPrice.total, null);assert.deepEqual(unknownPrice.missingComponents, ["first_order_goods_price"]);
});

test("EXP-SCORE-15 differently scaled objective totals are not directly comparable", () => {
  const a = scoreExposure(profile("linear"), request(), exposure({ a: 80 }), actual);
  const b = scoreExposure(profile("quadratic"), request(), exposure({ a: 80 }), actual);
  assert.throws(() => compareScores(a, b), /different scoring profiles/i);
});

test("EXP-SCORE-16 basket wrapper accepts absent optional uncertainty and propagates unknown product evidence", () => {
  const input = request();const basket = match(input, catalog([product("only", { a: 100 })])).selected!;
  const known = { ...basket, exposure: { ...basket.exposure, unknownSubjectIds: undefined } };
  assert.equal(scoreBasket(resolveProfile("baseline"), input, known).nutrientEvidenceComplete, true);
  const uncertain = scoreBasket(resolveProfile("baseline"), input, { ...basket, exposure: { ...basket.exposure, unknownSubjectIds: ["a"] } });
  assert.equal(uncertain.nutrientEvidenceComplete, false);assert.equal(uncertain.perTarget[0]!.certainty, "unknown");
  assert.ok(uncertain.uncertaintyNotes.includes("unknown_product_amount:a"));
});
