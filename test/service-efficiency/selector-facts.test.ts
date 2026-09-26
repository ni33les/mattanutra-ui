import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
const candidates = await import('../../lib/matcher/candidates.ts');
let lookups = 0, dedicationChecks = 0, coverageRenders = 0;
mock.module('../../lib/matcher/candidates.ts', { namedExports: { ...candidates,
  productIsDedicatedForTarget: (...args: Parameters<typeof candidates.productIsDedicatedForTarget>) => { dedicationChecks++; return candidates.productIsDedicatedForTarget(...args); },
  contributionFor: (...args: Parameters<typeof candidates.contributionFor>) => { lookups++; return candidates.contributionFor(...args); }
} });
const coverage = await import('../../lib/matcher/coverage.ts');
mock.module('../../lib/matcher/coverage.ts', { namedExports: { ...coverage, coverageSummary: (...args: Parameters<typeof coverage.coverageSummary>) => { coverageRenders++; return coverage.coverageSummary(...args); } } });
const { request, product, catalog } = await import('../matcher/flexible-v5-fixtures.ts');
const { seedState, tryAddVariant } = await import('../../lib/matcher/search.ts');
const { scoreState, materiallyDifferent } = await import('../../lib/matcher/selector.ts');

test('PERF-CPU-52 losing baskets do not render unused coverage and descriptive counts', () => {
  const input = request(), groups = candidates.compileGroups(input, catalog([product('partial', { a: 5 })]));
  const variant = groups[0].variants.find(row => row.dailyUnits === 1); assert.ok(variant);
  const state = tryAddVariant(seedState(input), variant, groups[0], input); assert.ok(state);
  dedicationChecks = coverageRenders = 0;
  const score = scoreState({ groups, request: input, sellerId: 'seller', state }); assert.ok(score);
  assert.deepEqual({ dedicationChecks, coverageRenders }, { dedicationChecks: 0, coverageRenders: 0 });
  assert.equal(score.coverageSummary?.[0].coveragePercent, 5);
  assert.equal(score.coverageSummary?.[0].remainingGap, 95);
  assert.equal(score.dedicatedPartialCount, 1);
  assert.equal(score.coveredCount, 0); assert.equal(score.titleExactCount, 0); assert.equal(score.oversupplyScore, 0);
  const copied = structuredClone(score);
  assert.deepEqual(copied, score, 'Worker transfer preserves complete values for retained baskets');
  assert.equal(Object.getOwnPropertyDescriptor(copied, 'coverageSummary')?.get, undefined);
});

test('PERF-CPU-46 repeated choice comparisons reuse immutable product-dose identities', () => {
  const input = request(), groups = candidates.compileGroups(input, catalog([product('choice', { a: 50 })]));
  const scores = [1, 2].map(units => {
    const variant = groups[0].variants.find(row => row.dailyUnits === units); assert.ok(variant);
    const state = tryAddVariant(seedState(input), variant, groups[0], input); assert.ok(state);
    const score = scoreState({ groups, request: input, sellerId: 'seller', state }); assert.ok(score); return score;
  });
  const alternateSeller = { ...scores[0], sellerId: 'another', variantIds: scores[0].variantIds.map(id => id.replace('seller:', 'another:')) };
  const original = Array.prototype.sort; let identitySorts = 0;
  try {
    Array.prototype.sort = function (...args) { if (typeof this[0] === 'string' && this[0].startsWith('choice:x')) identitySorts++; return Reflect.apply(original, this, args); };
    for (let i = 0; i < 100; i++) {
      assert.equal(materiallyDifferent(scores[0], scores[1]), true);
      assert.equal(materiallyDifferent(scores[0], alternateSeller), false, 'Seller changes do not invent a product alternative');
    }
  } finally { Array.prototype.sort = original; }
  assert.equal(identitySorts, 3, 'Each immutable basket needs one identity, regardless of the number of comparisons');
});

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
