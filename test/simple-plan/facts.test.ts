import assert from 'node:assert/strict';
import test from 'node:test';
import { internalFixture } from '../mcp-conversation-pack/helpers.ts';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import type { PlanResult, StackOption } from '../../lib/agentic/plan/types.ts';

function fixture() {
  const base = internalFixture(), product = base.selected!.basket[0];
  const state = { ...base.requestSnapshot, targets: [{ supplementId: 'sup_d3', name: 'Vitamin D3', amount: 2000, unit: 'IU', basis: 'total_daily' }],
    originalRequest: undefined, intake: [{ source: 'diet', supplementId: 'sup_d3', certainty: 'estimated', minimum: 100, maximum: 200, unit: 'IU' }],
    currentSupplements: [{ supplementId: 'sup_d3', name: 'Vitamin D3', dailyAmount: 400, unit: 'IU' }] };
  const selected = { ...base.selected!, coverage: [{ supplementId: 'sup_d3', name: 'Vitamin D3', currentAmount: 400, deliveredAmount: 500,
    intakeCertainty: 'estimated', totalExposureComplete: false }], basket: [{ ...product, administration: null, servingsPerDay: 1,
    requestedNutrients: [{ supplementId: 'sup_d3', name: 'Vitamin D3', amount: 500, unit: 'IU' }], incidentalNutrients: [],
    labelledFacts: [{ supplementId: 'sup_d3', name: 'Vitamin D3', amount: 500, unit: 'IU', confidence: 'high', mappingStatus: 'verified' }] }] } as unknown as StackOption;
  return { ...base, requestSnapshot: state, selected, alternatives: [] } as unknown as PlanResult;
}
function choice(result: PlanResult) {
  const decision = presentDecision(result, 'cap_presentation_test_returned_handle', 1);
  assert.ok('choices' in decision && decision.choices.length); return decision.choices[0];
}
test('SPLAN-DTO-03 estimated existing intake includes continued supplements without asserting an exact gap', () => {
  const row = choice(fixture()).ingredients.find(row => row.ingredientId === 'sup_d3'); assert.ok(row);
  assert.deepEqual(row.existing, { certainty: 'estimated', minimum: 500, maximum: 600 });
  assert.equal(row.supplied, 500); assert.equal(row.gap, null);
});
test('SPLAN-DTO-04 conflicting composition never becomes a verified lower bound; incidental identities remain usable', () => {
  const result = fixture(), first = result.selected!.basket[0];
  const labels = Array.from({ length: 20 }, (_, i) => ({ supplementId: `sup_incidental_${i}`, name: `Incidental ${i}`, amount: null, unit: 'mg', confidence: 'low', mappingStatus: 'conflicting' }));
  const selected = { ...result.selected!, basket: [{ ...first, requestedNutrients: [], labelledFacts: [...labels, { supplementId: 'sup_d3', name: 'Vitamin D3', amount: 500, unit: 'IU', confidence: 'high', mappingStatus: 'conflicting' }] }] } as unknown as StackOption;
  const rows = choice({ ...result, selected }).ingredients;
  assert.equal(rows.length, 21);
  assert.deepEqual(rows.filter(row => row.requested === null).map(row => row.ingredientId), labels.map(row => row.supplementId));
  const target = rows.find(row => row.ingredientId === 'sup_d3'); assert.ok(target); assert.equal(target.supplied, null);
  assert.equal(target.suppliedAtLeast ?? 0, 0);
});
