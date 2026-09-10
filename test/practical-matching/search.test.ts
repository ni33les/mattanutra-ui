import assert from 'node:assert/strict';
import test from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { catalog, product, request } from '../matcher/flexible-v5-fixtures.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import type { ProductAdministration } from '../../lib/product-administration.ts';
import { canonicalTargetSetHash } from '../../lib/matcher/canonicalizer.ts';
import { createMatchCursor, advanceMatchCursor, matchCursorAttempts } from '../../lib/matcher/match-cursor.ts';
import { DEFAULT_MATCHER_CONFIG } from '../../lib/matcher/config.ts';

function administration(units: number): ProductAdministration { return { route: 'oral', physicalUnit: 'tablet', unitsPerServing: units,
  doseIncrement: 1, packQuantity: 60, provenance: { status: 'verified', sourceUrl: 'https://example.com/controlled-label', sourceText: 'Controlled fixture label: verified tablet serving and pack basis.', verifiedAt: '2026-09-10' } }; }
const tablet = (id: string, amount: number, units: number, price = 10000) => product(id, { a: amount }, price, { administration: administration(units), dailyPillsPerServing: units, pillCountKnown: true });

test('PRACTICAL-SEARCH-01 strong profile selects a useful routine while retaining closest-dose choice', () => {
  const input = request({ maxDailyPills: 3, preferenceImportance: { maxDailyPills: 'strong' } });
  const result = match(input, catalog([tablet('sixteen', 100, 16), tablet('manageable', 80, 3)]));
  assert.ok(result.selected && result.selected.productCount > 0);
  assert.deepEqual(result.selected.productIds, ['manageable']); assert.ok(result.selected.dailyPills <= 4);
  assert.ok(result.selected.roles?.includes('best_match')); assert.ok(!result.selected.roles?.includes('closest_dose'));
  const closest = result.alternatives.find(row => row.roles?.includes('closest_dose'));
  assert.ok(closest); assert.equal(closest.doseFit?.total, 0); assert.equal(closest.purchaseEligible, true);
});

test('PRACTICAL-SEARCH-02 weighted price objective changes selection without changing eligibility', () => {
  const shelf = catalog([tablet('cheap-near', 97, 1, 1000), tablet('exact', 100, 1, 30000)]);
  const balanced = match(request(), shelf), cheaper = match(request({ optimization: 'lowest_cost' }), shelf);
  assert.deepEqual(balanced.selected?.productIds, ['exact']); assert.deepEqual(cheaper.selected?.productIds, ['cheap-near']);
  assert.ok(cheaper.alternatives.some(row => row.productIds.includes('exact') && row.roles?.includes('closest_dose')));
  assert.deepEqual(balanced.rejected, cheaper.rejected);
});

test('PRACTICAL-SEARCH-03 supported interior quantity is explored within the same budget', () => {
  const input = request({ maxDailyPills: 5, preferenceImportance: { maxDailyPills: 'strong' } });
  const result = match(input, catalog([tablet('interior', 125, 10)]));
  assert.ok(result.selected); assert.equal(result.selected.variantDoses?.[0].dailyUnits, 0.6);
  assert.equal(result.selected.dailyPills, 6); assert.equal(result.selected.doseFit?.total, 0.25);
  assert.ok(result.searchSummary.expansionAttempts <= 8000);
});

test('PRACTICAL-SEARCH-04 unknown administration does not become a zero-pill advantage', () => {
  const result = match(request({ maxDailyPills: 2 }), catalog([tablet('known', 100, 2), product('unknown', { a: 100 }, 10000, { dailyPillsPerServing: 0, pillCountKnown: false })]));
  assert.deepEqual(result.selected?.productIds, ['known']);
  const unknown = [result.selected, ...result.alternatives].find(row => row?.productIds.includes('unknown'));
  if (unknown) assert.equal(unknown.pillCountKnown, false);
  assert.equal(result.selected?.purchaseEligible, true);
});

test('PRACTICAL-SEARCH-05 optional-only improvements cannot displace core coverage', () => {
  const targets = canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 100, unit: 'mg', importance: 'core' }, { subjectId: 'b', name: 'B', amount: 100, unit: 'mg', importance: 'optional' }] }).targets;
  const result = match(request({ targets }), catalog([tablet('core', 100, 1), product('optional-trade', { a: 90, b: 100 }, 10000, { administration: administration(1), dailyPillsPerServing: 1, pillCountKnown: true })]));
  assert.deepEqual(result.selected?.productIds, ['core']);
});

test('PRACTICAL-SEARCH-06 numerical preferences never veto fixed quantities or purchase choices', () => {
  const result = match(request({ maxDailyPills: 0, maxProductCount: 0, maxPriceMinor: 0, preferenceImportance: { maxDailyPills: 'strong' }, productDoses: [{ productId: 'fixed', servingsPerDay: 4 }] }), catalog([tablet('fixed', 100, 1)]));
  assert.ok(result.selected); assert.equal(result.selected.variantDoses?.[0].dailyUnits, 4); assert.equal(result.selected.purchaseEligible, true);
  assert.equal(result.selected.safety.hardBlocked, false); assert.equal(result.selected.safety.requiresAck, false);
});

test('PRACTICAL-SEARCH-07 importance and budget basis identify immutable matching inputs', () => {
  const input = request({ maxDailyPills: 3 });
  assert.notEqual(canonicalTargetSetHash(input), canonicalTargetSetHash({ ...input, preferenceImportance: { maxDailyPills: 'strong' } }));
  assert.notEqual(canonicalTargetSetHash(input), canonicalTargetSetHash({ ...input, pricePreferenceBasis: 'monthly_30_days' }));
});

test('PRACTICAL-SEARCH-08 checkpointing every attempt preserves quantity search and work counts', () => {
  const input = request({ maxDailyPills: 5, preferenceImportance: { maxDailyPills: 'strong' } });
  const shelf = catalog([tablet('interior', 125, 10)]);
  let cursor = createMatchCursor(input, shelf, DEFAULT_MATCHER_CONFIG);
  let previous = 0;
  while (!cursor.done) {
    advanceMatchCursor(cursor, input, 1);
    const attempts = matchCursorAttempts(cursor); assert.ok(attempts - previous <= 1); previous = attempts;
    assert.ok(previous <= 8000); cursor = structuredClone(cursor);
  }
  const resumed = match(input, shelf, DEFAULT_MATCHER_CONFIG, undefined, undefined, cursor), direct = match(input, shelf);
  assert.deepEqual(resumed, direct); assert.equal(resumed.selected?.variantDoses?.[0].dailyUnits, 0.6);
});

test('PRACTICAL-SEARCH-09 nonterminating serving fractions keep exact burdens and monthly pack rounding', () => {
  const p = tablet('thirds', 60, 3);
  const shelf = catalog([{ ...p, administration: { ...administration(3), packQuantity: 50 } }]);
  const result = match(request({ pricePreferenceBasis: 'monthly_30_days', maxPriceMinor: 50000, productDoses: [{ productId: 'thirds', servingsPerDay: 5 / 3 }] }), shelf);
  assert.ok(result.selected?.overallScore);
  assert.equal(result.selected.dailyPills, 5); assert.equal(result.selected.overallScore.preferences.maxPriceMinor.actual, 30000);
  assert.deepEqual(result.selected.overallScore.overallExact, { numerator: '289', denominator: '1800' });
});

test('PRACTICAL-SEARCH-10 an empty practical winner does not claim the closest dose fit', () => {
  const result = match(request({ maxProductCount: 0, preferenceImportance: { maxProductCount: 'strong' } }), catalog([tablet('exact', 100, 1)]));
  assert.equal(result.selected?.productCount, 0);
  assert.ok(result.selected?.roles?.includes('best_match'));
  assert.ok(!result.selected?.roles?.includes('closest_dose'));
  const closest = result.alternatives.find(option => option.roles?.includes('closest_dose'));
  assert.ok(closest); assert.equal(closest.doseFit?.total, 0); assert.equal(closest.purchaseEligible, true);
  assert.equal(result.matchingDiagnostics?.reasonCode, 'empty_practical_fit');
});

test('PRACTICAL-SEARCH-11 stronger pill importance changes the routine and still allows a modest overrun', () => {
  const shelf = catalog([tablet('importance-interior', 125, 10)]);
  const normal = match(request({ maxDailyPills: 5 }), shelf);
  const strong = match(request({ maxDailyPills: 5, preferenceImportance: { maxDailyPills: 'strong' } }), shelf);
  assert.equal(normal.selected?.dailyPills, 8);
  assert.equal(normal.selected?.doseFit?.total, 0);
  assert.equal(strong.selected?.dailyPills, 6);
  assert.equal(strong.selected?.doseFit?.total, 0.25);
  assert.ok(strong.selected!.dailyPills > 5, 'A modest overrun remains legitimate when its dose benefit wins');
  assert.equal(strong.selected?.purchaseEligible, true);
});

test('PRACTICAL-SEARCH-12 an optional improvement with unchanged required fit is weighed rather than excluded', () => {
  const targets = canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 100, unit: 'mg', importance: 'core' }, { subjectId: 'b', name: 'B', amount: 100, unit: 'mg', importance: 'optional' }] }).targets;
  const optional = product('optional', { b: 100 }, 10000, { administration: administration(1), dailyPillsPerServing: 1, pillCountKnown: true });
  const result = match(request({ targets }), catalog([tablet('core', 100, 1), optional]));
  assert.ok(result.selected); assert.deepEqual([...result.selected.productIds].sort(), ['core', 'optional']);
  assert.equal(result.selected.doseFit?.total, 0);
  assert.ok(result.selected.roles?.includes('closest_dose'));
});
