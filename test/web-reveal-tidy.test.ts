import assert from 'node:assert/strict';
import test from 'node:test';
import * as coverage from '../lib/marketing-coverage.ts';
import { resolvePracticalProfile, scorePracticalPenalties } from '../lib/matcher/practical-scoring.ts';
import { compareSearchStates, seedState } from '../lib/matcher/search.ts';
import { canonicalTargetSetHash } from '../lib/matcher/canonicalizer.ts';
import { request } from './matcher/flexible-v5-fixtures.ts';

test('WEB-TIDY-01 reveal counts strictly over 12 percent without changing fully met targets', () => {
  assert.equal(typeof coverage.coveredRevealNeedCount, 'function');
  const rows = [0, 12, 12.001, 99.99, 100, 150, NaN].map(coveragePercent => ({ coveragePercent, itemType: 'supplement' }));
  rows.push({ coveragePercent: 100, itemType: 'food' });
  assert.equal(coverage.coveredRevealNeedCount(rows), 4);
  assert.equal(coverage.coveredFormulaNeedCount(rows), 2);
  assert.equal(coverage.formulaNeedCount(rows), 7);
  assert.equal(coverage.coveredRevealNeedCount([]), 0);
});

test('WEB-TIDY-02 preserved nine-target result covers eight; current eight-target revision covers seven', () => {
  // Allowlisted coverage from DEV plan 50fba381, runs 5fa92cd8 and 36f940a1.
  // Keep historical values separate; no answers, recipient details or price changes.
  const historical = [70, 100, 60, 0.8, 100, 100, 93.33, 57.33, 100].map(coveragePercent => ({ coveragePercent }));
  const current = [90, 100, 60, 0.8, 100, 100, 93.33, 67.33].map(coveragePercent => ({ coveragePercent }));
  assert.equal(coverage.coveredRevealNeedCount(historical), 8);
  assert.equal(coverage.formulaNeedCount(historical), 9);
  assert.equal(coverage.coveredFormulaNeedCount(historical), 4);
  assert.equal(coverage.coveredRevealNeedCount(current), 7);
  assert.equal(coverage.formulaNeedCount(current), 8);
});

test('WEB-TIDY-03 web product penalties use the calibrated web multiplier; other terms and MCP policy stay unchanged', () => {
  const actual = { dailyPills: 3, pillLowerBound: 3, productCount: 3, priceMinor: 10000, currency: 'THB', servings: [1, 1, 1], uncertainProductCount: 0 };
  for (const optimization of ['balanced', 'fewest_pills', 'best_coverage', 'lowest_cost'] as const) {
    for (const maxProductCount of [null, 1, 0]) {
      const control = request({ optimization, maxProductCount });
      const web = { ...control, selectorMode: 'web_single' as const };
      const baseline = scorePracticalPenalties(control, actual), updated = scorePracticalPenalties(web, actual);
      assert.equal(updated.profile.multipliers.products, baseline.profile.multipliers.products * 5);
      assert.equal(updated.components.products, baseline.components.products * 5);
      assert.equal(updated.preferences.maxProductCount.penalty, baseline.preferences.maxProductCount.penalty * 5);
      for (const key of ['pills', 'price', 'servings', 'uncertainty'] as const) assert.equal(updated.components[key], baseline.components[key]);
      assert.notEqual(updated.profile.hash, baseline.profile.hash);
      assert.notEqual(canonicalTargetSetHash(web), canonicalTargetSetHash(control));
      const mcp = request({ scoring: { profile: optimization, weights: {} } });
      assert.deepEqual(resolvePracticalProfile({ ...mcp, selectorMode: 'web_single' }), resolvePracticalProfile(mcp));
    }
  }
});

test('WEB-TIDY-04 shared ranking favours a slightly simpler web routine without imposing a product ceiling', () => {
  const input = request(), web = { ...input, selectorMode: 'web_single' as const };
  const seed = { ...seedState(input), pills: 1, pillCountKnown: true, uncertainAdministrationCount: 0, routineServings: [1], price: 10000 };
  const simpler = { ...seed, count: 1, exposure: new Map([['a', 94000000n]]) };
  const exact = { ...seed, count: 2, exposure: new Map([['a', 100000000n]]) };
  assert.ok(compareSearchStates(exact, simpler, input) < 0, 'Old product delta 0.05 favours closing a 0.06 dose gap');
  assert.ok(compareSearchStates(simpler, exact, web) < 0, 'Web product delta 0.25 favours one product at 94%');
  const largeGap = { ...simpler, exposure: new Map([['a', 50000000n]]) };
  assert.ok(compareSearchStates(exact, largeGap, web) < 0, 'An additional product can still win when its benefit outweighs its cost');
});
