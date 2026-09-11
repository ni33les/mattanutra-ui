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
  t.mock.method(process, "emitWarning", () => {});
  const previous = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "offline-test-key";
  t.after(() => { if (previous === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = previous; });
  const requests: Request[] = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.ok(init?.signal, "Provider deadlines remain attached");
    requests.push(JSON.parse(String(init.body)));
    return Response.json({ choices: [{ message: { content: JSON.stringify(responses[Math.min(requests.length - 1, responses.length - 1)]) } }] });
  });
  return requests;
}

test("HS-PERF-01: formula prompt preserves every fact with compact JSON", async t => {
  const requests = capture(t, [formulaResponse]);
  await analyzeFormulationWithGrok(formulaInput);
  const content = requests[0].messages[1].content;
  const baseline = JSON.parse(readFileSync(new URL("./baseline-prompts.json", import.meta.url), "utf8")).formula;
  const prompt = JSON.parse(content);
  for (const key of ["assessment", "assessmentSafetyContext", "canonicalSupplementCatalogue", "currentPlanContext", "contract", "locale", "plan", "planId"]) {
    assert.deepEqual(prompt[key], JSON.parse(baseline)[key], key);
  }
  assert.equal(content, JSON.stringify(prompt), "No JSON indentation tokens");
  assert.ok(content.length < baseline.length * 0.9, `${content.length} versus ${baseline.length}`);
});

test("HS-PERF-02: different customers share the full immutable formula prefix", async t => {
  const requests = capture(t, [formulaResponse]);
  await analyzeFormulationWithGrok(formulaInput);
  await analyzeFormulationWithGrok({ ...formulaInput, answers: { ...answers, age: "46-55" } });
  const [a, b] = requests.map(r => r.messages[1].content);
  const end = a.indexOf('"assessment":');
  assert.ok(end > 3000, "Catalogue and instructions must precede customer data");
  assert.equal(a.slice(0, end), b.slice(0, end));
  assert.notEqual(a.slice(end), b.slice(end));
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
  assert.ok(result.aiCopy?.heroBody?.[locale]);
  assert.deepEqual(fixture.input.healthScore, original, "Deterministic score remains unchanged");
  const request = requests[0], content = request.messages[1].content, prompt = JSON.parse(content);
  const baseline = JSON.parse(readFileSync(new URL("./baseline-prompts.json", import.meta.url), "utf8"))[locale];
  assert.deepEqual(prompt, JSON.parse(baseline));
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
  assert.ok(result.aiCopy?.heroBody?.en);
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
