import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { selectPublishedResources, publishedExample, currentRecommendation, customerTargetConfirmation } from "../scripts/published-client-journey.mjs";

it("ANNA-CLIENT-01 tools-only discovery reconstructs examples from published guide content", async () => {
  const { contractFromToolDiscovery } = await import("../scripts/published-client-journey.mjs");
  const guide = '### create\n\n```json\n{"method":"tools/call","params":{"name":"plan","arguments":{"targets":[{"basis":"supplemental"}]}}}\n```\n';
  const tool = { name: "plan", inputSchema: { type: "object" }, outputSchema: { type: "object" } };
  const contract = contractFromToolDiscovery({ contractVersion: "9.0.0" }, [tool], guide);
  assert.deepEqual(contract.tools.plan.inputSchema, tool.inputSchema);
  assert.equal(publishedExample(contract, "create").targets[0].basis, "supplemental");
  assert.throws(() => contractFromToolDiscovery({ contractVersion: "9.0.0" }, [tool], "No executable examples"), /examples/);
});

it("V5-CLIENT-01 follows current discovery references and rejects missing current publications", () => {
  const resources = [
    { uri: "mattanutra://contract/4.0.0/schema", mimeType: "application/schema+json" },
    { uri: "mattanutra://contract/4.0.0/client-guide", mimeType: "text/markdown" },
    { uri: "mattanutra://contract/9.0.0/schema", mimeType: "application/schema+json" },
    { uri: "mattanutra://contract/9.0.0/client-guide", mimeType: "text/markdown" }
  ];
  const info = { contractVersion: "9.0.0", contractSchema: resources[2].uri, clientGuide: resources[3].uri };
  assert.deepEqual(selectPublishedResources(info, resources), { schema: resources[2], guide: resources[3] });
  assert.throws(() => selectPublishedResources(info, resources.slice(0, 2)), /published current/);
});
it("V5-CLIENT-02 request templates come from the connector and never mutate their published definition", () => {
  const contract = { examples: [{ name: "expand-search", tool: "plan", arguments: { searchEffort: "expanded", requirements: {} } }] };
  const example = publishedExample(contract, "expand-search");
  assert.equal(example.searchEffort, "expanded"); example.requirements = { requirements: {} };
  assert.deepEqual(contract.examples[0].arguments.requirements, {});
  assert.throws(() => publishedExample(contract, "undocumented"), /missing published example/);
});
it("V5-CLIENT-03 the client confirms only the single returned recommendation", () => {
  const closest = { roles: ["best_match"], products: [{ productId: "p" }] };
  const cheaper = { roles: ["lower_cost"], products: [{ productId: "q" }] };
  assert.equal(currentRecommendation({ choices: [closest] }), closest);
  assert.throws(() => currentRecommendation({ choices: [closest, cheaper] }), /one current recommendation/);
  assert.throws(() => currentRecommendation({ choices: [{ ...closest, products: [] }] }), /No current purchasable recommendation/);
  assert.throws(() => currentRecommendation({ choices: [] }), /one current recommendation/);
});
it("V5-CLIENT-04 documented client has no application, database, fixture-endpoint or private catalogue dependency", () => {
  const client = readFileSync("scripts/run-published-mcp-client.mjs", "utf8") + readFileSync("scripts/published-client-journey.mjs", "utf8");
  assert.doesNotMatch(client, /(?:from|import\s*\()[\s\S]*?["'](?:@\/|\.\.\/lib\/|postgres|\.\.\/test\/)/);
  assert.doesNotMatch(client, /(?:qa_fixture|drivePaymentFixture|settle-local|TEST_DB_URL|DB_URL)/);
});

it("V5-CLIENT-08 connector guidance explains customer choices without test-harness directions", () => {
  const guide = readFileSync("lib/agentic/contract/guide.ts", "utf8");
  assert.match(guide, /Illustrative amounts[^.]+not personal dose recommendations/);
  assert.match(guide, /actual questionId and choice corresponding to the customer/);
  assert.doesNotMatch(guide, /To exercise answer|Do not execute this separate diagnostic|In this fixture the customer|only if its requestedNutrients amount/);
});

it("V5-CLIENT-09 customer answer selection uses documented returned semantics in every language", () => {
  for (const label of ["Mark the prerequisite satisfied", "ยืนยันว่าเงื่อนไขครบแล้ว", "确认已满足条件"]) {
    const question = { questionId: "q_returned", choices: [{ choice: "satisfy_prerequisite", label, labelKey: "plan.question.satisfy_prerequisite" }, { choice: "opaque-leave", label: "Keep pending", labelKey: "plan.question.leave_prerequisite" }] };
    assert.deepEqual(customerTargetConfirmation({ questions: [question] }), { question, choice: question.choices[0] });
  }
  assert.throws(() => customerTargetConfirmation({ questions: [{ questionId: "wrong", choices: [{ label: "Mark the prerequisite satisfied", choice: "not-published" }] }] }), /documented customer confirmation/);
});

it("V5-CLIENT-10 stale recovery reloads through the published get example and reapplies intent with fresh returned identity", async () => {
  const { recoverPublishedPatch } = await import("../scripts/published-client-journey.mjs");
  const contract = { examples: [{ name: "get-current-decision", tool: "plan", arguments: { planHandle: "example-placeholder" } }] };
  const intended = { planHandle: "stale-local-handle", expectedRevision: 2,
    idempotencyKey: "original-stale-key", requirements: { requirements: { excludeProductIds: ["prd_rejected"] } } };
  const original = structuredClone(intended);
  const latest = { ok: true, planHandle: "returned-current-handle", revision: 9, status: "ready",
    medicationCodes: ["apixaban"], coverage: [{ name: "Vitamin D3", requestedAmount: 2000, unit: "IU" }] };
  const requests: unknown[] = [];
  const recovered = { ...latest, revision: 10 };
  const result = await recoverPublishedPatch({ contract, intended, idempotencyKey: "stable-recovery-key",
    current: async (plan: unknown) => plan,
    callPlan: async (args: unknown) => { requests.push(structuredClone(args)); return requests.length === 1 ? latest : recovered; } });
  assert.deepEqual(requests, [
    { planHandle: "stale-local-handle" },
    { ...intended, planHandle: "returned-current-handle", expectedRevision: 9, idempotencyKey: "stable-recovery-key" }
  ]);
  assert.deepEqual(result, { current: latest, recovered });
  assert.deepEqual(intended, original);
});

it("V5-CLIENT-11 failed reloads never reapply a stale patch or use a guessed revision", async () => {
  const { recoverPublishedPatch } = await import("../scripts/published-client-journey.mjs");
  const contract = { examples: [{ name: "get-current-decision", tool: "plan", arguments: {  } }] };
  const intended = { planHandle: "saved-handle", expectedRevision: 2, requirements: {} };
  for (const response of [{ ok: false, error: { reasonCode: "not_found" } }, { ok: true, planHandle: "returned", revision: 0 }]) {
    let calls = 0;
    await assert.rejects(recoverPublishedPatch({ contract, intended, idempotencyKey: "stable-recovery-key", current: async (plan: unknown) => plan,
      callPlan: async () => { calls += 1; return response; } }), /reload.*current.*revision/i);
    assert.equal(calls, 1);
  }
});

it("V5-CLIENT-12 the documented client exercises stale selection and preserves returned identity", () => {
  const client = readFileSync("scripts/published-client-journey.mjs", "utf8");
  assert.match(client, /stale_revision/); assert.match(client, /const selection = \{ planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey:/);
  assert.match(client, /assert.deepEqual\(await call\("plan", selection\), plan\)/);
  assert.match(client, /product.quantity \* Math.round\(product.unitPrice/);
});
