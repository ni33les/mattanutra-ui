import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createAgenticRuntime } from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { replaceCatalogueSnapshot } from "../lib/agentic/catalogue/snapshot.ts";
import { publicSupplementId } from "../lib/agentic/contract/ids.ts";
import { simulatePayment } from "../lib/agentic/qa/simulate.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { sampleRetailProduct } from "./agentic/value/sample-catalogue.ts";
import type { PlanRequest, PlanResult } from "../lib/agentic/plan/types.ts";
import type { ExecuteSuccessWire, OrderSuccessWire, PlanSuccessWire, PublicErrorWire } from "../lib/agentic/contract/outputs.ts";

const nutrientNames = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"];
const supplements = nutrientNames.map((name, index) => { const uuid = `32345678-1234-1234-1234-${String(index + 1).padStart(12, "0")}`;
  return { uuid, supplementId: publicSupplementId(uuid), name, aliases: [], acceptedUnits: ["mg"] as const }; });
const products = supplements.map((nutrient, index) => sampleRetailProduct({ id: `97654321-1234-1234-1234-${String(index + 1).padStart(12, "0")}`,
  title: `Legacy fixture product ${index}`, supplementId: nutrient.supplementId, name: nutrient.name, amount: 100, unit: "mg", unitPriceMinor: 1000 + index,
  form: "capsule", servingLabel: "1 capsule; 30 capsules per bottle", source: "fixture" }));
const request: PlanRequest = { locale: "en", destinationCountry: "TH", optimization: "balanced", profile: {}, requirements: {}, medicationCodes: ["apixaban"],
  intake: [{ source: "diet", certainty: "unknown", description: "Varied diet; exact quantities are unknown." }], currentSupplements: [],
  targets: supplements.map(nutrient => ({ name: nutrient.name, amount: 100, unit: "mg" })) };
const runtimeFor = () => createAgenticRuntime({ store: createMemoryStore(), scope: { environment: "dev", tenantScope: "mattanutra", principalScope: "legacy-v5" } });
type Replies = { plan: PlanSuccessWire; execute: ExecuteSuccessWire; order: OrderSuccessWire };
async function call<T extends keyof Replies>(runtime: ReturnType<typeof runtimeFor>, name: T, args: unknown): Promise<Replies[T] | PublicErrorWire> {
  const response = await handleJsonRpc(runtime, { id: 1, method: "tools/call", params: { name, arguments: args } });
  assert.ok(response?.result?.structuredContent, JSON.stringify(response));
  return response.result.structuredContent as Replies[T] | PublicErrorWire;
}
beforeEach(() => { installGoldCatalogue(); replaceCatalogueSnapshot({ availabilityAsOf: "2026-09-07T00:00:00Z", catalogueVersion: "legacy-eight", products, supplements }); });
afterEach(uninstallGoldCatalogue);

async function legacyPlan(explicit: boolean, retainOriginal = true) {
  const runtime = runtimeFor();
  const created = await call(runtime, "plan", { operation: "create", idempotencyKey: "legacy-create-0001", request: { ...request, requirements: { maxProductCount: 6 } } });
  assert.equal(created.ok, true); if (!created.ok) throw new Error(created.error.message);
  assert.equal(created.basket?.length, 6);
  const [planId] = await runtime.store.listPlanIdsByPrincipal("legacy-v5");
  assert.ok(planId);
  const saved = await runtime.store.getPlanRevision(planId, created.revision); assert.ok(saved);
  const original = structuredClone({ ...request, requirements: explicit ? { maxProductCount: 6 } : {} });
  const current = saved.result as PlanResult;
  const state = { ...current.requestSnapshot, ...(retainOriginal ? {} : { leftovers: [] }), originalRequest: retainOriginal ? original : undefined,
    requirements: { ...current.requestSnapshot.requirements, maxProductCount: 6 } };
  const result = { ...current, contractVersion: "4.0.0", originalRequest: retainOriginal ? original : undefined, pendingInput: undefined, requestSnapshot: state };
  const historical = { ...saved, result, requestSnapshot: state };
  await runtime.store.updatePlanRevision(historical);
  return { runtime, created, planId, historical, original };
}

test("LEGACY5-01 omitted v4 count refreshes to eight while preserving original medications and intake", async () => {
  const { runtime, created, planId, historical } = await legacyPlan(false);
  const seen = await call(runtime, "plan", { operation: "get", planHandle: created.planHandle });
  assert.equal(seen.ok, true); if (!seen.ok) throw new Error(seen.error.message);
  assert.equal(seen.refreshRequired, true);
  const refreshed = await call(runtime, "plan", { operation: "revise", planHandle: created.planHandle, expectedRevision: created.revision,
    idempotencyKey: "legacy-refresh-0001", requestPatch: {} });
  assert.equal(refreshed.ok, true); if (!refreshed.ok) throw new Error(refreshed.error.message);
  assert.equal(refreshed.basket?.length, 8);
  const saved = (await runtime.store.getPlanRevision(planId, refreshed.revision))!.result as PlanResult;
  assert.equal(saved.requestSnapshot.requirements.maxProductCount ?? null, null);
  assert.deepEqual(saved.originalRequest?.medicationCodes, request.medicationCodes);
  assert.deepEqual(saved.originalRequest?.intake, request.intake);
  assert.deepEqual(await runtime.store.getPlanRevision(planId, created.revision), historical, "historical v4 evidence remains immutable");
  const proposed = await call(runtime, "plan", { operation: "revise", planHandle: created.planHandle, expectedRevision: refreshed.revision,
    idempotencyKey: "legacy-proposal-0001", requestPatch: { requirements: { productDoses: [{ productId: products[0].productId, servingsPerDay: 1 }] } } });
  assert.equal(proposed.ok, true); if (!proposed.ok) throw new Error(proposed.error.message);
  const next = (await runtime.store.getPlanRevision(planId, proposed.revision))!.result as PlanResult;
  assert.deepEqual(next.originalRequest?.targets, request.targets);
  assert.deepEqual(next.originalRequest?.intake, request.intake);
  assert.deepEqual(next.originalRequest?.medicationCodes, request.medicationCodes);
  assert.deepEqual(next.originalRequest?.requirements?.productDoses, [{ productId: products[0].productId, servingsPerDay: 1 }]);
  assert.equal(next.requestSnapshot.requirements.maxProductCount ?? null, null);
});

test("LEGACY5-02 explicit v4 six remains binding during refresh and unrelated patches", async () => {
  const { runtime, created, planId } = await legacyPlan(true);
  const refreshed = await call(runtime, "plan", { operation: "revise", planHandle: created.planHandle, expectedRevision: created.revision,
    idempotencyKey: "legacy-explicit-0001", requestPatch: { locale: "th" } });
  assert.equal(refreshed.ok, true); if (!refreshed.ok) throw new Error(refreshed.error.message);
  assert.equal(refreshed.basket?.length, 6);
  const saved = (await runtime.store.getPlanRevision(planId, refreshed.revision))!.result as PlanResult;
  assert.equal(saved.requestSnapshot.requirements.maxProductCount, 6);
  assert.equal(saved.originalRequest?.requirements?.maxProductCount, 6);
  assert.deepEqual(saved.originalRequest?.medicationCodes, request.medicationCodes);
});

test("LEGACY5-03 full replacement omission explicitly clears the earlier six-product ceiling", async () => {
  const { runtime, created, planId } = await legacyPlan(true);
  const replacement = await call(runtime, "plan", { operation: "revise", planHandle: created.planHandle, expectedRevision: created.revision,
    idempotencyKey: "legacy-replace-0001", request });
  assert.equal(replacement.ok, true); if (!replacement.ok) throw new Error(replacement.error.message);
  assert.equal(replacement.basket?.length, 8);
  const saved = (await runtime.store.getPlanRevision(planId, replacement.revision))!.result as PlanResult;
  assert.equal(saved.requestSnapshot.requirements.maxProductCount ?? null, null);
});

test("LEGACY5-04 absent count provenance requests an explicit replacement without silently reusing six", async () => {
  const { runtime, created, planId, historical } = await legacyPlan(false, false);
  const ambiguous = await call(runtime, "plan", { operation: "revise", planHandle: created.planHandle, expectedRevision: created.revision,
    idempotencyKey: "legacy-ambiguous-01", requestPatch: {} });
  assert.equal(ambiguous.ok, false); if (ambiguous.ok) throw new Error("Missing provenance must remain actionable");
  assert.equal(ambiguous.error.reasonCode, "contract_refresh_required", JSON.stringify(ambiguous));
  assert.equal(ambiguous.error.fieldPath, "request.requirements.maxProductCount");
  assert.match(ambiguous.error.message, /replacement request/i);
  assert.deepEqual(await runtime.store.getPlanRevision(planId, created.revision), historical);
  assert.equal((await runtime.store.getPlan(planId))?.currentRevision, created.revision);
  const recovered = await call(runtime, "plan", { operation: "revise", planHandle: created.planHandle, expectedRevision: created.revision,
    idempotencyKey: "legacy-resolved-01", request: { ...request, requirements: { maxProductCount: null } } });
  assert.equal(recovered.ok, true); if (!recovered.ok) throw new Error(recovered.error.message);
  assert.equal(recovered.basket?.length, 8);
});

for (const paid of [false, true]) test(`LEGACY5-05 frozen ${paid ? "paid" : "unpaid"} checkout survives v4 marking and catalogue replacement`, async () => {
  const { runtime, created, planId } = await legacyPlan(true);
  // Freeze an already accepted historical basket before publishing a new catalogue.
  const saved = (await runtime.store.getPlanRevision(planId, created.revision))!;
  await runtime.store.updatePlanRevision({ ...saved, result: { ...(saved.result as PlanResult), contractVersion: "5.0.0" } });
  const payload = { planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: "legacy-frozen-exec1" };
  const checkout = await call(runtime, "execute", payload); assert.equal(checkout.ok, true); if (!checkout.ok) throw new Error(checkout.error.message);
  if (paid) await simulatePayment({ config: runtime.config, scope: runtime.scope, store: runtime.store, now: new Date().toISOString(), orderHandle: checkout.orderHandle, scenario: "success" });
  const before = await call(runtime, "order", { orderHandle: checkout.orderHandle }); assert.equal(before.ok, true); if (!before.ok) throw new Error(before.error.message);
  await runtime.store.updatePlanRevision(saved);
  replaceCatalogueSnapshot({ availabilityAsOf: "2026-09-08T00:00:00Z", catalogueVersion: "replaced-empty", products: [], supplements });
  assert.deepEqual(await call(runtime, "execute", payload), checkout);
  const after = await call(runtime, "order", { orderHandle: checkout.orderHandle }); assert.equal(after.ok, true); if (!after.ok) throw new Error(after.error.message);
  assert.deepEqual(after.frozenOrder, before.frozenOrder);
  assert.equal(after.paymentStatus, paid ? "paid" : "unpaid");
  assert.equal(after.frozenOrder.items.length, 6);
});
