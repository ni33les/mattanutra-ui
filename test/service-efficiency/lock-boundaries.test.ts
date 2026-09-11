import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import type { Worker } from "node:worker_threads";
import { createMemoryStore } from "../../lib/agentic/store/memory.ts";
import { admitPlanOperation } from "../../lib/agentic/plan/operations.ts";
import { ThreadPool } from "../../lib/thread-pool.ts";

const scope = { environment: "dev", tenantScope: "mattanutra", principalScope: "lock-boundaries" } as const;
const now = "2026-09-11T08:00:00.000Z";
const planId = "fe2719e7-9f90-4283-ae49-9a8d5f38beb9";
async function storeWithPlan() {
  const store = createMemoryStore();
  await store.insertPlan({ id: planId, ...scope, currentRevision: 1, createdAt: now, updatedAt: now });
  return store;
}
const admission = (key: string, time = now) => ({ planId, ownerScope: "dev:mattanutra:lock-boundaries", key,
  payload: { scoring: {} }, prepared: {}, scope, expectedRevision: 1, revision: 2, now: time });

test("LOCK-BOUNDARY-01 admission hashes and clones commands before acquiring the plan fence", async () => {
  const store = await storeWithPlan(); let locked = false, inspected = 0;
  const lock = store.getPlanForUpdate.bind(store);
  store.getPlanForUpdate = async id => { locked = true; return lock(id); };
  const payload = { get scoring() { inspected++; assert.equal(locked, false, "Command preparation ran under the plan lock"); return {}; } };
  await admitPlanOperation(store, { ...admission("prepare"), payload });
  assert.ok(inspected > 0);
});

test("LOCK-BOUNDARY-02 an explicit refinement retires expired ownership without waiting for a worker sweep", async () => {
  const store = await storeWithPlan();
  const expired = await admitPlanOperation(store, admission("expired"));
  const next = await admitPlanOperation(store, admission("replacement", "2026-09-11T08:03:00.000Z"));
  assert.notEqual(next.id, expired.id);
  assert.equal((await store.getPlanOperation(expired.id))?.status, "failed");
  assert.equal((await store.getActivePlanOperation(planId))?.id, next.id);
  assert.equal((await store.getPlan(planId))?.currentRevision, 1);
  await assert.rejects(admitPlanOperation(store, admission("competing", "2026-09-11T08:03:01.000Z")), /stale_revision/);
});

class FakeWorker extends EventEmitter {
  threadId = 1; posts: unknown[] = [];
  ref() {} unref() {}
  postMessage(input: unknown) { this.posts.push(input); }
  async terminate() { if (this.threadId !== -1) { this.threadId = -1; this.emit("exit"); } return 0; }
  reply() { this.emit("message", { result: "done" }); }
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test("LOCK-BOUNDARY-03 database reservations do not occupy productive CPU slots", async () => {
  const workers: FakeWorker[] = [];
  const create = () => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; };
  const preparing = new ThreadPool(create, 2, 4), available = new ThreadPool(create, 1, 2);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const jobs = [preparing.run("waiting-a", undefined, 1000, { beforeStart: () => gate }), preparing.run("waiting-b", undefined, 1000, { beforeStart: () => gate })];
  const settled = Promise.allSettled(jobs);
  let productive: Promise<unknown> | undefined;
  try {
    await tick(); productive = available.run("productive", undefined, 1000); const observed = productive.catch(() => undefined);
    await tick(); assert.deepEqual(workers[2].posts, ["productive"]);
    workers[2].reply(); await observed; release(); await tick();
    workers[0].reply(); workers[1].reply(); await Promise.all(jobs);
  } finally { release(); await Promise.all([preparing.close(), available.close()]); await settled; await productive?.catch(() => undefined); }
});
