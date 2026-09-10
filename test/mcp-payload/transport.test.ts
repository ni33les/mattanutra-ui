import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { installRealCatalogue, uninstallRealCatalogue, runtime, rpcWithTaskExecutor as rpc, profile } from "../ax-refinement/helpers.ts";
import { resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { AGENTIC_INPUT_SCHEMAS, validateToolIssues } from "../../lib/agentic/contract/index.ts";

afterEach(() => { resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });
test("PAY-TRANSPORT-01 create replay changes presentation without new work, get details recovers context and select confirms another option", async () => {
  await installRealCatalogue("dev");
  const app = runtime("payload-transport");
  const args = { operation: "create", idempotencyKey: "payload-create-replay-01", request: profile("A6") };
  const full = await rpc(app, "plan", { ...args, responseView: "full" });
  assert.equal(full.ok, true); assert.equal(full.status, "ready");
  const compact = await rpc(app, "plan", { ...args, responseView: "conversation" });
  assert.equal(compact.ok, true); assert.equal(compact.responseView, "conversation");
  assert.equal(compact.planHandle, full.planHandle); assert.equal(compact.revision, full.revision);
  const current = await rpc(app, "plan", { operation: "get", planHandle: full.planHandle, responseView: "conversation" });
  assert.equal(current.selectedOptionId, compact.selectedOptionId);
  const details = await rpc(app, "plan", { operation: "get", planHandle: full.planHandle, responseView: "details", expectedRevision: full.revision, sections: ["request", "products", "advice"] });
  assert.equal(details.ok, true); assert.deepEqual(details.originalRequest, args.request);
  assert.ok(Array.isArray(details.options) && details.options.length > 1);
  const another = details.options[1];
  const selected = await rpc(app, "plan", { operation: "select", planHandle: full.planHandle, expectedRevision: full.revision, optionId: another.optionId, idempotencyKey: "payload-select-other-01", responseView: "conversation" });
  assert.equal(selected.ok, true); assert.equal(selected.selectedOptionId, another.optionId);
  const conflict = await rpc(app, "plan", { ...args, request: { ...args.request, optimization: "fewest_pills" }, responseView: "conversation" });
  assert.equal(conflict.ok, false); assert.equal(conflict.error.reasonCode, "idempotency_conflict");
});

test("PAY-TRANSPORT-02 operation/view matrix rejects unsupported fields and requires fenced batched details", () => {
  const handle = "cap_" + "x".repeat(40);
  const check = (input: unknown) => validateToolIssues(AGENTIC_INPUT_SCHEMAS.plan, input);
  for (const responseView of ["full", "conversation", "status"]) assert.deepEqual(check({ operation: "get", planHandle: handle, responseView }), []);
  assert.deepEqual(check({ operation: "get", planHandle: handle, responseView: "details", expectedRevision: 1, sections: ["coverage", "advice"] }), []);
  assert.deepEqual(check({ operation: "get", planHandle: handle, responseView: "details" }).map(issue => issue.fieldPath), ["expectedRevision", "sections"]);
  for (const input of [
    { operation: "get", planHandle: handle, responseView: "details" },
    { operation: "get", planHandle: handle, responseView: "status", sections: ["products"] },
    { operation: "create", idempotencyKey: "payload-invalid-view-01", request: profile("A6"), responseView: "status" },
    { operation: "get", planHandle: handle, responseView: "details", expectedRevision: 1, sections: ["private"] },
  ]) assert.ok(check(input).length > 0);
});

test("PAY-TRANSPORT-03 saved 7.0 decisions refresh before new selection while frozen checkout recovers unchanged", async () => {
  await installRealCatalogue("dev");
  const app = runtime("payload-v70"), key = "payload-v70-create-01";
  const plan = await rpc(app, "plan", { operation: "create", idempotencyKey: key, request: profile("A6"), responseView: "full" });
  assert.equal(plan.ok, true); assert.equal(plan.status, "ready");
  const operation = await app.store.getPlanOperationByKey(`dev:mattanutra:${app.scope.principalScope}`, key); assert.ok(operation);
  const revision = await app.store.getPlanRevision(operation.planId, Number(plan.revision)); assert.ok(revision);
  await app.store.updatePlanRevision({ ...revision, result: { ...(revision.result as object), contractVersion: "7.0.0" } });
  const selected = await rpc(app, "plan", { operation: "select", planHandle: plan.planHandle, expectedRevision: plan.revision, optionId: plan.optionId, idempotencyKey: "payload-v70-select-01", responseView: "conversation" });
  assert.equal(selected.ok, false); assert.equal(selected.error.reasonCode, "contract_refresh_required");
  const observed = await rpc(app, "plan", { operation: "get", planHandle: plan.planHandle, responseView: "full" });
  assert.equal(observed.refreshRequired, true);
  const refreshed = await rpc(app, "plan", { operation: "revise", planHandle: plan.planHandle, expectedRevision: plan.revision,
    idempotencyKey: "payload-v70-refresh-01", requestPatch: {}, responseView: "full" });
  assert.equal(refreshed.ok, true); assert.notEqual(refreshed.refreshRequired, true);
  assert.equal(((await app.store.getPlanRevision(operation.planId, Number(plan.revision)))?.result as { contractVersion: string }).contractVersion, "7.0.0");
  const confirmed = await rpc(app, "plan", { operation: "select", planHandle: refreshed.planHandle, expectedRevision: refreshed.revision,
    optionId: refreshed.optionId, idempotencyKey: "payload-v70-current-select-01", responseView: "full" });
  assert.equal(confirmed.ok, true);
  const checkout = await rpc(app, "execute", { planHandle: confirmed.planHandle, expectedRevision: confirmed.revision, idempotencyKey: "payload-v70-checkout-01" });
  assert.equal(checkout.ok, true);
  assert.deepEqual(checkout.frozenPlan.items.map(item => [item.productId,item.servingsPerDay,item.quantity,item.lineTotalMinor]), plan.basket.map(item => [item.productId,item.servingsPerDay,item.quantity,item.lineTotalMinor]));
  const frozenRevision = await app.store.getPlanRevision(operation.planId, Number(confirmed.revision)); assert.ok(frozenRevision);
  await app.store.updatePlanRevision({ ...frozenRevision, result: { ...(frozenRevision.result as object), contractVersion: "7.0.0" } });
  const recovered = await rpc(app, "execute", { planHandle: confirmed.planHandle, expectedRevision: confirmed.revision, idempotencyKey: "payload-v70-checkout-recover" });
  assert.equal(recovered.ok, true); assert.equal(recovered.orderHandle, checkout.orderHandle);
  assert.deepEqual(recovered.frozenPlan, checkout.frozenPlan);
});

test("PAY-TRANSPORT-04 covered targets finish naturally and above-limit findings remain visible and selectable", async () => {
  await installRealCatalogue("dev");
  const app = runtime("payload-advice"), base = { destinationCountry: "TH", locale: "en", optimization: "balanced", profile: { ageYears: 40, lifeStage: "adult" }, requirements: {}, targets: [{ name: "Vitamin C", amount: 500, unit: "mg", basis: "supplemental" }] };
  const noPurchase = await rpc(app, "plan", { operation: "create", idempotencyKey: "payload-no-purchase-01", responseView: "conversation", request: { ...base, currentSupplements: [{ name: "Vitamin C", dailyAmount: 500, unit: "mg", daysRemaining: 40 }] } });
  assert.equal(noPurchase.ok, true); assert.equal(noPurchase.status, "no_purchase"); assert.equal(noPurchase.purchaseRequiredNow, false); assert.equal(noPurchase.highlightedAlternativeOptionId, null);
  const above = await rpc(app, "plan", { operation: "create", idempotencyKey: "payload-above-limit-01", responseView: "conversation", request: { ...base, targets: [{ name: "Vitamin D3", amount: 150, unit: "mcg", basis: "supplemental" }], currentSupplements: [{ name: "Vitamin D3", dailyAmount: 120, unit: "mcg" }] } });
  assert.equal(above.ok, true);
  const fullAdvice = await rpc(app, "plan", { operation: "get", planHandle: above.planHandle, responseView: "details", expectedRevision: above.revision, sections: ["advice"] });
  assert.ok(fullAdvice.safetyGuidance.some(row => row.exposure > row.threshold && row.threshold > 0));
  assert.ok(above.advice.some(row => row.kind === "dose_review"));
  const option = above.options.find(row => row.stackSummary.productCount > 0); assert.ok(option);
  const selected = await rpc(app, "plan", { operation: "select", planHandle: above.planHandle, expectedRevision: above.revision, optionId: option.optionId, idempotencyKey: "payload-above-select-01", responseView: "conversation" });
  assert.equal(selected.ok, true); assert.equal(selected.operationalDecision.purchaseEligible, true); assert.ok(selected.advice.some(row => row.kind === "dose_review"));
});
