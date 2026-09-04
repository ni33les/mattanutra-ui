import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import {
  commitFunnelEvent,
  setFunnelAppendBarrierForTests
} from "../lib/agentic/funnel/ledger.ts";
import {
  beginV12Run,
  canonicalHash,
  canonicalJson,
  createHandlerCluster,
  endV12Run,
  executeOn,
  funnelView,
  loadLedger,
  observeOn,
  payAndDeliver,
  planOn,
  setupStaleExecuteContext,
  simulateOn,
  type HandlerCluster,
  type HandlerId
} from "./agentic/v12/harness.ts";
import { V12_CLOCK_00, V12_FUNNEL, V12_SEQUENCES } from "./agentic/v12/manifest.ts";

async function planIdOf(
  cluster: HandlerCluster,
  handler: HandlerId,
  input: Readonly<{ handle: string; namespace: string }>
) {
  return cluster.asHandler(handler, async (runtime) => {
    const capability = await resolveCapability({
      action: "plan.execute",
      config: runtime.config,
      handle: input.handle,
      now: runtime.now ?? V12_CLOCK_00,
      resourceType: "plan",
      scope: { ...runtime.scope, principalScope: input.namespace },
      store: runtime.store
    });
    return capability?.resourceId ?? "";
  });
}

describe("v1.2 SEQ one causal funnel ledger", () => {
  beforeEach(() => {
    beginV12Run();
  });
  afterEach(() => {
    setFunnelAppendBarrierForTests(null);
    endV12Run();
  });

  it("SEQ-RED-01 full ledger is the nine named events with sequences 1..9", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, {
      suffix: "seq01",
      setup: "A",
      stale: "B",
      plan: "A"
    });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "seq01" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle),
      decline: "C",
      success: "A",
      dispatched: "B",
      delivered: "C"
    });
    const observed = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const events = (observed.events as Array<{ eventType: string; sequence: number }>) ?? [];
    const view = funnelView(events);
    assert.deepEqual(view.types, [...V12_FUNNEL]);
    assert.deepEqual(view.sequences, [...V12_SEQUENCES]);
    assert.notDeepEqual(view.sequences, [1, 1, 2, 2, 3, 4, 5, 6, 7]);
  });

  it("SEQ-RED-02 plan sequences 1..3 then execute continues at 4 and 5", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, {
      suffix: "seq02",
      setup: "A",
      stale: "B",
      plan: "A"
    });
    const planId = await planIdOf(cluster, "A", {
      handle: ready.planHandle,
      namespace: ready.namespace
    });
    const before = await loadLedger(cluster, "A", planId);
    assert.deepEqual(
      before.map((item) => item.eventType),
      V12_FUNNEL.slice(0, 3)
    );
    assert.deepEqual(
      before.map((item) => item.sequence),
      [1, 2, 3]
    );
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "seq02" });
    assert.equal(executed.ok, true, canonicalJson(executed));
    const after = await loadLedger(cluster, "A", planId);
    const view = funnelView(after);
    assert.deepEqual(view.types, V12_FUNNEL.slice(0, 5));
    assert.deepEqual(view.sequences, [1, 2, 3, 4, 5]);
    assert.equal(view.types[3], "confirmed");
    assert.equal(view.types[4], "checkout_created");
  });

  it("SEQ-RED-03 decline success dispatched delivered are 6..9 on the same correlation", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, {
      suffix: "seq03",
      setup: "A",
      stale: "B",
      plan: "A"
    });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "seq03" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle),
      decline: "C",
      success: "D",
      dispatched: "A",
      delivered: "B"
    });
    const observed = await observeOn(cluster, "C", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const events = (observed.events as Array<{
      attribution: string;
      eventType: string;
      locale?: string;
      sequence: number;
    }>) ?? [];
    assert.deepEqual(
      events.map((item) => item.eventType),
      [...V12_FUNNEL]
    );
    assert.deepEqual(
      events.map((item) => item.sequence),
      [...V12_SEQUENCES]
    );
    for (const event of events) {
      assert.equal(event.attribution, "agent_connector");
    }
  });

  it("SEQ-RED-04 replays stay exactly-once with sequences 1..9", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, {
      suffix: "seq04",
      setup: "A",
      stale: "B",
      plan: "A"
    });
    const replayPlan = await planOn(cluster, "A", { ...ready, suffix: "seq04" });
    assert.equal(replayPlan.status, ready.plan.status);
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "seq04" });
    const replayExec = await executeOn(cluster, "C", { ...ready, suffix: "seq04" });
    assert.equal(replayExec.orderHandle, executed.orderHandle);
    await simulateOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle),
      scenario: "decline_insufficient_funds"
    });
    await simulateOn(cluster, "B", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle),
      scenario: "decline_insufficient_funds"
    });
    await simulateOn(cluster, "C", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle),
      scenario: "success"
    });
    await simulateOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle),
      scenario: "duplicate_success"
    });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle),
      decline: "B",
      success: "C",
      dispatched: "A",
      delivered: "B"
    });
    const observed = await observeOn(cluster, "D", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const events = (observed.events as Array<{ eventType: string; sequence: number }>) ?? [];
    assert.equal(events.length, 9);
    assert.deepEqual(
      events.map((item) => item.eventType),
      [...V12_FUNNEL]
    );
    assert.deepEqual(
      events.map((item) => item.sequence),
      [...V12_SEQUENCES]
    );
  });

  it("SEQ-RED-05 concurrent appenders behind a barrier stay linearizable", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, {
      suffix: "seq05",
      setup: "A",
      stale: "B",
      plan: "A"
    });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "seq05" });
    const planId = await planIdOf(cluster, "A", {
      handle: ready.planHandle,
      namespace: ready.namespace
    });
    let release = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    setFunnelAppendBarrierForTests(barrier);
    const first = cluster.asHandler("C", () =>
      commitFunnelEvent({
        attribution: "agent_connector",
        correlationId: planId,
        createdAt: V12_CLOCK_00,
        eventId: `seq05-decline:${planId}`,
        eventType: "payment_declined",
        payload: { locale: "en" }
      })
    );
    const second = cluster.asHandler("D", () =>
      commitFunnelEvent({
        attribution: "agent_connector",
        correlationId: planId,
        createdAt: V12_CLOCK_00,
        eventId: `seq05-paid:${planId}`,
        eventType: "payment_succeeded",
        payload: { locale: "en" }
      })
    );
    release();
    const results = await Promise.all([first, second]);
    assert.equal(results.every((item) => item.accepted), true);
    setFunnelAppendBarrierForTests(null);
    const events = await loadLedger(cluster, "A", planId);
    const sequences = events.map((item) => item.sequence);
    assert.equal(new Set(sequences).size, sequences.length);
    assert.equal(events.some((item) => item.eventType === "payment_declined"), true);
    assert.equal(events.some((item) => item.eventType === "paid"), true);
    const ordered = [...sequences].sort((left, right) => left - right);
    assert.deepEqual(sequences, ordered);
    void executed;
  });

  it("SEQ-RED-06 every worker and one restart see identical ordered ledger bytes", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, {
      suffix: "seq06",
      setup: "A",
      stale: "B",
      plan: "A"
    });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "seq06" });
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const planId = await planIdOf(cluster, "A", {
      handle: ready.planHandle,
      namespace: ready.namespace
    });
    const reads = [];
    for (const handler of ["A", "B", "C", "D"] as const) {
      reads.push(await loadLedger(cluster, handler, planId));
    }
    cluster.restartHandler("B");
    reads.push(await loadLedger(cluster, "B", planId));
    const hashes = reads.map((events) => canonicalHash(funnelView(events)));
    assert.equal(new Set(hashes).size, 1, canonicalJson(reads.map(funnelView)));
    assert.deepEqual(funnelView(reads[0]!).types, [...V12_FUNNEL]);
    assert.deepEqual(funnelView(reads[0]!).sequences, [...V12_SEQUENCES]);
  });
});
