import assert from 'node:assert/strict';
import { it } from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { catalog, product, request } from './flexible-v5-fixtures.ts';
it('V5-OPTION-01: no-purchase recommendation retains an above-target eligible purchase fallback', () => {
  const result = match(request({ safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 150, maxUnit: 'mg' }] }), catalog([product('large', { a: 300 })]));
  assert.equal(result.selected?.productCount, 0);
  assert.equal(result.selected?.purchaseEligible, false);
  const purchase = result.alternatives.find(row => row.roles?.includes('purchase_fallback'));
  assert.ok(purchase);
  assert.deepEqual(purchase.productIds, ['large']);
  assert.equal(purchase.purchaseEligible, true);
  assert.equal(purchase.safety.hardBlocked, false);
  assert.equal(purchase.safety.requiresAck, false);
  assert.equal(purchase.doseFit?.perTarget[0]?.exposure, 300);
  assert.ok(purchase.doseFit!.weightedLimit > 0);
});
it('V5-OPTION-02: an almost-exact cheap choice accompanies the default exact fit', () => {
  const result = match(request({ optimization: 'lowest_cost', maxDailyPills: 1 }), catalog([product('exact', { a: 100 }, 1000), product('cheap', { a: 99.9 }, 100)]));
  assert.deepEqual(result.selected?.productIds, ['exact']);
  assert.ok(result.selected?.roles?.includes('closest_dose'));
  const cheaper = result.alternatives.find(row => row.roles?.includes('lower_cost'));
  assert.deepEqual(cheaper?.productIds, ['cheap']);
  assert.equal(cheaper?.priceMinor, 100);
  assert.equal(cheaper?.coverageSummary?.[0]?.remainingGap, 0.1);
  assert.equal(cheaper?.purchaseEligible, true);
});
it('V5-OPTION-03: a simpler partial choice remains explicit and option roles are deduplicated', () => {
  const result = match(request({ maxDailyPills: 3 }), catalog([product('sixty', { a: 60 }, 20), product('forty', { a: 40 }, 20), product('ninety', { a: 90 }, 30)]));
  assert.equal(result.selected?.doseFit?.total, 0);
  assert.equal(result.selected?.productCount, 2);
  const simpler = result.alternatives.find(row => row.roles?.includes('simpler'));
  assert.equal(simpler?.productCount, 1);
  assert.equal(simpler?.purchaseEligible, true);
  assert.ok(simpler!.coverageSummary![0]!.remainingGap > 0);
  const all = [result.selected!, ...result.alternatives];
  assert.equal(new Set(all.map(row => row.variantIds.slice().sort().join('|'))).size, all.length);
  assert.ok(all.every(row => new Set(row.roles).size === row.roles?.length));
});
it('V5-OPTION-04: declared nutrients with unknown quantities remain exploration options without fabricated coverage', () => {
  const result = match(request(), catalog([product('unknown', {}, 100, { contributionSubjectIds: ['a'], unknownSafetyAmount: true })]));
  assert.equal(result.selected?.productCount, 0);
  const option = result.alternatives.find(row => row.productIds.includes('unknown'));
  assert.ok(option);
  assert.equal(option.coveredCount, 0);
  assert.equal(option.coverageSummary?.[0]?.newContribution, 0);
  assert.equal(option.purchaseEligible, true);
  assert.ok(option.safety.findings.some(row => row.uncertainty?.length));
});
