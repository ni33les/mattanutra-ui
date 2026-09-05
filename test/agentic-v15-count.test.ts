import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  beginV15Run,
  canonicalJson,
  createHandlerCluster,
  endV15Run,
  executeOn,
  fulfilHandleOnly,
  planOn,
  qaCall,
  setClockOn,
  setupDefaultExecuteContext,
  simulateHandleOnly
} from "./agentic/v15/harness.ts";
import { V15_CLOCK_10 } from "./agentic/v15/manifest.ts";

async function observeCounts(
  cluster: ReturnType<typeof createHandlerCluster>,
  namespace: string,
  orderHandle: string
) {
  const observed = await cluster.asHandler("A", (runtime) =>
    qaCall(runtime, "observe", { namespace, orderHandle })
  );
  const queries = (observed.queries ?? {}) as Record<string, number>;
  const budget = (observed.dependencyBudget ?? {}) as Record<string, number>;
  return {
    hit: queries["plan.match.hit"] ?? 0,
    match: queries["plan.match"] ?? 0,
    miss: budget.planMatchMisses ?? 0,
    planMatchHits: budget.planMatchHits ?? 0
  };
}

describe("v1.5 exactly-once match counters", () => {
  beforeEach(() => {
    beginV15Run();
  });
  afterEach(() => {
    endV15Run();
  });

  it("COUNT-RED-01 one golden cached plan records 1/1/1/0", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ct01" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ct01" });
    const counts = await observeCounts(cluster, ready.namespace, String(executed.orderHandle));
    assert.deepEqual(counts, { hit: 1, match: 1, miss: 0, planMatchHits: 1 }, canonicalJson(counts));
  });

  it("COUNT-RED-02 plan idempotency replay does not increment counters", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ct02", skipPlan: true });
    const first = await planOn(cluster, "C", { ...ready, suffix: "ct02" });
    const replay = await planOn(cluster, "D", { ...ready, suffix: "ct02" });
    assert.equal(replay.planHandle, first.planHandle);
    const executed = await executeOn(cluster, "A", {
      ...ready,
      planHandle: String(first.planHandle),
      revision: Number(first.revision),
      suffix: "ct02"
    });
    const counts = await observeCounts(cluster, ready.namespace, String(executed.orderHandle));
    assert.deepEqual(counts, { hit: 1, match: 1, miss: 0, planMatchHits: 1 }, canonicalJson(counts));
  });

  it("COUNT-RED-04 duplicate execute does not change plan-match counters", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ct04" });
    const [first, second, third] = await Promise.all([
      executeOn(cluster, "A", { ...ready, suffix: "ct04" }),
      executeOn(cluster, "B", { ...ready, suffix: "ct04" }),
      executeOn(cluster, "C", { ...ready, suffix: "ct04" })
    ]);
    assert.equal(second.orderHandle, first.orderHandle);
    assert.equal(third.orderHandle, first.orderHandle);
    const counts = await observeCounts(cluster, ready.namespace, String(first.orderHandle));
    assert.deepEqual(counts, { hit: 1, match: 1, miss: 0, planMatchHits: 1 }, canonicalJson(counts));
  });

  it("COUNT-RED-05 payment and fulfilment do not increment plan-match counters", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ct05" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ct05" });
    const handle = String(executed.orderHandle);
    const before = await observeCounts(cluster, ready.namespace, handle);
    await simulateHandleOnly(cluster, "B", { orderHandle: handle, scenario: "decline_insufficient_funds" });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_10);
    await simulateHandleOnly(cluster, "C", { orderHandle: handle, scenario: "success" });
    await fulfilHandleOnly(cluster, "A", { orderHandle: handle, status: "preparing" });
    const after = await observeCounts(cluster, ready.namespace, handle);
    assert.deepEqual(after, before, canonicalJson({ before, after }));
  });

  it("COUNT-RED-06 observe twice is a pure read", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ct06" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ct06" });
    const handle = String(executed.orderHandle);
    const first = await observeCounts(cluster, ready.namespace, handle);
    const second = await observeCounts(cluster, ready.namespace, handle);
    assert.deepEqual(second, first);
    assert.deepEqual(first, { hit: 1, match: 1, miss: 0, planMatchHits: 1 }, canonicalJson(first));
  });
});
