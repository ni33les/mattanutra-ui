import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { hashCapability, resolveCapability } from "../lib/agentic/capabilities.ts";
import { deletePersistedQaNamespace } from "../lib/agentic/qa/persist.ts";
import {
  asRecord,
  beginV12Run,
  canonicalJson,
  committedFunnelOf,
  contributionOf,
  createHandlerCluster,
  endV12Run,
  executeOn,
  expectedContribution,
  observeOn,
  orderOn,
  payAndDeliver,
  setClockOn,
  setupStaleExecuteContext,
  type HandlerCluster
} from "./agentic/v12/harness.ts";
import {
  V12_ACQUISITION,
  V12_CLOCK_00,
  V12_CLOCK_40,
  V12_EXPIRY_09_15,
  V12_FEE,
  V12_SUBSIDY
} from "./agentic/v12/manifest.ts";

async function resourceId(
  cluster: HandlerCluster,
  handler: "A" | "B" | "C" | "D",
  input: Readonly<{
    action: "plan.execute" | "order.read";
    handle: string;
    namespace: string;
    resourceType: "plan" | "order";
  }>
) {
  return cluster.asHandler(handler, async (runtime) => {
    const capability = await resolveCapability({
      action: input.action,
      config: runtime.config,
      handle: input.handle,
      now: runtime.now ?? V12_CLOCK_00,
      resourceType: input.resourceType,
      scope: { ...runtime.scope, principalScope: input.namespace },
      store: runtime.store
    });
    return capability?.resourceId ?? "";
  });
}

describe("v1.2 CTX execute inherits authoritative context", () => {
  beforeEach(() => {
    beginV12Run();
  });
  afterEach(() => {
    endV12Run();
  });

  it("CTX-RED-01 execute.frozenPlan.contribution.acquisitionMinor is 1000 after B is primed pre-channel", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "ctx01" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx01" });
    const got = contributionOf(executed);
    assert.equal(executed.ok, true, canonicalJson(executed));
    assert.equal(got.checkoutExpiresAt, V12_EXPIRY_09_15);
    assert.equal(got.acquisitionMinor, V12_ACQUISITION);
    assert.notEqual(got.acquisitionMinor, 0);
  });

  it("CTX-RED-02 order read on D with empty cache keeps acquisition, attribution and namespace", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "ctx02" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx02" });
    cluster.clearHandler("D");
    const order = await orderOn(cluster, "D", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle),
      principal: ready.principal
    });
    assert.equal(order.acquisitionMinor, V12_ACQUISITION);
    assert.equal(order.attribution, "agent_connector");
    const orderId = await cluster.asHandler("D", async (runtime) => {
      const record = await runtime.store.getCapabilityByHash(
        hashCapability(runtime.config.capabilitySecret, String(executed.orderHandle))
      );
      return record?.resourceId ?? "";
    });
    const stored = await cluster.store.getOrder(orderId);
    assert.equal(stored?.principalScope, ready.namespace);
    assert.equal(Boolean(stored?.planId), true);
  });

  it("CTX-RED-03 paid contribution uses payment, product, zero subsidies/fee and acquisition 1000", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "ctx03" });
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
    const contribution = asRecord(observed.contribution);
    assert.equal(frozen.acquisitionMinor, V12_ACQUISITION);
    assert.equal(observed.acquisitionMinor, V12_ACQUISITION);
    assert.equal(contribution.paymentFeeMinor ?? observed.paymentFeeMinor, V12_FEE);
    assert.equal(contribution.shippingSubsidyMinor ?? observed.shippingSubsidyMinor, V12_SUBSIDY);
    assert.equal(observed.paymentMinor, frozen.paymentMinor);
    assert.equal(observed.productCostMinor, frozen.productCostMinor);
    assert.equal(
      observed.contributionMinor,
      expectedContribution({
        paymentMinor: Number(frozen.paymentMinor),
        productCostMinor: Number(frozen.productCostMinor),
        acquisitionMinor: V12_ACQUISITION
      })
    );
  });

  it("CTX-RED-04 restart after setChannel cannot change frozen context", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "ctx04" });
    cluster.restartHandler("B");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx04" });
    const got = contributionOf(executed);
    assert.equal(executed.ok, true, canonicalJson(executed));
    assert.equal(got.acquisitionMinor, V12_ACQUISITION);
    assert.equal(got.checkoutExpiresAt, V12_EXPIRY_09_15);
    await payAndDeliver(cluster, {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    const observed = await observeOn(cluster, "C", {
      namespace: ready.namespace,
      orderHandle: String(executed.orderHandle)
    });
    assert.equal(observed.acquisitionMinor, V12_ACQUISITION);
    assert.equal(observed.attribution, "agent_connector");
    assert.equal(
      observed.contributionMinor,
      expectedContribution({
        paymentMinor: Number(observed.paymentMinor),
        productCostMinor: Number(observed.productCostMinor)
      })
    );
  });

  it("CTX-RED-05 missing plan-to-namespace association fails closed with no writes", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "ctx05" });
    const planId = await resourceId(cluster, "A", {
      action: "plan.execute",
      handle: ready.planHandle,
      namespace: ready.namespace,
      resourceType: "plan"
    });
    const beforeFunnel = committedFunnelOf(planId);
    await deletePersistedQaNamespace(ready.namespace);
    cluster.clearHandler("A");
    cluster.clearHandler("B");
    cluster.clearHandler("C");
    cluster.clearHandler("D");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx05" });
    const error = asRecord(executed.error);
    assert.equal(executed.ok, false, canonicalJson(executed));
    assert.equal(error.reasonCode, "not_found");
    assert.equal(executed.checkoutExpiresAt, undefined);
    assert.equal(contributionOf(executed).acquisitionMinor, null);
    assert.equal(executed.orderHandle, undefined);
    const afterFunnel = committedFunnelOf(planId);
    assert.equal(afterFunnel.length, beforeFunnel.length);
  });

  it("CTX-RED-06 two namespaces freeze only their own acquisition", async () => {
    const cluster = createHandlerCluster();
    const first = await setupStaleExecuteContext(cluster, {
      suffix: "ctx06a",
      runId: "A",
      acquisitionMinor: 1000
    });
    const second = await setupStaleExecuteContext(cluster, {
      suffix: "ctx06b",
      runId: "B",
      setup: "C",
      stale: "A",
      plan: "B",
      acquisitionMinor: 0
    });
    const executedN1 = await executeOn(cluster, "B", { ...first, suffix: "ctx06a" });
    const executedN2 = await executeOn(cluster, "A", { ...second, suffix: "ctx06b" });
    assert.equal(contributionOf(executedN1).acquisitionMinor, 1000);
    assert.equal(contributionOf(executedN2).acquisitionMinor, 0);
    assert.equal(contributionOf(executedN1).checkoutExpiresAt, V12_EXPIRY_09_15);
    assert.equal(contributionOf(executedN2).checkoutExpiresAt, V12_EXPIRY_09_15);
  });

  it("CTX-RED-07 observe by order handle on a new worker uses namespace clock 09:40 not 00:00", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupStaleExecuteContext(cluster, { suffix: "ctx07" });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ctx07" });
    assert.equal(contributionOf(executed).checkoutExpiresAt, V12_EXPIRY_09_15);
    await setClockOn(cluster, "A", ready.namespace, V12_CLOCK_40);
    cluster.restartHandler("D");
    const observed = await observeOn(cluster, "D", { orderHandle: String(executed.orderHandle) });
    assert.equal(observed.clock, V12_CLOCK_40);
    assert.notEqual(observed.clock, V12_CLOCK_00);
  });
});
