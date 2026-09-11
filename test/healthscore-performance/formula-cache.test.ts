import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { analyzeFormulationWithGrok } from "../../lib/formulation-analysis.ts";
import { callGrokChatCompletion } from "../../lib/grok-client.ts";
import { formulaInput, formulaResponse } from "./fixtures.ts";

type Request = { headers: Headers; body: { messages: { role: string; content: string }[]; reasoning_effort: string } };
function capture(t: TestContext, responses: unknown[] = [formulaResponse]) {
  const keys = ["XAI_API_KEY", "GROK_MODEL", "FORMULATION_REASONING_EFFORT", "FORMULATION_PROMPT_VERSION"];
  const saved = keys.map(key => process.env[key]);
  for (const key of keys) delete process.env[key];
  process.env.XAI_API_KEY = "offline";
  t.after(() => keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  const requests: Request[] = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.ok(init?.signal, "The provider request retains its deadline");
    requests.push({ headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return Response.json({ choices: [{ message: { content: JSON.stringify(responses[Math.min(requests.length - 1, responses.length - 1)]) } }] });
  });
  return requests;
}

test("HS-CACHE-01: completed immutable message and opaque routing key are reused across customers", async t => {
  const requests = capture(t);
  await analyzeFormulationWithGrok(formulaInput);
  await analyzeFormulationWithGrok({ ...formulaInput, planId: "private-plan-2", answers: { ...formulaInput.answers, age: "46-55" } });
  const [a, b] = requests;
  assert.equal(a.body.messages.length, 3);
  assert.deepEqual(a.body.messages.slice(0, 2), b.body.messages.slice(0, 2));
  assert.notDeepEqual(a.body.messages[2], b.body.messages[2]);
  const prefix = JSON.parse(a.body.messages[1].content);
  assert.deepEqual(Object.keys(prefix).sort(), ["canonicalSupplementCatalogue", "contract", "instructions"]);
  assert.equal(JSON.parse(b.body.messages[2].content).planId, "private-plan-2");
  assert.match(a.headers.get("x-grok-conv-id") ?? "", /^mn-formula-[a-f0-9]{64}$/);
  assert.equal(a.headers.get("x-grok-conv-id"), b.headers.get("x-grok-conv-id"));
});

test("HS-CACHE-02: changed catalogue safety facts, model, prompt and effort change routing identity", async t => {
  const requests = capture(t);
  await analyzeFormulationWithGrok(formulaInput);
  await analyzeFormulationWithGrok({ ...formulaInput, canonicalSupplements: formulaInput.canonicalSupplements.map(s => ({ ...s, safetyNotes: "New verified caution" })) });
  process.env.GROK_MODEL = "different-model";
  await analyzeFormulationWithGrok(formulaInput);
  delete process.env.GROK_MODEL;
  process.env.FORMULATION_PROMPT_VERSION = "different-prompt";
  await analyzeFormulationWithGrok(formulaInput);
  delete process.env.FORMULATION_PROMPT_VERSION;
  process.env.FORMULATION_REASONING_EFFORT = "low";
  await analyzeFormulationWithGrok(formulaInput);
  const identities = requests.map(r => r.headers.get("x-grok-conv-id"));
  assert.ok(identities.every(Boolean));
  assert.equal(new Set(identities).size, 5);
});

test("HS-CACHE-03: validation retry retains routing identity, safety fields and private context", async t => {
  const valid = { ...structuredClone(formulaResponse), cautions: [{ id: "medication-review", severity: "review", title: "Medication context", body: "Review the supplied medication context.", relatedAnswerKeys: ["medTypes"] }] };
  const invalid = structuredClone(valid);
  invalid.supplementBreakdown.push({ ...invalid.supplementBreakdown[0], id: "duplicate-rank" });
  const requests = capture(t, [invalid, valid]);
  const result = await analyzeFormulationWithGrok(formulaInput);
  assert.equal(result.attempts, 2);
  assert.ok(requests[0].headers.get("x-grok-conv-id"));
  assert.equal(requests[0].headers.get("x-grok-conv-id"), requests[1].headers.get("x-grok-conv-id"));
  assert.deepEqual(requests[0].body.messages, requests[1].body.messages.slice(0, 3));
  assert.equal(result.formulation.cautions[0].body.en, valid.cautions[0].body);
  assert.deepEqual(result.formulation.cautions[0].relatedAnswerKeys, ["medTypes"]);
});

test("HS-CACHE-04: unrelated requests do not acquire provider routing headers", async t => {
  const requests = capture(t);
  await callGrokChatCompletion({ apiKey: "offline", model: "unchanged", messages: [], timeoutMs: 1000 });
  assert.equal(requests[0].headers.get("x-grok-conv-id"), null);
});

for (const locale of ["en", "th", "zh-CN"] as const) test(`HS-CACHE-05 ${locale}: distinct short prose roles retain all output fields and medium reasoning`, async t => {
  const requests = capture(t);
  const result = await analyzeFormulationWithGrok({ ...formulaInput, locale });
  const prompt = JSON.parse(requests[0].body.messages[1].content);
  assert.match(prompt.instructions.join(" "), /Do not repeat the same explanation across rationale, decision, and whyThisIsForYou/);
  assert.match(prompt.instructions.join(" "), /Never shorten away.*caution/);
  assert.match(prompt.contract.supplementBreakdown[0].whyThisIsForYou, /one short sentence/);
  assert.equal(JSON.parse(requests[0].body.messages[2].content).locale, locale);
  assert.equal(result.promptVersion, "v3-cached-concise");
  assert.equal(requests[0].body.reasoning_effort, "medium");
  for (const key of ["rationale", "decision", "whyThisIsForYou", "dailyDose", "cautions"]) assert.ok(key in result.formulation.supplementBreakdown[0]);
});
