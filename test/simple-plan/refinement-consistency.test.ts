import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { create, install, cleanup, runtime, plan, rpc } from '../mcp-evidence-images/helpers.ts';
import { runAdmittedPlanOperation, setMatcherGateForTests, setMatcherEnteredForTests } from '../../lib/agentic/plan/service.ts';
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

test('REF-IO-01 completed polling resolves ownership and coherent result state once', async () => {
  const app = runtime(), first = await plan(app, create());
  let capabilities = 0, states = 0;
  const capability = app.store.getCapabilityByHash.bind(app.store), read = app.store.getPlanReadState.bind(app.store);
  app.store.getCapabilityByHash = (...args) => { capabilities++; return capability(...args); };
  app.store.getPlanReadState = (...args) => { states++; return read(...args); };
  const done = await value(app, { planHandle: first.planHandle }); assert.equal(done.status, 'ready');
  assert.equal(capabilities, 1, 'No repeated capability lookup for a coherent read');
  assert.equal(states, 1, 'No second full-state lookup after status resolution');
});
test('REF-IO-02 admission replay returns its receipt while the sole durable executor is paused', async () => {
  const { app, args, operation } = await pending();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
  setMatcherGateForTests(gate); setMatcherEnteredForTests(entered);
  const execution = runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: operation.id });
  let reply;
  try {
    await ready;
    const replay = value(app, args);
    reply = await Promise.race([replay, new Promise<null>(resolve => setImmediate(() => resolve(null)))]);
    release(); await execution; await replay;
  } finally { release(); setMatcherGateForTests(null); setMatcherEnteredForTests(null); await execution; }
  assert.ok(reply, 'A paused colocated worker must not hold the HTTP admission receipt');
  assert.equal(reply.status, 'processing'); assert.equal(reply.revision, 2);
});

test('REF-MET-01 acknowledgement and retrieval measurements are request-scoped, not fabricated search timings', async () => {
  const { withServiceMeasurements, serviceMeasurements } = await import('../../lib/service-metrics.ts');
  const app = runtime();
  const first = await withServiceMeasurements(async () => {
    const result = await plan(app, create());
    const measured = serviceMeasurements();
    assert.equal(measured['mcp.admission_ms']?.count, 1);
    assert.equal(measured['mcp.retrieval_ms']?.count, 1);
    assert.ok(measured['mcp.admission_ms']!.total >= 0);
    const operation = await app.store.getPlanOperationByKey(owner(app), create().idempotencyKey); assert.ok(operation);
    const revision = await app.store.getPlanRevision(operation.planId, result.revision); assert.ok(revision);
    assert.equal((revision.result as {matcherTelemetry: {ackMs?: number}}).matcherTelemetry.ackMs, undefined, 'A stored search duration is not a measured HTTP acknowledgement');
    return result;
  });
  await withServiceMeasurements(async () => {
    const read = await value(app, { planHandle: first.planHandle }); assert.equal(read.status, 'ready');
    assert.equal(serviceMeasurements()['mcp.admission_ms'], undefined);
    assert.equal(serviceMeasurements()['mcp.retrieval_ms']?.count, 1);
  });
});

for (const terminal of ['failed', 'cancelled', 'expired'] as const) test(`REF-REV-05 same-key ${terminal} replay preserves the attempted revision and durable identity`, async () => {
  const { app, args, first, operation } = await pending();
  const changed = { ...operation, version: operation.version + 1,
    ...(terminal === 'expired' ? { deadlineAt: '2000-01-01T00:00:00Z' } : { status: terminal }) };
  assert.equal(await app.store.updatePlanOperation(changed, operation.version), true);
  const before = await app.store.getPlanOperation(operation.id);
  const replay = await value(app, args);
  assert.equal(replay.status, 'failed'); assert.equal(replay.revision, 2); assert.equal(replay.planHandle, first.planHandle);
  assert.deepEqual(await app.store.getPlanOperation(operation.id), before);
});
