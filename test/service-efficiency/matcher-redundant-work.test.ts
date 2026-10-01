import assert from 'node:assert/strict';
import test from 'node:test';
import { request, product, catalog } from '../matcher/flexible-v5-fixtures.ts';
import { compileGroups } from '../../lib/matcher/candidates.ts';
import { fingerprintState } from '../../lib/matcher/dominance.ts';
import { seedState, reconstructVariants, tryAddVariant, compareSearchStates } from '../../lib/matcher/search.ts';
import { createMatchCursor, advanceMatchCursor } from '../../lib/matcher/match-cursor.ts';
import { encodeMatchCursorBytes, decodeMatchCursor } from '../../lib/matcher/cursor-codec-server.ts';
import { DEFAULT_MATCHER_CONFIG, match, targetFrontiersFor } from '../../lib/matcher/index.ts';
import { scoreState, selectOptions, compareBaskets, compareClosestDose, protectedReferenceCandidates } from '../../lib/matcher/selector.ts';
import { compareDoseFit, numericalDoseFitScore, doseFitTargetDeviations } from '../../lib/matcher/dose-fit.ts';
import { completionReferences } from '../../lib/matcher/search-cursor.ts';

test('EFF-SIX-01 beam frontiers contain each fingerprint once, including repeated probes and skipped parents', () => {
  const input = request(), products = catalog(Array.from({ length: 12 }, (_, i) => product(`beam-${i}`, { a: 15 + i })));
  const config = { ...DEFAULT_MATCHER_CONFIG, exactGroupLimit: 0, expansionBudget: 2400 };
  const cursor = createMatchCursor(input, products, config);
  let checked = 0;
  while (!cursor.done) {
    advanceMatchCursor(cursor, input, 16);
    const beam = cursor.sellers[0]!.cursor;
    if (beam.phase !== 'beam' || !beam.expanded.length) continue;
    checked++;
    assert.equal(new Set(beam.expanded.map(fingerprintState)).size, beam.expanded.length);
  }
  assert.ok(checked > 2, 'Exercise multiple live beam frontiers');
  assert.equal(cursor.sellers[0]!.cursor.expansionAttempts, 2400);
});

test('EFF-SIX-02 historical duplicate beam entries resume with the same complete result and work budget', () => {
  const input = request(), products = catalog(Array.from({ length: 12 }, (_, i) => product(`resume-${i}`, { a: 15 + i })));
  const config = { ...DEFAULT_MATCHER_CONFIG, exactGroupLimit: 0, expansionBudget: 2400 };
  const cursor = createMatchCursor(input, products, config);
  while (!cursor.done && !cursor.sellers[0]!.cursor.expanded.length) advanceMatchCursor(cursor, input, 16);
  assert.ok(!cursor.done, 'Capture an active beam');
  const historical = decodeMatchCursor(encodeMatchCursorBytes(cursor), cursor.identity);
  const expanded = historical.sellers[0]!.cursor.expanded;
  expanded.push(...structuredClone(expanded));
  for (const current of [cursor, historical]) advanceMatchCursor(current, input, 2400);
  assert.deepEqual(match(input, products, config, undefined, undefined, historical), match(input, products, config, undefined, undefined, cursor));
});

test('EFF-SIX-03 a final variant index preserves duplicate resolution, order, multiplicity and newly compiled quantities', async () => {
  const { indexVariants } = await import('../../lib/matcher/search.ts');
  assert.equal(typeof indexVariants, 'function');
  const input = request(), groups = compileGroups(input, catalog([product('indexed', { a: 25 }), product('other', { a: 50 })]));
  const first = groups[0]!.variants[0]!, duplicate = { ...first, dailyUnits: 99 };
  const appended = { ...first, variantId: `${first.variantId}-new`, dailyUnits: 101 };
  const changed = [...groups, { ...groups[0]!, variants: [...groups[0]!.variants, duplicate, appended] }];
  const ids = [first.variantId, 'missing', appended.variantId, first.variantId];
  const expected = reconstructVariants(changed, ids);
  let reads = 0;
  const counted = changed.map(group => ({ ...group, get variants() { reads++; return group.variants; } }));
  const index = indexVariants(counted);
  const preparationReads = reads;
  for (let i = 0; i < 100; i++) assert.deepEqual(reconstructVariants(counted, ids, index), expected);
  assert.equal(reads, preparationReads, 'Each basket resolves selected IDs without scanning the groups again');
  assert.deepEqual(expected, [duplicate, appended, duplicate]);
});

const scoredFixture = () => {
  const input = request();
  input.targets = [{ ...input.targets[0]!, importance: 'core' }, { ...input.targets[0]!, subjectId: 'b', name: 'B', importance: 'optional' }];
  const groups = compileGroups(input, catalog(Array.from({ length: 20 }, (_, i) => product(`choice-${i}`, { a: 25 + i, b: 50 - i }))));
  const baskets = groups.map(group => {
    const variant = group.variants.find(row => row.dailyUnits === 1)!;
    const state = tryAddVariant(seedState(input), variant, group, input); assert.ok(state);
    const basket = scoreState({ groups, request: input, sellerId: group.sellerId, state }); assert.ok(basket);
    return basket;
  });
  return { input, groups, baskets };
};

test('EFF-SIX-04 protected dominance runs once while preserving both independently ranked winners', () => {
  const { input, baskets } = scoredFixture();
  const ranked = [...baskets].sort((a,b) => compareBaskets(a,b,input));
  const best = protectedReferenceCandidates(ranked, input)[0]!;
  const closest = protectedReferenceCandidates([...ranked].sort((a,b) => compareClosestDose(a,b,input)), input)[0]!;
  const components = new Set(baskets.map(row => row.overallScore!.components));
  const entries = Object.entries; let vectorBuilds = 0;
  try {
    Object.entries = value => { if (components.has(value)) vectorBuilds++; return entries(value); };
    const result = selectOptions({ baskets, request: input });
    assert.deepEqual(result.selected!.variantIds, best.variantIds);
    assert.deepEqual([result.selected, ...result.alternatives].find(row => row?.roles?.includes('closest_dose'))!.variantIds, closest.variantIds);
  } finally { Object.entries = entries; }
  assert.equal(vectorBuilds, baskets.length, 'One protected-fact vector per eligible basket');
});

test('EFF-SIX-05 target frontiers preserve exhaustive results, sort once and stop after three distinct products', () => {
  const { input, groups, baskets } = scoredFixture();
  const expected = input.targets.map(target => ({ subjectId: target.subjectId, name: target.name,
    productIds: [...new Set(baskets.filter(row => (row.coverageBySubject.get(target.subjectId) ?? 0) > 0)
      .sort((a,b) => compareBaskets(a,b,input)).flatMap(row => row.productIds.filter(id =>
        groups.some(group => group.sellerId === row.sellerId && group.productId === id && group.variants.some(variant =>
          row.variantIds.includes(variant.variantId) && (variant.contributions.get(target.subjectId)?.units ?? 0n) > 0n)))))].slice(0,3) }));
  let scans = 0, sorts = 0;
  const counted = groups.map(group => ({ ...group, get variants() { scans++; return group.variants; } }));
  const sort = Array.prototype.sort;
  try {
    Array.prototype.sort = function (...args) { if (this[0]?.coverageBySubject) sorts++; return Reflect.apply(sort, this, args); };
    assert.deepEqual(targetFrontiersFor(baskets, counted, input, DEFAULT_MATCHER_CONFIG), expected);
  } finally { Array.prototype.sort = sort; }
  assert.equal(sorts, 1);
  assert.equal(scans, 3 * input.targets.length);
  assert.deepEqual(targetFrontiersFor([], groups, input, DEFAULT_MATCHER_CONFIG).map(row => row.productIds), [[], []]);
});

test('EFF-SIX-06 completion references preserve stable minima and compute deviations once per candidate', () => {
  const input = request(); let reads = 0;
  const candidates = Array.from({ length: 1000 }, (_, i) => {
    const exposure = new Map([['a', BigInt((i * 7919) % 1000 + 1) * 99000n]]);
    return { ...seedState(input), get exposure() { reads++; return exposure; }, selectedVariantIds: [String(i)] };
  });
  const expected = input.targets.map(target => {
    const loss = (state: typeof candidates[number]) => doseFitTargetDeviations(numericalDoseFitScore(input, state.exposure)).find(row => row.subjectId === target.subjectId)!.under;
    return [...candidates].sort((a,b) => loss(a)-loss(b) || compareDoseFit(numericalDoseFitScore(input,a.exposure),numericalDoseFitScore(input,b.exposure)) || compareSearchStates(a,b,input))[0];
  });
  reads = 0;
  assert.deepEqual(completionReferences(candidates, input), expected);
  assert.equal(reads, candidates.length);
  assert.deepEqual(completionReferences([], input), []);
  assert.deepEqual(completionReferences([candidates[0]!, { ...candidates[0]! }], input), [candidates[0]!]);
});
