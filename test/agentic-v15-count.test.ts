import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  snapshotCommittedFunnelRows
} from "../lib/agentic/funnel/ledger.ts";
import { resetQueryBudget } from "../lib/agentic/plan/query-budget.ts";
import {
  emptyQaPersistLocal,
  restoreQaPersistLocal,
  setQueryBudgetCommitGateForTests,
  setQueryBudgetPersistEnteredForTests,
  snapshotQaPersistDurable
} from "../lib/agentic/qa/persist.ts";
import {
  beginV15Run,
  canonicalHash,
  canonicalJson,
  completeSection4Journey,
  createHandlerCluster,
  deferred,
  endV15Run,
  executeOn,
  firstDiff,
  fulfilHandleOnly,
  observeEvidence,
  observeOn,
  planOn,
  setClockOn,
  stripOpaque,
  setupDefaultExecuteContext,
  simulateHandleOnly
} from "./agentic/v15/harness.ts";
import { countQuery, setQueryNamespace } from "../lib/agentic/plan/query-budget.ts";
import { V15_CLOCK_10 } from "./agentic/v15/manifest.ts";

async function observeCounts(
  cluster: ReturnType<typeof createHandlerCluster>,
  namespace: string,
  orderHandle: string
) {
  const observed = await observeOn(cluster, "A", { namespace, orderHandle });
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
    setQueryNamespace("global");
    countQuery("plan.match");
    countQuery("plan.match");
    countQuery("plan.match.hit");
    countQuery("plan.match.hit");
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

  it("COUNT-RED-03 drop after counter commit then replay keeps 1/1", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ct03", skipPlan: true });
    const entered = deferred();
    setQueryBudgetPersistEnteredForTests(() => entered.resolve());
    const dropped = planOn(cluster, "C", { ...ready, suffix: "ct03" });
    await entered.promise;
    const replay = await planOn(cluster, "D", { ...ready, suffix: "ct03" });
    const first = await dropped;
    assert.equal(replay.planHandle, first.planHandle);
    const executed = await executeOn(cluster, "A", {
      ...ready,
      planHandle: String(first.planHandle),
      revision: Number(first.revision),
      suffix: "ct03"
    });
    const counts = await observeCounts(cluster, ready.namespace, String(executed.orderHandle));
    assert.deepEqual(counts, { hit: 1, match: 1, miss: 0, planMatchHits: 1 }, canonicalJson(counts));
    setQueryBudgetPersistEnteredForTests(null);
  });

  it("COUNT-RED-06 observe twice is a pure read of the full evidence object", async () => {
    const cluster = createHandlerCluster();
    const ready = await completeSection4Journey(cluster, "ct06");
    const before = {
      durable: snapshotQaPersistDurable(),
      funnel: snapshotCommittedFunnelRows()
    };
    const first = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: ready.orderHandle
    });
    const second = await observeOn(cluster, "A", {
      orderHandle: ready.orderHandle
    });
    const after = {
      durable: snapshotQaPersistDurable(),
      funnel: snapshotCommittedFunnelRows()
    };
    const left = stripOpaque(first);
    const right = stripOpaque(second);
    assert.equal(canonicalJson(left), canonicalJson(right), canonicalJson(firstDiff(left, right)));
    assert.deepEqual(observeCountsFrom(first), { hit: 1, match: 1, miss: 0, planMatchHits: 1 });
    assert.equal(canonicalJson(before), canonicalJson(after), canonicalJson(firstDiff(before, after)));
  });

  it("COUNT-RED-07 restarted observer still reports 1/1/1/0 and the same evidence", async () => {
    const cluster = createHandlerCluster();
    const ready = await completeSection4Journey(cluster, "ct07");
    const first = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: ready.orderHandle
    });
    cluster.restartHandler("B");
    await cluster.asHandler("B", async () => {
      restoreQaPersistLocal(emptyQaPersistLocal());
      resetQueryBudget();
    });
    const second = await observeOn(cluster, "B", {
      orderHandle: ready.orderHandle
    });
    const left = stripOpaque(first);
    const right = stripOpaque(second);
    assert.equal(canonicalJson(left), canonicalJson(right), canonicalJson(firstDiff(left, right)));
    assert.deepEqual(observeCountsFrom(second), { hit: 1, match: 1, miss: 0, planMatchHits: 1 });
  });

  it("COUNT-RED-08 two namespaces stay isolated at 1/1/1/0", async () => {
    const cluster = createHandlerCluster();
    const first = await completeSection4Journey(cluster, "ct08a");
    const second = await completeSection4Journey(cluster, "ct08b");
    const a = await observeOn(cluster, "A", {
      namespace: first.namespace,
      orderHandle: first.orderHandle
    });
    const b = await observeOn(cluster, "C", {
      namespace: second.namespace,
      orderHandle: second.orderHandle
    });
    assert.deepEqual(observeCountsFrom(a), { hit: 1, match: 1, miss: 0, planMatchHits: 1 });
    assert.deepEqual(observeCountsFrom(b), { hit: 1, match: 1, miss: 0, planMatchHits: 1 });
    assert.notEqual(first.namespace, second.namespace);
  });

  it("COUNT-RED-09 plan success waits for counter commit latch", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ct09prep", skipPlan: true });
    let release = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    setQueryBudgetPersistEnteredForTests(() => {
      entered = true;
    });
    setQueryBudgetCommitGateForTests(gate);
    let settled = false;
    const pending = planOn(cluster, "C", { ...ready, suffix: "ct09" }).then((result) => {
      settled = true;
      return result;
    });
    while (!entered && !settled) {
      await Promise.resolve();
    }
    for (let index = 0; index < 10000 && !settled; index += 1) {
      await Promise.resolve();
    }
    assert.equal(settled, false, "plan returned before the counter commit latch released");
    release();
    const plan = await pending;
    assert.equal(plan.status, "ready", canonicalJson(plan));
    setQueryBudgetCommitGateForTests(null);
    setQueryBudgetPersistEnteredForTests(null);
  });

  it("COUNT-RED-10 complete counter matrix is byte-identical twice", async () => {
    const hashes = [];
    for (const pass of [1, 2]) {
      beginV15Run();
      const cluster = createHandlerCluster();
      const ready = await completeSection4Journey(cluster, `ct10${pass}`);
      const observed = await observeOn(cluster, "A", {
        namespace: ready.namespace,
        orderHandle: ready.orderHandle
      });
      hashes.push(canonicalHash(observeEvidence(observed)));
      endV15Run();
    }
    assert.equal(hashes[0], hashes[1], canonicalJson(hashes));
  });
});

function observeCountsFrom(observed: Record<string, unknown>) {
  const queries = (observed.queries ?? {}) as Record<string, number>;
  const budget = (observed.dependencyBudget ?? {}) as Record<string, number>;
  return {
    hit: queries["plan.match.hit"] ?? 0,
    match: queries["plan.match"] ?? 0,
    miss: budget.planMatchMisses ?? 0,
    planMatchHits: budget.planMatchHits ?? 0
  };
}
