import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { runObservedRequest, cancelRequest, resetRequestTraces } from "../../lib/agentic/qa/request-trace.ts";
import { resetResourcePermits, setPermitCapacity, snapshotResourcePermits } from "../../lib/agentic/qa/resource-permits.ts";
import { advanceServiceClock, resetServiceClock } from "../../lib/agentic/qa/service-clock.ts";

afterEach(() => { resetResourcePermits(); resetServiceClock(); resetRequestTraces(); });

test("LOCK-PERMIT-01 production request execution never waits for synthetic admission, worker or connection permits", async () => {
  for (const kind of ["admission", "worker", "connection"] as const) setPermitCapacity(kind, 0);
  let entered = false;
  const pending = runObservedRequest("no-artificial-gates", async () => { entered = true; return "done"; });
  await new Promise(resolve => setImmediate(resolve));
  // Release the pre-fix blocked request without leaving pending promises in the test process.
  if (!entered) cancelRequest("no-artificial-gates");
  const result = await pending;
  assert.equal(entered, true);
  assert.equal(result, "done");
  assert.deepEqual(snapshotResourcePermits(), { admission: 0, worker: 0, connection: 0, database: 0, lock: 0 });
});

test("LOCK-PERMIT-02 removing permit gates preserves cancellation and the request deadline", async () => {
  let release!: () => void;
  const pending = runObservedRequest("deadline-no-permits", () => new Promise(resolve => { release = () => resolve("late"); }));
  await new Promise(resolve => setImmediate(resolve));
  advanceServiceClock(60_001);
  const result = await pending;
  release();
  assert.ok(typeof result === "object" && result !== null && "ok" in result && result.ok === false);
});

test("LOCK-PERMIT-03 matching preparation and checkout do not use synthetic database permits", () => {
  for (const file of ["lib/agentic/plan/service.ts", "lib/agentic/commerce/execute.ts"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /(?:acquirePermit|releasePermit|qa\/resource-permits)/, file);
  }
});
