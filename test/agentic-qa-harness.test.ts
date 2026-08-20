import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
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

afterEach(() => {
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
});
