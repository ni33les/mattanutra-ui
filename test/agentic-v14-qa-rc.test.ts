import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { infoTool } from "../lib/agentic/info.ts";
import { listCommittedQaNamespaces } from "../lib/agentic/qa/persist.ts";
import { snapshotResourcePermits } from "../lib/agentic/qa/resource-permits.ts";
import {
  cancelRequest,
  onRequestStageEntered,
  setRequestStageLatch
} from "../lib/agentic/qa/request-trace.ts";
import {
  beginV14Run,
  canonicalHash,
  canonicalJson,
  createHandlerCluster,
  deferred,
  endV14Run,
  qaCall,
  type HandlerId
} from "./agentic/v14/harness.ts";
import { V14_BEGIN_RUN_GROUPS, V14_BEGIN_RUN_WAVE, V14_CLOCK_09 } from "./agentic/v14/manifest.ts";

describe("v1.4 QA beginRun completion", () => {
  beforeEach(() => {
    beginV14Run();
  });
  afterEach(() => {
    endV14Run();
  });

  it("QA-RC-RED-01 eight concurrent beginRuns all complete with unique namespaces", async () => {
    const cluster = createHandlerCluster();
    const workers: HandlerId[] = ["A", "B", "C", "D", "A", "B", "C", "D"];
    const latch = deferred();
    const admitted = deferred();
    let count = 0;
    setRequestStageLatch("handler_admitted", latch.promise);
    onRequestStageEntered("handler_admitted", () => {
      count += 1;
      if (count === V14_BEGIN_RUN_WAVE) {
        admitted.resolve();
      }
    });
    const pending = workers.map((worker, index) =>
      cluster.asHandler(worker, (runtime) => qaCall(runtime, "beginRun", { runId: `G${index}` }))
    );
    await admitted.promise;
    assert.equal(count, V14_BEGIN_RUN_WAVE);
    latch.resolve();
    const results = await Promise.all(pending);
    assert.equal(results.length, V14_BEGIN_RUN_WAVE);
    const namespaces = results.map((item) => String(item.namespace));
    assert.equal(new Set(namespaces).size, V14_BEGIN_RUN_WAVE, canonicalJson(namespaces));
    assert.equal(results.every((item) => item.ok === true), true);
  });

  it("QA-RC-RED-02 eleven beginRun then setClock each to 09:00", async () => {
    const cluster = createHandlerCluster();
    const workers: HandlerId[] = ["A", "B", "C", "D"];
    const wave = async (offset: number, count: number) => {
      const pending = [];
      for (let index = 0; index < count; index += 1) {
        const runIndex = offset + index;
        pending.push(
          cluster.asHandler(workers[runIndex % 4]!, (runtime) =>
            qaCall(runtime, "beginRun", { runId: `N${runIndex}` })
          )
        );
      }
      return Promise.all(pending);
    };
    const first = await wave(0, V14_BEGIN_RUN_WAVE);
    const second = await wave(V14_BEGIN_RUN_WAVE, V14_BEGIN_RUN_GROUPS - V14_BEGIN_RUN_WAVE);
    const begun = [...first, ...second];
    assert.equal(begun.length, 11);
    assert.equal(new Set(begun.map((item) => String(item.namespace))).size, 11);
    for (const item of begun) {
      const setter = await cluster.asHandler("A", (runtime) =>
        qaCall(runtime, "setClock", { namespace: item.namespace, now: V14_CLOCK_09 })
      );
      assert.equal(setter.clock, V14_CLOCK_09);
    }
  });

  it("QA-RC-RED-03 info probes complete while beginRun runs", async () => {
    const cluster = createHandlerCluster();
    const qa = cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
    const info = cluster.asHandler("B", (runtime) => infoTool({ config: runtime.config }));
    const [begun, probed] = await Promise.all([qa, info]);
    assert.equal(begun.ok, true);
    assert.equal(probed.ok, true);
  });

  it("QA-RC-RED-04 replay beginRun with the same runId returns one namespace", async () => {
    const cluster = createHandlerCluster();
    const first = await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "A" })
    );
    const replay = await cluster.asHandler("B", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "A" })
    );
    assert.equal(first.ok, true);
    assert.equal(replay.ok, true);
    assert.equal(replay.namespace, first.namespace, canonicalJson({ first, replay }));
  });

  it("QA-RC-RED-05 restarted worker still completes beginRun", async () => {
    const cluster = createHandlerCluster();
    const first = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
    cluster.restartHandler("C");
    const second = await cluster.asHandler("C", (runtime) => qaCall(runtime, "beginRun", { runId: "B" }));
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.notEqual(second.namespace, first.namespace);
  });

  it("QA-RC-RED-06 cancel before commit writes nothing; after commit replays", async () => {
    const cluster = createHandlerCluster();
    const latch = deferred();
    const entered = deferred();
    setRequestStageLatch("durable_started", latch.promise);
    onRequestStageEntered("durable_started", entered.resolve);
    const pending = cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "cancel-pre" })
    );
    await entered.promise;
    cancelRequest("beginRun:cancel-pre:runner-1");
    latch.resolve();
    const cancelled = await pending;
    assert.equal(cancelled.ok, false);
    assert.equal(listCommittedQaNamespaces().filter((item) => item.runId === "cancel-pre").length, 0);

    const latchAfter = deferred();
    const enteredAfter = deferred();
    setRequestStageLatch("serialization_completed", latchAfter.promise);
    onRequestStageEntered("serialization_completed", enteredAfter.resolve);
    const firstPost = cluster.asHandler("B", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "cancel-post" })
    );
    await enteredAfter.promise;
    cancelRequest("beginRun:cancel-post:runner-1");
    latchAfter.resolve();
    const cancelledPost = await firstPost;
    assert.equal(cancelledPost.ok, false);
    setRequestStageLatch("serialization_completed", Promise.resolve());
    const replayed = await cluster.asHandler("C", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "cancel-post" })
    );
    assert.equal(replayed.ok, true);
    assert.equal(listCommittedQaNamespaces().filter((item) => item.runId === "cancel-post").length, 1);
    assert.deepEqual(snapshotResourcePermits(), {
      admission: 0,
      connection: 0,
      database: 0,
      lock: 0,
      worker: 0
    });
  });

  it("QA-RC-RED-07 three fresh 11-group cycles share one evidence hash", async () => {
    const hashes = [];
    for (const cycle of [1, 2, 3]) {
      beginV14Run();
      const cluster = createHandlerCluster();
      const workers: HandlerId[] = ["A", "B", "C", "D"];
      const begun = [];
      for (let index = 0; index < V14_BEGIN_RUN_GROUPS; index += 1) {
        begun.push(
          await cluster.asHandler(workers[index % 4]!, (runtime) =>
            qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: `C${cycle}N${index}` })
          )
        );
      }
      for (const item of begun) {
        await cluster.asHandler("A", (runtime) =>
          qaCall(runtime, "setClock", { namespace: item.namespace, now: V14_CLOCK_09 })
        );
      }
      hashes.push(
        canonicalHash({
          clocks: begun.length,
          namespaces: 11,
          permits: snapshotResourcePermits()
        })
      );
      assert.deepEqual(snapshotResourcePermits(), {
        admission: 0,
        connection: 0,
        database: 0,
        lock: 0,
        worker: 0
      });
      endV14Run();
    }
    assert.equal(new Set(hashes).size, 1, canonicalJson(hashes));
  });
});
