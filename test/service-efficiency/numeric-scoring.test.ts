import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
const canonical = await import('../../lib/agentic/value/canonical.ts');
let canonicalWrites = 0;
mock.module('../../lib/agentic/value/canonical.ts', { namedExports: { ...canonical,
  canonicalJson: (...args: Parameters<typeof canonical.canonicalJson>) => { canonicalWrites++; return canonical.canonicalJson(...args); } } });
const dose = await import('../../lib/matcher/dose.ts');
const fractions = await import('../../lib/matcher/rational.ts');
let conversions = 0, unitCompilations = 0, exactEncodings = 0;
let multiplications = 0; let measurements = 0;
mock.module('../../lib/matcher/dose.ts', { namedExports: { ...dose, scaleAmount: (...args: Parameters<typeof dose.scaleAmount>) => { unitCompilations++; return dose.scaleAmount(...args); }, amountFromScaled: (...args: Parameters<typeof dose.amountFromScaled>) => { conversions++; return dose.amountFromScaled(...args); } } });
mock.module('../../lib/matcher/rational.ts', { namedExports: { ...fractions, serialize: (...args: Parameters<typeof fractions.serialize>) => { exactEncodings++; return fractions.serialize(...args); }, fromDecimal: (...args: Parameters<typeof fractions.fromDecimal>) => { measurements++; return fractions.fromDecimal(...args); }, multiply: (...args: Parameters<typeof fractions.multiply>) => { multiplications++; return fractions.multiply(...args); } } });
const { request } = await import('../matcher/flexible-v5-fixtures.ts');
const { doseFitScore, numericalDoseFitScore, exactDoseFit, compareDoseFit, weightedDoseFitScore, numericalWeightedDoseFitScore } = await import('../../lib/matcher/dose-fit.ts');

test('REF-CPU-01 numerical ranking does not format display doses for losing candidates', () => {
  const input = request({ safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 100, maxUnit: 'mg', sourceScope: 'supplemental' }] });
  conversions = 0;
  const exposure = new Map([['a', 150_000_000n]]);
  const score = numericalDoseFitScore(input, exposure);
  assert.equal(score.total, 1.5, '50% target excess plus independent 2 × 50% reference excess');
  assert.deepEqual(exactDoseFit(score), { num: 3n, den: 2n });
  assert.equal(conversions, 0, 'Ranking needs exact numerical penalties, not display unit conversions');
  const display = doseFitScore(input, exposure);
  const saved = structuredClone(display);
  assert.equal(saved.perTarget[0].exposure, 150); assert.equal(saved.perTarget[0].target, 100);
  assert.equal(saved.perLimit[0].limit, 100); assert.equal(saved.perLimit[0].excess, 0.5);
  assert.ok(conversions > 0, 'Complete persisted score facts remain available');
  const first = conversions; assert.deepEqual(structuredClone(display), saved); assert.equal(conversions, first, 'Display facts materialise once');
});
test('REF-CPU-02 exact ordering and uniform weighted scoring avoid display allocation', () => {
  const input = request({ scoring: { profile: 'balanced', weights: { nutrients: { a: 2 } } } });
  conversions = 0;
  const below = numericalDoseFitScore(input, new Map([['a', 99_999_999n]]));
  const above = numericalDoseFitScore(input, new Map([['a', 100_000_001n]]));
  assert.equal(compareDoseFit(below, above), 0);
  const exposure = new Map([['a', 75_000_000n]]);
  const weighted = numericalWeightedDoseFitScore(input, exposure); assert.equal(weighted.total, 0.5);
  assert.equal(conversions, 0);
  assert.equal(weightedDoseFitScore(input, exposure).perTarget[0].under, 0.25);
});
test('REF-CPU-03 unchanged subject exposure reuses exact arithmetic across distinct basket maps', () => {
  const input = request(); multiplications = 0;
  const first = doseFitScore(input, new Map([['a', 75_000_000n]]));
  assert.equal(first.total, 0.25); assert.ok(multiplications > 0);
  multiplications = 0;
  const second = doseFitScore(input, new Map([['a', 75_000_000n], ['unrequested', 1n]]));
  assert.equal(second.total, first.total); assert.equal(multiplications, 0, 'Unchanged exact nutrient terms need no repeated endpoint arithmetic');
});
test('REF-CPU-04 neutral rational operations reuse immutable values without changing exact arithmetic', () => {
  const value = fractions.rational(7n, 13n);
  assert.strictEqual(fractions.multiply(value, fractions.ONE), value);
  assert.strictEqual(fractions.add(value, fractions.ZERO), value);
  assert.strictEqual(fractions.divide(value, fractions.ONE), value);
  assert.throws(() => fractions.divide(fractions.ZERO, fractions.ZERO));
  assert.deepEqual(fractions.fromDecimal(123), { num: 123n, den: 1n });
  assert.deepEqual(fractions.fromDecimal('1.25e-2'), { num: 1n, den: 80n });
});

test('REF-CPU-05 moving a basket through the frontier preserves its numerical score cache', async () => {
  const { seedState } = await import('../../lib/matcher/search.ts');
  const { searchStateScore } = await import('../../lib/matcher/practical-scoring.ts');
  const input = request(), seed = seedState(input);
  const score = searchStateScore(input, seed);
  assert.strictEqual(searchStateScore(input, { ...seed, nextGroupIndex: 1 }), score);
  const priced = searchStateScore(input, { ...seed, price: 100 });
  assert.notStrictEqual(priced, score); assert.ok(priced.overallPenalty > score.overallPenalty);
});
test('REF-CPU-06 repeated archive reads reuse immutable basket state within one cursor', async () => {
  const { createSearchCursor, archivedSearchStates } = await import('../../lib/matcher/search-cursor.ts');
  const { DEFAULT_MATCHER_CONFIG } = await import('../../lib/matcher/config.ts');
  const cursor = createSearchCursor([], request(), DEFAULT_MATCHER_CONFIG);
  const first = [...archivedSearchStates(cursor)]; assert.equal(first.length, 1);
  assert.strictEqual([...archivedSearchStates(cursor)][0], first[0]);
  const restored = structuredClone(cursor);
  assert.deepEqual([...archivedSearchStates(restored)], first);
  assert.notStrictEqual([...archivedSearchStates(restored)][0], first[0]);
});

test('REF-CPU-07 profile representatives share immutable quantity measurements', async () => {
  const { seedState } = await import('../../lib/matcher/search.ts');
  const { searchStateScore, requestForProfile } = await import('../../lib/matcher/practical-scoring.ts');
  const input = request({ maxDailyPills: 3, maxPriceMinor: 200000 });
  const alternate = requestForProfile(input, 'fewest_pills');
  // Compile both profile coefficients using a separate state first.
  searchStateScore(input, seedState(input)); searchStateScore(alternate, seedState(input));
  const basket = { ...seedState(input), pills: 16, count: 2, price: 259400, uncertainAdministrationCount: 0 };
  measurements = 0; const ordinary = searchStateScore(input, basket); assert.ok(measurements > 0);
  measurements = 0; const simpler = searchStateScore(alternate, basket);
  assert.equal(measurements, 0, 'Profile comparison changes exact coefficients, not the basket measurements');
  assert.ok(simpler.overallPenalty > ordinary.overallPenalty);
  assert.equal(ordinary.preferences.maxDailyPills.penalty, 169 / 36);
  assert.equal(simpler.preferences.maxDailyPills.penalty, 169 / 9);
});

test('REF-CPU-08 supported quantity probes reuse compiled subject and unit facts', async () => {
  const { compileVariant } = await import('../../lib/matcher/candidates.ts');
  const { product } = await import('../matcher/flexible-v5-fixtures.ts');
  const input = request(), listing = product('quantity-basis', { a: 100 });
  const first = compileVariant({ product: listing, request: input, dailyUnits: 1 }); assert.ok(first);
  unitCompilations = 0;
  const next = compileVariant({ product: listing, request: input, dailyUnits: 2 }); assert.ok(next);
  assert.equal(next.contributions.get('a')?.units, 200_000_000n);
  assert.equal(next.safetyExposure?.get('a')?.units, 200_000_000n);
  assert.equal(unitCompilations, 0, 'Changing supported quantities multiplies compiled units without resolving names again');
});

test('REF-CPU-09 numerical matching compiles the subject set when incidental exposure has no applicable reference', () => {
  const input = request({ profileKnown: { ageYears: false, lifeStage: false, sex: false } });
  let traversals = 0;
  class Exposure extends Map<string, bigint> { override keys() { traversals++; return super.keys(); } }
  const actual = new Exposure([['a', 75_000_000n], ['unrequested', 999_000_000n]]);
  assert.equal(doseFitScore(input, actual).total, 0.25);
  assert.equal(traversals, 0, 'The fixed numeric subject set is independent of irrelevant incidental facts');
});

test('REF-CPU-10 compilation, cursor continuation and final selection share one immutable canonical request', async () => {
  const { orderInvariantRequest } = await import('../../lib/matcher/canonicalizer.ts');
  const input = request(), canonical = orderInvariantRequest(input);
  assert.strictEqual(orderInvariantRequest(input), canonical);
  assert.strictEqual(orderInvariantRequest(canonical), canonical);
  const changed = orderInvariantRequest({ ...input, maxDailyPills: 2 });
  assert.notStrictEqual(changed, canonical); assert.equal(changed.maxDailyPills, 2);
  assert.equal(input.maxDailyPills, null);
});

test('REF-CPU-11 losing numerical candidates do not encode exact-score response objects', async () => {
  const { overallMatchingScore, numericalOverallMatchingScore, compareOverallScores } = await import('../../lib/matcher/practical-scoring.ts');
  const input = request(), actual = { dailyPills: 1, pillLowerBound: 1, productCount: 1, priceMinor: 50000, currency: 'THB', servings: [1], uncertainProductCount: 0 };
  exactEncodings = 0;
  const exposure = new Map([['a', 75_000_000n]]);
  const first = numericalOverallMatchingScore(input, exposure, actual);
  const next = numericalOverallMatchingScore(input, new Map([['a', 75_000_000n]]), { ...actual, priceMinor: 50001 });
  assert.equal(compareOverallScores(first, next), -1);
  assert.equal(exactEncodings, 0, 'Exact comparisons use native fractions until a result is retained');
  const display = overallMatchingScore(input, exposure, actual);
  const saved = structuredClone(display); assert.deepEqual(saved.overallExact, { numerator: '41', denominator: '120' });
  assert.ok(exactEncodings > 0); const count = exactEncodings;
  assert.deepEqual(structuredClone(display), saved); assert.equal(exactEncodings, count);
});

test('REF-CPU-12 frontier numerical records contain no response getters or display trees', async () => {
  const scoring = await import('../../lib/matcher/practical-scoring.ts');
  const { seedState } = await import('../../lib/matcher/search.ts');
  const input = request(), state = { ...seedState(input), price: 50000 };
  const evaluate = scoring.numericalSearchStateScore;
  const score = evaluate(input, state);
  assert.equal(Object.values(Object.getOwnPropertyDescriptors(score)).filter(row => row.get).length, 0,
    'Losing states must be plain numerical records, not lazy response objects');
  assert.equal(Object.hasOwn(score, 'components'), false);
  assert.equal(Object.hasOwn(score, 'preferences'), false);
  assert.equal(Object.hasOwn(score, 'overallExact'), false);
  assert.equal(scoring.compareOverallScores(score, score), 0);
  assert.equal(scoring.searchStateScore(input, state).overallPenalty, score.overallPenalty);
});


test('REF-CPU-13 cursor continuations reuse immutable product facts while isolating dynamic variants', async () => {
  const { compileGroups } = await import('../../lib/matcher/candidates.ts');
  const { createSearchCursor, advanceSearchCursor } = await import('../../lib/matcher/search-cursor.ts');
  const { DEFAULT_MATCHER_CONFIG } = await import('../../lib/matcher/config.ts');
  const { product } = await import('../matcher/flexible-v5-fixtures.ts');
  const input = request(), groups = compileGroups(input, { catalogueVersion: 'isolated', availabilityAsOf: '2026-01-01T00:00:00Z', products: [product('basis', { a: 37 })] });
  assert.ok(groups.length > 0); const original = structuredClone(groups);
  const cursor = createSearchCursor(groups, input, DEFAULT_MATCHER_CONFIG);
  assert.strictEqual(cursor.groups[0].product, groups[0].product, 'Immutable compilation must survive entry into the search cursor');
  assert.notStrictEqual(cursor.groups[0].variants, groups[0].variants);
  advanceSearchCursor(cursor, input, 100);
  assert.deepEqual(groups, original, "Quantity search must not change another request's compiled inputs");
});

test('REF-CPU-14 complete resident matching hashes its immutable catalogue only once', async () => {
  const { input } = await import('./support.ts');
  const { uninstallGoldCatalogue } = await import('../helpers/gold-catalogue.ts');
  const matching = await import('../../lib/agentic/plan/matching.ts');
  try {
    const value = await input(); matching.resetMatchPlanCache();
    const { catalogueSnapshotId } = await import('../../lib/agentic/catalogue/freeze.ts');
    canonicalWrites = 0; catalogueSnapshotId(value.snapshot); const oneHash = canonicalWrites; assert.ok(oneHash > 0);
    canonicalWrites = 0;
    const session = matching.createResidentPlanSession(value);
    let step = matching.advanceResidentPlanSession(session, { chunkBudget: 4000 });
    while (!step.done) step = matching.advanceResidentPlanSession(session, { chunkBudget: 4000 });
    assert.ok(step.result?.selected); assert.ok(step.expansionAttempts > 0);
    assert.equal(canonicalWrites, oneHash, 'Compilation, checkpoint identity and all retained response baskets share one catalogue identity');
  } finally { uninstallGoldCatalogue(); }
});

test('REF-CPU-15 archive recovery in a live cursor preserves original numerical exposure identity', async () => {
  const { createSearchCursor, advanceSearchCursor, archivedSearchStates } = await import('../../lib/matcher/search-cursor.ts');
  const { compileGroups } = await import('../../lib/matcher/candidates.ts');
  const { DEFAULT_MATCHER_CONFIG } = await import('../../lib/matcher/config.ts');
  const { product } = await import('../matcher/flexible-v5-fixtures.ts');
  const input = request(), groups = compileGroups(input, { catalogueVersion: 'archive', availabilityAsOf: '2026-01-01T00:00:00Z', products: [product('archive-basis', { a: 37 })] });
  const cursor = createSearchCursor(groups, input, DEFAULT_MATCHER_CONFIG);
  advanceSearchCursor(cursor, input, 10);
  const original = [...cursor.unreviewed, ...cursor.review].find(row => row.count > 0); assert.ok(original);
  const restored = [...archivedSearchStates(cursor)].find(row => row.selectedVariantIds.join('|') === original.selectedVariantIds.join('|')); assert.ok(restored);
  assert.strictEqual(restored.exposure, original.exposure, 'An already-calculated immutable basket must not lose all exact term caches when restored locally');
  assert.deepEqual([...archivedSearchStates(structuredClone(cursor))], [...archivedSearchStates(cursor)], 'Durable recovery retains the same state values');
});

test('REF-CPU-16 numerical nutrient scores omit display-only trees and retain exact incumbent comparisons', () => {
  const input = request(), exposure = new Map([['a', 75_000_000n], ['incidental', 100n]]);
  const numeric = numericalDoseFitScore(input, exposure);
  for (const field of ['perTarget', 'perContinuedDose', 'perLimit', 'unknownSubjectIds', 'estimatedSubjectIds']) assert.equal(Object.hasOwn(numeric, field), false, field + ' belongs to retained response materialization');
  const display = doseFitScore(input, exposure);
  assert.deepEqual(exactDoseFit(display), exactDoseFit(numeric));
  assert.equal(compareDoseFit(display, numeric), 0);
  assert.equal(display.perTarget[0].exposure, 75);
});

test('REF-CPU-17 incidental exposure below every reference avoids zero-loss endpoint arithmetic without losing reference detail', () => {
  const input = request({ safetyCeilings: [{ subjectId: 'incidental', name: 'Incidental', maxAmount: 100, maxUnit: 'mg', sourceScope: 'total' }],
    dietaryIntake: [{ subjectId: 'incidental', name: 'Incidental', unit: 'mg', dailyAmount: 10, minimumDailyAmount: 0, maximumDailyAmount: 20,
      daily: { subjectId: 'incidental', dim: 'mass_ng', units: 10_000_000n }, certainty: 'estimated', sourceId: 'diet' }] });
  numericalDoseFitScore(input, new Map([['a', 75_000_000n]])); multiplications = 0;
  const exposure = new Map([['a', 75_000_000n], ['incidental', 70_000_000n]]);
  const numerical = numericalDoseFitScore(input, exposure);
  assert.equal(numerical.total, 0.25);
  assert.equal(multiplications, 0, 'A proved-zero incidental reference term needs no weighted endpoint construction');
  const detail = doseFitScore(input, exposure).perLimit.find(row => row.subjectId === 'incidental'); assert.ok(detail);
  assert.equal(detail.exposureMaximum, 90); assert.equal(detail.limit, 100); assert.equal(detail.certainty, 'estimated');
  assert.equal(numericalDoseFitScore(input, new Map([['a', 75_000_000n], ['incidental', 81_000_000n]])).total, 0.27, 'Any possible excess retains the independent twofold penalty');
});
