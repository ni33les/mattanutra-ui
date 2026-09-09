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
