import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { installRealCatalogue, uninstallRealCatalogue, runtime, rpc, profile } from "../ax-refinement/helpers.ts";
import { resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import type { PlanConversationWire, PlanSuccessWire } from "../../lib/agentic/contract/outputs.ts";

afterEach(() => { resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });
const requireConversation = (value: Record<string, unknown>) => { assert.equal(value.ok, true, JSON.stringify(value)); assert.equal(value.responseView, "conversation"); return value as unknown as PlanConversationWire; };

test("AG72-VIEW-01 every plan operation defaults to conversation without changing mutation replay identity", async () => {
  await installRealCatalogue("dev"); const app = runtime("agent-surface-default");
  const create = { operation: "create", idempotencyKey: "agent-surface-default-create", request: profile("A6") };
  let plan = requireConversation(await rpc(app, "plan", create));
  assert.equal(plan.status, "ready");
  const full = await rpc(app, "plan", { ...create, responseView: "full" });
  assert.equal(full.planHandle, plan.planHandle); assert.equal(full.revision, plan.revision); assert.ok(!Object.hasOwn(full, "responseView"));
  plan = requireConversation(await rpc(app, "plan", { operation: "get", planHandle: plan.planHandle }));
  plan = requireConversation(await rpc(app, "plan", { operation: "revise", planHandle: plan.planHandle, expectedRevision: plan.revision,
    idempotencyKey: "agent-surface-default-revise", requestPatch: { targets: [{ name: "Vitamin D3", amount: 2500, unit: "IU", basis: "total_daily", importance: "conditional", prerequisite: { status: "unknown", reasonCode: "customer_target_confirmation", nextAction: "The customer is deciding whether to include this provisional target." } }] } }));
  const question = plan.questions?.[0]; assert.ok(question, "Returned customer decision required for answer coverage");
  const choice = question.choices.find(value => value.labelKey === "plan.question.satisfy_prerequisite"); assert.ok(choice);
  plan = requireConversation(await rpc(app, "plan", { operation: "answer", planHandle: plan.planHandle, expectedRevision: plan.revision,
    idempotencyKey: "agent-surface-default-answer", answers: [{ questionId: question.questionId, choice: choice.choice }] }));
  const option = plan.options.find(value => value.purchaseEligible); assert.ok(option);
  plan = requireConversation(await rpc(app, "plan", { operation: "select", planHandle: plan.planHandle, expectedRevision: plan.revision,
    idempotencyKey: "agent-surface-default-select", optionId: option.optionId }));
  assert.equal(plan.selectedOptionId, option.optionId);
});

test("AG72-VIEW-02 a legacy client pin preserves the omitted full view while explicit views take precedence", async () => {
  await installRealCatalogue("dev"); const app = { ...runtime("agent-surface-pinned"), clientContractVersion: "7.1.0" };
  const input = { operation: "create", idempotencyKey: "agent-surface-pinned-create", request: profile("A6") };
  const full = await rpc(app, "plan", input); assert.equal(full.ok, true); assert.ok(!Object.hasOwn(full, "responseView")); assert.ok(full.canonical);
  const compact = requireConversation(await rpc(app, "plan", { ...input, responseView: "conversation" }));
  assert.equal(compact.planHandle, full.planHandle); assert.equal(compact.revision, full.revision);
  const current = requireConversation(await rpc({ ...app, clientContractVersion: "7.2.0" }, "plan", { operation: "get", planHandle: full.planHandle }));
  assert.equal(current.selectedOptionId, compact.selectedOptionId);
  const status = await rpc(app, "plan", { operation: "get", planHandle: full.planHandle, responseView: "status", knownResultVersion: compact.resultVersion });
  assert.equal(status.responseView, "status"); assert.equal(status.unchanged, true);
  const invalid = await rpc({ ...app, clientContractVersion: "not-a-version" }, "plan", { operation: "get", planHandle: full.planHandle });
  assert.equal(invalid.ok, false); assert.ok(invalid.error);
});

test("AG72-EVIDENCE-01 a listed evidence tool reads only attached claims through the returned capability", async () => {
  await installRealCatalogue("dev"); const app = runtime("agent-surface-evidence");
  const input = { operation: "create", idempotencyKey: "agent-surface-evidence-create", request: profile("A6") };
  const plan = await rpc(app, "plan", input); assert.equal(plan.ok, true); assert.equal(typeof plan.evidenceHandle, "string");
  const evidence = await rpc(app, "evidence", { evidenceHandle: plan.evidenceHandle, mode: "sources", locale: "en" });
  assert.equal(evidence.ok, true); assert.equal(evidence.planRevision, plan.revision);
  const claims = evidence.claims as { claimId: string; statement: string; source: string }[];
  assert.ok(claims.length > 0, "Fixture must have attached research claims"); assert.ok(claims.every(claim => claim.statement && claim.source));
  const full = await rpc(app, "plan", { operation: "get", planHandle: plan.planHandle, responseView: "full" });
  assert.deepEqual(claims.map(claim => claim.claimId), full.claimIds);
  const unattached = await rpc(app, "evidence", { evidenceHandle: plan.evidenceHandle, claimIds: ["clm_not_attached_to_this_plan"] });
  assert.equal(unattached.ok, false); assert.equal((unattached.error as { reasonCode: string }).reasonCode, "unreferenced_claim");
  const wrongPurpose = await rpc(app, "evidence", { evidenceHandle: plan.planHandle }); assert.equal(wrongPurpose.ok, false);
  const other = runtime("agent-surface-other", app.store); const denied = await rpc(other, "evidence", { evidenceHandle: plan.evidenceHandle }); assert.equal(denied.ok, false);
});

for (const id of ["A1", "A2", "A3", "A4", "A5", "A6"]) test(`AG72-GOLDEN-01 ${id} default decisions stay below 30 KiB and preserve returned coverage and alternatives`, async () => {
  await installRealCatalogue("dev"); const app = runtime(`agent-surface-golden-${id}`);
  const plan = requireConversation(await rpc(app, "plan", { operation: "create", idempotencyKey: `agent-surface-golden-${id}-create`, request: profile(id) }));
  assert.equal(plan.status, "ready"); assert.ok(Buffer.byteLength(JSON.stringify(plan), "utf8") < 30 * 1024);
  const full = await rpc(app, "plan", { operation: "get", planHandle: plan.planHandle, responseView: "full" }) as unknown as PlanSuccessWire;
  assert.equal(plan.selectedOptionId, full.optionId);
  assert.deepEqual(plan.options.map(option => option.optionId), full.options!.map(option => option.optionId));
  assert.ok(plan.options.length > 0);
  for (const option of plan.options) {
    const original = full.options!.find(value => value.optionId === option.optionId)!;
    assert.equal(option.coveragePercent, original.coveragePercent); assert.equal(option.purchaseEligible, original.purchaseEligible);
    if (option.basket) assert.deepEqual(option.basket.map(product => [product.productId, product.servingsPerDay, product.quantity, product.lineTotalMinor]), original.basket!.map(product => [product.productId, product.servingsPerDay, product.quantity, product.lineTotalMinor]));
    assert.ok(option.adviceIds.every(adviceId => plan.advice.some(advice => advice.adviceId === adviceId)));
  }
  if (full.alternativeSearch?.status === "found") {
    assert.ok(plan.highlightedAlternativeOptionId);
    assert.ok(plan.options.some(option => option.optionId === plan.highlightedAlternativeOptionId && option.purchaseEligible));
  }
});
