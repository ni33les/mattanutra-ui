import assert from "node:assert/strict";
import { test } from "node:test";
import { observePlanOperation, signalPlanOperationChange, signalPlanObserverReconnect, PLAN_OBSERVER_LIMIT } from "../../lib/agentic/plan/completion-signals.ts";

test("STREAM-OBS-01 all observers for one operation wake without consuming another operation's event", () => {
  const calls = [0, 0, 0];
  const stops = [observePlanOperation("a", () => calls[0]++), observePlanOperation("a", () => calls[1]++), observePlanOperation("b", () => calls[2]++)];
  assert.ok(stops.every(Boolean));
  try { signalPlanOperationChange({ operationId: "a", version: 2 }); assert.deepEqual(calls, [1, 1, 0]); }
  finally { stops.forEach(stop => stop?.()); }
});
test("STREAM-OBS-02 duplicate and stale versions do not trigger repeated reads", () => {
  let calls = 0; const stop = observePlanOperation("a", () => calls++); assert.ok(stop);
  try { for (const version of [3, 3, 2, 4]) signalPlanOperationChange({ operationId: "a", version }); assert.equal(calls, 2); }
  finally { stop(); }
});
test("STREAM-OBS-03 reconnect rechecks durable state and closed observers stay closed", () => {
  let calls = 0; const stop = observePlanOperation("a", () => calls++); assert.ok(stop);
  signalPlanObserverReconnect(); assert.equal(calls, 1); stop(); stop();
  signalPlanObserverReconnect(); signalPlanOperationChange({ operationId: "a", version: 5 }); assert.equal(calls, 1);
});
test("STREAM-OBS-04 capacity is bounded and cleanup immediately restores capacity", () => {
  const stops = Array.from({ length: PLAN_OBSERVER_LIMIT }, (_, n) => observePlanOperation(`a-${n}`, () => undefined));
  assert.ok(stops.every(Boolean));
  try {
    assert.equal(observePlanOperation("overflow", () => undefined), null);
    stops[0]!();
    const replacement = observePlanOperation("replacement", () => undefined); assert.ok(replacement); replacement();
  } finally { stops.forEach(stop => stop?.()); }
});
