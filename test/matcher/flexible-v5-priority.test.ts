import assert from 'node:assert/strict';
import { it } from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { canonicalizeTargets, canonicalTargetSetHash } from '../../lib/matcher/canonicalizer.ts';
import { catalog, product, request } from './flexible-v5-fixtures.ts';
it('V5-PRIORITY-01: optional improvement cannot displace a better required/core fit', () => {
  for (const importance of ['required', 'core'] as const) {
    const targets = canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 100, unit: 'mg', importance },
      { subjectId: 'b', name: 'B', amount: 100, unit: 'mg', importance: 'optional' }] }).targets;
    const result = match(request({ targets, maxDailyPills: 1 }), catalog([product('core', { a: 100 }), product('optional-driven', { a: 80, b: 100 })]));
    assert.deepEqual(result.selected?.productIds, ['core']);
    assert.equal(result.selected?.doseFit?.total, 1, 'full score still includes the uncovered optional target');
    assert.equal(result.selected?.coveredCount, 1);
  }
});
it('V5-PRIORITY-02: all-optional requests use the unmodified total dose score', () => {
  const targets = canonicalizeTargets({ targets: ['a', 'b'].map(subjectId => ({ subjectId, name: subjectId.toUpperCase(), amount: 100, unit: 'mg' as const, importance: 'optional' as const })) }).targets;
  assert.deepEqual(match(request({ targets, maxDailyPills: 1 }), catalog([product('a', { a: 100 }), product('b', { a: 80, b: 100 })])).selected?.productIds, ['b']);
});
it('V5-RANGE-01: range membership is distinct from complete coverage and does not erase overdose', () => {
  const targets = canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 100, unit: 'mg', acceptableMinimum: 90, acceptableMaximum: 120 }] }).targets;
  const low = match(request({ targets, maxDailyPills: 1 }), catalog([product('low', { a: 99 })]));
  assert.equal(low.selected?.coveredCount, 0);
  assert.equal(low.selected?.doseFit?.perTarget[0]?.withinAcceptableRange, true);
  assert.equal(low.leftovers[0]?.amount, 1);
  const high = match(request({ targets, productDoses: [{ productId: 'high', servingsPerDay: 1 }] }), catalog([product('high', { a: 110 })]));
  assert.equal(high.selected?.doseFit?.perTarget[0]?.withinAcceptableRange, true);
  assert.equal(high.selected?.doseFit?.over, 0.1);
  assert.ok(high.selected?.safety.findings.some(row => row.code === 'target_exceeded'));
});
it('V5-RANGE-02: invalid ranges fail precisely and range edits change input identity', () => {
  assert.throws(() => canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 100, unit: 'mg', acceptableMinimum: 110 }] }), /acceptableMinimum/);
  const base = request();
  assert.notEqual(canonicalTargetSetHash(base), canonicalTargetSetHash({ ...base, targets: base.targets.map(row => ({ ...row, acceptableMinimum: 90 })) }));
});
