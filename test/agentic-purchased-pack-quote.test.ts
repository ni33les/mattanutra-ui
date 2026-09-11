import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { replaceCatalogueSnapshot, resetCatalogueSnapshotCache } from "../lib/agentic/catalogue/snapshot.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import { createMockPaymentAdapter } from "../lib/agentic/commerce/payment.ts";
import { handleCompletedJsonRpc as handleJsonRpc } from "./helpers/completed-mcp-client.ts";
import { publicPlanFields } from "../lib/agentic/public-mapper.ts";
import type { PlanResult } from "../lib/agentic/plan/types.ts";
import { simulatePayment } from "../lib/agentic/qa/simulate.ts";
import { createAgenticRuntime, type AgenticRuntime } from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import type { OrderRecord } from "../lib/agentic/store/types.ts";
import { resetMatcherSafetyCeilings, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import { sampleRetailProduct, sampleValueSnapshot } from "./agentic/value/sample-catalogue.ts";
function record(value: unknown): Record<string, unknown> {
    assert.ok(value && typeof value === "object" && !Array.isArray(value));
    return value as Record<string, unknown>;
}
async function call(runtime: AgenticRuntime, name: string, args: unknown) {
    const reply = await handleJsonRpc(runtime, { id: 1, method: "tools/call", params: { name, arguments: args } });
    assert.ok(reply?.result);
    return record(reply.result.structuredContent);
}
async function create(dailyServings: number) {
    const snapshot = sampleValueSnapshot();
    const d3 = snapshot.supplements[2]!;
    const product = sampleRetailProduct({ id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5", title: "D3 1000 IU, 60 capsules", name: d3.name,
        supplementId: d3.supplementId, amount: 1000, unit: "IU", unitPriceMinor: 48500, form: "capsule", servingLabel: "1 capsule; 60 capsules per bottle" });
    replaceCatalogueSnapshot({ ...snapshot, products: [product], supplements: [d3] });
    setMatcherSafetyCeilings([]);
    const submittedOrders: OrderRecord[] = [];
    const mock = createMockPaymentAdapter();
    const runtime = createAgenticRuntime({ config: { ...loadAgenticConfig(), paymentProvider: "mock" },
        scope: { environment: "dev", principalScope: "tester", tenantScope: "mattanutra" }, store: createMemoryStore(),
        payment: { async createCheckoutSession(input) { submittedOrders.push(input.order); return mock.createCheckoutSession(input); } } });
    const created = await call(runtime, "plan", { idempotencyKey: `pack-quote-create-${dailyServings}`, ...{ destinationCountry: "TH", locale: "en", scoring: { profile: "lowest_cost" }, profile: { ageYears: 35, lifeStage: "adult" },
            requirements: {}, currentSupplements: [], targets: [{ name: d3.name, amount: 1000 * dailyServings, unit: "IU", basis: "supplemental" }] } });
    assert.equal(created.ok, true, JSON.stringify(created));
    const choices = created.choices as Array<{ candidateKey: string; products: Array<{ servingsPerDay: number }>; roles: string[] }>;
    const option = choices.find(row => row.products.length === 1 && row.products[0]!.servingsPerDay === dailyServings);
    assert.ok(option, "Exact requested bottle quantity remains an eligible returned choice");
    const plan = await call(runtime, "plan", { planHandle: created.planHandle });
    assert.equal(plan.status, "ready");
    const capability = await resolveCapability({ action: "plan.read", config: runtime.config, handle: String(plan.planHandle),
        now: new Date().toISOString(), resourceType: "plan", scope: runtime.scope, store: runtime.store });
    assert.ok(capability);
    const revision = await runtime.store.getPlanRevision(capability.resourceId, Number(plan.revision));
    assert.ok(revision);
    const result = revision.result as PlanResult;
    assert.ok(result.selected);
    return { runtime, submittedOrders, plan, revision, result };
}
afterEach(() => { replaceCatalogueSnapshot(null); resetCatalogueSnapshotCache(); resetMatcherSafetyCeilings(); });
for (const dailyServings of [1, 2, 3])
    it(`quotes one purchased bottle consistently at ${dailyServings} daily servings`, async () => {
        const { runtime, submittedOrders, plan, result } = await create(dailyServings);
        const item = result.selected!.basket[0]!;
        assert.equal(item.servingsPerDay, dailyServings);
        assert.equal(item.daysOfSupply, 60 / dailyServings);
        assert.equal(item.quantity, 1);
        assert.equal(item.unitPriceMinor, 48500);
        assert.equal(item.lineTotalMinor, 48500);
        assert.equal(result.selected!.totalPriceMinor, 48500);
        const choice = (plan.choices as Array<Record<string, unknown>>)[0]!;
    assert.equal(record(choice.summary).goodsPrice, 485);

        const dayZero = result.horizon!.orders.find(order => order.day === 0)!;
        assert.equal(dayZero.subtotalMinor, 48500);
        assert.equal(dayZero.totalMinor, 53500);
        const checkout = await call(runtime, "execute", { expectedRevision: plan.revision, idempotencyKey: `pack-quote-execute-${dailyServings}`, planHandle: plan.planHandle });
        assert.equal(checkout.ok, true);
        assert.equal(submittedOrders.length, 1);
        const frozen = record(submittedOrders[0]!.frozenPlan);
        assert.equal(frozen.subtotalMinor, 48500);
        assert.equal(frozen.shippingMinor, 5000);
        assert.equal(frozen.totalPriceMinor, 53500);
        assert.equal(submittedOrders[0]!.totalPriceMinor, 53500);
        const order = await call(runtime, "order", { orderHandle: checkout.orderHandle });
        assert.equal(order.paymentStatus, "unpaid");
    const orderCapability = await resolveCapability({ action: "order.read", config: runtime.config, handle: String(checkout.orderHandle),
        now: new Date().toISOString(), resourceType: "order", scope: runtime.scope, store: runtime.store });
    assert.ok(orderCapability);
    const savedOrder = await runtime.store.getOrder(orderCapability.resourceId); assert.ok(savedOrder);
    const publicFrozen = record(savedOrder.frozenPlan);
    assert.equal(publicFrozen.subtotalMinor, 48500);
    assert.equal(publicFrozen.totalPriceMinor, 53500);
    const lines = publicFrozen.items as Array<Record<string, unknown>>;
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.quantity, 1);
    assert.equal(lines[0]!.lineTotalMinor, 48500);
});

it("uses purchased lines when a saved aggregate is stale, then preserves the frozen checkout on unpaid and paid replay", async () => {
  const { runtime, submittedOrders, plan, revision, result } = await create(2);
  const stale: PlanResult = { ...result, selected: { ...result.selected!, totalPriceMinor: 97000 } };
  await runtime.store.updatePlanRevision({ ...revision, result: stale });
  const visible = publicPlanFields(stale);
  assert.equal(visible.stackSummary?.totalPriceMinor, 48500);
  assert.equal(visible.estimatedOrderTotalMinor, 53500);
  const args = { expectedRevision: plan.revision, idempotencyKey: "pack-quote-stale-execute", planHandle: plan.planHandle };
  const checkout = await call(runtime, "execute", args);
  assert.equal(checkout.ok, true);
  assert.equal(submittedOrders[0]!.totalPriceMinor, 53500);
  // New code must never reprice or recharge an existing checkout when its plan changes.
  const changed: PlanResult = { ...stale, selected: { ...stale.selected!, totalPriceMinor: 999999,
    basket: stale.selected!.basket.map(item => ({ ...item, unitPriceMinor: 999999, lineTotalMinor: 999999 })) } };
  // The current plan stays v9; its existing checkout remains frozen.
  await runtime.store.updatePlanRevision({ ...revision, result: changed });
  const unpaid = await call(runtime, "execute", { ...args, idempotencyKey: "pack-quote-unpaid-replay" });
  assert.equal(unpaid.orderHandle, checkout.orderHandle);
  assert.equal(submittedOrders.length, 1);
  await simulatePayment({ config: runtime.config, now: new Date().toISOString(), orderHandle: String(checkout.orderHandle),
    scenario: "success", scope: runtime.scope, store: runtime.store });
  const paid = await call(runtime, "execute", { ...args, idempotencyKey: "pack-quote-paid-replay" });
  assert.equal(paid.orderHandle, checkout.orderHandle);
  assert.equal(submittedOrders.length, 1);
  const order = await call(runtime, "order", { orderHandle: checkout.orderHandle });
  assert.equal(order.paymentStatus, "paid");
  assert.equal(order.totalPriceMinor, 53500);
  assert.equal(record(submittedOrders[0]!.frozenPlan).totalPriceMinor, 53500);
});
