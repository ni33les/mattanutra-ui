import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog, product, request } from '../matcher/flexible-v5-fixtures.ts';
import { compileGroups } from '../../lib/matcher/candidates.ts';
import { DEFAULT_MATCHER_CONFIG } from '../../lib/matcher/config.ts';
import { seedState, tryAddVariant } from '../../lib/matcher/search.ts';
import { advanceSearchCursor, archivedSearchStates, createSearchCursor, searchCursorResult } from '../../lib/matcher/search-cursor.ts';
import { encodeSearchCursor, decodeSearchCursor } from '../../lib/matcher/cursor-codec-server.ts';
import type { CanonicalRequest, MatcherProduct } from '../../lib/matcher/types.ts';

function explore(input: CanonicalRequest, products: MatcherProduct[]) {
  const cursor = createSearchCursor(compileGroups(input, catalog(products)), input, DEFAULT_MATCHER_CONFIG);
  while (!cursor.done) advanceSearchCursor(cursor, input, 31);
  return [...archivedSearchStates(cursor)];
}

test('SEARCH-WORK-01 additions to already covered targets are pruned without changing purchase eligibility', () => {
  const input = request(), products = [product('a', { a: 100 }), product('b', { a: 100 })];
  const states = explore(input, products);
  assert.ok(states.some(row => row.selectedProductIds?.includes('a')));
  assert.ok(states.some(row => row.selectedProductIds?.includes('b')));
  assert.equal(states.some(row => row.count === 2), false, 'An additional 100 mg cannot improve an already covered 100 mg target');
  const groups = compileGroups(input, catalog(products));
  const first = tryAddVariant(seedState(input), groups[0]!.variants.find(row => row.dailyUnits === 1)!, groups[0]!, input)!;
  assert.ok(tryAddVariant(first, groups[1]!.variants.find(row => row.dailyUnits === 1)!, groups[1]!, input), 'Pruning must not become a purchase veto');
});

test('SEARCH-WORK-02 fixed quantities and retained products are not pruned for overdosing', () => {
  const products = [product('a', { a: 100 }), product('b', { a: 100 })];
  for (const input of [request({ retainProductIds: ['a', 'b'] }), request({ productDoses: [{ productId: 'a', servingsPerDay: 1 }, { productId: 'b', servingsPerDay: 1 }], maxProductCount: 0 })]) {
    assert.ok(explore(input, products).some(row => row.count === 2 && row.exposure.get('a') === 200_000_000n));
  }
});

test('SEARCH-WORK-03 uncertain intake and unverified contributions cannot establish a pruning proof', () => {
  const input = request({ currentSupplements: [{ subjectId: 'a', name: 'A', dailyAmount: 100, unit: 'mg', daily: { subjectId: 'a', dim: 'mass_ng', units: 100_000_000n }, certainty: 'estimated', minimumDailyAmount: 0, maximumDailyAmount: 200 }] });
  assert.ok(explore(input, [product('a', { a: 10 }), product('b', { a: 10 })]).some(row => row.count === 2));
  assert.ok(explore(request(), [product('a', { a: 100 }), product('unknown', { a: 1 }, 100, { unknownSafetyAmount: true })]).some(row => row.count === 2));
});

test('SEARCH-WORK-04 no-purchase winners retain nonempty alternatives and monthly-cost uncertainty stays conservative', () => {
  const input = request({ currentSupplements: [{ subjectId: 'a', name: 'A', dailyAmount: 100, unit: 'mg', daily: { subjectId: 'a', dim: 'mass_ng', units: 100_000_000n }, certainty: 'known' }] });
  const products = [product('a', { a: 100 }), product('b', { a: 100 })];
  assert.ok(explore(input, products).some(row => row.count === 1));
  assert.ok(explore(request({ pricePreferenceBasis: 'monthly_30_days' }), products).some(row => row.count === 2));
});

function repairOpportunity() {
  const input = request();
  const groups = compileGroups(input, catalog([product('base', { a: 97 }), product('complement', { a: 1 })]));
  const baseIndex = groups.findIndex(row => row.productId === 'base'), index = groups.findIndex(row => row.productId === 'complement');
  const parent = tryAddVariant(seedState(input), groups[baseIndex]!.variants.find(row => row.dailyUnits === 1)!, groups[baseIndex]!, input)!;
  const cursor = createSearchCursor(groups, input, { ...DEFAULT_MATCHER_CONFIG, exactGroupLimit: 0, expansionBudget: 4 });
  // A real partial basket entering a bounded beam layer, with its full remaining allowance.
  Object.assign(cursor, { phase: 'beam', beam: [parent], group: index, groupLimit: 4, beamLimit: 4 });
  return { input, cursor };
}

test('SEARCH-WORK-05 a supported residual completion is explored before distant interior probes spend the layer', () => {
  const { input, cursor } = repairOpportunity();
  while (!cursor.done) advanceSearchCursor(cursor, input, 4);
  assert.equal(cursor.expansionAttempts, 4);
  assert.ok([...archivedSearchStates(cursor)].some(row => row.count === 2 && row.exposure.get('a') === 100_000_000n), '97 mg plus three supported 1 mg units must receive an opportunity');
});

test('SEARCH-WORK-06 quantity ordering is identical after one-attempt checkpoints', () => {
  const { input, cursor } = repairOpportunity(), control = repairOpportunity().cursor;
  advanceSearchCursor(cursor, input, 1);
  let recovered = decodeSearchCursor(encodeSearchCursor(cursor), cursor.identity);
  while (!recovered.done) {
    advanceSearchCursor(recovered, input, 1);
    recovered = decodeSearchCursor(encodeSearchCursor(recovered), recovered.identity);
  }
  advanceSearchCursor(control, input, 4);
  assert.deepEqual(searchCursorResult(recovered, input), searchCursorResult(control, input));
});
