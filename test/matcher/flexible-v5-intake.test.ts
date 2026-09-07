import assert from 'node:assert/strict';
import { it } from 'node:test';
import { canonicalizeCurrents, canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { match } from '../../lib/matcher/index.ts';
import { catalog, product, request } from './flexible-v5-fixtures.ts';
const currents = canonicalizeCurrents([{ subjectId: 'a', name: 'A', dailyAmount: 50, minimumDailyAmount: 20, maximumDailyAmount: 80, certainty: 'estimated', sourceId: 'estimated-intake', unit: 'mg' }]);
assert.ok(!('error' in currents));
it('V5-INTAKE-01: supported midpoint quantities balance estimated intake without claiming it as known coverage', () => {
  for (const basis of ['supplemental', 'total_daily'] as const) {
    const r = request({ targets: request().targets.map(row => ({ ...row, basis })),
      ...(basis === 'supplemental' ? { currentSupplements: currents } : { dietaryIntake: currents }) });
    const result = match(r, catalog([product('small', { a: 10 })]));
    assert.deepEqual(result.selected?.variantIds, ['seller:small:x5']);
    // 20..80 existing + 50 new = 70..130: either endpoint deviates 30/100.
    assert.equal(result.selected?.doseFit?.total, 0.3);
    assert.equal(result.selected?.coverageSummary?.[0]?.knownCurrent, 0);
    assert.equal(result.selected?.coverageSummary?.[0]?.estimatedCurrent, 50);
    assert.equal(result.selected?.coverageSummary?.[0]?.newContribution, 50);
    assert.equal(result.selected?.coverageSummary?.[0]?.remainingGap, 50);
    assert.equal(result.selected?.coveredCount, 0);
  }
});
it('V5-INTAKE-02: estimated range breakpoints also account for products already fixed in the basket', () => {
  const estimates = canonicalizeCurrents([{ subjectId: 'a', name: 'A', dailyAmount: 20, minimumDailyAmount: 10, maximumDailyAmount: 30, certainty: 'estimated', sourceId: 'estimate', unit: 'mg' }]);
  assert.ok(!('error' in estimates));
  const targets = canonicalizeTargets({ targets: ['a', 'b'].map(subjectId => ({ subjectId, name: subjectId.toUpperCase(), amount: 100, unit: 'mg' as const })) }).targets;
  const result = match(request({ targets, currentSupplements: estimates, productDoses: [{ productId: 'companion', servingsPerDay: 1 }] }),
    catalog([product('companion', { a: 40, b: 100 }), product('small', { a: 10 })]));
  assert.ok(result.selected?.variantIds.includes('seller:small:x4'));
  // A is 10..30 + 40 fixed + 40 new = 90..110; B is exactly 100.
  assert.equal(result.selected?.doseFit?.total, 0.1);
  assert.equal(result.selected?.coverageSummary?.find(row => row.subjectId === 'a')?.knownTotal, 80);
});
it('V5-INTAKE-03: midpoint candidates do not change the additional safety-limit excess penalty', () => {
  const r = request({ currentSupplements: currents, safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 120, maxUnit: 'mg' }] });
  const result = match(r, catalog([product('small', { a: 10 })]));
  assert.deepEqual(result.selected?.variantIds, ['seller:small:x4']);
  // Four units gives 60..120 (loss 0.4); five gives 70..130 with
  // worst-case loss 30/100 + 2*(10/120), so the safer fit wins.
  assert.equal(result.selected?.doseFit?.total, 0.4);
  assert.equal(result.selected?.doseFit?.limitWeight, 2);
  assert.equal(result.selected?.safety.hardBlocked, false);
});
