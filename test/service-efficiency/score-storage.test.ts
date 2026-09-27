import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from '../matcher/flexible-v5-fixtures.ts';
import { seedState } from '../../lib/matcher/search.ts';
import { overallMatchingScore, searchStateScore } from '../../lib/matcher/practical-scoring.ts';

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
