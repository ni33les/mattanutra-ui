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
let linearEvaluations = 0; let multiplications = 0; let measurements = 0; let additions = 0; let aggregateSums = 0; let conversionsToNumber = 0; let exactComparisons = 0;
mock.module('../../lib/matcher/dose.ts', { namedExports: { ...dose, scaleAmount: (...args: Parameters<typeof dose.scaleAmount>) => { unitCompilations++; return dose.scaleAmount(...args); }, amountFromScaled: (...args: Parameters<typeof dose.amountFromScaled>) => { conversions++; return dose.amountFromScaled(...args); } } });
mock.module('../../lib/matcher/rational.ts', { namedExports: { ...fractions, linearSum: (...args: Parameters<typeof fractions.linearSum>) => { linearEvaluations++; return fractions.linearSum(...args); }, toNumber: (...args: Parameters<typeof fractions.toNumber>) => { conversionsToNumber++; return fractions.toNumber(...args); }, compare: (...args: Parameters<typeof fractions.compare>) => { exactComparisons++; return fractions.compare(...args); }, sum: (...args: Parameters<typeof fractions.sum>) => { aggregateSums++; return fractions.sum(...args); }, add: (...args: Parameters<typeof fractions.add>) => { additions++; return fractions.add(...args); }, serialize: (...args: Parameters<typeof fractions.serialize>) => { exactEncodings++; return fractions.serialize(...args); }, fromDecimal: (...args: Parameters<typeof fractions.fromDecimal>) => { measurements++; return fractions.fromDecimal(...args); }, multiply: (...args: Parameters<typeof fractions.multiply>) => { multiplications++; return fractions.multiply(...args); } } });
const { request } = await import('../matcher/flexible-v5-fixtures.ts');
const { doseFitScore, numericalDoseFitScore, exactDoseFit, compareDoseFit, weightedDoseFitScore, numericalWeightedDoseFitScore } = await import('../../lib/matcher/dose-fit.ts');

test('PERF-CPU-24 exact search records defer unused display totals until retention', async () => {
  const { numericalOverallMatchingScore, overallMatchingScore } = await import('../../lib/matcher/practical-scoring.ts');
  const input = request(), exposure = new Map([['a', 75_000_000n]]);
  numericalDoseFitScore(input, exposure);
  const actual = { currency: 'THB', dailyPills: 1, pillLowerBound: 1, productCount: 1, priceMinor: 50000, servings: [1], uncertainProductCount: 0 };
  numericalOverallMatchingScore(input, exposure, actual);
  conversionsToNumber = 0;
  const numeric = numericalDoseFitScore(input, new Map(exposure));
  const practical = numericalOverallMatchingScore(input, exposure, actual);
  assert.equal(conversionsToNumber, 0, 'Exact ordering does not consume rounded display totals');
  assert.equal(Object.hasOwn(numeric, 'total'), false);
  assert.equal(Object.hasOwn(practical, 'overallPenalty'), false);
  assert.deepEqual(exactDoseFit(numeric), { num: 1n, den: 4n });
  assert.deepEqual(practical.exactTotal, { num: 41n, den: 120n });
  assert.equal(doseFitScore(input, exposure).total, 0.25);
  const shown = overallMatchingScore(input, exposure, actual);
  assert.equal(shown.dosePenalty, 0.25);
  assert.equal(shown.overallPenalty, 41 / 120);
  assert.deepEqual(shown.overallExact, { numerator: '41', denominator: '120' });
});

test('PERF-CPU-22 exact serving lower bounds avoid unnecessary profile evaluation', async () => {
  const { seedState, compareSearchStates } = await import('../../lib/matcher/search.ts');
  const { numericalSearchStateScore, requestForProfile } = await import('../../lib/matcher/practical-scoring.ts');
  const input = request();
  const large = { ...seedState(input), count: 1, pills: 1, price: 100, servingBurden: { num: 10000n, den: 1n }, exposure: new Map([['a', 100_000_000n]]) };
  const small = { ...seedState(input), count: 1, pills: 1, price: 100, exposure: new Map([['a', 100_000_000n]]) };
  numericalSearchStateScore(input, large); numericalSearchStateScore(input, small);
  const profile = requestForProfile(input, 'fewest_pills');
  linearEvaluations = 0;
  assert.equal(Math.sign(compareSearchStates(large, small, profile)), 1);
  assert.equal(linearEvaluations, 1, 'A verified 2000-point serving penalty already exceeds the complete smaller-routine score');
  assert.equal(numericalSearchStateScore(profile, large).overallPenalty - numericalSearchStateScore(profile, small).overallPenalty, 2000);
  assert.equal(Math.sign(compareSearchStates(small, large, profile)), -1);
  const zero = request({ scoring: { profile: 'balanced', weights: { servings: 0 } } });
  assert.equal(compareSearchStates(large, small, zero), 0, 'Zero-weight servings cannot be used to reject a routine');
  const invalid = { ...large, pills: -1 };
  assert.throws(() => numericalSearchStateScore(input, invalid), /nonnegative/);
  assert.throws(() => compareSearchStates(invalid, small, profile), /nonnegative/, 'A failed validation cannot authorize a lower-bound shortcut');
});

test('PERF-CPU-18 repeated nutrient amounts reuse immutable frontier deviations', async () => {
  const { doseFitTargetDeviations } = await import('../../lib/matcher/dose-fit.ts');
  const input = request();
  const first = numericalDoseFitScore(input, new Map([['a', 75_000_000n]]));
  conversionsToNumber = 0;
  const second = numericalDoseFitScore(input, new Map([['a', 75_000_000n], ['incidental', 20n]]));
  assert.deepEqual(exactDoseFit(second), { num: 1n, den: 4n });
  assert.equal(conversionsToNumber, 5, 'Only aggregate score fields need conversion when the nutrient endpoint was already evaluated');
  assert.strictEqual(doseFitTargetDeviations(first)[0], doseFitTargetDeviations(second)[0]);
  assert.deepEqual(doseFitTargetDeviations(second), [{ subjectId: 'a', under: 0.25, over: 0 }]);
  const changed = numericalDoseFitScore(input, new Map([['a', 125_000_000n]]));
  assert.deepEqual(doseFitTargetDeviations(changed), [{ subjectId: 'a', under: 0, over: 0.25 }]);
  assert.deepEqual(doseFitTargetDeviations(first), [{ subjectId: 'a', under: 0.25, over: 0 }]);
});

test('PERF-CPU-19 retained concern comparisons do not rebuild immutable facts', async () => {
  const { product, catalog } = await import('../matcher/flexible-v5-fixtures.ts');
  const { compileGroups } = await import('../../lib/matcher/candidates.ts');
  const { seedState, tryAddVariant } = await import('../../lib/matcher/search.ts');
  const { scoreState, hasFewerConcerns } = await import('../../lib/matcher/selector.ts');
  const input = request(), groups = compileGroups(input, catalog([product('exact', { a: 100 }), product('excess', { a: 200 })]));
  let reads = 0;
  const baskets = groups.map(group => {
    const variant = group.variants.find(row => row.dailyUnits === 1); assert.ok(variant);
    const state = tryAddVariant(seedState(input), variant, group, input); assert.ok(state);
    const basket = scoreState({ groups, request: input, sellerId: group.sellerId, state }); assert.ok(basket?.doseFit);
    return { ...basket, doseFit: new Proxy(basket.doseFit, { get(target, key, receiver) { if (key === 'perTarget') reads++; return Reflect.get(target, key, receiver); } }) };
  });
  const candidate = baskets.find(row => row.productIds.includes('exact'))!, selected = baskets.find(row => row.productIds.includes('excess'))!;
  assert.ok(candidate && selected);
  assert.equal(hasFewerConcerns(candidate, selected, input), true);
  assert.equal(reads, 2, 'Both distinct measured baskets must be assessed');
  assert.equal(hasFewerConcerns(candidate, selected, input), true);
  assert.equal(reads, 2, 'Repeated final comparisons must reuse the same dose and safety facts');
  assert.equal(hasFewerConcerns(selected, candidate, input), false, 'Measured excess cannot disappear through reuse');
});

test('PERF-CPU-20 cursor continuations compile their fixed quantity basis once', async () => {
  const { product, catalog } = await import('../matcher/flexible-v5-fixtures.ts');
  const { compileGroups } = await import('../../lib/matcher/candidates.ts');
  const { createSearchCursor, advanceSearchCursor, archivedSearchStates } = await import('../../lib/matcher/search-cursor.ts');
  const { DEFAULT_MATCHER_CONFIG } = await import('../../lib/matcher/config.ts');
  const input = request(), groups = compileGroups(input, catalog(Array.from({ length: 8 }, (_, i) => product('basis-' + i, { a: 7 + i }))));
  const cursor = createSearchCursor(groups, input, { ...DEFAULT_MATCHER_CONFIG, expansionBudget: 800, exactGroupLimit: 0 });
  const control = structuredClone(cursor);
  let projections = 0;
  cursor.baseline = cursor.baseline.map(ids => new Proxy(ids, { get(target, key, receiver) {
    if (key === 'map') return (...args: Parameters<typeof target.map>) => { projections++; return target.map(...args); };
    return Reflect.get(target, key, receiver);
  } }));
  while (!cursor.done) advanceSearchCursor(cursor, input, 17);
  while (!control.done) advanceSearchCursor(control, input, 800);
  assert.equal(cursor.expansionAttempts, 800);
  assert.ok(projections > 0 && projections <= groups.length, `Immutable quantity basis rebuilt ${projections} times for ${groups.length} groups`);
  assert.deepEqual([...archivedSearchStates(cursor)], [...archivedSearchStates(control)], 'Chunk size and basis reuse must not alter quantities, work, order or exact scores');
});

test('PERF-CPU-21 quantity breakpoints reuse intake endpoints without per-probe sets', async () => {
  const { targetDoseTicks } = await import('../../lib/matcher/target-basis.ts');
  const input = request(), target = input.targets[0]!, step = { num: 1n, den: 1n };
  assert.deepEqual(targetDoseTicks(input, target, 10_000_000n, step), [9n, 10n, 11n]);
  const OriginalSet = globalThis.Set; let allocations = 0, quantities;
  try {
    globalThis.Set = new Proxy(OriginalSet, { construct(type, args) { allocations++; return Reflect.construct(type, args); } });
    quantities = targetDoseTicks(input, target, 10_000_000n, step, 20_000_000n);
  } finally { globalThis.Set = OriginalSet; }
  assert.deepEqual(quantities, [7n, 8n, 9n]);
  assert.equal(allocations, 0, 'Physical probes must not repeatedly deduplicate the same immutable intake endpoints');
  const estimated = request({ currentSupplements: [{ subjectId: 'a', sourceId: 'existing', name: 'A', dailyAmount: 50, unit: 'mg',
    daily: { subjectId: 'a', dim: 'mass_ng', units: 50_000_000n }, certainty: 'estimated', minimumDailyAmount: 40, maximumDailyAmount: 60 }] });
  assert.deepEqual(targetDoseTicks(estimated, estimated.targets[0]!, 10_000_000n, step), [3n, 4n, 5n, 6n, 7n, 9n, 10n, 11n]);
  assert.deepEqual(targetDoseTicks(estimated, estimated.targets[0]!, 10_000_000n, step, 70_000_000n), [1n, 2n, 3n, 4n, 5n, 7n, 8n, 9n]);
});

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
test('PERF-CPU-13 compiled endpoint scoring avoids temporary sets and preserves complete safety arithmetic', () => {
  const input = request({ safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 100, maxUnit: 'mg', sourceScope: 'supplemental' }] });
  numericalDoseFitScore(input, new Map([['a', 150_000_000n]]));
  const exposure = new Map([['a', 175_000_000n]]), OriginalSet = globalThis.Set;
  let allocations = 0, result;
  try {
    globalThis.Set = new Proxy(OriginalSet, { construct(target, args) { allocations++; return Reflect.construct(target, args); } });
    result = numericalDoseFitScore(input, exposure);
  } finally { globalThis.Set = OriginalSet; }
  assert.equal(result.total, 2.25);
  assert.deepEqual(exactDoseFit(result), { num: 9n, den: 4n });
  assert.equal(allocations, 0, 'Fixed endpoint facts need no per-candidate sets or endpoint deduplication');
  const display = doseFitScore(input, exposure);
  assert.equal(display.perTarget[0].exposure, 175);
  assert.equal(display.perLimit[0].exposure, 175);
  assert.equal(display.perLimit[0].excess, 0.75);
});
test('PERF-CPU-15 one exact score owns its arithmetic and deviation facts together', () => {
  const input = request({ safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 100, maxUnit: 'mg', sourceScope: 'supplemental' }] });
  const exposure = new Map([['a', 175_000_000n]]);
  const original = WeakMap.prototype.set, registrations = new Map<object, number>();
  let score;
  try {
    WeakMap.prototype.set = function (key, value) {
      registrations.set(key, (registrations.get(key) ?? 0) + 1);
      return original.call(this, key, value);
    };
    score = numericalDoseFitScore(input, exposure);
  } finally { WeakMap.prototype.set = original; }
  assert.deepEqual(exactDoseFit(score), { num: 9n, den: 4n });
  assert.equal(registrations.get(score), 1, 'Thousands of losing scores need one lifetime record, not three independent GC ownership edges');
  const display = doseFitScore(input, exposure);
  assert.equal(compareDoseFit(display, score), 0);
  assert.equal(display.perTarget[0].over, 0.75);
  assert.equal(display.perLimit[0].excess, 0.75);
  assert.deepEqual(Object.keys(structuredClone(display)).sort(), Object.keys(display).sort(), 'No internal exact cache facts leak into the public result');
});
test('PERF-CPU-16 retained baskets reuse quantity lookup without rescanning unrelated variants', async () => {
  const { compileGroups } = await import('../../lib/matcher/candidates.ts');
  const { reconstructVariants, quantityById } = await import('../../lib/matcher/search.ts');
  const { product } = await import('../matcher/flexible-v5-fixtures.ts');
  const groups = compileGroups(request(), { catalogueVersion: 'quantity-lookup', availabilityAsOf: '2026-09-26', products:
    Array.from({ length: 12 }, (_, i) => product('quantity-' + i, { a: 10 + i })) });
  assert.ok(groups.length === 12 && groups.every(group => group.variants.length > 1));
  let reads = 0;
  const watched = groups.map(group => ({ ...group, variants: group.variants.map(variant => new Proxy(variant, {
    get(target, field, receiver) { if (field === 'variantId') reads++; return Reflect.get(target, field, receiver); }
  })) }));
  const first = watched[0].variants[0], id = first.variantId;
  for (const group of watched) quantityById(group.variants, id);
  reads = 0;
  const result = reconstructVariants(watched, [id, 'absent', id]);
  assert.equal(reads, 0, 'An already indexed immutable catalogue must not be rescanned for every retained basket');
  assert.deepEqual(result, [first, first], 'Selection order, duplicate requests and omitted unknown IDs stay compatible');
  const last = { ...first, dailyPills: first.dailyPills + 1 };
  watched[0].variants.push(last);
  assert.strictEqual(quantityById(watched[0].variants, id), first, 'Search preserves its first duplicate identity');
  assert.deepEqual(reconstructVariants(watched, [id]), [last], 'Historical revalidation preserves its last duplicate identity');
  watched[0].variants.pop();
  assert.deepEqual(reconstructVariants(watched, [id]), [first], 'A truncated quantity domain invalidates the prior index');
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

test('PERF-CPU-11 candidate addition avoids temporary maps without mixing product contribution and total exposure', async () => {
  const { compileGroups } = await import('../../lib/matcher/candidates.ts');
  const { product } = await import('../matcher/flexible-v5-fixtures.ts');
  const { seedState, tryAddVariant } = await import('../../lib/matcher/search.ts');
  const input=request(), listing=product('map-reuse',{a:50});
  const [group]=compileGroups(input,{catalogueVersion:'maps',availabilityAsOf:'2026-09-26',products:[listing]});
  assert.ok(group); const variant=group.variants[0]!;
  const seed=seedState(input); assert.ok(tryAddVariant(seed,variant,group,input));
  const map=globalThis.Map;let allocations=0;let result;
  try {
    globalThis.Map=new Proxy(map,{construct(target,args){allocations++;return Reflect.construct(target,args);}});
    result=tryAddVariant(seed,variant,group,input);
  } finally {globalThis.Map=map;}
  assert.ok(result);
  assert.equal(allocations,1,'Equal supplied/exposure facts need one child map, with no temporary merge map');
  assert.equal(seed.exposure.size,0);assert.equal(seed.delivered.size,0,'Parent state remains immutable');
  const incidental=product('incidental',{a:50,b:20});
  const [second]=compileGroups(input,{catalogueVersion:'maps-2',availabilityAsOf:'2026-09-26',products:[incidental]});assert.ok(second);
  const different=tryAddVariant(result,second.variants[0]!,second,input);assert.ok(different);
  assert.equal(different.exposure.get('b'),20_000_000n);
  assert.equal(different.delivered.get('b'),undefined,'An incidental label amount is not a requested contribution');
  assert.equal(different.exposure.get('a'),result.exposure.get('a')!+50_000_000n,'Overlapping safety/target quantities are added once');
});

test('PERF-CPU-09 repeated physical-quantity lookup avoids rescanning old variants and retains new quantities', async () => {
  const { compileGroups, compileVariant } = await import('../../lib/matcher/candidates.ts');
  const { product } = await import('../matcher/flexible-v5-fixtures.ts');
  const { seedState, tryAddVariant, reconstructVariants } = await import('../../lib/matcher/search.ts');
  const input = request(), listing = product('indexed', { a: 5 });
  const [compiled] = compileGroups(input, { catalogueVersion: 'index', availabilityAsOf: '2026-09-26', products: [listing] });
  assert.ok(compiled && compiled.variants.length > 2, 'Fixture must contain several supported quantities');
  let reads = 0;
  const variants = compiled.variants.map((value, i) => i === 0 ? value : new Proxy(value, {get(target,key,receiver) {
    if(key === 'variantId') reads++; return Reflect.get(target,key,receiver);
  }}));
  const group = {...compiled, variants}, first = variants[0]!;
  const unrelated = {...seedState(input), selectedVariantIds:['unrelated:x1'], selectedProductIds:['unrelated']};
  assert.ok(tryAddVariant(unrelated, first, group, input)); reads = 0;
  assert.ok(tryAddVariant(unrelated, first, group, input));
  assert.equal(reads, 0, 'Existing physical quantities must be indexed once, not scanned on every addition');
  const extra = compileVariant({product:listing,request:input,dailyUnits:71}); assert.ok(extra);
  variants.push(extra);
  assert.equal(tryAddVariant({...unrelated,selectedVariantIds:[extra.variantId]}, first, group, input),null,
    'A dynamically appended physical quantity still prevents selecting a second quantity of that product');
  assert.deepEqual(reconstructVariants([group], [extra.variantId, first.variantId]), [extra,first]);
  assert.deepEqual(reconstructVariants([{...group,variants:[{...first,dailyPills:91}]}], [first.variantId])[0]?.dailyPills,91,
    'Replaced immutable quantity arrays carry their own values');
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


test('PERF-CPU-12 numerical practical scoring does not allocate presentation completeness sets', async () => {
  const { numericalOverallMatchingScore, scorePracticalPenalties } = await import('../../lib/matcher/practical-scoring.ts');
  const input=request({maxDailyPills:3,maxProductCount:1,maxPriceMinor:10000});
  const exposure=new Map([['a',100_000_000n]]);
  const actual={dailyPills:null,pillLowerBound:4,productCount:2,priceMinor:null,priceLowerBound:12000,currency:'THB',servings:[1,1],uncertainProductCount:1};
  numericalOverallMatchingScore(input,exposure,{...actual});
  const SetType=globalThis.Set;let allocations=0;let score;
  try {
    globalThis.Set=new Proxy(SetType,{construct(target,args){allocations++;return Reflect.construct(target,args);}});
    score=numericalOverallMatchingScore(input,exposure,actual);
  } finally {globalThis.Set=SetType;}
  assert.ok(score);assert.equal(allocations,0,'Losing candidates need exact penalties, not a presentation set of missing fields');
  // 1/36 pill overrun + 1/4 product overrun + 1/100 price overrun + 1/4 unknown administration.
  assert.deepEqual(score.exactTotal,{num:121n,den:225n});
  const display=scorePracticalPenalties(input,actual);
  assert.equal(display.complete,false);
  assert.deepEqual(display.missingComponents,['administrationBasis','dailyPills','firstOrderPrice','maxDailyPills','maxPriceMinor']);
  assert.equal(display.preferences.maxDailyPills.actual,null);
  assert.equal(display.preferences.maxDailyPills.actualLowerBound,4);
  assert.equal(display.preferences.maxDailyPills.penalty,1/36);
  assert.equal(display.preferences.maxPriceMinor.penalty,1/100);
});
