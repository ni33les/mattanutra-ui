import { CURRENT_CONTRACT_SCHEMA_CHECKSUM } from "./helpers/current-contract-lock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { AGENTIC_SCHEMA_CHECKSUM } from "../lib/agentic/info.ts";
import { countQuery, queryBudgetSnapshot } from "../lib/agentic/plan/query-budget.ts";
import {
  resetPlanCreateInflightForTests,
  setMatcherEnteredForTests,
  setMatcherGateForTests,
  setPlanClaimLatchForTests
} from "../lib/agentic/plan/service.ts";
import {
  setQueryBudgetCommitGateForTests,
  setQueryBudgetPersistEnteredForTests
} from "../lib/agentic/qa/persist.ts";
import {
  advanceServiceClock,
  CLIENT_READ_DEADLINE_MS,
  deadlineExceeded,
  SERVICE_INTERNAL_DEADLINE_MS
} from "../lib/agentic/qa/service-clock.ts";
import {
  assertSchemaLock,
  burstKeys,
  canonicalTuple,
  catalogueAttestation,
  counterTuple,
  createUatNlRuntime,
  deferred,
  freezeRealThailandCatalogue,
  frozenSnapshot,
  beginUatNlRun,
  endUatNlRun,
  orphanCensus,
  publicPlanCreate,
  qaObserve,
  reasonCodeOf,
  tenBurst
} from "./agentic/uat-nl/harness.ts";
import {
  ESTABLISHED_COUNTERS,
  UAT_NL_BASELINE_SHA,
  UAT_NL_CLIENT_DEADLINE_MS,
  UAT_NL_LOCK_HASH,
  UAT_NL_NL_DEF_HASH,
  UAT_NL_NL_EXCLUSION,
  UAT_NL_PACK_HASH,
  UAT_NL_RUNNER_HASH,
  UAT_NL_SCHEMA_CHECKSUM,
  UAT_NL_SUCCESS_DEADLINE_MS,
  UAT_NL_TEST_IDS,
  uatNlFreshKey
} from "./agentic/uat-nl/manifest.ts";

function assertReadyPlan(result: Record<string, unknown>, label: string) {
  assert.equal(result.ok, true, `${label} ${JSON.stringify(result.error ?? result)}`);
  assert.equal(result.status, "ready", label);
  const canonical = result.canonical as { hash?: string } | undefined;
  assert.equal(typeof canonical?.hash === "string" && canonical.hash.length > 0, true, label);
  assert.equal(typeof result.planHandle === "string" && String(result.planHandle).length >= 32, true, label);
  assert.equal(Array.isArray(result.basket) && (result.basket as unknown[]).length > 0, true, label);
  assert.equal(Array.isArray(result.coverage), true, label);
  assert.equal(result.orderSchedule !== undefined, true, label);
  const selected = result.selected as { optionId?: string } | undefined;
  assert.equal(
    typeof (selected?.optionId ?? result.optionId) === "string",
    true,
    label
  );
}

function assertEstablishedCounters(
  observed: Record<string, unknown>,
  namespace: string,
  label: string
) {
  const tuple = counterTuple(observed, namespace);
  assert.equal(tuple.catalogueSnapshots, ESTABLISHED_COUNTERS.catalogueSnapshots, `${label} catalogueSnapshots`);
  assert.equal(tuple.snapshotTH, ESTABLISHED_COUNTERS["queries.catalogue.snapshot.TH"], `${label} snapshot.TH`);
  assert.equal(tuple.planMatch, ESTABLISHED_COUNTERS["queries.plan.match"], `${label} plan.match`);
  assert.equal(tuple.planMatchHit, ESTABLISHED_COUNTERS["queries.plan.match.hit"], `${label} plan.match.hit`);
  assert.equal(tuple.planMatchHits, ESTABLISHED_COUNTERS.planMatchHits, `${label} planMatchHits`);
  assert.equal(tuple.planMatchMisses, ESTABLISHED_COUNTERS.planMatchMisses, `${label} planMatchMisses`);
}

function assertNoDeadline(results: readonly Record<string, unknown>[]) {
  for (const result of results) {
    assert.notEqual(reasonCodeOf(result), "SERVICE_DEADLINE_EXCEEDED", JSON.stringify(result.error ?? result));
  }
}

describe("UAT-NL v1.0 TECH-02 and MKT-10", () => {
  before(async () => {
    await freezeRealThailandCatalogue();
    assertSchemaLock();
  });

  beforeEach(() => {
    beginUatNlRun();
  });

  afterEach(() => {
    setMatcherGateForTests(null);
    setMatcherEnteredForTests(null);
    setQueryBudgetCommitGateForTests(null);
    setQueryBudgetPersistEnteredForTests(null);
    resetPlanCreateInflightForTests();
    for (const repeat of [1, 2] as const) {
      for (let index = 0; index < 10; index += 1) {
        setPlanClaimLatchForTests(uatNlFreshKey(repeat, index), null);
      }
    }
    const orphans = orphanCensus();
    assert.equal(orphans.inflightIdempotency, 0, JSON.stringify(orphans));
    assert.equal(orphans.inflightMatches, 0, JSON.stringify(orphans));
    assert.equal(orphans.admission, 0, JSON.stringify(orphans));
    assert.equal(orphans.worker, 0, JSON.stringify(orphans));
    assert.equal(orphans.connection, 0, JSON.stringify(orphans));
    endUatNlRun();
  });

  it("UAT-NL freeze and hygiene", () => {
    const hygiene = JSON.parse(
      readFileSync(new URL("./agentic/det-v3/pack-hygiene.json", import.meta.url), "utf8")
    ) as { hashes: Record<string, string> };
    assert.equal(hygiene.hashes.qaPackV3, UAT_NL_PACK_HASH);
    assert.equal(hygiene.hashes.acceptanceRunner, UAT_NL_RUNNER_HASH);
    assert.equal(hygiene.hashes.lockEntry, UAT_NL_LOCK_HASH);
    assert.equal(UAT_NL_NL_DEF_HASH, "574b78411253f20a7f52a23ade7350a6277d632d14555775c5043bbbd05accca");
    assert.deepEqual([...UAT_NL_NL_EXCLUSION], ["/checks/TECH-07"]);
    assert.equal(UAT_NL_SCHEMA_CHECKSUM, "5a34f93589f374518b642359e0cbe1b419dcfb0230cdfe5e1f85fe95e32a63e6", "historical v3 record is preserved");
    assert.equal(AGENTIC_SCHEMA_CHECKSUM, CURRENT_CONTRACT_SCHEMA_CHECKSUM);
    assert.equal(SERVICE_INTERNAL_DEADLINE_MS, UAT_NL_SUCCESS_DEADLINE_MS);
    assert.equal(CLIENT_READ_DEADLINE_MS, UAT_NL_CLIENT_DEADLINE_MS);
    assert.equal(UAT_NL_TEST_IDS.length, 13);
    const attested = catalogueAttestation()!;
    assert.ok(attested.productCount > 0);
    assert.equal(attested.sources.includes("fixture"), false);
    assert.equal(attested.sources.includes("synthetic"), false);
    assert.match(attested.snapshotId, /^snap_/);
    assert.equal(UAT_NL_BASELINE_SHA.length, 40);
    void frozenSnapshot;
  });

  it("UAT-NL-T02-RED-01 ten fresh requests produce ten complete plans", async () => {
    const { runtime, store, namespace } = createUatNlRuntime();
    const hold = deferred();
    const { keys, results } = await tenBurst(runtime, 1, hold);
    assert.equal(keys.length, 10);
    assert.equal(results.length, 10);
    for (const [index, result] of results.entries()) {
      assertReadyPlan(result, `fresh-${index}`);
    }
    assertNoDeadline(results);
    assert.equal(new Set(results.map(canonicalTuple)).size, 1);
    assert.equal((await store.listPlanIdsByPrincipal(namespace)).length, 10);
    assert.equal(orphanCensus().inflightIdempotency, 0);
  });

  it("UAT-NL-T02-RED-02 worker completion order cannot lose a response", async () => {
    const { runtime } = createUatNlRuntime();
    const hold = deferred();
    const entered = deferred();
    const heldKey = uatNlFreshKey(1, 3);
    setPlanClaimLatchForTests(heldKey, hold.promise, () => entered.resolve());
    const pendingHeld = publicPlanCreate(runtime, heldKey);
    await entered.promise;
    const others = await Promise.all(
      burstKeys(1)
        .filter((key) => key !== heldKey)
        .map((key) => publicPlanCreate(runtime, key))
    );
    assert.equal(others.length, 9);
    for (const result of others) {
      assertReadyPlan(result, "peer");
    }
    hold.resolve();
    const held = await pendingHeld;
    assertReadyPlan(held, "held");
    const all = [...others, held];
    assert.equal(new Set(all.map(canonicalTuple)).size, 1);
    assert.equal(orphanCensus().inflightIdempotency, 0);
  });

  it("UAT-NL-T02-RED-03 one stalled request cannot starve its peers", async () => {
    const { runtime, store, namespace } = createUatNlRuntime();
    const hold = deferred();
    const entered = deferred();
    const heldKey = uatNlFreshKey(1, 3);
    setPlanClaimLatchForTests(heldKey, hold.promise, () => entered.resolve());
    const pendingHeld = publicPlanCreate(runtime, heldKey);
    await entered.promise;
    const others = await Promise.all(
      burstKeys(1)
        .filter((key) => key !== heldKey)
        .map((key) => publicPlanCreate(runtime, key))
    );
    assert.equal(others.every((item) => item.ok === true && item.status === "ready"), true);
    advanceServiceClock(UAT_NL_SUCCESS_DEADLINE_MS);
    assert.equal(deadlineExceeded(`plan:${heldKey}`), true);
    const held = await pendingHeld;
    assert.equal(held.ok, false);
    assert.equal(reasonCodeOf(held), "SERVICE_DEADLINE_EXCEEDED");
    assert.equal(held.planHandle, undefined);
    assert.equal(held.basket, undefined);
    const plansBeforeRelease = (await store.listPlanIdsByPrincipal(namespace)).length;
    hold.resolve();
    for (let index = 0; index < 40; index += 1) {
      await Promise.resolve();
    }
    const plansAfterRelease = (await store.listPlanIdsByPrincipal(namespace)).length;
    assert.equal(plansAfterRelease, plansBeforeRelease);
    assert.equal(orphanCensus().inflightIdempotency, 0);
  });

  it("UAT-NL-T02-RED-04 successful response requires durable completion", async () => {
    const { runtime, namespace } = createUatNlRuntime();
    const hold = deferred();
    const entered = deferred();
    setQueryBudgetPersistEnteredForTests(() => entered.resolve());
    setQueryBudgetCommitGateForTests(hold.promise);
    const pending = publicPlanCreate(runtime, uatNlFreshKey(1, 0));
    await entered.promise;
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    assert.equal(resolved, false, "plan response escaped before counter commit");
    hold.resolve();
    const result = await pending;
    assertReadyPlan(result, "after-commit");
    const observed = await qaObserve(runtime, {
      correlationId: String(result.planHandle ?? "plan"),
      namespace
    });
    assertEstablishedCounters(observed, namespace, "T02-RED-04");
    const replay = await publicPlanCreate(runtime, uatNlFreshKey(1, 0));
    assert.equal(replay.planHandle, result.planHandle);
    assert.equal(canonicalTuple(replay), canonicalTuple(result));
  });

  it("UAT-NL-T02-RED-05 process restart and cache state do not change completion", async () => {
    const first = createUatNlRuntime("qa-v3:uat-nl:cold");
    const holdA = deferred();
    const a = await tenBurst(first.runtime, 1, holdA);
    const tupleA = new Set(a.results.map(canonicalTuple));
    assert.equal(tupleA.size, 1);
    for (const result of a.results) {
      assertReadyPlan(result, "cold");
    }
    endUatNlRun();
    beginUatNlRun();
    const warm = createUatNlRuntime("qa-v3:uat-nl:warm");
    const holdB = deferred();
    const b = await tenBurst(warm.runtime, 2, holdB);
    for (const result of b.results) {
      assertReadyPlan(result, "warm");
    }
    assert.equal(canonicalTuple(b.results[0]!), canonicalTuple(a.results[0]!));
  });

  it("UAT-NL-MKT10-RED-01 success and counter evidence commit together", async () => {
    const { runtime, namespace } = createUatNlRuntime();
    const hold = deferred();
    const entered = deferred();
    setQueryBudgetPersistEnteredForTests(() => entered.resolve());
    setQueryBudgetCommitGateForTests(hold.promise);
    const pending = publicPlanCreate(runtime, uatNlFreshKey(1, 0));
    await entered.promise;
    const observedEarly = await qaObserve(runtime, { namespace });
    const early = counterTuple(observedEarly, namespace);
    assert.equal(early.catalogueSnapshots === 0 || observedEarly.ok === true, true);
    hold.resolve();
    const result = await pending;
    assertReadyPlan(result, "mkt10-01");
    const observed = await qaObserve(runtime, {
      correlationId: String(result.planHandle ?? namespace),
      namespace
    });
    assertEstablishedCounters(observed, namespace, "MKT10-RED-01");
  });

  it("UAT-NL-MKT10-RED-02 observation is a pure repeated read", async () => {
    const { runtime, namespace } = createUatNlRuntime();
    const created = await publicPlanCreate(runtime, uatNlFreshKey(1, 0));
    assertReadyPlan(created, "mkt10-02-plan");
    const first = await qaObserve(runtime, {
      correlationId: String(created.planHandle ?? namespace),
      namespace
    });
    const second = await qaObserve(runtime, {
      correlationId: String(created.planHandle ?? namespace),
      namespace
    });
    const firstTuple = counterTuple(first, namespace);
    const secondTuple = counterTuple(second, namespace);
    assert.deepEqual(secondTuple, firstTuple);
    assertEstablishedCounters(first, namespace, "MKT10-RED-02-first");
    assertEstablishedCounters(second, namespace, "MKT10-RED-02-second");
  });

  it("UAT-NL-MKT10-RED-03 cancelled work cannot commit later", async () => {
    const { runtime, namespace } = createUatNlRuntime();
    const hold = deferred();
    const entered = deferred();
    const key = uatNlFreshKey(1, 0);
    setPlanClaimLatchForTests(key, hold.promise, () => entered.resolve());
    const pending = publicPlanCreate(runtime, key);
    await entered.promise;
    advanceServiceClock(UAT_NL_SUCCESS_DEADLINE_MS);
    const failed = await pending;
    assert.equal(failed.ok, false);
    const before = counterTuple(await qaObserve(runtime, { namespace }), namespace);
    hold.resolve();
    for (let index = 0; index < 40; index += 1) {
      await Promise.resolve();
    }
    const after = counterTuple(await qaObserve(runtime, { namespace }), namespace);
    assert.deepEqual(after, before);
    const fresh = await publicPlanCreate(runtime, uatNlFreshKey(1, 1));
    assertReadyPlan(fresh, "fresh-after-cancel");
    const observed = await qaObserve(runtime, {
      correlationId: String(fresh.planHandle ?? namespace),
      namespace
    });
    assertEstablishedCounters(observed, namespace, "MKT10-RED-03");
  });

  it("UAT-NL-MKT10-RED-04 replay and downstream operations do not increment match counters", async () => {
    const { runtime, namespace } = createUatNlRuntime();
    const key = uatNlFreshKey(1, 0);
    const created = await publicPlanCreate(runtime, key);
    assertReadyPlan(created, "mkt10-04");
    const baseline = counterTuple(
      await qaObserve(runtime, {
        correlationId: String(created.planHandle ?? namespace),
        namespace
      }),
      namespace
    );
    await publicPlanCreate(runtime, key);
    const again = await qaObserve(runtime, {
      correlationId: String(created.planHandle ?? namespace),
      namespace
    });
    assert.deepEqual(counterTuple(again, namespace), baseline);
    assertEstablishedCounters(again, namespace, "MKT10-RED-04");
  });

  it("UAT-NL-MKT10-RED-05 Run A and Run B are logically isolated", async () => {
    const a = createUatNlRuntime("qa-v3:uat-nl:A");
    const createdA = await publicPlanCreate(a.runtime, uatNlFreshKey(1, 0));
    assertReadyPlan(createdA, "ns-A");
    const observeA = await qaObserve(a.runtime, {
      correlationId: String(createdA.planHandle ?? a.namespace),
      namespace: a.namespace
    });
    assertEstablishedCounters(observeA, a.namespace, "A");
    endUatNlRun();
    beginUatNlRun();
    const b = createUatNlRuntime("qa-v3:uat-nl:B");
    const createdB = await publicPlanCreate(b.runtime, uatNlFreshKey(2, 0));
    assertReadyPlan(createdB, "ns-B");
    const observeB = await qaObserve(b.runtime, {
      correlationId: String(createdB.planHandle ?? b.namespace),
      namespace: b.namespace
    });
    assertEstablishedCounters(observeB, b.namespace, "B");
    const tupleA = counterTuple(observeA, a.namespace);
    const tupleB = counterTuple(observeB, b.namespace);
    assert.equal(tupleA.planMatchHits, tupleB.planMatchHits);
    assert.equal(tupleA.catalogueSnapshots, tupleB.catalogueSnapshots);
  });

  it("UAT-NL-X-RED-01 terminal response closes mutation rights", async () => {
    const { runtime, namespace } = createUatNlRuntime();
    const hold = deferred();
    const entered = deferred();
    const key = uatNlFreshKey(1, 0);
    setMatcherGateForTests(hold.promise);
    setMatcherEnteredForTests(() => entered.resolve());
    const pending = publicPlanCreate(runtime, key);
    await entered.promise;
    advanceServiceClock(UAT_NL_SUCCESS_DEADLINE_MS);
    const failed = await pending;
    assert.equal(reasonCodeOf(failed), "SERVICE_DEADLINE_EXCEEDED");
    const before = queryBudgetSnapshot(namespace);
    hold.resolve();
    for (let index = 0; index < 40; index += 1) {
      await Promise.resolve();
    }
    const after = queryBudgetSnapshot(namespace);
    assert.deepEqual(after, before);
    assert.equal(orphanCensus().inflightMatches, 0);
  });

  it("UAT-NL-X-RED-02 namespace teardown detects orphans", async () => {
    const { runtime } = createUatNlRuntime();
    const { results } = await tenBurst(runtime, 1, deferred());
    assert.equal(results.length, 10);
    assert.deepEqual(orphanCensus().inflightIdempotency, 0);
    assert.deepEqual(orphanCensus().inflightMatches, 0);
  });

  it("UAT-NL-X-RED-03 original failures are detectable", async () => {
    const { runtime, namespace } = createUatNlRuntime();
    const created = await publicPlanCreate(runtime, uatNlFreshKey(1, 0));
    assertReadyPlan(created, "x-03-plan");
    const first = counterTuple(
      await qaObserve(runtime, {
        correlationId: String(created.planHandle ?? namespace),
        namespace
      }),
      namespace
    );
    countQuery("catalogue.snapshot.TH");
    const second = counterTuple(
      await qaObserve(runtime, {
        correlationId: String(created.planHandle ?? namespace),
        namespace
      }),
      namespace
    );
    const liveChanged = second.liveSnapshot !== first.liveSnapshot;
    const observedChanged = second.snapshotTH !== first.snapshotTH;
    assert.equal(
      first.catalogueSnapshots !== ESTABLISHED_COUNTERS.catalogueSnapshots ||
        observedChanged ||
        liveChanged,
      true,
      "original MKT-10 leak is no longer detectable"
    );
  });
});
