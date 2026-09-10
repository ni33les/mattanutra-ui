import { closestDoseOption } from "./flexible-v5-fixtures.ts";
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { DEFAULT_MATCHER_CONFIG } from '../../lib/matcher/config.ts';
import { searchGroups } from '../../lib/matcher/search.ts';
import { compileGroups } from '../../lib/matcher/candidates.ts';
import { catalog, product, request } from './flexible-v5-fixtures.ts';
function fixture() {
  const targets = canonicalizeTargets({ targets: ['a', 'b'].map(subjectId => ({ subjectId, name: subjectId.toUpperCase(), amount: 100, unit: 'mg' as const })) }).targets;
  const r = request({ targets, maxDailyPills: 2, maxProductCount: 2 });
  const products = [product('00-low', { a: 10, b: 1 }), ...Array.from({ length: 30 }, (_, i) => product(`d${String(i).padStart(2, '0')}`, { a: 50 + i, b: 1 })), product('zz-complement', { a: 90, b: 99 })];
  return { r, products };
}
it('V5-SEARCH-01: preserve the 32-product complementary pair that a dose-only beam loses', () => {
  const { r, products } = fixture();
  const result = match(r, catalog(products));
  const selected = closestDoseOption(result);
  assert.deepEqual(selected?.productIds, ['00-low', 'zz-complement']);
  assert.equal(selected?.doseFit?.total, 0);
  assert.equal(selected?.coveredCount, 2);
});
it('V5-SEARCH-02: count every attempted expansion, including rejected additions and repair', () => {
  const { r, products } = fixture();
  const config = { ...DEFAULT_MATCHER_CONFIG, expansionBudget: 17 };
  const result = match(r, catalog(products), config);
  assert.equal(result.searchSummary?.expansionAttempts, 17);
  assert.equal(result.searchSummary?.expansionBudget, 17);
  assert.equal(result.searchSummary?.complete, false);
  assert.equal(result.searchSummary?.canExpand, true);
  const run = searchGroups(compileGroups(r, catalog(products)), r, config);
  assert.equal(run.expansionAttempts, 17);
});
it('V5-SEARCH-03: expanded search preserves its standard incumbent and identifies exhausted recovery', () => {
  const { r, products } = fixture();
  const standard = match(r, catalog(products));
  const expanded = match({ ...r, searchEffort: 'expanded' }, catalog(products));
  assert.ok(expanded.selected!.overallScore!.overallPenalty <= standard.selected!.overallScore!.overallPenalty);
  assert.equal(expanded.searchSummary?.effort, 'expanded');
  assert.equal(expanded.searchSummary?.expansionBudget, 64000);
  assert.ok(expanded.searchSummary!.expansionAttempts <= 64000);
  assert.equal(expanded.searchSummary?.canExpand, false);
});
it('V5-SEARCH-04: catalogue ordering, missing products and explicit repeated exclusions stay deterministic', () => {
  const { r, products } = fixture();
  const normal = match(r, catalog(products));
  const reversed = match(r, catalog([...products].reverse()));
  assert.deepEqual(reversed, normal);
  const missing = match(r, catalog(products.filter(row => row.productId !== 'zz-complement')));
  assert.ok(missing.selected);
  assert.ok(missing.leftovers.some(row => row.subjectId === 'b'));
  assert.equal(missing.selected.purchaseEligible, true);
  const excluded = match({ ...r, excludeProductIds: ['zz-complement', '00-low'] }, catalog(products));
  assert.ok([excluded.selected!, ...excluded.alternatives].every(row => row.productIds.every(id => id !== 'zz-complement' && id !== '00-low')));
});
