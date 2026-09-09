import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { runAdmittedPlanOperation } from "../lib/agentic/plan/service.ts";
import { infoTool } from "../lib/agentic/info.ts";
import { observeLatency } from "./helpers/latency-observation.ts";

import {
  closeSession,
  createPlan,
  callPlan,
  freezeImplCatalogue,
  openSession,
  primaryRequest
} from "./agentic/value/impl-harness.ts";

const WARM_PLAN_P95_MS = 1_500;
const WARM_INFO_P95_MS = 300;

async function completedPlan(session: ReturnType<typeof openSession>, request: Record<string, unknown>) {
  const key=`cv-speed-${randomUUID()}`, admitted=await createPlan(session,request,key);
  assert.equal(admitted.status,"processing","HTTP only admits durable matching");
  const scope=session.runtime.scope;
  const operation=await session.store.getPlanOperationByKey(`${scope.environment}:${scope.tenantScope}:${scope.principalScope}`,key);
  assert.ok(operation); assert.equal(operation.status,"queued");
  const completed=await runAdmittedPlanOperation({store:session.store,config:session.config,operationId:operation.id});
  assert.equal(completed.ok,true,JSON.stringify(completed));
  const result=await callPlan(session,{operation:"get",planHandle:admitted.planHandle});
  assert.ok(Array.isArray(result.coverage) && result.coverage.length>0,"Comparison requires actual completed target coverage");
  assert.ok(Array.isArray(result.basket),"Comparison requires an evaluated basket, including a legitimate empty basket");
  return result;
}

function percentile(values: readonly number[], p: number) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length < 1) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? 0;
}

describe("Customer value speed pack", () => {
  it("warm durable plan execution reaches ready without a polling delay", async () => {
    const frozen = await freezeImplCatalogue();
    assert.equal(frozen.usable, true);
    const session = openSession(frozen.freeze);
    try {
      const request = primaryRequest(frozen.freeze);
      await completedPlan(session, request);
      const samples: number[] = [];
      const statuses: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        const started = performance.now();
        const plan = await completedPlan(session, request);
        samples.push(Math.round(performance.now() - started));
        statuses.push(String(plan.status));
      }
      const p95 = percentile(samples, 95);
      assert.equal(
        statuses.every((status) => status !== "processing"),
        true,
        `processing returned: ${statuses.join(",")}`
      );
      assert.equal(
        statuses.every(
          (status) =>
            status === "ready" || status === "needs_input" || status === "no_purchase"
        ),
        true,
        `unexpected status: ${statuses.join(",")}`
      );
      observeLatency(p95, WARM_PLAN_P95_MS, "warm plan p95");
    } finally {
      closeSession();
    }
  });

  it("does not cut the first create short to force a 3s poll", () => {
    const source = readFileSync(new URL("../lib/agentic/plan/service.ts", import.meta.url), "utf8");
    assert.match(source, /PLAN_MATCH_RETURN_BUDGET_MS = 3_000/);
    assert.equal(source.includes("sleep(PLAN_MATCH_RETURN_BUDGET_MS)"), false);
    assert.match(source, /PLAN_PROCESSING_POLL_AFTER_SECONDS = 1/);
    assert.match(source, /writeProcessingRevision/);
    assert.doesNotMatch(source, /inflightPlanIdempotency/);
    assert.match(source, /return admittedResponse\(input, admitted\)/);
  });

  it("info returns supported markets and records its latency", async () => {
    const frozen = await freezeImplCatalogue();
    assert.equal(frozen.usable, true);
    const session = openSession(frozen.freeze);
    try {
      const started = performance.now();
      const info = await infoTool({ config: session.config });
      assert.equal(info.ok, true);
      assert.ok(info.supportedCountries.length > 0);
      observeLatency(performance.now() - started, WARM_INFO_P95_MS, "info");
    } finally { closeSession(); }
  });

  it("repeat identical request preserves its result and reports warm latency", async () => {
    const matching = readFileSync(new URL("../lib/agentic/plan/matching.ts", import.meta.url), "utf8");
    assert.match(matching, /matchPlanCache/);
    const frozen = await freezeImplCatalogue();
    assert.equal(frozen.usable, true);
    const session = openSession(frozen.freeze);
    try {
      const request = primaryRequest(frozen.freeze);
      const firstStarted = performance.now();
      const first = await completedPlan(session, request);
      const firstMs = Math.round(performance.now() - firstStarted);
      const secondStarted = performance.now();
      const second = await completedPlan(session, request);
      const secondMs = Math.round(performance.now() - secondStarted);
      assert.equal(first.status, second.status);
      assert.deepEqual(first.coverage, second.coverage);
      assert.deepEqual(first.basket, second.basket);
      observeLatency(secondMs, Math.max(firstMs, 400), "repeat plan compared with first");
    } finally {
      closeSession();
    }
  });
});
