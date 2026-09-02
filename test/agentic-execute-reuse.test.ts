import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { simulatePayment } from "../lib/agentic/qa/simulate.ts";

function runtimeFor(): AgenticRuntime {
  return createAgenticRuntime({
    config: loadAgenticConfig(),
    scope: {
      environment: "dev",
      principalScope: "tester",
      tenantScope: "mattanutra"
    },
    store: createMemoryStore()
  });
}

async function call(runtime: AgenticRuntime, name: string, args: unknown) {
  const response = await handleJsonRpc(runtime, {
    id: 1,
    method: "tools/call",
    params: { arguments: args, name }
  });
  assert.ok(response?.result);
  return response.result.structuredContent as Record<string, unknown>;
}

beforeEach(() => {
  installGoldCatalogue();
});

afterEach(() => {
  uninstallGoldCatalogue();
  setAgenticRuntimeForTests(null);
});

describe("execute key reuses one unpaid order", () => {
  it("returns the same orderHandle for two execute keys on one plan revision", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "exec-reuse-plan-0000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 500, name: "Vitamin C", unit: "mg" }]
      }
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.status, "ready");

    const first = await call(runtime, "execute", {
      expectedRevision: plan.revision,
      idempotencyKey: "exec-reuse-key-a-000001",
      planHandle: plan.planHandle
    });
    const second = await call(runtime, "execute", {
      expectedRevision: plan.revision,
      idempotencyKey: "exec-reuse-key-b-000001",
      planHandle: plan.planHandle
    });

    assert.equal(first.ok, true);
    const secondOk = second.ok === true && typeof second.orderHandle === "string";
    const secondConflict =
      second.ok === false &&
      (second.error as { reasonCode?: string } | undefined)?.reasonCode === "revision_conflict";
    assert.ok(secondOk || secondConflict);
    if (secondOk) {
      assert.equal(first.orderHandle, second.orderHandle);
      assert.equal(first.checkoutUrl, second.checkoutUrl);
      assert.equal(first.orderReference, second.orderReference);
      assert.equal(second.paymentStatus, "unpaid");
      assert.equal(second.orderStatus, "open");
    }
    assert.equal(first.paymentStatus, "unpaid");
    assert.equal(first.orderStatus, "open");
  });

  it("replays execute with the live payment state after pay", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "exec-replay-plan-0000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 500, name: "Vitamin C", unit: "mg" }]
      }
    });
    assert.equal(plan.status, "ready");
    const key = "exec-replay-key-same-0001";
    const first = await call(runtime, "execute", {
      expectedRevision: plan.revision,
      idempotencyKey: key,
      planHandle: plan.planHandle
    });
    assert.equal(first.paymentStatus, "unpaid");
    await simulatePayment({
      config: runtime.config,
      now: new Date().toISOString(),
      orderHandle: String(first.orderHandle),
      scenario: "success",
      scope: runtime.scope,
      store: runtime.store
    });
    const replay = await call(runtime, "execute", {
      expectedRevision: plan.revision,
      idempotencyKey: key,
      planHandle: plan.planHandle
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.orderHandle, first.orderHandle);
    assert.equal(replay.paymentStatus, first.paymentStatus);
    const polled = await call(runtime, "order", { orderHandle: first.orderHandle });
    assert.equal(polled.paymentStatus, "paid");
    assert.equal(polled.orderStatus, "completed");
    assert.ok(Number(polled.stateVersion) >= 2);
  });

  it("does not mint a second chargeable order after pay", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "exec-dup-plan-0000000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 500, name: "Vitamin C", unit: "mg" }]
      }
    });
    assert.equal(plan.status, "ready");
    const first = await call(runtime, "execute", {
      expectedRevision: plan.revision,
      idempotencyKey: "exec-dup-key-a-0000001",
      planHandle: plan.planHandle
    });
    await simulatePayment({
      config: runtime.config,
      now: new Date().toISOString(),
      orderHandle: String(first.orderHandle),
      scenario: "success",
      scope: runtime.scope,
      store: runtime.store
    });
    const second = await call(runtime, "execute", {
      expectedRevision: plan.revision,
      idempotencyKey: "exec-dup-key-b-0000001",
      planHandle: plan.planHandle
    });
    const secondOk = second.ok === true && second.orderHandle === first.orderHandle;
    const secondConflict =
      second.ok === false &&
      (second.error as { reasonCode?: string } | undefined)?.reasonCode === "revision_conflict";
    assert.ok(secondOk || secondConflict);
    const polled = await call(runtime, "order", { orderHandle: first.orderHandle });
    assert.equal(polled.paymentStatus, "paid");
    assert.equal(polled.orderStatus, "completed");
  });
});
