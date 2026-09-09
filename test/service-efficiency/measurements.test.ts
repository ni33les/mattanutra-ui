import assert from "node:assert/strict";
import { test } from "node:test";
import { withRequestLifetime } from "../../lib/request-lifetime.ts";
import { setQueryNamespace, countQuery, queryBudgetSnapshot, resetQueryBudget } from "../../lib/agentic/plan/query-budget.ts";

test("EFF-MET-01 concurrent request counters cannot change another request's attribution", async () => {
  resetQueryBudget();
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const first = withRequestLifetime({ signal: new AbortController().signal }, async () => {
    setQueryNamespace("eff-first");
    await barrier;
    countQuery("plan.match.hit");
    assert.deepEqual(queryBudgetSnapshot(), { "plan.match.hit": 1 });
  });
  await withRequestLifetime({ signal: new AbortController().signal }, async () => {
    setQueryNamespace("eff-second");
    countQuery("catalogue.snapshot.TH");
    release();
    await first;
    assert.deepEqual(queryBudgetSnapshot(), { "catalogue.snapshot.TH": 1 });
  });
  resetQueryBudget();
});

test("EFF-MET-02 explicit diagnostic namespaces remain readable outside request scope", () => {
  resetQueryBudget();
  setQueryNamespace("eff-diagnostic"); countQuery("plan.match.miss");
  assert.deepEqual(queryBudgetSnapshot("eff-diagnostic"), { "plan.match.miss": 1 });
  resetQueryBudget();
});

test("EFF-MET-03 production measurement flushing is bounded and excludes request payloads", async t => {
  const metrics = await import("../../lib/service-metrics.ts");
  t.mock.timers.enable({ apis: ["setInterval"] });
  const rows: unknown[] = [];
  const stop = metrics.startServiceMeasurementReporting(value => rows.push(value));
  const duplicate = metrics.startServiceMeasurementReporting(() => { throw new Error("duplicate reporter"); });
  metrics.recordServiceMetric("cache.hit"); t.mock.timers.tick(59_999); assert.equal(rows.length, 0);
  t.mock.timers.tick(1); assert.equal(rows.length, 1);
  const text = JSON.stringify(rows[0]); assert.match(text, /cache.hit/); assert.ok(!/answers|email|token|credentials/.test(text));
  duplicate(); stop(); t.mock.timers.tick(60_000); assert.equal(rows.length, 1);
});

test("EFF-MET-04 concise transport does not serialize an unused JSON clone", async () => {
  const { toolResult } = await import("../../lib/agentic/mcp/rpc.ts");
  let serializations = 0;
  const payload = { responseView: "conversation", summary: "Ready", nextActions: ["confirm_with_user"],
    toJSON() { serializations++; return { responseView: this.responseView, summary: this.summary }; } };
  const reply = toolResult(payload); assert.equal(reply.structuredContent, payload);
  assert.equal(serializations, 0); assert.match(reply.content[0].text, /confirm_with_user/);
});

test("EFF-MET-05 both application and external worker publish the bounded metric aggregates", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of ["instrumentation.ts", "workers/runner.ts"]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /startServiceMeasurementReporting\(value => console\.info\(/, `${file} must publish its process aggregates`);
  }
});
