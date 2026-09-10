import { closestDoseOption } from "./flexible-v5-fixtures.ts";
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

it('V5-REPAIR-01: closest-dose choice uses three pills and permits the cheaper twenty-pill proposal', () => {
  const result = match(requirements, catalog(products));
  const selected = closestDoseOption(result);
  // The closest-dose choice breaks equal dose fit by routine burden; the cheaper
  // twenty-pill proposal remains selectable despite the advisory preference.
  assert.deepEqual(selected?.variantIds, ['seller:00-a:x1', 'seller:zz-complement:x1', 'seller:01-b:x1']);
  const cheaper = match({ ...requirements, productDoses: [{ productId: '00-a', servingsPerDay: 10 }, { productId: '01-b', servingsPerDay: 10 }] }, catalog(products)).selected;
  assert.ok(cheaper); assert.equal(cheaper.doseFit?.total, 0); assert.equal(cheaper.purchaseEligible, true);
  assert.equal(selected?.doseFit?.total, 0);
  assert.equal(selected?.priceMinor, 300);
  assert.equal(selected?.dailyPills, 3);
  assert.equal(selected?.productCount, 3);
  assert.equal(selected?.coveredCount, 2);
  assert.ok(result.searchSummary!.expansionAttempts <= 8000);
});

it('V5-REPAIR-02: reserved repair remains deterministic, keeps the expanded incumbent, and respects exclusions', () => {
  const standard = match(requirements, catalog(products));
  const reversed = match(requirements, catalog([...products].reverse()));
  assert.deepEqual(reversed, standard);
  const expanded = match({ ...requirements, searchEffort: 'expanded' }, catalog(products));
  assert.ok(expanded.selected!.overallScore!.overallPenalty <= standard.selected!.overallScore!.overallPenalty);
  assert.ok(expanded.searchSummary!.expansionAttempts <= 64000);
  const excluded = match({ ...requirements, excludeProductIds: ['01-b'] }, catalog(products));
  assert.ok(excluded.selected!.doseFit!.total > 0);
  assert.ok([excluded.selected!, ...excluded.alternatives].every(option => !option.productIds.includes('01-b')));
  assert.equal(excluded.selected?.purchaseEligible, true);
});

// Retain the original complementary repair regression using explicit physical
// proposals, which are still firm, rather than a retired numeric veto.
it('ADV6-REPAIR-01: large-catalogue complementary repair completes two proposed one-unit products', () => {
  const result = match({ ...requirements, productDoses: [{ productId: '00-a', servingsPerDay: 1 }, { productId: '01-b', servingsPerDay: 1 }] }, catalog(products));
  const selected = closestDoseOption(result);
  assert.deepEqual(selected?.variantIds, ['seller:00-a:x1', 'seller:zz-complement:x1', 'seller:01-b:x1']);
  assert.equal(selected?.doseFit?.total, 0);
  assert.equal(selected?.priceMinor, 300);
  assert.equal(selected?.dailyPills, 3);
  assert.equal(selected?.productCount, 3);
  assert.equal(selected?.coveredCount, 2);
  assert.ok(result.searchSummary!.expansionAttempts <= 8000);
});
