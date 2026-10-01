import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const selector = await import('../../lib/matcher/selector.ts');
let selections = 0;
mock.module('../../lib/matcher/selector.ts', { namedExports: { ...selector,
  selectOptions: (...args: Parameters<typeof selector.selectOptions>) => { selections++; return selector.selectOptions(...args); }
} });
const { request, product, catalog } = await import('../matcher/flexible-v5-fixtures.ts');
const { match } = await import('../../lib/matcher/index.ts');

test('EFF-SIX-07 finalization reuses selection when no seller offers were added', () => {
  selections = 0;
  const result = match(request(), catalog([product('one', { a: 50 })]));
  assert.ok(result.selected);
  assert.equal(result.selected.coverageBySubject.get('a'), 10000);
  assert.equal(selections, 1);
});

test('EFF-SIX-08 added seller offers still trigger final selection and retain the cheaper seller', () => {
  selections = 0;
  const result = match(request(), catalog([
    product('one', { a: 50 }, 200), product('one', { a: 50 }, 100, { sellerId: 'cheaper', sellerName: 'Cheaper' })
  ]));
  assert.equal(selections, 2);
  assert.equal(result.selected?.sellerId, 'cheaper');
  assert.equal(result.selected?.coverageBySubject.get('a'), 10000);
});
