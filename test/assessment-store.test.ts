import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { healthScoreAnalysisStatusFromTaskStatuses } from "../lib/assessment-status.ts";
import { hasHealthScoreAiCopy } from "../lib/assessment-store.ts";

describe("assessment score analysis status", () => {
  it("treats stored advice as ready", () => {
    assert.equal(
      healthScoreAnalysisStatusFromTaskStatuses(true, ["queued"]),
      "ready"
    );
  });

  it("keeps score analysis preparing while active work exists even if stale completed rows exist", () => {
    assert.equal(
      healthScoreAnalysisStatusFromTaskStatuses(false, [
        "queued",
        "reserved",
        "completed"
      ]),
      "preparing"
    );
  });

  it("does not mark completed score analysis ready without stored copy", () => {
    assert.equal(
      healthScoreAnalysisStatusFromTaskStatuses(false, ["completed"]),
      "failed"
    );
  });

  it("keeps score analysis preparing while active work exists", () => {
    assert.equal(
      healthScoreAnalysisStatusFromTaskStatuses(false, ["reserved"]),
      "preparing"
    );
  });

  it("marks score analysis failed when only terminal failures exist", () => {
    assert.equal(
      healthScoreAnalysisStatusFromTaskStatuses(false, ["failed"]),
      "failed"
    );
  });
});

describe("HealthScore AI copy readiness", () => {
  it("requires a hero body, not seed advice", () => {
    assert.equal(hasHealthScoreAiCopy({ score: 38 }), false);
    assert.equal(
      hasHealthScoreAiCopy({
        advice: { overview: { en: "We read your goals" } },
        pageContent: { copySeeds: { heroBody: "We read your goals" } }
      }),
      false
    );
    assert.equal(
      hasHealthScoreAiCopy({
        pageContent: { aiCopy: { heroBody: "Your sleep hours are pulling the score." } }
      }),
      true
    );
  });
});
