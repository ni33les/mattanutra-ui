import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

test('PERF-NATIVE-01 isolated external workers prepare real execution before advertising idle capacity', { timeout: 10_000 }, async () => {
  const events: string[] = [];
  let started!: () => void, release!: () => void;
  const preparing = new Promise<void>(resolve => { started = resolve; });
  const prepared = new Promise<void>(resolve => { release = resolve; });
  mock.module('../../scripts/run-dev-advisory-validation.mjs', { namedExports: { isolatedValidationEnvironment() {} } });
  mock.module('../../lib/agentic/release-manifest.ts', { namedExports: { assertReleaseManifestReady: () => ({ buildId: 'a'.repeat(40) }) } });
  mock.module('../../lib/task-service-agents.ts', { namedExports: {
    registerWorkerSession: async () => { events.push('registered'); return { session: { id: `session-${events.length}` } }; },
    heartbeatWorkerSession: async () => {}
  } });
  mock.module('../../lib/task-service.ts', { namedExports: { reserveNextTask: async () => assert.fail('No task is admitted in this startup test'), completeTask() {}, failTask() {} } });
  mock.module('../../lib/task-work-items.ts', { namedExports: { buildTaskWorkItem() {} } });
  mock.module('../../lib/task-execution.ts', { namedExports: {
    executeTaskWorkItem() {},
    prepareTaskExecution: async (types: string[]) => {
      assert.deepEqual(types, ['match_agentic_plan']); events.push('preparing'); started(); await prepared; events.push('prepared');
    }
  } });
  mock.module('../../lib/task-result-applier.ts', { namedExports: { applyTaskCompletionResult() {}, prepareTaskCompletionResult() {} } });
  mock.module('../../lib/db.ts', { namedExports: { closeSqlPool: async () => { events.push('closed'); } } });
  const send = process.send, signalListeners = process.listeners('SIGINT');
  process.send = ((message: { ready?: boolean }) => {
    assert.equal(message.ready, true); events.push('ready'); process.emit('SIGTERM'); return true;
  }) as typeof process.send;
  try {
    const running = import('../../scripts/matcher-test-task-worker.ts');
    await Promise.race([preparing, running]);
    assert.deepEqual(events, ['preparing'], 'Registration and readiness must wait for execution preparation');
    release(); await running;
    assert.deepEqual(events, ['preparing', 'prepared', 'registered', 'registered', 'ready', 'closed']);
  } finally {
    release(); process.send = send;
    for (const listener of process.listeners('SIGINT')) if (!signalListeners.includes(listener)) process.removeListener('SIGINT', listener);
  }
});
