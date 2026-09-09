import { withMemoryTaskExecutor } from "../helpers/completed-mcp-client.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { installRealCatalogue, uninstallRealCatalogue, runtime, profile } from "../ax-refinement/helpers.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { AGENTIC_OUTPUT_SCHEMAS, validateToolIssues } from "../../lib/agentic/contract/index.ts";
import { projectPlan } from "../../lib/agentic/presentation/plan.ts";
import type { PlanSuccessWire } from "../../lib/agentic/contract/outputs.ts";

afterEach(() => { resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });
test("M721-GOLD-01 frozen DEV D3 admits and reads conversation below 30 KB within 15 seconds, with selectable preferences", async () => {
  const frozen = await installRealCatalogue("dev");
  const app = { ...runtime("m721-golden"), resultContent: "structured" as const };
  const request = { ...profile("A6"), profile: {}, currentSupplements: [], targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU", basis: "total_daily" as const }],
    requirements: { maxDailyPills: 1, maxProductCount: 0, maxPriceMinor: 0 }, optimization: "lowest_cost" as const };
  const calls: unknown[] = [];
  async function call(args: Record<string, unknown>) {
    const response = await handleJsonRpc(app, { id: 1, method: "tools/call", params: { name: "plan", arguments: args } });
    assert.ok(response?.result); const value = response.result.structuredContent as Record<string, unknown>;
    assert.equal(value.ok, true, JSON.stringify(value));
    assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, value), []);
    calls.push({ args, result: response.result }); return { value, result: response.result };
  }
  await withMemoryTaskExecutor(app, async () => {
  const started = performance.now();
  const creation = { operation: "create", idempotencyKey: "m721-frozen-d3-create", request };
  let { value } = await call(creation); assert.equal(value.responseView, "conversation");
  while (value.status === "processing" && performance.now() - started < 15_000) {
    await new Promise(done => setTimeout(done, Number(value.pollAfterSeconds ?? 1) * 1000));
    ({ value } = await call({ operation: "get", planHandle: value.planHandle, responseView: "status", ...(value.resultVersion ? { knownResultVersion: value.resultVersion } : {}) }));
  }
  const final = await call({ operation: "get", planHandle: value.planHandle });
  const elapsedMs = performance.now() - started;
  assert.equal(final.value.status, "ready"); assert.equal(final.value.responseView, "conversation");
  assert.ok(elapsedMs < 15_000, `Standard D3 took ${elapsedMs}ms`);
  assert.ok(Buffer.byteLength(JSON.stringify(final.value), "utf8") < 30_000);
  assert.equal((final.result.content as unknown[]).length, 1);
  const full = (await call({ operation: "get", planHandle: value.planHandle, responseView: "full" })).value as unknown as PlanSuccessWire;
  const selected = full.options!.find(row => row.optionId === full.optionId)!; assert.ok(selected?.purchaseEligible);
  assert.equal(selected.doseFit!.total, 0);
  assert.equal(selected.basket!.length, 1); assert.equal(selected.basket![0].servingsPerDay, 2);
  assert.equal(selected.stackSummary.totalDailyPills, null, "Historical frozen D3 administration stays unknown");
  assert.ok(full.options!.some(row => row.basket?.some(item => item.productName === "Blackmores Vitamin D3 1000 IU")), "The eligible dedicated D3 listing must remain a visible choice despite unknown pill metadata");
  assert.ok(full.options!.some(row => row.purchaseEligible && row.optionId !== selected.optionId), "Frozen catalogue must yield a useful alternative");
  for (const locale of ["en", "th", "zh-CN"]) {
    const projection = projectPlan({ ...full, locale }, { responseView: "conversation" });
    assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, projection), []);
    assert.deepEqual(projection.options.map(row => row.optionId), full.options!.map(row => row.optionId));
  }
  const replay = await call(creation); assert.equal(replay.value.revision, value.revision); assert.equal(replay.value.planHandle, value.planHandle);
  await call({ operation: "select", planHandle: value.planHandle, expectedRevision: value.revision,
    optionId: selected.optionId, idempotencyKey: "m721-select-over-preferences" });
  if (process.env.MCP_721_EVIDENCE_DIR) writeFileSync(resolve(process.env.MCP_721_EVIDENCE_DIR, "golden-d3.json"), JSON.stringify({
    inputLabel: "reconstructed corrected DEV baseline", provenance: frozen.provenance, elapsedMs, request, calls,
    selected: { basket: selected.basket, doseFit: selected.doseFit, stackSummary: selected.stackSummary },
    options: full.options!.map(row => ({ roles: row.roles, basket: row.basket, stackSummary: row.stackSummary, doseFit: row.doseFit }))
  }, null, 2), { flag: "wx" });
  });
});
