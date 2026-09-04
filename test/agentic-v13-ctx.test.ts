import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { hashCapability, resolveCapability } from "../lib/agentic/capabilities.ts";
import {
  committedNamespaceOf,
  deletePersistedQaNamespace
} from "../lib/agentic/qa/persist.ts";
import { listCommittedFunnelEvents } from "../lib/agentic/funnel/ledger.ts";
import {
  asRecord,
  beginV13Run,
  canonicalHash,
  canonicalJson,
  contributionOf,
  createHandlerCluster,
  endV13Run,
  executeOn,
  expectedContribution,
  firstDiff,
  observeOn,
  orderOn,
  payAndDeliver,
  setupDefaultExecuteContext,
  stripOpaque,
  type HandlerCluster,
  type HandlerId
} from "./agentic/v13/harness.ts";
import {
  V13_ACQUISITION,
  V13_CLOCK_00,
  V13_EXPIRY_00_15,
  V13_EXPIRY_09_15,
  V13_FEE,
  V13_SUBSIDY
} from "./agentic/v13/manifest.ts";

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
      now: runtime.now ?? V13_CLOCK_00,
      resourceType: "plan",
      scope: { ...runtime.scope, principalScope: input.namespace },
      store: runtime.store
    });
    return capability?.resourceId ?? "";
  });
}

describe("v1.3 CTX execute uses committed namespace not replica defaults", () => {
  beforeEach(() => {
    beginV13Run();
  });
  afterEach(() => {
    endV13Run();
  });

  it("CTX-RED-01 execute on B primed with beginRun defaults freezes 09:15 and acquisition 1000", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ctx01" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx01" });
    const got = contributionOf(executed);
    assert.equal(executed.ok, true, canonicalJson(executed));
    assert.equal(got.checkoutExpiresAt, V13_EXPIRY_09_15);
    assert.equal(got.acquisitionMinor, V13_ACQUISITION);
    assert.notEqual(got.checkoutExpiresAt, V13_EXPIRY_00_15);
    assert.notEqual(got.acquisitionMinor, 0);
  });

  it("CTX-RED-02 order read on D with empty cache keeps attribution acquisition and namespace", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ctx02" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx02" });
    cluster.clearHandler("D");
    const order = await orderOn(cluster, "D", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle),
      principal: ready.principal
    });
    assert.equal(order.acquisitionMinor, V13_ACQUISITION);
    assert.equal(order.attribution, "agent_connector");
    const orderId = await cluster.asHandler("D", async (runtime) => {
      const record = await runtime.store.getCapabilityByHash(
        hashCapability(runtime.config.capabilitySecret, String(executed.orderHandle))
      );
      return record?.resourceId ?? "";
    });
    const stored = await cluster.store.getOrder(orderId);
    assert.equal(stored?.principalScope, ready.namespace);
  });

  it("CTX-RED-03 paid contribution uses acquisition 1000 and the frozen payment/product inputs", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ctx03" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx03" });
    const frozen = contributionOf(executed);
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const observed = await observeOn(cluster, "A", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    assert.equal(frozen.acquisitionMinor, V13_ACQUISITION);
    assert.equal(observed.acquisitionMinor, V13_ACQUISITION);
    assert.equal(observed.paymentFeeMinor ?? asRecord(observed.contribution).paymentFeeMinor, V13_FEE);
    assert.equal(
      observed.shippingSubsidyMinor ?? asRecord(observed.contribution).shippingSubsidyMinor,
      V13_SUBSIDY
    );
    assert.equal(
      observed.contributionMinor,
      expectedContribution({
        paymentMinor: Number(frozen.paymentMinor),
        productCostMinor: Number(frozen.productCostMinor),
        acquisitionMinor: V13_ACQUISITION
      })
    );
  });

  it("CTX-RED-04 restart of plan and execute workers cannot change frozen context", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ctx04" });
    cluster.restartHandler("C");
    cluster.restartHandler("B");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx04" });
    const got = contributionOf(executed);
    assert.equal(executed.ok, true, canonicalJson(executed));
    assert.equal(got.checkoutExpiresAt, V13_EXPIRY_09_15);
    assert.equal(got.acquisitionMinor, V13_ACQUISITION);
  });

  it("CTX-RED-05 stale replica version cannot win over committed 09:00/1000", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ctx05" });
    const committed = committedNamespaceOf(ready.namespace);
    assert.equal(committed?.now, "2026-09-02T09:00:00.000Z");
    assert.equal(committed?.acquisitionMinor, V13_ACQUISITION);
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx05" });
    const got = contributionOf(executed);
    const stale = got.checkoutExpiresAt === V13_EXPIRY_00_15 || got.acquisitionMinor === 0;
    assert.equal(stale, false, canonicalJson({ got, committed }));
    if (executed.ok === false) {
      assert.equal(asRecord(executed.error).reasonCode, "revision_conflict");
      return;
    }
    assert.equal(got.checkoutExpiresAt, V13_EXPIRY_09_15);
    assert.equal(got.acquisitionMinor, V13_ACQUISITION);
  });

  it("CTX-RED-06 missing plan-to-namespace association fails closed with no writes", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupDefaultExecuteContext(cluster, { suffix: "ctx06" });
    const planId = await planIdOf(cluster, "A", {
      handle: ready.planHandle,
      namespace: ready.namespace
    });
    const before = listCommittedFunnelEvents(planId).length;
    await deletePersistedQaNamespace(ready.namespace);
    cluster.clearHandler("A");
    cluster.clearHandler("B");
    cluster.clearHandler("C");
    cluster.clearHandler("D");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx06" });
    assert.equal(executed.ok, false, canonicalJson(executed));
    assert.equal(asRecord(executed.error).reasonCode, "not_found");
    assert.equal(executed.checkoutExpiresAt, undefined);
    assert.equal(executed.orderHandle, undefined);
    assert.equal(listCommittedFunnelEvents(planId).length, before);
  });

  it("CTX-RED-07 two namespaces freeze only their own acquisition", async () => {
    const cluster = createHandlerCluster();
    const first = await setupDefaultExecuteContext(cluster, {
      suffix: "ctx07a",
      runId: "A",
      acquisitionMinor: 1000
    });
    const second = await setupDefaultExecuteContext(cluster, {
      suffix: "ctx07b",
      runId: "B",
      setup: "C",
      stale: "A",
      plan: "B",
      acquisitionMinor: 0
    });
    const executedN1 = await executeOn(cluster, "B", { ...first, suffix: "ctx07a" });
    const executedN2 = await executeOn(cluster, "A", { ...second, suffix: "ctx07b" });
    assert.equal(contributionOf(executedN1).acquisitionMinor, 1000);
    assert.equal(contributionOf(executedN2).acquisitionMinor, 0);
    assert.equal(contributionOf(executedN1).checkoutExpiresAt, V13_EXPIRY_09_15);
    assert.equal(contributionOf(executedN2).checkoutExpiresAt, V13_EXPIRY_09_15);
  });

  it("CTX-RED-08 five fixed routes canonicalise to one 09:15/1000 hash", async () => {
    const routes: Array<{
      name: string;
      setup: HandlerId;
      stale: HandlerId;
      plan: HandlerId;
      execute: HandlerId;
      restartExecute?: boolean;
    }> = [
      { name: "A-A-A", setup: "A", stale: "A", plan: "A", execute: "A" },
      { name: "A-B-C", setup: "A", stale: "B", plan: "B", execute: "C" },
      { name: "C-A-B", setup: "C", stale: "A", plan: "A", execute: "B" },
      { name: "stale-B", setup: "A", stale: "B", plan: "C", execute: "B" },
      { name: "restarted-C", setup: "A", stale: "B", plan: "C", execute: "C", restartExecute: true }
    ];
    const hashes = [];
    for (const route of routes) {
      const cluster = createHandlerCluster();
      const ready = await setupDefaultExecuteContext(cluster, {
        suffix: route.name,
        setup: route.setup,
        stale: route.stale,
        plan: route.plan
      });
      if (route.execute !== route.setup && route.execute !== route.plan && route.execute !== route.stale) {
        await cluster.primeFromCommitted(route.execute, ready.namespace);
      }
      if (route.restartExecute) {
        cluster.restartHandler(route.execute);
      }
      const executed = await executeOn(cluster, route.execute, { ...ready, suffix: route.name });
      const got = contributionOf(executed);
      assert.equal(got.checkoutExpiresAt, V13_EXPIRY_09_15, route.name);
      assert.equal(got.acquisitionMinor, V13_ACQUISITION, route.name);
      hashes.push(canonicalHash(stripOpaque(got)));
    }
    assert.equal(new Set(hashes).size, 1, canonicalJson(firstDiff(hashes[0], hashes[1])));
  });
});
