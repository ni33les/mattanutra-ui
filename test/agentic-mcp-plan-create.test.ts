import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";

const REPORTER_IDEMPOTENCY_KEY = "prd-fresh-sleep-fitness-af-apixaban-th-20260831-03";

const REPORTER_PLAN_CREATE = {
  operation: "create",
  idempotencyKey: REPORTER_IDEMPOTENCY_KEY,
  request: {
    destinationCountry: "TH",
    locale: "en",
    profile: {
      ageYears: 52,
      lifeStage: "adult",
      sex: "male"
    },
    medicationCodes: ["apixaban"],
    conditionCodes: ["atrial_fibrillation"],
    targets: [
      { name: "creatine monohydrate", amount: 3, unit: "g" },
      { name: "magnesium", amount: 150, unit: "mg" },
      { name: "vitamin D3", amount: 1000, unit: "IU" }
    ],
    optimization: "fewest_pills",
    requirements: {}
  }
} as const;

function runtimeFor(store = createMemoryStore()): AgenticRuntime {
  return createAgenticRuntime({
    config: loadAgenticConfig(),
    scope: {
      environment: "dev",
      principalScope: "prd-report",
      tenantScope: "mattanutra"
    },
    store
  });
}

async function call(runtime: AgenticRuntime, name: string, args: unknown) {
  const response = await handleJsonRpc(runtime, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: args, name }
  });
  assert.ok(response);
  assert.equal(response.error, undefined);
  assert.ok(response.result);
  return response;
}

function structured(response: Awaited<ReturnType<typeof call>>) {
  return response.result?.structuredContent as Record<string, unknown>;
}

function errorOf(body: Record<string, unknown>) {
  const error = body.error;
  assert.ok(error && typeof error === "object");
  return error as { fieldPath?: string; reasonCode?: string; retryable?: boolean };
}

beforeEach(() => {
  installGoldCatalogue();
});

afterEach(() => {
  uninstallGoldCatalogue();
  setAgenticRuntimeForTests(null);
});

describe("MCP plan create — PRD reporter payload", () => {
  it("creates a plan from the exact PRD payload and replays the same idempotency key", async () => {
    const runtime = runtimeFor();
    const first = await call(runtime, "plan", REPORTER_PLAN_CREATE);
    const created = structured(first);

    assert.equal(first.result?.isError, false);
    assert.equal(created.ok, true);
    assert.equal(typeof created.planHandle, "string");
    assert.equal(typeof created.revision, "number");
    assert.ok(
      created.status === "ready" ||
        created.status === "needs_input" ||
        created.status === "blocked" ||
        created.status === "processing"
    );

    const second = await call(runtime, "plan", REPORTER_PLAN_CREATE);
    const replayed = structured(second);
    assert.equal(second.result?.isError, false);
    assert.equal(replayed.ok, true);
    assert.equal(replayed.planHandle, created.planHandle);
    assert.equal(replayed.revision, created.revision);
  });

  it("advertises the nested medical-context and target fields", async () => {
    const runtime = runtimeFor();
    const listed = await handleJsonRpc(runtime, { id: 2, method: "tools/list" });
    const tools = (listed?.result as { tools?: Array<{ inputSchema?: unknown; name?: string }> })
      ?.tools;
    const plan = tools?.find((tool) => tool.name === "plan");
    assert.ok(plan);
    const schema = plan.inputSchema as Record<string, unknown>;
    assert.equal(schema.additionalProperties, false);
    assert.equal("oneOf" in schema, false);
    assert.equal("$defs" in schema, false);

    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const request = properties.request;
    assert.equal(request.additionalProperties, false);
    const requestProperties = request.properties as Record<string, Record<string, unknown>>;
    assert.ok(requestProperties.medicationCodes);
    assert.ok(requestProperties.conditionCodes);
    const profile = requestProperties.profile.properties as Record<string, unknown>;
    assert.ok(profile.ageYears);
    assert.ok(profile.lifeStage);
    assert.ok(profile.sex);
    const optimization = requestProperties.optimization;
    assert.deepEqual(optimization.enum, [
      "balanced",
      "best_coverage",
      "lowest_cost",
      "fewest_pills"
    ]);
    const targetProperties = (
      requestProperties.targets.items as { properties: Record<string, unknown> }
    ).properties;
    assert.ok(targetProperties.name);
    assert.ok(targetProperties.amount);
    assert.ok(targetProperties.unit);
    assert.equal(targetProperties.frequency, undefined);
    assert.equal(targetProperties.priority, undefined);
  });

  it("rejects the reported alias fields with structured validation errors", async () => {
    const runtime = runtimeFor();
    const samples: Array<[Record<string, unknown>, string]> = [
      [
        {
          ...REPORTER_PLAN_CREATE,
          request: {
            ...REPORTER_PLAN_CREATE.request,
            profile: { age: 52, lifeStage: "adult", sex: "male" }
          }
        },
        "request.profile.ageYears"
      ],
      [
        {
          ...REPORTER_PLAN_CREATE,
          request: {
            ...REPORTER_PLAN_CREATE.request,
            conditions: ["atrial_fibrillation"]
          }
        },
        "request.conditions"
      ],
      [
        {
          ...REPORTER_PLAN_CREATE,
          request: {
            ...REPORTER_PLAN_CREATE.request,
            medications: ["apixaban"]
          }
        },
        "request.medications"
      ],
      [
        {
          ...REPORTER_PLAN_CREATE,
          request: {
            ...REPORTER_PLAN_CREATE.request,
            targets: [
              {
                name: "magnesium",
                amount: 150,
                unit: "mg",
                frequency: "daily"
              }
            ]
          }
        },
        "request.targets[0].frequency"
      ],
      [
        {
          ...REPORTER_PLAN_CREATE,
          request: {
            ...REPORTER_PLAN_CREATE.request,
            requirements: { fewestPills: true }
          }
        },
        "request.requirements.fewestPills"
      ],
      [
        {
          ...REPORTER_PLAN_CREATE,
          request: {
            ...REPORTER_PLAN_CREATE.request,
            requirements: { excludeIngredients: ["gelatin"] }
          }
        },
        "request.requirements.excludeIngredients"
      ],
      [
        {
          ...REPORTER_PLAN_CREATE,
          request: {
            ...REPORTER_PLAN_CREATE.request,
            requirements: { notes: "keep it simple" }
          }
        },
        "request.requirements.notes"
      ]
    ];

    for (const [args, fieldPath] of samples) {
      const response = await call(runtime, "plan", args);
      const body = structured(response);
      assert.equal(response.result?.isError, true, fieldPath);
      assert.equal(body.ok, false, fieldPath);
      const error = errorOf(body);
      assert.ok(
        error.reasonCode === "unexpected_property" ||
          error.reasonCode === "required" ||
          error.reasonCode === "invalid_request",
        `${fieldPath} ${error.reasonCode}`
      );
      assert.equal(error.fieldPath, fieldPath, `${fieldPath} got ${error.fieldPath}`);
    }
  });

  it("maps store failures to temporarily_unavailable instead of throwing", async () => {
    const store = createMemoryStore();
    store.getIdempotency = async () => {
      throw new Error("relation \"public.agentic_idempotency_records\" does not exist");
    };
    const runtime = runtimeFor(store);
    const response = await call(runtime, "plan", REPORTER_PLAN_CREATE);
    const body = structured(response);
    assert.equal(response.result?.isError, true);
    assert.equal(body.ok, false);
    const error = errorOf(body);
    assert.equal(error.reasonCode, "temporarily_unavailable");
    assert.equal(error.retryable, true);
  });
});
