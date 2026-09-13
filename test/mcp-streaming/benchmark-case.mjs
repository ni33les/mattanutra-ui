// Isolated child process: imports the chosen checkout, never mixes module roots.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const load = file => import(pathToFileURL(`${process.cwd()}/${file}`).href);
const { create, install, cleanup, runtime, rpc, manifest } = await load('test/mcp-evidence-images/helpers.ts');
const { runAdmittedPlanOperation } = await load('lib/agentic/plan/service.ts');
const { withServiceMeasurements, serviceMeasurements } = await load('lib/service-metrics.ts');
const mode = process.argv[2]; assert.ok(['control', 'candidate'].includes(mode));
install();
try {
  const measured = await withServiceMeasurements(async () => {
    const app = runtime(), args = { ...create(), targets: [{ name: 'Vitamin D3', amount: 2000, unit: 'IU', basis: 'supplemental' }], requirements: {}, idempotencyKey: 'stream-comparison-0001' };
    let repositoryReads = 0, planCalls = 1;
    for (const name of ['getCapabilityByHash', 'getPlanReadState']) {
      const original = app.store[name].bind(app.store);
      app.store[name] = (...params) => { repositoryReads++; return original(...params); };
    }
    const started = performance.now(), initial = await rpc(app, 'plan', args), admittedAt = performance.now();
    const value = initial.result.structuredContent; assert.equal(value.status, 'processing');
    const op = await app.store.getPlanOperationByKey(`${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`, args.idempotencyKey); assert.ok(op);
    let committedAt, notify;
    let stream;
    if (mode === 'candidate') {
      const { planCompletionResponse } = await load('lib/agentic/mcp/plan-stream.ts');
      notify = (await load('lib/agentic/plan/completion-signals.ts')).signalPlanOperationChange;
      stream = await planCompletionResponse({ request: new Request('https://dev.example/api/mcp', { method: 'POST', headers: { accept: 'text/event-stream' } }), initial, runtime: app });
      assert.ok(stream);
    }
    const executionStarted = performance.now();
    const execution = runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: op.id }).then(async result => {
      assert.equal(result.ok, true, JSON.stringify(result)); committedAt = performance.now();
      const complete = await app.store.getPlanOperation(op.id); assert.equal(complete.status, 'complete');
      notify?.({ operationId: op.id, version: complete.version }); return complete;
    });
    let delivered;
    if (stream) {
      const messages = (await stream.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
      assert.equal(messages.length, 1); delivered = messages[0].result.structuredContent;
    } else {
      delivered = value;
      while (delivered.status === 'processing') {
        await delay(delivered.pollAfterSeconds * 1000); planCalls++;
        delivered = (await rpc(app, 'plan', { planHandle: value.planHandle })).result.structuredContent;
      }
    }
    const deliveredAt = performance.now(), completed = await execution;
    assert.notEqual(delivered.status, 'processing'); assert.equal(delivered.ok, true);
    const { planHandle: _handle, ...semantic } = delivered;
    return { mode, passed: true, fixtureSha256: manifest.sha256, input: args, cache: 'completed-match cache cleared; frozen catalogue installed; independent process',
      semantic, work: { attempts: completed.checkpoint?.search?.expansionAttempts, reservedAttempts: completed.checkpoint?.reservedAttempts },
      timings: { admissionMs: admittedAt-started, executionThroughCommitMs: committedAt-executionStarted, deliveryAfterCommitMs: deliveredAt-committedAt, totalMs: deliveredAt-started },
      planCalls, followUpPolls: planCalls-1, repositoryReads, metrics: serviceMeasurements() };
  });
  process.send(measured);
} finally { cleanup(); }
