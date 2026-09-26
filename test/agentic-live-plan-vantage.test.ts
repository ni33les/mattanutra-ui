import { observeLatency } from "./helpers/latency-observation.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  interpolatePercentile,
  TECH07_LIVE_BUDGET
} from "../lib/agentic/qa/latency-score.ts";
import {
  LIVE_ORIGIN,
  LIVE_PUBLIC,
  liveCall,
  liveCompletedCall,
  magCurrentRequest,
  stamp
} from "./helpers/live-mcp.ts";

const AGENT_ROUTE = JSON.parse(
  readFileSync(new URL("./fixtures/dev-lat-agent-route-baseline.json", import.meta.url), "utf8")
) as { runA: { planP95Ms: number }; runB: { planP95Ms: number } };

const PUBLIC_PLAN_P95_MS = TECH07_LIVE_BUDGET.p95BudgetMs;
const DIRECT_PLAN_P95_MS = TECH07_LIVE_BUDGET.p95BudgetMs;

describe("live plan latency vantage ownership", () => {
  it("LIVE-LAT-PLAN measures JSON admission separately from completed work and historical agent-route observations", async () => {
    const publicSamples: number[] = [];
    const originSamples: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const pub = await liveCall(LIVE_PUBLIC, "plan", {
        idempotencyKey: stamp(`lat-pub-${index}`),
        ...magCurrentRequest(300, 90)
      }, { accept: "application/json" });
      const origin = await liveCall(LIVE_ORIGIN, "plan", {
        idempotencyKey: stamp(`lat-origin-${index}`),
        ...magCurrentRequest(300, 90)
      }, { accept: "application/json" });
      assert.equal(pub.status, 200);
      assert.equal(origin.status, 200);
      assert.equal(pub.structured.ok, true, JSON.stringify(pub.structured));
      assert.equal(origin.structured.ok, true, JSON.stringify(origin.structured));
      publicSamples.push(pub.ms);
      originSamples.push(origin.ms);
      for (const [url, response] of [[LIVE_PUBLIC, pub], [LIVE_ORIGIN, origin]] as const) {
        assert.equal(typeof response.structured.planHandle, "string");
        assert.match(response.headers["content-type"], /application\/json/);
        const terminal = await liveCompletedCall(url, "plan", { planHandle: response.structured.planHandle }, { accept: "application/json" });
        assert.equal(terminal.structured.ok, true, JSON.stringify(terminal.structured));
        assert.ok(["ready", "needs_input", "no_purchase"].includes(String(terminal.structured.status)), JSON.stringify(terminal.structured));
      }
    }
    const publicP95 = interpolatePercentile(publicSamples, 95);
    const originP95 = interpolatePercentile(originSamples, 95);
    const agentP95 = Math.max(AGENT_ROUTE.runA.planP95Ms, AGENT_ROUTE.runB.planP95Ms);
    // The captured agent-route measurements belong to another build. Keep that
    // evidence, but do not assert a current bottleneck from non-contemporaneous data.
    console.log(JSON.stringify({ kind: "admission_vantage_observation", publicP95Ms: publicP95,
      originP95Ms: originP95, historicalAgentRouteP95Ms: agentP95, comparison: "historical_not_current_attribution" }));
    observeLatency(publicP95, PUBLIC_PLAN_P95_MS, "public plan p95");
    observeLatency(originP95, DIRECT_PLAN_P95_MS, "origin plan p95");
    assert.ok(publicSamples.length === 10 && originSamples.length === 10);
  });
});
