import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { AGENTIC_TOOL_SCHEMAS, validateToolIssues } from '../../lib/agentic/contract/index.ts';
import { AGENT_CARD } from '../../lib/agentic/contract/agent-card.ts';
import { clientGuideMarkdown, CLIENT_EXAMPLES } from '../../lib/agentic/contract/guide.ts';
import { toolList } from '../../lib/agentic/mcp/rpc.ts';
import { create, install, cleanup, runtime, plan, rpc } from '../mcp-evidence-images/helpers.ts';
beforeEach(install); afterEach(cleanup);
type Checkout = { ok: boolean; paymentStatus: string; checkoutUrl: string; orderHandle: string; error: { reasonCode: string; message: string }; frozenPlan: { planRevision: number; items: Array<{ productId: string; quantity: number; lineTotalMinor: number }> } };

test('DIRECT-01 ready basket checks out directly without a plan revision or execution task', async t => {
  const app = runtime(), current = await plan(app, create());
  assert.equal(current.nextAction, 'execute');
  t.mock.method(app.store, 'insertPlanOperation', async () => { throw new Error('Checkout must not schedule matching or confirmation'); });
  const args = { planHandle: current.planHandle, expectedRevision: current.revision, idempotencyKey: 'direct-checkout-first' };
  const result = (await rpc(app, 'execute', args))!.result!.structuredContent as Checkout;
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.paymentStatus, 'unpaid'); assert.ok(result.checkoutUrl);
  assert.equal(result.frozenPlan.planRevision, current.revision);
  assert.deepEqual(result.frozenPlan.items.map((row) => [row.productId, row.quantity, row.lineTotalMinor]), current.choices[0].products.map(row => [row.productId, row.quantity, Math.round(row.lineTotal! * 100)]));
  assert.deepEqual((await rpc(app, 'execute', args))!.result!.structuredContent, result);
  const read = await plan(app, { planHandle: current.planHandle });
  assert.equal(read.revision, current.revision); assert.deepEqual(read.choices, current.choices);
});

test('DIRECT-02 plan no longer admits a standalone confirmation mutation', async () => {
  const app = runtime(), current = await plan(app, create());
  const args = { planHandle: current.planHandle, expectedRevision: current.revision, idempotencyKey: 'removed-confirmation-key' };
  assert.ok(validateToolIssues(AGENTIC_TOOL_SCHEMAS.plan, args).length);
  const result = (await rpc(app, 'plan', args))!.result!.structuredContent as Checkout;
  assert.equal(result.ok, false); assert.match(result.error.message, /call execute/);
  const owner = `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`;
  assert.equal(await app.store.getPlanOperationByKey(owner, args.idempotencyKey), null);
});

test('DIRECT-03 discovery advertises direct checkout and optional consented service feedback', () => {
  for (const text of [AGENT_CARD, ...['en', 'th', 'zh-CN'].map(locale => clientGuideMarkdown(locale))]) {
    assert.doesNotMatch(text, /send only planHandle, expectedRevision and a new idempotencyKey to plan|confirms that revision|advances the revision|Selection, answers/);
    assert.match(text, /execute/); assert.match(text, /service feedback/i); assert.match(text, /consent/i);
  }
  assert.equal(CLIENT_EXAMPLES.some(row => row.name === 'confirm-recommendation'), false);
  const checkout = CLIENT_EXAMPLES.find(row => row.tool === 'execute'); assert.ok(checkout);
  assert.equal(checkout.arguments.expectedRevision, 1);
  const feedback = toolList().find(row => row.name === 'feedback')!;
  assert.match(feedback.description, /service feedback/i); assert.match(feedback.description, /consent/i);
});


test('DIRECT-04 stale commercial facts reject new checkout but never alter an existing frozen order', async () => {
  const app = runtime(), current = await plan(app, create());
  const fence = app.store.isCatalogueRevisionCurrent!;
  const args = { planHandle: current.planHandle, expectedRevision: current.revision, idempotencyKey: 'direct-stale-catalogue' };
  app.store.isCatalogueRevisionCurrent = async () => false;
  const failed = (await rpc(app, 'execute', args))!.result!.structuredContent as Checkout;
  assert.equal(failed.ok, false); assert.equal(failed.error.reasonCode, 'availability_changed');
  app.store.isCatalogueRevisionCurrent = fence;
  const opened = (await rpc(app, 'execute', args))!.result!.structuredContent as Checkout;
  assert.equal(opened.ok, true, JSON.stringify(opened));
  app.store.isCatalogueRevisionCurrent = async () => false;
  const recovered = (await rpc(app, 'execute', { ...args, idempotencyKey: 'direct-recover-frozen' }))!.result!.structuredContent as Checkout;
  assert.equal(recovered.ok, true, JSON.stringify(recovered));
  assert.equal(recovered.orderHandle, opened.orderHandle); assert.deepEqual(recovered.frozenPlan, opened.frozenPlan);
});

test('DIRECT-05 simultaneous direct checkout calls share one order; another owner cannot execute it', async () => {
  const base = runtime(), app = { ...base, scope: { ...base.scope, principalScope: 'direct-owner' } };
  const current = await plan(app, create());
  const args = { planHandle: current.planHandle, expectedRevision: current.revision, idempotencyKey: 'direct-concurrent-checkout' };
  const [a, b] = await Promise.all([rpc(app, 'execute', args), rpc(app, 'execute', args)]);
  const first = a!.result!.structuredContent as Checkout, second = b!.result!.structuredContent as Checkout;
  assert.equal(first.ok, true, JSON.stringify(first)); assert.deepEqual(first, second);
  const stranger = { ...app, scope: { ...app.scope, principalScope: 'other-customer' } };
  const denied = (await rpc(stranger, 'execute', { ...args, idempotencyKey: 'direct-other-owner-checkout' }))!.result!.structuredContent as Checkout;
  assert.equal(denied.ok, false); assert.equal(denied.error.reasonCode, 'not_found');
});
