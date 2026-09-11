import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from '../matcher/flexible-v5-fixtures.ts';
import { doseFitScore, weightedDoseFitScore } from '../../lib/matcher/dose-fit.ts';
import { compareOverallScores, overallMatchingScore, requestForProfile, resolvePracticalProfile } from '../../lib/matcher/practical-scoring.ts';

const actual = { dailyPills: 2, pillLowerBound: 2, productCount: 1, priceMinor: 48500, currency: 'THB', servings: [2], uncertainProductCount: 0 };
const exposure = new Map([['a', 100000000n]]);

test('EFF-HOT-01 repeated exact comparisons decode each restored score once', () => {
  const input = request();
  const left = structuredClone(overallMatchingScore(input, exposure, actual));
  const right = structuredClone(overallMatchingScore(input, exposure, { ...actual, priceMinor: 48501 }));
  let reads = 0;
  for (const score of [left, right]) {
    const numerator = score.overallExact.numerator;
    Object.defineProperty(score.overallExact, 'numerator', { get() { reads++; return numerator; } });
  }
  for (let i = 0; i < 30; i++) assert.equal(compareOverallScores(left, right), -1);
  assert.equal(reads, 2, 'Restored exact values are decoded once, not on every comparison');
});

test('EFF-HOT-02 an immutable conversational request reuses its resolved profile', () => {
  const input = request({ scoring: { profile: 'balanced', weights: {} } });
  assert.strictEqual(resolvePracticalProfile(input), resolvePracticalProfile(input));
  const changed = { ...input, scoring: { profile: 'balanced' as const, weights: { pills: 2 } } };
  assert.notEqual(resolvePracticalProfile(changed).hash, resolvePracticalProfile(input).hash);
});

test('EFF-HOT-03 profile representatives share the unweighted nutrient calculation', () => {
  const input = request({ scoring: { profile: 'balanced', weights: {} } });
  const base = doseFitScore(input, exposure);
  for (const name of ['lowest_cost', 'fewest_pills', 'best_coverage'] as const) {
    const profile = requestForProfile(input, name);
    assert.strictEqual(doseFitScore(profile, exposure), base, 'Only weights change; raw dose facts are reusable');
    assert.deepEqual(weightedDoseFitScore(profile, exposure), weightedDoseFitScore(structuredClone(profile), exposure));
  }
});

test('EFF-HOT-04 shared inputs never reuse another profile\'s weighted uncertainty endpoint', () => {
  const input = request({ scoring: { profile: 'balanced', weights: { nutrients: { a: 0 } } },
    safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 120, maxUnit: 'mg', sourceScope: 'total' }],
    dietaryIntake: [{ subjectId: 'a', name: 'A', unit: 'mg', dailyAmount: 50, minimumDailyAmount: 0, maximumDailyAmount: 100,
      daily: { subjectId: 'a', dim: 'mass_ng', units: 50000000n }, certainty: 'estimated', sourceId: 'food' }] });
  const supplied = new Map([['a', 50000000n]]);
  const zero = weightedDoseFitScore(input, supplied);
  assert.equal(zero.total, 0.5, 'Zero fitting weight preserves 2 × (150−120)/120');
  for (const name of ['lowest_cost', 'best_coverage'] as const) {
    const profile = requestForProfile(input, name);
    assert.deepEqual(weightedDoseFitScore(profile, supplied), weightedDoseFitScore(structuredClone(profile), supplied));
    assert.equal(weightedDoseFitScore(profile, supplied).total, name === 'best_coverage' ? 1.5 : 1);
  }
  assert.strictEqual(weightedDoseFitScore(input, supplied), zero);
});
