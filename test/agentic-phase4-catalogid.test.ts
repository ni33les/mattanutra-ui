import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matcherTelemetryFor } from "../lib/agentic/plan/matching.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import type { StackOption } from "../lib/agentic/plan/types.ts";

function option(snapshotId: string): StackOption {
  return {
    basket: [],
    coverage: [],
    coveragePercent: 0,
    dailyPills: 1,
    matcherVersion: "pareto-hybrid-1",
    optionId: "opt_frozen",
    reason: "test",
    snapshotId,
    totalPriceMinor: 100
  };
}

describe("Phase 4 frozen catalogue ID", () => {
  it("reuses the selected snapshot ID instead of hashing an empty pin snapshot", () => {
    const selected = option("snap_originalcatalog");
    const telemetry = matcherTelemetryFor({
      leftovers: [],
      selected,
      snapshot: {
        availabilityAsOf: "2026-08-25T00:00:00.000Z",
        catalogueVersion: "pin",
        products: [],
        supplements: []
      },
      state: aug25PlanState()
    });
    assert.equal(telemetry.snapshotId, "snap_originalcatalog");
    assert.notEqual(telemetry.snapshotId, undefined);
  });
});
