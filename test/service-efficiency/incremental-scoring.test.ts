import assert from 'node:assert/strict';
import test from 'node:test';
import { request, product, catalog } from '../matcher/flexible-v5-fixtures.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import * as dose from '../../lib/matcher/dose-fit.ts';
import { searchSelectionKey } from '../../lib/matcher/search-cursor.ts';
import { residualPattern, seedState, reviewFrontier, tryAddVariant } from '../../lib/matcher/search.ts';
import { fingerprintState } from '../../lib/matcher/dominance.ts';
import { compileGroups } from '../../lib/matcher/candidates.ts';

test('EFF-INC-01 immutable selection keys are reused and remain local to restored cursor numbering', () => {
  let reads = 0;
  const ids = new Proxy(['b', 'a'], { get(target, key, receiver) { if (key === 'map') reads++; return Reflect.get(target, key, receiver); } });
  const first = { variantIds: [] as string[], variantIndex: new Map<string, number>() };
  for (let i = 0; i < 100; i++) assert.equal(searchSelectionKey(first, ids), '0,1');
  assert.equal(reads, 1, 'An unchanged parent is indexed once across repeated probes');
  assert.equal(searchSelectionKey(first, ['c']), '2');
  assert.equal(searchSelectionKey(first, ids), '0,1');
  const other = { variantIds: ['x', 'a'], variantIndex: new Map([['x', 0], ['a', 1]]) };
  assert.equal(searchSelectionKey(other, ids), '1,2');
  assert.equal(searchSelectionKey(structuredClone(first), ids), '0,1');
  assert.equal(searchSelectionKey(first, []), '');
});

test('EFF-INC-02 residual signatures reuse immutable delivered amounts while isolating request revisions', () => {
  const input = request(); let reads = 0;
  const delivered = new Map([['a', 50_000_000n]]), get = delivered.get.bind(delivered);
  delivered.get = key => { reads++; return get(key); };
  const state = { ...seedState(input), delivered };
  for (let i = 0; i < 100; i++) assert.equal(residualPattern({ ...state, nextGroupIndex: i }, input), '5');
  assert.equal(reads, 1);
  const revised = { ...input, targets: [{ ...input.targets[0]!, requested: { ...input.targets[0]!.requested, units: 50_000_000n } }] };
  assert.equal(residualPattern(state, revised), '10');
  assert.equal(residualPattern({ ...state, delivered: new Map([['a', 60_000_000n]]) }, input), '6');
  assert.equal(residualPattern(state, { ...input, targets: [] }), '');
});

test('EFF-INC-03 repeated review retains the same frontier without rereading target deviations', () => {
  const input = request();
  input.targets = [{ ...input.targets[0]!, importance: 'required' }, { ...input.targets[0]!, subjectId: 'b', name: 'B', importance: 'optional' }];
  const states = Array.from({ length: 260 }, (_, i) => {
    const exposure = new Map([['a', BigInt(i % 131) * 1_000_000n], ['b', BigInt((i * 17) % 151) * 1_000_000n]]);
    return { ...seedState(input), exposure, delivered: exposure, count: 1, price: i + 1, selectedVariantIds: [String(i)], selectedProductIds: [String(i)] };
  });
  const expected = reviewFrontier(structuredClone(states), structuredClone(input), []).map(fingerprintState);
  let reads = 0;
  for (const state of states) for (const row of dose.doseFitTargetDeviations(dose.numericalDoseFitScore(input, state.exposure))) {
    const under = row.under;
    Object.defineProperty(row, 'under', { get() { reads++; return under; } });
  }
  assert.deepEqual(reviewFrontier(states, input, []).map(fingerprintState), expected);
  assert.ok(reads > 0);
  reads = 0;
  assert.deepEqual(reviewFrontier(states, input, []).map(fingerprintState), expected);
  assert.equal(reads, 0, 'A second review uses the facts already computed for these candidates');
  const revised = { ...input, targets: input.targets.map(row => ({ ...row, importance: 'optional' as const })) };
  assert.deepEqual(reviewFrontier(states, revised, []).map(fingerprintState), reviewFrontier(structuredClone(states), structuredClone(revised), []).map(fingerprintState));
});

const manyTargets = () => canonicalizeTargets({ targets: ['a', 'b', 'c'].map((subjectId, i) => ({ subjectId, name: subjectId.toUpperCase(), amount: 100 - i * 20, unit: 'mg' })) }).targets;

test('EFF-INC-04 incremental exact scores equal independent full traversal across weighted uncertain endpoints and incidental limits', () => {
  const variants = [
    request({ targets: manyTargets() }),
    request({ targets: manyTargets(), scoring: { profile: 'best_coverage', weights: { nutrients: { a: 0, b: 1.234567 } } },
      safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 120, maxUnit: 'mg', sourceScope: 'total' }, { subjectId: 'x', name: 'X', maxAmount: 20, maxUnit: 'mg', sourceScope: 'supplemental' }],
      dietaryIntake: [{ subjectId: 'a', name: 'A', unit: 'mg', dailyAmount: 50, minimumDailyAmount: 0, maximumDailyAmount: 100, daily: { subjectId: 'a', dim: 'mass_ng', units: 50_000_000n }, certainty: 'estimated', sourceId: 'food' }] }),
    request({ targets: manyTargets(), currentSupplements: [{ subjectId: 'a', name: 'A', unit: 'mg', dailyAmount: 20, minimumDailyAmount: 10, maximumDailyAmount: 30, daily: { subjectId: 'a', dim: 'mass_ng', units: 20_000_000n }, certainty: 'estimated', sourceId: 'current' }] })
  ];
  for (const input of variants) {
    let parent = new Map([['a', 20_000_000n], ['b', 0n], ['c', 0n]]);
    for (let i = 0; i < 30; i++) {
      for (const score of [dose.numericalDoseFitScore, dose.numericalWeightedDoseFitScore]) score(input, parent);
      const changed = [['a'], ['x'], ['b'], ['b', 'c']][i % 4]!;
      const child = new Map(parent);
      for (const id of changed) child.set(id, (parent.get(id) ?? 0n) + BigInt(i + 1) * 2_000_000n);
      dose.registerDoseFitChange(child, parent, changed);
      const scorers = [dose.numericalDoseFitScore, dose.numericalWeightedDoseFitScore];
      if (i % 2) scorers.reverse();
      for (const score of scorers) assert.deepEqual(score(input, child), score(structuredClone(input), new Map(child)));
      assert.deepEqual(dose.weightedDoseFitScore(input, child), dose.weightedDoseFitScore(structuredClone(input), new Map(child)));
      parent = child;
    }
  }
});

test('EFF-INC-05 incremental scoring reads changed nutrients only and falls back for missing parent scores or restored maps', () => {
  const input = request({ targets: manyTargets() });
  const parent = new Map([['a', 50_000_000n], ['b', 30_000_000n], ['c', 0n]]);
  dose.numericalDoseFitScore(input, parent);
  const child = new Map(parent); child.set('b', 80_000_000n);
  const expected = dose.numericalDoseFitScore(structuredClone(input), new Map(child));
  const reads: string[] = [], get = child.get.bind(child);
  child.get = key => { reads.push(key); return get(key); };
  dose.registerDoseFitChange(child, parent, ['b']);
  assert.deepEqual(dose.numericalDoseFitScore(input, child), expected);
  assert.deepEqual(reads, ['b']);
  const restored = new Map(child);
  assert.deepEqual(dose.numericalDoseFitScore(input, restored), expected);
  const fresh = structuredClone(input), orphan = new Map(child);
  dose.registerDoseFitChange(orphan, new Map(parent), ['b']);
  assert.deepEqual(dose.numericalDoseFitScore(fresh, orphan), expected);
});

test('EFF-INC-06 immutable candidate additions reuse unchanged unknown-product lists without altering parent state', () => {
  const input = request(), groups = compileGroups(input, catalog([product('first', { a: 25 }), product('second', { a: 30 })]));
  const parent = seedState(input);
  const first = tryAddVariant(parent, groups[0]!.variants[0]!, groups[0]!, input)!;
  const second = tryAddVariant(first, groups[1]!.variants[0]!, groups[1]!, input)!;
  assert.equal(parent.exposure.size, 0);
  assert.equal(first.selectedVariantIds.length, 1);
  assert.equal(second.selectedVariantIds.length, 2);
  assert.strictEqual(second.unknownProductIds, first.unknownProductIds);
  assert.notStrictEqual(second.exposure, first.exposure);
  assert.deepEqual(second.unknownProductIds, []);
  const uncertain = tryAddVariant(first, { ...groups[1]!.variants[0]!, unknownSafetyAmount: true }, groups[1]!, input)!;
  assert.deepEqual(uncertain.unknownProductIds, [groups[1]!.productId]);
  assert.deepEqual(first.unknownProductIds, []);
});

test('EFF-INC-07 zero targets, deferred targets and unavailable limit profiles retain exact full-score behavior', () => {
  const targets = canonicalizeTargets({ targets: [{ subjectId: 'vitamin-d3', name: 'Vitamin D3', amount: 0, unit: 'mcg' }] }).targets;
  targets.push(...manyTargets().slice(1), { ...manyTargets()[0]!, importance: 'conditional', prerequisite: { status: 'unknown' } });
  for (const profileKnown of [undefined, { ageYears: false, lifeStage: false }]) {
    const input = request({ targets, profileKnown, scoring: { profile: 'best_coverage', weights: {} },
      safetyCeilings: [{ subjectId: 'vitamin-d3', name: 'Vitamin D3', maxAmount: 100, maxUnit: 'mcg', sourceScope: 'supplemental' }] });
    const parent = new Map<string, bigint>();
    for (const score of [dose.numericalDoseFitScore, dose.numericalWeightedDoseFitScore]) score(input, parent);
    const child = new Map([['vitamin-d3', 125_000n]]);
    dose.registerDoseFitChange(child, parent, [...child.keys()]);
    for (const score of [dose.numericalDoseFitScore, dose.numericalWeightedDoseFitScore]) assert.deepEqual(score(input, child), score(structuredClone(input), new Map(child)));
    assert.deepEqual(dose.doseFitScore(input, child), dose.doseFitScore(structuredClone(input), new Map(child)));
  }
});

test('EFF-INC-08 equal penalties retain distinct display exposures and zero-valued incidental limit rows', () => {
  const input = request({ targets: manyTargets(), safetyCeilings: [{ subjectId: 'x', name: 'X', maxAmount: 100, maxUnit: 'mg', sourceScope: 'supplemental' }] });
  const parent = new Map([['a', 100_000_000n]]);
  const before = dose.doseFitScore(input, parent);
  const child = new Map(parent); child.set('x', 0n);
  dose.registerDoseFitChange(child, parent, ['x']);
  const after = dose.doseFitScore(input, child);
  assert.equal(after.total, before.total);
  assert.notStrictEqual(after, before);
  assert.equal(before.perLimit?.length, 0);
  assert.equal(after.perLimit?.length, 1);
  assert.deepEqual(after, dose.doseFitScore(structuredClone(input), new Map(child)));
});
