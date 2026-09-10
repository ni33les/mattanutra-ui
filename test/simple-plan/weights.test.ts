import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from '../matcher/flexible-v5-fixtures.ts';
import { scorePracticalPenalties, overallMatchingScore, resolvePracticalProfile } from '../../lib/matcher/practical-scoring.ts';

const actual = { dailyPills: 16, pillLowerBound: 16, productCount: 1, priceMinor: 10000, currency: 'THB', servings: [1], uncertainProductCount: 0 };
// Extra policy input is intentional behavioural RED: the existing evaluator ignores it.
const weighted = (weights: Record<string, unknown>, overrides = {}) => ({ ...request(overrides), scoring: { profile: 'balanced', weights } });
const exposure = (n: number) => new Map([['a', BigInt(n) * 1000000n]]);
test('SPLAN-WGT-01/07 effective pill weight applies once, independent of old importance', () => {
  const input = weighted({ pills: 2 }, { maxDailyPills: 3, preferenceImportance: { maxDailyPills: 'strong' } });
  assert.equal(scorePracticalPenalties(input, actual).preferences.maxDailyPills.penalty, 169 / 18);
});
test('SPLAN-WGT-08 ingredient zero ignores fitting while retaining the requested target', () => {
  const scores = [0, 50, 100].map(n => overallMatchingScore(weighted({ nutrients: { a: 0 } }), exposure(n), actual).overallPenalty);
  assert.equal(scores[1] - scores[0], 0); assert.equal(scores[2] - scores[0], 0);
});
test('SPLAN-WGT-03/10 fractional importance scales symmetric fitting without avoidance', () => {
  const low = overallMatchingScore(weighted({ nutrients: { a: 0.25 } }), exposure(0), actual);
  const high = overallMatchingScore(weighted({ nutrients: { a: 0.25 } }), exposure(100), actual);
  // Compare the exact rational delta; subtracting two display floats introduces rounding.
  const h = high.overallExact, l = low.overallExact;
  assert.equal(4n * (BigInt(l.numerator) * BigInt(h.denominator) - BigInt(h.numerator) * BigInt(l.denominator)), BigInt(h.denominator) * BigInt(l.denominator));
  assert.equal(overallMatchingScore(weighted({ nutrients: { a: 2 } }), exposure(50), actual).dosePenalty, 0.5);
});
test('SPLAN-WGT-03 fixed safety excess survives zero ingredient fitting weight', () => {
  const input = weighted({ nutrients: { a: 0 } }, { safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 120, maxUnit: 'mg' }] });
  const difference = overallMatchingScore(input, exposure(150), actual).overallPenalty - overallMatchingScore(input, exposure(100), actual).overallPenalty;
  assert.equal(difference, 0.5); // Only 2*(150-120)/120; fitting is disabled.
});
test('SPLAN-WGT-10 zero pill weight removes the quantity preference from ranking', () => {
  const input = weighted({ pills: 0 }, { maxDailyPills: 20 });
  const more = scorePracticalPenalties(input, actual).total;
  const less = scorePracticalPenalties(input, { ...actual, dailyPills: 1, pillLowerBound: 1 }).total;
  assert.equal(more, less);
});
test('SPLAN-WGT-09 presets are bounded explicit assignments', () => {
  const profile = resolvePracticalProfile({ ...request(), scoring: { profile: 'fewest_pills', weights: {} } });
  assert.deepEqual(profile.multipliers, { pills: 2, products: 1.5, price: 1, servings: 2 });
});
test('SPLAN-WGT-11 uncertainty selects the complete weighted worst endpoint anew; independent safety survives zero', async () => {
  const { canonicalizeCurrents } = await import('../../lib/matcher/canonicalizer.ts');
  const { weightedDoseFitScore, doseFitScore } = await import('../../lib/matcher/dose-fit.ts');
  const dietary = canonicalizeCurrents([{ name: 'A', subjectId: 'a', dailyAmount: 0, unit: 'mg', sourceId: 'food', certainty: 'estimated' }]);
  assert.ok(Array.isArray(dietary));
  const base = request();
  const input = { ...base, targets: base.targets.map(row => ({ ...row, basis: 'total_daily' })),
    dietaryIntake: dietary.map(row => ({ ...row, minimumDailyAmount: 0, maximumDailyAmount: 160 })),
    safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 150, maxUnit: 'mg', sourceScope: 'total' }],
    scoring: { profile: 'balanced', weights: { nutrients: { a: 0 } } } };
  assert.equal(doseFitScore(input, exposure(0)).total, 1); // low endpoint: 100% shortfall
  assert.equal(weightedDoseFitScore(input, exposure(0)).total, 2 / 15); // high endpoint: 2 * 10/150
  for (const weight of [1, 2]) {
    const known = { ...base, scoring: { profile: weight === 1 ? 'balanced' : 'best_coverage', weights: {} },
      safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 120, maxUnit: 'mg' }] };
    assert.equal(weightedDoseFitScore(known, exposure(150)).total, weight * .5 + .5);
  }
});
