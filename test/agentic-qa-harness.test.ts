import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { loadAgenticConfig, assertInternalQaHarness } from "../lib/agentic/config.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { nowIso } from "../lib/agentic/runtime.ts";
import {
  getEvidenceBundle,
  getScenarioRun,
  startScenarioRun
} from "../lib/agentic/qa/control-plane.ts";
import { isQaErrorResult } from "../lib/agentic/qa/errors.ts";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/index.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { engineeringInfo } from "../lib/agentic/info.ts";
import { recordMcpTiming } from "../lib/agentic/metrics.ts";
import { isOpaqueCapabilityHandle } from "../lib/agentic/capabilities.ts";

function runtimeFor(): AgenticRuntime {
  return createAgenticRuntime({
    config: loadAgenticConfig(),
    scope: {
      environment: "dev",
      principalScope: "qa-operator",
      tenantScope: "mattanutra"
    },
    store: createMemoryStore()
  });
}

beforeEach(() => {
  installGoldCatalogue();
});

afterEach(() => {
  uninstallGoldCatalogue();
  setAgenticRuntimeForTests(null);
});

describe("DEV internal QA harness", () => {
  it("keeps public tools/list at the six bare names", async () => {
    const runtime = runtimeFor();
    const listed = await handleJsonRpc(runtime, { id: 1, method: "tools/list" });
    const names = ((listed?.result?.tools as Array<{ name: string }>) ?? []).map(
      (item) => item.name
    );
    assert.deepEqual(names, [...AGENTIC_PUBLIC_TOOLS]);
  });

  it("fails closed when the harness is paired with a real payment adapter", () => {
    const config = {
      ...loadAgenticConfig(),
      internalQaHarness: true,
      environment: "dev" as const,
      paymentProvider: "stripe_test" as const,
      thailandRetailerAdapter: "mock_thailand" as const,
      continuation: "polling_only" as const
    };
    assert.throws(() => assertInternalQaHarness(config));
  });

  it("rejects unknown scenarios without mutation", async () => {
    const runtime = runtimeFor();
    const result = await startScenarioRun({
      idempotencyKey: "qa-unknown-scenario-01",
      runtime,
      scenario: "payment.invented"
    });
    assert.equal(isQaErrorResult(result), true);
    if (isQaErrorResult(result)) {
      assert.equal(result.error.reasonCode, "unsupported_scenario");
    }
  });

  it("proves decline then same-order success with stable evidence", async () => {
    const runtime = runtimeFor();
    const now = nowIso();
    const created = await planTool({
      config: runtime.config,
      now,
      payload: {
        idempotencyKey: "qa-harness-plan-000001",
        request: goldenPlanRequest()
      },
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal("ok" in created && created.ok, true);
    if (!("planHandle" in created)) {
      assert.fail("plan missing handle");
    }

    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: created.revision,
      idempotencyKey: "qa-harness-exec-000001",
      now,
      payment: runtime.payment,
      planHandle: created.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal("ok" in executed && executed.ok, true);
    if (!("orderHandle" in executed)) {
      assert.fail("execute missing orderHandle");
    }

    const declined = await startScenarioRun({
      idempotencyKey: "qa-harness-decline-0001",
      resource: { handle: executed.orderHandle, type: "order" },
      runtime,
      scenario: "payment.decline_insufficient_funds"
    });
    assert.equal("ok" in declined && declined.ok, true);
    if (!("scenarioRunHandle" in declined)) {
      assert.fail("missing decline run");
    }

    const declineView = getScenarioRun(declined.scenarioRunHandle);
    assert.equal("ok" in declineView && declineView.ok, true);
    if (!("assertions" in declineView)) {
      assert.fail("missing decline assertions");
    }
    const declineFailed = declineView.assertions.filter((item) => item.result === "fail");
    assert.deepEqual(declineFailed, []);

    const paid = await startScenarioRun({
      idempotencyKey: "qa-harness-success-0001",
      resource: { handle: executed.orderHandle, type: "order" },
      runtime,
      scenario: "payment.success"
    });
    assert.equal("ok" in paid && paid.ok, true);
    if (!("scenarioRunHandle" in paid)) {
      assert.fail("missing success run");
    }
    const paidView = getScenarioRun(paid.scenarioRunHandle);
    assert.equal("ok" in paidView && paidView.ok, true);
    if (!("assertions" in paidView) || !("evidenceBundleHandle" in paidView)) {
      assert.fail("missing success assertions");
    }
    assert.deepEqual(
      paidView.assertions.filter((item) => item.result === "fail"),
      []
    );

    const replay = await startScenarioRun({
      idempotencyKey: "qa-harness-dup-0000001",
      resource: { handle: executed.orderHandle, type: "order" },
      runtime,
      scenario: "payment.duplicate_success_event"
    });
    assert.equal("ok" in replay && replay.ok, true);
    if (!("scenarioRunHandle" in replay)) {
      assert.fail("missing replay run");
    }
    const replayView = getScenarioRun(replay.scenarioRunHandle);
    assert.equal("ok" in replayView && replayView.ok, true);
    if ("assertions" in replayView) {
      assert.deepEqual(
        replayView.assertions.filter((item) => item.result === "fail"),
        []
      );
    }

    const evidence = getEvidenceBundle(String(paidView.evidenceBundleHandle));
    assert.equal("ok" in evidence && evidence.ok, true);
    if (!("checksum" in evidence) || !("payload" in evidence)) {
      assert.fail("missing evidence");
    }
    const again = getEvidenceBundle(String(paidView.evidenceBundleHandle));
    assert.equal("checksum" in again && again.checksum, evidence.checksum);
    assert.equal(JSON.stringify(evidence.payload).includes(executed.orderHandle), false);
  });

  it("returns not_found for a foreign order handle", async () => {
    const runtime = runtimeFor();
    const result = await startScenarioRun({
      idempotencyKey: "qa-harness-foreign-0001",
      resource: { handle: "cap_not_a_real_order_handle_value_xx", type: "order" },
      runtime,
      scenario: "payment.success"
    });
    assert.equal(isQaErrorResult(result), true);
    if (isQaErrorResult(result)) {
      assert.equal(result.error.reasonCode, "not_found");
    }
  });

  it("returns redacted D7/D8 counts from opaque orderHandle only", async () => {
    const runtime = runtimeFor();
    const now = nowIso();
    const created = await planTool({
      config: runtime.config,
      now,
      payload: {
        idempotencyKey: "qa-harness-ev-plan-0001",
        request: goldenPlanRequest()
      },
      scope: runtime.scope,
      store: runtime.store
    });
    assert.ok("planHandle" in created);
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: created.revision,
      idempotencyKey: "qa-harness-ev-exec-0001",
      now,
      payment: runtime.payment,
      planHandle: created.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    assert.ok("orderHandle" in executed);

    await startScenarioRun({
      idempotencyKey: "qa-harness-ev-pay-00001",
      resource: { handle: executed.orderHandle, type: "order" },
      runtime,
      scenario: "payment.success"
    });

    const evidence = await handleQaJsonRpc(runtime, {
      id: 3,
      method: "tools/call",
      params: {
        arguments: { orderHandle: executed.orderHandle },
        name: "evidence"
      }
    });
    const counts = evidence?.result?.structuredContent as {
      paymentAttemptCount?: number;
      paymentConfirmedCount?: number;
      omsSubmitCount?: number;
      omsChildOrderCount?: number;
      orderStatus?: string;
      providerEventCount?: number;
      alertP0Count?: number;
      outboxPendingCount?: number;
    };
    assert.equal(counts.paymentConfirmedCount, 1);
    assert.equal(counts.omsSubmitCount, 1);
    assert.equal(counts.omsChildOrderCount, 1);
    assert.ok((counts.paymentAttemptCount ?? 0) >= 1);
    assert.ok((counts.providerEventCount ?? 0) >= 1);
    assert.equal(counts.alertP0Count, 0);
    assert.equal(counts.orderStatus, "completed");
    assert.equal(JSON.stringify(counts).includes(executed.orderHandle), false);
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(counts)), false);

    recordMcpTiming("info", 12);
    recordMcpTiming("execute", 40);
    recordMcpTiming("order", 18);
    const info = await engineeringInfo({ config: runtime.config, locale: "en" });
    const infoAgain = await engineeringInfo({ config: runtime.config, locale: "en" });
    if (runtime.config.environment === "dev") {
      assert.equal(
        typeof (info as { latency?: { info?: { p95Ms?: number } } }).latency?.info?.p95Ms,
        "number"
      );
      assert.equal(
        typeof (infoAgain as { latency?: { execute?: { p95Ms?: number; p99Ms?: number } } })
          .latency?.execute?.p95Ms,
        "number"
      );
      assert.equal(
        typeof (infoAgain as { latency?: { execute?: { p99Ms?: number } } }).latency?.execute
          ?.p99Ms,
        "number"
      );
      assert.equal(
        (infoAgain as { latency?: { buildId?: string } }).latency?.buildId,
        runtime.config.buildId
      );
    }
  });

  it("accepts only opaque capability handles, never raw order IDs", () => {
    assert.equal(isOpaqueCapabilityHandle("cap_" + "a".repeat(40)), true);
    assert.equal(isOpaqueCapabilityHandle("6b3a1c2e-4d5f-6789-abcd-ef0123456789"), false);
    assert.equal(isOpaqueCapabilityHandle("ord_abc"), false);
    assert.equal(isOpaqueCapabilityHandle(""), false);
  });
});
