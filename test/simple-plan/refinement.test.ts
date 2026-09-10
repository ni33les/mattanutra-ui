import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareSimpleRequest } from '../../lib/agentic/plan/simple-input.ts';
import { fixtureSnapshot } from '../../lib/agentic/catalogue/fixtures.ts';
import { isAgenticErrorResult } from '../../lib/agentic/contract/errors.ts';
import { patchScoring } from '../../lib/matcher/scoring-policy.ts';

const catalogue = fixtureSnapshot();
const source = { locale: 'en', destinationCountry: 'TH', medicationCodes: ['apixaban'], conditionCodes: ['atrial_fibrillation'],
  requirements: { maxDailyPills: 3, excludeProductIds: ['prd_unwanted'] }, targets: [{ name: 'Vitamin D3', amount: 2000, unit: 'IU', basis: 'supplemental' }],
  intake: [{ source: 'diet', name: 'Vitamin D3', certainty: 'unknown' }] };
function prepared(input: Record<string, unknown>, previous?: Parameters<typeof prepareSimpleRequest>[2]) {
  const result = prepareSimpleRequest(input, catalogue, previous); assert.ok(!isAgenticErrorResult(result), JSON.stringify(result)); return result;
}
test('SPLAN-REQ-03 weight-only changes preserve the complete saved customer context', () => {
  const before = prepared(source), after = prepared({ scoring: { weights: { pills: 2 } } }, before);
  for (const key of ['targets', 'medicationCodes', 'conditionCodes', 'requirements', 'intake', 'locale'] as const) assert.deepEqual(after[key], before[key]);
  assert.equal(after.scoring?.weights.pills, 2);
});
test('SPLAN-REQ-04 amount-only and unit-only target upserts preserve physical identity and other fields', () => {
  const before = prepared(source), ingredientId = before.targets[0].ingredientId;
  const edited = prepared({ targets: [{ ingredientId, amount: 1000 }] }, before);
  assert.equal(edited.targets[0].unit, 'IU'); assert.equal(edited.targets[0].amount, 1000);
  const converted = prepared({ targets: [{ ingredientId, unit: 'mcg' }] }, before);
  assert.equal(converted.targets[0].amount, 50); assert.equal(converted.targets[0].basis, 'supplemental');
  assert.ok(isAgenticErrorResult(prepareSimpleRequest({ targets: [{ ingredientId, unit: 'CFU' }] }, catalogue, before)));
});
test('SPLAN-REQ-04 removal deletes only the target and its explicit override', () => {
  const initial = prepared(source), id = initial.targets[0].ingredientId!;
  const weighted = prepared({ scoring: { weights: { pills: 2, nutrients: { [id]: 0 } } } }, initial);
  const removed = prepared({ targets: [{ ingredientId: id, amount: null }] }, weighted);
  assert.deepEqual(removed.targets, []); assert.equal(removed.scoring?.weights.nutrients, undefined); assert.equal(removed.scoring?.weights.pills, 2);
  assert.deepEqual(removed.intake, weighted.intake); assert.deepEqual(removed.requirements, weighted.requirements);
  assert.ok(isAgenticErrorResult(prepareSimpleRequest({ targets: [{ ingredientId: id, amount: null }], scoring: { weights: { nutrients: { [id]: 2 } } } }, catalogue, weighted)));
});
test('SPLAN-REQ-04 duplicate aliases fail and unsupported targets retain stable identities', () => {
  assert.ok(isAgenticErrorResult(prepareSimpleRequest({ ...source, targets: [source.targets[0], { ...source.targets[0], name: 'D3' }] }, catalogue)));
  const unknown = prepared({ ...source, targets: [{ name: 'Uncatalogued nutrient', amount: 100, unit: 'mg' }] });
  const id = unknown.targets[0].ingredientId; assert.ok(id?.startsWith('req_'));
  const next = prepared({ targets: [{ ingredientId: id, amount: 120 }] }, unknown); assert.equal(next.targets[0].ingredientId, id);
  assert.ok(isAgenticErrorResult(prepareSimpleRequest({ scoring: { weights: { nutrients: { sup_misspelling: 0 } } } }, catalogue, unknown)));
});
test('SPLAN-REQ-05 clearing observations is distinct from explicit known zero', () => {
  const before = prepared(source), after = prepared({ intake: [], requirements: { maxDailyPills: null, excludeProductIds: [] }, targets: [] }, before);
  assert.deepEqual(after.targets, before.targets); assert.deepEqual(after.intake, []); assert.equal(after.requirements.maxDailyPills, null);
  const zero = prepared({ intake: [{ source: 'diet', name: 'Vitamin D3', certainty: 'known', amount: 0, unit: 'IU' }] }, before);
  assert.notDeepEqual(zero.intake, after.intake);
});
test('SPLAN-WGT-09 sparse zero, individual reset and preset reset have distinct canonical settings', () => {
  const a = patchScoring(undefined, { weights: { pills: 0, nutrients: { sup_selenium: 0 } } });
  assert.equal(patchScoring(a, { weights: { products: 2 } }).weights.nutrients?.sup_selenium, 0);
  assert.equal(patchScoring(a, { weights: { pills: null } }).weights.pills, undefined);
  assert.deepEqual(patchScoring(a, { profile: 'fewest_pills', weights: { price: 0.5 } }), { profile: 'fewest_pills', weights: { price: 0.5 } });
  assert.deepEqual(patchScoring(a, { weights: null }).weights, {}); assert.deepEqual(patchScoring(a, { weights: {} }), a);
});
