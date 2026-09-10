import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { hasHealthScoreAiCopy } from "../lib/assessment-store.ts";
import { completeHealthScoreFixture } from "./fixtures/healthscore.ts";
const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
describe("HealthScore requires complete localized AI advice", () => {
  it("requires every overlay field and card in the requested locale", () => {
    for (const locale of ["en", "th", "zh-CN"] as const) {
      const complete = completeHealthScoreFixture(locale);
      assert.equal(hasHealthScoreAiCopy(complete, locale), true);
      assert.equal(hasHealthScoreAiCopy(complete, locale === "en" ? "th" : "en"), false);
      for (const key of Object.keys(complete.pageContent.aiCopy)) {
        const partial = structuredClone(complete);
        Reflect.deleteProperty(partial.pageContent.aiCopy, key);
        assert.equal(hasHealthScoreAiCopy(partial, locale), false, `Missing ${key}`);
      }
      assert.equal(hasHealthScoreAiCopy({ score: 75 }, locale), false);
    }
  });
  it("does not mark an AI failure successful with seed prose", () => {
    const execution = source("lib/task-execution.ts");
    assert.doesNotMatch(execution, /deterministicHealthScorePageCopy|withDeterministicHealthScoreFallback/);
    assert.match(execution, /throw new Error\(`HealthScore advice failed:/);
    const publication = source("lib/task-result-applier.ts");
    assert.match(publication, /projection: healthScoreReadProjection\(score\)/);
    assert.match(publication, /if \(!prepared\.projection\.ready\[locale\]\) throw new Error\("HealthScore AI advice is incomplete"\)/);
    assert.match(source("lib/healthscore-readiness.ts"), /ready: \{ en: hasHealthScoreAiCopy\(value, "en"\), th: hasHealthScoreAiCopy\(value, "th"\), "zh-CN": hasHealthScoreAiCopy\(value, "zh-CN"\)/);
  });
  it("keeps the public gate closed and reflects durable email acknowledgement", () => {
    assert.match(source("components/nutrition-flow/healthscore-copy-gate.tsx"), /canOpenResults=\{false\}/);
    const calculating = source("components/chat-questionnaire/questionnaire-calculating.tsx");
    assert.match(calculating, /delivery\?\.status === "sent"/);
    assert.match(calculating, /calcEmailRequested/);
    assert.doesNotMatch(calculating, /onEmailComplete|calcLonger|mn-quiz-calc__vial/);
  });
});
