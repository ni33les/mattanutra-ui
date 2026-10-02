import assert from 'node:assert/strict';
import test from 'node:test';
import { request, product, catalog } from '../matcher/flexible-v5-fixtures.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { compileGroups } from '../../lib/matcher/candidates.ts';
import { seedState, tryAddVariant } from '../../lib/matcher/search.ts';
import { numericalDoseFitScore, numericalWeightedDoseFitScore, doseFitScore } from '../../lib/matcher/dose-fit.ts';
import { compare } from '../../lib/matcher/rational.ts';

test('EFF-NEXT-01 compiled target ordering preserves incidental safety and request isolation', () => {
  const targets = canonicalizeTargets({ targets: ['c', 'b', 'a'].map(subjectId => ({ subjectId, name: subjectId.toUpperCase(), amount: 100, unit: 'mg' as const })) }).targets.reverse();
  const input = request({ targets, safetyCeilings: [{ subjectId: 'x', name: 'X', maxAmount: 100, maxUnit: 'mg', sourceScope: 'supplemental' }] });
  const exposure = new Map([['c', 100_000_000n], ['a', 25_000_000n], ['x', 200_000_000n]]);
  const numeric = numericalDoseFitScore(input, exposure);
  assert.deepEqual(numeric.deviations.map(row => row.subjectId), ['a', 'b', 'c']);
  assert.ok(numeric.safety.num > 0n);
  const publicScore = doseFitScore(input, exposure);
  assert.equal(publicScore.perLimit?.find(row => row.subjectId === 'x')?.exposure, 200);
  const revised = { ...input, safetyCeilings: [{ ...input.safetyCeilings![0]!, maxAmount: 300 }] };
  assert.equal(numericalDoseFitScore(revised, exposure).safety.num, 0n);
  assert.ok(compare(numericalDoseFitScore(revised, exposure).exact, numeric.exact) < 0);
  assert.deepEqual(numericalDoseFitScore(input, exposure), numeric);
  assert.deepEqual(numericalDoseFitScore(input, new Map([...exposure].reverse())), numeric);
});

test('EFF-NEXT-02 unit weights reuse uncertain endpoints while revised weights remain distinct', () => {
  const input = request({ scoring: { profile: 'balanced', weights: { nutrients: { a: 1 } } }, currentSupplements: [{
    sourceId: 'range', subjectId: 'a', name: 'A', dailyAmount: 100, minimumDailyAmount: 0, maximumDailyAmount: 150, unit: 'mg',
    daily: { units: 100_000_000n, dim: 'mass', subjectId: 'a' }
  }] });
  const exposure = new Map([['a', 100_000_000n]]);
  const raw = numericalDoseFitScore(input, exposure), weighted = numericalWeightedDoseFitScore(input, exposure);
  assert.deepEqual(weighted, raw);
  const revised = { ...input, scoring: { profile: 'balanced' as const, weights: { nutrients: { a: 2 } } } };
  assert.ok(compare(numericalWeightedDoseFitScore(revised, exposure).exact, weighted.exact) > 0);
  assert.deepEqual(numericalWeightedDoseFitScore(input, new Map(exposure)), weighted);
});

test('EFF-NEXT-03 eligibility is assessed once per variant and reevaluated for a revised request', () => {
  const input = request(), [group] = compileGroups(input, catalog([product('eligible', { a: 20 })]));
  assert.ok(group); const variant = group.variants[0]!;
  let probes = 0; const has = variant.contributions.has.bind(variant.contributions);
  variant.contributions.has = id => { probes++; return has(id); };
  const first = tryAddVariant(seedState(input), variant, group, input); assert.ok(first);
  const initialProbes = probes; assert.ok(initialProbes > 0);
  for (let i = 0; i < 128; i++) assert.ok(tryAddVariant({ ...seedState(input), exposure: new Map([['a', BigInt(i)]]) }, variant, group, input));
  assert.equal(probes, initialProbes, 'New parent baskets do not change variant eligibility');
  const revised = request({ targets: canonicalizeTargets({ targets: [{ subjectId: 'b', name: 'B', amount: 100, unit: 'mg' }] }).targets });
  assert.equal(tryAddVariant(seedState(revised), variant, group, revised), null);
  assert.ok(probes > initialProbes);
  const retained = { ...revised, retainProductIds: [group.productId] };
  assert.ok(tryAddVariant(seedState(retained), variant, group, retained));
});
