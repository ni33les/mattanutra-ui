import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { simulatePayment } from "../lib/agentic/qa/simulate.ts";

function supplementId(name: string) {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);
  assert.ok(found, name);
  return found.supplementId;
}

function j1Request(overrides: Record<string, unknown> = {}) {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "balanced",
    profile: {
      ageYears: 38,
      lifeStage: "adult",
      sex: "male"
    },
    requirements: {},
    targets: [
      { amount: 2000, name: "Vitamin D3", supplementId: supplementId("Vitamin D3"), unit: "IU" },
      { amount: 1000, name: "Omega-3", supplementId: supplementId("Omega-3"), unit: "mg" },
      { amount: 300, name: "Magnesium", supplementId: supplementId("Magnesium"), unit: "mg" },
      { amount: 1000, name: "Vitamin B12", supplementId: supplementId("Vitamin B12"), unit: "mcg" },
      { amount: 1000, name: "Vitamin C", supplementId: supplementId("Vitamin C"), unit: "mg" }
    ],
    ...overrides
  };
}

function runtimeFor(principal: string | null = null): AgenticRuntime {
  return createAgenticRuntime({
    config: loadAgenticConfig(),
    scope: {
      environment: "dev",
      principalScope: principal,
      tenantScope: "mattanutra"
    },
    store: createMemoryStore()
  });
}

async function call(runtime: AgenticRuntime, name: string, args: unknown, id = 1) {
  const response = await handleJsonRpc(runtime, {
    id,
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

describe("agentic DEV flow", () => {
  it("rejects Vitamin D3 in grams before search", async () => {
    const runtime = runtimeFor();
    const result = await call(runtime, "plan", {
      idempotencyKey: "create-d3-grams-0001",
      request: j1Request({
        targets: [
          { amount: 1, name: "Vitamin D3", supplementId: supplementId("Vitamin D3"), unit: "g" }
        ]
      })
    });

    assert.equal(result.ok, false);
    assert.equal((result.error as { reasonCode: string }).reasonCode, "unsupported_unit");
    assert.equal(result.basket, undefined);
  });

  it("rejects unsupported destination countries before matching", async () => {
    const runtime = runtimeFor();
    const result = await call(runtime, "plan", {
      idempotencyKey: "create-sg-country-0001",
      request: j1Request({ destinationCountry: "SG" })
    });

    assert.equal(result.ok, false);
    assert.equal((result.error as { reasonCode: string }).reasonCode, "unsupported_country");
    assert.match(
      (result.error as { message: string }).message,
      /cannot deliver to Singapore/i
    );
    assert.match((result.error as { message: string }).message, /Thailand/);
    assert.equal((result.error as { message: string }).message.includes("locked"), false);
  });

  it("creates a deterministic J1 stack, freezes checkout, mocks payment, then supports and feedback", async () => {
    const runtime = runtimeFor("principal-a");
    const created = await call(runtime, "plan", {
      idempotencyKey: "create-j1-wellness-01",
      request: j1Request()
    });

    assert.equal(created.ok, true);
    assert.equal(created.status, "ready");
    assert.ok(Array.isArray(created.basket));
    assert.ok((created.basket as unknown[]).length >= 4);
    assert.ok(((created.alternatives as unknown[] | undefined) ?? []).length <= 2);
    assert.equal(typeof created.planHandle, "string");
    assert.ok(String(created.planHandle).length >= 32);

    const replay = await call(runtime, "plan", {
      idempotencyKey: "create-j1-wellness-01",
      request: j1Request()
    });
    assert.equal(replay.planHandle, created.planHandle);
    assert.equal(replay.revision, created.revision);

    const conflict = await call(runtime, "plan", {
      idempotencyKey: "create-j1-wellness-01",
      request: j1Request({ optimization: "lowest_cost" })
    });
    assert.equal(conflict.ok, false);
    assert.equal((conflict.error as { reasonCode: string }).reasonCode, "idempotency_conflict");

    const executed = await call(runtime, "execute", {
      expectedRevision: created.revision,
      idempotencyKey: "execute-j1-wellness-01",
      planHandle: created.planHandle
    });

    assert.equal(executed.ok, true);
    assert.equal(executed.orderStatus, "open");
    assert.equal(executed.paymentStatus, "unpaid");
    assert.equal(executed.stateVersion, 1);
    assert.match(String(executed.checkoutUrl), /\/basket\/checkout\?mode=agentic/);

    const declined = await simulatePayment({
      config: runtime.config,
      now: new Date().toISOString(),
      orderHandle: String(executed.orderHandle),
      scenario: "decline_insufficient_funds",
      scope: runtime.scope,
      store: runtime.store
    });

    assert.equal((declined as { paymentStatus: string }).paymentStatus, "unpaid");
    assert.equal((declined as { stateVersion: number }).stateVersion, 1);
    assert.equal((declined as { retryable: boolean }).retryable, true);

    const paid = await simulatePayment({
      config: runtime.config,
      now: new Date().toISOString(),
      orderHandle: String(executed.orderHandle),
      scenario: "success",
      scope: runtime.scope,
      store: runtime.store
    });

    assert.equal((paid as { paymentStatus: string }).paymentStatus, "paid");
    assert.equal((paid as { stateVersion: number }).stateVersion, 2);
    assert.equal((paid as { orderStatus: string }).orderStatus, "completed");
    assert.equal((paid as { fulfilment: { status: string } }).fulfilment.status, "processing");

    const duplicate = await simulatePayment({
      config: runtime.config,
      now: new Date().toISOString(),
      orderHandle: String(executed.orderHandle),
      scenario: "duplicate_success",
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal((duplicate as { stateVersion: number }).stateVersion, 2);

    const polled = await call(runtime, "order", { orderHandle: executed.orderHandle });
    assert.equal(polled.paymentStatus, "paid");
    assert.equal(polled.nextAction, "none");

    const support = await call(runtime, "support", {
      idempotencyKey: "support-j1-00000001",
      message: "When will this ship?",
      orderHandle: executed.orderHandle
    });
    assert.equal(support.ok, true);
    assert.equal(support.status, "open");
    assert.match(String(support.caseReference), /^tkt_/);

    const feedback = await call(runtime, "feedback", {
      consentConfirmed: true,
      expectedRevision: created.revision,
      idempotencyKey: "feedback-j1-0000001",
      planHandle: created.planHandle,
      summary: "Clear coverage explanation."
    });
    assert.deepEqual(feedback, { accepted: true, ok: true });
  });

  it("keeps principal B from reading principal A capabilities", async () => {
    const alice = runtimeFor("alice");
    const bob = runtimeFor("bob");
    const created = await call(alice, "plan", {
      idempotencyKey: "alice-plan-00000001",
      request: j1Request()
    });
    const stolen = await call(bob, "plan", {
      expectedRevision: created.revision,
      idempotencyKey: "bob-steal-000000001",
      planHandle: created.planHandle,
      request: j1Request({ optimization: "lowest_cost" })
    });

    assert.equal(stolen.ok, false);
    assert.equal((stolen.error as { reasonCode: string }).reasonCode, "not_found");
  });

  it("blocks CKD plus magnesium without producing a ready execute", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "ckd-magnesium-000001",
      request: j1Request({
        conditionCodes: ["ckd"],
        targets: [
          { amount: 300, name: "Magnesium", supplementId: supplementId("Magnesium"), unit: "mg" }
        ]
      })
    });

    assert.equal(created.status, "blocked");
    assert.ok(Array.isArray(created.guidanceIds) && created.guidanceIds.length > 0);

    const executed = await call(runtime, "execute", {
      expectedRevision: created.revision,
      idempotencyKey: "ckd-execute-00000001",
      planHandle: created.planHandle
    });
    assert.equal(executed.ok, false);
    assert.equal((executed.error as { reasonCode: string }).reasonCode, "plan_not_ready");
  });

  it("selects algae omega-3 under a plant-based constraint", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "plant-omega-00000001",
      request: j1Request({
        requirements: {
          dietaryPreference: "plant_based",
          omega3SourcePreference: "algae_only"
        },
        targets: [
          { amount: 1000, name: "Omega-3", supplementId: supplementId("Omega-3"), unit: "mg" }
        ]
      })
    });

    assert.equal(created.ok, true);
    const names = (created.basket as Array<{ productName: string }>).map((item) => item.productName);
    assert.ok(names.some((name) => /algae/i.test(name)));
    assert.equal(names.some((name) => /fish/i.test(name)), false);
  });
});
