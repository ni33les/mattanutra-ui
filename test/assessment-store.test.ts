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

function aiText(value: string) {
  return { en: value };
}

function completeHealthScoreAiCopy() {
  const card = (headline: string, body: string) => ({
    body: aiText(body),
    headline: aiText(headline)
  });

  return {
    bandLine: aiText("This is a starting line."),
    findings: [card("Finding", "Finding body.")],
    findingsHeadline: aiText("1 thing a quiz would miss."),
    findingsSub: aiText("From your answers."),
    gapTrio: [
      card("Gap one", "Gap one body."),
      card("Gap two", "Gap two body."),
      card("Gap three", "Gap three body.")
    ],
    heroBody: aiText("Your sleep hours are pulling the score."),
    heroTitle: aiText("You came here for energy."),
    highestLeverageBody: aiText("Sleep is the lever."),
    methodCards: [
      { body: aiText("Goals body."), title: aiText("Goals") },
      { body: aiText("Routine body."), title: aiText("Routine") },
      { body: aiText("Safety body."), title: aiText("Safety") }
    ],
    methodHeadline: aiText("How MattaNutra thinks"),
    pillarHeadline: aiText("Start with sleep and activity."),
    relativityHeadline: aiText("The typical score is 60."),
    relativitySub: aiText("The gap is recoverable."),
    strengthNote: aiText("Stress is already strong."),
    subtractionBody: aiText("The preview filters first.")
  };
}

describe("HealthScore AI copy readiness", () => {
  it("requires the full AI overlay, not seed advice or a lone hero body", () => {
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
      false
    );
    assert.equal(
      hasHealthScoreAiCopy({
        pageContent: { aiCopy: completeHealthScoreAiCopy() }
      }),
      true
    );
  });
});
