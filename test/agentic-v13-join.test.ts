import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
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
  funnelView,
  observeOn,
  payAndDeliver,
  setupDefaultExecuteContext,
  stripOpaque,
  type HandlerId
} from "./agentic/v13/harness.ts";
import {
  V13_ACQUISITION,
  V13_EXPIRY_09_15,
  V13_FUNNEL,
  V13_SEQUENCES
} from "./agentic/v13/manifest.ts";

function evidenceOf(executed: Record<string, unknown>, observed: Record<string, unknown>) {
  const queries = asRecord(observed.queries);
  const budget = asRecord(observed.dependencyBudget);
  const events = (observed.events as Array<{ eventType: string; sequence: number }>) ?? [];
  return stripOpaque({
    acquisition: contributionOf(executed).acquisitionMinor,
    expiry: contributionOf(executed).checkoutExpiresAt,
    observeAcquisition: observed.acquisitionMinor,
    planMatch: queries["plan.match"] ?? null,
    planMatchHit: queries["plan.match.hit"] ?? null,
    planMatchHits: budget.planMatchHits ?? null,
    funnel: funnelView(events)
  });
}

describe("v1.3 joined deterministic developer gate", () => {
  beforeEach(() => {
    beginV13Run();
  });
  afterEach(() => {
    endV13Run();
  });

  it("JOIN-DET-01..04 context matrix twice yields 09:15/1000, counters 1/1/1, funnel 1..9, one hash", async () => {
    const routes: Array<{
      suffix: string;
      setup: HandlerId;
      stale: HandlerId;
      plan: HandlerId;
      execute: HandlerId;
    }> = [
      { suffix: "s1", setup: "A", stale: "A", plan: "A", execute: "A" },
      { suffix: "s2", setup: "A", stale: "B", plan: "B", execute: "C" },
      { suffix: "s3", setup: "C", stale: "A", plan: "A", execute: "B" },
      { suffix: "s4", setup: "A", stale: "B", plan: "C", execute: "B" }
    ];
    const hashes = [];
    for (const pass of [1, 2]) {
      for (const route of routes) {
        const cluster = createHandlerCluster();
        const ready = await setupDefaultExecuteContext(cluster, {
          suffix: `${route.suffix}-${pass}`,
          setup: route.setup,
          stale: route.stale,
          plan: route.plan
        });
        if (route.execute !== route.setup && route.execute !== route.plan && route.execute !== route.stale) {
          await cluster.primeFromCommitted(route.execute, ready.namespace);
        }
        const executed = await executeOn(cluster, route.execute, {
          ...ready,
          suffix: `${route.suffix}-${pass}`
        });
        await payAndDeliver(cluster, {
          namespace: ready.namespace,
          orderHandle: String(executed.orderHandle)
        });
        const observed = await observeOn(cluster, "A", {
          namespace: ready.namespace,
          orderHandle: String(executed.orderHandle)
        });
        const frozen = contributionOf(executed);
        assert.equal(frozen.checkoutExpiresAt, V13_EXPIRY_09_15, route.suffix);
        assert.equal(frozen.acquisitionMinor, V13_ACQUISITION, route.suffix);
        assert.equal(
          observed.contributionMinor,
          expectedContribution({
            paymentMinor: Number(observed.paymentMinor),
            productCostMinor: Number(observed.productCostMinor)
          })
        );
        const events = (observed.events as Array<{ eventType: string; sequence: number }>) ?? [];
        assert.deepEqual(funnelView(events).types, [...V13_FUNNEL]);
        assert.deepEqual(funnelView(events).sequences, [...V13_SEQUENCES]);
        hashes.push(canonicalHash(evidenceOf(executed, observed)));
      }
    }
    assert.equal(new Set(hashes).size, 1, canonicalJson(firstDiff(hashes[0], hashes[1])));
  });
});
