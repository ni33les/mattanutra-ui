import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("plan keep-warm does not starve first-create A2", () => {
  it("warms catalogue on the interval and skips competing 8-target plan pings", async () => {
    const [warm, dispatcher, reserve] = await Promise.all([
      readFile("lib/agentic/plan/warm-dev.ts", "utf8"),
      readFile("lib/agentic/mcp/dispatcher.ts", "utf8"),
      readFile("app/api/tasks/reserve/route.ts", "utf8")
    ]);

    assert.match(warm, /withLivePlanRequest/);
    assert.match(warm, /livePlanInFlight\(\)/);
    assert.match(dispatcher, /withLivePlanRequest\(\(\) =>/);
    assert.match(
      warm,
      /setInterval\(\(\) => \{\s*void warmAgenticCatalogue\(environment\)/,
      "interval keep-warm must not run a second 8-target plan against the live pool"
    );
    assert.doesNotMatch(
      warm.slice(warm.indexOf("const timer = setInterval")),
      /pingPlanHotPath\(getLiveAgenticRuntime\(\)\)/
    );
    assert.match(reserve, /RESERVE_EXPIRED_SWEEP_MIN_INTERVAL_MS = 15_000/);
    assert.match(reserve, /maybeReleaseExpiredReservations/);
  });
});
