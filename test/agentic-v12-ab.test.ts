import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  asRecord,
  beginNamespace,
  beginV12Run,
  canonicalHash,
  canonicalJson,
  contributionOf,
  createHandlerCluster,
  endV12Run,
  executeOn,
  expectedContribution,
  firstDiff,
  funnelView,
  observationEvidence,
  observeOn,
  payAndDeliver,
  planOn,
  setChannelOn,
  setClockOn,
  stripOpaque,
  warmMatchCache,
  type HandlerCluster,
  type HandlerId
} from "./agentic/v12/harness.ts";
import {
  V12_ACQUISITION,
  V12_CLOCK_00,
  V12_CLOCK_09,
  V12_CLOCK_40,
  V12_FEE,
  V12_FUNNEL,
  V12_SEQUENCES,
  V12_SUBSIDY
} from "./agentic/v12/manifest.ts";

type Schedule = "S1" | "S2" | "S3" | "S4" | "S5";

function workersFor(schedule: Schedule): {
  delivered: HandlerId;
  decline: HandlerId;
  dispatched: HandlerId;
  execute: HandlerId;
  observe: HandlerId;
  plan: HandlerId;
  setup: HandlerId;
  stale: HandlerId | null;
  success: HandlerId;
} {
  if (schedule === "S1") {
    return {
      delivered: "A",
      decline: "A",
      dispatched: "A",
      execute: "A",
      observe: "A",
      plan: "A",
      setup: "A",
      stale: null,
      success: "A"
    };
  }
  if (schedule === "S2") {
    return {
      delivered: "A",
      decline: "B",
      dispatched: "C",
      execute: "C",
      observe: "A",
      plan: "B",
      setup: "A",
      stale: null,
      success: "A"
    };
  }
  if (schedule === "S3") {
    return {
      delivered: "C",
      decline: "B",
      dispatched: "A",
      execute: "B",
      observe: "C",
      plan: "B",
      setup: "A",
      stale: "B",
      success: "C"
    };
  }
  if (schedule === "S4") {
    return {
      delivered: "A",
      decline: "A",
      dispatched: "B",
      execute: "C",
      observe: "A",
      plan: "B",
      setup: "A",
      stale: null,
      success: "B"
    };
  }
  return {
    delivered: "C",
    decline: "A",
    dispatched: "B",
    execute: "B",
    observe: "C",
    plan: "A",
    setup: "C",
    stale: null,
    success: "C"
  };
}

async function runSchedule(schedule: Schedule, suffix: string) {
  const cluster = createHandlerCluster();
  const route = workersFor(schedule);
  const begun = await beginNamespace(cluster, route.setup, schedule);
  await setClockOn(cluster, route.setup, begun.namespace, V12_CLOCK_09);
  if (route.stale) {
    await cluster.primeFromDurable(route.stale, begun.namespace);
  }
  await setChannelOn(cluster, route.setup, begun.namespace, V12_ACQUISITION);
  if (route.plan !== route.setup) {
    await cluster.primeFromDurable(route.plan, begun.namespace);
  }
  if (route.execute !== route.setup && route.execute !== route.plan && route.execute !== route.stale) {
    await cluster.primeFromDurable(route.execute, begun.namespace);
  }
  await warmMatchCache(cluster, route.plan, `${suffix}-warm`);
  const plan = await planOn(cluster, route.plan, { ...begun, suffix });
  assert.equal(plan.status, "ready", canonicalJson(plan));
  if (schedule === "S4") {
    cluster.restartHandler("C");
  }
  const executed = await executeOn(cluster, route.execute, {
    namespace: begun.namespace,
    planHandle: String(plan.planHandle),
    principal: begun.principal,
    revision: Number(plan.revision),
    suffix
  });
  const frozen = contributionOf(executed);
  await payAndDeliver(cluster, {
    namespace: begun.namespace,
    orderHandle: String(executed.orderHandle),
    decline: route.decline,
    success: route.success,
    dispatched: route.dispatched,
    delivered: route.delivered
  });
  await setClockOn(cluster, route.setup, begun.namespace, V12_CLOCK_40);
  if (schedule === "S4") {
    cluster.restartHandler("A");
  }
  const first = await observeOn(cluster, route.observe, {
    namespace: begun.namespace,
    orderHandle: String(executed.orderHandle)
  });
  const second = await observeOn(cluster, route.observe, {
    namespace: begun.namespace,
    orderHandle: String(executed.orderHandle)
  });
  return {
    cluster,
    executed,
    first,
    frozen,
    second,
    namespace: begun.namespace
  };
}

function scheduleEvidence(result: Awaited<ReturnType<typeof runSchedule>>) {
  const events = (result.first.events as Array<{ eventType: string; sequence: number }>) ?? [];
  const evidence = observationEvidence(result.first);
  const contribution = asRecord(result.first.contribution);
  return stripOpaque({
    acquisitionExecute: result.frozen.acquisitionMinor,
    acquisitionObserve: result.first.acquisitionMinor,
    clock: result.first.clock,
    contribution: result.first.contributionMinor,
    fee: contribution.paymentFeeMinor ?? result.first.paymentFeeMinor,
    funnel: funnelView(events),
    payment: result.first.paymentMinor,
    planMatch: evidence.planMatch,
    planMatchHit: evidence.planMatchHit,
    planMatchHits: evidence.planMatchHits,
    product: result.first.productCostMinor,
    subsidy: contribution.shippingSubsidyMinor ?? result.first.shippingSubsidyMinor
  });
}

function assertScheduleContract(result: Awaited<ReturnType<typeof runSchedule>>, schedule: Schedule) {
  const events = (result.first.events as Array<{ eventType: string; sequence: number }>) ?? [];
  const evidence = observationEvidence(result.first);
  const secondEvidence = observationEvidence(result.second);
  assert.equal(result.frozen.acquisitionMinor, V12_ACQUISITION, `${schedule} execute acquisition`);
  assert.equal(result.first.acquisitionMinor, V12_ACQUISITION, `${schedule} observe acquisition`);
  assert.equal(result.first.paymentFeeMinor ?? asRecord(result.first.contribution).paymentFeeMinor, V12_FEE);
  assert.equal(
    result.first.shippingSubsidyMinor ?? asRecord(result.first.contribution).shippingSubsidyMinor,
    V12_SUBSIDY
  );
  assert.equal(
    result.first.contributionMinor,
    expectedContribution({
      paymentMinor: Number(result.first.paymentMinor),
      productCostMinor: Number(result.first.productCostMinor)
    }),
    `${schedule} contribution`
  );
  assert.deepEqual(funnelView(events).types, [...V12_FUNNEL], `${schedule} funnel types`);
  assert.deepEqual(funnelView(events).sequences, [...V12_SEQUENCES], `${schedule} funnel sequences`);
  assert.equal(canonicalJson(result.first), canonicalJson(result.second), `${schedule} observe bytes`);
  assert.equal(evidence.planMatch, 1, `${schedule} plan.match`);
  assert.equal(evidence.planMatchHit, 1, `${schedule} plan.match.hit`);
  assert.equal(evidence.planMatchHits, 1, `${schedule} planMatchHits`);
  assert.equal(secondEvidence.planMatchHits, 1);
  assert.equal(result.first.clock, V12_CLOCK_40, `${schedule} clock`);
  assert.notEqual(result.first.clock, V12_CLOCK_00, `${schedule} clock must not be 00:00`);
}

describe("v1.2 joined deterministic developer matrix", () => {
  beforeEach(() => {
    beginV12Run();
  });
  afterEach(() => {
    endV12Run();
  });

  it("AB-DET-01..08 five schedules twice yield one hash and zero diff paths", async () => {
    const schedules: Schedule[] = ["S1", "S2", "S3", "S4", "S5"];
    const firstPass = [];
    for (const schedule of schedules) {
      const result = await runSchedule(schedule, `${schedule}-1`);
      assertScheduleContract(result, schedule);
      firstPass.push(scheduleEvidence(result));
    }
    const firstHashes = firstPass.map((item) => canonicalHash(item));
    assert.equal(new Set(firstHashes).size, 1, canonicalJson(firstDiff(firstPass[0], firstPass[1])));

    const secondPass = [];
    for (const schedule of schedules) {
      const result = await runSchedule(schedule, `${schedule}-2`);
      assertScheduleContract(result, schedule);
      secondPass.push(scheduleEvidence(result));
    }
    const secondHashes = secondPass.map((item) => canonicalHash(item));
    assert.equal(new Set(secondHashes).size, 1);
    assert.equal(firstHashes[0], secondHashes[0]);
    const diff = firstDiff(
      { pass: firstPass, hashes: firstHashes },
      { pass: secondPass, hashes: secondHashes }
    );
    assert.equal(diff, null, canonicalJson(diff));
    void createHandlerCluster;
  });
});
