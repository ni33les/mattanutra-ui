import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { publicPlanFields } from "../lib/agentic/public-mapper.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AGENTIC_INPUT_SCHEMAS, PLAN_REQUEST } from "../lib/agentic/contract/schemas.ts";
import { AGENTIC_OUTPUT_SCHEMAS } from "../lib/agentic/contract/outputs.ts";
import { CLIENT_EXAMPLES, CLIENT_GUIDE_URI, CONTRACT_SCHEMA_URI } from "../lib/agentic/contract/guide.ts";
import { validateToolIssues } from "../lib/agentic/contract/validate.ts";
import { createAgenticRuntime } from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import type { PlanResult } from "../lib/agentic/plan/types.ts";

const request = { locale: "en", destinationCountry: "TH", optimization: "lowest_cost", profile: {}, requirements: {}, medicationCodes: ["apixaban"], conditionCodes: ["atrial_fibrillation"], targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU" }] };
const makeRuntime = () => createAgenticRuntime({ store: createMemoryStore(), scope: { environment: "dev", tenantScope: "mattanutra", principalScope: "contract-v4" } });
async function call(runtime: ReturnType<typeof makeRuntime>, tool: keyof typeof AGENTIC_INPUT_SCHEMAS, args: unknown) {
  const response = await handleJsonRpc(runtime, { id: 1, method: "tools/call", params: { name: tool, arguments: args } });
  const value = response?.result?.structuredContent as Record<string, unknown>;
  assert.ok(value, JSON.stringify(response));
  const issues = validateToolIssues(AGENTIC_OUTPUT_SCHEMAS[tool], value);
  assert.deepEqual(issues, [], JSON.stringify({ tool, issues }, null, 2));
  return value;
}
beforeEach(installGoldCatalogue); afterEach(uninstallGoldCatalogue);
describe("MCP v4 published contract and replanning", () => {
  it("validates every published request example without internal facts", () => {
    for (const example of CLIENT_EXAMPLES) assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS[example.tool], example.arguments), [], example.name);
  });
  it("uses total daily targets by default and keeps explicit supplement-only targets distinct", async () => {
    const runtime = makeRuntime();
    const base = { ...request, medicationCodes: [], conditionCodes: [], currentSupplements: [], intake: [{ source: "diet", certainty: "known", name: "Vitamin D3", amount: 2000, unit: "IU" }] };
    const total = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-total-basis-00001", request: base });
    assert.equal(total.coverage[0].basis, "total_daily");
    assert.equal(total.coverage[0].currentAmount, 2000);
    assert.equal(total.coverage[0].deliveredAmount, 0);
    assert.equal(total.coverage[0].coveragePercent, 100);
    const supplemental = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-supp-basis-00001", request: { ...base, targets: [{ ...base.targets[0], basis: "supplemental" }] } });
    assert.equal(supplemental.coverage[0].basis, "supplemental");
    assert.equal(supplemental.coverage[0].currentAmount, 0);
    assert.equal(supplemental.coverage[0].deliveredAmount, 2000);
    assert.equal(supplemental.coverage[0].totalExposureAmount, 4000);
    assert.equal(supplemental.doseFit.perTarget[0].basis, "supplemental");
    assert.equal(supplemental.doseFit.perTarget[0].exposure, 2000);
  });
  it("rejects exhausted retained inventory and supports positive current-observation duration", async () => {
    const runtime = makeRuntime();
    const empty = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-stock-zero-00001", request: { ...request, currentSupplements: [{ name: "Vitamin D3", dailyAmount: 1000, unit: "IU", daysRemaining: 0 }] } });
    assert.equal(empty.ok, false);
    assert.match(empty.error.fieldPath, /currentSupplements.*daysRemaining/);
    const saved = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-stock-intake-001", request: { ...request, intake: [{ name: "Vitamin D3", source: "current_supplement", certainty: "known", amount: 1000, unit: "IU", daysRemaining: 30 }] } });
    assert.equal(saved.ok, true);
    const invalidDiet = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-stock-diet-00001", request: { ...request, intake: [{ name: "Vitamin D3", source: "diet", certainty: "known", amount: 1000, unit: "IU", daysRemaining: 30 }] } });
    assert.equal(invalidDiet.ok, false); assert.equal(invalidDiet.error.fieldPath, "request.intake[0].daysRemaining");
  });
  it("keeps canonical uncertainty invariant across languages while distinguishing real missing evidence", async () => {
    const runtime = makeRuntime();
    const results = [];
    for (const locale of ["en", "th", "zh-CN"]) results.push(await call(runtime, "plan", { operation: "create", idempotencyKey: `v4-uncertainty-${locale}-00001`, request: { ...request, locale } }));
    assert.equal(results[0].canonical.hash, results[1].canonical.hash);
    assert.equal(results[0].canonical.hash, results[2].canonical.hash);
    assert.notEqual(results[0].safetyGuidance.find(item => item.code === "incomplete_information").uncertainty, results[1].safetyGuidance.find(item => item.code === "incomplete_information").uncertainty);
    const knownProfile = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-uncertainty-known-001", request: { ...request, profile: { ageYears: 38, lifeStage: "adult", sex: "female" } } });
    assert.notEqual(knownProfile.canonical.hash, results[0].canonical.hash);
  });
  it("keeps dietary exposure out of supplemental limits and never assigns a child band to unknown age", async () => {
    const runtime = makeRuntime();
    const base = { ...request, medicationCodes: [], conditionCodes: [], profile: { ageYears: 38, lifeStage: "adult", sex: "male" }, targets: [{ name: "Magnesium", amount: 300, unit: "mg" }], intake: [{ source: "diet", certainty: "known", name: "Magnesium", amount: 1000, unit: "mg" }] };
    const known = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-scoped-diet-00001", request: base });
    assert.equal(known.ok, true);
    const guidance = known.safetyGuidance as Array<{ code: string; threshold?: number; exposure?: number; sourceScope?: string }>;
    assert.equal(guidance.some(item => item.code === "dose_review_required" && item.sourceScope === "supplemental" && Number(item.exposure) > 350), false);
    const unknown = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-unknown-age-00001", request: { ...base, profile: {} } });
    assert.equal(unknown.ok, true);
    assert.ok((unknown.safetyGuidance as Array<{ code: string }>).some(item => item.code === "incomplete_information"));
    assert.equal((unknown.safetyGuidance as Array<{ threshold?: number }>).some(item => item.threshold === 65 || item.threshold === 110), false);
    const ckd = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-ckd-advisory-0001", request: { ...base, conditionCodes: ["ckd"] } });
    const clinical = (ckd.safetyGuidance as Array<{ code: string; threshold?: number | null; action: string }>).find(item => item.code === "condition_review_required");
    assert.ok(clinical); assert.equal(clinical.threshold, null); assert.equal(clinical.action, "review");
  });
  it("rejects quantities that would disappear below the matcher representation", async () => {
    const runtime = makeRuntime();
    const invalid = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-tiny-quantity-0001", request: { ...request, targets: [{ name: "Magnesium", amount: 1e-12, unit: "mg" }] } });
    assert.equal(invalid.ok, false);
    const error = invalid.error as { fieldPath: string; issues: Array<{ reasonCode: string; permittedLimit: number }> };
    assert.equal(error.fieldPath, "request.targets[0].amount"); assert.equal(error.issues[0].reasonCode, "out_of_range"); assert.equal(error.issues[0].permittedLimit, 0.000001);
  });
  it("reports an excessive description precisely without a missing-field error", () => {
    const issues = validateToolIssues(PLAN_REQUEST, { ...request, intake: [{ source: "diet", certainty: "unknown", description: "x".repeat(1001) }] });
    const description = issues.filter(issue => issue.fieldPath === "intake[0].description");
    assert.equal(description.length, 1); assert.equal(description[0].reasonCode, "too_long"); assert.equal(description[0].permittedLimit, 1000); assert.equal(description[0].actual, 1001);
    assert.equal(issues.some(issue => issue.reasonCode === "required"), false, JSON.stringify(issues));
  });
  it("publishes all seven output schemas and both connector resources", async () => {
    const runtime = makeRuntime(); const listed = await handleJsonRpc(runtime, { id: 1, method: "tools/list" });
    assert.equal((listed?.result?.tools as unknown[]).length, 7);
    const resources = await handleJsonRpc(runtime, { id: 1, method: "resources/list" });
    // v6 adds current resources and preserves both guide/schema pairs for v4 and v5.
    const publishedResources = resources?.result?.resources as Array<{ uri: string }>;
    assert.equal(publishedResources.length, 6);
    for (const version of ["4.0.0", "5.0.0", "6.0.0"]) for (const suffix of ["client-guide", "schema"])
      assert.ok(publishedResources.some(resource => resource.uri === `mattanutra://contract/${version}/${suffix}`));
    for (const uri of [CLIENT_GUIDE_URI, CONTRACT_SCHEMA_URI]) {
      const read = await handleJsonRpc(runtime, { id: 1, method: "resources/read", params: { uri } });
      assert.ok((read?.result?.contents as Array<{text:string}>)[0].text.length > 100);
    }
    await call(runtime, "info", {});
  });
  it("patches one product exclusion, retains health/targets, clears exclusions and replays", async () => {
    const runtime = makeRuntime(); const created = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-create-exclusion-01", request });
    assert.equal(created.ok, true); assert.equal(created.status, "ready");
    const productId = created.basket[0].productId;
    const command = { operation: "revise", idempotencyKey: "v4-patch-exclusion-01", planHandle: created.planHandle, expectedRevision: created.revision, requestPatch: { requirements: { excludeProductIds: [productId] } } };
    const revised = await call(runtime, "plan", command); assert.equal(revised.ok, true);
    assert.equal((revised.basket ?? []).some((item: {productId:string}) => item.productId === productId), false);
    assert.deepEqual(await call(runtime, "plan", command), revised);
    const [id] = await runtime.store.listPlanIdsByPrincipal("contract-v4");
    const stored = (await runtime.store.getPlanRevision(id, revised.revision))?.result as PlanResult;
    assert.deepEqual(stored.originalRequest?.targets, request.targets); assert.deepEqual(stored.originalRequest?.medicationCodes, request.medicationCodes);
    const cleared = await call(runtime, "plan", { ...command, idempotencyKey: "v4-clear-exclusion-01", expectedRevision: revised.revision, requestPatch: { requirements: { excludeProductIds: [] } } });
    assert.equal(cleared.ok, true); assert.equal(cleared.status, "ready");
  });
  it("rejects unknown answers and invalid choices while preserving explicit prerequisite decisions", async () => {
    const runtime = makeRuntime();
    const created = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-material-question-01", request: { ...request, targets: [{ ...request.targets[0], importance: "conditional", prerequisite: { status: "unknown" } }] } });
    assert.equal(created.status, "needs_input");
    const questions = created.questions as Array<{ questionId: string; choices: Array<{ choice: string }> }>;
    const offered = questions.find(question => question.choices.some(choice => choice.choice.startsWith("satisfy_prerequisite:")))!;
    assert.ok(offered);
    for (const [index, answer] of [{ questionId: "q_safety_ack", choice: "acknowledge_safety" }, { questionId: offered.questionId, choice: "invented_choice" }].entries()) {
      const rejected = await call(runtime, "plan", { operation: "answer", planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: `v4-invalid-answer-00${index}`, answers: [answer] });
      assert.equal(rejected.ok, false);
      assert.equal((rejected.error as { fieldPath: string }).fieldPath, `answers[0].${index ? "choice" : "questionId"}`);
    }
    const accepted = await call(runtime, "plan", { operation: "answer", planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: "v4-valid-answer-0001", answers: [{ questionId: offered.questionId, choice: offered.choices.find(choice => choice.choice.startsWith("satisfy_prerequisite:"))!.choice }] });
    assert.equal(accepted.ok, true); assert.equal(accepted.status, "ready");
  });
  it("rejects duplicate current product/nutrient reporting while accepting a different nutrient in the same product", async () => {
    const runtime = makeRuntime(); const productId = fixtureSnapshot().products[0].productId;
    const currentSupplements = [{ productId, name: "Vitamin D3", dailyAmount: 1000, unit: "IU" }];
    const duplicate = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-current-duplicate-1", request: { ...request, currentSupplements, intake: [{ source: "current_supplement", certainty: "known", productId, name: "Vitamin D3", amount: 1000, unit: "IU" }] } });
    assert.equal(duplicate.ok, false); assert.equal((duplicate.error as { reasonCode: string }).reasonCode, "duplicate_supplement");
    const distinct = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-current-distinct-01", request: { ...request, currentSupplements, intake: [{ source: "current_supplement", certainty: "known", productId, name: "Magnesium", amount: 20, unit: "mg" }] } });
    assert.equal(distinct.ok, true);
  });
  it("rejects mixed replacement/patch, null patch fields and retained/excluded conflicts", async () => {
    const runtime = makeRuntime(); const created = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-create-conflicts-01", request });
    for (const patch of [{ request, requestPatch: {} }, { requestPatch: { medicationCodes: null } }, { requestPatch: { requirements: { excludeProductIds: [created.basket[0].productId], retainProductIds: [created.basket[0].productId] } } }]) {
      const result = await call(runtime, "plan", { operation: "revise", idempotencyKey: "v4-revise-conflicts-01", planHandle: created.planHandle, expectedRevision: created.revision, ...patch }); assert.equal(result.ok, false);
    }
  });
  it("publishes consistent schemas for pending, blocked, needs-input and no-purchase projections", async () => {
    const runtime = makeRuntime(); const created = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-status-fixture-001", request });
    const [id] = await runtime.store.listPlanIdsByPrincipal("contract-v4");
    const stored = (await runtime.store.getPlanRevision(id, created.revision))!.result as PlanResult;
    for (const status of ["processing", "blocked", "needs_input", "no_purchase"] as const) {
      const result = { ...stored, status, selected: null, basket: [], alternatives: [], horizon: undefined, questions: [], summary: `Operational ${status}` };
      const fields = publicPlanFields(result);
      const reply = { ...fields, ok: true, planHandle: created.planHandle, revision: created.revision };
      assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, reply), [], status);
      assert.equal(fields.operationalDecision.status, status);
      assert.equal(fields.operationalDecision.purchaseEligible, false);
      assert.equal(fields.nextActions.includes("confirm_with_user"), false);
    }
    const processingRuntime = createAgenticRuntime({ ...runtime, store: createMemoryStore(), deferProcessing: true });
    const pending = await call(processingRuntime, "plan", { operation: "create", idempotencyKey: "v4-processing-ack-001", request });
    assert.equal(pending.status, "processing"); assert.equal(pending.operationalDecision.nextAction, "poll_plan");
  });
  it("keeps the current checkout quote when retained intake makes future schedules incomplete", async () => {
    const runtime = makeRuntime();
    const created = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-horizon-incomplete-01", request });
    const [id] = await runtime.store.listPlanIdsByPrincipal("contract-v4");
    const stored = (await runtime.store.getPlanRevision(id, created.revision))!.result as PlanResult;
    const reasons = [{ dependentCapabilities: ["future_order_schedule", "savings"], dimension: "schedule" as const, missingFieldNames: ["currentSupplements.productId"], reasonCode: "current_inventory_information_incomplete" }];
    const fields = publicPlanFields({ ...stored, horizon: { ...stored.horizon!, complete: false, unavailableReasons: reasons } });
    assert.equal(fields.scheduleComplete, false);
    assert.equal(fields.nextReplenishmentDay, null);
    assert.deepEqual(fields.orderSchedule["90"], { available: false, reasonCode: "current_inventory_information_incomplete" });
    assert.equal(fields.cash90DayMinor, null);
    assert.equal(fields.cashComplete, false);
    assert.equal(fields.estimatedOrderTotalMinor, created.estimatedOrderTotalMinor);
    assert.equal(fields.operationalDecision.purchaseEligible, true);
    assert.ok(fields.unavailableReasons.some(item => item.reasonCode === "current_inventory_information_incomplete"));
    assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, { ...fields, ok: true, planHandle: created.planHandle, revision: created.revision }), []);
  });
  it("distinguishes unresolved current intake from targets and rejects family-only EPA identity", async () => {
    const runtime = makeRuntime();
    const created = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-current-unknown-01", request: { ...request, currentSupplements: [{ name: "Undocumented current blend", dailyAmount: 1, unit: "serving" }] } });
    assert.equal(created.status, "ready");
    assert.equal(created.coverage.length, 1);
    const [id] = await runtime.store.listPlanIdsByPrincipal("contract-v4");
    const stored = (await runtime.store.getPlanRevision(id, created.revision))!.result as PlanResult;
    assert.equal(stored.requestSnapshot.leftovers[0].source, "current_supplement");
    assert.deepEqual(stored.originalRequest?.targets, request.targets);
    const epa = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-specific-epa-0001", request: { ...request, targets: [{ name: "EPA", amount: 100, unit: "mg" }] } });
    assert.equal(epa.coverage[0].unresolved, true); assert.equal(epa.coverage[0].supplementId, null);
    const omega = fixtureSnapshot().supplements.find(item => item.name === "Omega-3")!;
    const wrongIdentity = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-specific-epa-0002", request: { ...request, targets: [{ name: "EPA", supplementId: omega.supplementId, amount: 100, unit: "mg" }] } });
    assert.equal(wrongIdentity.error.reasonCode, "incompatible_identity");
  });
  it("validates a complete documented checkout and all seven response contracts", async () => {
    const runtime = makeRuntime();
    const created = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-seven-tools-plan01", request });
    assert.equal(created.status, "ready");
    if (created.evidenceHandle) await call(runtime, "evidence", { evidenceHandle: created.evidenceHandle, mode: "sources" });
    else await call(runtime, "evidence", { evidenceHandle: "cap_missing_evidence_handle_000000000" });
    await call(runtime, "feedback", { planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: "v4-seven-tools-feed01", consentConfirmed: true, rating: 4 });
    const checkout = await call(runtime, "execute", { planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: "v4-seven-tools-exec01" });
    assert.equal(checkout.ok, true, JSON.stringify(checkout));
    const order = await call(runtime, "order", { orderHandle: checkout.orderHandle });
    assert.equal(order.paymentStatus, "unpaid");
    await call(runtime, "support", { orderHandle: checkout.orderHandle, idempotencyKey: "v4-seven-tools-help01", message: "Please help me understand payment recovery." });
  });
  it("refreshes a legacy plan explicitly while preserving input and a stable retry", async () => {
    const runtime = makeRuntime();
    const created = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-legacy-create-0001", request });
    const [id] = await runtime.store.listPlanIdsByPrincipal("contract-v4");
    const row = await runtime.store.getPlanRevision(id, created.revision); assert.ok(row);
    const legacy = { ...(row.result as PlanResult) }; delete legacy.contractVersion;
    await runtime.store.updatePlanRevision({ ...row, result: legacy });
    const read = await call(runtime, "plan", { operation: "get", planHandle: created.planHandle });
    assert.equal(read.refreshRequired, true); assert.equal(read.sourceContractVersion, "3.0.0"); assert.equal(read.status, "needs_input");
    const refresh = { operation: "revise", planHandle: created.planHandle, expectedRevision: read.revision, idempotencyKey: "v4-legacy-refresh-01", requestPatch: {} };
    const refreshed = await call(runtime, "plan", refresh); assert.equal(refreshed.status, "ready"); assert.equal(refreshed.revision, created.revision + 1);
    assert.deepEqual(await call(runtime, "plan", refresh), refreshed);
  });
  it("does not discard unexpected get input or treat a patch as an idempotent read", async () => {
    const runtime = makeRuntime(); const created = await call(runtime, "plan", { operation: "create", idempotencyKey: "v4-create-no-read-001", request });
    const extra = await call(runtime, "plan", { operation: "get", planHandle: created.planHandle, bogus: true }); assert.equal(extra.ok, false);
    const changed = await call(runtime, "plan", { operation: "revise", idempotencyKey: "v4-create-no-read-001", planHandle: created.planHandle, expectedRevision: created.revision, requestPatch: {} }); assert.equal(changed.error.reasonCode, "idempotency_conflict");
  });
});
