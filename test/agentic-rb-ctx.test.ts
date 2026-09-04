import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import { deletePersistedQaNamespace, setPersistCommitGateForTests } from "../lib/agentic/qa/persist.ts";
import { bindQaRuntime } from "../lib/agentic/qa/session.ts";
import {
  beginRbRun,
  canonicalJson,
  contributionOf,
  createHandlerCluster,
  endRbRun,
  qaCall
} from "./agentic/rb-v1/harness.ts";
import {
  RB_V1_ACQUISITION,
  RB_V1_CLOCK_00,
  RB_V1_CLOCK_09,
  RB_V1_EXPIRY_00_15,
  RB_V1_EXPIRY_09_15
} from "./agentic/rb-v1/manifest.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function setupReadyPlan(
  cluster: ReturnType<typeof createHandlerCluster>,
  setupOn: "A" | "B",
  suffix: string
) {
  const begun = await cluster.asHandler(setupOn, (runtime) => qaCall(runtime, "beginRun", { runId: "B" }));
  const namespace = String(begun.namespace);
  await cluster.asHandler(setupOn, (runtime) =>
    qaCall(runtime, "setClock", { namespace, now: RB_V1_CLOCK_09 })
  );
  await cluster.asHandler(setupOn, (runtime) =>
    qaCall(runtime, "setChannel", {
      acquisitionMinor: RB_V1_ACQUISITION,
      attribution: "agent_connector",
      namespace
    })
  );
  const plan = asRecord(
    await cluster.asHandler(setupOn, (runtime) => {
      const bound = bindQaRuntime(
        runtime,
        new Request("https://dev.mattanutra.com/api/mcp", {
          headers: { "x-mattanutra-qa-namespace": namespace }
        }),
        namespace
      );
      return planTool({
        config: bound.config,
        now: bound.now ?? RB_V1_CLOCK_00,
        payload: {
          idempotencyKey: `rb-plan-${suffix}xxxxxxxx`,
          request: goldenPlanRequest()
        },
        scope: {
          ...bound.scope,
          principalScope: String(begun.principalScope ?? namespace)
        },
        store: bound.store
      });
    })
  );
  assert.equal(plan.status, "ready", canonicalJson(plan));
  return {
    namespace,
    plan,
    planHandle: String(plan.planHandle),
    principal: String(begun.principalScope ?? namespace),
    revision: Number(plan.revision)
  };
}

async function executeOn(
  cluster: ReturnType<typeof createHandlerCluster>,
  handler: "A" | "B",
  input: Readonly<{
    namespace: string;
    planHandle: string;
    principal: string;
    revision: number;
    suffix: string;
  }>
) {
  return asRecord(
    await cluster.asHandler(handler, async (runtime) => {
      const bound = bindQaRuntime(
        runtime,
        new Request("https://dev.mattanutra.com/api/mcp", {
          headers: { "x-mattanutra-qa-namespace": input.namespace }
        }),
        input.namespace
      );
      return executeTool({
        config: bound.config,
        expectedRevision: input.revision,
        idempotencyKey: `rb-exec-${input.suffix}xxxxxxxx`,
        now: bound.now ?? RB_V1_CLOCK_00,
        payment: bound.payment,
        planHandle: input.planHandle,
        scope: {
          ...bound.scope,
          principalScope: bound.scope.principalScope ?? input.principal
        },
        store: bound.store
      });
    })
  );
}

describe("RB-CTX first divergence", () => {
  beforeEach(() => {
    beginRbRun();
  });
  afterEach(() => {
    setPersistCommitGateForTests(null);
    endRbRun();
  });

  it("RB-CTX-RED-01 execute on B after setup on A uses 09:15 and acquisition 1000", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupReadyPlan(cluster, "A", "01");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "01" });
    const got = contributionOf(executed);
    assert.equal(executed.ok, true, canonicalJson(executed));
    assert.equal(got.checkoutExpiresAt, RB_V1_EXPIRY_09_15);
    assert.equal(got.acquisitionMinor, RB_V1_ACQUISITION);
    assert.notEqual(got.checkoutExpiresAt, RB_V1_EXPIRY_00_15);
    assert.notEqual(got.acquisitionMinor, 0);
  });

  it("RB-CTX-RED-02 setup on B execute on A matches after opaque-ID canonicalisation", async () => {
    const cluster = createHandlerCluster();
    const first = await setupReadyPlan(cluster, "A", "02a");
    const executedA = await executeOn(cluster, "B", { ...first, suffix: "02a" });
    const second = await setupReadyPlan(cluster, "B", "02b");
    const executedB = await executeOn(cluster, "A", { ...second, suffix: "02b" });
    const left = contributionOf(executedA);
    const right = contributionOf(executedB);
    assert.equal(left.checkoutExpiresAt, RB_V1_EXPIRY_09_15);
    assert.equal(right.checkoutExpiresAt, RB_V1_EXPIRY_09_15);
    assert.equal(left.acquisitionMinor, RB_V1_ACQUISITION);
    assert.equal(right.acquisitionMinor, RB_V1_ACQUISITION);
    assert.equal(canonicalJson(left), canonicalJson(right));
  });

  it("RB-CTX-RED-03 cache clear on execute handler still returns 09:15 and 1000", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupReadyPlan(cluster, "A", "03");
    cluster.clearHandler("B");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "03" });
    const got = contributionOf(executed);
    assert.equal(got.checkoutExpiresAt, RB_V1_EXPIRY_09_15);
    assert.equal(got.acquisitionMinor, RB_V1_ACQUISITION);
  });

  it("RB-CTX-RED-04 execute cannot observe uncommitted clock or channel", async () => {
    const cluster = createHandlerCluster();
    const begun = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "B" }));
    const namespace = String(begun.namespace);
    const plan = asRecord(
      await cluster.asHandler("A", (runtime) =>
        planTool({
          config: runtime.config,
          now: RB_V1_CLOCK_09,
          payload: { idempotencyKey: "rb-plan-04xxxxxxxxxx", request: goldenPlanRequest() },
          scope: {
            ...runtime.scope,
            principalScope: String(begun.principalScope ?? namespace)
          },
          store: runtime.store
        })
      )
    );
    assert.equal(plan.status, "ready", canonicalJson(plan));
    await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "setChannel", {
        acquisitionMinor: RB_V1_ACQUISITION,
        attribution: "agent_connector",
        namespace
      })
    );

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setPersistCommitGateForTests(gate);
    const pending = cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "setClock", { namespace, now: RB_V1_CLOCK_09 })
    );
    const early = await executeOn(cluster, "B", {
      namespace,
      planHandle: String(plan.planHandle),
      principal: String(begun.principalScope ?? namespace),
      revision: Number(plan.revision),
      suffix: "04"
    });
    assert.notEqual(contributionOf(early).checkoutExpiresAt, RB_V1_EXPIRY_09_15);
    release();
    const setter = await pending;
    assert.equal(setter.clock, RB_V1_CLOCK_09);
    setPersistCommitGateForTests(null);
    cluster.clearHandler("B");
    const laterPlan = asRecord(
      await cluster.asHandler("A", (runtime) =>
        planTool({
          config: runtime.config,
          now: RB_V1_CLOCK_09,
          payload: { idempotencyKey: "rb-plan-04bxxxxxxxxx", request: goldenPlanRequest() },
          scope: {
            ...runtime.scope,
            principalScope: String(begun.principalScope ?? namespace)
          },
          store: runtime.store
        })
      )
    );
    const committed = await executeOn(cluster, "B", {
      namespace,
      planHandle: String(laterPlan.planHandle),
      principal: String(begun.principalScope ?? namespace),
      revision: Number(laterPlan.revision),
      suffix: "04b"
    });
    assert.equal(contributionOf(committed).checkoutExpiresAt, RB_V1_EXPIRY_09_15);
    assert.equal(contributionOf(committed).acquisitionMinor, RB_V1_ACQUISITION);
  });

  it("RB-CTX-RED-05 missing namespace does not mint a checkout with defaults", async () => {
    const cluster = createHandlerCluster();
    const ready = await setupReadyPlan(cluster, "A", "05");
    await deletePersistedQaNamespace(ready.namespace);
    cluster.clearHandler("A");
    cluster.clearHandler("B");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "05" });
    const error = asRecord(executed.error);
    assert.equal(executed.ok, false);
    assert.equal(error.reasonCode, "run_invalid");
    assert.equal(executed.checkoutExpiresAt, undefined);
    assert.equal(contributionOf(executed).acquisitionMinor, null);
  });
});
