import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  beginV15Run,
  canonicalHash,
  canonicalJson,
  createHandlerCluster,
  endV15Run,
  eventLedger,
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
  V15_CLOCK_09,
  V15_CLOCK_10,
  V15_CLOCK_20,
  V15_CLOCK_30,
  V15_CLOCK_40,
  V15_FUNNEL,
  V15_SEQUENCES
} from "./agentic/v15/manifest.ts";

const LIFECYCLE = ["open", "declined", "succeeded", "preparing", "dispatched", "delivered"];

describe("v1.5 deterministic event ordering", () => {
  beforeEach(() => {
    beginV15Run();
  });
  afterEach(() => {
    endV15Run();
  });

  it("EVENT-RED-01 each mutation appends the lifecycle prefix in commit order", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ev01" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ev01" });
    const handle = String(executed.orderHandle);
    const open = eventLedger(await orderOn(cluster, "A", { orderHandle: handle }));
    assert.deepEqual(open.map((item) => item.status), ["open"]);
    const declined = eventLedger(
      await simulateHandleOnly(cluster, "B", { orderHandle: handle, scenario: "decline_insufficient_funds" })
    );
    assert.deepEqual(
      declined.map((item) => item.status).slice(0, 2),
      ["open", "declined"],
      canonicalJson(declined)
    );
  });

  it("EVENT-RED-02 shuffled physical fulfilment order cannot change public order", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ev02" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ev02" });
    const handle = String(executed.orderHandle);
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_10);
    await simulateHandleOnly(cluster, "A", { orderHandle: handle, scenario: "success" });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_10);
    await fulfilHandleOnly(cluster, "A", { orderHandle: handle, status: "preparing" });
    const original = cluster.store.listFulfilmentEvents.bind(cluster.store);
    const hashes = [];
    for (const mode of ["forward", "reverse", "shuffle"] as const) {
      cluster.store.listFulfilmentEvents = async (orderId: string) => {
        const rows = [...(await original(orderId))];
        if (mode === "reverse") {
          return rows.reverse();
        }
        if (mode === "shuffle") {
          return rows.length > 1 ? [rows[1]!, rows[0]!, ...rows.slice(2)] : rows;
        }
        return rows;
      };
      const viewed = await orderOn(cluster, "B", { orderHandle: handle });
      hashes.push(canonicalHash((viewed.events as unknown[]) ?? []));
    }
    assert.equal(new Set(hashes).size, 1, canonicalJson(hashes));
  });

  it("EVENT-RED-03 equal timestamps follow durable lifecycle not physical order", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ev03" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ev03" });
    const handle = String(executed.orderHandle);
    await simulateHandleOnly(cluster, "B", { orderHandle: handle, scenario: "decline_insufficient_funds" });
    const ledger = eventLedger(await orderOn(cluster, "C", { orderHandle: handle }));
    const statuses = ledger.map((item) => item.status);
    assert.deepEqual(statuses.slice(0, 2), ["open", "declined"], canonicalJson(ledger));
    assert.equal(ledger[0]?.createdAt === ledger[1]?.createdAt || ledger[0]?.createdAt === V15_CLOCK_09, true);
  });

  it("EVENT-RED-04 workers A/B/C return the same ordered event hash", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ev04" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ev04" });
    const handle = String(executed.orderHandle);
    await simulateHandleOnly(cluster, "A", { orderHandle: handle, scenario: "decline_insufficient_funds" });
    const hashes = [];
    for (const worker of ["A", "B", "C"] as const) {
      cluster.restartHandler(worker);
      hashes.push(canonicalHash(eventLedger(await orderOn(cluster, worker, { orderHandle: handle }))));
    }
    assert.equal(new Set(hashes).size, 1, canonicalJson(hashes));
  });

  it("EVENT-RED-06 replay does not duplicate or move events", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ev06" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ev06" });
    const handle = String(executed.orderHandle);
    const first = eventLedger(
      await simulateHandleOnly(cluster, "A", { orderHandle: handle, scenario: "decline_insufficient_funds" })
    );
    const second = eventLedger(
      await simulateHandleOnly(cluster, "B", { orderHandle: handle, scenario: "decline_insufficient_funds" })
    );
    assert.deepEqual(
      second.map((item) => item.status),
      first.map((item) => item.status)
    );
    assert.equal(second.filter((item) => item.status === "declined").length, 1);
  });

  it("EVENT-RED-07 funnel remains nine events 1..9", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ev07" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ev07" });
    const handle = String(executed.orderHandle);
    await simulateHandleOnly(cluster, "A", { orderHandle: handle, scenario: "decline_insufficient_funds" });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_10);
    await simulateHandleOnly(cluster, "A", { orderHandle: handle, scenario: "success" });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_20);
    await fulfilHandleOnly(cluster, "A", { orderHandle: handle, status: "preparing" });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_30);
    await fulfilHandleOnly(cluster, "A", { orderHandle: handle, status: "dispatched" });
    await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_40);
    await fulfilHandleOnly(cluster, "A", { orderHandle: handle, status: "delivered" });
    const observed = await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "observe", { namespace: ready.namespace, orderHandle: handle })
    );
    const events = Array.isArray(observed.events) ? observed.events : [];
    const types = events.map((item) => String((item as { eventType?: string }).eventType));
    const sequences = events.map((item) => Number((item as { sequence?: number }).sequence));
    assert.deepEqual(types, [...V15_FUNNEL], canonicalJson(types));
    assert.deepEqual(sequences, [...V15_SEQUENCES]);
    void LIFECYCLE;
    void stripOpaque;
  });

  it("EVENT-RED-05 restart between order polls cannot reorder omit or duplicate", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ev05" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ev05" });
    const handle = String(executed.orderHandle);
    await simulateHandleOnly(cluster, "A", { orderHandle: handle, scenario: "decline_insufficient_funds" });
    const first = eventLedger(await orderOn(cluster, "A", { orderHandle: handle }));
    cluster.restartHandler("B");
    const second = eventLedger(await orderOn(cluster, "B", { orderHandle: handle }));
    cluster.restartHandler("C");
    const third = eventLedger(await orderOn(cluster, "C", { orderHandle: handle }));
    assert.deepEqual(second, first, canonicalJson({ first, second }));
    assert.deepEqual(third, first, canonicalJson({ first, third }));
  });

  it("EVENT-RED-08 complete journey twice is byte-identical after opaque canonicalization", async () => {
    const hashes = [];
    for (const pass of [1, 2]) {
      beginV15Run();
      const cluster = createHandlerCluster();
      const ready = await setupDefaultExecuteContext(cluster, { suffix: `ev08${pass}` });
      const executed = await executeOn(cluster, "A", { ...ready, suffix: `ev08${pass}` });
      const handle = String(executed.orderHandle);
      await simulateHandleOnly(cluster, "A", { orderHandle: handle, scenario: "decline_insufficient_funds" });
      await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_10);
      await simulateHandleOnly(cluster, "A", { orderHandle: handle, scenario: "success" });
      hashes.push(canonicalHash(stripOpaque(eventLedger(await orderOn(cluster, "B", { orderHandle: handle })))));
      endV15Run();
    }
    assert.equal(hashes[0], hashes[1], canonicalJson(hashes));
  });
});
