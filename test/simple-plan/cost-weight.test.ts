import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENTIC_INPUT_SCHEMAS, SCORING_SCHEMA } from '../../lib/agentic/contract/schemas.ts';
import { validateToolIssues } from '../../lib/agentic/contract/validate.ts';
import { agenticServerInstructions } from '../../lib/agentic/contract/instructions.ts';
import { CLIENT_EXAMPLES, clientGuideMarkdown } from '../../lib/agentic/contract/guide.ts';
import { prepareSimpleRequest } from '../../lib/agentic/plan/simple-input.ts';
import { isAgenticErrorResult } from '../../lib/agentic/contract/errors.ts';
import { fixtureSnapshot } from '../../lib/agentic/catalogue/fixtures.ts';
import { patchScoring } from '../../lib/matcher/scoring-policy.ts';
import { scorePracticalPenalties } from '../../lib/matcher/practical-scoring.ts';
import { request } from '../matcher/flexible-v5-fixtures.ts';

test('MCP-COST-01 the existing price field advertises cost basis, range and reset semantics', () => {
  const weight = SCORING_SCHEMA.properties.weights.anyOf[0].properties.price;
  assert.match(weight.description!, /Cost weight/);
  assert.match(weight.description!, /first-order goods/);
  assert.match(weight.description!, /delivery excluded/);
  assert.match(weight.description!, /budget.*overrun/i);
  for (const price of [0, 0.543, 1, 2, null]) assert.deepEqual(validateToolIssues(SCORING_SCHEMA, { weights: { price } }), []);
  for (const price of [-1, 2.1, '2']) assert.ok(validateToolIssues(SCORING_SCHEMA, { weights: { price } }).some(row => row.fieldPath === 'weights.price'));
});

test('MCP-COST-02 the plan card and guide teach cost refinement with a valid copyable example', () => {
  for (const locale of ['en', 'th', 'zh-CN']) {
    for (const text of [agenticServerInstructions('dev', locale), clientGuideMarkdown(locale, 'dev')]) {
      assert.match(text, /scoring\.weights\.price/);
      assert.match(text, /Cost weight/);
      assert.match(text, /one recommendation per round/);
    }
  }
  const example = CLIENT_EXAMPLES.find(row => row.name === 'prioritise-lower-cost');
  assert.ok(example); assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS.plan, example.arguments), []);
  assert.deepEqual(example.arguments.scoring, { weights: { price: 2 } });
  assert.ok(example.arguments.planHandle && example.arguments.expectedRevision && example.arguments.idempotencyKey);
});

test('MCP-COST-03 existing cost arithmetic scales once, including advisory budgets and unknown prices', () => {
  const actual = { dailyPills: 1, pillLowerBound: 1, productCount: 1, priceMinor: 200000, currency: 'THB', servings: [1], uncertainProductCount: 0 };
  for (const weight of [0, 0.543, 1, 2]) {
    const scoring = patchScoring(undefined, { weights: { pills: 0, products: 0, servings: 0, price: weight } });
    // THB 2000: 0.05 * weight * (2000/1000); with a THB1000 budget:
    // 0.25 * weight * ((2000-1000)/1000)^2. A zero budget uses THB100.
    for (const [budget, unitPenalty] of [[null, 0.1], [100000, 0.25], [0, 100]] as const) {
      const result = scorePracticalPenalties({ ...request({ maxPriceMinor: budget }), scoring }, actual);
      assert.ok(Math.abs(result.total - unitPenalty * weight) < 1e-12);
      assert.equal(result.complete, true);
    }
    const unknown = scorePracticalPenalties({ ...request(), scoring }, { ...actual, priceMinor: null });
    assert.equal(unknown.complete, false); assert.ok(unknown.missingComponents.includes('firstOrderPrice'));
  }
});

test('MCP-COST-04 price refinements preserve targets and context, survive sparse updates and reset to best_match', () => {
  const catalogue = fixtureSnapshot();
  const create = { locale: 'en', destinationCountry: 'TH', targets: [{ name: 'Vitamin D3', amount: 2000, unit: 'IU' }], medicationCodes: ['apixaban'], requirements: { maxPriceMinor: 100000 } };
  const first = prepareSimpleRequest(create, catalogue); assert.ok(!isAgenticErrorResult(first));
  const costly = prepareSimpleRequest({ scoring: { weights: { price: 2 } } }, catalogue, first); assert.ok(!isAgenticErrorResult(costly));
  const sparse = prepareSimpleRequest({ scoring: { weights: { pills: 0.543 } } }, catalogue, costly); assert.ok(!isAgenticErrorResult(sparse));
  assert.equal(sparse.scoring!.weights.price, 2);
  for (const key of ['targets', 'medicationCodes', 'requirements'] as const) assert.deepEqual(sparse[key], first[key]);
  const reset = prepareSimpleRequest({ scoring: { weights: { price: null } } }, catalogue, sparse); assert.ok(!isAgenticErrorResult(reset));
  assert.equal(reset.scoring!.weights.price, undefined); assert.equal(reset.scoring!.weights.pills, 0.543);
  assert.equal(reset.scoring!.profile, 'balanced');
});
