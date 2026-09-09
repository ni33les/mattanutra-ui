import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Worker } from "node:worker_threads";
import { ThreadPool } from "../../lib/thread-pool.ts";

class FakeWorker extends EventEmitter {
  threadId = 1; posts: unknown[] = [];
  ref() {} unref() {}
  postMessage(input: unknown) { this.posts.push(input); }
  async terminate() { if (this.threadId !== -1) { this.threadId = -1; this.emit("exit"); } return 0; }
  reply(result: unknown) { this.emit("message", { result }); }
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test("EFF-DISP-01 queued timeout never reserves search work", async () => {
  const worker = new FakeWorker(), pool = new ThreadPool(() => worker as unknown as Worker, 1, 2);
  let reservations = 0;
  const first = pool.run("first", undefined, 1000, { beforeStart: async () => { reservations++; } });
  try {
    await tick(); assert.equal(reservations, 1);
    await assert.rejects(pool.run("second", undefined, 20, { beforeStart: async () => { reservations++; } }), /deadline/i);
    assert.equal(reservations, 1); assert.deepEqual(worker.posts, ["first"]);
    worker.reply("done"); await first;
  } finally { await pool.close(); await first.catch(() => undefined); }
});

test("EFF-DISP-02 search starts only after its durable reservation commits", async () => {
  const worker = new FakeWorker(), pool = new ThreadPool(() => worker as unknown as Worker, 1, 2);
  let release!: () => void; const committed = new Promise<void>(resolve => { release = resolve; });
  const work = pool.run("search", undefined, 1000, { beforeStart: () => committed });
  try {
    await tick(); assert.deepEqual(worker.posts, []);
    release(); await tick(); assert.deepEqual(worker.posts, ["search"]);
    worker.reply("done"); assert.equal(await work, "done");
  } finally { release(); await pool.close(); await work.catch(() => undefined); }
});

test("EFF-DISP-03 continuation stays on its affine worker while other work runs", async () => {
  const workers: FakeWorker[] = [], pool = new ThreadPool(() => {
    const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker;
  }, 2, 4);
  const outstanding: Promise<unknown>[] = [];
  try {
    const first = pool.run("a-start", undefined, 1000, { affinity: "a" }); outstanding.push(first);
    await tick(); workers[0].reply("a"); await first;
    const other = pool.run("b", undefined, 1000, { affinity: "b" }); outstanding.push(other); await tick();
    const next = pool.run("a-next", undefined, 1000, { affinity: "a" }); outstanding.push(next); await tick();
    assert.deepEqual(workers[0].posts, ["a-start", "a-next"]);
    for (const worker of workers) worker.reply("done"); await Promise.all(outstanding);
  } finally { const settled = Promise.allSettled(outstanding); await pool.close(); await settled; }
});

test("EFF-DISP-04 independent matcher pools share the process CPU admission limit", async () => {
  const workers: FakeWorker[] = [], make = () => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; };
  const left = new ThreadPool(make, 2, 4), right = new ThreadPool(make, 2, 4);
  const jobs = [left.run("one", undefined, 1000), left.run("two", undefined, 1000), right.run("three", undefined, 1000)];
  const settled = Promise.allSettled(jobs);
  try {
    await tick(); assert.equal(workers.reduce((sum, worker) => sum + worker.posts.length, 0), 2);
    for (const worker of workers) worker.reply("done"); await tick();
    for (const worker of workers) worker.reply("done"); await Promise.all(jobs);
  } finally { await Promise.all([left.close(), right.close()]); await settled; }
});
