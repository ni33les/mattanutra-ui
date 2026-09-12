import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureSnapshot } from '../../lib/agentic/catalogue/fixtures.ts';
import { prepareSimpleRequest } from '../../lib/agentic/plan/simple-input.ts';
import { normalizePlanRequest } from '../../lib/agentic/plan/normalize.ts';
import { isAgenticErrorResult } from '../../lib/agentic/contract/errors.ts';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import { runtime } from '../ax-refinement/helpers.ts';
import { internalFixture } from '../mcp-conversation-pack/helpers.ts';
import type { CatalogueSnapshot } from '../../lib/agentic/catalogue/types.ts';
import type { CanonicalPlanState } from '../../lib/agentic/plan/types.ts';

const source = { locale: 'en', destinationCountry: 'TH', targets: [{ name: 'D3', amount: 1000, unit: 'IU' }] };
async function prepare(input: Record<string, unknown>, snapshot = fixtureSnapshot()) {
  const request = prepareSimpleRequest(input, snapshot);
  assert.ok(!isAgenticErrorResult(request), JSON.stringify(request));
  return normalizePlanRequest({ request, snapshot, config: runtime('availability').config });
}
function state(value: Awaited<ReturnType<typeof prepare>>) {
  assert.ok(!isAgenticErrorResult(value), JSON.stringify(value)); return value.state;
}
function availability(value: CanonicalPlanState) {
  return (value as CanonicalPlanState & { availability: { ingredients: Record<string, string>; issues: Array<{ code: string; fieldPath: string }> } }).availability;
}
test('AVAIL-MCP-01 aliases resolve and unavailable targets remain explicit without dropping the request', async () => {
  const snapshot = { ...fixtureSnapshot(), products: [] };
  const result = state(await prepare({ ...source, targets: [...source.targets, { name: 'Uncatalogued example', amount: 50, unit: 'mg' }] }, snapshot));
  assert.equal(result.targets.length, 1); assert.equal(result.originalRequest?.targets.length, 2);
  assert.deepEqual(availability(result).issues.map(row => row.code), ['unavailable', 'not_on_list']);
  const unknown = result.originalRequest!.targets[1]; assert.match(unknown.ingredientId!, /^req_/);
});
test('AVAIL-MCP-02 explicitly blocked ingredient keeps its identity and is not a matching target', async () => {
  const snapshot = fixtureSnapshot(), denied = snapshot.supplements.find(row => row.name === 'Vitamin D3'); assert.ok(denied);
  const restricted = { ...snapshot, supplements: snapshot.supplements.filter(row => row !== denied), disallowedSupplements: [denied] } as CatalogueSnapshot;
  const result = state(await prepare({ ...source, targets: [{ ingredientId: denied.supplementId, amount: 1000, unit: 'IU' }] }, restricted));
  assert.equal(result.targets.length, 0); assert.equal(result.originalRequest!.targets[0].ingredientId, denied.supplementId);
  assert.equal(availability(result).issues[0].code, 'not_allowed');
});
test('AVAIL-MCP-03 unknown product proposal is omitted only from executable requirements', async () => {
  const result = state(await prepare({ ...source, requirements: { productDoses: [{ productId: 'prd_missing', servingsPerDay: 1 }], maxDailyPills: 0 } }));
  assert.deepEqual(result.requirements.productDoses, []); assert.equal(result.requirements.maxDailyPills, 0);
  assert.equal(result.originalRequest!.requirements.productDoses?.[0].productId, 'prd_missing');
  assert.ok(availability(result).issues.some(row => row.code === 'not_on_list' && row.fieldPath === 'requirements.productDoses[0].productId'));
});
test('AVAIL-MCP-04 contradictory product exclusion remains a validation error', async () => {
  const snapshot = fixtureSnapshot(), id = snapshot.products[0].productId;
  assert.ok(isAgenticErrorResult(await prepare({ ...source, requirements: { excludeProductIds: [id], productDoses: [{ productId: id, servingsPerDay: 1 }] } }, snapshot)));
});
test('AVAIL-MCP-05 terminal response includes per-item status without a medical advice row', () => {
  const result = internalFixture();
  const response = presentDecision(result, 'cap_availability_fixture', 1);
  assert.ok('choices' in response && response.choices[0].ingredients.length);
  assert.ok(response.choices[0].ingredients.every(row => typeof (row as unknown as {availability:string}).availability === 'string'));
  assert.equal(response.nextAction, 'execute'); assert.equal(response.choices.length, 1);
});
