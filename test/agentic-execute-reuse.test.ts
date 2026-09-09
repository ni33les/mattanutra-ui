import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { handleCompletedFullJsonRpc as handleJsonRpc } from "./helpers/completed-mcp-client.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { simulatePayment } from "../lib/agentic/qa/simulate.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import type { PlanResult } from "../lib/agentic/plan/types.ts";

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
  async function legacyPlan(runtime: AgenticRuntime, key: string, executeFirst = false) {
    const plan = await call(runtime, "plan", { operation: "create", idempotencyKey: `${key}-create`, request: {
      destinationCountry: "TH", locale: "en", optimization: "balanced", profile: { ageYears: 38, lifeStage: "adult" },
      requirements: {}, targets: [{ amount: 500, name: "Vitamin C", unit: "mg" }]
    } });
    assert.equal(plan.status, "ready");
    const checkout = executeFirst ? await call(runtime, "execute", { expectedRevision: plan.revision,
      idempotencyKey: `${key}-execute`, planHandle: plan.planHandle }) : null;
    if (checkout) assert.equal(checkout.ok, true);
    const capability = await resolveCapability({ action: "plan.read", config: runtime.config, handle: String(plan.planHandle),
      now: new Date().toISOString(), resourceType: "plan", scope: runtime.scope, store: runtime.store });
    assert.ok(capability);
    const revision = await runtime.store.getPlanRevision(capability.resourceId, Number(plan.revision));
    assert.ok(revision);
    const result = { ...(revision.result as PlanResult) };
    delete result.contractVersion;
    await runtime.store.updatePlanRevision({ ...revision, result });
    return { plan, checkout };
  }

  it("requires explicit refresh before a new checkout for a legacy unexecuted plan", async () => {
    const runtime = runtimeFor();
    const { plan } = await legacyPlan(runtime, "legacy-unexecuted-v4");
    const result = await call(runtime, "execute", { expectedRevision: plan.revision, idempotencyKey: "legacy-new-checkout-v4", planHandle: plan.planHandle });
    assert.equal(result.ok, false);
    assert.equal((result.error as { reasonCode: string }).reasonCode, "contract_refresh_required");
  });

  it("resumes an existing unpaid legacy checkout before applying new-version gates", async () => {
    const runtime = runtimeFor();
    const { plan, checkout } = await legacyPlan(runtime, "legacy-unpaid-checkout-v4", true);
    const replay = await call(runtime, "execute", { expectedRevision: plan.revision, idempotencyKey: "legacy-unpaid-new-key-v4", planHandle: plan.planHandle });
    assert.equal(replay.ok, true);
    assert.equal(replay.checkoutUrl, checkout!.checkoutUrl);
    assert.equal(replay.orderHandle, checkout!.orderHandle);
    assert.equal(replay.paymentStatus, "unpaid");
  });

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
