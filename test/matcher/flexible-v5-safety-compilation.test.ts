import assert from 'node:assert/strict';
import { it } from 'node:test';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { labelledSafetyExposure } from '../../lib/matcher/safety.ts';
import { product, request } from './flexible-v5-fixtures.ts';

it('V5-SAFETY-COMPILE-01: additional quantities reuse resolved facts without repeating reference-name matching', () => {
  let referenceReads = 0;
  const input = request({ targets: [], safetyCeilings: [{ subjectId: 'reference-zinc',
    get name() { referenceReads += 1; return 'Zinc'; }, maxAmount: 40, maxUnit: 'mg' }] });
  const zinc = product('zinc', {}, 100, { labelledContributions: [
    { subjectId: 'label-zinc', name: 'Zinc', amount: 1, unit: 'mg' }
  ] });
  assert.equal(labelledSafetyExposure(zinc, 1, input).get('reference-zinc')?.units, 1_000_000n);
  const firstReads = referenceReads;
  assert.ok(firstReads > 0, 'The first quantity must resolve the supplied reference');
  for (const [num, den, expected] of [[1n, 2n, 500_000n], [1n, 3n, 333_333n], [4n, 1n, 4_000_000n]]) {
    assert.equal(labelledSafetyExposure(zinc, Number(num) / Number(den), input, { num, den })
      .get('reference-zinc')?.units, expected);
  }
  assert.equal(referenceReads, firstReads, 'Dose variants must reuse the same immutable fact resolution');
});

it('V5-SAFETY-COMPILE-02: fractional Omega-3 components round independently before summing', () => {
  const input = request({ targets: canonicalizeTargets({ targets: [
    { subjectId: 'omega', name: 'Omega-3', amount: 1, unit: 'mg' }
  ] }).targets });
  const components = product('omega', {}, 100, { labelledContributions: [
    { subjectId: 'omega', name: 'EPA', amount: 0.000001, unit: 'mg' },
    { subjectId: 'omega', name: 'DHA', amount: 0.000001, unit: 'mg' }
  ] });
  const half = { num: 1n, den: 2n };
  // Each 1 ng component rounds from 0.5 ng to 1 ng. Rounding their sum would incorrectly yield 1 ng.
  assert.equal(labelledSafetyExposure(components, 0.5, input, half).get('omega')?.units, 2n);
  assert.equal(labelledSafetyExposure(components, 3, input).get('omega')?.units, 6n);
  const withTotal = { ...components, labelledContributions: [...components.labelledContributions,
    { subjectId: 'omega', name: 'Omega-3', amount: 0.000002, unit: 'mg' }] };
  assert.equal(labelledSafetyExposure(withTotal, 0.5, input, half).get('omega')?.units, 1n,
    'An explicit labelled total supersedes its components');
});

it('V5-SAFETY-COMPILE-03: duplicate aliases retain their largest scaled amount and returned maps are independent', () => {
  const input = request({ targets: canonicalizeTargets({ targets: [
    { subjectId: 'zinc', name: 'Zinc', amount: 1, unit: 'mg' }
  ] }).targets });
  const zinc = product('zinc', {}, 100, { labelledContributions: [
    { subjectId: 'zinc', name: 'Zinc', amount: 0.000003, unit: 'mg' },
    { subjectId: 'zinc', name: 'Zinc', amount: 0.000001, unit: 'mg' }
  ] });
  const first = labelledSafetyExposure(zinc, 0.5, input, { num: 1n, den: 2n });
  assert.equal(first.get('zinc')?.units, 2n);
  first.set('zinc', { dim: 'mass_ng', subjectId: 'zinc', units: 999n });
  assert.equal(labelledSafetyExposure(zinc, 1, input).get('zinc')?.units, 3n);
  assert.equal(labelledSafetyExposure(zinc, 0.5, input, { num: 1n, den: 2n }).get('zinc')?.units, 2n);
});

it('V5-SAFETY-COMPILE-04: revised requests and changed product facts cannot reuse earlier resolved identities or quantities', () => {
  const zinc = product('same-product', {}, 100, { labelledContributions: [
    { subjectId: 'label-zinc', name: 'Zinc', amount: 10, unit: 'mg' }
  ] });
  const first = request({ targets: canonicalizeTargets({ targets: [
    { subjectId: 'old-target', name: 'Zinc', amount: 10, unit: 'mg' }
  ] }).targets });
  const revised = { ...first, targets: canonicalizeTargets({ targets: [
    { subjectId: 'new-target', name: 'Zinc', amount: 20, unit: 'mg' }
  ] }).targets };
  assert.deepEqual([...labelledSafetyExposure(zinc, 1, first).keys()], ['old-target']);
  assert.deepEqual([...labelledSafetyExposure(zinc, 1, revised).keys()], ['new-target']);
  const changed = { ...zinc, labelledContributions: zinc.labelledContributions.map(row => ({ ...row, amount: 20 })) };
  assert.equal(labelledSafetyExposure(changed, 1, revised).get('new-target')?.units, 20_000_000n);
  assert.equal(labelledSafetyExposure(zinc, 1, first).get('old-target')?.units, 10_000_000n);
});

it('V5-SAFETY-COMPILE-05: evidence changes remain unquantified without inheriting trusted cached amounts', () => {
  const input = request({ targets: [] });
  const original = product('same-product', {}, 100, { labelledContributions: [
    { subjectId: 'zinc', name: 'Zinc', amount: 50, unit: 'mg', confidence: 'high', mappingStatus: 'verified' }
  ] });
  assert.equal(labelledSafetyExposure(original, 1, input).get('zinc')?.units, 50_000_000n);
  const changedFacts = [
    { ...original.labelledContributions[0]!, mappingStatus: 'conflicting' as const },
    { ...original.labelledContributions[0]!, mappingStatus: 'unverified' as const },
    { ...original.labelledContributions[0]!, confidence: 'low' as const },
    { ...original.labelledContributions[0]!, confidence: 'moderate' as const }
  ];
  for (const fact of changedFacts) {
    const changed = { ...original, labelledContributions: [fact] };
    assert.equal(labelledSafetyExposure(changed, 4, input).size, 0);
    assert.equal(labelledSafetyExposure(changed, 0.5, input).size, 0);
  }
  assert.equal(labelledSafetyExposure(original, 2, input).get('zinc')?.units, 100_000_000n);
});
