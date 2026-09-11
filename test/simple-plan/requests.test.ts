import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENTIC_INPUT_SCHEMAS } from '../../lib/agentic/contract/schemas.ts';
import { validateToolIssues } from '../../lib/agentic/contract/validate.ts';

const create = { idempotencyKey: 'simple-plan-first-turn', locale: 'en', destinationCountry: 'TH',
  targets: [{ name: 'Vitamin D3', amount: 2000, unit: 'IU', basis: 'supplemental' }] };
const handle = 'cap_simple_plan_returned_example';
const mutation = { planHandle: handle, expectedRevision: 1, idempotencyKey: 'simple-plan-refinement' };
const issues = (input: unknown) => validateToolIssues(AGENTIC_INPUT_SCHEMAS.plan, input);

test('SPLAN-REQ-01 flat create requires no operation, wrapper or customer demographics', () => {
  assert.deepEqual(issues(create), []);
});
test('SPLAN-REQ-01 handle-only polling uses the published schema', () => {
  assert.deepEqual(issues({ planHandle: handle }), []);
});
test('SPLAN-REQ-02 five field-dispatched behaviours are advertised without a discriminator', () => {
  for (const input of [{ ...mutation, scoring: { weights: { pills: 2 } } },
    mutation,
    { ...mutation, answers: [{ questionId: 'returned-question', choice: 'returned-choice' }] }]) assert.deepEqual(issues(input), []);
});
test('SPLAN-REQ-02 ambiguous selections and answers never validate as refinements', () => {
  for (const input of [{ ...mutation, selectedCandidateKey: 'opt_returned_choice', scoring: {} },
    { ...mutation, answers: [], requirements: {} }, { ...mutation, selectedCandidateKey: 'opt_returned_choice', answers: [] }]) assert.ok(issues(input).length);
});
test('SPLAN-REQ-01 retired fields and unknown controls are rejected', () => {
  for (const key of ['operation', 'request', 'requestPatch', 'responseView', 'verbosity', 'statusOnly', 'optimization']) {
    assert.ok(issues({ ...create, [key]: key === 'operation' ? 'create' : {} }).some(row => row.fieldPath === key), key);
  }
  assert.ok(issues({ ...create, requirements: { preferenceImportance: { maxDailyPills: 'strong' } } }).length);
  assert.ok(issues({ ...create, targets: [{ ...create.targets[0], importance: 'core' }] }).length);
});
test('SPLAN-REQ-04 target identity patches permit amount-only, conversion and removal', () => {
  for (const patch of [{ ingredientId: 'sup_returned_selenium', amount: 120 }, { ingredientId: 'sup_returned_selenium', unit: 'mg' },
    { ingredientId: 'sup_returned_selenium', amount: null }]) assert.deepEqual(issues({ ...mutation, targets: [patch] }), []);
});
test('SPLAN-REQ-05 only documented null/reset values are accepted', () => {
  for (const scoring of [{ weights: null }, { weights: { pills: null, nutrients: { sup_returned_selenium: null } } }, {}]) assert.deepEqual(issues({ ...mutation, scoring }), []);
  assert.deepEqual(issues({ ...mutation, requirements: { maxDailyPills: null, productDoses: [] }, targets: [] }), []);
  for (const scoring of [null, { profile: null }]) assert.ok(issues({ ...mutation, scoring }).length);
});
test('SPLAN-WGT-02 bounded weights accept zero and two with precise invalid-field errors', () => {
  for (const value of [0, 0.5, 1, 2]) assert.deepEqual(issues({ ...create, scoring: { weights: { pills: value, nutrients: { sup_selenium: value } } } }), []);
  for (const value of [-0.1, 2.01, '1']) {
    const found = issues({ ...create, scoring: { weights: { pills: value } } });
    assert.ok(found.some(row => row.fieldPath === 'scoring.weights.pills'));
    assert.ok(!found.some(row => row.fieldPath === 'scoring.weights.pills' && row.reasonCode === 'required'));
  }
});
test('SPLAN-REQ-02 mutation controls confirm, while revisions on create are errors', () => {
  assert.deepEqual(issues(mutation), []); assert.ok(issues({ ...create, expectedRevision: 1 }).length); assert.ok(issues({}).length);
});
test('SPLAN-SPEC-02 order and unified schema discovery have no response-mode selectors', () => {
  assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS.order, { orderHandle: handle }), []);
  assert.ok(validateToolIssues(AGENTIC_INPUT_SCHEMAS.order, { orderHandle: handle, responseView: 'status' }).length);
  assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS.info, { view: 'plan_schema' }), []);
  assert.ok(validateToolIssues(AGENTIC_INPUT_SCHEMAS.info, { view: 'plan_schema', planOperation: 'get' }).length);
});

test('SPLAN-REQ-06 normalized domain errors name the flat public field without a retired wrapper', async () => {
  const { installGoldCatalogue, uninstallGoldCatalogue }=await import('../helpers/gold-catalogue.ts');
  const { createAgenticRuntime }=await import('../../lib/agentic/runtime.ts');
  const { handleCompletedJsonRpc: handleJsonRpc }=await import('../helpers/completed-mcp-client.ts');
  installGoldCatalogue();
  try {
    for (const [suffix, fields, expected] of [
      ['tiny',{targets:[{name:'Magnesium',amount:1e-12,unit:'mg'}]},'targets[0].amount'],
      ['diet-duration',{targets:[{name:'Vitamin D3',amount:2000,unit:'IU'}],intake:[{source:'diet',certainty:'known',name:'Vitamin D3',amount:1000,unit:'IU',daysRemaining:30}]},'intake[0].daysRemaining']] as const) {
      const response=await handleJsonRpc(createAgenticRuntime(),{id:1,method:'tools/call',params:{name:'plan',arguments:{locale:'en',destinationCountry:'TH',idempotencyKey:`flat-errors-${suffix}`, ...fields}}});
      const value=response?.result?.structuredContent as {ok:boolean;error:{fieldPath:string;issues?:Array<{fieldPath:string}>}};
      assert.equal(value.ok,false);assert.equal(value.error.fieldPath,expected);
      for (const issue of value.error.issues??[])assert.doesNotMatch(issue.fieldPath,/^request\./);
    }
  } finally {uninstallGoldCatalogue();}
});
