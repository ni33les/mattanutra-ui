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
const calculatingWait = readFileSync(
  new URL("../components/chat-questionnaire/calculating-wait.tsx", import.meta.url),
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
const formulationResults = readFileSync(
  new URL("../components/formulation-results.tsx", import.meta.url),
  "utf8"
);
const formulationHelpers = readFileSync(
  new URL("../components/formulation-results-helpers.tsx", import.meta.url),
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
    assert.match(chat, /fetchHealthScoreCopyStatus/);
  });

  it("reads one journey snapshot and does not enqueue work", () => {
    assert.match(journeyRoute, /getNutritionJourneySnapshot\(planId\)/);
    assert.match(journeyRoute, /getHealthScoreCopySnapshot\(planId\)/);
    assert.match(journeyRoute, /get\("view"\) === "copy"/);
    assert.doesNotMatch(journeyRoute, /enqueue|getWorkerSql|ensureAssessmentSchema/);
    assert.match(journeyRead, /from public\.assessments/);
    assert.match(journeyRead, /generate_supplement_guidance/);
    assert.match(journeyRead, /generate_product_recommendations/);
    assert.doesNotMatch(journeyRead, /sql\.begin/);
  });

  it("uses the HealthScore wait chrome with formula copy, not a stepper", () => {
    assert.match(progressUi, /CalculatingWait/);
    assert.match(progressUi, /mn-quiz-calc__ready-btn/);
    assert.match(calculatingWait, /mn-quiz-calc__spinner/);
    assert.match(progressUi, /Your formula is being prepared/);
    assert.match(
      progressUi,
      /MattaNutra is building your personalised formula and matching the right products/
    );
    assert.match(progressUi, /Preparing your formula…/);
    assert.match(progressUi, /กำลังจัดสูตรของคุณ/);
    assert.match(
      progressUi,
      /MattaNutra กำลังจัดทำสูตรเฉพาะบุคคลและจับคู่สินค้าที่เหมาะกับคุณ/
    );
    assert.match(progressUi, /正在准备你的配方/);
    assert.match(
      progressUi,
      /MattaNutra 正在为你制定个性化配方并匹配产品，通常只需几秒钟。/
    );
    assert.doesNotMatch(progressUi, /Thai pharmac/i);
    assert.doesNotMatch(progressUi, /Thailand/i);
    assert.doesNotMatch(progressUi, /ร้านขายยาไทย/);
    assert.doesNotMatch(progressUi, /Calculating your Healthscore/);
    assert.doesNotMatch(progressUi, /Creating your formulation/);
    assert.doesNotMatch(progressUi, /Matching your products/);
    assert.doesNotMatch(progressUi, /STAGE_ORDER/);
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

  it("does not render the Discover / Reveal / Deliver meter on reveal", () => {
    assert.doesNotMatch(formulationResults, /NutritionProgress/);
    assert.doesNotMatch(formulationHelpers, /NutritionProgress/);
    assert.doesNotMatch(formulationResults, /components\/nutrition-progress/);
    assert.doesNotMatch(formulationHelpers, /components\/nutrition-progress/);
  });
});
