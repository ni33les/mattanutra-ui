import { startMemoryTaskExecutor } from "../helpers/completed-mcp-client.ts";
import assert from "node:assert/strict";
import { register } from "node:module";
import { before, after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { writeFileSync } from "node:fs";
import { installCatalogue } from "./helpers.ts";
import { profile, runtime, rpc, uninstallRealCatalogue } from "../ax-refinement/helpers.ts";
import { useLiveServiceClock } from "../../lib/agentic/qa/service-clock.ts";
import { resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import type { AgenticRuntime } from "../../lib/agentic/runtime.ts";
register("./next-loader.mjs", import.meta.url);
const app = runtime("m723-independent-expanded");
const globalLive = globalThis as typeof globalThis & { mattanutraLiveAgenticRuntime?: AgenticRuntime };
const records: { first: Record<string, unknown>; last: Record<string, unknown>; elapsedMs: number }[] = [];
let fault: { status: number; body: Record<string, unknown> }, originalGet: typeof app.store.getCapabilityByHash;
let stopWorker: (() => Promise<void>) | undefined;
before(async () => {
  stopWorker = startMemoryTaskExecutor(app); process.env.AX_REFINEMENT_REAL_WORKERS = "1"; await installCatalogue(); useLiveServiceClock(); });
after(async () => {
  await stopWorker?.();
  if (originalGet) app.store.getCapabilityByHash = originalGet;
  delete globalLive.mattanutraLiveAgenticRuntime;
  if (process.env.MCP_723_EVIDENCE_DIR) writeFileSync(`${process.env.MCP_723_EVIDENCE_DIR}/expanded-pair.json`, JSON.stringify({ records, fault }, null, 2), { flag: "wx" });
  resetPlanCreateInflightForTests(); uninstallRealCatalogue();
});
test("one_expanded_job_finishes_in_three_minutes", { timeout: 185000 }, async () => {
  const start = performance.now();
  const first = await Promise.all([0, 1].map(i => rpc(app, "plan", { operation: "create", searchEffort: "expanded", idempotencyKey: `m723-expanded-request-${i}`,
    request: { ...profile("A2"), requirements: { ...profile("A2").requirements, excludeProductIds: i === 0 ? ["prd_50265f478be551c496f907a01d746dab"] : [] } } })));
  assert.ok(first.every(row => row.status === "processing"), JSON.stringify(first)); assert.notEqual(first[0].planHandle, first[1].planHandle);
  // Exercise the actual HTTP hydration boundary while two independent workers
  // are active. This is where a store timeout escaped the dispatcher catch.
  globalLive.mattanutraLiveAgenticRuntime = app;
  originalGet = app.store.getCapabilityByHash.bind(app.store);
  app.store.getCapabilityByHash = async () => { throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }); };
  try {
    const { POST } = await import("../../app/api/mcp/route.ts");
    const response = await POST(new Request("http://localhost/api/mcp", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 42, jsonrpc: "2.0", method: "tools/call", params: { name: "plan", arguments: { operation: "get", planHandle: first[0].planHandle, responseView: "status" } } }) }));
    fault = { status: response.status, body: await response.json() };
  } finally { app.store.getCapabilityByHash = originalGet; }
  await Promise.all(first.map(async initial => {
    let last = initial;
    while (last.status === "processing" && performance.now() - start < 180000) {
      await delay(1000); last = await rpc(app, "plan", { operation: "get", planHandle: initial.planHandle, responseView: "status" });
    }
    const full = await rpc(app, "plan", { operation: "get", planHandle: initial.planHandle, responseView: "full" });
    records.push({ first: initial, last: full, elapsedMs: performance.now() - start });
  }));
  assert.equal(records.length, 2);
  for (const row of records) { assert.ok(row.elapsedMs <= 180000); assert.equal(row.last.ok, true); assert.notEqual(row.last.status, "processing");
    assert.ok((row.last.searchSummary as { expansionAttempts: number }).expansionAttempts > 8000); }
});
test("a_second_expanded_job_does_not_break_get", () => {
  assert.equal(records.length, 2); assert.ok(fault, "The hydration failure must be exercised");
  assert.equal(fault.status, 200); assert.ok(!fault.body.error, JSON.stringify(fault.body));
  const result = fault.body.result as { structuredContent: { ok: boolean; error: { retryable: boolean; nextActions: string[] } } };
  assert.equal(result.structuredContent.ok, false); assert.equal(result.structuredContent.error.retryable, true);
  assert.deepEqual(result.structuredContent.error.nextActions, ["poll_plan"]);
});
test("expanded_does_not_relax_vegan_or_algae_rules", async () => {
  assert.equal(records.length, 2);
  for (const row of records) {
    const details = await rpc(app, "plan", { operation: "get", planHandle: row.last.planHandle, responseView: "details", expectedRevision: row.last.revision, sections: ["request", "products"] });
    const request = details.originalRequest as ReturnType<typeof profile>;
    assert.equal(request.requirements.dietaryPreference, "vegan"); assert.equal(request.requirements.omega3SourcePreference, "algae_only");
    const products = (details.options as { basket: { productId: string }[] }[]).flatMap(option => option.basket); assert.ok(products.length);
    assert.ok(products.every(item => !request.requirements.excludeProductIds?.includes(item.productId)));
  }
});
