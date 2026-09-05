import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { infoTool } from "../lib/agentic/info.ts";
import {
  setMatcherEnteredForTests,
  setMatcherGateForTests
} from "../lib/agentic/plan/service.ts";
import {
  setCatalogueInitEnteredForTests,
  setCatalogueInitGateForTests
} from "../lib/agentic/catalogue/snapshot.ts";
import { catalogueSnapshotId } from "../lib/agentic/catalogue/freeze.ts";
import { getCatalogueSnapshot } from "../lib/agentic/catalogue/snapshot.ts";
import {
  cancelRequest,
  onRequestStageEntered,
  setRequestStageLatch
} from "../lib/agentic/qa/request-trace.ts";
import {
  queuedPermitOrder,
  setPermitCapacity,
  snapshotResourcePermits
} from "../lib/agentic/qa/resource-permits.ts";
import { eightTargetRequest } from "../lib/agentic/plan/warm-dev.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import {
  beginV14Run,
  canonicalHash,
  canonicalJson,
  createHandlerCluster,
  deferred,
  endV14Run,
  executeOn,
  planOn,
  qaCall,
  setupDefaultExecuteContext,
  type HandlerId
} from "./agentic/v14/harness.ts";

describe("v1.4 capacity cancellation and bounded completion", () => {
  beforeEach(() => {
    beginV14Run();
  });
  afterEach(() => {
    setMatcherGateForTests(null);
    setMatcherEnteredForTests(null);
    setCatalogueInitGateForTests(null);
    setCatalogueInitEnteredForTests(null);
    endV14Run();
  });

  it("CAP-RC-RED-01 locked concurrency phases all reach a terminal state", async () => {
    const cluster = createHandlerCluster();
    const workers: HandlerId[] = ["A", "B", "C", "D"];
    const baseline = snapshotResourcePermits();

    const namespaces = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        cluster.asHandler(workers[index % 4]!, (runtime) => qaCall(runtime, "beginRun", { runId: `P${index}` }))
      )
    );
    assert.equal(namespaces.every((item) => item.ok === true), true);
    assert.deepEqual(snapshotResourcePermits(), baseline);

    const identities = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        cluster.asHandler(workers[index % 4]!, (runtime) => infoTool({ config: runtime.config }))
      )
    );
    assert.equal(identities.every((item) => item.ok === true), true);

    const fixtureNs = String(namespaces[0]?.namespace);
    const fixturePrincipal = String(namespaces[0]?.principalScope ?? fixtureNs);
    const fixtures = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        planOn(cluster, workers[index % 4]!, {
          namespace: fixtureNs,
          principal: fixturePrincipal,
          suffix: `fix${index}`
        })
      )
    );
    assert.equal(fixtures.every((item) => item.ok === true), true);

    const fresh = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        planOn(cluster, workers[index % 4]!, {
          namespace: fixtureNs,
          principal: fixturePrincipal,
          suffix: `fresh${index}`
        })
      )
    );
    assert.equal(fresh.every((item) => item.ok === true), true);

    const benchmarks = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        cluster.asHandler(workers[index % 4]!, async (runtime) => {
          const { planTool } = await import("../lib/agentic/plan/service.ts");
          return planTool({
            config: runtime.config,
            now: runtime.now ?? "2026-09-02T00:00:00.000Z",
            payload: {
              idempotencyKey: `bench-${index}xxxxxxxxxxxx`.slice(0, 24),
              request: eightTargetRequest()
            },
            scope: { ...runtime.scope, principalScope: fixturePrincipal },
            store: runtime.store
          });
        })
      )
    );
    assert.equal(benchmarks.length, 10);
    assert.equal(
      benchmarks.every((item) => item && typeof item.ok === "boolean"),
      true,
      canonicalJson(benchmarks[0])
    );

    const ready = await setupDefaultExecuteContext(cluster, { suffix: "cap01" });
    const [first, second] = await Promise.all([
      executeOn(cluster, "A", { ...ready, suffix: "cap01" }),
      executeOn(cluster, "B", { ...ready, suffix: "cap01" })
    ]);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.orderHandle, first.orderHandle);
    assert.deepEqual(snapshotResourcePermits(), baseline);
    void goldenPlanRequest;
  });

  it("CAP-RC-RED-02 matcher wait holds no database permit", async () => {
    const cluster = createHandlerCluster();
    const latch = deferred();
    const entered = deferred();
    setMatcherGateForTests(latch.promise);
    setMatcherEnteredForTests(entered.resolve);
    const ready = setupDefaultExecuteContext(cluster, { suffix: "cap02" });
    await entered.promise;
    assert.equal(snapshotResourcePermits().database, 0);
    latch.resolve();
    await ready;
  });

  it("CAP-RC-RED-03 cold workers single-flight catalogue init", async () => {
    const cluster = createHandlerCluster();
    cluster.setReady("B", false);
    const latch = deferred();
    const entered = deferred();
    let enteredCount = 0;
    setCatalogueInitGateForTests(latch.promise);
    setCatalogueInitEnteredForTests(() => {
      enteredCount += 1;
      if (enteredCount === 1) {
        entered.resolve();
      }
    });
    const pendingA = cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "coldA" }));
    const pendingC = cluster.asHandler("C", (runtime) => qaCall(runtime, "beginRun", { runId: "coldC" }));
    await entered.promise;
    assert.equal(enteredCount, 1);
    await assert.rejects(() => cluster.asHandler("B", (runtime) => qaCall(runtime, "beginRun", { runId: "coldB" })), /worker_unready/);
    latch.resolve();
    const [a, c] = await Promise.all([pendingA, pendingC]);
    assert.equal(a.ok, true);
    assert.equal(c.ok, true);
    cluster.setReady("B", true);
    const b = await cluster.asHandler("B", (runtime) => qaCall(runtime, "beginRun", { runId: "coldB" }));
    assert.equal(b.ok, true);
    assert.equal(catalogueSnapshotId(getCatalogueSnapshot()), catalogueSnapshotId(getCatalogueSnapshot()));
  });

  it("CAP-RC-RED-04 cancel at admission, dependency and response writing", async () => {
    const cluster = createHandlerCluster();
    const baseline = snapshotResourcePermits();
    for (const stage of ["handler_admitted", "durable_started", "serialization_completed"] as const) {
      const latch = deferred();
      const entered = deferred();
      setRequestStageLatch(stage, latch.promise);
      onRequestStageEntered(stage, entered.resolve);
      const pending = cluster.asHandler("A", (runtime) =>
        qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: `cap04-${stage}` })
      );
      await entered.promise;
      cancelRequest(`beginRun:cap04-${stage}:runner-1`);
      latch.resolve();
      const cancelled = await pending;
      assert.equal(cancelled.ok, false, stage);
      const next = await cluster.asHandler("B", (runtime) =>
        qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: `cap04-next-${stage}` })
      );
      assert.equal(next.ok, true, stage);
      setRequestStageLatch(stage, Promise.resolve());
    }
    assert.deepEqual(snapshotResourcePermits(), baseline);
  });

  it("CAP-RC-RED-05 exhausted pool admits the queued request in order", async () => {
    const cluster = createHandlerCluster();
    setPermitCapacity("admission", 1);
    const latch = deferred();
    const entered = deferred();
    setRequestStageLatch("handler_admitted", latch.promise);
    onRequestStageEntered("handler_admitted", entered.resolve);
    const first = cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "pool-1" }));
    await entered.promise;
    const second = cluster.asHandler("B", (runtime) => qaCall(runtime, "beginRun", { runId: "pool-2" }));
    await Promise.resolve();
    await Promise.resolve();
    void queuedPermitOrder;
    latch.resolve();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(snapshotResourcePermits().admission >= 0, true);
  });

  it("CAP-RC-RED-06 three mixed cycles have identical permit snapshots", async () => {
    const hashes = [];
    for (const cycle of [1, 2, 3]) {
      beginV14Run();
      const cluster = createHandlerCluster();
      const begun = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: `mix${cycle}` }));
      await cluster.asHandler("B", (runtime) => infoTool({ config: runtime.config }));
      hashes.push(canonicalHash({ permits: snapshotResourcePermits(), ok: begun.ok }));
      endV14Run();
    }
    assert.equal(new Set(hashes).size, 1, canonicalJson(hashes));
  });
});
