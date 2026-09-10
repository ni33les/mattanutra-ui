import type { PlanResult } from "../lib/agentic/plan/types.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createAgenticRuntime } from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { handleCompletedJsonRpc as handleJsonRpc } from "./helpers/completed-mcp-client.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { replaceCatalogueSnapshot } from "../lib/agentic/catalogue/snapshot.ts";
import { sampleRetailProduct, sampleValueSnapshot } from "./agentic/value/sample-catalogue.ts";
import { publicSupplementId } from "../lib/agentic/contract/ids.ts";
const runtimeFor = () => createAgenticRuntime({ store: createMemoryStore(), scope: { environment: "dev", tenantScope: "mattanutra", principalScope: "v5-journey" } });
async function call(runtime: ReturnType<typeof runtimeFor>, name: string, args: unknown) {
    const reply = await handleJsonRpc(runtime, { id: 1, method: "tools/call", params: { name, arguments: args } });
    const value = reply?.result?.structuredContent as Record<string, unknown>;
    assert.ok(value, JSON.stringify(reply)); return value;
}
async function saved(runtime: ReturnType<typeof runtimeFor>, response: Record<string, unknown>) {
    const [id] = await runtime.store.listPlanIdsByPrincipal("v5-journey"); assert.ok(id);
    const row = await runtime.store.getPlanRevision(id, Number(response.revision)); assert.ok(row); return row.result as PlanResult;
}
function purchase(plan: Record<string, unknown>) {
    const choices = plan.choices as Array<{ optionId: string; products: Array<{ productId: string; servingsPerDay: number }> }>;
    const choice = choices.find(row => row.optionId === plan.recommendedOptionId && row.products.length) ?? choices.find(row => row.products.length);
    assert.ok(choice); return choice;
}
const request = { locale: "en", destinationCountry: "TH", scoring: { profile: "balanced" }, profile: {}, requirements: {}, medicationCodes: ["apixaban"], targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU" }] };
beforeEach(installGoldCatalogue);
afterEach(uninstallGoldCatalogue);
describe("Current flat conversational plan mutations and immutable purchase", () => {
    for (const locale of ["en", "th", "zh-CN"])
        it(`describes a current-intake dose fit without claiming unknown future costs (${locale})`, async () => {
            const runtime = runtimeFor(), snapshot = sampleValueSnapshot();
            replaceCatalogueSnapshot(snapshot);
            const magnesium = snapshot.supplements.find(row => row.name === "Magnesium")!;
            const plan = await call(runtime, "plan", { idempotencyKey: `v5-unknown-cost-${locale}-01`, ...{
                    ...request, locale, scoring: { profile: "lowest_cost" }, targets: [{ name: magnesium.name, amount: 300, unit: "mg" }],
                    currentSupplements: [{ name: magnesium.name, supplementId: magnesium.supplementId, dailyAmount: 300, unit: "mg" }]
                } });
            assert.equal(plan.ok, true, JSON.stringify(plan));
            assert.equal(plan.status, "no_purchase");
            assert.equal(plan.recommendedOptionId, null);
            assert.equal(plan.nextAction, "no_purchase");
            assert.equal(plan.nextReplenishmentDay, undefined, "Unknown remaining inventory cannot invent a schedule");
            const result = await saved(runtime, plan);
            assert.equal(result.horizon?.cash90DayMinor ?? null, null);
            assert.equal(result.horizon?.cash30DayMinor ?? null, null);
            assert.doesNotMatch(JSON.stringify(plan), /recurring savings|cash90DayMinor/);

        });
    for (const locale of ["en", "th", "zh-CN"])
        it(`makes the empty default and selectable purchase trade-off clear in every concise view (${locale})`, async () => {
            const runtime = runtimeFor(), snapshot = sampleValueSnapshot(), target = snapshot.supplements.find(row => /vitamin d/i.test(row.name))!;
            const product = sampleRetailProduct({ id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee18", title: "Whole-unit vitamin D fixture", supplementId: target.supplementId, name: target.name, amount: 2000, unit: "IU", unitPriceMinor: 10000, form: "capsule", servingLabel: "1 capsule; 30 capsules per bottle" });
            replaceCatalogueSnapshot({ ...snapshot, products: [product] });
            const plan = await call(runtime, "plan", { idempotencyKey: `v5-review-options-${locale}-01`, ...{ ...request, locale, targets: [{ name: target.name, amount: 500, unit: "IU" }] } });
            assert.equal(plan.ok, true, JSON.stringify(plan));
            assert.equal(plan.status, "no_purchase");
            assert.equal(plan.nextAction, "review_options");
            assert.equal(plan.recommendedOptionId, null);
            const purchase = (plan.choices as Array<{ optionId: string; products: unknown[] }>).find(row => row.products.length);
            assert.ok(purchase);

            const selected = await call(runtime, "plan", { planHandle: plan.planHandle, expectedRevision: plan.revision, selectedOptionId: purchase.optionId, idempotencyKey: `v5-review-select-${locale}-01` });
            assert.equal(selected.ok, true);
            assert.equal(selected.status, "ready");
        });
    it("evaluates quantity proposals, retains context, rejects unsupported quantities and clears only the intended constraints", async () => {
        const runtime = runtimeFor();
        const created = await call(runtime, "plan", { ...request, idempotencyKey: "v5-journey-create-01" });
        assert.equal(created.ok, true);
        const chosen = purchase(created).products[0];
        assert.ok(chosen);
        const proposal = { planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: "v5-journey-propose-01", ...{ requirements: { productDoses: [{ productId: chosen.productId, servingsPerDay: 4 }] } } };
        const revised = await call(runtime, "plan", proposal);
        assert.equal(revised.ok, true, JSON.stringify(revised));
        assert.equal(purchase(revised).products.find((p) => p.productId === chosen.productId)?.servingsPerDay, 4);
        assert.deepEqual((await saved(runtime, revised)).originalRequest?.medicationCodes, request.medicationCodes);
        const [savedId] = await runtime.store.listPlanIdsByPrincipal("v5-journey");
        assert.deepEqual((await runtime.store.getPlanRevision(savedId, Number(revised.revision)))!.result.originalRequest.targets.map(row => [row.name, row.amount, row.unit]), request.targets.map(row => [row.name, row.amount, row.unit]));
        assert.deepEqual(await call(runtime, "plan", proposal), revised);
        const bad = await call(runtime, "plan", { ...proposal, expectedRevision: revised.revision, idempotencyKey: "v5-journey-badqty-01", ...{ requirements: { productDoses: [{ productId: chosen.productId, servingsPerDay: 0.125 }] } } });
        assert.equal(bad.ok, false);
        assert.equal(bad.error.fieldPath, "requirements.productDoses[0].servingsPerDay");
        const current = await call(runtime, "plan", { planHandle: created.planHandle });
        assert.equal(current.ok, true);
        assert.equal(current.revision, revised.revision);
        assert.equal(current.status, "failed");
        const clear = await call(runtime, "plan", { ...proposal, expectedRevision: current.revision, idempotencyKey: "v5-journey-clear-01", ...{ requirements: { productDoses: [], maxProductCount: null } } });
        assert.equal(clear.ok, true, JSON.stringify(clear));
        assert.deepEqual((await saved(runtime, clear)).originalRequest?.medicationCodes, request.medicationCodes);
    });
    it("rejects a selected option after catalogue facts change and refreshes from the original intent", async () => {
        const runtime = runtimeFor(), snapshot = sampleValueSnapshot();
        replaceCatalogueSnapshot(snapshot);
        const created = await call(runtime, "plan", { ...request, idempotencyKey: "v5-catalogue-create01" });
        assert.equal(created.ok, true);
        const productId = purchase(created).products[0].productId;
        const changed = { ...snapshot, products: snapshot.products.map(p => p.productId === productId ? { ...p, candidate: { ...p.candidate, facts: p.candidate.facts.map(f => ({ ...f, amount: (f.amount ?? 0) * 2 })) } } : p) };
        replaceCatalogueSnapshot(changed);
        const stale = await call(runtime, "plan", { planHandle: created.planHandle, expectedRevision: created.revision, selectedOptionId: purchase(created).optionId, idempotencyKey: "v5-catalogue-select01" });
        assert.equal(stale.ok, false);
        assert.equal(stale.error.reasonCode, "availability_changed");
        const refreshed = await call(runtime, "plan", { planHandle: created.planHandle, expectedRevision: created.revision, scoring: {}, idempotencyKey: "v5-catalogue-refresh1" });
        assert.equal(refreshed.ok, true);
        const [savedId] = await runtime.store.listPlanIdsByPrincipal("v5-journey");
        assert.deepEqual((await runtime.store.getPlanRevision(savedId, Number(refreshed.revision)))!.result.originalRequest.targets.map(row => [row.name, row.amount, row.unit]), request.targets.map(row => [row.name, row.amount, row.unit]));
        assert.notEqual(purchase(refreshed).optionId, purchase(created).optionId);
    });
    it("allows conversational selection after an unchanged catalogue freshness refresh", async () => {
        const runtime = runtimeFor(), snapshot = sampleValueSnapshot();
        replaceCatalogueSnapshot(snapshot);
        const created = await call(runtime, "plan", { ...request, idempotencyKey: "v5-freshness-create1" });
        assert.equal(created.ok, true);
        assert.ok(purchase(created).optionId);
        replaceCatalogueSnapshot({ ...snapshot, availabilityAsOf: "2026-09-08T12:00:00.000Z" });
        const selected = await call(runtime, "plan", { planHandle: created.planHandle,
            expectedRevision: created.revision, selectedOptionId: purchase(created).optionId, idempotencyKey: "v5-freshness-select1" });
        assert.equal(selected.ok, true, JSON.stringify(selected));
        assert.equal(selected.status, "ready");
        assert.ok(selected.selectedOptionId);
        assert.deepEqual(purchase(selected).products, purchase(created).products);
    });
    it("keeps every valid requested target in coverage when the catalogue is empty", async () => {
        const runtime = runtimeFor();
        const supplements = Array.from({ length: 30 }, (_, index) => { const uuid = `23456789-1234-1234-1234-${String(index + 1).padStart(12, "0")}`; return { uuid, supplementId: publicSupplementId(uuid), name: `Empty catalogue target ${index}`, aliases: [], acceptedUnits: ["mg"] as const }; });
        replaceCatalogueSnapshot({ availabilityAsOf: "2026-09-07T00:00:00Z", catalogueVersion: "v5-empty-fixture", products: [], supplements });
        const plan = await call(runtime, "plan", { idempotencyKey: "v5-empty-thirty-0001", ...{ ...request, targets: supplements.map(n => ({ name: n.name, amount: 100, unit: "mg" })) } });
        assert.equal(plan.ok, true, JSON.stringify(plan));
        assert.equal(plan.status, "no_purchase");
        const choices = plan.choices as Array<{ ingredients: unknown[] }>;
        assert.ok(choices.length, "No supply must still explain all requested target gaps");
        assert.equal(choices[0].ingredients.length, 30);
        assert.notEqual(plan.nextAction, "split_request");
    });
    for (const locale of ["en", "th", "zh-CN"])
        it(`preserves all eight required products through selection, checkout and payment recovery (${locale})`, async () => {
            const runtime = runtimeFor();
            const supplements = Array.from({ length: 8 }, (_, index) => { const uuid = `12345678-1234-1234-1234-${String(index + 1).padStart(12, "0")}`; return { uuid, supplementId: publicSupplementId(uuid), name: `Fixture nutrient ${index}`, aliases: [], acceptedUnits: ["mg"] as const }; });
            const products = supplements.map((nutrient, index) => sampleRetailProduct({ id: `87654321-1234-1234-1234-${String(index + 1).padStart(12, "0")}`, title: `Fixture product ${index}`, supplementId: nutrient.supplementId, name: nutrient.name, amount: 100, unit: "mg", unitPriceMinor: 1000 + index, form: "capsule", servingLabel: "1 capsule; 30 capsules per bottle", source: "fixture" }));
            replaceCatalogueSnapshot({ availabilityAsOf: "2026-09-07T00:00:00Z", catalogueVersion: "v5-eight-fixture", products, supplements });
            const create = { idempotencyKey: `v5-eight-create-${locale}-01`, ...{ ...request, locale, medicationCodes: [], requirements: { retainProductIds: products.map(p => p.productId) }, targets: supplements.map(n => ({ name: n.name, amount: 100, unit: "mg" })) } };
            const plan = await call(runtime, "plan", create);
            assert.equal(plan.ok, true, JSON.stringify(plan));
            assert.equal(purchase(plan).products.length, 8);
            const selected = await call(runtime, "plan", { planHandle: plan.planHandle, expectedRevision: plan.revision, selectedOptionId: purchase(plan).optionId, idempotencyKey: `v5-eight-select-${locale}-01` });
            assert.equal(selected.ok, true);
            const execute = { planHandle: plan.planHandle, expectedRevision: selected.revision, idempotencyKey: `v5-eight-execute-${locale}-01` };
            const checkout = await call(runtime, "execute", execute);
            assert.equal(checkout.ok, true, JSON.stringify(checkout));
            assert.deepEqual(await call(runtime, "execute", execute), checkout);
            const order = await call(runtime, "order", { orderHandle: checkout.orderHandle });
            assert.equal(order.ok, true);
            const cap = await resolveCapability({ action: "order.read", config: runtime.config, handle: String(checkout.orderHandle), now: new Date().toISOString(), resourceType: "order", scope: runtime.scope, store: runtime.store }); assert.ok(cap);
            const frozen = (await runtime.store.getOrder(cap.resourceId))!.frozenPlan as { items: Array<{ productId: string }> };
            assert.equal(frozen.items.length, 8);
            assert.deepEqual(frozen.items.map(p => p.productId).sort(), products.map(p => p.productId).sort());
            assert.equal(order.paymentStatus, "unpaid");
        });
});
