import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from '../matcher/flexible-v5-fixtures.ts';
import { seedState } from '../../lib/matcher/search.ts';
import { numericalSearchStateScore, overallMatchingScore, requestForProfile, searchStateScore } from '../../lib/matcher/practical-scoring.ts';

test('PERF-CPU-67 the usual one-score exposure cache does not allocate an array bucket', () => {
  const input = request({ scoring: { profile: 'balanced', weights: {} } });
  const state = seedState(input);
  const original = WeakMap.prototype.set;
  let buckets = 0;
  WeakMap.prototype.set = function(key, value) {
    if (key === state.exposure && Array.isArray(value)) buckets++;
    return original.call(this, key, value);
  };
  try {
    for (const name of ['balanced', 'lowest_cost', 'fewest_pills', 'best_coverage'] as const) {
      const profile = requestForProfile(input, name);
      const score = numericalSearchStateScore(profile, state);
      assert.strictEqual(numericalSearchStateScore(profile, { ...state, nextGroupIndex: 9 }), score);
      assert.equal(score.doseExact.num / score.doseExact.den, 1n);
    }
  } finally { WeakMap.prototype.set = original; }
  assert.equal(buckets, 0, 'One score must not need a separate array container for every candidate/profile');
});

test('PERF-CPU-68 shared exposure never aliases distinct pill, price, serving or monthly measurements', () => {
  const input = request({ pricePreferenceBasis: 'monthly_30_days', maxPriceMinor: 9000 });
  const seed = seedState(input);
  const states = Array.from({ length: 11 }, (_, i) => ({ ...seed, pills: i / 2, price: 10000 + i,
    routineServings: [1 + i / 10], servingBurden: undefined, count: 1,
    monthlyPriceMinor: i % 2 ? null : 20000 + i, monthlyPriceLowerBound: 20000 + i,
    uncertainAdministrationCount: i % 2, pillCountKnown: i % 2 === 0 }));
  for (const state of [...states, ...states.slice().reverse()]) {
    const actual = { dailyPills: state.pillCountKnown ? state.pills : null, pillLowerBound: state.pills,
      priceMinor: state.price, currency: input.currency, servings: state.routineServings,
      productCount: state.count, uncertainProductCount: state.uncertainAdministrationCount,
      monthlyPriceMinor: state.monthlyPriceMinor, monthlyPriceLowerBound: state.monthlyPriceLowerBound };
    assert.deepEqual(searchStateScore(input, state), overallMatchingScore(input, state.exposure, actual));
  }
});
