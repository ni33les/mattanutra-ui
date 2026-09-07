import assert from 'node:assert/strict';
import { it } from 'node:test';
import { canonicalizeCurrents, canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { match } from '../../lib/matcher/index.ts';
import { catalog, product, request } from './flexible-v5-fixtures.ts';

it('V5-FACT-01: conflicting and unverified mappings cannot leak through safety exposure into factual coverage or scoring', () => {
  const targets = canonicalizeTargets({ targets: ['a', 'b'].map(subjectId => ({ subjectId, name: subjectId.toUpperCase(), amount: 100, unit: 'mg' as const })) }).targets;
  for (const mappingStatus of ['conflicting', 'unverified'] as const) {
    const base = product('mixed', { a: 50, b: 100 });
    const mixed = { ...base, labelledContributions: base.labelledContributions.map(fact => fact.subjectId === 'b' ? { ...fact, mappingStatus } : fact) };
    const before = JSON.stringify(mixed);
    const result = match(request({ targets, productDoses: [{ productId: 'mixed', servingsPerDay: 1 }], safetyCeilings: [{ subjectId: 'b', name: 'B', maxAmount: 50, maxUnit: 'mg' }] }), catalog([mixed]));
    const selected = result.selected!;
    assert.equal(selected.purchaseEligible, true);
    assert.equal(selected.coverageBySubject.get('b'), 0);
    assert.equal(selected.coverageSummary?.find(row => row.subjectId === 'b')?.newContribution, 0);
    assert.equal(selected.coverageSummary?.find(row => row.subjectId === 'b')?.remainingGap, 100);
    assert.equal(selected.coverageSummary?.find(row => row.subjectId === 'b')?.unknown, true);
    assert.equal(selected.doseFit?.perTarget.find(row => row.subjectId === 'b')?.exposure, 0);
    assert.equal(selected.doseFit?.perTarget.find(row => row.subjectId === 'b')?.certainty, 'unknown');
    assert.equal(selected.doseFit?.total, 1.5);
    assert.equal(selected.doseFit?.limit, 0);
    assert.ok(selected.safety.findings.some(row => row.uncertainty?.includes('unverified_product_facts')));
    assert.equal(selected.safety.hardBlocked, false);
    assert.equal(selected.safety.requiresAck, false);
    assert.equal(JSON.stringify(mixed), before, 'Original labelled evidence remains unchanged');
  }
});

it('V5-FACT-02: low-confidence label amounts remain exploratory alongside known dietary intake', () => {
  const dietaryIntake = canonicalizeCurrents([{ subjectId: 'a', name: 'A', dailyAmount: 10, unit: 'mg', sourceId: 'known-food' }]);
  assert.ok(!('error' in dietaryIntake));
  const targets = canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 160, unit: 'mg', basis: 'total_daily' }] }).targets;
  for (const confidence of ['low', 'moderate'] as const) {
    const base = product('reported', { a: 150 });
    const reported = { ...base, labelledContributions: base.labelledContributions.map(fact => ({ ...fact, confidence })) };
    const result = match(request({ targets, dietaryIntake, productDoses: [{ productId: 'reported', servingsPerDay: 1 }] }), catalog([reported]));
    const selected = result.selected!;
    assert.equal(selected.purchaseEligible, true);
    assert.equal(selected.coverageSummary?.[0]?.knownCurrent, 10);
    assert.equal(selected.coverageSummary?.[0]?.newContribution, 0);
    assert.equal(selected.coverageSummary?.[0]?.knownTotal, 10);
    assert.equal(selected.coverageSummary?.[0]?.quantifiedTotal, 10);
    assert.equal(selected.coverageSummary?.[0]?.remainingGap, 150);
    assert.equal(selected.coverageSummary?.[0]?.unknown, true);
    assert.equal(selected.doseFit?.perTarget[0]?.exposure, 10);
    assert.equal(selected.doseFit?.perTarget[0]?.certainty, 'unknown');
    assert.equal(selected.doseFit?.total, 150 / 160);
    assert.equal(reported.labelledContributions[0]?.amount, 150);
  }
});

it('V5-FACT-03: topical labelled quantities never become oral nutrient exposure', () => {
  const topical = product('topical', { a: 100 }, 100, { form: 'spray', administration: { route: 'topical', physicalUnit: 'ml', unitsPerServing: 1, doseIncrement: 1, packQuantity: 30,
    provenance: { status: 'verified', sourceUrl: 'https://fixture.example/topical', sourceText: 'Topical spray', verifiedAt: '2026-09-07T00:00:00Z' } } });
  const result = match(request({ productDoses: [{ productId: 'topical', servingsPerDay: 1 }] }), catalog([topical]));
  assert.equal(result.selected?.purchaseEligible, true);
  assert.equal(result.selected?.coverageSummary?.[0]?.knownTotal, 0);
  assert.equal(result.selected?.coverageSummary?.[0]?.remainingGap, 100);
  assert.equal(result.selected?.doseFit?.perTarget[0]?.exposure, 0);
  assert.equal(result.selected?.doseFit?.total, 1);
  assert.ok(result.selected?.safety.findings.some(row => row.uncertainty?.includes('nonoral_product_route')));
});

it('V5-FACT-04: uncertain labelled products remain selectable exploration options without a false recommendation', () => {
  const base = product('reported', { a: 100 });
  const uncertain = { ...base, labelledContributions: base.labelledContributions.map(fact => ({ ...fact, mappingStatus: 'unverified' as const })) };
  const result = match(request(), catalog([uncertain]));
  assert.equal(result.selected?.productCount, 0);
  const fallback = result.alternatives.find(row => row.roles?.includes('purchase_fallback'));
  assert.equal(fallback?.purchaseEligible, true);
  assert.deepEqual(fallback?.productIds, ['reported']);
  assert.equal(fallback?.coverageSummary?.[0]?.fullyMet, false);
  assert.equal(fallback?.coverageSummary?.[0]?.unknown, true);
});
