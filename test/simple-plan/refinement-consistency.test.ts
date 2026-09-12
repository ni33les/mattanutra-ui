import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { create, install, cleanup, runtime, plan, rpc } from '../mcp-evidence-images/helpers.ts';
import { runAdmittedPlanOperation } from '../../lib/agentic/plan/service.ts';
import type { PlanOperationRecord } from '../../lib/agentic/store/types.ts';
beforeEach(install); afterEach(cleanup);
const owner = (app: ReturnType<typeof runtime>) => `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`;
async function value(app: ReturnType<typeof runtime>, input: Record<string, unknown>) {
  return (await rpc(app, 'plan', input))!.result!.structuredContent as { ok: boolean; revision: number; status: string; planHandle: string; error?: { reasonCode: string; currentRevision: number } };
}
async function pending() {
  const app = runtime(), first = await plan(app, create());
  const args = { planHandle: first.planHandle, expectedRevision: first.revision, idempotencyKey: 'refinement-consistency', scoring: { weights: { price: 0.5 } } };
  const accepted = await value(app, args), operation = await app.store.getPlanOperationByKey(owner(app), args.idempotencyKey);
  assert.equal(first.revision, 1); assert.equal(accepted.status, 'processing'); assert.equal(accepted.revision, 2); assert.ok(operation);
  return { app, first, args, operation };
}
test('REF-REV-01 accepted revision remains visible across concurrent pending reads and completion', async () => {
  const { app, first, operation } = await pending();
  const reads = await Promise.all(Array.from({ length: 3 }, () => value(app, { planHandle: first.planHandle })));
  for (const read of reads) { assert.equal(read.status, 'processing'); assert.equal(read.revision, 2); }
  assert.equal((await app.store.getPlan(operation.planId))?.currentRevision, 1, 'The previous basket stays committed until publication');
  assert.equal((await runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: operation.id })).ok, true);
  const done = await value(app, { planHandle: first.planHandle }); assert.equal(done.status, 'ready'); assert.equal(done.revision, 2);
});
test('REF-REV-02 conflicting pending refinement reports the accepted revision and checkout stays unavailable', async () => {
  const { app, first, args } = await pending();
  const conflict = await value(app, { ...args, expectedRevision: 2, idempotencyKey: 'another-pending-change' });
  assert.equal(conflict.ok, false); assert.equal(conflict.error?.currentRevision, 2);
  const checkout = (await rpc(app, 'execute', { planHandle: first.planHandle, expectedRevision: 2, idempotencyKey: 'pending-checkout' }))!.result!.structuredContent as { ok: boolean };
  assert.equal(checkout.ok, false);
  assert.equal((await value(app, args)).revision, 2, 'Same-key replay retains its operation');
});
for (const status of ['failed', 'cancelled'] as const) test(`REF-REV-03 ${status} refinement exposes its attempted revision and accepts recovery from it`, async () => {
  const { app, first, operation } = await pending();
  assert.equal(await app.store.updatePlanOperation({ ...operation, status, version: operation.version + 1 }, operation.version), true);
  const failed = await value(app, { planHandle: first.planHandle }); assert.equal(failed.status, 'failed'); assert.equal(failed.revision, 2);
  const recovered = await value(app, { planHandle: first.planHandle, expectedRevision: failed.revision, idempotencyKey: `refinement-recover-${status}`, scoring: {} });
  assert.equal(recovered.ok, true, JSON.stringify(recovered)); assert.equal(recovered.revision, 2); assert.equal(recovered.status, 'processing');
  assert.equal((await app.store.getPlan(operation.planId))?.currentRevision, 1);
});
test('REF-REV-04 expired work is presented without changing its durable record', async () => {
  const { app, first, operation } = await pending();
  const expired: PlanOperationRecord = { ...operation, deadlineAt: '2000-01-01T00:00:00Z', version: operation.version + 1 };
  assert.equal(await app.store.updatePlanOperation(expired, operation.version), true);
  const before = await app.store.getPlanOperation(operation.id);
  const read = await value(app, { planHandle: first.planHandle }); assert.equal(read.status, 'failed'); assert.equal(read.revision, 2);
  assert.deepEqual(await app.store.getPlanOperation(operation.id), before);
});
