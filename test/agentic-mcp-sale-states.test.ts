import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { replaceCatalogueSnapshot } from "../lib/agentic/catalogue/snapshot.ts";
import type { CatalogueProduct } from "../lib/agentic/catalogue/types.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";

const PUBLIC_TOOLS = ["info", "plan", "execute", "order", "support", "feedback", "evidence"];

const D3_PLAN = {
  operation: "create",
  idempotencyKey: "sale-states-mcp-d3-plan-key-01",
  request: {
    destinationCountry: "TH",
    locale: "en",
    optimization: "fewest_pills",
    profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
    requirements: {},
    targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
  }
} as const;

function runtimeFor(): AgenticRuntime {
  return createAgenticRuntime({
    config: loadAgenticConfig(),
    scope: {
      environment: "dev",
      principalScope: "sale-states",
      tenantScope: "mattanutra"
    },
    store: createMemoryStore()
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

function basketNames(plan: Record<string, unknown>) {
  return ((plan.basket as Array<{ productName?: string }> | undefined) ?? []).map(
    (item) => String(item.productName ?? "")
  );
}

function d3Fixture() {
  const found = fixtureSnapshot().products.find(
    (item) => item.candidate.title === "Vitamin D3 2000 IU"
  );
  assert.ok(found);
  return found;
}

function cloneProduct(
  source: CatalogueProduct,
  patch: {
    orderable?: boolean;
    status?: CatalogueProduct["candidate"]["status"];
    title: string;
    uuid: string;
  }
): CatalogueProduct {
  return {
    ...source,
    candidate: {
      ...source.candidate,
      brandStatus: patch.status === "approved" ? "pending_review" : source.candidate.brandStatus,
      id: patch.uuid,
      retailSellableProductId: patch.orderable === false ? null : `sellable-${patch.uuid}`,
      status: patch.status ?? source.candidate.status,
      title: patch.title,
      validation: {
        checkedAt: new Date(0).toISOString(),
        matchableFactCount: source.candidate.facts.length,
        reasons: [],
        status: "failed",
        summary: "forced failed validation"
      }
    },
    orderable: patch.orderable ?? source.orderable,
    productId: `prd_${patch.uuid.replace(/-/g, "")}`,
    retailerSku: patch.uuid
  };
}

function installOverlay(extra: readonly CatalogueProduct[]) {
  const base = fixtureSnapshot();
  replaceCatalogueSnapshot({
    ...base,
    products: [...base.products, ...extra]
  });
}

beforeEach(() => {
  installGoldCatalogue();
});

afterEach(() => {
  uninstallGoldCatalogue();
  setAgenticRuntimeForTests(null);
});

describe("MCP sale states", () => {
  it("lists the public tools and advertises nested plan request fields", async () => {
    const runtime = runtimeFor();
    const listed = await handleJsonRpc(runtime, { id: 2, method: "tools/list" });
    const tools = (
      listed?.result as {
        tools?: Array<{ description?: string; inputSchema?: unknown; name?: string }>;
      }
    )?.tools;
    assert.deepEqual(
      (tools ?? []).map((tool) => tool.name),
      PUBLIC_TOOLS
    );
    const plan = tools?.find((tool) => tool.name === "plan");
    assert.ok(plan);
    const schema = plan.inputSchema as Record<string, unknown>;
    const encoded = JSON.stringify(schema);
    assert.match(encoded, /"medicationCodes"/);
    assert.match(encoded, /"conditionCodes"/);
    assert.match(encoded, /"targets"/);
    assert.match(encoded, /"optimization"/);
    assert.match(encoded, /"excludeSupplementIds"/);
    assert.match(encoded, /"female"/);
    assert.match(encoded, /"male"/);
    assert.match(String(plan.description ?? ""), /omit the field if unknown/i);
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const requestProperties = ((properties.request as { properties?: Record<string, Record<string, unknown>> } | undefined)
      ?.properties ?? {}) as Record<string, Record<string, unknown>>;
    if (Object.keys(requestProperties).length > 0) {
      assert.ok(requestProperties.medicationCodes);
      assert.ok(requestProperties.conditionCodes);
      assert.ok(requestProperties.targets);
      assert.ok(requestProperties.optimization);
      assert.ok(requestProperties.requirements);
      const sex = (requestProperties.profile.properties as Record<string, { enum?: string[] }>).sex;
      assert.deepEqual(sex.enum, ["female", "male"]);
    }
  });

  it("does not put a pending leftover or unselected SKU in the plan basket", async () => {
    const source = d3Fixture();
    installOverlay([
      cloneProduct(source, {
        orderable: true,
        status: "pending_review",
        title: "Leftover pending D3",
        uuid: "c1111111-1111-1111-1111-111111111111"
      }),
      cloneProduct(source, {
        orderable: false,
        status: "approved",
        title: "Unselected approved D3",
        uuid: "c2222222-2222-2222-2222-222222222222"
      })
    ]);
    const runtime = runtimeFor();
    const created = structured(await call(runtime, "plan", D3_PLAN));
    const names = basketNames(created);
    assert.equal(names.includes("Leftover pending D3"), false);
    assert.equal(names.includes("Unselected approved D3"), false);
    assert.equal(names.some((name) => /vitamin d3/i.test(name)), true);
  });

  it("may use an already-approved selected SKU whose validation failed", async () => {
    const base = fixtureSnapshot();
    replaceCatalogueSnapshot({
      ...base,
      products: base.products.map((item) =>
        item.candidate.title === "Vitamin D3 2000 IU"
          ? {
              ...item,
              candidate: {
                ...item.candidate,
                brandStatus: "pending_review",
                validation: {
                  checkedAt: new Date(0).toISOString(),
                  matchableFactCount: item.candidate.facts.length,
                  reasons: [],
                  status: "failed",
                  summary: "forced failed validation"
                }
              }
            }
          : item
      )
    });
    const runtime = runtimeFor();
    const created = structured(await call(runtime, "plan", D3_PLAN));
    assert.equal(
      basketNames(created).some((name) => name === "Vitamin D3 2000 IU"),
      true
    );
  });
});
