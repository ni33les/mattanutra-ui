import assert from 'node:assert/strict';
import { it } from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { qaProduct, qaRequest } from '../../lib/matcher/qa/index.ts';

// The original phase-2 catalogue prices and nutrient amounts are deliberately
// unchanged. These are known feasible witnesses, independent of search/scoring.
const isolatedTargets = [
  qaProduct({ id: 'G-MAG-200', pills: 1, priceThb: 120, facts: [{ key: 'mag', amount: 200 }] }),
  qaProduct({ id: 'G-O3-FISH-1000', dietary: 'fish', omega: 'fish', form: 'softgel', pills: 2, priceThb: 300, facts: [{ key: 'omega', amount: 1000 }] }),
  qaProduct({ id: 'G-C-500', pills: 1, priceThb: 100, facts: [{ key: 'c', amount: 500 }] }),
  qaProduct({ id: 'G-CALCIUM-D3-200', title: 'Bio Calcium+D3', pills: 1, priceThb: 175, facts: [{ key: 'd3', amount: 200 }] }),
  qaProduct({ id: 'G-MEGA-B-50', pills: 1, priceThb: 97, facts: [{ key: 'b12', amount: 50 }] }),
  qaProduct({ id: 'G-JOINT-D3', pills: 2, priceThb: 220, facts: [{ key: 'd3', amount: 400 }, { key: 'c', amount: 40 }] }),
  qaProduct({ id: 'G-MULTI-50PLUS', pills: 1, priceThb: 50, facts: [{ key: 'd3', amount: 600 }, { key: 'b12', amount: 5 }, { key: 'c', amount: 90 }] })
];
const noisy = [
  qaProduct({ id: 'G-MAG-200', pills: 1, priceThb: 180, facts: [{ key: 'mag', amount: 200 }] }),
  isolatedTargets[1]!, isolatedTargets[2]!,
  qaProduct({ id: 'G-50PLUS', pills: 1, priceThb: 150, facts: [{ key: 'd3', amount: 600 }, { key: 'mag', amount: 105 }, { key: 'c', amount: 45 }] }),
  ...Array.from({ length: 8 }, (_, index) => qaProduct({ id: `G-JOINT-D3-${index + 1}`, pills: 2, priceThb: 80 + index,
    facts: [{ key: 'd3', amount: 400 }, { key: 'c', amount: 40 }] }))
];
const snapshot = (products: typeof isolatedTargets) => ({ products, availabilityAsOf: '2026-08-26T00:00:00.000Z', catalogueVersion: 'coordinated-repair-frozen' });

it('V5-REPAIR-03: drop collateral C and rescale retained D3 to reach the feasible zero-loss basket', () => {
  const result = match(qaRequest({ optimization: 'fewest_pills' }), snapshot(isolatedTargets));
  assert.ok(result.selected);
  assert.deepEqual([...result.selected.variantIds].sort(), [
    'seller_th:G-C-500:x1', 'seller_th:G-CALCIUM-D3-200:x10', 'seller_th:G-MAG-200:x1',
    'seller_th:G-MEGA-B-50:x5', 'seller_th:G-O3-FISH-1000:x1'
  ]);
  // Each independently known exposure equals its target, so the nonnegative
  // symmetric loss has the absolute lower bound zero. The title adds no calcium.
  assert.equal(result.selected.doseFit?.total, 0);
  assert.deepEqual(Object.fromEntries(result.selected.doseFit!.perTarget.map(row => [row.subjectId, row.exposure])),
    { sup_b12: 250, sup_c: 500, sup_d3: 2000, sup_mag: 200, sup_omega: 1000 });
  assert.equal(result.selected.priceMinor, (120 + 300 + 100 + 175 + 97) * 100);
  assert.equal(result.selected.dailyPills, 1 + 2 + 1 + 10 + 5);
  assert.equal(result.selected.coveredCount, 5);
  assert.equal(result.selected.purchaseEligible, true);
  assert.ok(result.searchSummary!.expansionAttempts <= 8000);
});

it('V5-REPAIR-04: early dose variants cannot starve the later complementary catalogue groups', () => {
  const result = match(qaRequest({ optimization: 'fewest_pills', profile: { ageYears: 52, lifeStage: 'adult', sex: 'male' } }), snapshot(noisy));
  assert.ok(result.selected);
  assert.deepEqual([...result.selected.variantIds].sort(), ['seller_th:G-50PLUS:x2', 'seller_th:G-C-500:x1', 'seller_th:G-JOINT-D3-1:x2', 'seller_th:G-O3-FISH-1000:x1']);
  // B12 remains unavailable: 1 + Mg excess 10/200 + C excess 170/500.
  assert.equal(result.selected.doseFit?.total, (200 * 500 + (2 * 105 - 200) * 500 + (2 * 45 + 2 * 40) * 200) / (200 * 500));
  assert.equal(result.selected.priceMinor, (150 + 80 + 100 + 300) * 100);
  assert.equal(result.selected.dailyPills, 2 + 4 + 1 + 2);
  assert.equal(result.selected.doseFit?.perTarget.find(row => row.subjectId === 'sup_d3')?.exposure, 2000);
  assert.ok(result.searchSummary!.expansionAttempts <= 8000);
});

it('V5-REPAIR-05: coordinated repairs preserve catalogue order invariance and the expanded incumbent', () => {
  const request = qaRequest({ optimization: 'fewest_pills' });
  const standard = match(request, snapshot(isolatedTargets));
  assert.deepEqual(match(request, snapshot([...isolatedTargets].reverse())), standard);
  const expanded = match({ ...request, searchEffort: 'expanded' }, snapshot(isolatedTargets));
  assert.equal(expanded.selected?.doseFit?.total, 0);
  assert.deepEqual([...(expanded.selected?.variantIds ?? [])].sort(), [...(standard.selected?.variantIds ?? [])].sort());
  assert.ok(expanded.searchSummary!.expansionAttempts <= 64000);
  assert.equal(expanded.searchSummary?.canExpand, false);
  assert.deepEqual(match({ ...request, searchEffort: 'expanded' }, snapshot(isolatedTargets)), expanded);
});
