import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { selectPublishedResources, publishedExample, selectPurchaseTradeOff, customerTargetConfirmation } from "../scripts/published-client-journey.mjs";

it("V5-CLIENT-01 follows discovery references even when archived v4 resources are listed first", () => {
  const resources = [
    { uri: "mattanutra://contract/4.0.0/schema", mimeType: "application/schema+json" },
    { uri: "mattanutra://contract/4.0.0/client-guide", mimeType: "text/markdown" },
    { uri: "mattanutra://contract/5.0.0/schema", mimeType: "application/schema+json" },
    { uri: "mattanutra://contract/5.0.0/client-guide", mimeType: "text/markdown" }
  ];
  const info = { contractVersion: "5.0.0", contractSchema: resources[2].uri, clientGuide: resources[3].uri };
  assert.deepEqual(selectPublishedResources(info, resources), { schema: resources[2], guide: resources[3] });
  assert.throws(() => selectPublishedResources(info, resources.slice(0, 2)), /published current/);
});
it("V5-CLIENT-02 request templates come from the connector and never mutate their published definition", () => {
  const contract = { examples: [{ name: "expand-search", tool: "plan", arguments: { operation: "revise", searchEffort: "expanded", requestPatch: {} } }] };
  const example = publishedExample(contract, "expand-search");
  assert.equal(example.searchEffort, "expanded"); example.requestPatch = { requirements: {} };
  assert.deepEqual(contract.examples[0].arguments.requestPatch, {});
  assert.throws(() => publishedExample(contract, "undocumented"), /missing published example/);
});
it("V5-CLIENT-03 trade-offs must be distinct returned and eligible choices", () => {
  const closest = { optionId: "closest", purchaseEligible: true, recommended: true, roles: ["closest_dose"], basket: [{ productId: "p" }] };
  const cheaper = { optionId: "cheaper", purchaseEligible: true, roles: ["lower_cost"], basket: [{ productId: "q" }] };
  assert.equal(selectPurchaseTradeOff({ optionId: "closest", options: [closest, cheaper] }), cheaper);
  assert.throws(() => selectPurchaseTradeOff({ optionId: "closest", options: [closest] }), /distinct purchasable trade-off/);
  assert.throws(() => selectPurchaseTradeOff({ optionId: "closest", options: [closest, { ...cheaper, purchaseEligible: false }] }), /distinct purchasable trade-off/);
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
    const question = { questionId: "q_returned", choices: [{ choice: "opaque-confirm", label, labelKey: "plan.question.satisfy_prerequisite" }, { choice: "opaque-leave", label: "Keep pending", labelKey: "plan.question.leave_prerequisite" }] };
    assert.deepEqual(customerTargetConfirmation({ questions: [question] }), { question, choice: question.choices[0] });
  }
  assert.throws(() => customerTargetConfirmation({ questions: [{ questionId: "wrong", choices: [{ label: "Mark the prerequisite satisfied", choice: "not-published" }] }] }), /documented customer confirmation/);
});

it("V5-CLIENT-10 stale recovery reloads through the published get example and reapplies intent with fresh returned identity", async () => {
  const { recoverPublishedPatch } = await import("../scripts/published-client-journey.mjs");
  const contract = { examples: [{ name: "get-current-or-processing", tool: "plan", arguments: { operation: "get", planHandle: "example-placeholder" } }] };
  const intended = { operation: "revise", planHandle: "stale-local-handle", expectedRevision: 2,
    idempotencyKey: "original-stale-key", requestPatch: { requirements: { excludeProductIds: ["prd_rejected"] } } };
  const original = structuredClone(intended);
  const latest = { ok: true, planHandle: "returned-current-handle", revision: 9, status: "ready",
    medicationCodes: ["apixaban"], coverage: [{ name: "Vitamin D3", requestedAmount: 2000, unit: "IU" }] };
  const requests: unknown[] = [];
  const recovered = { ...latest, revision: 10 };
  const result = await recoverPublishedPatch({ contract, intended, idempotencyKey: "stable-recovery-key",
    current: async (plan: unknown) => plan,
    callPlan: async (args: unknown) => { requests.push(structuredClone(args)); return requests.length === 1 ? latest : recovered; } });
  assert.deepEqual(requests, [
    { operation: "get", planHandle: "stale-local-handle" },
    { ...intended, planHandle: "returned-current-handle", expectedRevision: 9, idempotencyKey: "stable-recovery-key" }
  ]);
  assert.deepEqual(result, { current: latest, recovered });
  assert.deepEqual(intended, original);
});

it("V5-CLIENT-11 failed reloads never reapply a stale patch or use a guessed revision", async () => {
  const { recoverPublishedPatch } = await import("../scripts/published-client-journey.mjs");
  const contract = { examples: [{ name: "get-current-or-processing", tool: "plan", arguments: { operation: "get" } }] };
  const intended = { operation: "revise", planHandle: "saved-handle", expectedRevision: 2, requestPatch: {} };
  for (const response of [{ ok: false, error: { reasonCode: "not_found" } }, { ok: true, planHandle: "returned", revision: 0 }]) {
    let calls = 0;
    await assert.rejects(recoverPublishedPatch({ contract, intended, idempotencyKey: "stable-recovery-key", current: async (plan: unknown) => plan,
      callPlan: async () => { calls += 1; return response; } }), /reload.*current.*revision/i);
    assert.equal(calls, 1);
  }
});

it("V5-CLIENT-12 the documented client exercises recovery and verifies preserved business context", () => {
  const client = readFileSync("scripts/run-published-mcp-client.mjs", "utf8");
  const recovery = client.slice(client.indexOf('"stale revisions provide an actionable error"'), client.indexOf('const standardLoss'));
  assert.match(recovery, /recoverPublishedPatch\(/);
  assert.match(recovery, /intended: patch/);
  assert.match(recovery, /plan\.revision > recovery\.current\.revision/);
  assert.match(recovery, /medicationCodes/);
  assert.match(recovery, /originalTargets\.every/);
  assert.match(recovery, /product\.productId/);
});
