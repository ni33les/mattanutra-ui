import assert from 'node:assert/strict';
import { it } from 'node:test';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { match } from '../../lib/matcher/index.ts';
import { catalog, product, request } from './flexible-v5-fixtures.ts';

const targets = canonicalizeTargets({ targets: ['a', 'b'].map(subjectId => ({ subjectId, name: subjectId.toUpperCase(), amount: 100, unit: 'mg' as const })) }).targets;
const requirements = request({ targets, maxProductCount: 3, maxDailyPills: 3 });
const products = [product('00-a', { a: 10 }), product('01-b', { b: 10 }),
  ...Array.from({ length: 30 }, (_, index) => product(`d${String(index).padStart(3, '0')}`, { a: 51 + index, b: 1 })),
  product('zz-complement', { a: 90, b: 90 })];

it('V5-REPAIR-01: repair improves a leading pair after a large catalogue exhausts pair exploration', () => {
  const result = match(requirements, catalog(products));
  // Neither low-contribution product is attractive alone. The three one-unit
  // products uniquely provide A10+90=100 and B10+90=100 within three pills.
  assert.deepEqual(result.selected?.productIds, ['00-a', '01-b', 'zz-complement']);
  assert.equal(result.selected?.doseFit?.total, 0);
  assert.equal(result.selected?.priceMinor, 300);
  assert.equal(result.selected?.dailyPills, 3);
  assert.equal(result.selected?.productCount, 3);
  assert.equal(result.selected?.coveredCount, 2);
  assert.ok(result.searchSummary!.expansionAttempts <= 8000);
});

it('V5-REPAIR-02: reserved repair remains deterministic, keeps the expanded incumbent, and respects exclusions', () => {
  const standard = match(requirements, catalog(products));
  const reversed = match(requirements, catalog([...products].reverse()));
  assert.deepEqual(reversed, standard);
  const expanded = match({ ...requirements, searchEffort: 'expanded' }, catalog(products));
  assert.ok(expanded.selected!.doseFit!.total <= standard.selected!.doseFit!.total);
  assert.ok(expanded.searchSummary!.expansionAttempts <= 64000);
  const excluded = match({ ...requirements, excludeProductIds: ['01-b'] }, catalog(products));
  assert.ok(excluded.selected!.doseFit!.total > 0);
  assert.ok([excluded.selected!, ...excluded.alternatives].every(option => !option.productIds.includes('01-b')));
  assert.equal(excluded.selected?.purchaseEligible, true);
});
