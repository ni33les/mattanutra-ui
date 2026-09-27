import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Worker as RealWorker } from 'node:worker_threads';

test('PERF-CPU-69 both matching slots receive bounded young-generation space and shut down cleanly', { timeout: 10000 }, async () => {
  const threads = await import('node:worker_threads');
  const started: RealWorker[] = [];
  mock.module('node:worker_threads', { namedExports: { ...threads, Worker: class extends threads.Worker {
    constructor(...args: ConstructorParameters<typeof threads.Worker>) { super(...args); started.push(this); }
  } } });
  const { MatchWorkerPool } = await import('../../lib/agentic/plan/match-worker-pool.ts');
  const pool = new MatchWorkerPool();
  try {
    await pool.prepare();
    assert.equal(started.length, 2, 'Keep the existing productive capacity');
    for (const worker of started) {
      assert.ok(worker.threadId > 0, 'Read limits from a prepared real worker');
      assert.equal(worker.resourceLimits.maxYoungGenerationSizeMb, 64);
    }
  } finally { await pool.close(); }
  assert.ok(started.every(worker => worker.threadId === -1), 'No matching thread may be left behind');
});
