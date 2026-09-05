import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  onRequestStageEntered,
  requestTrace,
  setRequestStageLatch,
  STAGE_OWNER
} from "../lib/agentic/qa/request-trace.ts";
import { setPermitCapacity, snapshotResourcePermits } from "../lib/agentic/qa/resource-permits.ts";
import { advanceServiceClock } from "../lib/agentic/qa/service-clock.ts";
import {
  beginV14Run,
  canonicalJson,
  createHandlerCluster,
  deferred,
  endV14Run,
  qaCall
} from "./agentic/v14/harness.ts";

describe("v1.4 deployment-path decision gate", () => {
  beforeEach(() => {
    beginV14Run();
  });
  afterEach(() => {
    endV14Run();
  });

  it("EDGE-RC-RED-01 pre-service vs post-service delay owns different stages", async () => {
    const cluster = createHandlerCluster();
    const before = deferred();
    const enteredBefore = deferred();
    setRequestStageLatch("ingress_accepted", before.promise);
    onRequestStageEntered("ingress_accepted", enteredBefore.resolve);
    const pendingBefore = cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "edge-pre" }));
    await enteredBefore.promise;
    advanceServiceClock(60_000);
    const pre = await pendingBefore;
    before.resolve();
    assert.equal((pre.error as { reasonCode?: string }).reasonCode, "SERVICE_DEADLINE_EXCEEDED");
    const preOwner = requestTrace("beginRun:edge-pre:anon").terminalOwner;
    assert.equal(preOwner, STAGE_OWNER.ingress_accepted);

    beginV14Run();
    const clusterAfter = createHandlerCluster();
    const after = deferred();
    const enteredAfter = deferred();
    setRequestStageLatch("response_handed_to_transport", after.promise);
    onRequestStageEntered("response_handed_to_transport", enteredAfter.resolve);
    const pendingAfter = clusterAfter.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "edge-post" }));
    await enteredAfter.promise;
    advanceServiceClock(60_000);
    const post = await pendingAfter;
    after.resolve();
    assert.equal((post.error as { reasonCode?: string }).reasonCode, "SERVICE_DEADLINE_EXCEEDED");
    assert.equal(requestTrace("beginRun:edge-post:anon").terminalOwner, STAGE_OWNER.response_handed_to_transport);
    assert.notEqual(preOwner, requestTrace("beginRun:edge-post:anon").terminalOwner);
  });

  it("EDGE-RC-RED-02 unready instance receives no request", async () => {
    const cluster = createHandlerCluster();
    cluster.setReady("B", false);
    await assert.rejects(
      () => cluster.asHandler("B", (runtime) => qaCall(runtime, "beginRun", { runId: "unready" })),
      /worker_unready/
    );
    const ready = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "ready" }));
    assert.equal(ready.ok, true);
  });

  it("EDGE-RC-RED-03 closed connection does not orphan the next request", async () => {
    const cluster = createHandlerCluster();
    const first = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "conn-1" }));
    assert.equal(first.ok, true);
    assert.deepEqual(snapshotResourcePermits().connection, 0);
    const second = await cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "conn-2" }));
    assert.equal(second.ok, true);
    assert.notEqual(second.namespace, first.namespace);
  });

  it("EDGE-RC-RED-04 overflow is admitted in order or fails before the service deadline", async () => {
    const cluster = createHandlerCluster();
    setPermitCapacity("admission", 1);
    const latch = deferred();
    const entered = deferred();
    setRequestStageLatch("handler_admitted", latch.promise);
    onRequestStageEntered("handler_admitted", entered.resolve);
    const first = cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "sat-1" }));
    await entered.promise;
    const extra = cluster.asHandler("B", (runtime) => qaCall(runtime, "beginRun", { runId: "sat-2" }));
    latch.resolve();
    const [a, b] = await Promise.all([first, extra]);
    assert.equal(a.ok, true);
    assert.equal(b.ok === true || (b.error as { reasonCode?: string })?.reasonCode === "SERVICE_DEADLINE_EXCEEDED", true, canonicalJson(b));
  });
});
