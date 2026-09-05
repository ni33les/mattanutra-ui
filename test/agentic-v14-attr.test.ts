import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  onRequestStageEntered,
  requestTrace,
  setDropConnectionAfterStage,
  setRequestAttributionEnabled,
  setRequestStageLatch,
  STAGE_OWNER,
  type RequestStage
} from "../lib/agentic/qa/request-trace.ts";
import { snapshotResourcePermits } from "../lib/agentic/qa/resource-permits.ts";
import { advanceServiceClock } from "../lib/agentic/qa/service-clock.ts";
import { listCommittedQaNamespaces } from "../lib/agentic/qa/persist.ts";
import {
  beginV14Run,
  canonicalHash,
  canonicalJson,
  createHandlerCluster,
  deferred,
  endV14Run,
  executeOn,
  qaCall
} from "./agentic/v14/harness.ts";

const BEGIN_CORRELATION = "beginRun:A:anon";

describe("v1.4 ATTR request-stage attribution", () => {
  beforeEach(() => {
    beginV14Run();
  });
  afterEach(() => {
    setRequestAttributionEnabled(true);
    setDropConnectionAfterStage(null);
    endV14Run();
  });

  it("ATTR-RED-01 beginRun records ordered unique request stages once", async () => {
    const cluster = createHandlerCluster();
    const begun = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
    const correlation = String(begun.namespace);
    const trace = requestTrace(correlation);
    assert.deepEqual(trace.stages, [
      "ingress_accepted",
      "handler_admitted",
      "durable_started",
      "durable_committed",
      "serialization_completed",
      "response_handed_to_transport",
      "request_released"
    ]);
    assert.equal(new Set(trace.stages).size, trace.stages.length);
  });

  it("ATTR-RED-02 each latched stage has exactly one terminal owner", async () => {
    const stages: RequestStage[] = [
      "ingress_accepted",
      "handler_admitted",
      "durable_started",
      "durable_committed",
      "serialization_completed",
      "response_handed_to_transport"
    ];
    for (const stage of stages) {
      beginV14Run();
      const cluster = createHandlerCluster();
      const latch = deferred();
      const entered = deferred();
      setRequestStageLatch(stage, latch.promise);
      onRequestStageEntered(stage, entered.resolve);
      const pending = cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
      await entered.promise;
      advanceServiceClock(60_000);
      const result = await pending;
      latch.resolve();
      assert.equal(result.ok, false, canonicalJson({ stage, result }));
      assert.equal(result.error && (result.error as { reasonCode?: string }).reasonCode, "SERVICE_DEADLINE_EXCEEDED");
      const trace = requestTrace(BEGIN_CORRELATION);
      assert.equal(trace.terminalOwner, STAGE_OWNER[stage], stage);
      assert.equal(trace.terminalOwner != null, true);
      endV14Run();
    }
  });

  it("ATTR-RED-03 success and typed-error both release permits to baseline", async () => {
    const cluster = createHandlerCluster();
    const baseline = snapshotResourcePermits();
    const begun = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
    assert.equal(begun.ok, true);
    assert.deepEqual(snapshotResourcePermits(), baseline);
    const missing = await executeOn(cluster, "B", {
      namespace: String(begun.namespace),
      planHandle: "plan_missing_handle_000000000000",
      principal: String(begun.principalScope ?? begun.namespace),
      revision: 1,
      suffix: "attr03"
    });
    assert.equal(missing.ok, false);
    assert.deepEqual(snapshotResourcePermits(), baseline);
  });

  it("ATTR-RED-04 public beginRun hash is identical with attribution disabled", async () => {
    const cluster = createHandlerCluster();
    setRequestAttributionEnabled(true);
    const on = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
    setRequestAttributionEnabled(false);
    const off = await cluster.asHandler("B", (runtime) => qaCall(runtime, "beginRun", { runId: "B" }));
    assert.equal(on.ok, off.ok);
    assert.equal(typeof on.namespace, "string");
    assert.equal(typeof off.namespace, "string");
    assert.equal(canonicalHash({ ok: on.ok, clock: on.clock }), canonicalHash({ ok: off.ok, clock: off.clock }));
    void canonicalJson(on);
  });

  it("ATTR-RED-05 drop before, after and during response identifies the commit boundary", async () => {
    const cluster = createHandlerCluster();
    setDropConnectionAfterStage("durable_started");
    const before = await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "drop-before" })
    );
    assert.equal(before.ok, false);
    assert.equal(requestTrace("beginRun:drop-before:runner-1").commitBoundary, "before_commit");
    assert.equal(requestTrace("beginRun:drop-before:runner-1").replayAction, "create");
    assert.equal(listCommittedQaNamespaces().length, 0);
    setDropConnectionAfterStage(null);
    const created = await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "drop-before" })
    );
    assert.equal(created.ok, true);

    setDropConnectionAfterStage("durable_committed");
    const after = await cluster.asHandler("B", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "drop-after" })
    );
    assert.equal(after.ok, false);
    assert.equal(requestTrace("beginRun:drop-after:runner-1").commitBoundary, "after_commit");
    assert.equal(requestTrace("beginRun:drop-after:runner-1").replayAction, "reuse");
    setDropConnectionAfterStage(null);
    const reused = await cluster.asHandler("C", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "drop-after" })
    );
    assert.equal(reused.ok, true);
    assert.equal(
      listCommittedQaNamespaces().filter((item) => item.runId === "drop-after").length,
      1
    );

    setDropConnectionAfterStage("serialization_completed");
    const writing = await cluster.asHandler("D", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "drop-write" })
    );
    assert.equal(writing.ok, false);
    assert.equal(requestTrace("beginRun:drop-write:runner-1").commitBoundary, "during_response");
    setDropConnectionAfterStage(null);
    const replayWrite = await cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "drop-write" })
    );
    assert.equal(replayWrite.namespace, listCommittedQaNamespaces().find((item) => item.runId === "drop-write")?.namespace);
  });
});
