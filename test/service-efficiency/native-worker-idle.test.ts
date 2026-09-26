import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { signalTaskQueue } from '../../lib/task-queue-signal.ts';

test('PERF-NATIVE-02 idle acceptance workers wait for production wake signals instead of repeatedly claiming', { timeout: 5_000 }, async () => {
  let claims = 0, wakeClosed = false, ready!: () => void;
  const registered: unknown[] = [];
  const readiness = new Promise<void>(resolve => { ready = resolve; });
  mock.module('../../scripts/run-dev-advisory-validation.mjs', { namedExports: { isolatedValidationEnvironment() {} } });
  mock.module('../../lib/agentic/release-manifest.ts', { namedExports: { assertReleaseManifestReady: () => ({ buildId: 'a'.repeat(40) }) } });
  mock.module('../../lib/task-service-agents.ts', { namedExports: {
    registerWorkerSession: async (input: unknown) => { registered.push(input); return { session: { id: `session-${registered.length}` } }; },
    heartbeatWorkerSession: async () => {}
  } });
  mock.module('../../lib/task-service.ts', { namedExports: { reserveNextTask: async () => { claims++; return null; }, completeTask() {}, failTask() {} } });
  mock.module('../../lib/task-work-items.ts', { namedExports: { buildTaskWorkItem() {} } });
  mock.module('../../lib/task-execution.ts', { namedExports: { executeTaskWorkItem() {}, prepareTaskExecution: async () => {} } });
  mock.module('../../lib/task-result-applier.ts', { namedExports: { applyTaskCompletionResult() {}, prepareTaskCompletionResult() {} } });
  mock.module('../../lib/db.ts', { namedExports: { closeSqlPool: async () => {} } });
  mock.module('../../workers/wake-server.ts', { namedExports: { startWorkerWakeServer: async () => ({ url: 'http://127.0.0.1:9999/wake', close: () => { wakeClosed = true; } }) } });
  const send = process.send, signalListeners = process.listeners('SIGINT');
  process.send = (() => { ready(); return true; }) as typeof process.send;
  const running = import('../../scripts/matcher-test-task-worker.ts');
  try {
    await readiness;
    await delay(260);
    assert.equal(claims, 2, 'Each idle slot checks the durable queue once; it must not run a 100ms transaction loop');
    for (const input of registered) assert.equal((input as { metadata: { wakeUrl: string } }).metadata.wakeUrl, 'http://127.0.0.1:9999/wake');
    signalTaskQueue({ taskType: 'match_agentic_plan', taskId: 'new-task' });
    await delay(20);
    assert.equal(claims, 3, 'One post-commit signal wakes one productive slot');
  } finally {
    process.emit('SIGTERM'); await running; process.send = send;
    for (const listener of process.listeners('SIGINT')) if (!signalListeners.includes(listener)) process.removeListener('SIGINT', listener);
  }
  assert.equal(wakeClosed, true);
});
