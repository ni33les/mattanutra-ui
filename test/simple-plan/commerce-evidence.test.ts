import { evidenceTool } from '../../lib/agentic/evidence/tool.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { internalFixture, storedFixture } from '../mcp-conversation-pack/helpers.ts';
import { handleJsonRpc } from '../../lib/agentic/mcp/dispatcher.ts';
import { issueCapability } from '../../lib/agentic/capabilities.ts';
import type { OrderRecord } from '../../lib/agentic/store/types.ts';
import type { AgenticRuntime } from '../../lib/agentic/runtime.ts';

async function call(app: AgenticRuntime, name: string, args: Record<string, unknown>) {
  if (name === 'evidence') return evidenceTool({ ...app, ...(args as {planHandle:string;expectedRevision:number;productId?:string}) });
  const rpc = await handleJsonRpc(app, { id: 1, method: 'tools/call', params: { name, arguments: args } });
  assert.ok(rpc?.result?.structuredContent); return rpc.result.structuredContent as Record<string, unknown>;
}
test('SPLAN-EVID-01 internal fact lookup uses current recommendation and product IDs; rejects unrelated IDs and stale revisions', async () => {
  const { app, handle } = await storedFixture(internalFixture());
  const plan = await call(app, 'plan', { planHandle: handle }); assert.ok(plan.choices.length);
  const choice = plan.choices[0], productId = choice.products[0].productId;
  const args = { planHandle: handle, expectedRevision: 1, productId };
  const evidence = await call(app, 'evidence', args);
  assert.equal(evidence.ok, true, JSON.stringify(evidence)); assert.equal(evidence.productId, productId);
  assert.ok(Array.isArray(evidence.facts)); assert.ok(!('choices' in evidence));
  assert.equal((await call(app, 'evidence', { ...args, productId: 'unrelated-product' })).ok, false);
  assert.equal((await call(app, 'evidence', { ...args, expectedRevision: 2 })).error.reasonCode, 'stale_revision');
});
test('SPLAN-ORDER-01 default order reads are concise and preserve payment, tracking and frozen contents', async () => {
  const { app } = await storedFixture({ ...internalFixture(), contractVersion: "8.0.0" }); const frozen = { items: [{ productId: 'frozen-product', quantity: 1, unitPriceMinor: 999 }], subtotalMinor: 999, shippingMinor: 50 };
  const order = { id: 'simple-order', planId: 'conversation-pack-plan', planRevision: 1, ...app.scope, createdAt: app.now!, updatedAt: app.now!,
    cancelledAt: null, completedAt: null, expiredAt: null, checkoutAccessHash: null, checkoutExpiresAt: '2099-01-01T00:00:00Z', checkoutUrl: 'https://example.test/checkout',
    currency: 'THB', destinationCountry: 'TH', frozenPlan: frozen, fulfilmentStatus: 'not_started', latestPaymentAttempt: null, latestPaymentReason: null,
    orderStatus: 'open', paymentStatus: 'unpaid', providerSessionId: 'fixture', reference: 'SIMPLE-ORDER', stateVersion: 1, totalPriceMinor: 1049 } as OrderRecord;
  await app.store.insertOrder(order);
  const { handle } = await issueCapability({ allowedActions: ['order.read'], config: app.config, now: app.now!, resourceId: order.id, resourceType: 'order', scope: app.scope, store: app.store });
  let itemReads = 0; app.store.getOrderItems = async () => { itemReads++; throw new Error('Ordinary order polling must not read items'); };
  const read = await call(app, 'order', { orderHandle: handle });
  assert.equal(read.ok, true, JSON.stringify(read)); assert.equal(read.nextAction, 'open_checkout'); assert.equal(read.paymentStatus, 'unpaid');
  assert.equal(read.totalPriceMinor, 1049); assert.ok(!('responseView' in read)); assert.ok(!('frozenOrder' in read)); assert.equal(itemReads, 0);
  assert.deepEqual((await app.store.getOrder(order.id))?.frozenPlan, frozen);
});
