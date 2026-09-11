import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { it } from 'node:test';
import { MATCHER_VERSION } from '../lib/matcher/config.ts';
import * as checkout from '../lib/retail-product-checkout.ts';
const { lockCurrentWebCheckoutRecommendations, findReusableWebCheckoutPayment } = checkout;
const planId = '10000000-0000-4000-8000-000000000001';
const runId = '10000000-0000-4000-8000-000000000002';
const productIds = Array.from({ length: 8 }, (_, i) => `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const address = { addressLine1: '1 Test Road', addressLine2: '', city: 'Bangkok', country: 'TH', customerEmail: 'fixture@example.test', customerName: 'Fixture', phone: '0800000000', postalCode: '10110', province: 'Bangkok', notes: '' };
function database(runRevision: string | null, currentRevision = '7') {
  const calls: string[] = [];
  const sql = async (parts: TemplateStringsArray) => {
    const query = parts.join('?'); calls.push(query);
    if (query.includes('catalogue_runtime_revision')) { assert.match(query, /for share/i, 'new checkout serializes its epoch check with catalogue updates'); return [{ revision: currentRevision }]; }
    if (query.includes('product_recommendation_runs')) return [{ id: runId, catalogue_revision: runRevision, selection_revision: 0, input_revision: 1, current_selection_revision: 0, excluded_product_ids: [],
      diagnostics: { algorithmVersion: MATCHER_VERSION, matching: { selectedCandidateKey: 'option', options: [{ candidateKey: 'option', productIds, recommendations: [] }] } } }];
    if (query.includes('product_recommendation_items')) return productIds.map((product_id, rank) => ({ product_id, rank, price_amount: 10 + rank, currency: 'THB', title: `Product ${rank}` }));
    throw Error(`Unexpected SQL ${query}`);
  };
  return { calls, sql: sql as unknown as Parameters<typeof lockCurrentWebCheckoutRecommendations>[0] };
}
const selection = { planId, locale: 'en' as const, selectedItemIds: productIds, recommendationRunId: runId, candidateKey: 'option', assessmentRevision: 1, selectionRevision: 0 };
it('V5-CHECKOUT-01: changed or unproven catalogue provenance rejects new checkout before reading purchase lines', async () => {
  for (const revision of ['6', null]) {
    const { sql, calls } = database(revision);
    await assert.rejects(lockCurrentWebCheckoutRecommendations(sql, selection), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'stale_product_selection');
    assert.equal(calls.some(query => query.includes('product_recommendation_items')), false);
  }
});
it('V5-CHECKOUT-02: current provenance accepts all eight selected products and keeps their quote rows', async () => {
  const { sql } = database('7');
  const rows = await lockCurrentWebCheckoutRecommendations(sql, selection);
  assert.deepEqual(rows.map(row => row.product_id), productIds);
  assert.deepEqual(rows.map(row => row.price_amount), productIds.map((_, i) => 10 + i));
});
it('V5-CHECKOUT-03: exact existing intent resumes its frozen payment without catalogue or price reads', async () => {
  const intent = { address, agenticOrderId: null, billingAddress: address, billingSameAsShipping: true, channel: 'web', planId, runId, optionId: 'option', assessmentRevision: 1, selectionRevision: 0, selectedRetailerOrganisationId: null, shippingAmount: 40, selectedProductIds: productIds };
  const payment = { id: 'payment', plan_id: planId, recommendation_run_id: runId, status: 'checkout_session_created', paid_at: null, metadata: { shippingAmount: 40 }, idempotency_key: createHash('sha256').update(JSON.stringify(intent)).digest('hex'), quote_lines: [{ price: 123, quantity: 1 }] };
  const calls: string[] = [];
  const sql = (async (parts: TemplateStringsArray) => { const query = parts.join('?'); calls.push(query); assert.match(query, /retail_checkout_payments/); return [payment]; }) as unknown as Parameters<typeof findReusableWebCheckoutPayment>[0];
  const input = { ...selection, address, billingAddress: address, billingSameAsShipping: true, selectedProductIds: productIds };
  assert.deepEqual(await findReusableWebCheckoutPayment(sql, input), payment);
  assert.equal(calls.length, 1);
  assert.equal(await findReusableWebCheckoutPayment(sql, { ...input, candidateKey: 'changed' }), null);
  assert.equal(await findReusableWebCheckoutPayment(sql, { ...input, address: { ...address, customerEmail: 'another@example.test' } }), null);
  assert.equal(await findReusableWebCheckoutPayment(sql, { ...input, selectedProductIds: productIds.slice(0, 7) }), null);
});

it('NOID-COM-01 previously saved web recommendations preserve their selected products and prices after protocol cleanup', async () => {
  const base = database('7');
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const rows = await (base.sql as Function)(parts, ...values);
    if (parts.join('?').includes('product_recommendation_runs')) rows[0].diagnostics.matching = {
      selectedOptionId: 'option', options: [{ optionId: 'option', productIds, recommendations: [] }]
    };
    return rows;
  }) as typeof base.sql;
  const rows = await lockCurrentWebCheckoutRecommendations(sql, selection);
  assert.deepEqual(rows.map(row => row.product_id), productIds);
  assert.deepEqual(rows.map(row => row.price_amount), productIds.map((_, rank) => 10 + rank));
});
