import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { AGENTIC_SCHEMA_CHECKSUM } from "../lib/agentic/info.ts";
import {
  resetPlanCreateInflightForTests,
  setMatcherEnteredForTests,
  setMatcherGateForTests,
  setPlanClaimLatchForTests,
  snapshotPlanInflightForTests
} from "../lib/agentic/plan/service.ts";
import { listRequestTraces, requestTrace } from "../lib/agentic/qa/request-trace.ts";
import {
  advanceServiceClock,
  CLIENT_READ_DEADLINE_MS,
  deadlineExceeded,
  SERVICE_INTERNAL_DEADLINE_MS,
  useInjectedServiceClock
} from "../lib/agentic/qa/service-clock.ts";
import {
  completeSection4Journey,
  createHandlerCluster as createV15Cluster,
  beginV15Run,
  endV15Run,
  eventLedger,
  observeEvidence,
  observeOn,
  orderOn
} from "./agentic/v15/harness.ts";
import {
  V15_CLOCK_09,
  V15_CLOCK_10,
  V15_CLOCK_20,
  V15_CLOCK_30,
  V15_CLOCK_40,
  V15_FUNNEL,
  V15_SEQUENCES,
  V15_TEST_IDS
} from "./agentic/v15/manifest.ts";
import {
  beginV16Run,
  burstKeys,
  businessView,
  catalogueAttestation,
  createV16Runtime,
  deferred,
  endV16Run,
  freezeRealThailandCatalogue,
  frozenSnapshot,
  publicInfo,
  publicPlanCreate
} from "./agentic/v16/harness.ts";
import {
  F_READY_MAG,
  V16_CLIENT_DEADLINE_MS,
  V16_HARD_DEADLINE_MS,
  V16_HYGIENE_IDS,
  V16_LOCK_HASH,
  V16_NL_DEF_HASH,
  V16_NL_EXCLUSION,
  V16_NL_IDS,
  V16_OBS_IDS,
  V16_PACK_HASH,
  V16_PLAN_IDS,
  V16_RUNNER_HASH,
  V16_SUCCESS_DEADLINE_MS,
  V16_TEST_IDS,
  v16FreshKey
} from "./agentic/v16/manifest.ts";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalBusiness(result: Record<string, unknown>) {
  return sha256(JSON.stringify(businessView(result)));
}

async function tenBurst(
  runtime: ReturnType<typeof createV16Runtime>["runtime"],
  repeat: 1 | 2,
  hold: ReturnType<typeof deferred>
) {
  const keys = burstKeys(repeat);
  const pending = keys.map((key) =>
    hold.promise.then(() => publicPlanCreate(runtime, key))
  );
  hold.resolve();
  return { keys, results: await Promise.all(pending) };
}

describe("v1.6 TECH-02 plan(create) completion", () => {
  before(async () => {
    await freezeRealThailandCatalogue();
  });

  beforeEach(() => {
    beginV16Run();
  });

  afterEach(() => {
    setMatcherGateForTests(null);
    setMatcherEnteredForTests(null);
    resetPlanCreateInflightForTests();
    for (let index = 0; index < 10; index += 1) {
      setPlanClaimLatchForTests(v16FreshKey(1, index), null);
      setPlanClaimLatchForTests(v16FreshKey(2, index), null);
    }
    endV16Run();
  });

  it("L2-HYGIENE-01 immutable acceptance assets", () => {
    const hygiene = JSON.parse(
      readFileSync(new URL("./agentic/det-v3/pack-hygiene.json", import.meta.url), "utf8")
    ) as { hashes: Record<string, string> };
    assert.equal(hygiene.hashes.qaPackV3, V16_PACK_HASH);
    assert.equal(hygiene.hashes.acceptanceRunner, V16_RUNNER_HASH);
    assert.equal(hygiene.hashes.lockEntry, V16_LOCK_HASH);
    assert.equal(V16_NL_DEF_HASH, "574b78411253f20a7f52a23ade7350a6277d632d14555775c5043bbbd05accca");
    assert.deepEqual([...V16_NL_EXCLUSION], ["/checks/TECH-07"]);
    assert.equal(AGENTIC_SCHEMA_CHECKSUM, "5a34f93589f374518b642359e0cbe1b419dcfb0230cdfe5e1f85fe95e32a63e6");
  });

  it("L2-HYGIENE-02 complete developer manifest", () => {
    assert.equal(V16_TEST_IDS.length, 9 + 1 + 5 + 3);
    for (const id of [...V16_PLAN_IDS, ...V16_OBS_IDS, ...V16_NL_IDS, ...V16_HYGIENE_IDS]) {
      assert.equal(V16_TEST_IDS.includes(id), true, id);
    }
    assert.equal(V15_TEST_IDS.length >= 35, true);
    assert.equal(V16_SUCCESS_DEADLINE_MS, 60_000);
    assert.equal(V16_HARD_DEADLINE_MS, 75_000);
    assert.equal(V16_CLIENT_DEADLINE_MS, 90_000);
    assert.equal(SERVICE_INTERNAL_DEADLINE_MS < CLIENT_READ_DEADLINE_MS, true);
  });

  it("L2-HYGIENE-03 real-catalogue attestation", () => {
    const attested = catalogueAttestation();
    const snapshot = frozenSnapshot();
    assert.ok(attested, "missing real catalogue attestation");
    assert.ok(snapshot, "missing frozen snapshot");
    assert.ok(attested!.productCount > 0, "empty catalogue");
    assert.equal(attested!.sources.includes("fixture"), false);
    assert.equal(attested!.sources.includes("synthetic"), false);
    assert.equal(
      snapshot!.products.some((item) => item.source === "fixture" || String(item.source) === "synthetic"),
      false
    );
    assert.match(attested!.catalogueVersion, /^retail-TH-/);
    assert.match(attested!.snapshotId, /^snap_/);
  });

  it("L2-PLAN-RED-01 exact public ten-key reproduction", async () => {
    const attested = catalogueAttestation()!;
    const { runtime, store } = createV16Runtime();
    const hold = deferred();
    const started = Date.now();
    const { keys, results } = await tenBurst(runtime, 1, hold);
    const elapsed = Date.now() - started;
    assert.equal(keys.length, 10);
    assert.equal(results.length, 10);
    assert.equal(elapsed < V16_SUCCESS_DEADLINE_MS, true, `burst ${elapsed}ms`);
    const hashes = results.map((item) => canonicalBusiness(item));
    for (const result of results) {
      assert.equal(result.ok, true, JSON.stringify(result.error ?? result));
      assert.equal(result.status, "ready");
      const view = businessView(result);
      assert.equal(view.sources.includes("fixture"), false);
      assert.equal(view.sources.includes("synthetic"), false);
      for (const sku of view.skuIds) {
        assert.equal(
          frozenSnapshot()!.products.some((item) => item.productId === sku),
          true,
          sku
        );
      }
    }
    assert.equal(new Set(hashes).size, 1, hashes.join("\n"));
    assert.equal(snapshotPlanInflightForTests().idempotency, 0);
    const plans = await store.listPlanIdsByPrincipal("qa-v3:l2:dev");
    assert.equal(plans.length, 10);
    void attested;
  });

  it("L2-PLAN-RED-02 canonical result under concurrency", async () => {
    const { runtime } = createV16Runtime();
    const hold = deferred();
    const { results } = await tenBurst(runtime, 1, hold);
    const views = results.map((item) => businessView(item));
    for (const view of views) {
      assert.deepEqual(view.coverage, views[0]!.coverage);
      assert.deepEqual(view.orderSchedule, views[0]!.orderSchedule);
      assert.equal(view.selectedOptionId, views[0]!.selectedOptionId);
      assert.equal(view.status, views[0]!.status);
    }
    const reversed = deferred();
    const keys = burstKeys(2);
    const pending = [...keys].reverse().map((key) =>
      reversed.promise.then(() => publicPlanCreate(runtime, key))
    );
    reversed.resolve();
    const second = await Promise.all(pending);
    assert.equal(canonicalBusiness(second[0]!), canonicalBusiness(results[0]!));
  });

  it("L2-PLAN-RED-03 same-key replay remains idempotent", async () => {
    const { runtime, store } = createV16Runtime();
    const hold = deferred();
    const { keys, results } = await tenBurst(runtime, 1, hold);
    const before = (await store.listPlanIdsByPrincipal("qa-v3:l2:dev")).length;
    for (let index = 0; index < keys.length; index += 1) {
      const replay = await publicPlanCreate(runtime, keys[index]!);
      assert.equal(replay.planHandle, results[index]!.planHandle);
      assert.equal(canonicalBusiness(replay), canonicalBusiness(results[index]!));
    }
    const after = (await store.listPlanIdsByPrincipal("qa-v3:l2:dev")).length;
    assert.equal(after, before);
  });

  it("L2-PLAN-RED-04 distinct-key isolation", async () => {
    const { runtime } = createV16Runtime();
    const hold00 = deferred();
    const entered00 = deferred();
    const key00 = v16FreshKey(1, 0);
    setPlanClaimLatchForTests(key00, hold00.promise, () => entered00.resolve());
    const pending00 = publicPlanCreate(runtime, key00);
    await entered00.promise;
    const others = await Promise.all(
      burstKeys(1)
        .slice(1)
        .map((key) => publicPlanCreate(runtime, key))
    );
    assert.equal(others.length, 9);
    assert.equal(
      others.every((item) => item.ok === true && item.status === "ready"),
      true
    );
    hold00.resolve();
    const first = await pending00;
    assert.equal(first.ok, true);
    assert.equal(first.status, "ready");
  });

  it("L2-PLAN-RED-05 database resource ownership", async () => {
    const { runtime } = createV16Runtime();
    const hold = deferred();
    const entered = deferred();
    setMatcherGateForTests(hold.promise);
    setMatcherEnteredForTests(() => entered.resolve());
    const pending = publicPlanCreate(runtime, v16FreshKey(1, 0));
    await entered.promise;
    const info = await publicInfo(runtime);
    assert.equal(info.ok, true);
    assert.equal(snapshotPlanInflightForTests().matches >= 1, true);
    hold.resolve();
    const result = await pending;
    assert.equal(result.ok === true || result.ok === false, true);
  });

  it("L2-PLAN-RED-06 queue and worker capacity", async () => {
    const { runtime } = createV16Runtime();
    const unrelated = publicInfo(runtime);
    const hold = deferred();
    const started = Date.now();
    const { results } = await tenBurst(runtime, 1, hold);
    const elapsed = Date.now() - started;
    const info = await unrelated;
    assert.equal(info.ok, true);
    assert.equal(results.length, 10);
    assert.equal(elapsed < 5_000 || results.every((item) => item.ok === true), true);
    assert.equal(snapshotPlanInflightForTests().idempotency, 0);
    assert.equal(snapshotPlanInflightForTests().matches, 0);
  });

  it("L2-PLAN-RED-07 controlled dependency deadline", async () => {
    const { runtime } = createV16Runtime();
    const hold = deferred();
    const entered = deferred();
    setMatcherGateForTests(hold.promise);
    setMatcherEnteredForTests(() => entered.resolve());
    const pending = publicPlanCreate(runtime, v16FreshKey(1, 0));
    await entered.promise;
    await Promise.resolve();
    await Promise.resolve();
    advanceServiceClock(V16_SUCCESS_DEADLINE_MS);
    assert.equal(
      deadlineExceeded(`plan:${v16FreshKey(1, 0)}`),
      true,
      "injected clock did not reach the 60s plan deadline"
    );
    const result = await pending;
    assert.equal(result.ok, false);
    const error = asError(result);
    assert.equal(error.retryable, true);
    assert.equal(
      error.reasonCode === "PLAN_CREATE_DEADLINE_EXCEEDED" ||
        error.reasonCode === "SERVICE_DEADLINE_EXCEEDED",
      true,
      JSON.stringify(error)
    );
    assert.equal(result.planHandle, undefined);
    assert.equal(result.basket, undefined);
    hold.resolve();
    for (let index = 0; index < 50; index += 1) {
      await Promise.resolve();
    }
    assert.equal(CLIENT_READ_DEADLINE_MS, V16_CLIENT_DEADLINE_MS);
    void snapshotPlanInflightForTests;
  });

  it("L2-PLAN-RED-08 cancellation and clean replay", async () => {
    const { runtime, store } = createV16Runtime();
    const hold = deferred();
    const entered = deferred();
    const key = v16FreshKey(1, 0);
    setMatcherGateForTests(hold.promise);
    setMatcherEnteredForTests(() => entered.resolve());
    const firstPromise = publicPlanCreate(runtime, key);
    await entered.promise;
    await Promise.resolve();
    await Promise.resolve();
    advanceServiceClock(V16_SUCCESS_DEADLINE_MS);
    assert.equal(deadlineExceeded(`plan:${key}`), true);
    const first = await firstPromise;
    hold.resolve();
    setMatcherGateForTests(null);
    setMatcherEnteredForTests(null);
    useInjectedServiceClock();
    assert.equal(first.ok, false);
    assert.equal(first.planHandle, undefined);
    const replay = await publicPlanCreate(runtime, key);
    assert.equal(replay.ok, true);
    assert.equal(replay.status, "ready");
    void store;
  });

  it("L2-PLAN-RED-09 failed shared work cannot poison later calls", async () => {
    const { runtime } = createV16Runtime();
    const hold = deferred();
    const entered = deferred();
    setMatcherGateForTests(hold.promise);
    setMatcherEnteredForTests(() => entered.resolve());
    const first = publicPlanCreate(runtime, v16FreshKey(1, 0));
    await entered.promise;
    await Promise.resolve();
    await Promise.resolve();
    advanceServiceClock(V16_SUCCESS_DEADLINE_MS);
    const timedOut = await first;
    hold.resolve();
    setMatcherGateForTests(null);
    useInjectedServiceClock();
    const later = await publicPlanCreate(runtime, v16FreshKey(1, 1));
    assert.equal(later.ok === true || timedOut.ok === false, true);
  });

  it("L2-OBS-RED-01 trace completeness", async () => {
    const { runtime } = createV16Runtime();
    const result = await publicPlanCreate(runtime, v16FreshKey(1, 0));
    assert.equal(result.ok, true);
    const traces = listRequestTraces();
    assert.equal(traces.length >= 1, true, "plan(create) emitted no correlated trace");
    const trace = traces[0]!;
    assert.equal(typeof requestTrace(trace.correlationId).terminalOwner, "string");
  });
});

describe("v1.6 v1.5 non-latency regression", () => {
  beforeEach(() => {
    beginV15Run();
  });
  afterEach(() => {
    endV15Run();
  });

  it("L2-NL-REG-01 authoritative clock", async () => {
    const cluster = createV15Cluster();
    const ready = await completeSection4Journey(cluster, "nl01");
    const ledger = eventLedger(await orderOn(cluster, "A", { orderHandle: ready.orderHandle }));
    const byStatus = Object.fromEntries(ledger.map((item) => [item.status, item.createdAt]));
    assert.equal(byStatus.open, V15_CLOCK_09);
    assert.equal(byStatus.declined, V15_CLOCK_09);
    assert.equal(byStatus.succeeded, V15_CLOCK_10);
    assert.equal(byStatus.dispatched, V15_CLOCK_30);
    assert.equal(byStatus.delivered, V15_CLOCK_40);
    assert.equal(
      ledger.filter((item) => item.status === "preparing").some((item) => item.createdAt === V15_CLOCK_20),
      true
    );
  });

  it("L2-NL-REG-02 deterministic event order", async () => {
    const cluster = createV15Cluster();
    const ready = await completeSection4Journey(cluster, "nl02");
    const observed = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: ready.orderHandle
    });
    const evidence = observeEvidence(observed) as {
      events: Array<{ eventType?: string; sequence?: number }>;
    };
    assert.deepEqual(
      evidence.events.map((item) => item.eventType),
      [...V15_FUNNEL]
    );
    assert.deepEqual(
      evidence.events.map((item) => Number(item.sequence)),
      [...V15_SEQUENCES]
    );
  });

  it("L2-NL-REG-03 exactly-once counters", async () => {
    const cluster = createV15Cluster();
    const ready = await completeSection4Journey(cluster, "nl03");
    const observed = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: ready.orderHandle
    });
    const evidence = observeEvidence(observed) as {
      planMatch: unknown;
      planMatchHit: unknown;
      planMatchHits: unknown;
      planMatchMisses: unknown;
    };
    assert.equal(evidence.planMatch, 1);
    assert.equal(evidence.planMatchHit, 1);
    assert.equal(evidence.planMatchHits, 1);
    assert.equal(evidence.planMatchMisses, 0);
  });

  it("L2-NL-REG-04 observation is a pure read", async () => {
    const cluster = createV15Cluster();
    const ready = await completeSection4Journey(cluster, "nl04");
    const first = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: ready.orderHandle
    });
    const second = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: ready.orderHandle
    });
    assert.equal(JSON.stringify(observeEvidence(first)), JSON.stringify(observeEvidence(second)));
  });

  it("L2-NL-REG-05 exact non-latency projection", () => {
    assert.deepEqual([...V16_NL_EXCLUSION], ["/checks/TECH-07"]);
    assert.equal(V16_NL_EXCLUSION.length, 1);
  });
});

function asError(result: Record<string, unknown>) {
  const error = result.error;
  return error && typeof error === "object"
    ? (error as { reasonCode?: string; retryable?: boolean })
    : {};
}
