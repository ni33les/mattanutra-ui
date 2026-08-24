import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const execution = readFileSync(
  new URL("../lib/task-execution.ts", import.meta.url),
  "utf8"
);
const applier = readFileSync(
  new URL("../lib/task-result-applier.ts", import.meta.url),
  "utf8"
);
const store = readFileSync(
  new URL("../lib/assessment-store.ts", import.meta.url),
  "utf8"
);
const page = readFileSync(
  new URL("../app/[locale]/nutrition/healthscore/page.tsx", import.meta.url),
  "utf8"
);
const calculating = readFileSync(
  new URL("../components/chat-questionnaire/questionnaire-calculating.tsx", import.meta.url),
  "utf8"
);
const journeyRead = readFileSync(
  new URL("../lib/nutrition-journey-read.ts", import.meta.url),
  "utf8"
);
const copyClient = readFileSync(
  new URL("../lib/healthscore-copy-client.ts", import.meta.url),
  "utf8"
);

describe("HealthScore page waits for real AI copy", () => {
  it("does not write seed templates into aiCopy when Grok fails", () => {
    assert.doesNotMatch(execution, /deterministicHealthScorePageCopy/);
    assert.doesNotMatch(execution, /withDeterministicHealthScoreFallback/);
    assert.match(execution, /fallbackUsed: true,\s*healthScore: workItem\.healthScore/);
    assert.match(applier, /if \(!fallbackUsed\) \{[\s\S]*health_score = \$\{sql\.json\(toJsonValue\(healthScore\)\)\}/);
  });

  it("treats AI copy as ready only when a hero body exists", () => {
    assert.match(store, /export function hasHealthScoreAiCopy/);
    assert.match(store, /export function hasHealthScoreAdvice\(value: unknown\) \{\s*return hasHealthScoreAiCopy\(value\);/);
    assert.match(journeyRead, /copyReady/);
    assert.match(journeyRead, /analyze_healthscore/);
    assert.match(journeyRead, /export async function getHealthScoreCopySnapshot/);
    assert.doesNotMatch(
      journeyRead.slice(
        journeyRead.indexOf("export async function getHealthScoreCopySnapshot"),
        journeyRead.indexOf("export async function getNutritionJourneySnapshot")
      ),
      /product_recommendation_runs|formulations/
    );
    assert.match(copyClient, /journey\?view=copy/);
  });

  it("keeps HealthScore HTML off seed prose until copy exists", () => {
    assert.match(page, /hasHealthScoreAiCopy\(prefill\.healthScore\)/);
    assert.match(page, /HealthScoreCopyGate/);
    assert.match(calculating, /"sent"/);
    assert.match(calculating, /onEmailComplete/);
    assert.doesNotMatch(calculating, /mn-quiz-calc__vial|barPct/);
    assert.doesNotMatch(calculating, /calcLonger/);
    assert.match(calculating, /showEmailEscape/);
  });
});
