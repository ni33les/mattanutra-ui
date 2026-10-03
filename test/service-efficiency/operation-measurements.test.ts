import assert from 'node:assert/strict';
import test from 'node:test';
import { SharedMatchWork } from '../../lib/match-work-cache.ts';
import { withServiceMeasurements, serviceMeasurements, mergeWorkerMeasurements, recordServiceMetric } from '../../lib/service-metrics.ts';
import { installCatalogue, goldens } from '../mcp-7-2-3/helpers.ts';
import { runtime, rpc, uninstallRealCatalogue } from '../ax-refinement/helpers.ts';
import { runAdmittedPlanOperation } from '../../lib/agentic/plan/service.ts';

test('EFF-INC-09 measurements distinguish actual computation, concurrent sharing and completed-result reuse', async () => {
  const work = new SharedMatchWork<number, never>(1000);
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const compute = async () => { await barrier; return 42; };
  const start = () => withServiceMeasurements(async () => {
    const result = await work.run('same', {}, compute);
    return { result, metrics: serviceMeasurements() };
  });
  const first = start(), second = start(); release();
  const [one, two] = await Promise.all([first, second]), three = await start();
  assert.equal(one.result, 42); assert.equal(two.result, 42); assert.equal(three.result, 42);
  assert.equal(one.metrics['match.work_started']?.count, 1);
  assert.equal(two.metrics['match.work_joined']?.count, 1);
  assert.equal(three.metrics['match.result_reused']?.count, 1);
  assert.equal(two.metrics['match.work_started'], undefined);
  assert.equal(three.metrics['match.work_started'], undefined);
});

test('EFF-INC-10 completed durable operations emit internal phase measurements without changing public results', { timeout: 30_000 }, async () => {
  await installCatalogue();
  const previous = process.env.AX_REFINEMENT_REAL_WORKERS;
  process.env.AX_REFINEMENT_REAL_WORKERS = '1';
  const info = console.info, records: Record<string, unknown>[] = [];
  console.info = (label, ...args) => { if (label === '[matcher-performance]') records.push(JSON.parse(args[0])); else info(label, ...args); };
  try {
    const app = runtime('measured-operation');
    const readOperation = app.store.getPlanOperation.bind(app.store);
    let hydratedReads = 0;
    app.store.getPlanOperation = async (id, options) => {
      if (options?.includeCursor !== false) hydratedReads++;
      return readOperation(id, options);
    };
    const args = { ...Object.fromEntries(Object.entries(goldens.d3).filter(([key]) => key !== 'optimization')), idempotencyKey: 'measured-operation', scoring: { profile: goldens.d3.optimization } };
    const admitted = await rpc(app, 'plan', args);
    assert.equal(admitted.status, 'processing');
    const op = await app.store.getPlanOperationByKey(`dev:mattanutra:${app.scope.principalScope}`, args.idempotencyKey); assert.ok(op);
    const result = await runAdmittedPlanOperation({ config: app.config, store: app.store, operationId: op.id });
    assert.equal(result.ok, true);
    assert.equal(hydratedReads, 1, 'The claim hydrates once; normalization is not reread before dispatch');
    assert.deepEqual(await runAdmittedPlanOperation({ config: app.config, store: app.store, operationId: op.id }), result);
    assert.equal(records.length, 1, 'A read of a completed operation does not invent another computation');
    const record = records[0]!;
    assert.deepEqual(Object.keys(record).sort(), ['operationId', 'buildId', 'outcome', 'operationAgeMs', 'metrics'].sort());
    assert.equal(record.operationId, op.id); assert.equal(record.buildId, app.config.buildId);
    const metrics = record.metrics as Record<string, { count: number; total: number }>;
    for (const stage of ['match.operation_ms', 'match.compilation_ms', 'match.search_ms', 'match.finalization_ms', 'match.publication_ms', 'worker.thread_wait_ms', 'worker.preparation_ms', 'worker.cpu_wait_ms']) {
      assert.ok(metrics[stage]!.count > 0, stage); assert.ok(metrics[stage]!.total >= 0, stage);
    }
    assert.equal(metrics['match.work_started']!.count, 1);
    assert.equal('metrics' in result, false);
    assert.equal('operationAgeMs' in result, false);
  } finally {
    console.info = info;
    if (previous === undefined) delete process.env.AX_REFINEMENT_REAL_WORKERS; else process.env.AX_REFINEMENT_REAL_WORKERS = previous;
    uninstallRealCatalogue();
  }
});


test('EFF-INC-11 worker phase measurements reject invalid numbers and remain scoped to the operation', () => {
  withServiceMeasurements(() => {
    mergeWorkerMeasurements(undefined);
    mergeWorkerMeasurements({ 'match.finalization_ms': { count: 1, total: 2, max: 2 } });
    mergeWorkerMeasurements({ 'match.search_ms': { count: 0, total: -1, max: Number.NaN } });
    recordServiceMetric('match.search_ms', -1);
    recordServiceMetric('match.search_ms', Number.NaN);
    assert.deepEqual(serviceMeasurements(), { 'match.finalization_ms': { count: 1, total: 2, max: 2 } });
  });
  assert.deepEqual(serviceMeasurements(), {});
});


test('EFF-NEXT-04 cancellation after normalization still prevents cached-result publication', { timeout: 30_000 }, async () => {
  await installCatalogue();
  const previous = process.env.AX_REFINEMENT_REAL_WORKERS;
  process.env.AX_REFINEMENT_REAL_WORKERS = '1';
  try {
    const args = { ...Object.fromEntries(Object.entries(goldens.d3).filter(([key]) => key !== 'optimization')), scoring: { profile: goldens.d3.optimization } };
    const warm = runtime('normalization-warm');
    await rpc(warm, 'plan', { ...args, idempotencyKey: 'normalization-warm' });
    const warmOp = await warm.store.getPlanOperationByKey(`dev:mattanutra:${warm.scope.principalScope}`, 'normalization-warm'); assert.ok(warmOp);
    assert.equal((await runAdmittedPlanOperation({ config: warm.config, store: warm.store, operationId: warmOp.id })).ok, true);

    const app = runtime('normalization-cancelled');
    await rpc(app, 'plan', { ...args, idempotencyKey: 'normalization-cancelled' });
    const operation = await app.store.getPlanOperationByKey(`dev:mattanutra:${app.scope.principalScope}`, 'normalization-cancelled'); assert.ok(operation);
    const before = await app.store.getPlan(operation.planId); assert.ok(before);
    const update = app.store.updatePlanOperation.bind(app.store);
    let cancelled = false;
    app.store.updatePlanOperation = async (record, expected) => {
      const saved = await update(record, expected);
      if (saved && !cancelled && record.status === 'running' && (record.checkpoint as { stage?: string } | null)?.stage === 'normalized') {
        cancelled = true;
        assert.equal(await update({ ...record, status: 'cancelled', leaseToken: null, leaseExpiresAt: null, version: record.version + 1 }, record.version), true);
      }
      return saved;
    };
    const result = await runAdmittedPlanOperation({ config: app.config, store: app.store, operationId: operation.id });
    assert.equal(cancelled, true); assert.equal(result.ok, false);
    assert.equal((await app.store.getPlanOperation(operation.id))?.status, 'cancelled');
    assert.equal((await app.store.getPlan(operation.planId))?.currentRevision, before.currentRevision);
  } finally {
    if (previous === undefined) delete process.env.AX_REFINEMENT_REAL_WORKERS; else process.env.AX_REFINEMENT_REAL_WORKERS = previous;
    uninstallRealCatalogue();
  }
});
