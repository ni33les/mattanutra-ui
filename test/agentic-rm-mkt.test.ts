import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { contributionMinor } from "../lib/agentic/funnel/events.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { orderTool } from "../lib/agentic/commerce/order.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import {
  beginDetRun,
  canonicalJson,
  createDetRuntime,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK } from "./agentic/det-v3/manifest.ts";

const CANONICAL_FUNNEL = [
  "connector_viewed",
  "connected",
  "plan_ready",
  "confirmed",
  "checkout_created",
  "payment_declined",
  "paid",
  "dispatched",
  "delivered"
] as const;

const LEAKED_INTERNAL = [
  "info_shown",
  "plan_created",
  "execute_created",
  "checkout_opened",
  "payment_succeeded",
  "fulfilment_dispatched",
  "order_delivered"
] as const;

function structured(response: { result?: { structuredContent?: unknown } } | null) {
  return (response?.result?.structuredContent ?? response?.result ?? {}) as Record<string, unknown>;
}

async function qaCall(
  runtime: ReturnType<typeof createDetRuntime>,
  name: string,
  args: Record<string, unknown> = {}
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

function eventTypes(observed: Record<string, unknown>) {
  return ((observed.events as Array<{ eventType?: string }>) ?? []).map((item) => item.eventType);
}

function contributionSnapshot(view: Record<string, unknown>) {
  return {
    acquisitionMinor: view.acquisitionMinor ?? null,
    attribution: view.attribution ?? null,
    contributionMinor: view.contributionMinor ?? null,
    currency: (view.money as { currency?: string } | undefined)?.currency ?? view.currency ?? null,
    paymentFeeMinor: view.paymentFeeMinor ?? null,
    paymentMinor: view.paymentMinor ?? null,
    productCostMinor: view.productCostMinor ?? null,
    shippingSubsidyMinor: view.shippingSubsidyMinor ?? null
  };
}

async function startAttributedRun(runtime: ReturnType<typeof createDetRuntime>, runId: string) {
  const begun = await qaCall(runtime, "beginRun", { runId });
  const namespace = String(begun.namespace);
  await qaCall(runtime, "setChannel", {
    acquisitionMinor: 1000,
    attribution: "agent_connector",
    namespace
  });
  return {
    namespace,
    principal: String(begun.principalScope ?? namespace),
    scope: {
      ...runtime.scope,
      principalScope: String(begun.principalScope ?? namespace)
    }
  };
}

async function createReadyCheckout(
  runtime: ReturnType<typeof createDetRuntime>,
  input: Readonly<{ principal: string; suffix: string }>
) {
  const scope = { ...runtime.scope, principalScope: input.principal };
  const plan = await planTool({
    config: runtime.config,
    now: DET_V3_CLOCK,
    payload: {
      idempotencyKey: `rm-plan-${input.suffix}xxxxxxxx`,
      request: goldenPlanRequest()
    },
    scope,
    store: runtime.store
  });
  assert.equal((plan as { status?: string }).status, "ready", canonicalJson(plan));
  const executed = await executeTool({
    config: runtime.config,
    expectedRevision: (plan as { revision: number }).revision,
    idempotencyKey: `rm-exec-${input.suffix}xxxxxxxx`,
    now: DET_V3_CLOCK,
    payment: runtime.payment,
    planHandle: (plan as { planHandle: string }).planHandle,
    scope,
    store: runtime.store
  });
  assert.equal((executed as { ok?: boolean }).ok, true, canonicalJson(executed));
  return {
    executed: executed as Record<string, unknown>,
    orderHandle: String((executed as { orderHandle: string }).orderHandle),
    plan: plan as Record<string, unknown>,
    scope
  };
}

beforeEach(() => {
  beginDetRun("rm-mkt");
});

afterEach(() => {
  endDetRun();
});

describe("RM-MKT04 canonical public funnel", () => {
  it("RM-MKT04-01 complete journey emits the nine canonical event types in order", async () => {
    const runtime = createDetRuntime();
    const run = await startAttributedRun(runtime, "A");
    const created = await createReadyCheckout(runtime, { principal: run.principal, suffix: "04-01" });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "decline_insufficient_funds"
    });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "success"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      status: "dispatched"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      status: "delivered"
    });
    const observed = await qaCall(runtime, "observe", {
      namespace: run.namespace,
      orderHandle: created.orderHandle
    });
    assert.deepEqual(eventTypes(observed), [...CANONICAL_FUNNEL]);
    assert.equal(eventTypes(observed).length, 9);
  });

  it("RM-MKT04-02 each step is the exact prefix of the nine-event oracle", async () => {
    const runtime = createDetRuntime();
    const run = await startAttributedRun(runtime, "A");
    const created = await createReadyCheckout(runtime, { principal: run.principal, suffix: "04-02" });
    const afterCheckout = eventTypes(
      await qaCall(runtime, "observe", { namespace: run.namespace, orderHandle: created.orderHandle })
    );
    assert.deepEqual(afterCheckout, CANONICAL_FUNNEL.slice(0, 5));

    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "decline_insufficient_funds"
    });
    const afterDecline = eventTypes(
      await qaCall(runtime, "observe", { namespace: run.namespace, orderHandle: created.orderHandle })
    );
    assert.deepEqual(afterDecline, CANONICAL_FUNNEL.slice(0, 6));

    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "success"
    });
    const afterPaid = eventTypes(
      await qaCall(runtime, "observe", { namespace: run.namespace, orderHandle: created.orderHandle })
    );
    assert.deepEqual(afterPaid, CANONICAL_FUNNEL.slice(0, 7));

    await qaCall(runtime, "simulateFulfilment", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      status: "dispatched"
    });
    const afterDispatch = eventTypes(
      await qaCall(runtime, "observe", { namespace: run.namespace, orderHandle: created.orderHandle })
    );
    assert.deepEqual(afterDispatch, CANONICAL_FUNNEL.slice(0, 8));

    await qaCall(runtime, "simulateFulfilment", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      status: "delivered"
    });
    const afterDelivered = eventTypes(
      await qaCall(runtime, "observe", { namespace: run.namespace, orderHandle: created.orderHandle })
    );
    assert.deepEqual(afterDelivered, [...CANONICAL_FUNNEL]);
  });

  it("RM-MKT04-03 duplicate success and late decline do not add a tenth event", async () => {
    const runtime = createDetRuntime();
    const run = await startAttributedRun(runtime, "A");
    const created = await createReadyCheckout(runtime, { principal: run.principal, suffix: "04-03" });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "decline_insufficient_funds"
    });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "success"
    });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "duplicate_success"
    });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "decline_insufficient_funds"
    });
    const observed = await qaCall(runtime, "observe", {
      namespace: run.namespace,
      orderHandle: created.orderHandle
    });
    const types = eventTypes(observed);
    assert.equal(types.filter((item) => item === "paid").length, 1);
    assert.equal(types.filter((item) => item === "payment_declined").length, 1);
    assert.equal(types.includes("payment_succeeded"), false);
    const paidOrder = await orderTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      orderHandle: created.orderHandle,
      scope: created.scope,
      store: runtime.store
    });
    assert.equal((paidOrder as { paymentStatus?: string }).paymentStatus, "paid");
  });

  it("RM-MKT04-04 public eventType never leaks internal names", async () => {
    const runtime = createDetRuntime();
    const run = await startAttributedRun(runtime, "A");
    const created = await createReadyCheckout(runtime, { principal: run.principal, suffix: "04-04" });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "decline_insufficient_funds"
    });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "success"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      status: "dispatched"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      status: "delivered"
    });
    const observed = await qaCall(runtime, "observe", {
      namespace: run.namespace,
      orderHandle: created.orderHandle
    });
    const types = eventTypes(observed);
    for (const leaked of LEAKED_INTERNAL) {
      assert.equal(types.includes(leaked), false, leaked);
    }
  });

  it("RM-MKT04-05 replayed observe keeps sequence 1..9", async () => {
    const runtime = createDetRuntime();
    const run = await startAttributedRun(runtime, "A");
    const created = await createReadyCheckout(runtime, { principal: run.principal, suffix: "04-05" });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "decline_insufficient_funds"
    });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "success"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      status: "dispatched"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      status: "delivered"
    });
    const first = await qaCall(runtime, "observe", {
      namespace: run.namespace,
      orderHandle: created.orderHandle
    });
    const second = await qaCall(runtime, "observe", {
      namespace: run.namespace,
      orderHandle: created.orderHandle
    });
    const events = (first.events as Array<{ eventType: string; sequence: number }>) ?? [];
    assert.deepEqual(
      events.map((item) => item.sequence),
      [1, 2, 3, 4, 5, 6, 7, 8, 9]
    );
    assert.equal(canonicalJson(eventTypes(first)), canonicalJson(eventTypes(second)));
    assert.equal(canonicalJson(events.map((item) => item.sequence)), canonicalJson(
      ((second.events as Array<{ sequence: number }>) ?? []).map((item) => item.sequence)
    ));
  });

  it("RM-MKT04-06 Run A and Run B canonical event arrays match", async () => {
    const runtime = createDetRuntime();

    async function journey(runId: string, suffix: string) {
      const run = await startAttributedRun(runtime, runId);
      const created = await createReadyCheckout(runtime, { principal: run.principal, suffix });
      await qaCall(runtime, "simulate", {
        namespace: run.namespace,
        orderHandle: created.orderHandle,
        scenario: "decline_insufficient_funds"
      });
      await qaCall(runtime, "simulate", {
        namespace: run.namespace,
        orderHandle: created.orderHandle,
        scenario: "success"
      });
      await qaCall(runtime, "simulateFulfilment", {
        namespace: run.namespace,
        orderHandle: created.orderHandle,
        status: "dispatched"
      });
      await qaCall(runtime, "simulateFulfilment", {
        namespace: run.namespace,
        orderHandle: created.orderHandle,
        status: "delivered"
      });
      const observed = await qaCall(runtime, "observe", {
        namespace: run.namespace,
        orderHandle: created.orderHandle
      });
      return ((observed.events as Array<{ createdAt: string; eventType: string; sequence: number }>) ?? []).map(
        (item) => ({
          createdAt: item.createdAt,
          eventType: item.eventType,
          sequence: item.sequence
        })
      );
    }

    const a = await journey("A", "04-06a");
    const b = await journey("B", "04-06b");
    assert.equal(canonicalJson(a), canonicalJson(b));
  });
});

describe("RM-MKT09 frozen contribution snapshot", () => {
  it("RM-MKT09-01 checkout freezes acquisitionMinor 1000", async () => {
    const runtime = createDetRuntime();
    const run = await startAttributedRun(runtime, "A");
    const created = await createReadyCheckout(runtime, { principal: run.principal, suffix: "09-01" });
    const unpaid = await orderTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      orderHandle: created.orderHandle,
      scope: created.scope,
      store: runtime.store
    });
    assert.equal((unpaid as { acquisitionMinor?: number }).acquisitionMinor, 1000);
    const frozen = (created.executed.frozenPlan ?? {}) as {
      contribution?: { acquisitionMinor?: number };
    };
    assert.equal(
      frozen.contribution?.acquisitionMinor ?? (unpaid as { acquisitionMinor?: number }).acquisitionMinor,
      1000
    );
  });

  it("RM-MKT09-02 paid contribution is payment minus costs minus 1000", async () => {
    assert.equal(
      contributionMinor({
        acquisitionMinor: 1000,
        paymentFeeMinor: 0,
        paymentMinor: 39800,
        productCostMinor: 34800,
        shippingSubsidyMinor: 0
      }),
      4000
    );
    const runtime = createDetRuntime();
    const run = await startAttributedRun(runtime, "A");
    const created = await createReadyCheckout(runtime, { principal: run.principal, suffix: "09-02" });
    const paid = await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "success"
    });
    const paymentMinor = Number(paid.paymentMinor);
    const productCostMinor = Number(paid.productCostMinor);
    assert.equal(paid.acquisitionMinor, 1000);
    assert.equal(
      paid.contributionMinor,
      paymentMinor - productCostMinor - Number(paid.shippingSubsidyMinor ?? 0) - Number(paid.paymentFeeMinor ?? 0) - 1000
    );
  });

  it("RM-MKT09-03 payment, order, and observe share one snapshot", async () => {
    const runtime = createDetRuntime();
    const run = await startAttributedRun(runtime, "A");
    const created = await createReadyCheckout(runtime, { principal: run.principal, suffix: "09-03" });
    const paid = await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "success"
    });
    const order = (await orderTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      orderHandle: created.orderHandle,
      scope: created.scope,
      store: runtime.store
    })) as Record<string, unknown>;
    const observed = await qaCall(runtime, "observe", {
      namespace: run.namespace,
      orderHandle: created.orderHandle
    });
    assert.equal(canonicalJson(contributionSnapshot(paid)), canonicalJson(contributionSnapshot(order)));
    assert.equal(canonicalJson(contributionSnapshot(paid)), canonicalJson(contributionSnapshot(observed)));
  });

  it("RM-MKT09-04 duplicate success and late decline do not change the snapshot", async () => {
    const runtime = createDetRuntime();
    const run = await startAttributedRun(runtime, "A");
    const created = await createReadyCheckout(runtime, { principal: run.principal, suffix: "09-04" });
    const paid = await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "success"
    });
    const before = contributionSnapshot(paid);
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "duplicate_success"
    });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "decline_insufficient_funds"
    });
    const after = contributionSnapshot(
      await qaCall(runtime, "observe", {
        namespace: run.namespace,
        orderHandle: created.orderHandle
      })
    );
    assert.equal(canonicalJson(before), canonicalJson(after));
    assert.equal(after.acquisitionMinor, 1000);
  });

  it("RM-MKT09-05 later setChannel does not mutate an existing order", async () => {
    const runtime = createDetRuntime();
    const run = await startAttributedRun(runtime, "A");
    const created = await createReadyCheckout(runtime, { principal: run.principal, suffix: "09-05" });
    await qaCall(runtime, "simulate", {
      namespace: run.namespace,
      orderHandle: created.orderHandle,
      scenario: "success"
    });
    await qaCall(runtime, "setChannel", {
      acquisitionMinor: 5000,
      attribution: "qa_campaign",
      namespace: run.namespace
    });
    const observed = await qaCall(runtime, "observe", {
      namespace: run.namespace,
      orderHandle: created.orderHandle
    });
    assert.equal(observed.acquisitionMinor, 1000);
    assert.equal(observed.attribution, "agent_connector");
  });

  it("RM-MKT09-06 unattributed fixture keeps acquisition 0", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "U" });
    const namespace = String(begun.namespace);
    await qaCall(runtime, "setChannel", {
      acquisitionMinor: 0,
      attribution: "unattributed",
      namespace
    });
    const created = await createReadyCheckout(runtime, {
      principal: String(begun.principalScope ?? namespace),
      suffix: "09-06"
    });
    await qaCall(runtime, "simulate", {
      namespace,
      orderHandle: created.orderHandle,
      scenario: "success"
    });
    const observed = await qaCall(runtime, "observe", {
      namespace,
      orderHandle: created.orderHandle
    });
    assert.equal(observed.attribution, "unattributed");
    assert.equal(observed.acquisitionMinor, 0);
  });

  it("RM-MKT09-07 Run A and Run B contribution snapshots match", async () => {
    const runtime = createDetRuntime();

    async function paidSnapshot(runId: string, suffix: string) {
      const run = await startAttributedRun(runtime, runId);
      const created = await createReadyCheckout(runtime, { principal: run.principal, suffix });
      const paid = await qaCall(runtime, "simulate", {
        namespace: run.namespace,
        orderHandle: created.orderHandle,
        scenario: "success"
      });
      return contributionSnapshot(paid);
    }

    const a = await paidSnapshot("A", "09-07a");
    const b = await paidSnapshot("B", "09-07b");
    assert.equal(canonicalJson(a), canonicalJson(b));
  });
});
