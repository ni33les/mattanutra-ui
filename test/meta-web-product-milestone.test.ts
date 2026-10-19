import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, it, mock } from "node:test";
import type postgres from "postgres";
import { validateWebProductMilestone } from "../lib/meta-web-product-milestone.ts";

let selectionError: Error | null = null;
let selectionInput: Record<string, unknown> = {};
mock.module("../lib/retail-product-checkout.ts", { namedExports: {
  currentWebCheckoutSelection: async (_sql: unknown, input: Record<string, unknown>) => {
    selectionInput = input;
    if (selectionError) throw selectionError;
    return { recommendations: [{ price_amount: "120.50", currency: "THB" }, { price_amount: 79.5, currency: "THB" }] };
  }
} });
const planId = randomUUID(), context = randomUUID(), runId = randomUUID();
const ids = [randomUUID(), randomUUID()];
const data = (stage: string) => ({ plan_id: planId, locale: "th", funnel_stage: stage });
function database(results: unknown[][]) {
  let index = 0;
  return ((...args: unknown[]) => {
    if (typeof args[0] === "string" || Array.isArray(args[0]) && !Object.hasOwn(args[0], "raw")) return {};
    if (Array.isArray(args[0]) && !args[0].join("").trim().startsWith("select")) return {};
    assert.ok(index < results.length, "Unexpected database access");
    return Promise.resolve(results[index++]);
  }) as unknown as postgres.Sql;
}

describe("validated free web reveal milestones", () => {
  beforeEach(() => { selectionError = null; selectionInput = {}; });
  it("requires a bound current assessment and never accepts invalid evidence", async () => {
    for (const revision of [undefined, -1, 1.2, "not-a-revision"]) {
      assert.equal(await validateWebProductMilestone(database([]), context, "ViewContent", data("formula"), { revision }), null);
    }
    assert.equal(await validateWebProductMilestone(database([[]]), context, "ViewContent", data("formula"), { revision: 2 }), null);
    assert.equal(await validateWebProductMilestone(database([[{}], []]), context, "ViewContent", data("products"), { revision: 2, runId }), null);
  });
  it("uses stored formula identity and keeps server-only evidence outside the payload", async () => {
    const result = await validateWebProductMilestone(database([[{}], [{ version: 8 }]]), context, "ViewContent", data("formula"), { revision: 2, formulaVersion: 8 });
    assert.equal(result?.key, `web-products:${planId}:2:th:formula:8`);
    assert.deepEqual(result?.data, { planId, locale: "th", channel: "web", stage: "formula", journey_version: "web-products-v1" });
  });
  it("deduplicates a confirmed subset regardless of input ordering and derives its value", async () => {
    const capture = (selectedItemIds: string[]) => validateWebProductMilestone(database([[{}], [{ id: runId }]]), context,
      "AddToCart", { ...data("basket"), value: 1, currency: "USD" }, { revision: 2, runId, selectedItemIds, selectionRevision: 3, candidateKey: "balanced" });
    const first = await capture(ids), repeat = await capture([...ids].reverse());
    assert.deepEqual(first, repeat);
    assert.equal(first?.data.value, 201);
    assert.equal(first?.data.currency, "THB");
    assert.equal(first?.data.purchase_type, "products");
    assert.equal(selectionInput.recommendationRunId, runId);
    assert.equal(selectionInput.assessmentRevision, 2);
    assert.equal(selectionInput.selectionRevision, 3);
    assert.equal(selectionInput.candidateKey, "balanced");
    assert.equal(JSON.stringify(first?.data).includes(ids[0]), false);
  });
  it("rejects duplicate, empty and stale basket selections", async () => {
    for (const selectedItemIds of [[], [ids[0], ids[0]], ["invalid"]]) {
      assert.equal(await validateWebProductMilestone(database([[{}], [{ id: runId }]]), context, "AddToCart", data("basket"),
        { revision: 2, runId, selectedItemIds }), null);
    }
    selectionError = Object.assign(new Error("Stale"), { code: "stale_product_selection" });
    assert.equal(await validateWebProductMilestone(database([[{}], [{ id: runId }]]), context, "AddToCart", data("basket"),
      { revision: 2, runId, selectedItemIds: ids }), null);
  });
});
