import assert from 'node:assert/strict';
import { it } from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { closestDoseOption, catalog, product, request } from './flexible-v5-fixtures.ts';
it('V5-COUNT-01: unrestricted baskets preserve all eight required products without padding or truncation', () => {
  const products = Array.from({ length: 8 }, (_, i) => product(`p${i}`, { [`n${i}`]: 100 }));
  const targets = canonicalizeTargets({ targets: products.map((_, i) => ({ subjectId: `n${i}`, name: `N${i}`, amount: 100, unit: 'mg' as const })) }).targets;
  const result = match(request({ targets }), catalog(products));
  assert.equal(result.selected?.productCount, 8);
  assert.equal(result.selected?.coveredCount, 8);
  assert.equal(result.selected?.doseFit?.total, 0);
});
it('V5-COUNT-02: one and two products stay valid despite an explicit zero or one preference', () => {
  const products = [product('a', { a: 100 }), product('b', { b: 100 })];
  const targets = canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 100, unit: 'mg' }, { subjectId: 'b', name: 'B', amount: 100, unit: 'mg' }] }).targets;
  assert.equal(match(request(), catalog(products)).selected?.productCount, 1);
  assert.equal(match(request({ targets }), catalog(products)).selected?.productCount, 2);
  assert.equal(match(request({ targets, maxProductCount: 1 }), catalog(products)).selected?.productCount, 2);
  assert.equal(closestDoseOption(match(request({ targets, maxProductCount: 0 }), catalog(products))).productCount, 2);
});
