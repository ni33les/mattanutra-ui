import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
const candidates = await import('../../lib/matcher/candidates.ts');
let lookups = 0;
mock.module('../../lib/matcher/candidates.ts', { namedExports: { ...candidates,
  contributionFor: (...args: Parameters<typeof candidates.contributionFor>) => { lookups++; return candidates.contributionFor(...args); }
} });
const { request, product, catalog } = await import('../matcher/flexible-v5-fixtures.ts');
const { seedState, tryAddVariant } = await import('../../lib/matcher/search.ts');
const { scoreState } = await import('../../lib/matcher/selector.ts');

test('PERF-CPU-35 incidental classification resolves each requested product contribution once per basket', () => {
  const input = request(), item = product('wide', { a: 100, ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`b${i}`, 1])) });
  const [group] = candidates.compileGroups(input, catalog([item])); assert.ok(group);
  const variant = group.variants.find(row => row.dailyUnits === 1); assert.ok(variant);
  const state = tryAddVariant(seedState(input), variant, group, input); assert.ok(state);
  lookups = 0;
  const score = scoreState({ groups: [group], request: input, sellerId: 'seller', state }); assert.ok(score);
  assert.equal(score.incidentalCount, 30); assert.equal(score.requestedLabelCount, 1);
  assert.equal(lookups, 2, 'One classification lookup plus one requested-label lookup; incidental facts do not repeat target resolution');
  const revised = { ...input, targets: [...input.targets, { ...input.targets[0]!, subjectId: 'b0', name: 'B0', requested: { ...input.targets[0]!.requested, subjectId: 'b0' } }] };
  const changed = scoreState({ groups: [group], request: revised, sellerId: 'seller', state }); assert.ok(changed);
  assert.equal(changed.incidentalCount, 29); assert.equal(changed.requestedLabelCount, 2);
});

test('PERF-CPU-43 repeated baskets reuse immutable label classification without caching dose-dependent coverage', () => {
  const input = request(), item = product('focused', { a: 100 });
  const [group] = candidates.compileGroups(input, catalog([item])); assert.ok(group);
  const one = group.variants.find(row => row.dailyUnits === 1); assert.ok(one);
  const state = tryAddVariant(seedState(input), one, group, input); assert.ok(state);
  const first = scoreState({ groups: [group], request: input, sellerId: 'seller', state }); assert.ok(first);
  assert.equal(first.requestedLabelCount, 1); assert.equal(first.incidentalCount, 0);
  lookups = 0;
  const partial = { ...state, exposure: new Map([['a', 50_000_000n]]), delivered: new Map([['a', 50_000_000n]]) };
  const changed = scoreState({ groups: [group], request: input, sellerId: 'seller', state: partial }); assert.ok(changed);
  assert.equal(changed.dedicatedPartialCount, 1); assert.equal(first.dedicatedPartialCount, 0);
  assert.equal(changed.coverageBySubject.get('a'), 5000); assert.equal(first.coverageBySubject.get('a'), 10000);
  assert.equal(lookups, 0, 'Request/product label facts are constant across quantity choices');
  const revised = { ...input, targets: [{ ...input.targets[0]!, subjectId: 'b', name: 'B', requested: { ...input.targets[0]!.requested, subjectId: 'b' } }] };
  const other = scoreState({ groups: [group], request: revised, sellerId: 'seller', state }); assert.ok(other);
  assert.equal(other.requestedLabelCount, 0); assert.equal(other.incidentalCount, 1);
});
