import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { hashCapability } from "../lib/agentic/capabilities.ts";
import { AGENTIC_SCHEMA_CHECKSUM } from "../lib/agentic/info.ts";
import {
  setExecuteFailAtForTests,
  setExecuteFollowerEnteredForTests,
  setExecuteFreshEnteredForTests,
  setExecuteFreshGateForTests,
  setExecuteSerializeEnteredForTests,
  setExecuteSerializeGateForTests
} from "../lib/agentic/commerce/execute.ts";
import { snapshotResourcePermits } from "../lib/agentic/qa/resource-permits.ts";
import {
  advanceServiceClock,
  CLIENT_READ_DEADLINE_MS,
  markRequestStart,
  resetServiceClock,
  SERVICE_INTERNAL_DEADLINE_MS,
  useLiveServiceClock,
  waitUntilDeadline
} from "../lib/agentic/qa/service-clock.ts";
import {
  beginV14Run,
  canonicalJson,
  createHandlerCluster,
  deferred,
  endV14Run,
  executeOn,
  setupDefaultExecuteContext
} from "./agentic/v14/harness.ts";
import {
  UAT_EXEC_BASELINE_SHA,
  UAT_EXEC_CLIENT_DEADLINE_MS,
  UAT_EXEC_LOCK_HASH,
  UAT_EXEC_NL_DEF_HASH,
  UAT_EXEC_NL_EXCLUSION,
  UAT_EXEC_PACK_HASH,
  UAT_EXEC_RUNNER_HASH,
  UAT_EXEC_SCHEMA_CHECKSUM,
  UAT_EXEC_SUCCESS_DEADLINE_MS,
  UAT_EXEC_TEST_IDS
} from "./agentic/uat-exec/manifest.ts";

type DeadlineWait = Promise<void> & { cancel(): void };

function reasonCodeOf(result: Record<string, unknown>) {
  const error = result.error as { reasonCode?: string } | undefined;
  return error?.reasonCode ?? null;
}

function correlationOf(result: Record<string, unknown>) {
  const error = result.error as { correlationId?: string } | undefined;
  return error?.correlationId ?? null;
}

function withHangBudget<T>(work: Promise<T>, label: string, ms = 1500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} produced no result within ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

describe("UAT execute/order request-completion", () => {
  beforeEach(() => {
    beginV14Run();
  });

  afterEach(() => {
    setExecuteFreshGateForTests(null);
    setExecuteFreshEnteredForTests(null);
    setExecuteFollowerEnteredForTests(null);
    setExecuteSerializeGateForTests(null);
    setExecuteSerializeEnteredForTests(null);
    setExecuteFailAtForTests(null);
    endV14Run();
  });

  it("UAT-EXEC-HYGIENE-01 immutable 60s/90s gates and lock hashes", () => {
    const hygiene = JSON.parse(
      readFileSync(new URL("./agentic/det-v3/pack-hygiene.json", import.meta.url), "utf8")
    ) as { hashes: Record<string, string> };
    assert.equal(hygiene.hashes.qaPackV3, UAT_EXEC_PACK_HASH);
    assert.equal(hygiene.hashes.acceptanceRunner, UAT_EXEC_RUNNER_HASH);
    assert.equal(hygiene.hashes.lockEntry, UAT_EXEC_LOCK_HASH);
    assert.equal(UAT_EXEC_NL_DEF_HASH, "574b78411253f20a7f52a23ade7350a6277d632d14555775c5043bbbd05accca");
    assert.deepEqual([...UAT_EXEC_NL_EXCLUSION], ["/checks/TECH-07"]);
    assert.equal(AGENTIC_SCHEMA_CHECKSUM, UAT_EXEC_SCHEMA_CHECKSUM);
    assert.equal(SERVICE_INTERNAL_DEADLINE_MS, UAT_EXEC_SUCCESS_DEADLINE_MS);
    assert.equal(CLIENT_READ_DEADLINE_MS, UAT_EXEC_CLIENT_DEADLINE_MS);
    assert.equal(SERVICE_INTERNAL_DEADLINE_MS < CLIENT_READ_DEADLINE_MS, true);
    assert.equal(UAT_EXEC_BASELINE_SHA.length, 40);
    assert.equal(UAT_EXEC_TEST_IDS.length, 6);
  });

  it("UAT-EXEC-RED-01 concurrent same-key execute_2/3 still replay one order", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "exec01" });
    const [first, second, third] = await withHangBudget(
      Promise.all([
        executeOn(cluster, "A", { ...ready, suffix: "exec01" }),
        executeOn(cluster, "B", { ...ready, suffix: "exec01" }),
        executeOn(cluster, "C", { ...ready, suffix: "exec01" })
      ]),
      "happy execute_2/3"
    );
    assert.equal(first.ok, true, canonicalJson(first));
    assert.equal(second.ok, true, canonicalJson(second));
    assert.equal(third.ok, true, canonicalJson(third));
    assert.equal(second.orderHandle, first.orderHandle);
    assert.equal(third.orderHandle, first.orderHandle);
    assert.deepEqual(snapshotResourcePermits(), {
      admission: 0,
      connection: 0,
      database: 0,
      lock: 0,
      worker: 0
    });
  });

  it("UAT-EXEC-RED-02 stalled leader cannot swallow execute_2's 60s clock", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "exec02" });
    const latch = deferred();
    const entered = deferred();
    const followerEntered = deferred();
    setExecuteFreshGateForTests(latch.promise);
    setExecuteFreshEnteredForTests(entered.resolve);
    setExecuteFollowerEnteredForTests(followerEntered.resolve);
    const leader = executeOn(cluster, "A", { ...ready, suffix: "exec02" });
    await entered.promise;
    const follower = executeOn(cluster, "B", { ...ready, suffix: "exec02" });
    await followerEntered.promise;
    advanceServiceClock(UAT_EXEC_SUCCESS_DEADLINE_MS);
    const [first, second] = await withHangBudget(Promise.all([leader, follower]), "stalled execute_2");
    assert.equal(first.ok, false, canonicalJson(first));
    assert.equal(second.ok, false, canonicalJson(second));
    assert.equal(reasonCodeOf(first), "SERVICE_DEADLINE_EXCEEDED");
    assert.equal(reasonCodeOf(second), "SERVICE_DEADLINE_EXCEEDED");
    assert.equal(typeof correlationOf(first), "string");
    assert.equal(typeof correlationOf(second), "string");
    assert.notEqual(
      correlationOf(first),
      correlationOf(second),
      "same-key execute replays must not share a request clock"
    );
    assert.equal(UAT_EXEC_SUCCESS_DEADLINE_MS < UAT_EXEC_CLIENT_DEADLINE_MS, true);
    // Capacity must remain occupied while the deliberately uncancellable dependency
    // is held. Releasing a Promise does not synchronously finish its continuations.
    assert.deepEqual(snapshotResourcePermits(), {
      admission: 1, connection: 1, database: 0, lock: 0, worker: 1
    });
    latch.resolve();
    await withHangBudget((async () => {
      const deadline = Date.now() + 1000;
      while (Object.values(snapshotResourcePermits()).some(count => count > 0) && Date.now() < deadline) await nextTurn();
    })(), "cancelled execute resource cleanup");
    assert.deepEqual(snapshotResourcePermits(), {
      admission: 0,
      connection: 0,
      database: 0,
      lock: 0,
      worker: 0
    });
    const capability = await cluster.store.getCapabilityByHash(
      hashCapability(cluster.runtimes.A.config.capabilitySecret, ready.planHandle)
    );
    assert.ok(capability);
    assert.equal(await cluster.store.getActiveOrderForPlanRevision(capability.resourceId, ready.revision), null,
      "cancelled execution must not create an order after its dependency unblocks");
  });

  it("UAT-EXEC-RED-03 live waiters on one key keep independent timers", async () => {
    const scheduled: Array<{ cleared: boolean; fn: () => void; id: number }> = [];
    let nextId = 1;
    const originalSet = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    globalThis.setTimeout = ((fn: TimerHandler, ms?: number) => {
      void ms;
      const id = nextId;
      nextId += 1;
      const row = {
        cleared: false,
        fn: () => {
          if (typeof fn === "function") {
            fn();
          }
        },
        id
      };
      scheduled.push(row);
      return id as unknown as NodeJS.Timeout;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((handle: unknown) => {
      const id = Number(handle);
      const row = scheduled.find((item) => item.id === id);
      if (row) {
        row.cleared = true;
      }
    }) as typeof clearTimeout;
    try {
      resetServiceClock();
      useLiveServiceClock();
      markRequestStart("execute:same-key");
      const first = waitUntilDeadline("execute:same-key") as DeadlineWait;
      markRequestStart("execute:same-key");
      const second = waitUntilDeadline("execute:same-key") as DeadlineWait;
      assert.equal(scheduled.length, 2);
      assert.equal(typeof first.cancel, "function");
      first.cancel();
      assert.equal(scheduled[0]?.cleared, true);
      assert.equal(scheduled[1]?.cleared, false, "follower live timer must survive leader release");
      scheduled[1]?.fn();
      await second;
    } finally {
      globalThis.setTimeout = originalSet;
      globalThis.clearTimeout = originalClear;
      resetServiceClock();
    }
  });

  it("UAT-EXEC-RED-04 leader deadline still lets execute_2 return before 90s", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "exec04" });
    const latch = deferred();
    const entered = deferred();
    const followerEntered = deferred();
    setExecuteFreshGateForTests(latch.promise);
    setExecuteFreshEnteredForTests(entered.resolve);
    setExecuteFollowerEnteredForTests(followerEntered.resolve);
    const leader = executeOn(cluster, "A", { ...ready, suffix: "exec04" });
    await entered.promise;
    const follower = executeOn(cluster, "B", { ...ready, suffix: "exec04" });
    await followerEntered.promise;
    advanceServiceClock(UAT_EXEC_SUCCESS_DEADLINE_MS);
    const second = await withHangBudget(follower, "execute_2 after leader deadline");
    assert.equal(reasonCodeOf(second), "SERVICE_DEADLINE_EXCEEDED", canonicalJson(second));
    const first = await withHangBudget(leader, "leader after deadline");
    assert.equal(reasonCodeOf(first), "SERVICE_DEADLINE_EXCEEDED");
    latch.resolve();
  });

  it("UAT-EXEC-RED-05 two deadline pairs stay byte-stable across repeats", async () => {
    const hashes = [];
    for (const pass of [1, 2] as const) {
      beginV14Run();
      const cluster = createHandlerCluster();
      const ready = await setupDefaultExecuteContext(cluster, { suffix: `exec05${pass}` });
      const latch = deferred();
      const entered = deferred();
      const followerEntered = deferred();
      setExecuteFreshGateForTests(latch.promise);
      setExecuteFreshEnteredForTests(entered.resolve);
      setExecuteFollowerEnteredForTests(followerEntered.resolve);
      const leader = executeOn(cluster, "A", { ...ready, suffix: `exec05${pass}` });
      await entered.promise;
      const follower = executeOn(cluster, "B", { ...ready, suffix: `exec05${pass}` });
      await followerEntered.promise;
      advanceServiceClock(UAT_EXEC_SUCCESS_DEADLINE_MS);
      const [first, second] = await withHangBudget(
        Promise.all([leader, follower]),
        `stable execute pair ${pass}`
      );
      latch.resolve();
      hashes.push(
        JSON.stringify({
          first: reasonCodeOf(first),
          second: reasonCodeOf(second),
          distinct: correlationOf(first) !== correlationOf(second),
          retryable:
            (first.error as { retryable?: boolean } | undefined)?.retryable === true &&
            (second.error as { retryable?: boolean } | undefined)?.retryable === true,
          permits: snapshotResourcePermits()
        })
      );
      setExecuteFreshGateForTests(null);
      setExecuteFreshEnteredForTests(null);
      setExecuteFollowerEnteredForTests(null);
      endV14Run();
    }
    assert.equal(new Set(hashes).size, 1, hashes.join("\n"));
  });
});
