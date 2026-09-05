import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  onRequestStageEntered,
  requestTrace,
  setRequestStageLatch
} from "../lib/agentic/qa/request-trace.ts";
import { listCommittedQaNamespaces } from "../lib/agentic/qa/persist.ts";
import { snapshotResourcePermits } from "../lib/agentic/qa/resource-permits.ts";
import { advanceServiceClock, CLIENT_READ_DEADLINE_MS } from "../lib/agentic/qa/service-clock.ts";
import {
  beginV14Run,
  canonicalHash,
  canonicalJson,
  createHandlerCluster,
  deferred,
  endV14Run,
  qaCall
} from "./agentic/v14/harness.ts";

describe("v1.4 service deadline and typed failure", () => {
  beforeEach(() => {
    beginV14Run();
  });
  afterEach(() => {
    endV14Run();
  });

  it("DEADLINE-RED-01 stalled dependency returns SERVICE_DEADLINE_EXCEEDED before 90s", async () => {
    const cluster = createHandlerCluster();
    const latch = deferred();
    const entered = deferred();
    setRequestStageLatch("durable_started", latch.promise);
    onRequestStageEntered("durable_started", entered.resolve);
    const pending = cluster.asHandler("A", (runtime) => qaCall(runtime, "beginRun", { runId: "A" }));
    await entered.promise;
    advanceServiceClock(60_000);
    const result = await pending;
    latch.resolve();
    assert.equal(result.ok, false, canonicalJson(result));
    const error = result.error as { reasonCode?: string; retryable?: boolean; correlationId?: string };
    assert.equal(error.reasonCode, "SERVICE_DEADLINE_EXCEEDED");
    assert.equal(error.retryable, true);
    assert.equal(typeof error.correlationId, "string");
    assert.equal(60_000 < CLIENT_READ_DEADLINE_MS, true);
  });

  it("DEADLINE-RED-02 deadline before commit writes nothing", async () => {
    const cluster = createHandlerCluster();
    const latch = deferred();
    const entered = deferred();
    setRequestStageLatch("durable_started", latch.promise);
    onRequestStageEntered("durable_started", entered.resolve);
    const pending = cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "dl-pre" })
    );
    await entered.promise;
    advanceServiceClock(60_000);
    const result = await pending;
    latch.resolve();
    assert.equal(result.ok, false);
    assert.equal(listCommittedQaNamespaces().length, 0);
    assert.deepEqual(snapshotResourcePermits(), {
      admission: 0,
      connection: 0,
      database: 0,
      lock: 0,
      worker: 0
    });
  });

  it("DEADLINE-RED-03 deadline after commit replays the namespace", async () => {
    const cluster = createHandlerCluster();
    const latch = deferred();
    const entered = deferred();
    setRequestStageLatch("serialization_completed", latch.promise);
    onRequestStageEntered("serialization_completed", entered.resolve);
    const pending = cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "dl-post" })
    );
    await entered.promise;
    advanceServiceClock(60_000);
    const lost = await pending;
    latch.resolve();
    assert.equal(lost.ok, false);
    setRequestStageLatch("serialization_completed", Promise.resolve());
    const replay = await cluster.asHandler("B", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "dl-post" })
    );
    assert.equal(replay.ok, true);
    assert.equal(listCommittedQaNamespaces().filter((item) => item.runId === "dl-post").length, 1);
  });

  it("DEADLINE-RED-04 simultaneous deadlines stay isolated", async () => {
    const cluster = createHandlerCluster();
    const latch = deferred();
    let entered = 0;
    const both = deferred();
    setRequestStageLatch("durable_started", latch.promise);
    onRequestStageEntered("durable_started", () => {
      entered += 1;
      if (entered === 2) {
        both.resolve();
      }
    });
    const first = cluster.asHandler("A", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: "iso-a" })
    );
    const second = cluster.asHandler("B", (runtime) =>
      qaCall(runtime, "beginRun", { clientKey: "runner-2", runId: "iso-b" })
    );
    await both.promise;
    advanceServiceClock(60_000);
    const [a, b] = await Promise.all([first, second]);
    latch.resolve();
    assert.equal(a.ok, false);
    assert.equal(b.ok, false);
    assert.notEqual(
      (a.error as { correlationId?: string }).correlationId,
      (b.error as { correlationId?: string }).correlationId
    );
    assert.equal(listCommittedQaNamespaces().length, 0);
  });

  it("DEADLINE-RED-05 success, deadline and replay are byte-identical twice", async () => {
    const hashes = [];
    for (const pass of [1, 2]) {
      beginV14Run();
      const cluster = createHandlerCluster();
      const success = await cluster.asHandler("A", (runtime) =>
        qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: `ok${pass}` })
      );
      const latch = deferred();
      const entered = deferred();
      setRequestStageLatch("durable_started", latch.promise);
      onRequestStageEntered("durable_started", entered.resolve);
      const pending = cluster.asHandler("B", (runtime) =>
        qaCall(runtime, "beginRun", { clientKey: "runner-1", runId: `dl${pass}` })
      );
      await entered.promise;
      advanceServiceClock(60_000);
      const deadline = await pending;
      latch.resolve();
      hashes.push(
        canonicalHash({
          success: success.ok,
          deadline: (deadline.error as { reasonCode?: string }).reasonCode,
          retryable: (deadline.error as { retryable?: boolean }).retryable,
          permits: snapshotResourcePermits(),
          owner: requestTrace(`beginRun:dl${pass}:runner-1`).terminalOwner
        })
      );
      endV14Run();
    }
    assert.equal(new Set(hashes).size, 1, canonicalJson(hashes));
  });
});
