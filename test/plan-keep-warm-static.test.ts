import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("plan keep-warm does not starve first-create A2", () => {
  it("does not rebuild the MCP catalogue on a timer", async () => {
    const [warm, dispatcher, reserve, sweep, planService, db, startPlatform, instrumentation] =
      await Promise.all([
      readFile("lib/agentic/plan/warm-dev.ts", "utf8"),
      readFile("lib/agentic/mcp/dispatcher.ts", "utf8"),
      readFile("app/api/tasks/reserve/route.ts", "utf8"),
      readFile("lib/task-sweep-loop.ts", "utf8"),
      readFile("lib/agentic/plan/service.ts", "utf8"),
      readFile("lib/db.ts", "utf8"),
      readFile("scripts/start-platform.mjs", "utf8"),
      readFile("instrumentation.ts", "utf8")
    ]);

    assert.match(warm, /withLivePlanRequest/);
    assert.match(warm, /isLivePlanInFlight/);
    assert.match(dispatcher, /withLivePlanRequest\(\(\) =>/);
    assert.doesNotMatch(
      warm.slice(warm.indexOf("export async function keepPlanPathWarm")),
      /warmAgenticCatalogue/
    );
    assert.doesNotMatch(instrumentation, /keepPlanPathWarm/);
    assert.match(instrumentation, /NEXT_PHASE === "phase-production-build"/);
    assert.doesNotMatch(reserve, /maybeReleaseExpiredReservations|releaseExpiredReservations/);
    assert.match(sweep, /TASK_MAINTENANCE_FIRST_DELAY_MS = 60_000/);
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
    assert.match(startPlatform, /DB_POOL_ROLE: "worker"/);
    assert.match(
      startPlatform,
      /PLATFORM_WORKER_START_DELAY_MS \|\| 30_000/,
      "workers must not register during the first LINE/BPM window"
    );
    assert.doesNotMatch(
      startPlatform.slice(startPlatform.indexOf("async function main")),
      /warmDevPlanHotPath/,
      "boot must not run an 8-target plan ping before first LINE/BPM"
    );
    assert.doesNotMatch(
      dispatcher,
      /case "info":[\s\S]{0,400}warmAgenticCatalogue/,
      "info must not wait on catalogue warm; plan/execute load the snapshot on demand"
    );
  });
});
