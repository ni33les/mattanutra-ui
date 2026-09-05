import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { infoTool } from "../lib/agentic/info.ts";
import {
  beginV14Run,
  canonicalJson,
  createHandlerCluster,
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
    const pending = workers.map((worker, index) =>
      cluster.asHandler(worker, (runtime) => qaCall(runtime, "beginRun", { runId: `G${index}` }))
    );
    const results = await Promise.all(pending);
    assert.equal(results.length, V14_BEGIN_RUN_WAVE);
    const namespaces = results.map((item) => String(item.namespace));
    assert.equal(new Set(namespaces).size, V14_BEGIN_RUN_WAVE, canonicalJson(namespaces));
    assert.equal(results.every((item) => item.ok === true), true);
  });

  it("QA-RC-RED-02 eleven beginRun then setClock each to 09:00", async () => {
    const cluster = createHandlerCluster();
    const workers: HandlerId[] = ["A", "B", "C", "D"];
    const begun = [];
    for (let index = 0; index < V14_BEGIN_RUN_GROUPS; index += 1) {
      begun.push(
        await cluster.asHandler(workers[index % 4]!, (runtime) =>
          qaCall(runtime, "beginRun", { runId: `N${index}` })
        )
      );
    }
    assert.equal(begun.length, 11);
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
    const first = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
    const replay = await cluster.asHandler("B", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
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
});
