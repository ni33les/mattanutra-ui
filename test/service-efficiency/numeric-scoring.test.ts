import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
const canonical = await import('../../lib/agentic/value/canonical.ts');
let canonicalWrites = 0;
mock.module('../../lib/agentic/value/canonical.ts', { namedExports: { ...canonical,
  canonicalJson: (...args: Parameters<typeof canonical.canonicalJson>) => { canonicalWrites++; return canonical.canonicalJson(...args); } } });
const exactValues = await import('../../lib/matcher/exact-values.ts');
let sellerIdentityCopies = 0;
mock.module('../../lib/matcher/exact-values.ts', { namedExports: { ...exactValues,
  serializeExactValue: (...args: Parameters<typeof exactValues.serializeExactValue>) => {
    if (args[0] && typeof args[0] === 'object' && Object.hasOwn(args[0], 'groups')) sellerIdentityCopies++;
    return exactValues.serializeExactValue(...args);
  } } });
const dose = await import('../../lib/matcher/dose.ts');
const fractions = await import('../../lib/matcher/rational.ts');
let conversions = 0, unitCompilations = 0, exactEncodings = 0;
let multiplications = 0; let measurements = 0; let additions = 0; let aggregateSums = 0; let conversionsToNumber = 0; let exactComparisons = 0;
mock.module('../../lib/matcher/dose.ts', { namedExports: { ...dose, scaleAmount: (...args: Parameters<typeof dose.scaleAmount>) => { unitCompilations++; return dose.scaleAmount(...args); }, amountFromScaled: (...args: Parameters<typeof dose.amountFromScaled>) => { conversions++; return dose.amountFromScaled(...args); } } });
mock.module('../../lib/matcher/rational.ts', { namedExports: { ...fractions, toNumber: (...args: Parameters<typeof fractions.toNumber>) => { conversionsToNumber++; return fractions.toNumber(...args); }, compare: (...args: Parameters<typeof fractions.compare>) => { exactComparisons++; return fractions.compare(...args); }, sum: (...args: Parameters<typeof fractions.sum>) => { aggregateSums++; return fractions.sum(...args); }, add: (...args: Parameters<typeof fractions.add>) => { additions++; return fractions.add(...args); }, serialize: (...args: Parameters<typeof fractions.serialize>) => { exactEncodings++; return fractions.serialize(...args); }, fromDecimal: (...args: Parameters<typeof fractions.fromDecimal>) => { measurements++; return fractions.fromDecimal(...args); }, multiply: (...args: Parameters<typeof fractions.multiply>) => { multiplications++; return fractions.multiply(...args); } } });
const { request } = await import('../matcher/flexible-v5-fixtures.ts');
const { doseFitScore, numericalDoseFitScore, exactDoseFit, compareDoseFit, weightedDoseFitScore, numericalWeightedDoseFitScore } = await import('../../lib/matcher/dose-fit.ts');

test('REF-CPU-01 numerical ranking does not format display doses for losing candidates', () => {
  const input = request({ safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 100, maxUnit: 'mg', sourceScope: 'supplemental' }] });
  conversions = 0; additions = 0; aggregateSums = 0; conversionsToNumber = 0;
  const exposure = new Map([['a', 150_000_000n]]);
  const score = numericalDoseFitScore(input, exposure);
  assert.equal(score.total, 1.5, '50% target excess plus independent 2 × 50% reference excess');
  assert.ok(conversionsToNumber > 0, 'Numerical projections must reuse the shared finite rational conversion');
  assert.deepEqual(exactDoseFit(score), { num: 3n, den: 2n });
  assert.ok(additions > 0, 'Nutrient aggregation must use the independently tested shared exact arithmetic');
  assert.ok(aggregateSums > 0, 'Aggregate penalties must reduce a sum once, not allocate a reduced fraction after every nutrient');
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
  exactComparisons = 0; assert.equal(compareDoseFit(below, above), 0);
  assert.ok(exactComparisons > 0, 'Dose ordering must reuse the shared exact comparator');
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
  assert.strictEqual(fractions.fromDecimal(0), fractions.ZERO, 'Repeated zero coefficients need no allocation');
  assert.strictEqual(fractions.fromDecimal(1), fractions.ONE, 'Repeated unit coefficients need no allocation');
  assert.strictEqual(fractions.multiply(value, fractions.ONE), value);
  assert.strictEqual(fractions.add(value, fractions.ZERO), value);
  assert.strictEqual(fractions.divide(value, fractions.ONE), value);
  assert.strictEqual(fractions.rational(0n, 13n), fractions.ZERO);
  assert.strictEqual(fractions.add(value, fractions.rational(-7n, 13n)), fractions.ZERO, 'Cancelling penalties must reuse zero without allocating a denominator product');
  assert.strictEqual(fractions.subtract(value, value), fractions.ZERO);
  assert.deepEqual(fractions.add(value, fractions.rational(5n, 13n)), { num: 12n, den: 13n });
  assert.throws(() => fractions.divide(fractions.ZERO, fractions.ZERO));
  assert.deepEqual(fractions.fromDecimal(123), { num: 123n, den: 1n });
  assert.deepEqual(fractions.fromDecimal('1.25e-2'), { num: 1n, den: 80n });
});

test('PERF-CPU-07 rational normalization allocates no iterator per Euclidean step and preserves wide integers', () => {
  let iterations = 0;
  const iterator = Array.prototype[Symbol.iterator];
  let small, wide;
  try {
    Array.prototype[Symbol.iterator] = function() { iterations++; return iterator.call(this); };
    small = fractions.rational(1836311903n, 1134903170n);
    wide = fractions.rational((2n ** 90n + 1n) * 17n, (2n ** 90n - 1n) * 17n);
  } finally { Array.prototype[Symbol.iterator] = iterator; }
  assert.deepEqual(small, {num: 1836311903n, den: 1134903170n});
  assert.deepEqual(wide, {num: 2n ** 90n + 1n, den: 2n ** 90n - 1n});
  assert.equal(iterations, 0, 'Normalization must not allocate an iterable pair per exact remainder');
});

test('PERF-CPU-04 compiled exact linear terms preserve fractional weights and reject mismatched axes', () => {
  assert.equal(typeof fractions.compileLinearTerms, 'function');
  const values = fractions.compileLinearTerms([fractions.rational(7n, 13n), fractions.rational(3n, 10n), fractions.rational(-2n, 7n)]);
  const weights = fractions.compileLinearTerms([fractions.rational(1n, 2n), fractions.rational(2n), fractions.rational(1n, 4n)]);
  assert.deepEqual(fractions.linearSum(values, weights), { num: 363n, den: 455n });
  assert.deepEqual(fractions.linearSum(values, fractions.compileLinearTerms([fractions.ZERO, fractions.ONE, fractions.ZERO])), { num: 3n, den: 10n });
  assert.deepEqual(fractions.linearSum(fractions.compileLinearTerms([]), fractions.compileLinearTerms([])), fractions.ZERO);
  assert.throws(() => fractions.linearSum(values, fractions.compileLinearTerms([fractions.ONE])), /axes/);
  assert.ok(Object.isFrozen(values) && Object.isFrozen(values.numerators));
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

test('PERF-CPU-02 repeated label identities resolve references once without mixing product amounts or requests', async () => {
  const { product } = await import('../matcher/flexible-v5-fixtures.ts');
  const { labelledSafetyExposure } = await import('../../lib/matcher/safety.ts');
  let lookups = 0;
  const references = [{ subjectId: 'reference-a', name: 'A', maxAmount: 100, maxUnit: 'mg' as const }];
  const ceilings = new Proxy(references, { get(target, key, receiver) {
    if (key === 'find') return (...args: Parameters<typeof references.find>) => { lookups++; return references.find(...args); };
    return Reflect.get(target, key, receiver);
  } });
  const input = request({ targets: [], safetyCeilings: ceilings });
  const first = labelledSafetyExposure(product('first', { a: 35 }), 1, input);
  const second = labelledSafetyExposure(product('second', { a: 60 }), 1, input);
  assert.equal(first.get('reference-a')?.units, 35_000_000n);
  assert.equal(second.get('reference-a')?.units, 60_000_000n);
  assert.equal(lookups, 1, 'An identical label identity needs one reference resolution across the immutable catalogue');
  const changed = labelledSafetyExposure(product('third', { a: 90 }), 1, request());
  assert.equal(changed.get('a')?.units, 90_000_000n, 'A new request resolves its own requested identity');
  const conflict = labelledSafetyExposure(product('untrusted', { a: 80 }, 100, { labelledContributions: [{ subjectId: 'a', name: 'A', amount: 80, unit: 'mg', mappingStatus: 'conflicting' }] }), 1, input);
  assert.equal(conflict.size, 0, 'Cached identity must never upgrade conflicting product evidence');
  const { evaluateSafety } = await import('../../lib/matcher/safety.ts');
  const observations = { request: input, exposure: { totals: first, provenance: [] }, products: [], variants: [] };
  const safety = evaluateSafety(observations); lookups = 0;
  assert.deepEqual(evaluateSafety(observations), safety);
  assert.equal(lookups, 0, 'Names in compiled reference facts must not be searched again for each retained basket');
});

test('PERF-CPU-03 repeated candidate additions reuse physical quantities and reprice changed offers', async () => {
  const { product } = await import('../matcher/flexible-v5-fixtures.ts');
  const { compileGroups } = await import('../../lib/matcher/candidates.ts');
  const { seedState, tryAddVariant } = await import('../../lib/matcher/search.ts');
  const input = request();
  const listing = product('repeat-dose', { a: 50 }, 100, { administration: {
    route: 'oral', physicalUnit: 'tablet', unitsPerServing: 1, doseIncrement: 1, packQuantity: 30,
    provenance: { status: 'verified', sourceUrl: 'https://example.test/label', sourceText: 'One tablet per serving; 30 tablets', verifiedAt: '2026-09-26' }
  } });
  const [group] = compileGroups(input, { catalogueVersion: 'repeat-dose', availabilityAsOf: '2026-09-26', products: [listing] });
  assert.ok(group); const variant = group.variants.find(row => row.dailyUnits === 2); assert.ok(variant);
  const first = tryAddVariant(seedState(input), variant, group, input); assert.ok(first);
  assert.equal(first.monthlyPriceMinor, 200); assert.deepEqual(first.servingBurden, fractions.ONE);
  measurements = 0;
  const next = tryAddVariant({ ...seedState(input), price: 1000 }, variant, group, input); assert.ok(next);
  assert.equal(measurements, 0, 'A supported variant has the same exact serving and pack basis in every basket');
  assert.equal(next.price, 1100); assert.equal(next.monthlyPriceMinor, 200);
  const repriced = tryAddVariant(seedState(input), variant, { ...group, product: { ...listing, unitPriceMinor: 150 } }, input);
  assert.ok(repriced); assert.equal(repriced.monthlyPriceMinor, 300); assert.equal(repriced.price, 150);
  assert.ok(measurements > 0, 'A changed offer must invalidate the cached commercial measurements');
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
  assert.equal(Object.hasOwn(score, 'penalties'), false, 'Losing scores must not retain per-component preference trees through a nested field');
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
    canonicalWrites = 0; sellerIdentityCopies = 0;
    const session = matching.createResidentPlanSession(value);
    let step = matching.advanceResidentPlanSession(session, { chunkBudget: 4000 });
    while (!step.done) step = matching.advanceResidentPlanSession(session, { chunkBudget: 4000 });
    assert.ok(step.result?.selected); assert.ok(step.expansionAttempts > 0);
    assert.equal(canonicalWrites, oneHash, 'Compilation, checkpoint identity and all retained response baskets share one catalogue identity');
    assert.equal(sellerIdentityCopies, 0, 'Seller cursors inherit the complete parent identity without serializing compiled quantities again');
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
  assert.strictEqual(restored, original, 'Live archive reads must reuse the evaluated basket, not allocate a second state and measurement cache');
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

test('PERF-CPU-05 safety reuses verified exposure facts but rejects inconsistent prepared quantities', async () => {
  const { evaluateSafety } = await import('../../lib/matcher/safety.ts');
  const input = request({ safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 150, maxUnit: 'mg', sourceScope: 'supplemental' }] });
  const supplied = new Map([['a', 200_000_000n]]);
  doseFitScore(input, supplied); conversions = 0;
  const observations = { totals: new Map([['a', { subjectId: 'a', dim: 'mass_ng' as const, units: 200_000_000n }]]), provenance: [] };
  const result = evaluateSafety({ request: input, exposure: observations, preparedExposure: supplied, products: [], variants: [] });
  assert.equal(conversions, 0, 'Validated safety and candidate scoring must share the same materialized dose facts');
  assert.ok(result.findings.some(row => row.code === 'dose_review_required' && row.exposureUnits === 200_000_000n));
  const current = { ...observations, totals: new Map([['a', { subjectId: 'a', dim: 'mass_ng' as const, units: 100_000_000n }]]) };
  const corrected = evaluateSafety({ request: input, exposure: current, preparedExposure: supplied, products: [], variants: [] });
  assert.ok(!corrected.findings.some(row => row.code === 'dose_review_required'), 'A stale prepared amount cannot create a false reference breach');
  assert.ok(conversions > 0, 'Different validated facts require their own calculation');
});

test('PERF-CPU-06 retained basket metadata examines unselected products only during revalidation', async () => {
  const { compileGroups } = await import('../../lib/matcher/candidates.ts');
  const { product } = await import('../matcher/flexible-v5-fixtures.ts');
  const { seedState, tryAddVariant } = await import('../../lib/matcher/search.ts');
  const { scoreState } = await import('../../lib/matcher/selector.ts');
  const input = request(), groups = compileGroups(input, { catalogueVersion: 'selected-metadata', availabilityAsOf: '2026-09-26', products: [product('chosen', { a: 100 }), product('unused', { a: 50 })] });
  const selected = groups.find(group => group.productId === 'chosen'); assert.ok(selected);
  const variant = selected.variants.find(row => row.dailyUnits === 1); assert.ok(variant);
  const state = tryAddVariant(seedState(input), variant, selected, input); assert.ok(state);
  const expected = scoreState({ groups, request: input, sellerId: selected.sellerId, state }); assert.ok(expected);
  let unselectedReads = 0;
  const observed = groups.map(group => group === selected ? group : new Proxy(group, { get(target, key, receiver) {
    if (key === 'product') unselectedReads++;
    return Reflect.get(target, key, receiver);
  } }));
  assert.deepEqual(scoreState({ groups: observed, request: input, sellerId: selected.sellerId, state }), expected);
  assert.equal(unselectedReads, 1, 'Incidental, dedicated, title and label counts should share selected products rather than rebuilding the catalogue');
  assert.equal(scoreState({ groups: [...groups, selected], request: input, sellerId: selected.sellerId, state })?.requestedLabelCount, 1, 'Repeated group references must not count a product label twice');
});

test('PERF-CPU-01 interior probes retain exact comparison facts without formatting discarded responses', async () => {
  const { product } = await import('../matcher/flexible-v5-fixtures.ts');
  const { compileGroups } = await import('../../lib/matcher/candidates.ts');
  const { createSearchCursor, advanceSearchCursor, archivedSearchStates } = await import('../../lib/matcher/search-cursor.ts');
  const { DEFAULT_MATCHER_CONFIG } = await import('../../lib/matcher/config.ts');
  const input = request();
  const listing = product('powder', { a: 170 }, 100, { administration: {
    route: 'oral', physicalUnit: 'g', unitsPerServing: 10, doseIncrement: 1, packQuantity: 100,
    provenance: { status: 'verified', sourceUrl: 'https://example.test/powder', sourceText: '10 g per labelled serving', verifiedAt: '2026-09-26' }
  } });
  const groups = compileGroups(input, { catalogueVersion: 'probe', availabilityAsOf: '2026-09-26T00:00:00Z', products: [listing] });
  assert.ok(groups[0]?.variants.length, 'Physical quantities must be available');
  const cursor = createSearchCursor(groups, input, DEFAULT_MATCHER_CONFIG);
  exactEncodings = 0;
  for (let n = 0; n < 100 && !cursor.quantitySearch?.left && !cursor.done; n++) advanceSearchCursor(cursor, input, 1);
  const left = cursor.quantitySearch?.left;
  assert.ok(left, 'The fixture must stop after a real interior probe');
  assert.equal(exactEncodings, 0, 'Losing probes must not materialise human-readable score fields');
  assert.deepEqual(Object.keys(left).sort(), ['exactTotal', 'profile'], 'Recovery needs only exact comparison facts');
  const restored = structuredClone(cursor);
  const historical = structuredClone(cursor);
  const score = left as unknown as { profile: unknown; exactTotal: { num: bigint; den: bigint } };
  Object.assign(historical.quantitySearch!, { left: { profile: score.profile, overallExact: {
    numerator: String(score.exactTotal.num), denominator: String(score.exactTotal.den)
  } } });
  for (const item of [cursor, restored, historical]) while (!item.done) advanceSearchCursor(item, input, 100);
  assert.deepEqual([...archivedSearchStates(restored)], [...archivedSearchStates(cursor)]);
  assert.deepEqual([...archivedSearchStates(historical)], [...archivedSearchStates(cursor)]);
  assert.equal(historical.expansionAttempts, cursor.expansionAttempts);
});


test('QC-RES-01 resident publication preserves the admitted catalogue when its caller changes nested inputs', async () => {
  const { input } = await import('./support.ts');
  const { uninstallGoldCatalogue } = await import('../helpers/gold-catalogue.ts');
  const matching = await import('../../lib/agentic/plan/matching.ts');
  try {
    const value = structuredClone(await input()); matching.resetMatchPlanCache();
    const expected = matching.matchPlan({ ...value, snapshot: structuredClone(value.snapshot) });
    assert.ok(expected.selected?.basket.length, 'The control must select an actual catalogue product');
    const changed = value.snapshot.products.find(product => product.productId === expected.selected!.basket[0].productId);
    assert.ok(changed?.candidate.facts.length, 'Mutation must affect a selected product and its nested fact');
    const originalCatalogue = structuredClone(value.snapshot);
    const session = matching.createResidentPlanSession(value);
    let step = matching.advanceResidentPlanSession(session, { chunkBudget: 1 });
    assert.equal(step.done, false, 'The controlled change occurs between real search chunks');
    Object.assign(changed, { unitPriceMinor: changed.unitPriceMinor + 1234 });
    Object.assign(changed.candidate, { title: 'Changed after admission', priceAmount: changed.unitPriceMinor / 100 });
    const fact = changed.candidate.facts[0];
    Object.assign(fact, { amount: 99999, comparableAmount: 99999 });
    while (!step.done) step = matching.advanceResidentPlanSession(session, { chunkBudget: 4000 });
    assert.deepEqual(step.result, expected, 'Basket, doses, money, advice and catalogue identity belong to the admitted snapshot');
    assert.deepEqual(session.input.snapshot, originalCatalogue, 'The resident session owns its original nested facts');
    assert.equal(step.expansionAttempts, expected.searchSummary!.expansionAttempts);
  } finally { uninstallGoldCatalogue(); }
});

test('QC-RES-02 changed caller facts still invalidate an old checkpoint instead of reusing a stale identity', async () => {
  const { input } = await import('./support.ts');
  const { uninstallGoldCatalogue } = await import('../helpers/gold-catalogue.ts');
  const matching = await import('../../lib/agentic/plan/matching.ts');
  try {
    const value = structuredClone(await input()); matching.resetMatchPlanCache();
    const session = matching.createResidentPlanSession(value);
    const first = matching.advanceResidentPlanSession(session, { chunkBudget: 1 });
    assert.equal(first.done, false);
    const resumed = matching.createResidentPlanSession(structuredClone(value), first.checkpoint);
    assert.equal(resumed.inputIdentity, session.inputIdentity, 'Unchanged immutable values recover the same acknowledged work');
    assert.ok(value.snapshot.products[0]?.candidate.facts.length, 'A concrete nested fact is required for the identity regression');
    Object.assign(value.snapshot.products[0].candidate.facts[0], { amount: 123456, comparableAmount: 123456 });
    assert.throws(() => matching.createResidentPlanSession(value, first.checkpoint), /Plan checkpoint input identity changed/,
      'Mutable external snapshots must never receive an unsafe permanent identity memo');
  } finally { uninstallGoldCatalogue(); }
});
