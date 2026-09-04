import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import { contributionMinor } from "../lib/agentic/funnel/events.ts";
import {
  beginDetRun,
  canonicalJson,
  createDetRuntime,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK } from "./agentic/det-v3/manifest.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function structured(response: { result?: { structuredContent?: unknown } } | null) {
  return asRecord(response?.result?.structuredContent ?? response?.result);
}

async function qaCall(
  runtime: ReturnType<typeof createDetRuntime>,
  name: string,
  args: Record<string, unknown>
) {
  return structured(
    await handleQaJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: args, name }
    })
  );
}

async function paidObserve(suffix: string) {
  const runtime = createDetRuntime();
  const begun = await qaCall(runtime, "beginRun", { runId: "A" });
  const namespace = String(begun.namespace);
  await qaCall(runtime, "setChannel", {
    acquisitionMinor: 1000,
    attribution: "agent_connector",
    namespace
  });
  const scope = {
    ...runtime.scope,
    principalScope: String(begun.principalScope ?? namespace)
  };
  const plan = await planTool({
    config: runtime.config,
    now: DET_V3_CLOCK,
    payload: { idempotencyKey: `contrib-plan-${suffix}xxxx`, request: goldenPlanRequest() },
    scope,
    store: runtime.store
  });
  const executed = await executeTool({
    config: runtime.config,
    expectedRevision: Number((plan as { revision: number }).revision),
    idempotencyKey: `contrib-exec-${suffix}xxxx`,
    now: DET_V3_CLOCK,
    payment: runtime.payment,
    planHandle: String((plan as { planHandle: string }).planHandle),
    scope,
    store: runtime.store
  });
  const orderHandle = String((executed as { orderHandle: string }).orderHandle);
  await qaCall(runtime, "simulate", {
    namespace,
    orderHandle,
    scenario: "success"
  });
  const observed = await qaCall(runtime, "observe", { namespace, orderHandle });
  return { observed, orderHandle, namespace, runtime };
}

describe("Slice D contribution contract", () => {
  beforeEach(() => {
    beginDetRun("contrib");
  });
  afterEach(() => {
    endDetRun();
  });

  it("CONTRIB-RED-01 nested inputs contain five integer minor fields", async () => {
    const { observed } = await paidObserve("01");
    const contribution = asRecord(observed.contribution);
    const inputs = asRecord(contribution.inputs);
    for (const key of [
      "customerPaymentMinor",
      "productCostMinor",
      "shippingSubsidyMinor",
      "paymentFeeMinor",
      "acquisitionCostMinor"
    ]) {
      assert.equal(typeof inputs[key], "number", key);
    }
  });

  it("CONTRIB-RED-02 formula reconciles to contributionMinor", async () => {
    const { observed } = await paidObserve("02");
    const contribution = asRecord(observed.contribution);
    const inputs = asRecord(contribution.inputs);
    const expected = contributionMinor({
      acquisitionMinor: Number(inputs.acquisitionCostMinor),
      paymentFeeMinor: Number(inputs.paymentFeeMinor),
      paymentMinor: Number(inputs.customerPaymentMinor),
      productCostMinor: Number(inputs.productCostMinor),
      shippingSubsidyMinor: Number(inputs.shippingSubsidyMinor)
    });
    assert.equal(contribution.contributionMinor, expected);
    assert.equal(inputs.shippingSubsidyMinor, 0);
    assert.equal(inputs.paymentFeeMinor, 0);
    assert.equal(inputs.acquisitionCostMinor, 1000);
    assert.equal(
      Number(inputs.customerPaymentMinor) - Number(inputs.productCostMinor) - 1000,
      contribution.contributionMinor
    );
  });

  it("CONTRIB-RED-03 inputs equal authoritative ledger values", async () => {
    const { observed } = await paidObserve("03");
    const contribution = asRecord(observed.contribution);
    const inputs = asRecord(contribution.inputs);
    assert.equal(inputs.customerPaymentMinor, observed.paymentMinor);
    assert.equal(inputs.productCostMinor, observed.productCostMinor);
    assert.equal(inputs.shippingSubsidyMinor, observed.shippingSubsidyMinor);
    assert.equal(inputs.paymentFeeMinor, observed.paymentFeeMinor);
    assert.equal(inputs.acquisitionCostMinor, observed.acquisitionMinor);
  });

  it("CONTRIB-RED-04 repeated observe is byte-identical", async () => {
    const { observed, namespace, orderHandle, runtime } = await paidObserve("04");
    const again = await qaCall(runtime, "observe", { namespace, orderHandle });
    assert.equal(canonicalJson(asRecord(observed.contribution)), canonicalJson(asRecord(again.contribution)));
  });

  it("CONTRIB-RED-05 missing attribution does not invent acquisition", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const namespace = String(begun.namespace);
    const scope = {
      ...runtime.scope,
      principalScope: String(begun.principalScope ?? namespace)
    };
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "contrib-plan-05xxxxxxxx", request: goldenPlanRequest() },
      scope,
      store: runtime.store
    });
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: Number((plan as { revision: number }).revision),
      idempotencyKey: "contrib-exec-05xxxxxxxx",
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: String((plan as { planHandle: string }).planHandle),
      scope,
      store: runtime.store
    });
    await qaCall(runtime, "simulate", {
      namespace,
      orderHandle: String((executed as { orderHandle: string }).orderHandle),
      scenario: "success"
    });
    const observed = await qaCall(runtime, "observe", {
      namespace,
      orderHandle: String((executed as { orderHandle: string }).orderHandle)
    });
    const inputs = asRecord(asRecord(observed.contribution).inputs);
    if (observed.attribution === "unattributed" || observed.attribution == null) {
      assert.equal(Number(inputs.acquisitionCostMinor ?? observed.acquisitionMinor ?? 0), 0);
    }
  });

  it("CONTRIB-RED-06 flat fields equal nested counterparts when present", async () => {
    const { observed } = await paidObserve("06");
    const inputs = asRecord(asRecord(observed.contribution).inputs);
    if (Object.keys(inputs).length === 0) {
      assert.fail("contribution.inputs missing");
    }
    assert.equal(observed.paymentMinor, inputs.customerPaymentMinor);
    assert.equal(observed.productCostMinor, inputs.productCostMinor);
    assert.equal(observed.shippingSubsidyMinor, inputs.shippingSubsidyMinor);
    assert.equal(observed.paymentFeeMinor, inputs.paymentFeeMinor);
    assert.equal(observed.acquisitionMinor, inputs.acquisitionCostMinor);
    assert.equal(observed.contributionMinor, asRecord(observed.contribution).contributionMinor);
  });
});
