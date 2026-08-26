import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { isAgenticErrorResult } from "../lib/agentic/contract/errors.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import type { AgenticStore } from "../lib/agentic/store/types.ts";

function supplementId(name: string) {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);
  assert.ok(found, name);
  return found.supplementId;
}

function eightTargetRequest() {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "balanced" as const,
    profile: { ageYears: 38, lifeStage: "adult" as const, sex: "male" as const },
    requirements: {},
    targets: [
      { amount: 2000, name: "Vitamin D3", supplementId: supplementId("Vitamin D3"), unit: "IU" },
      { amount: 1000, name: "Omega-3", supplementId: supplementId("Omega-3"), unit: "mg" },
      { amount: 300, name: "Magnesium", supplementId: supplementId("Magnesium"), unit: "mg" },
      { amount: 1000, name: "Vitamin B12", supplementId: supplementId("Vitamin B12"), unit: "mcg" },
      { amount: 1000, name: "Vitamin C", supplementId: supplementId("Vitamin C"), unit: "mg" },
      { amount: 25, name: "Zinc", supplementId: supplementId("Zinc"), unit: "mg" },
      { amount: 10, name: "Iron", supplementId: supplementId("Iron"), unit: "mg" },
      { amount: 100, name: "CoQ10", supplementId: supplementId("CoQ10"), unit: "mg" }
    ]
  };
}

function timedStore(store: AgenticStore) {
  const durations: number[] = [];
  const original = store.transaction.bind(store);
  store.transaction = async (work) => {
    const started = Date.now();

    try {
      return await original(work);
    } finally {
      durations.push(Date.now() - started);
    }
  };

  return { durations, store };
}

beforeEach(() => {
  installGoldCatalogue();
});

afterEach(() => {
  uninstallGoldCatalogue();
  setAgenticRuntimeForTests(null);
});

describe("consistency r2 planTool boundaries", () => {
  it("keeps plan transactions short and returns a terminal or processing payload", async () => {
    const { durations, store } = timedStore(createMemoryStore());
    const runtime = createAgenticRuntime({
      config: loadAgenticConfig(),
      scope: {
        environment: "dev",
        principalScope: "r2-plan",
        tenantScope: "mattanutra"
      },
      store
    });
    const started = Date.now();
    const created = await planTool({
      config: runtime.config,
      now: new Date().toISOString(),
      payload: {
        idempotencyKey: "r2-eight-target-01",
        request: eightTargetRequest()
      },
      scope: runtime.scope,
      store
    });
    const elapsed = Date.now() - started;

    assert.equal(isAgenticErrorResult(created), false);
    assert.ok(durations.length >= 2, "prepare and persist must be separate transactions");
    assert.ok(
      durations.every((ms) => ms < 200),
      `plan transactions must stay short, got ${durations.join(",")}`
    );
    if (isAgenticErrorResult(created)) {
      throw new Error("plan create failed");
    }
    assert.ok(
      created.status === "processing" ||
        created.status === "ready" ||
        created.status === "needs_input" ||
        created.status === "blocked"
    );

    if (created.status === "processing") {
      assert.ok(elapsed < 2000);
      const polled = await planTool({
        config: runtime.config,
        now: new Date().toISOString(),
        payload: {
          expectedRevision: created.revision,
          idempotencyKey: "r2-eight-target-poll",
          planHandle: created.planHandle
        },
        scope: runtime.scope,
        store
      });
      assert.equal(isAgenticErrorResult(polled), false);
      if (isAgenticErrorResult(polled)) {
        throw new Error("plan poll failed");
      }
      assert.notEqual(polled.status, "processing");
      assert.equal(polled.revision, created.revision);
    }

    const replay = await planTool({
      config: runtime.config,
      now: new Date().toISOString(),
      payload: {
        idempotencyKey: "r2-eight-target-01",
        request: eightTargetRequest()
      },
      scope: runtime.scope,
      store
    });
    assert.equal(isAgenticErrorResult(replay), false);
    if (isAgenticErrorResult(replay)) {
      throw new Error("plan replay failed");
    }
    assert.equal(replay.planHandle, created.planHandle);
    assert.equal(replay.revision, created.revision);
    assert.notEqual(replay.status, "processing");
  });

  it("polls a terminal plan without allocating a new revision", async () => {
    const store = createMemoryStore();
    const runtime = createAgenticRuntime({
      config: loadAgenticConfig(),
      scope: {
        environment: "dev",
        principalScope: "r2-poll",
        tenantScope: "mattanutra"
      },
      store
    });
    const created = await planTool({
      config: runtime.config,
      now: new Date().toISOString(),
      payload: {
        idempotencyKey: "r2-poll-create-0001",
        request: {
          destinationCountry: "TH",
          locale: "en",
          optimization: "balanced",
          profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
          requirements: {},
          targets: [
            {
              amount: 2000,
              name: "Vitamin D3",
              supplementId: supplementId("Vitamin D3"),
              unit: "IU"
            }
          ]
        }
      },
      scope: runtime.scope,
      store
    });

    assert.equal(isAgenticErrorResult(created), false);
    if (isAgenticErrorResult(created)) {
      throw new Error("plan create failed");
    }
    assert.notEqual(created.status, "processing");

    const polled = await planTool({
      config: runtime.config,
      now: new Date().toISOString(),
      payload: {
        expectedRevision: created.revision,
        idempotencyKey: "r2-poll-read-000001",
        planHandle: created.planHandle
      },
      scope: runtime.scope,
      store
    });

    assert.equal(isAgenticErrorResult(polled), false);
    if (isAgenticErrorResult(polled)) {
      throw new Error("plan poll failed");
    }
    assert.equal(polled.revision, created.revision);
    assert.equal(polled.status, created.status);
  });
});
