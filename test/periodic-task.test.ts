import assert from "node:assert/strict";
import { it } from "node:test";
import { createPeriodicTask } from "../workers/periodic-task.ts";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

it("coalesces concurrent runs and does not start intervals while a slow call is pending", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release = resolve;});
  let calls = 0;
  const periodic = createPeriodicTask(async () => {calls++; await gate;}, 5);
  const first = periodic.run();
  assert.equal(periodic.run(), first);
  await delay(35);
  assert.equal(calls, 1);
  periodic.stop();
  release(); await first;
  await delay(35);
  assert.equal(calls, 1);
});

it("recovers after a rejected call and stops future work", async () => {
  let calls = 0;
  const periodic = createPeriodicTask(async () => {
    if (++calls === 1) throw new Error("unavailable");
  }, 1000);
  try {
    await assert.rejects(periodic.run(), /unavailable/);
    await periodic.run();
    assert.equal(calls, 2);
  } finally { periodic.stop(); }
  await periodic.run();
  assert.equal(calls, 2);
});
