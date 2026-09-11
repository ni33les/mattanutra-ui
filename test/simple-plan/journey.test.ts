import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { handleJsonRpc } from '../../lib/agentic/mcp/dispatcher.ts';
import { createAgenticRuntime } from '../../lib/agentic/runtime.ts';
import { runAdmittedPlanOperation } from '../../lib/agentic/plan/service.ts';
import { installGoldCatalogue, uninstallGoldCatalogue } from '../helpers/gold-catalogue.ts';

beforeEach(installGoldCatalogue); afterEach(uninstallGoldCatalogue);
type App = ReturnType<typeof createAgenticRuntime>;
async function call(app: App, args: Record<string, unknown>, name = 'plan') {
  const rpc = await handleJsonRpc(app, { id: 1, method: 'tools/call', params: { name, arguments: args } });
  assert.ok(rpc?.result?.structuredContent, JSON.stringify(rpc));
  return rpc.result.structuredContent as Record<string, unknown>;
}
async function finish(app: App, args: Record<string, unknown>) {
  const admitted = await call(app, args); assert.equal(admitted.ok, true, JSON.stringify(admitted));
  if (admitted.status !== 'processing') return admitted;
  const owner = `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`;
  const op = await app.store.getPlanOperationByKey(owner, String(args.idempotencyKey)); assert.ok(op);
  const complete = await runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: op.id });
  assert.equal(complete.ok, true, JSON.stringify(complete));
  const result = await call(app, { planHandle: admitted.planHandle });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.notEqual(result.status, 'processing');
  return result;
}
const initial = { locale: 'en', destinationCountry: 'TH', idempotencyKey: 'simple-journey-initial', targets: [{ name: 'Vitamin D3', amount: 2000, unit: 'IU', basis: 'supplemental' }] };

test('SPLAN-STATE-04/05 refinement advances revision; read and no-op preserve it; stale-key replay wins', async () => {
  const app = createAgenticRuntime(); const first = await finish(app, initial);
  assert.equal(first.status, 'ready'); assert.equal(first.nextAction, 'execute'); assert.ok(!('selectedCandidateKey' in first));
  assert.equal(first.scoring.profile, 'best_match'); assert.equal(first.choices.length, 1);
  const edit = { planHandle: first.planHandle, expectedRevision: first.revision, idempotencyKey: 'simple-journey-refine', scoring: { weights: { pills: 2 } } };
  const refined = await finish(app, edit);
  assert.equal(refined.revision, first.revision + 1); assert.equal(refined.nextAction, 'execute');
  assert.equal(refined.choices.length, 1); assert.equal(refined.scoring.weights.pills, 2);
  assert.deepEqual(await call(app, edit), refined);
  assert.deepEqual(await call(app, { planHandle: first.planHandle }), refined);
  const noop = await finish(app, { planHandle: first.planHandle, expectedRevision: refined.revision, idempotencyKey: 'simple-journey-noop', scoring: {} });
  assert.equal(noop.revision, refined.revision);
});

test('SPLAN-STATE-06 removing the final target ends naturally and preserves the saved health context', async () => {
  const app = createAgenticRuntime(); const first = await finish(app, { ...initial, medicationCodes: ['apixaban'] });
  const target = first.choices[0].ingredients.find((row: { requested: number | null }) => row.requested !== null); assert.ok(target);
  const removed = await finish(app, { planHandle: first.planHandle, expectedRevision: first.revision, idempotencyKey: 'simple-journey-remove', targets: [{ ingredientId: target.ingredientId, amount: null }] });
  assert.equal(removed.status, 'no_purchase'); assert.equal(removed.nextAction, 'no_purchase'); assert.ok(removed.choices.every((row: {products: unknown[]; ingredients: Array<{requested: number | null}>}) => row.products.length === 0 && row.ingredients.every(item => item.requested === null)));
});
