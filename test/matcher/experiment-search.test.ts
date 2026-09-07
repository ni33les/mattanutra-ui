import assert from 'node:assert/strict';
import { test } from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { resolveProfile, withPreferenceWeight } from '../../lib/matcher/experiments/profiles.ts';
import { basketOfCandidate, rankCandidates, runExperimentSearch, type ExperimentCandidate } from '../../lib/matcher/experiments/search.ts';
import { scoreExposure } from '../../lib/matcher/experiments/score.ts';
import type { CanonicalRequest, SearchState } from '../../lib/matcher/types.ts';
import { catalog, product, request } from './flexible-v5-fixtures.ts';

const powder = product('powder', { a: 100, b: 200 }, 100, { form: 'powder', dailyPillsPerServing: 0,
  administration: { route: 'oral', physicalUnit: 'scoop', unitsPerServing: 1, doseIncrement: 0.01,
    packQuantity: null, provenance: { status: 'verified', sourceUrl: 'https://example.test/label', sourceText: 'Verified measurable powder portion.', verifiedAt: '2026-09-07T00:00:00Z' } } });

test('EXP-SEARCH-01 baseline delegates unchanged products, doses, advice and ordering', () => {
  const r = request({ maxDailyPills: 1 });
  const c = catalog([product('exact', { a: 100 }), product('partial', { a: 80 }, 50)]);
  const expected = match(r, c);
  const actual = runExperimentSearch({ request: r, catalog: c, profile: resolveProfile('baseline') });
  assert.deepEqual(actual.baseline, expected);
  assert.ok(actual.candidates.length >= 3);
  assert.deepEqual(basketOfCandidate(actual.selected!, r)?.variantIds, expected.selected?.variantIds);
  assert.equal(actual.searchSummary.expansionAttempts, expected.searchSummary?.expansionAttempts);
});

test('EXP-SEARCH-02 quadratic search finds the supported interior optimum at 0.6 servings', () => {
  const r = request();
  const b = { ...r.targets[0]!, subjectId: 'b', name: 'B' };
  const result = runExperimentSearch({ request: { ...r, targets: [...r.targets, b] }, catalog: catalog([powder]),
    profile: resolveProfile('nutrient-quadratic__preferences-off') });
  assert.ok(result.selected);
  assert.deepEqual(result.selected.state.selectedVariantIds, ['seller:powder:x0.6']);
  assert.ok(result.searchSummary.quantityProbes > 0);
  assert.ok(result.searchSummary.expansionAttempts <= 8000);
});

test('EXP-SEARCH-03 all probe work is budgeted and expanded search retains the incumbent', () => {
  const r = request();
  const c = catalog([powder, product('p', { a: 30 }, 80)]);
  const profile = resolveProfile('nutrient-mixed__preferences-quadratic');
  const small = runExperimentSearch({ request: r, catalog: c, profile, budget: 8 });
  assert.ok(small.searchSummary.expansionAttempts <= 8);
  assert.equal(small.searchSummary.complete, false);
  const expanded = runExperimentSearch({ request: r, catalog: c, profile, effort: 'expanded', incumbent: small });
  assert.ok(expanded.candidates.some(row => row.signature === small.selected?.signature));
  assert.ok(expanded.searchSummary.expansionAttempts <= 64000);
});

test('EXP-SEARCH-04 exclusions and fixed physical doses survive experimental search', () => {
  const r = request({ excludeProductIds: ['excluded'], productDoses: [{ productId: 'kept', servingsPerDay: 4 }], maxDailyPills: 0 });
  const result = runExperimentSearch({ request: r, catalog: catalog([product('excluded', { a: 100 }), product('kept', { a: 25 })]),
    profile: resolveProfile('nutrient-linear__preferences-quadratic') });
  assert.ok(result.selected);
  assert.deepEqual(result.selected.state.selectedVariantIds, ['seller:kept:x4']);
  assert.ok(result.candidates.every(row => !row.state.selectedProductIds?.includes('excluded')));
});

test('EXP-SEARCH-05 unknown active pill preference is retained as incomparable', () => {
  const r = request({ maxDailyPills: 2 });
  const result = runExperimentSearch({ request: r, catalog: catalog([product('unknown', { a: 100 }, 100, { pillCountKnown: false })]),
    profile: resolveProfile('nutrient-linear__preferences-quadratic') });
  assert.ok(result.incompleteCandidates.some(row => row.state.selectedProductIds?.includes('unknown')));
  assert.ok(result.incompleteCandidates.every(row => row.score.total === null));
});

test('EXP-SEARCH-06 input ordering cannot change scores, pool identities or selection', () => {
  const r = request({ maxDailyPills: 2 });
  const products = [product('a', { a: 30 }), product('b', { a: 70 })];
  const profile = resolveProfile('nutrient-mixed__preferences-linear');
  const one = runExperimentSearch({ request: r, catalog: catalog(products), profile });
  const two = runExperimentSearch({ request: r, catalog: catalog([...products].reverse()), profile });
  assert.equal(one.selected?.signature, two.selected?.signature);
  assert.equal(one.identity, two.identity);
  assert.deepEqual(one.candidates.map(row => row.signature), two.candidates.map(row => row.signature));
});

test('EXP-SEARCH-07 unknown product amounts remain conditional in baseline and curved search', () => {
  const r = request();
  const c = catalog([product('uncertain', {}, 100, { contributionSubjectIds: ['a'], unknownSafetyAmount: true,
    labelledContributions: [{ subjectId: 'a', name: 'A', amount: null, unit: 'mg' }] })]);
  for (const profile of [resolveProfile('baseline'), resolveProfile('nutrient-quadratic__preferences-off')]) {
    const result = runExperimentSearch({ request: r, catalog: c, profile });
    const candidate = result.candidates.find(row => row.state.count > 0);
    assert.ok(candidate, 'Unknown-labelled purchase choices remain in the comparison');
    assert.equal(candidate.score.complete, true, 'Quantified conditional score remains usable');
    assert.equal(candidate.score.nutrientEvidenceComplete, false);
    assert.equal(candidate.score.perTarget[0]?.certainty, 'unknown');
    assert.ok(candidate.score.uncertaintyNotes.some(note => note.startsWith('unknown_product_amount:')));
  }
});

test('EXP-SEARCH-08 control resources must match both input identity and baseline profile', () => {
  const r = request(), c = catalog([product('a', { a: 100 })]);
  const profile = resolveProfile('nutrient-quadratic__preferences-off');
  const control = runExperimentSearch({ request: r, catalog: c, profile: resolveProfile('baseline') });
  assert.throws(() => runExperimentSearch({ request: { ...r, maxDailyPills: 3 }, catalog: c, profile, control }), /control.*inputs/i);
  const wrongProfile = runExperimentSearch({ request: r, catalog: c, profile });
  assert.throws(() => runExperimentSearch({ request: r, catalog: c, profile, control: wrongProfile }), /control.*baseline/i);
});

test('EXP-SEARCH-09 reported budgets cannot be smaller than baseline expansion or prior work', () => {
  const r = request(), c = catalog([powder, product('p', { a: 30 }, 80)]);
  assert.throws(() => runExperimentSearch({ request: r, catalog: c, profile: resolveProfile('baseline'), effort: 'expanded', budget: 8 }), /baseline.*64.?000/i);
  const profile = resolveProfile('nutrient-mixed__preferences-off');
  const incumbent = runExperimentSearch({ request: r, catalog: c, profile, budget: 16 });
  assert.ok(incumbent.searchSummary.expansionAttempts > 0);
  assert.throws(() => runExperimentSearch({ request: r, catalog: c, profile, effort: 'expanded', incumbent, budget: incumbent.searchSummary.expansionAttempts - 1 }), /budget.*incumbent/i);
});

test('EXP-SEARCH-10 automatic expansion is identical to explicit standard-then-expanded search', () => {
  const r = request(), c = catalog([powder, product('p', { a: 30 }, 80)]);
  const profile = resolveProfile('nutrient-mixed__preferences-linear');
  const standard = runExperimentSearch({ request: r, catalog: c, profile });
  const explicit = runExperimentSearch({ request: r, catalog: c, profile, effort: 'expanded', incumbent: standard });
  const automatic = runExperimentSearch({ request: r, catalog: c, profile, effort: 'expanded' });
  assert.equal(automatic.selected?.signature, explicit.selected?.signature);
  assert.deepEqual(automatic.searchSummary, explicit.searchSummary);
  assert.deepEqual(automatic.candidates.map(row => row.signature), explicit.candidates.map(row => row.signature));
});

function candidate(r: CanonicalRequest, signature: string, exposure: ReadonlyMap<string, bigint>, price = 100): ExperimentCandidate {
  const state: SearchState = { count: 1, delivered: exposure, exposure, nextGroupIndex: 1, pills: 1, price,
    selectedVariantIds: [signature], selectedProductIds: [signature], pillCountKnown: true };
  return { signature, sellerId: 'seller', groups: [], state, score: scoreExposure(resolveProfile('baseline'), r, exposure,
    { productCount: 1, dailyPills: 1, priceMinor: price, currency: 'THB' }) };
}

test('EXP-SEARCH-11 Pareto protection uses exact raw deviations and preserves commercial ties', () => {
  const amount = BigInt('1000000000000000000000000');
  const a = { ...request().targets[0]!, importance: 'required' as const, requested: { ...request().targets[0]!.requested, units: amount } };
  const b = { ...a, subjectId: 'b', name: 'B', importance: 'optional' as const };
  const r = request({ targets: [a, b] });
  const marginallyWorse = candidate(r, 'optional-gain', new Map([['a', amount * BigInt(2) + BigInt(1)], ['b', amount]]));
  const protectedFit = candidate(r, 'protected', new Map([['a', amount * BigInt(2)]]), 200);
  const equivalentCheaper = candidate(r, 'protected-cheaper', new Map([['a', amount * BigInt(2)]]), 100);
  const profile = resolveProfile('nutrient-mixed__preferences-off');
  for (const pool of [[marginallyWorse, protectedFit, equivalentCheaper], [equivalentCheaper, protectedFit, marginallyWorse]]) {
    const result = rankCandidates(profile, r, pool);
    assert.equal(result.selected?.signature, 'protected-cheaper');
    assert.deepEqual(result.rankedCandidates.map(row => row.signature), ['protected-cheaper', 'protected']);
  }
});

test('EXP-SEARCH-12 inactive preferences preserve nutrient-only required-target protection', () => {
  const a = { ...request().targets[0]!, importance: 'required' as const };
  const b = { ...a, subjectId: 'b', name: 'B', importance: 'optional' as const };
  for (const r of [request({ targets: [a, b] }), request({ targets: [a, b], maxDailyPills: 1 })]) {
    const rows = [candidate(r, 'required', new Map([['a', a.requested.units]])),
      candidate(r, 'optional', new Map([['a', a.requested.units * BigInt(4) / BigInt(5)], ['b', b.requested.units]]))];
    const profile = r.maxDailyPills === null ? resolveProfile('nutrient-mixed__preferences-linear') : withPreferenceWeight(resolveProfile('nutrient-mixed__preferences-linear'), 0);
    assert.equal(rankCandidates(profile, r, rows).selected?.signature, 'required');
  }
});

test('EXP-SEARCH-13 an empty complete recommendation preserves the best incomparable purchase fallback', () => {
  const r = request({ maxDailyPills: 2 });
  const result = runExperimentSearch({ request: r, catalog: catalog([
    product('unknown-partial', { a: 80 }, 100, { pillCountKnown: false }),
    product('unknown-exact', { a: 100 }, 300, { pillCountKnown: false })
  ]), profile: resolveProfile('nutrient-mixed__preferences-quadratic') });
  assert.equal(result.selected?.state.count, 0);
  assert.ok(result.purchaseFallback, 'A missing pill count cannot hide every purchase choice');
  assert.deepEqual(result.purchaseFallback.state.selectedVariantIds, ['seller:unknown-exact:x1']);
  assert.equal(result.purchaseFallback.score.complete, false);
  assert.equal(result.purchaseFallback.score.total, null);
  assert.deepEqual(result.purchaseFallback.score.missingComponents, ['daily_pills']);
  assert.ok(result.incompleteCandidates.some(row => row.signature === result.purchaseFallback?.signature));
});
