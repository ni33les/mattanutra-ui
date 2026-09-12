import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
const dose = await import('../../lib/matcher/dose.ts');
const fractions = await import('../../lib/matcher/rational.ts');
let conversions = 0;
let multiplications = 0;
mock.module('../../lib/matcher/dose.ts', { namedExports: { ...dose, amountFromScaled: (...args: Parameters<typeof dose.amountFromScaled>) => { conversions++; return dose.amountFromScaled(...args); } } });
mock.module('../../lib/matcher/rational.ts', { namedExports: { ...fractions, multiply: (...args: Parameters<typeof fractions.multiply>) => { multiplications++; return fractions.multiply(...args); } } });
const { request } = await import('../matcher/flexible-v5-fixtures.ts');
const { doseFitScore, exactDoseFit, compareDoseFit, weightedDoseFitScore } = await import('../../lib/matcher/dose-fit.ts');

test('REF-CPU-01 numerical ranking does not format display doses for losing candidates', () => {
  const input = request({ safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 100, maxUnit: 'mg', sourceScope: 'supplemental' }] });
  conversions = 0;
  const score = doseFitScore(input, new Map([['a', 150_000_000n]]));
  assert.equal(score.total, 1.5, '50% target excess plus independent 2 × 50% reference excess');
  assert.deepEqual(exactDoseFit(score), { num: 3n, den: 2n });
  assert.equal(conversions, 0, 'Ranking needs exact numerical penalties, not display unit conversions');
  const saved = structuredClone(score);
  assert.equal(saved.perTarget[0].exposure, 150); assert.equal(saved.perTarget[0].target, 100);
  assert.equal(saved.perLimit[0].limit, 100); assert.equal(saved.perLimit[0].excess, 0.5);
  assert.ok(conversions > 0, 'Complete persisted score facts remain available');
  const first = conversions; assert.deepEqual(structuredClone(score), saved); assert.equal(conversions, first, 'Display facts materialise once');
});
test('REF-CPU-02 exact ordering and uniform weighted scoring avoid display allocation', () => {
  const input = request({ scoring: { profile: 'balanced', weights: { nutrients: { a: 2 } } } });
  conversions = 0;
  const below = doseFitScore(input, new Map([['a', 99_999_999n]]));
  const above = doseFitScore(input, new Map([['a', 100_000_001n]]));
  assert.equal(compareDoseFit(below, above), 0);
  const weighted = weightedDoseFitScore(input, new Map([['a', 75_000_000n]])); assert.equal(weighted.total, 0.5);
  assert.equal(conversions, 0);
  assert.equal(weighted.perTarget[0].under, 0.25);
});
test('REF-CPU-03 unchanged subject exposure reuses exact arithmetic across distinct basket maps', () => {
  const input = request(); multiplications = 0;
  const first = doseFitScore(input, new Map([['a', 75_000_000n]]));
  assert.equal(first.total, 0.25); assert.ok(multiplications > 0);
  multiplications = 0;
  const second = doseFitScore(input, new Map([['a', 75_000_000n], ['unrequested', 1n]]));
  assert.equal(second.total, first.total); assert.equal(multiplications, 0, 'Unchanged exact nutrient terms need no repeated endpoint arithmetic');
});
test('REF-CPU-04 neutral rational operations reuse immutable values without changing exact arithmetic', () => {
  const value = fractions.rational(7n, 13n);
  assert.strictEqual(fractions.multiply(value, fractions.ONE), value);
  assert.strictEqual(fractions.add(value, fractions.ZERO), value);
  assert.strictEqual(fractions.divide(value, fractions.ONE), value);
  assert.throws(() => fractions.divide(fractions.ZERO, fractions.ZERO));
  assert.deepEqual(fractions.fromDecimal(123), { num: 123n, den: 1n });
  assert.deepEqual(fractions.fromDecimal('1.25e-2'), { num: 1n, den: 80n });
});

test('REF-CPU-05 moving a basket through the frontier preserves its numerical score cache', async () => {
  const { seedState } = await import('../../lib/matcher/search.ts');
  const { searchStateScore } = await import('../../lib/matcher/practical-scoring.ts');
  const input = request(), seed = seedState(input);
  const score = searchStateScore(input, seed);
  assert.strictEqual(searchStateScore(input, { ...seed, nextGroupIndex: 1 }), score);
  const priced = searchStateScore(input, { ...seed, price: 100 });
  assert.notStrictEqual(priced, score); assert.ok(priced.overallPenalty > score.overallPenalty);
});
test('REF-CPU-06 repeated archive reads reuse immutable basket state within one cursor', async () => {
  const { createSearchCursor, archivedSearchStates } = await import('../../lib/matcher/search-cursor.ts');
  const { DEFAULT_MATCHER_CONFIG } = await import('../../lib/matcher/config.ts');
  const cursor = createSearchCursor([], request(), DEFAULT_MATCHER_CONFIG);
  const first = [...archivedSearchStates(cursor)]; assert.equal(first.length, 1);
  assert.strictEqual([...archivedSearchStates(cursor)][0], first[0]);
  const restored = structuredClone(cursor);
  assert.deepEqual([...archivedSearchStates(restored)], first);
  assert.notStrictEqual([...archivedSearchStates(restored)][0], first[0]);
});
