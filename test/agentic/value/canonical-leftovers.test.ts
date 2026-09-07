import assert from 'node:assert/strict';
import { it } from 'node:test';
import { canonicalPlanValue } from '../../../lib/agentic/value/canonical-plan.ts';

const value = (leftovers: unknown[]) => canonicalPlanValue({ leftovers, options: [], safetyGuidance: [], status: 'ready' });
const leftover = { name: 'Creatine', supplementId: 'sup_creatine', reason: 'dose_gap', severity: 'medium', source: 'target', requestIndex: 2 };

it('V5-CAN-LEFTOVER-01 equivalent mass doses retain one canonical leftover identity', () => {
  assert.deepEqual(value([{ ...leftover, amount: 3, unit: 'g' }]), value([{ ...leftover, amount: 3000, unit: 'mg' }]));
  assert.deepEqual(value([{ ...leftover, amount: 0.125, unit: 'mg' }]), value([{ ...leftover, amount: 125, unit: 'mcg' }]));
});

it('V5-CAN-LEFTOVER-02 equivalent unit annotations preserve unknown quantity and all advice', () => {
  const row = { ...leftover, reason: 'weaker_sku', note: 'cheaper SKU covers less' };
  assert.deepEqual(value([{ ...row, unit: 'g' }]), value([{ ...row, unit: 'mg' }]));
  assert.deepEqual(value([{ ...row, unit: 'g' }]).leftovers, [{ ...row, unit: 'mg' }]);
  assert.equal('amount' in (value([{ ...row, unit: 'g' }]).leftovers[0] as object), false);
});

it('V5-CAN-LEFTOVER-03 unequal doses, unsupported units, nutrient forms and changed advice remain distinct', () => {
  const baseline = value([{ ...leftover, amount: 3, unit: 'g' }]);
  for (const changed of [
    { ...leftover, amount: 3, unit: 'mg' },
    { ...leftover, amount: 3001, unit: 'mg' },
    { ...leftover, amount: 3, unit: 'IU' },
    { ...leftover, name: 'Creatine citrate', amount: 3, unit: 'g' },
    { ...leftover, supplementId: 'sup_another', amount: 3, unit: 'g' },
    { ...leftover, reason: 'uncovered', amount: 3, unit: 'g' },
    { ...leftover, amount: 3, unit: 'g', note: 'different advice' }
  ]) assert.notDeepEqual(value([changed]), baseline);
  const unsupported = { ...leftover, amount: 3, unit: 'scoop' };
  assert.deepEqual(value([unsupported]).leftovers, [unsupported]);
});
