import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { listCommittedFunnelEvents } from "../lib/agentic/funnel/ledger.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import {
  setExecuteFailAtForTests,
  setExecuteFreshEnteredForTests,
  setExecuteFreshGateForTests,
  setExecuteSerializeEnteredForTests,
  setExecuteSerializeGateForTests
} from "../lib/agentic/commerce/execute.ts";
import { snapshotResourcePermits } from "../lib/agentic/qa/resource-permits.ts";
import {
  beginV14Run,
  canonicalHash,
  canonicalJson,
  contributionOf,
  createHandlerCluster,
  deferred,
  endV14Run,
  executeOn,
  firstDiff,
  setupDefaultExecuteContext,
  stripOpaque
} from "./agentic/v14/harness.ts";

describe("v1.4 duplicate execute completion", () => {
  beforeEach(() => {
    beginV14Run();
  });
  afterEach(() => {
    setExecuteFreshGateForTests(null);
    setExecuteFreshEnteredForTests(null);
    setExecuteSerializeGateForTests(null);
    setExecuteSerializeEnteredForTests(null);
    setExecuteFailAtForTests(null);
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
    const [first, second, third] = await Promise.all([
      executeOn(cluster, "A", { ...ready, suffix: "ex02" }),
      executeOn(cluster, "B", { ...ready, suffix: "ex02" }),
      executeOn(cluster, "C", { ...ready, suffix: "ex02" })
    ]);
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

  it("EXEC-RC-RED-03 worker C completes from durable state while B is serializing", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ex03" });
    const latch = deferred();
    const entered = deferred();
    setExecuteSerializeGateForTests(latch.promise);
    setExecuteSerializeEnteredForTests(entered.resolve);
    const leader = executeOn(cluster, "B", { ...ready, suffix: "ex03" });
    await entered.promise;
    const follower = await executeOn(cluster, "C", { ...ready, suffix: "ex03" });
    assert.equal(follower.ok, true, canonicalJson(follower));
    latch.resolve();
    const lead = await leader;
    assert.equal(lead.ok, true);
    assert.equal(follower.orderHandle, lead.orderHandle);
    assert.deepEqual(snapshotResourcePermits(), {
      admission: 0,
      connection: 0,
      database: 0,
      lock: 0,
      worker: 0
    });
  });

  it("EXEC-RC-RED-04 drop after commit then replay returns the original order", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ex04" });
    setExecuteFailAtForTests("after_commit");
    const dropped = await executeOn(cluster, "A", { ...ready, suffix: "ex04" });
    assert.equal(dropped.ok, false);
    setExecuteFailAtForTests(null);
    const replay = await executeOn(cluster, "B", { ...ready, suffix: "ex04" });
    assert.equal(replay.ok, true, canonicalJson(replay));
    assert.equal(typeof replay.orderHandle, "string");
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
      (item) => item.eventType === "checkout_created" || item.eventType === "checkout_opened"
    );
    assert.equal(checkoutEvents.length, 1, canonicalJson(checkoutEvents));
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

  it("EXEC-RC-RED-06 before-commit leaves no order; committed paths replay", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ex06a" });
    setExecuteFailAtForTests("before_commit");
    const before = await executeOn(cluster, "A", { ...ready, suffix: "ex06a" });
    assert.equal(before.ok, false);
    setExecuteFailAtForTests(null);
    const created = await executeOn(cluster, "A", { ...ready, suffix: "ex06a" });
    assert.equal(created.ok, true);

    const readyCommit = await setupDefaultExecuteContext(cluster, { suffix: "ex06b" });
    setExecuteFailAtForTests("at_commit");
    const atCommit = await executeOn(cluster, "B", { ...readyCommit, suffix: "ex06b" });
    assert.equal(atCommit.ok, false);
    setExecuteFailAtForTests(null);
    const replayAt = await executeOn(cluster, "C", { ...readyCommit, suffix: "ex06b" });
    assert.equal(replayAt.ok, true);
    assert.equal(typeof replayAt.orderHandle, "string");

    const readyAfter = await setupDefaultExecuteContext(cluster, { suffix: "ex06c" });
    setExecuteFailAtForTests("after_commit");
    const after = await executeOn(cluster, "A", { ...readyAfter, suffix: "ex06c" });
    assert.equal(after.ok, false);
    setExecuteFailAtForTests(null);
    const replayAfter = await executeOn(cluster, "B", { ...readyAfter, suffix: "ex06c" });
    assert.equal(replayAfter.ok, true);
    assert.deepEqual(snapshotResourcePermits(), {
      admission: 0,
      connection: 0,
      database: 0,
      lock: 0,
      worker: 0
    });
  });

  it("EXEC-RC-RED-07 two fresh execute scenarios share one canonical hash", async () => {
    const hashes = [];
    for (const pass of [1, 2]) {
      beginV14Run();
      const cluster = createHandlerCluster();
      const ready = await setupDefaultExecuteContext(cluster, { suffix: `ex07${pass}` });
      const [first, second, third] = await Promise.all([
        executeOn(cluster, "A", { ...ready, suffix: `ex07${pass}` }),
        executeOn(cluster, "B", { ...ready, suffix: `ex07${pass}` }),
        executeOn(cluster, "C", { ...ready, suffix: `ex07${pass}` })
      ]);
      hashes.push(
        canonicalHash(
          stripOpaque({
            ok: [first.ok, second.ok, third.ok],
            same: second.orderHandle === first.orderHandle && third.orderHandle === first.orderHandle,
            expiry: contributionOf(first).checkoutExpiresAt
          })
        )
      );
      endV14Run();
    }
    assert.equal(new Set(hashes).size, 1, canonicalJson(firstDiff(hashes[0], hashes[1])));
  });
});
