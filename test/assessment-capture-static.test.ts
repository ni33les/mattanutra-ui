import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
// Transaction rollback, idempotency, contact isolation and stale writes are exercised against
// PostgreSQL in assessment-capture.integration and assessment-revisions.integration.
describe("capture boundary wiring", () => {
  it("uses the same server capture service in both HTTP routes and the coordinator", () => {
    for (const file of ["app/api/assessment/route.ts", "app/api/assessment/[planId]/route.ts", "lib/questionnaire/server.ts"]) {
      assert.match(source(file), /captureAssessment/);
      assert.doesNotMatch(source(file), /void \(async/);
    }
  });
  it("keeps HealthScore reads free of generation mutations", () => {
    const route = source("app/api/assessment/[planId]/route.ts");
    assert.doesNotMatch(route, /enqueueHealthScoreAnalysisTask/);
    assert.match(route, /getStoredHealthScoreAnalysisSnapshot\(planId, url\.searchParams\.get\("locale"\)\)/);
  });
  it("checks current revision advice before rendering HealthScore", () => {
    const page = source("app/[locale]/nutrition/healthscore/page.tsx");
    assert.match(page, /getRevisionHealthScore\(planId, locale\)/);
    assert.match(page, /hasHealthScoreAiCopy\(currentHealthScore, locale\)/);
    assert.match(page, /HealthScoreCopyGate/);
  });
  it("exposes separate capture and saved-analysis recovery", () => {
    const capture = source("components/chat-questionnaire/use-questionnaire-capture.ts");
    assert.match(capture, /waitForHealthScoreCopy/);
    assert.match(capture, /draft\.captured/);
    assert.match(capture, /retryHealthScoreCopy/);
    const calc = source("components/chat-questionnaire/questionnaire-calculating.tsx");
    assert.match(calc, /data-testid="retry-capture"/);
    assert.match(calc, /data-testid="retry-analysis"/);
    assert.doesNotMatch(calc, /onEmailComplete/);
  });
  it("keeps the submitted name on both existing result heroes", () => {
    for (const file of ["components/nutrition-flow/healthscore-panel.tsx", "components/reveal-final-results.tsx"]) {
      assert.match(source(file), /data-testid="reveal-hero-name"/);
    }
  });
});
