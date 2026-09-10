import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from '../matcher/flexible-v5-fixtures.ts';
import { compareSearchStates, seedState } from '../../lib/matcher/search.ts';

const scoring = () => import('../../lib/matcher/practical-scoring.ts');
const actuals = (overrides: Record<string, unknown> = {}) => ({ dailyPills: 3, pillLowerBound: 3, productCount: 1,
  priceMinor: 10000, currency: 'THB', servings: [1], uncertainProductCount: 0, ...overrides });

test('PRACTICAL-SCORE-01 strong pill importance beats a small dose improvement in live ranking', () => {
  const input = request({ maxDailyPills: 3, preferenceImportance: { maxDailyPills: 'strong' } });
  const seed = seedState(input), target = input.targets[0].requested.units;
  const excessive = { ...seed, count: 1, pills: 16, price: 10000, exposure: new Map([['a', target]]) };
  const manageable = { ...seed, count: 1, pills: 3, price: 10000, exposure: new Map([['a', target / 2n]]) };
  assert.ok(compareSearchStates(manageable, excessive, input) < 0,
    'A half-target gap costs 0.5; the strong 16-versus-3 preference overrun alone costs 169/9');
});

test('PRACTICAL-SCORE-02 exact quadratic overrun and importance multipliers', async () => {
  const { scorePracticalPenalties } = await scoring();
  for (const [importance, expected] of [['flexible', 169 / 144], ['normal', 169 / 36], ['strong', 169 / 9]] as const) {
    const result = scorePracticalPenalties(request({ maxDailyPills: 3, preferenceImportance: { maxDailyPills: importance } }), actuals({ dailyPills: 16, pillLowerBound: 16 }));
    assert.equal(result.preferences.maxDailyPills.penalty, expected);
    assert.equal(result.preferences.maxDailyPills.actual, 16);
    assert.equal(result.preferences.maxDailyPills.complete, true);
  }
});

test('PRACTICAL-SCORE-03 every excess counts and marginal penalties increase', async () => {
  const { scorePracticalPenalties } = await scoring();
  const score = (n: number) => scorePracticalPenalties(request({ maxDailyPills: 5 }), actuals({ dailyPills: n, pillLowerBound: n })).preferences.maxDailyPills.penalty;
  assert.equal(score(5), 0); assert.equal(score(6), 0.01); assert.ok(score(5.01) > 0);
  assert.ok(score(8) - score(7) > score(7) - score(6));
});

test('PRACTICAL-SCORE-04 zero and omitted preferences have finite distinct semantics', async () => {
  const { scorePracticalPenalties } = await scoring();
  const cleared = scorePracticalPenalties(request(), actuals());
  assert.equal(cleared.preferences.maxDailyPills.penalty, 0); assert.equal(cleared.preferences.maxDailyPills.active, false);
  const zero = scorePracticalPenalties(request({ maxDailyPills: 0, maxProductCount: 0, maxPriceMinor: 0 }), actuals());
  assert.equal(zero.preferences.maxDailyPills.penalty, 2.25);
  assert.equal(zero.preferences.maxProductCount.penalty, 0.25);
  assert.equal(zero.preferences.maxPriceMinor.penalty, 0.25); assert.ok(Number.isFinite(zero.total));
});

test('PRACTICAL-SCORE-05 unknown pills preserve verified lower bound and uncertainty', async () => {
  const { scorePracticalPenalties } = await scoring();
  const score = scorePracticalPenalties(request({ maxDailyPills: 3 }), actuals({ productCount: 2, dailyPills: null, pillLowerBound: 16, uncertainProductCount: 2 }));
  assert.equal(score.preferences.maxDailyPills.actual, null); assert.equal(score.preferences.maxDailyPills.actualLowerBound, 16);
  assert.equal(score.preferences.maxDailyPills.complete, false); assert.equal(score.complete, false);
  assert.equal(score.preferences.maxDailyPills.penalty, 169 / 36); assert.equal(score.components.uncertainty, 0.5);
});

test('PRACTICAL-SCORE-06 routine objectives and 625 labelled servings cannot evade penalties', async () => {
  const { scorePracticalPenalties } = await scoring();
  const base = scorePracticalPenalties(request(), actuals());
  assert.equal(base.components.pills, 0.05); assert.equal(base.components.products, 0.05); assert.equal(base.components.price, 0.005);
  const powder = scorePracticalPenalties(request(), actuals({ dailyPills: 0, pillLowerBound: 0, servings: [15] }));
  assert.equal(powder.components.servings, 9.8);
  const uncertain = scorePracticalPenalties(request(), actuals({ dailyPills: null, pillLowerBound: 0, servings: [625], uncertainProductCount: 1 }));
  assert.equal(uncertain.components.servings, 19468.8); assert.equal(uncertain.components.uncertainty, 0.25);
});

test('PRACTICAL-SCORE-07 shared immutable profile identities differ only by published multipliers', async () => {
  const { scorePracticalPenalties, resolvePracticalProfile } = await scoring();
  const balanced = resolvePracticalProfile(request()), compact = resolvePracticalProfile(request({ optimization: 'fewest_pills' }));
  assert.ok(Object.isFrozen(balanced)); assert.ok(Object.isFrozen(balanced.multipliers)); assert.notEqual(balanced.hash, compact.hash);
  assert.deepEqual(compact.multipliers, { pills: 4, products: 2, price: 1, servings: 4 });
  assert.deepEqual(resolvePracticalProfile(request({ optimization: 'best_coverage' })).multipliers, { pills: 0.25, products: 0.25, price: 0.25, servings: 0.25 });
  assert.equal(scorePracticalPenalties(request({ optimization: 'lowest_cost' }), actuals()).components.price, 0.02);
});

test('PRACTICAL-SCORE-08 invalid profile, importance, currency and measurements fail precisely', async () => {
  const { scorePracticalPenalties, resolvePracticalProfile } = await scoring();
  assert.throws(() => resolvePracticalProfile(request({ optimization: 'unknown' as never })), /optimization/);
  assert.throws(() => resolvePracticalProfile(request({ preferenceImportance: { maxDailyPills: 'hard' as never } })), /maxDailyPills/);
  assert.throws(() => scorePracticalPenalties(request(), actuals({ currency: 'USD' })), /currency/);
  assert.throws(() => scorePracticalPenalties(request(), actuals({ dailyPills: -1 })), /dailyPills/);
  assert.throws(() => scorePracticalPenalties(request(), actuals({ productCount: 1.5 })), /productCount/);
});

test('PRACTICAL-SCORE-09 overall score preserves symmetric dose arithmetic and additional 2x safety excess', async () => {
  const { overallMatchingScore } = await scoring();
  const input = request({ safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 120, maxUnit: 'mg' }] });
  const exposure = (amount: number) => new Map([['a', BigInt(amount) * 1000000n]]);
  assert.equal(overallMatchingScore(request(), exposure(50), actuals()).dosePenalty, 0.5);
  assert.equal(overallMatchingScore(request(), exposure(150), actuals()).dosePenalty, 0.5);
  const above = overallMatchingScore(input, exposure(150), actuals());
  assert.equal(above.dosePenalty, 1); // 50/100 + 2*(150-120)/120.
  assert.equal(above.overallPenalty, 1.105);
});

test('PRACTICAL-SCORE-10 missing pack prices are unavailable without inventing a monetary uncertainty coefficient', async () => {
  const { scorePracticalPenalties } = await scoring();
  const score = scorePracticalPenalties(request({maxPriceMinor:10000,pricePreferenceBasis:'monthly_30_days'}), {
    dailyPills:3,pillLowerBound:3,productCount:1,priceMinor:10000,currency:'THB',servings:[1],uncertainProductCount:0,monthlyPriceMinor:null
  });
  assert.equal(score.preferences.maxPriceMinor.actual,null);
  assert.equal(score.preferences.maxPriceMinor.complete,false);
  assert.equal(score.preferences.maxPriceMinor.penalty,0);
  assert.ok(score.missingComponents.includes('maxPriceMinor'));
  assert.equal(score.components.uncertainty,0, 'The approved 0.25 term applies to unverified administration, not an extra invented monetary weight');
});
