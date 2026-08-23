import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const progressPage = readFileSync(
  new URL("../app/[locale]/nutrition/progress/page.tsx", import.meta.url),
  "utf8"
);
const progressUi = readFileSync(
  new URL("../components/nutrition-flow/journey-progress.tsx", import.meta.url),
  "utf8"
);
const journeyRoute = readFileSync(
  new URL("../app/api/assessment/[planId]/journey/route.ts", import.meta.url),
  "utf8"
);
const journeyRead = readFileSync(
  new URL("../lib/nutrition-journey-read.ts", import.meta.url),
  "utf8"
);
const returnPage = readFileSync(
  new URL("../app/[locale]/nutrition/payment/return/page.tsx", import.meta.url),
  "utf8"
);
const chat = readFileSync(
  new URL("../components/chat-questionnaire/chat-questionnaire.tsx", import.meta.url),
  "utf8"
);

describe("after-pay journey progress stays truthful", () => {
  it("sends paid plans to progress instead of an empty reveal", () => {
    assert.match(
      returnPage,
      /status === "paid_with_plan" && payment\?\.planId/
    );
    assert.match(returnPage, /redirect\(nutritionProgressPath\(locale, payment\.planId\)\)/);
    assert.ok(
      returnPage.indexOf('status === "paid_with_plan" && payment?.planId') <
        returnPage.indexOf("const [formula, healthScore]")
    );
  });

  it("does not put a HealthScore calculating poll back on capture", () => {
    assert.doesNotMatch(chat, /pollHealthScore/);
    assert.match(chat, /setCalcStatus\("ready"\);\s*router\.replace\(\s*resultsPath\(/);
  });

  it("reads one journey snapshot and does not enqueue work", () => {
    assert.match(journeyRoute, /getNutritionJourneySnapshot\(planId\)/);
    assert.doesNotMatch(journeyRoute, /enqueue|getWorkerSql|ensureAssessmentSchema/);
    assert.match(journeyRead, /from public\.assessments/);
    assert.match(journeyRead, /generate_supplement_guidance/);
    assert.match(journeyRead, /generate_product_recommendations/);
    assert.doesNotMatch(journeyRead, /sql\.begin/);
  });

  it("advances the three work stages from backend state, not timers", () => {
    assert.match(progressUi, /Calculating your Healthscore/);
    assert.match(progressUi, /Creating your formulation/);
    assert.match(progressUi, /Matching your products/);
    assert.match(progressUi, /POLL_INTERVAL_MS/);
    assert.doesNotMatch(progressUi, /setTimeline\([\s\S]*setTimeout/);
    assert.match(progressUi, /router\.replace\(\s*nutritionRevealPath/);
    assert.match(progressPage, /snapshot\.readyForReveal/);
    assert.match(progressPage, /redirect\(nutritionRevealPath\(locale, planId\)\)/);
    assert.match(
      progressPage,
      /snapshot\.status === "healthscore_only"[\s\S]*nutritionHealthScorePath/
    );
    assert.doesNotMatch(progressUi, /NutritionProgress/);
  });
});
