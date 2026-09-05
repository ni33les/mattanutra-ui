import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { setCommitNowLatchForTests } from "../lib/agentic/qa/simulate.ts";
import {
  beginV15Run,
  canonicalHash,
  canonicalJson,
  completeSection4Journey,
  createHandlerCluster,
  deferred,
  endV15Run,
  eventLedger,
  eventOf,
  executeOn,
  fulfilHandleOnly,
  orderOn,
  qaCall,
  setClockOn,
  setupDefaultExecuteContext,
  simulateHandleOnly,
  stripOpaque
} from "./agentic/v15/harness.ts";
import {
  V15_CLOCK_00,
  V15_CLOCK_09,
  V15_CLOCK_10,
  V15_CLOCK_20,
  V15_CLOCK_30,
  V15_CLOCK_40
} from "./agentic/v15/manifest.ts";

describe("v1.5 authoritative clock resolution", () => {
  beforeEach(() => {
    beginV15Run();
  });
  afterEach(() => {
    setCommitNowLatchForTests(null);
    endV15Run();
  });

  it("CLOCK-RED-01 order-handle-only decline uses namespace 09:00 not worker 00:00", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "clk01" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "clk01" });
    assert.equal(executed.ok, true, canonicalJson(executed));
    cluster.restartHandler("B");
    const declined = await simulateHandleOnly(cluster, "B", {
      orderHandle: String(executed.orderHandle),
      scenario: "decline_insufficient_funds"
    });
    const stamps = eventOf(declined, "declined").map((item) => item.createdAt);
    assert.deepEqual(stamps, [V15_CLOCK_09], canonicalJson({ stamps, declined }));
    assert.equal(stamps.includes(V15_CLOCK_00), false);
  });

  it("CLOCK-RED-02 payment success by handle is stamped 09:10", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "clk02" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "clk02" });
    await simulateHandleOnly(cluster, "B", {
      orderHandle: String(executed.orderHandle),
      scenario: "decline_insufficient_funds"
    });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_10);
    cluster.restartHandler("C");
    const paid = await simulateHandleOnly(cluster, "C", {
      orderHandle: String(executed.orderHandle),
      scenario: "success"
    });
    const succeeded = eventOf(paid, "succeeded").map((item) => item.createdAt);
    const preparing = eventOf(paid, "preparing").map((item) => item.createdAt);
    assert.deepEqual(succeeded, [V15_CLOCK_10], canonicalJson(paid));
    assert.equal(preparing[0], V15_CLOCK_10, canonicalJson(preparing));
  });

  it("CLOCK-RED-03 fulfilment across workers uses 09:20/09:30/09:40", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "clk03" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "clk03" });
    const handle = String(executed.orderHandle);
    await simulateHandleOnly(cluster, "B", { orderHandle: handle, scenario: "decline_insufficient_funds" });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_10);
    await simulateHandleOnly(cluster, "C", { orderHandle: handle, scenario: "success" });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_20);
    const preparing = await fulfilHandleOnly(cluster, "B", { orderHandle: handle, status: "preparing" });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_30);
    const dispatched = await fulfilHandleOnly(cluster, "C", { orderHandle: handle, status: "dispatched" });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_40);
    const delivered = await fulfilHandleOnly(cluster, "D", { orderHandle: handle, status: "delivered" });
    const preparingAt = eventOf(preparing, "preparing").map((item) => item.createdAt);
    assert.equal(preparingAt.includes(V15_CLOCK_20), true, canonicalJson(preparingAt));
    assert.deepEqual(eventOf(dispatched, "dispatched").map((item) => item.createdAt), [V15_CLOCK_30]);
    assert.deepEqual(eventOf(delivered, "delivered").map((item) => item.createdAt), [V15_CLOCK_40]);
  });

  it("CLOCK-RED-04 restart still resolves the durable namespace clock", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "clk04" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "clk04" });
    const handle = String(executed.orderHandle);
    for (const id of ["A", "B", "C", "D"] as const) {
      cluster.restartHandler(id);
    }
    await cluster.primeFromCommitted("A", ready.namespace);
    const declined = await simulateHandleOnly(cluster, "B", {
      orderHandle: handle,
      scenario: "decline_insufficient_funds"
    });
    assert.deepEqual(eventOf(declined, "declined").map((item) => item.createdAt), [V15_CLOCK_09]);
  });

  it("CLOCK-RED-05 unrelated worker clock cannot stamp the order", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "clk05" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "clk05" });
    const other = await cluster.asHandler("B", (runtime) => qaCall(runtime, "beginRun", { runId: "other" }));
    await setClockOn(cluster, "B", String(other.namespace), V15_CLOCK_40);
    const declined = await simulateHandleOnly(cluster, "B", {
      orderHandle: String(executed.orderHandle),
      scenario: "decline_insufficient_funds"
    });
    assert.deepEqual(eventOf(declined, "declined").map((item) => item.createdAt), [V15_CLOCK_09]);
    assert.equal(eventOf(declined, "declined")[0]?.createdAt === V15_CLOCK_40, false);
  });

  it("CLOCK-RED-06 missing order namespace is a typed error and writes nothing", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "clk06" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "clk06" });
    const handle = String(executed.orderHandle);
    const before = await orderOn(cluster, "A", { orderHandle: handle });
    const orderId = await cluster.asHandler("A", async (runtime) => {
      const { resolveCapability } = await import("../lib/agentic/capabilities.ts");
      const capability = await resolveCapability({
        action: "order.read",
        config: runtime.config,
        handle,
        now: runtime.now ?? V15_CLOCK_09,
        resourceType: "order",
        scope: { ...runtime.scope, principalScope: ready.principal },
        store: runtime.store
      });
      const row = capability ? await runtime.store.getOrder(capability.resourceId) : null;
      if (row) {
        await runtime.store.updateOrder({ ...row, principalScope: null });
      }
      return capability?.resourceId ?? "";
    });
    void orderId;
    const missing = await simulateHandleOnly(cluster, "B", {
      orderHandle: handle,
      scenario: "decline_insufficient_funds"
    });
    assert.equal(missing.ok, false, canonicalJson(missing));
    assert.equal((missing.error as { reasonCode?: string } | undefined)?.reasonCode, "not_found");
    const after = await orderOn(cluster, "A", { orderHandle: handle });
    assert.deepEqual(eventOf(after, "declined"), eventOf(before, "declined"));
  });

  it("CLOCK-RED-07 commit-time clock is read after admission latch", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "clk07" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "clk07" });
    const handle = String(executed.orderHandle);
    const hold = deferred();
    const admitted = deferred();
    setCommitNowLatchForTests(hold.promise, () => admitted.resolve());
    const pending = simulateHandleOnly(cluster, "B", {
      orderHandle: handle,
      scenario: "decline_insufficient_funds"
    });
    await admitted.promise;
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_10);
    hold.resolve();
    const declined = await pending;
    setCommitNowLatchForTests(null);
    const stamps = eventOf(declined, "declined").map((item) => item.createdAt);
    assert.deepEqual(stamps, [V15_CLOCK_10], canonicalJson({ stamps, declined }));
    assert.equal(stamps.includes(V15_CLOCK_00), false);
    assert.equal(stamps.includes(V15_CLOCK_09), false);
  });

  it("CLOCK-RED-08 complete clock matrix is byte-identical twice", async () => {
    const hashes = [];
    for (const pass of [1, 2]) {
      beginV15Run();
      const cluster = createHandlerCluster();
      const ready = await completeSection4Journey(cluster, `clk08${pass}`);
      const ledger = eventLedger(await orderOn(cluster, "B", { orderHandle: ready.orderHandle }));
      hashes.push(canonicalHash(stripOpaque(ledger)));
      endV15Run();
    }
    assert.equal(hashes[0], hashes[1], hashes.join("\n"));
  });
});
