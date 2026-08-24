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
const chat = readFileSync(
  new URL("../components/chat-questionnaire/chat-questionnaire.tsx", import.meta.url),
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
    assert.doesNotMatch(planRoute, /enqueueHealthScoreAnalysisTask/);
    assert.match(planRoute, /getStoredHealthScoreAnalysisSnapshot\(planId\)/);
    assert.doesNotMatch(
      planRoute,
      /await getStoredHealthScoreAnalysisSnapshot\(snapshot\.planId\)/
    );
    assert.match(planRoute, /cachedEvaluatedIngredientCatalogueCount\(\)/);
    assert.match(planRoute, /if \(!healthScoreView\) \{\s*void enqueueDueScheduledActions\(\)/);
    assert.match(
      planRoute,
      /void \(async \(\) => \{[\s\S]*enqueueAssessmentPregenerationTasks/
    );
    assert.ok(
      planRoute.indexOf("await persistAssessmentSubmission") <
        planRoute.indexOf("void (async () => {")
    );
    assert.ok(
      planRoute.lastIndexOf("return NextResponse.json") >
        planRoute.indexOf("void (async () => {")
    );
  });

  it("persists capture as one upsert and does not inspect schema first", () => {
    const store = readFileSync(
      new URL("../lib/assessment-store.ts", import.meta.url),
      "utf8"
    );
    const persistStart = store.indexOf(
      "export async function persistAssessmentSubmission"
    );
    const persistEnd = store.indexOf(
      "export async function getStoredAssessmentSnapshot"
    );
    const persist = store.slice(persistStart, persistEnd);

    assert.match(persist, /insert into assessments \(/);
    assert.doesNotMatch(persist, /ensureAssessmentSchema/);
    assert.doesNotMatch(persist, /to_jsonb\(assessments\.\*\)/);
    assert.match(persist, /void appendAssessmentVersion/);
    assert.match(persist, /void upsertAssessmentEmailChannel/);
  });

  it("treats a stored HealthScore number as ready without scanning tasks", () => {
    const store = readFileSync(
      new URL("../lib/assessment-store.ts", import.meta.url),
      "utf8"
    );
    const snapshotStart = store.indexOf(
      "export async function getStoredHealthScoreAnalysisSnapshot"
    );
    const snapshotEnd = store.indexOf(
      "export async function getStoredAssessmentPrefill"
    );
    const snapshot = store.slice(snapshotStart, snapshotEnd);

    assert.doesNotMatch(snapshot, /from public\.tasks/);
    assert.doesNotMatch(snapshot, /healthScoreAnalysisStatusFromTaskStatuses/);
    assert.match(snapshot, /status: "ready"/);
  });

  it("waits for stored AI copy on the calculating splash before HealthScore", () => {
    assert.doesNotMatch(chat, /pollHealthScore/);
    assert.match(chat, /fetchHealthScoreCopyStatus/);
    assert.match(chat, /HEALTHSCORE_COPY_POLL_INTERVAL_MS/);
    assert.match(chat, /hasUsableHealthScore/);
    assert.match(chat, /copyReady/);
    assert.match(chat, /setCalcStatus\("sent"\)/);
    assert.match(chat, /if \(!copyReady\) \{\s*setCalcStatus\("error"\)/);
  });

  it("puts the submitted first name on the existing healthscore and reveal heroes", () => {
    assert.match(panel, /data-testid="reveal-hero-name"/);
    assert.match(panel, /firstName \? `\$\{firstName\}, ` : null/);
    assert.match(reveal, /data-testid="reveal-hero-name"/);
    assert.match(reveal, /export function revealHeroFirstName/);
  });
});
