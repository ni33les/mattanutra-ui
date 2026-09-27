import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { create, install, cleanup, runtime, plan, rpc } from '../mcp-evidence-images/helpers.ts';
import { runAdmittedPlanOperation } from '../../lib/agentic/plan/service.ts';

const originalFlag = process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED;
const originalWorkers = process.env.AX_REFINEMENT_REAL_WORKERS;
afterEach(() => {
  for (const [key, value] of [['MATCHER_DURABLE_CHECKPOINTS_ENABLED', originalFlag], ['AX_REFINEMENT_REAL_WORKERS', originalWorkers]]) {
    if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
  }
  cleanup();
});
type Progress = { stage: string; search?: { expansionAttempts: number }; reservedAttempts: number };
function setup(persist: boolean, name: string) {
  process.env.AX_REFINEMENT_REAL_WORKERS = '1';
  process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED = String(persist);
  install(); const app = runtime();
  const args = { ...create(), idempotencyKey: name, requirements: {},
    targets: [{ name: 'Vitamin D3', amount: name.includes('interrupted') ? 2004 : 2003, unit: 'IU', basis: 'total_daily' }, { name: 'Magnesium', amount: 200, unit: 'mg', basis: 'supplemental' }] };
  return { app, args };
}

for (const persist of [false, true]) test(`PERF-CKPT-05 progress with checkpoints ${persist ? 'on' : 'off'} fences every dispatch without redundant completion writes`, async () => {
  const { app, args } = setup(persist, `progress-persistence-${persist}`), writes: Progress[] = [];
  const update = app.store.updatePlanOperation.bind(app.store), post = Worker.prototype.postMessage;
  let dispatches = 0;
  app.store.updatePlanOperation = async (...params) => {
    const saved = await update(...params), record = params[0];
    if (saved && record.status === 'running' && (record.checkpoint as Progress)?.stage === 'search') writes.push(structuredClone(record.checkpoint as Progress));
    return saved;
  };
  Worker.prototype.postMessage = function(message, ...rest) {
    if (message?.kind === 'session-start' || message?.kind === 'session-continue') {
      dispatches++;
      assert.equal(writes.at(-1)?.reservedAttempts, 4000, 'Every chunk starts after a committed, bounded reservation');
    }
    return post.call(this, message, ...rest);
  };
  try {
    assert.equal((await plan(app, args)).status, 'ready');
    assert.equal(dispatches, 2, 'The frozen fixture must exercise both standard chunks');
    assert.deepEqual(writes.filter(row => row.reservedAttempts > 0).map(row => row.search?.expansionAttempts ?? 0), [0, 4000]);
    assert.equal(writes.at(-1)?.search?.expansionAttempts, 8000);
    assert.equal(writes.at(-1)?.reservedAttempts, 0);
    assert.equal(writes.length, persist ? 4 : 3, 'Without cursors, acknowledge progress with the next reservation or final completion');
  } finally { Worker.prototype.postMessage = post; }
});

test('PERF-CKPT-06 interruption before the next reservation retains conservative work accounting and cannot restart', async () => {
  const { app, args } = setup(false, 'progress-interrupted');
  const admitted = await rpc(app, 'plan', args);
  assert.equal((admitted!.result!.structuredContent as { status: string }).status, 'processing');
  const owner = `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`;
  const operation = await app.store.getPlanOperationByKey(owner, args.idempotencyKey); assert.ok(operation);
  const update = app.store.updatePlanOperation.bind(app.store); let interrupted = false;
  app.store.updatePlanOperation = async (...params) => {
    const progress = params[0].checkpoint as Progress;
    if (params[0].status === 'running' && progress?.reservedAttempts > 0 && progress.search?.expansionAttempts === 4000) {
      interrupted = true; throw new Error('Stop before second reservation commits');
    }
    return update(...params);
  };
  const execute = () => runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: operation.id });
  assert.equal((await execute()).ok, false); assert.equal(interrupted, true);
  const saved = await app.store.getPlanOperation(operation.id); assert.ok(saved);
  const progress = saved.checkpoint as Progress;
  assert.equal((progress.search?.expansionAttempts ?? 0) + progress.reservedAttempts, 4000);
  assert.equal((await execute()).ok, false);
  assert.equal((await app.store.getPlan(operation.planId))?.currentRevision, 1);
});
