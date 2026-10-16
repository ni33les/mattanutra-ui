import assert from "node:assert/strict";
import test from "node:test";
import { validateHealthScoreAiResponse } from "../../lib/health-score-analysis.ts";
import { hasHealthScoreAiCopy, healthScoreReadProjection } from "../../lib/healthscore-readiness.ts";
import { healthFixture } from "./fixtures.ts";

const retired = ["findingsHeadline", "findingsSub", "gapTrio", "methodHeadline", "pillarHeadline", "relativityHeadline", "relativitySub"];

function compactFixture(locale: "en" | "th" | "zh-CN" = "en") {
  const fixture = healthFixture(locale);
  const pageCopy: Record<string, unknown> = { ...fixture.response.pageCopy, version: 2 };
  for (const key of retired) delete pageCopy[key];
  return { ...fixture, response: { pageCopy } };
}

function storedResult(fixture: ReturnType<typeof compactFixture>, pageCopy: unknown) {
  return { ...fixture.input.healthScore, pageContent: { ...fixture.input.healthScore.pageContent, aiCopy: pageCopy } };
}

for (const locale of ["en", "th", "zh-CN"] as const) test(`compact copy ${locale}: complete web and pharmacy copy is ready only in its locale`, () => {
  const fixture = compactFixture(locale);
  const result = validateHealthScoreAiResponse({ ...fixture.input, value: fixture.response });
  assert.deepEqual(result.errors, []);
  assert.ok(result.response);
  assert.equal(result.response.pageCopy.version, 2);
  assert.equal(result.response.pageCopy.methodCards?.length, 3, "Pharmacy method explanations must survive");
  assert.equal(result.response.pageCopy.findings?.length, fixture.response.pageCopy.findings instanceof Array ? fixture.response.pageCopy.findings.length : 0);
  const stored = storedResult(fixture, result.response.pageCopy);
  const projection = healthScoreReadProjection(stored);
  for (const requested of ["en", "th", "zh-CN"] as const) {
    assert.equal(hasHealthScoreAiCopy(stored, requested), requested === locale);
    assert.equal(projection.ready[requested], requested === locale);
  }
});

test("compact copy requires its version; historical complete copies retain their validation and readiness", () => {
  const fixture = compactFixture();
  const unversioned = structuredClone(fixture.response);
  delete unversioned.pageCopy.version;
  assert.ok(validateHealthScoreAiResponse({ ...fixture.input, value: unversioned }).errors.length);
  assert.equal(hasHealthScoreAiCopy(storedResult(fixture, unversioned.pageCopy), "en"), false);
  const historical = healthFixture();
  const validation = validateHealthScoreAiResponse({ ...historical.input, value: historical.response });
  assert.deepEqual(validation.errors, []);
  assert.equal(hasHealthScoreAiCopy(storedResult(fixture, validation.response?.pageCopy), "en"), true);
  assert.ok(validateHealthScoreAiResponse({ ...historical.input, value: historical.response, expectedVersion: 2 }).errors.some(error => error.includes("pageCopy.version")));
});

test("compact copy rejects unknown versions, missing pharmacy cards, retired slots and missing locale text", () => {
  const fixture = compactFixture();
  for (const mutate of [
    (copy: Record<string, unknown>) => { copy.version = 3; },
    (copy: Record<string, unknown>) => { delete copy.methodCards; },
    (copy: Record<string, unknown>) => { copy.methodCards = []; },
    (copy: Record<string, unknown>) => { copy.heroBody = { th: "คำอธิบาย" }; },
  ]) {
    const response = structuredClone(fixture.response);
    mutate(response.pageCopy);
    assert.ok(validateHealthScoreAiResponse({ ...fixture.input, value: response }).errors.length);
    assert.equal(hasHealthScoreAiCopy(storedResult(fixture, response.pageCopy), "en"), false);
  }
  for (const key of ["heroTitle", "heroBody", "bandLine", "highestLeverageBody", "strengthNote", "subtractionBody", "findings", "methodCards"]) {
    const response = structuredClone(fixture.response);
    delete response.pageCopy[key];
    assert.ok(validateHealthScoreAiResponse({ ...fixture.input, value: response }).errors.length, key);
    assert.equal(hasHealthScoreAiCopy(storedResult(fixture, response.pageCopy), "en"), false, key);
  }
  const extra = structuredClone(fixture.response);
  extra.pageCopy.gapTrio = [];
  assert.ok(validateHealthScoreAiResponse({ ...fixture.input, value: extra }).errors.some(error => error.includes("unexpected keys")));
});

test("compact copy retains field-specific number, length and forbidden-content checks", () => {
  const fixture = compactFixture();
  for (const [text, error] of [
    ["Your score is 999 points.", "introduced integer literal 999"],
    ["x", "outside 0.5x–1.5x"],
    [`${fixture.response.pageCopy.heroBody} Get tested.`, "forbidden term: get tested"]
  ]) {
    const response = structuredClone(fixture.response);
    response.pageCopy.heroBody = text;
    assert.ok(validateHealthScoreAiResponse({ ...fixture.input, value: response }).errors.some(message => message.includes(error)), text);
  }
  const response = structuredClone(fixture.response);
  const cards = response.pageCopy.methodCards as Array<{ title: string; body: string }>;
  cards[0].body += " 999";
  assert.ok(validateHealthScoreAiResponse({ ...fixture.input, value: response }).errors.some(error => error.includes("methodCards[0].body introduced integer")));
});
