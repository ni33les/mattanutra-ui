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
