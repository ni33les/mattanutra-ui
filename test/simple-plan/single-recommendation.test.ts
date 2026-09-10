import assert from 'node:assert/strict';
import test from 'node:test';
import { Value } from '@sinclair/typebox/value';
import { internalFixture, storedFixture } from '../mcp-conversation-pack/helpers.ts';
import { presentDecision, decisionOptionId } from '../../lib/agentic/presentation/decision.ts';
import { handleJsonRpc } from '../../lib/agentic/mcp/dispatcher.ts';
import { READY_DECISION_SCHEMA } from '../../lib/agentic/contract/decision-schema.ts';
import { SCORING_SCHEMA } from '../../lib/agentic/contract/schemas.ts';
import { AGENT_CARD } from '../../lib/agentic/contract/agent-card.ts';
import { clientGuideMarkdown } from '../../lib/agentic/contract/guide.ts';

test('MCP-SINGLE-01 each round exposes only the current recommendation, preserving full facts and internal candidates', () => {
  const result = internalFixture(); assert.ok(result.alternatives.length > 0);
  const original = structuredClone(result);
  const response = presentDecision(result, 'cap_single_recommendation', 1);
  assert.ok('choices' in response); assert.equal(response.choices.length, 1);
  assert.deepEqual(response.choices[0].products.map(row => row.productId), result.selected!.basket.map(row => row.productId));
  assert.equal(response.recommendedOptionId, response.choices[0].optionId);
  assert.equal(response.selectedOptionId, null); assert.equal(response.nextAction, 'confirm_with_user');
  assert.deepEqual(result, original);
  const refined = presentDecision({ ...result, selected: result.alternatives[0], alternatives: [result.selected!] }, 'cap_single_recommendation', 2);
  assert.ok('choices' in refined); assert.equal(refined.choices.length, 1);
  assert.deepEqual(refined.choices[0].products.map(row => row.productId), result.alternatives[0].basket.map(row => row.productId));
  assert.notEqual(refined.choices[0].optionId, response.choices[0].optionId);
});

test('MCP-SINGLE-02 empty recommendations expose gaps and weight refinement, never a fallback menu', () => {
  const result = internalFixture();
  for (const locale of ['en', 'th', 'zh-CN']) {
    const response = presentDecision({ ...result, status: 'needs_input', selected: null, questions: [], requestSnapshot: { ...result.requestSnapshot, locale } }, 'cap_single_empty_recommendation', 1);
    assert.ok('choices' in response); assert.equal(response.choices.length, 1);
    assert.deepEqual(response.choices[0].products, []); assert.ok(response.choices[0].ingredients.length > 0);
    assert.equal(response.recommendedOptionId, null); assert.equal(response.nextAction, 'change_request');
    assert.doesNotMatch(response.summary, /available choices|可选组合|ตัวเลือก/);
  }
});

test('MCP-SINGLE-03 hidden alternatives are not available through selection or evidence', async () => {
  const result = internalFixture(); assert.ok(result.alternatives.length > 0);
  const { app, handle } = await storedFixture(result);
  const hidden = result.alternatives[0], optionId = decisionOptionId(handle, 1, hidden);
  for (const [name, fields] of [
    ['plan', { selectedOptionId: optionId, idempotencyKey: 'single-hidden-selection' }],
    ['evidence', { optionId, productId: hidden.basket[0].productId }]
  ] as const) {
    const rpc = await handleJsonRpc(app, { id: 1, method: 'tools/call', params: { name, arguments: { planHandle: handle, expectedRevision: 1, ...fields } } });
    const body = rpc?.result?.structuredContent as { ok: boolean; error?: { reasonCode: string } };
    assert.equal(body.ok, false); assert.equal(body.error?.reasonCode, 'not_found');
  }
});

test('MCP-SINGLE-04 best_match is the advertised and returned default with unchanged balanced coefficients', () => {
  assert.equal(SCORING_SCHEMA.properties.profile.default, 'best_match');
  assert.ok(Value.Check(SCORING_SCHEMA, { profile: 'best_match', weights: { pills: 0.543 } }));
  const response = presentDecision(internalFixture(), 'cap_single_default_profile', 1);
  assert.ok('scoring' in response); assert.equal(response.scoring.profile, 'best_match');
});

test('MCP-SINGLE-05 schema and discovery enforce one recommendation with conversational weight refinement', () => {
  assert.equal(READY_DECISION_SCHEMA.properties.choices.maxItems, 1);
  const response = presentDecision(internalFixture(), 'cap_single_schema_fixture', 1);
  assert.ok('choices' in response); assert.ok(Value.Check(READY_DECISION_SCHEMA, response));
  assert.equal(Value.Check(READY_DECISION_SCHEMA, { ...response, choices: [response.choices[0], response.choices[0]] }), false);
  for (const locale of ['en', 'th', 'zh-CN']) {
    const text = AGENT_CARD + clientGuideMarkdown(locale);
    assert.match(text, /one recommendation per round/); assert.match(text, /best_match/);
    assert.doesNotMatch(text, /Review each choice|Choices are distinct product-and-dose baskets|closest_dose, lower_cost, simpler/);
  }
});
