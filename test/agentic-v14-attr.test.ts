import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  requestTrace,
  setRequestAttributionEnabled
} from "../lib/agentic/qa/request-trace.ts";
import {
  beginV14Run,
  canonicalHash,
  canonicalJson,
  createHandlerCluster,
  endV14Run,
  qaCall
} from "./agentic/v14/harness.ts";

describe("v1.4 ATTR request-stage attribution", () => {
  beforeEach(() => {
    beginV14Run();
  });
  afterEach(() => {
    setRequestAttributionEnabled(true);
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
});
