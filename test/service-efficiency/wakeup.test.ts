import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { signalTaskQueue, waitForTaskQueueWork, type TaskQueueSignal } from "../../lib/task-queue-signal.ts";

const state = globalThis as typeof globalThis & {
  mattanutraTaskQueuePending: TaskQueueSignal[];
  mattanutraTaskWakeupWaiters: Set<(signal: TaskQueueSignal) => void>;
};
beforeEach(() => { state.mattanutraTaskQueuePending = []; state.mattanutraTaskWakeupWaiters = new Set(); });

test("EFF-WAKE-01 matching signal survives an unrelated waiting worker", async () => {
  const unrelated = waitForTaskQueueWork(20, ["email"]);
  signalTaskQueue({ taskType: "match_agentic_plan", taskId: "match-one" });
  assert.deepEqual(await waitForTaskQueueWork(5, ["match_agentic_plan"]), { taskType: "match_agentic_plan", taskId: "match-one" });
  await unrelated;
});

test("EFF-WAKE-02 duplicate signals coalesce and pending storage is bounded", async () => {
  for (let i = 0; i < 1000; i++) signalTaskQueue({ taskType: "match_agentic_plan", taskId: "match-one" });
  assert.ok(state.mattanutraTaskQueuePending.length <= 1);
  assert.equal((await waitForTaskQueueWork(5, ["match_agentic_plan"]))?.taskId, "match-one");
  assert.equal(await waitForTaskQueueWork(5, ["match_agentic_plan"]), null);
  for (let i = 0; i < 1000; i++) signalTaskQueue({ taskType: `type-${i}` });
  assert.ok(state.mattanutraTaskQueuePending.length <= 256);
});

test("EFF-WAKE-03 one task wakes one matching waiter", async () => {
  const waiting = [waitForTaskQueueWork(10, ["match_agentic_plan"]), waitForTaskQueueWork(10, ["match_agentic_plan"])];
  signalTaskQueue({ taskType: "match_agentic_plan", taskId: "one" });
  assert.equal((await Promise.all(waiting)).filter(Boolean).length, 1);
});

test("EFF-WAKE-04 transport bursts coalesce without dropping work arriving during delivery", async () => {
  const { coalescedWorkerWake } = await import("../../lib/worker-wake.ts");
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const calls: TaskQueueSignal[] = [];
  const wake = coalescedWorkerWake(async signal => { calls.push(signal); if (calls.length === 1) { entered(); await held; } });
  const first = Array.from({ length: 100 }, () => wake({ taskType: "match", taskId: "one" }));
  await started;
  const later = wake({ taskType: "match", taskId: "two" }); release();
  await Promise.all([...first, later]);
  assert.equal(calls.length, 2); assert.equal(calls[0].taskId, "one"); assert.equal(calls[1].taskId, "two");
});


test("EFF-WAKE-05 an in-flight duplicate does not create another HTTP wake burst", async () => {
  const { coalescedWorkerWake } = await import("../../lib/worker-wake.ts");
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  const wake = coalescedWorkerWake(async () => { calls++; entered(); await held; });
  const first = wake({ taskType: "match", taskId: "one" }); await started;
  const duplicate = wake({ taskType: "match", taskId: "one" }); release(); await Promise.all([first, duplicate]);
  assert.equal(calls, 1);
});

test("EFF-WAKE-06 one task wakes one registered worker; distinct tasks distribute fairly", async () => {
  const wakeModule = await import("../../lib/worker-wake.ts");
  const choose = (wakeModule as unknown as { chooseWorkerWakeUrls?: (urls: string[], signal: TaskQueueSignal) => string[] }).chooseWorkerWakeUrls;
  assert.equal(typeof choose, "function"); assert.ok(choose);
  const urls = ["https://one.invalid", "https://two.invalid"];
  const first = choose(urls, { taskType: "match", taskId: "one" }), second = choose(urls, { taskType: "match", taskId: "two" });
  assert.equal(first.length, 1); assert.equal(second.length, 1); assert.notDeepEqual(first, second);
  assert.deepEqual(choose(urls, { taskType: "match" }), urls);
});
