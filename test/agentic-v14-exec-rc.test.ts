import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { listCommittedFunnelEvents } from "../lib/agentic/funnel/ledger.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import {
  setExecuteFreshEnteredForTests,
  setExecuteFreshGateForTests,
  setExecuteSerializeGateForTests
} from "../lib/agentic/commerce/execute.ts";
import {
  beginV14Run,
  canonicalJson,
  contributionOf,
  createHandlerCluster,
  endV14Run,
  executeOn,
  setupDefaultExecuteContext
} from "./agentic/v14/harness.ts";

describe("v1.4 duplicate execute completion", () => {
  beforeEach(() => {
    beginV14Run();
  });
  afterEach(() => {
    setExecuteFreshGateForTests(null);
    setExecuteFreshEnteredForTests(null);
    setExecuteSerializeGateForTests(null);
    endV14Run();
  });

  it("EXEC-RC-RED-01 execute_1 commits one order before success returns", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ex01" });
    const executed = await executeOn(cluster, "A", { ...ready, suffix: "ex01" });
    assert.equal(executed.ok, true, canonicalJson(executed));
    assert.equal(typeof executed.orderHandle, "string");
    const planId = await cluster.asHandler("A", async (runtime) => {
      const capability = await resolveCapability({
        action: "plan.execute",
        config: runtime.config,
        handle: ready.planHandle,
        now: runtime.now ?? "2026-09-02T00:00:00.000Z",
        resourceType: "plan",
        scope: { ...runtime.scope, principalScope: ready.principal },
        store: runtime.store
      });
      return capability?.resourceId ?? "";
    });
    const checkoutEvents = listCommittedFunnelEvents(planId).filter(
      (item) => item.eventType === "checkout_created"
    );
    assert.equal(checkoutEvents.length, 1);
  });

  it("EXEC-RC-RED-02 concurrent execute_2 and execute_3 replay the same order", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ex02" });
    let release = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = 0;
    setExecuteFreshEnteredForTests(() => {
      entered += 1;
    });
    setExecuteSerializeGateForTests(gate);
    const pendingA = executeOn(cluster, "A", { ...ready, suffix: "ex02" });
    const pendingB = executeOn(cluster, "B", { ...ready, suffix: "ex02" });
    const pendingC = executeOn(cluster, "C", { ...ready, suffix: "ex02" });
    for (let index = 0; index < 10000 && entered < 1; index += 1) {
      await Promise.resolve();
    }
    assert.equal(entered >= 1, true);
    let duplicateSettled = false;
    void pendingB.then(() => {
      duplicateSettled = true;
    });
    void pendingC.then(() => {
      duplicateSettled = true;
    });
    for (let index = 0; index < 10000 && !duplicateSettled; index += 1) {
      await Promise.resolve();
    }
    assert.equal(duplicateSettled, true, "duplicate execute must complete from durable state while the first worker is still serializing");
    release();
    const [first, second, third] = await Promise.all([pendingA, pendingB, pendingC]);
    assert.equal(first.ok, true, canonicalJson(first));
    assert.equal(second.ok, true, canonicalJson(second));
    assert.equal(third.ok, true, canonicalJson(third));
    assert.equal(second.orderHandle, first.orderHandle);
    assert.equal(third.orderHandle, first.orderHandle);
    assert.equal(contributionOf(second).checkoutExpiresAt, contributionOf(first).checkoutExpiresAt);
    const planId = await cluster.asHandler("A", async (runtime) => {
      const capability = await resolveCapability({
        action: "plan.execute",
        config: runtime.config,
        handle: ready.planHandle,
        now: runtime.now ?? "2026-09-02T00:00:00.000Z",
        resourceType: "plan",
        scope: { ...runtime.scope, principalScope: ready.principal },
        store: runtime.store
      });
      return capability?.resourceId ?? "";
    });
    assert.equal(
      listCommittedFunnelEvents(planId).filter((item) => item.eventType === "checkout_created").length,
      1
    );
  });

  it("EXEC-RC-RED-05 restart then duplicate fan-out still returns the original order", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ex05" });
    const first = await executeOn(cluster, "A", { ...ready, suffix: "ex05" });
    cluster.restartHandler("A");
    cluster.restartHandler("B");
    const replay = await executeOn(cluster, "B", { ...ready, suffix: "ex05" });
    assert.equal(replay.orderHandle, first.orderHandle);
    assert.equal(replay.ok, true);
  });
});
