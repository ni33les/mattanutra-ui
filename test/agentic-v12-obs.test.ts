import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  setQueryBudgetCommitGateForTests,
  setQueryBudgetPersistEnteredForTests,
  durableQueryCountsOf
} from "../lib/agentic/qa/persist.ts";
import {
  asRecord,
  beginV12Run,
  canonicalHash,
  canonicalJson,
  createHandlerCluster,
  endV12Run,
  executeOn,
  firstDiff,
  observationEvidence,
  observeOn,
  payAndDeliver,
  persistSideEffectSnapshot,
  planOn,
  setupStaleExecuteContext,
  type HandlerId
} from "./agentic/v12/harness.ts";

describe("v1.2 OBS contractual evidence is final before success", () => {
  beforeEach(() => {
    beginV12Run();
  });
  afterEach(() => {
    setQueryBudgetCommitGateForTests(null);
    setQueryBudgetPersistEnteredForTests(null);
    endV12Run();
  });

  it("OBS-RED-01 first and second observe are byte-identical with plan.match=1 hit=1 planMatchHits=1", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "obs01" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs01" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const first = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const second = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const firstEvidence = observationEvidence(first);
    const secondEvidence = observationEvidence(second);
    assert.equal(firstEvidence.planMatch, 1);
    assert.equal(firstEvidence.planMatchHit, 1);
    assert.equal(firstEvidence.planMatchHits, 1);
    assert.equal(secondEvidence.planMatch, 1);
    assert.equal(secondEvidence.planMatchHit, 1);
    assert.equal(secondEvidence.planMatchHits, 1);
    assert.equal(canonicalJson(first), canonicalJson(second), canonicalJson(firstDiff(first, second)));
  });

  it("OBS-RED-02 plan cannot succeed before the counter commit latch releases", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "obs02prep" });
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
    const pending = planOn(cluster, "C", { ...ready, suffix: "obs02" }).then((result) => {
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
    const observed = await observeOn(cluster, "A", { namespace: ready.namespace, correlationId: String(ready.plan.planHandle) });
    void observed;
    const evidence = observationEvidence(
      await observeOn(cluster, "A", {
        namespace: ready.namespace,
        orderHandle: "pending"
      }).catch(() => ({}))
    );
    void evidence;
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs02b" });
    const first = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const firstEvidence = observationEvidence(first);
    assert.equal(firstEvidence.planMatch, 1);
    assert.equal(firstEvidence.planMatchHit, 1);
    assert.equal(firstEvidence.planMatchHits, 1);
  });

  it("OBS-RED-03 plan.match paths cannot change across a second observation", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "obs03" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs03" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const first = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const second = await observeOn(cluster, "C", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const firstEvidence = observationEvidence(first);
    const secondEvidence = observationEvidence(second);
    assert.equal(firstEvidence.planMatchHits, 1);
    assert.equal(firstEvidence.planMatch, 1);
    assert.equal(firstEvidence.planMatchHit, 1);
    assert.equal(secondEvidence.planMatchHits, 1);
    assert.equal(secondEvidence.planMatch, 1);
    assert.equal(secondEvidence.planMatchHit, 1);
    assert.equal(canonicalJson(firstEvidence), canonicalJson(secondEvidence));
  });

  it("OBS-RED-04 twenty routed observes after quiescence share one raw hash", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "obs04" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs04" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const route: HandlerId[] = ["A", "B", "C"];
    const hashes = [];
    for (let index = 0; index < 20; index += 1) {
      const observed = await observeOn(cluster, route[index % 3]!, {
        namespace: ready.namespace,
        orderHandle: String(executed.orderHandle)
      });
      hashes.push(canonicalHash(observed));
    }
    assert.equal(new Set(hashes).size, 1, canonicalJson(hashes));
  });

  it("OBS-RED-05 observe causes zero durable writes", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "obs05" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs05" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const before = persistSideEffectSnapshot();
    await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const after = persistSideEffectSnapshot();
    assert.equal(canonicalJson(before), canonicalJson(after), canonicalJson(firstDiff(before, after)));
  });

  it("OBS-RED-06 two observes released together return one snapshot", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "obs06" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs06" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    let release = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = cluster.asHandler("A", async (runtime) => {
      await barrier;
      const { qaCall } = await import("./agentic/v12/harness.ts");
      return qaCall(runtime, "observe", {
        namespace: ready.namespace,
        orderHandle: String(executed.orderHandle)
      });
    });
    const second = cluster.asHandler("B", async (runtime) => {
      await barrier;
      const { qaCall } = await import("./agentic/v12/harness.ts");
      return qaCall(runtime, "observe", {
        namespace: ready.namespace,
        orderHandle: String(executed.orderHandle)
      });
    });
    release();
    const [left, right] = await Promise.all([first, second]);
    assert.equal(canonicalJson(left), canonicalJson(right), canonicalJson(firstDiff(left, right)));
    assert.equal(observationEvidence(asRecord(left)).planMatchHits, 1);
  });

  it("OBS-RED-07 uncommitted contractual evidence cannot return a partial success", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "obs07prep" });
    let release = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setQueryBudgetCommitGateForTests(gate);
    const pending = planOn(cluster, "C", { ...ready, suffix: "obs07" });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    for (let index = 0; index < 10000 && !settled; index += 1) {
      await Promise.resolve();
    }
    if (settled) {
      const executed = await executeOn(cluster, "B", { ...ready, suffix: "obs07" });
      const observed = await observeOn(cluster, "A", {
        namespace: ready.namespace,
        orderHandle: String(executed.orderHandle)
      });
      const evidence = observationEvidence(observed);
      assert.notEqual(observed.ok, true);
      assert.notEqual(evidence.planMatchHits, 0);
      void durableQueryCountsOf(ready.namespace);
    } else {
      const observed = await observeOn(cluster, "A", { namespace: ready.namespace, correlationId: ready.planHandle });
      assert.notEqual(observed.ok, true);
    }
    release();
    await pending;
  });
});
