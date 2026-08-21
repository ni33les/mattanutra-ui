import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const captureRoute = readFileSync(
  new URL("../app/api/assessment/route.ts", import.meta.url),
  "utf8"
);
const planRoute = readFileSync(
  new URL("../app/api/assessment/[planId]/route.ts", import.meta.url),
  "utf8"
);
const panel = readFileSync(
  new URL("../components/nutrition-flow/healthscore-panel.tsx", import.meta.url),
  "utf8"
);
const reveal = readFileSync(
  new URL("../components/reveal-final-results.tsx", import.meta.url),
  "utf8"
);

describe("assessment capture stays off the pregeneration wait path", () => {
  it("returns the captured plan before waiting on pregeneration or analysis", () => {
    assert.match(captureRoute, /await persistAssessmentSubmission/);
    assert.match(captureRoute, /void \(async \(\) => \{/);
    assert.match(
      captureRoute,
      /void \(async \(\) => \{[\s\S]*enqueueAssessmentPregenerationTasks/
    );
    assert.ok(
      captureRoute.indexOf("await persistAssessmentSubmission") <
        captureRoute.indexOf("void (async () => {")
    );
    assert.ok(
      captureRoute.lastIndexOf("return NextResponse.json") >
        captureRoute.indexOf("void (async () => {")
    );
    assert.match(
      captureRoute,
      /void \(async \(\) => \{[\s\S]*\}\)\(\);\s*return NextResponse\.json/
    );
    assert.doesNotMatch(captureRoute, /getStoredHealthScoreAnalysisSnapshot/);
    assert.match(captureRoute, /firstNameFromAssessmentAnswers\(body\.answers\)/);
  });

  it("does not block healthscore GET on analysis enqueue", () => {
    assert.match(planRoute, /void enqueueHealthScoreAnalysisTask\(\{ planId \}\)/);
    assert.doesNotMatch(
      planRoute,
      /await enqueueHealthScoreAnalysisTask\(\{ planId \}\)/
    );
    assert.match(planRoute, /firstName: firstNameFromAssessmentAnswers\(prefill\.answers\)/);
  });

  it("puts the submitted first name on the existing healthscore and reveal heroes", () => {
    assert.match(panel, /data-testid="reveal-hero-name"/);
    assert.match(panel, /firstName \? `\$\{firstName\}, ` : null/);
    assert.match(reveal, /data-testid="reveal-hero-name"/);
    assert.match(reveal, /export function revealHeroFirstName/);
  });
});
