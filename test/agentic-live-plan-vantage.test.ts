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
  magCurrentRequest,
  stamp
} from "./helpers/live-mcp.ts";

const AGENT_ROUTE = JSON.parse(
  readFileSync(new URL("./fixtures/dev-lat-agent-route-baseline.json", import.meta.url), "utf8")
) as { runA: { planP95Ms: number }; runB: { planP95Ms: number } };

const PUBLIC_PLAN_P95_MS = TECH07_LIVE_BUDGET.p95BudgetMs;
const DIRECT_PLAN_P95_MS = TECH07_LIVE_BUDGET.p95BudgetMs;

describe("live plan latency vantage ownership", () => {
  it("LIVE-LAT-PLAN public and origin plan P95 stay inside TECH-07; agent route owns the 12-17s", async () => {
    const publicSamples: number[] = [];
    const originSamples: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const pub = await liveCall(LIVE_PUBLIC, "plan", {
        idempotencyKey: stamp(`lat-pub-${index}`),
        request: magCurrentRequest(300, 90)
      });
      const origin = await liveCall(LIVE_ORIGIN, "plan", {
        idempotencyKey: stamp(`lat-origin-${index}`),
        request: magCurrentRequest(300, 90)
      });
      assert.equal(pub.status, 200);
      assert.equal(origin.status, 200);
      publicSamples.push(pub.ms);
      originSamples.push(origin.ms);
    }
    const publicP95 = interpolatePercentile(publicSamples, 95);
    const originP95 = interpolatePercentile(originSamples, 95);
    const agentP95 = Math.max(AGENT_ROUTE.runA.planP95Ms, AGENT_ROUTE.runB.planP95Ms);
    const owner =
      agentP95 > publicP95 * 2 && agentP95 > originP95 * 2
        ? "AGENT_EGRESS_OR_ROUTE"
        : originP95 > 5_000
          ? "APPLICATION_ADMISSION"
          : "MATTA_INGRESS_OR_PROXY";
    assert.ok(publicP95 <= PUBLIC_PLAN_P95_MS, `public p95 ${publicP95}`);
    assert.ok(originP95 <= DIRECT_PLAN_P95_MS, `origin p95 ${originP95}`);
    assert.equal(owner, "AGENT_EGRESS_OR_ROUTE");
  });
});
