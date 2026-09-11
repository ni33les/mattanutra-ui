import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { analyzeFormulationWithGrok } from "../../lib/formulation-analysis.ts";
import { analyzeHealthScoreAdviceWithUsage } from "../../lib/health-score-analysis.ts";
import { callGrokChatCompletion } from "../../lib/grok-client.ts";
import { answers, formulaInput, formulaResponse, healthFixture } from "./fixtures.ts";

type Schema = { properties: Record<string, Schema>; items: Schema; required: string[]; type?: string; minItems?: number; maxItems?: number };
type Request = { messages: { content: string; role: string }[]; response_format: {
  type: string; json_schema?: { strict: boolean; schema: Schema }
} };

function capture(t: TestContext, responses: unknown[]) {
  const previous = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "offline-test-key";
  t.after(() => { if (previous === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = previous; });
  const requests: Request[] = [];
  t.mock.method(globalThis, "fetch", async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.ok(init?.signal, "Provider deadlines remain attached");
    requests.push(JSON.parse(String(init.body)));
    return Response.json({ choices: [{ message: { content: JSON.stringify(responses[Math.min(requests.length - 1, responses.length - 1)]) } }] });
  });
  return requests;
}

test("HS-PERF-01: formula prompt preserves every fact with compact JSON", async t => {
  const requests = capture(t, [formulaResponse]);
  await analyzeFormulationWithGrok(formulaInput);
  const contents = requests[0].messages.slice(1).map(m => m.content);
  const baseline = JSON.parse(readFileSync(new URL("./baseline-prompts.json", import.meta.url), "utf8")).formula;
  const prompt = Object.assign({}, ...contents.map(content => JSON.parse(content)));
  const original = JSON.parse(baseline);
  // These are authored prose instructions, not input facts. Their new distinct
  // roles are asserted by HS-CACHE-05; the rest of the contract stays identical.
  for (const key of ["rationale", "decision", "whyThisIsForYou"]) {
    original.contract.supplementBreakdown[0][key] = prompt.contract.supplementBreakdown[0][key];
  }
  for (const key of ["assessment", "assessmentSafetyContext", "canonicalSupplementCatalogue", "currentPlanContext", "contract", "locale", "plan", "planId"]) {
    assert.deepEqual(prompt[key], original[key], key);
  }
  for (const content of contents) assert.equal(content, JSON.stringify(JSON.parse(content)), "No JSON indentation tokens");
  const length = contents.reduce((sum, content) => sum + content.length, 0);
  assert.ok(length < baseline.length * 0.9, `${length} versus ${baseline.length}`);
});

test("HS-PERF-02: different customers share the full immutable formula prefix", async t => {
  const requests = capture(t, [formulaResponse]);
  await analyzeFormulationWithGrok(formulaInput);
  await analyzeFormulationWithGrok({ ...formulaInput, answers: { ...answers, age: "46-55" } });
  const [a, b] = requests.map(r => r.messages[1].content);
  assert.ok(a.length > 3000, "Catalogue and instructions must precede customer data");
  assert.equal(a, b);
  assert.notEqual(requests[0].messages[2].content, requests[1].messages[2].content);
});

test("HS-PERF-03: formula request has a strict provider schema and consistent names", async t => {
  const requests = capture(t, [formulaResponse]);
  await analyzeFormulationWithGrok(formulaInput);
  const request = requests[0];
  assert.equal(request.response_format.type, "json_schema");
  assert.equal(request.response_format.json_schema?.strict, true);
  const schema = request.response_format.json_schema!.schema;
  assert.deepEqual(schema.required, ["supplementBreakdown", "marketingPoints", "cautions"]);
  assert.equal(schema.properties.supplementBreakdown.items.properties.supplement.type, "string");
  assert.doesNotMatch(request.messages[1].content, /set supplement\.en/);
});

for (const locale of ["en", "th", "zh-CN"] as const) test(`HS-PERF-04 ${locale}: compact HealthScore retains facts and all localized copy slots`, async t => {
  const fixture = healthFixture(locale);
  const original = structuredClone(fixture.input.healthScore);
  const requests = capture(t, [fixture.response]);
  const result = await analyzeHealthScoreAdviceWithUsage(fixture.input);
  assert.equal(requests.length, 1);
  assert.ok(result.aiCopy?.heroBody && typeof result.aiCopy.heroBody !== "string");
  assert.ok(result.aiCopy.heroBody[locale]);
  assert.deepEqual(fixture.input.healthScore, original, "Deterministic score remains unchanged");
  const request = requests[0], content = request.messages[1].content, prompt = JSON.parse(content);
  const baseline = JSON.parse(readFileSync(new URL("./baseline-prompts.json", import.meta.url), "utf8"))[locale];
  const originalPrompt = JSON.parse(baseline);
  const { instructions: originalInstructions, ...originalFacts } = originalPrompt;
  const { instructions, ...facts } = prompt;
  assert.deepEqual(facts, originalFacts);
  assert.deepEqual(instructions.slice(0, -2), originalInstructions.slice(0, -1));
  assert.equal(content, JSON.stringify(prompt));
  assert.ok(content.indexOf('"contract":') < content.indexOf('"assessment":'));
  const schema = request.response_format.json_schema?.schema;
  assert.equal(request.response_format.type, "json_schema");
  assert.equal(schema?.properties.pageCopy.properties.findings.minItems, fixture.response.pageCopy.findings.length);
  assert.equal(schema?.properties.pageCopy.properties.gapTrio.maxItems, fixture.response.pageCopy.gapTrio.length);
  assert.deepEqual([...schema?.properties.pageCopy.required].sort(), Object.keys(fixture.response.pageCopy).sort());
});

test("HS-PERF-05: shape constraints never replace content validation", async t => {
  const fixture = healthFixture();
  const invalid = structuredClone(fixture.response);
  invalid.pageCopy.heroBody = "Your score is 999 points.";
  const requests = capture(t, [invalid, fixture.response]);
  const result = await analyzeHealthScoreAdviceWithUsage(fixture.input);
  assert.equal(requests.length, 2);
  assert.ok(result.aiCopy?.heroBody && typeof result.aiCopy.heroBody !== "string");
  assert.ok(result.aiCopy.heroBody.en);
  assert.match(requests[1].messages.at(-1)!.content, /Validation errors/);
});

test("HS-PERF-06: formulation still rejects duplicate ranks and retains the complete formula", async t => {
  const invalid = structuredClone(formulaResponse);
  invalid.supplementBreakdown.push({ ...invalid.supplementBreakdown[0], id: "other-ingredient" });
  const requests = capture(t, [invalid, formulaResponse]);
  const result = await analyzeFormulationWithGrok(formulaInput);
  assert.equal(requests.length, 2);
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.formulation.supplementBreakdown.map(i => [i.id, i.dailyDose]), [["vitamin-d3", "25 mcg/day"]]);
});

test("HS-PERF-07: unrelated AI callers retain their existing JSON-object transport", async t => {
  const requests = capture(t, [{}]);
  await callGrokChatCompletion({ apiKey: "offline", model: "unchanged", messages: [], timeoutMs: 1000 });
  assert.deepEqual(requests[0].response_format, { type: "json_object" });
});

test("HS-PERF-08: first HealthScore request explains the validator's per-field restrictions", async t => {
  const fixture = healthFixture();
  const requests = capture(t, [fixture.response]);
  await analyzeHealthScoreAdviceWithUsage(fixture.input);
  const instructions = JSON.parse(requests[0].messages[1].content).instructions.join(" ");
  assert.match(instructions, /same field's copySeed/);
  assert.match(instructions, /0\.5x.*1\.5x/);
  assert.doesNotMatch(instructions, /unless they appear in deterministicContent\.locked or copySeeds/);
});

test("HS-PERF-10: compact refinement retains prior formula, feedback and chat context", async t => {
  const requests = capture(t, [formulaResponse]);
  const input = { ...formulaInput, previousFormulation: formulaResponse, planFeedback: [],
    chatMessages: [{ id: "message-1", status: "ready" as const, body: "Keep my medication context", createdAt: "2026-09-11T00:00:00Z", role: "user" as const }] };
  await analyzeFormulationWithGrok(input);
  const prompt = Object.assign({}, ...requests[0].messages.slice(1).map(m => JSON.parse(m.content)));
  assert.deepEqual(prompt.assessment, answers);
  assert.deepEqual(prompt.currentPlanContext, {
    previousSupplementGuidance: formulaResponse, planFeedback: [],
    chatMessages: [{ body: "Keep my medication context", createdAt: "2026-09-11T00:00:00Z", role: "user" }]
  });
  assert.deepEqual(prompt.assessmentSafetyContext.medications.classes, answers.medTypes);
});
