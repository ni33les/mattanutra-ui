import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("plan keep-warm does not starve first-create A2", () => {
  it("warms catalogue on the interval and skips competing 8-target plan pings", async () => {
    const [warm, dispatcher, reserve, sweep, planService, db, startPlatform] = await Promise.all([
      readFile("lib/agentic/plan/warm-dev.ts", "utf8"),
      readFile("lib/agentic/mcp/dispatcher.ts", "utf8"),
      readFile("app/api/tasks/reserve/route.ts", "utf8"),
      readFile("lib/task-sweep-loop.ts", "utf8"),
      readFile("lib/agentic/plan/service.ts", "utf8"),
      readFile("lib/db.ts", "utf8"),
      readFile("scripts/start-platform.mjs", "utf8")
    ]);

    assert.match(warm, /withLivePlanRequest/);
    assert.match(warm, /isLivePlanInFlight/);
    assert.match(dispatcher, /withLivePlanRequest\(\(\) =>/);
    assert.match(
      warm,
      /mattanutraCatalogueWarmInflight/,
      "interval keep-warm must skip while a catalogue warm is already in flight"
    );
    assert.match(
      warm,
      /warmAgenticCatalogue\(\s*environment/,
      "interval keep-warm must not run a second 8-target plan against the live pool"
    );
    assert.doesNotMatch(
      warm.slice(
        warm.indexOf("export async function keepPlanPathWarm"),
        warm.indexOf("const timer = setInterval")
      ),
      /pingPlanHotPath/
    );
    assert.doesNotMatch(
      warm.slice(warm.indexOf("const timer = setInterval")),
      /pingPlanHotPath\(getLiveAgenticRuntime\(\)\)/
    );
    assert.doesNotMatch(reserve, /maybeReleaseExpiredReservations|releaseExpiredReservations/);
    assert.match(sweep, /TASK_MAINTENANCE_INTERVAL_MS = 15_000/);
    assert.match(sweep, /releaseExpiredReservations/);
    assert.match(planService, /schedulePersistPlanSideEffects/);
    assert.match(planService, /isLivePlanInFlight\(\)/);
    assert.match(planService, /elapsed < 750/);
    assert.doesNotMatch(
      planService,
      /void persistPlanSideEffects\(txResult\.persist\)/
    );
    assert.match(db, /DB_KEEP_ALIVE_CONNECTIONS = 1/);
    assert.match(db, /DEFAULT_DB_POOL_IDLE_TIMEOUT_SECONDS = 120/);
    assert.match(startPlatform, /platform-hot-\$\{Date\.now\(\)\}-patch/);
    assert.match(startPlatform, /DB_POOL_ROLE: "worker"/);
    assert.match(
      dispatcher,
      /case "info":\s*await import\("@\/lib\/agentic\/catalogue\/warm"\)/,
      "info must finish catalogue warm so the next first-create A2 is a cache hit"
    );
  });
});
