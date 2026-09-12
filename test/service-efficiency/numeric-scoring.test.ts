import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
const dose = await import('../../lib/matcher/dose.ts');
let conversions = 0;
mock.module('../../lib/matcher/dose.ts', { namedExports: { ...dose, amountFromScaled: (...args: Parameters<typeof dose.amountFromScaled>) => { conversions++; return dose.amountFromScaled(...args); } } });
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
