import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import { loadPersistedFunnelEvents } from "../lib/agentic/funnel/ledger.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import { resolveQaSession } from "../lib/agentic/qa/session.ts";
import { bindQaRuntime } from "../lib/agentic/qa/session.ts";
import {
  beginRbRun,
  canonicalHash,
  canonicalJson,
  contributionOf,
  createHandlerCluster,
  endRbRun,
  qaCall,
  type HandlerId
} from "./agentic/rb-v1/harness.ts";
import {
  RB_V1_ACQUISITION,
  RB_V1_CLOCK_00,
  RB_V1_CLOCK_09,
  RB_V1_CLOCK_10,
  RB_V1_CLOCK_20,
  RB_V1_CLOCK_30,
  RB_V1_CLOCK_40,
  RB_V1_EXPIRY_09_15,
  RB_V1_FUNNEL
} from "./agentic/rb-v1/manifest.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const ROUTE: HandlerId[] = ["A", "B", "C"];

async function readyJourney(
  cluster: ReturnType<typeof createHandlerCluster>,
  suffix: string
) {
  const begun = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
  const namespace = String(begun.namespace);
  const principal = String(begun.principalScope ?? namespace);
  await cluster.asHandler("A", (runtime) =>
    qaCall(runtime, "setClock", { namespace, now: RB_V1_CLOCK_09 })
  );
  await cluster.asHandler("A", (runtime) =>
    qaCall(runtime, "setChannel", {
      acquisitionMinor: RB_V1_ACQUISITION,
      attribution: "agent_connector",
      namespace
    })
  );
  const plan = asRecord(
    await cluster.asHandler("A", (runtime) => {
      const bound = bindQaRuntime(
        runtime,
        new Request("https://dev.mattanutra.com/api/mcp", {
          headers: { "x-mattanutra-qa-namespace": namespace }
        }),
        namespace
      );
      return planTool({
        config: bound.config,
        now: bound.now ?? RB_V1_CLOCK_09,
        payload: { idempotencyKey: `rb-ns-plan-${suffix}xxxx`, request: goldenPlanRequest() },
        scope: { ...bound.scope, principalScope: principal },
        store: bound.store
      });
    })
  );
  assert.equal(plan.status, "ready", canonicalJson(plan));
  return {
    namespace,
    plan,
    planHandle: String(plan.planHandle),
    principal,
    revision: Number(plan.revision)
  };
}

async function executeOn(
  cluster: ReturnType<typeof createHandlerCluster>,
  handler: HandlerId,
  input: Readonly<{
    namespace: string;
    planHandle: string;
    principal: string;
    revision: number;
    suffix: string;
  }>
) {
  return asRecord(
    await cluster.asHandler(handler, (runtime) => {
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
        idempotencyKey: `rb-ns-exec-${input.suffix}xxxx`,
        now: bound.now ?? RB_V1_CLOCK_00,
        payment: bound.payment,
        planHandle: input.planHandle,
        scope: { ...bound.scope, principalScope: bound.scope.principalScope ?? input.principal },
        store: bound.store
      });
    })
  );
}

describe("RB-NS authoritative namespace", () => {
  beforeEach(() => {
    beginRbRun();
  });
  afterEach(() => {
    endRbRun();
  });

  it("RB-NS-01 fifty routed reads share clock channel and acquisition", async () => {
    const cluster = createHandlerCluster();
    const ready = await readyJourney(cluster, "ns01");
    const reads = [];
    for (let index = 0; index < 50; index += 1) {
      const handler = ROUTE[index % 3]!;
      reads.push(
        await cluster.asHandler(handler, async () => {
          const session = await resolveQaSession(ready.namespace);
          return {
            acquisitionMinor: session?.acquisitionMinor ?? null,
            attribution: session?.attribution ?? null,
            now: session?.now ?? null
          };
        })
      );
    }
    for (const read of reads) {
      assert.equal(read.now, RB_V1_CLOCK_09);
      assert.equal(read.acquisitionMinor, RB_V1_ACQUISITION);
      assert.equal(read.attribution, "agent_connector");
    }
    assert.equal(canonicalJson(reads[0]), canonicalJson(reads[49]));
  });

  it("RB-NS-02 cache clear on each handler keeps namespace", async () => {
    const cluster = createHandlerCluster();
    const ready = await readyJourney(cluster, "ns02");
    for (const id of ROUTE) {
      cluster.clearHandler(id);
      const session = await cluster.asHandler(id, () => resolveQaSession(ready.namespace));
      assert.equal(session?.now, RB_V1_CLOCK_09);
      assert.equal(session?.acquisitionMinor, RB_V1_ACQUISITION);
    }
  });

  it("RB-NS-03 two namespaces never leak clock or acquisition", async () => {
    const cluster = createHandlerCluster();
    const first = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
    const second = await cluster.asHandler("B", (runtime) => qaCall(runtime, "beginRun", { runId: "B" }));
    await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "setClock", { namespace: String(first.namespace), now: RB_V1_CLOCK_09 })
    );
    await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "setChannel", {
        acquisitionMinor: 1000,
        attribution: "agent_connector",
        namespace: String(first.namespace)
      })
    );
    await cluster.asHandler("B", (runtime) =>
      qaCall(runtime, "setClock", { namespace: String(second.namespace), now: RB_V1_CLOCK_10 })
    );
    await cluster.asHandler("B", (runtime) =>
      qaCall(runtime, "setChannel", {
        acquisitionMinor: 5000,
        attribution: "qa_campaign",
        namespace: String(second.namespace)
      })
    );
    const left = await cluster.asHandler("C", () => resolveQaSession(String(first.namespace)));
    const right = await cluster.asHandler("C", () => resolveQaSession(String(second.namespace)));
    assert.equal(left?.now, RB_V1_CLOCK_09);
    assert.equal(left?.acquisitionMinor, 1000);
    assert.equal(right?.now, RB_V1_CLOCK_10);
    assert.equal(right?.acquisitionMinor, 5000);
  });

  it("RB-NS-05 clock steps are visible before setter returns", async () => {
    const cluster = createHandlerCluster();
    const begun = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
    const namespace = String(begun.namespace);
    for (const clock of [RB_V1_CLOCK_09, RB_V1_CLOCK_10, RB_V1_CLOCK_20, RB_V1_CLOCK_30, RB_V1_CLOCK_40]) {
      const setter = await cluster.asHandler("A", (runtime) =>
        qaCall(runtime, "setClock", { namespace, now: clock })
      );
      assert.equal(setter.clock, clock);
      const read = await cluster.asHandler("B", () => resolveQaSession(namespace));
      assert.equal(read?.now, clock);
    }
  });
});

describe("RB-FUNNEL sequence authority", () => {
  beforeEach(() => {
    beginRbRun();
  });
  afterEach(() => {
    endRbRun();
  });

  it("RB-FUNNEL-RED-01 execute on B continues plan sequences 1..5", async () => {
    const cluster = createHandlerCluster();
    const ready = await readyJourney(cluster, "fn01");
    cluster.clearHandler("B");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "fn01" });
    assert.equal(executed.ok, true, canonicalJson(executed));
    const events = await cluster.asHandler("B", async (runtime) => {
      const capability = await resolveCapability({
        action: "order.read",
        config: runtime.config,
        handle: String(executed.orderHandle),
        now: RB_V1_CLOCK_09,
        resourceType: "order",
        scope: { ...runtime.scope, principalScope: ready.principal },
        store: runtime.store
      });
      const order = capability ? await runtime.store.getOrder(capability.resourceId) : null;
      return loadPersistedFunnelEvents(order?.planId ?? "");
    });
    const types = events.map((item) => item.eventType);
    const sequences = events.map((item) => item.sequence);
    assert.deepEqual(types, RB_V1_FUNNEL.slice(0, 5));
    assert.deepEqual(sequences, [1, 2, 3, 4, 5]);
  });

  it("RB-FUNNEL-RED-02 decline success dispatched delivered are 1..9", async () => {
    const cluster = createHandlerCluster();
    const ready = await readyJourney(cluster, "fn02");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "fn02" });
    const orderHandle = String(executed.orderHandle);
    await cluster.asHandler("C", (runtime) =>
      qaCall(runtime, "simulate", {
        namespace: ready.namespace,
        orderHandle,
        scenario: "decline_insufficient_funds"
      })
    );
    await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "simulate", {
        namespace: ready.namespace,
        orderHandle,
        scenario: "success"
      })
    );
    await cluster.asHandler("B", (runtime) =>
      qaCall(runtime, "simulateFulfilment", {
        namespace: ready.namespace,
        orderHandle,
        status: "dispatched"
      })
    );
    await cluster.asHandler("C", (runtime) =>
      qaCall(runtime, "simulateFulfilment", {
        namespace: ready.namespace,
        orderHandle,
        status: "delivered"
      })
    );
    const observed = await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "observe", { namespace: ready.namespace, orderHandle })
    );
    const events = ((observed.events as Array<{ eventType: string; sequence: number }>) ?? []);
    assert.deepEqual(
      events.map((item) => item.eventType),
      [...RB_V1_FUNNEL]
    );
    assert.deepEqual(
      events.map((item) => item.sequence),
      [1, 2, 3, 4, 5, 6, 7, 8, 9]
    );
  });
});

describe("RB-OBS pure read", () => {
  beforeEach(() => {
    beginRbRun();
  });
  afterEach(() => {
    endRbRun();
  });

  it("RB-OBS-RED-01/03 observe A then B then 20 routed reads stay identical", async () => {
    const cluster = createHandlerCluster();
    const ready = await readyJourney(cluster, "ob01");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ob01" });
    const orderHandle = String(executed.orderHandle);
    await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "simulate", {
        namespace: ready.namespace,
        orderHandle,
        scenario: "decline_insufficient_funds"
      })
    );
    await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "simulate", {
        namespace: ready.namespace,
        orderHandle,
        scenario: "success"
      })
    );
    await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "simulateFulfilment", {
        namespace: ready.namespace,
        orderHandle,
        status: "dispatched"
      })
    );
    await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "simulateFulfilment", {
        namespace: ready.namespace,
        orderHandle,
        status: "delivered"
      })
    );
    const first = await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "observe", { namespace: ready.namespace, orderHandle })
    );
    const second = await cluster.asHandler("B", (runtime) =>
      qaCall(runtime, "observe", { namespace: ready.namespace, orderHandle })
    );
    assert.equal(canonicalJson(first), canonicalJson(second));
    const hashes = [canonicalHash(first)];
    for (let index = 0; index < 20; index += 1) {
      const handler = ROUTE[index % 3]!;
      const observed = await cluster.asHandler(handler, (runtime) =>
        qaCall(runtime, "observe", { namespace: ready.namespace, orderHandle })
      );
      hashes.push(canonicalHash(observed));
    }
    assert.equal(new Set(hashes).size, 1);
  });

  it("RB-OBS-RED-02 catalogue snapshot is not acquired on observe", async () => {
    const cluster = createHandlerCluster();
    const ready = await readyJourney(cluster, "ob02");
    await cluster.asHandler("A", (runtime) => {
      const bound = bindQaRuntime(
        runtime,
        new Request("https://dev.mattanutra.com/api/mcp", {
          headers: { "x-mattanutra-qa-namespace": ready.namespace }
        }),
        ready.namespace
      );
      return planTool({
        config: bound.config,
        now: bound.now ?? RB_V1_CLOCK_09,
        payload: { idempotencyKey: "rb-ns-plan-ob02hitxxxx", request: goldenPlanRequest() },
        scope: { ...bound.scope, principalScope: ready.principal },
        store: bound.store
      });
    });
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "ob02" });
    const first = await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "observe", {
        namespace: ready.namespace,
        orderHandle: String(executed.orderHandle)
      })
    );
    const second = await cluster.asHandler("B", (runtime) =>
      qaCall(runtime, "observe", {
        namespace: ready.namespace,
        orderHandle: String(executed.orderHandle)
      })
    );
    const firstBudget = asRecord(first.dependencyBudget);
    const secondBudget = asRecord(second.dependencyBudget);
    const firstQueries = asRecord(first.queries);
    const secondQueries = asRecord(second.queries);
    assert.equal(firstBudget.catalogueSnapshots, 0);
    assert.equal(secondBudget.catalogueSnapshots, 0);
    assert.equal(firstQueries["catalogue.snapshot.TH"], undefined);
    assert.equal(secondQueries["catalogue.snapshot.TH"], undefined);
    assert.equal(firstQueries["plan.match.hit"] ?? firstQueries["plan.match.miss"], 1);
    assert.equal(canonicalJson(firstQueries), canonicalJson(secondQueries));
  });
});

describe("RB-TIME clocked checkout", () => {
  beforeEach(() => {
    beginRbRun();
  });
  afterEach(() => {
    endRbRun();
  });

  it("RB-TIME-01 checkout created at 09:00 expires at 09:15", async () => {
    const cluster = createHandlerCluster();
    const ready = await readyJourney(cluster, "tm01");
    const executed = await executeOn(cluster, "B", { ...ready, suffix: "tm01" });
    assert.equal(contributionOf(executed).checkoutExpiresAt, RB_V1_EXPIRY_09_15);
    assert.equal(contributionOf(executed).acquisitionMinor, RB_V1_ACQUISITION);
  });
});
