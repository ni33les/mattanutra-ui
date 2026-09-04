import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  setQueryBudgetCommitGateForTests,
  setQueryBudgetPersistEnteredForTests,
  snapshotQaPersistDurable
} from "../lib/agentic/qa/persist.ts";
import { snapshotCommittedFunnelRows } from "../lib/agentic/funnel/ledger.ts";
import {
  asRecord,
  beginV13Run,
  canonicalHash,
  canonicalJson,
  createHandlerCluster,
  endV13Run,
  executeOn,
  firstDiff,
  funnelView,
  observeOn,
  payAndDeliver,
  planOn,
  setupDefaultExecuteContext,
  stripOpaque,
  type HandlerId
} from "./agentic/v13/harness.ts";
import { V13_FUNNEL, V13_SEQUENCES } from "./agentic/v13/manifest.ts";

function observationEvidence(observed: Record<string, unknown>) {
  const queries = asRecord(observed.queries);
  const budget = asRecord(observed.dependencyBudget);
  return {
    acquisitionMinor: observed.acquisitionMinor ?? null,
    clock: observed.clock ?? null,
    contributionMinor: observed.contributionMinor ?? null,
    planMatch: queries["plan.match"] ?? null,
    planMatchHit: queries["plan.match.hit"] ?? null,
    planMatchHits: budget.planMatchHits ?? null
  };
}

describe("v1.3 OBS authoritative observation", () => {
  beforeEach(() => {
    beginV13Run();
  });
  afterEach(() => {
    setQueryBudgetCommitGateForTests(null);
    setQueryBudgetPersistEnteredForTests(null);
    endV13Run();
  });

  it("OBS-RED-01 first observe on a different worker has plan.match=1 hit=1 planMatchHits=1", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "obs01" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs01" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const first = await observeOn(cluster, "D", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const evidence = observationEvidence(first);
    assert.equal(evidence.planMatch, 1, canonicalJson(first));
    assert.equal(evidence.planMatchHit, 1);
    assert.equal(evidence.planMatchHits, 1);
  });

  it("OBS-RED-02 workers A B C return the same clock attribution acquisition counters and ledger", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "obs02" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs02" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const reads = [];
    for (const handler of ["A", "B", "C"] as const) {
      const observed = await observeOn(cluster, handler, {
        namespace: ready.namespace,
        orderHandle: String(executed.orderHandle)
      });
      reads.push({
        evidence: observationEvidence(observed),
        funnel: funnelView((observed.events as Array<{ eventType: string; sequence: number }>) ?? [])
      });
    }
    assert.equal(
      canonicalJson(reads[0]),
      canonicalJson(reads[1]),
      canonicalJson(firstDiff(reads[0], reads[1]))
    );
    assert.equal(canonicalJson(reads[1]), canonicalJson(reads[2]));
  });

  it("OBS-RED-03 second observe is byte-identical and writes nothing", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "obs03" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs03" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const before = {
      durable: snapshotQaPersistDurable(),
      funnel: snapshotCommittedFunnelRows()
    };
    const first = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const second = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const after = {
      durable: snapshotQaPersistDurable(),
      funnel: snapshotCommittedFunnelRows()
    };
    assert.equal(canonicalJson(first), canonicalJson(second), canonicalJson(firstDiff(first, second)));
    assert.equal(canonicalJson(before), canonicalJson(after), canonicalJson(firstDiff(before, after)));
  });

  it("OBS-RED-04 plan cannot succeed before the counter commit latch releases", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "obs04prep", skipPlan: true });
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
    const pending = planOn(cluster, "C", { ...ready, suffix: "obs04" }).then((result) => {
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
  });

  it("OBS-RED-05 restart observer keeps plan-match counters", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "obs05" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs05" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    cluster.restartHandler("D");
    const observed = await observeOn(cluster, "D", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const evidence = observationEvidence(observed);
    assert.equal(evidence.planMatch, 1);
    assert.equal(evidence.planMatchHit, 1);
    assert.equal(evidence.planMatchHits, 1);
  });

  it("OBS-RED-06 two equivalent namespaces canonicalise to one observation hash", async () => {
    const hashes = [];
    for (const suffix of ["obs06a", "obs06b"]) {
      const cluster = createHandlerCluster();
      const ready = await setupDefaultExecuteContext(cluster, { suffix });
      const executed = await executeOn(cluster, "B", { ...ready, suffix });
      await payAndDeliver(cluster, {
        namespace: ready.namespace,
        orderHandle: String(executed.orderHandle)
      });
      const observed = await observeOn(cluster, "A", {
        namespace: ready.namespace,
        orderHandle: String(executed.orderHandle)
      });
      hashes.push(canonicalHash(stripOpaque(observationEvidence(observed))));
    }
    assert.equal(new Set(hashes).size, 1);
  });

  it("OBS-RED-07 funnel replay keeps nine events and sequences 1..9", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "obs07" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs07" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const observed = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const events = (observed.events as Array<{ eventType: string; sequence: number }>) ?? [];
    assert.deepEqual(funnelView(events).types, [...V13_FUNNEL]);
    assert.deepEqual(funnelView(events).sequences, [...V13_SEQUENCES]);
    void (["A"] as HandlerId[]);
  });
});
