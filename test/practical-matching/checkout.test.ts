import assert from 'node:assert/strict';
import test from 'node:test';
import * as checkout from '../../lib/retail-product-checkout.ts';
import { MATCHER_VERSION } from '../../lib/matcher/config.ts';
import { webHealthAdvice } from '../../lib/web-health-advice.ts';
import { readPlanPresentation } from '../../lib/agentic/presentation/plan-read.ts';
import { internalFixture, storedFixture } from '../mcp-conversation-pack/helpers.ts';

const advice = webHealthAdvice({ code: 'medication_interaction', kind: 'context', ingredient: 'Omega-3', evidence: 'controlled-rule' });
const input = { planId: '10000000-0000-4000-8000-000000000001', locale: 'en' as const, selectedItemIds: ['20000000-0000-4000-8000-000000000001'], recommendationRunId: '30000000-0000-4000-8000-000000000001', candidateKey: 'other', assessmentRevision: 1, selectionRevision: 0 };
function database(algorithmVersion = MATCHER_VERSION) {
  const queries: string[] = [];
  const sql = async(parts: TemplateStringsArray) => { const query = parts.join('?'); queries.push(query);
    if (query.includes('catalogue_runtime_revision')) return [{ revision: 7 }];
    if (query.includes('product_recommendation_runs')) return [{ id: input.recommendationRunId, catalogue_revision: 7, selection_revision: 0, input_revision: 1, current_selection_revision: 0, excluded_product_ids: [],
      diagnostics: { algorithmVersion, matching: { selectedCandidateKey: 'original', options: [{ candidateKey: 'other', productIds: input.selectedItemIds, advice: [advice], recommendations: [] }] } } }];
    if (query.includes('product_recommendation_items')) return [{ product_id: input.selectedItemIds[0], rank: 1, price_amount: 123, currency: 'THB', title: 'Selected fixture' }];
    throw new Error(`Unexpected SQL: ${query}`);
  };
  return { sql: sql as unknown as Parameters<typeof checkout.currentWebCheckoutRecommendations>[0], queries };
}

test('PRACTICAL-CHECKOUT-01 preview reads do not lock catalogue rows or perform maintenance writes', async () => {
  const {sql, queries} = database();
  const rows = await checkout.currentWebCheckoutRecommendations(sql, input); assert.equal(rows.length, 1);
  assert.ok(queries.length > 0); for (const q of queries) assert.doesNotMatch(q, /for\s+(?:share|update)|pg_advisory|\b(?:insert|update|delete)\b/i);
});

test('PRACTICAL-CHECKOUT-02 read selection returns the chosen option advice before confirmation', async () => {
  assert.equal(typeof checkout.currentWebCheckoutSelection, 'function');
  const { sql } = database(); const selected = await checkout.currentWebCheckoutSelection(sql, input);
  assert.deepEqual(selected.advice, [advice]); assert.equal(selected.recommendations[0].price_amount, 123);
});

test('PRACTICAL-CHECKOUT-03 only new checkout publication takes its existing commercial snapshot fence', async () => {
  assert.equal(typeof checkout.lockCurrentWebCheckoutRecommendations, 'function');
  const {sql, queries} = database(); await checkout.lockCurrentWebCheckoutRecommendations(sql, input);
  assert.equal(queries.filter(q => /for share/i.test(q)).length, 1);
});

test('PRACTICAL-CHECKOUT-04 old unexecuted profile results require refresh before new checkout', async () => {
  const { sql } = database('flexible-matching-v5');
  await assert.rejects(checkout.currentWebCheckoutRecommendations(sql, input), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'stale_product_selection');
});

test('PRACTICAL-CHECKOUT-05 retired plan handles are not translated or refreshed into new recommendations', async () => {
  const result = internalFixture(); result.contractVersion = '7.2.4'; result.requestSnapshot.requirements.maxProductCount = 9;
  const { app, handle } = await storedFixture(result);
  const read = await readPlanPresentation(app, handle); assert.ok('error' in read); assert.equal(read.error.reasonCode, 'not_found');
  assert.equal(result.requestSnapshot.requirements.maxProductCount, 9);
});
