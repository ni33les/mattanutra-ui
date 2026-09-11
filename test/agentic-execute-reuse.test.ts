import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { handleCompletedJsonRpc as handleJsonRpc } from "./helpers/completed-mcp-client.ts";
import { createAgenticRuntime, setAgenticRuntimeForTests, type AgenticRuntime } from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { simulatePayment } from "../lib/agentic/qa/simulate.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import type { PlanResult } from "../lib/agentic/plan/types.ts";
function runtimeFor(): AgenticRuntime {
    return createAgenticRuntime({
        config: loadAgenticConfig(),
        scope: {
            environment: "dev",
            principalScope: "tester",
            tenantScope: "mattanutra"
        },
        store: createMemoryStore()
    });
}
async function call(runtime: AgenticRuntime, name: string, args: unknown) {
    const response = await handleJsonRpc(runtime, {
        id: 1,
        method: "tools/call",
        params: { arguments: args, name }
    });
    assert.ok(response?.result);
    return response.result.structuredContent as Record<string, unknown>;
}
// Checkout invariants start from an explicitly selected returned purchase choice.
// Practical scoring may correctly recommend no new products for these frozen doses.
async function purchasePlan(runtime: AgenticRuntime, args: Record<string, unknown>) {
    // The old client selected a hidden Vitamin C trade-off. The single-routine
    // protocol evaluates the same frozen 1000 mg product through an explicit proposal.
    const created = await call(runtime, "plan", { ...args, requirements: { ...(args.requirements as object ?? {}),
      productDoses: [{ productId: "prd_b5555555555555555555555555555555", servingsPerDay: 1 }] } });
    assert.equal(created.ok, true);
    const choices = created.choices as Array<{
        candidateKey: string;
        
        products: unknown[];
        roles?: string[];
    }>;
    const option = choices.find(row => row.products.length && row.roles?.includes("closest_dose"))
        ?? choices.find(row => row.products.length);
    assert.ok(option, "Frozen checkout fixture must retain an eligible purchase choice");
    const selected = await call(runtime, "plan", { planHandle: created.planHandle,
        expectedRevision: created.revision,  idempotencyKey: `${String(args.idempotencyKey)}-select` });
    assert.equal(selected.ok, true);
    assert.equal(selected.status, "ready");
    return selected;
}
beforeEach(() => {
    installGoldCatalogue();
});
afterEach(() => {
    uninstallGoldCatalogue();
    setAgenticRuntimeForTests(null);
});
describe("execute key reuses one unpaid order", () => {
    async function legacyPlan(runtime: AgenticRuntime, key: string, executeFirst = false) {
        const plan = await purchasePlan(runtime, { idempotencyKey: `${key}-create`, ...{
                destinationCountry: "TH", locale: "en", scoring: { profile: "balanced" }, profile: { ageYears: 38, lifeStage: "adult" },
                requirements: {}, targets: [{ amount: 500, name: "Vitamin C", unit: "mg" }]
            } });
        assert.equal(plan.status, "ready");
        const checkout = executeFirst ? await call(runtime, "execute", { expectedRevision: plan.revision,
            idempotencyKey: `${key}-execute`, planHandle: plan.planHandle }) : null;
        if (checkout)
            assert.equal(checkout.ok, true);
        const capability = await resolveCapability({ action: "plan.read", config: runtime.config, handle: String(plan.planHandle),
            now: new Date().toISOString(), resourceType: "plan", scope: runtime.scope, store: runtime.store });
        assert.ok(capability);
        const revision = await runtime.store.getPlanRevision(capability.resourceId, Number(plan.revision));
        assert.ok(revision);
        const result = { ...(revision.result as PlanResult) };
        delete result.contractVersion;
        await runtime.store.updatePlanRevision({ ...revision, result, statusProjection: null, storageJson: undefined });
        return { plan, checkout };
    }
    it("rejects a retired unexecuted plan with standard not-found", async () => {
        const runtime = runtimeFor();
        const { plan } = await legacyPlan(runtime, "legacy-unexecuted-v4");
        const result = await call(runtime, "execute", { expectedRevision: plan.revision, idempotencyKey: "legacy-new-checkout-v4", planHandle: plan.planHandle });
        assert.equal(result.ok, false);
        assert.equal((result.error as {
            reasonCode: string;
        }).reasonCode, "not_found");
    });
    it("recovers an existing unpaid order independently of its retired plan handle", async () => {
        const runtime = runtimeFor();
        const { plan, checkout } = await legacyPlan(runtime, "legacy-unpaid-checkout-v4", true);
        const replay = await call(runtime, "execute", { expectedRevision: plan.revision, idempotencyKey: "legacy-unpaid-new-key-v4", planHandle: plan.planHandle });
        assert.equal(replay.ok, false);
        assert.equal((replay.error as { reasonCode: string }).reasonCode, "not_found");
        const recovered = await call(runtime, "order", { orderHandle: checkout!.orderHandle });
        assert.equal(recovered.ok, true);
        assert.equal(recovered.checkoutUrl, checkout!.checkoutUrl);
        assert.equal(recovered.orderHandle, checkout!.orderHandle);
        assert.equal(recovered.paymentStatus, "unpaid");
    });
    it("returns the same orderHandle for two execute keys on one plan revision", async () => {
        const runtime = runtimeFor();
        const plan = await purchasePlan(runtime, {
            idempotencyKey: "exec-reuse-plan-0000001",
            ...{
                destinationCountry: "TH",
                locale: "en",
                scoring: { profile: "balanced" },
                profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
                requirements: {},
                targets: [{ amount: 500, name: "Vitamin C", unit: "mg" }]
            }
        });
        assert.equal(plan.ok, true);
        assert.equal(plan.status, "ready");
        const first = await call(runtime, "execute", {
            expectedRevision: plan.revision,
            idempotencyKey: "exec-reuse-key-a-000001",
            planHandle: plan.planHandle
        });
        const second = await call(runtime, "execute", {
            expectedRevision: plan.revision,
            idempotencyKey: "exec-reuse-key-b-000001",
            planHandle: plan.planHandle
        });
        assert.equal(first.ok, true);
        const secondOk = second.ok === true && typeof second.orderHandle === "string";
        const secondConflict = second.ok === false &&
            (second.error as {
                reasonCode?: string;
            } | undefined)?.reasonCode === "revision_conflict";
        assert.ok(secondOk || secondConflict);
        if (secondOk) {
            assert.equal(first.orderHandle, second.orderHandle);
            assert.equal(first.checkoutUrl, second.checkoutUrl);
            assert.equal(first.orderReference, second.orderReference);
            assert.equal(second.paymentStatus, "unpaid");
            assert.equal(second.orderStatus, "open");
        }
        assert.equal(first.paymentStatus, "unpaid");
        assert.equal(first.orderStatus, "open");
    });
    it("replays execute with the live payment state after pay", async () => {
        const runtime = runtimeFor();
        const plan = await purchasePlan(runtime, {
            idempotencyKey: "exec-replay-plan-0000001",
            ...{
                destinationCountry: "TH",
                locale: "en",
                scoring: { profile: "balanced" },
                profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
                requirements: {},
                targets: [{ amount: 500, name: "Vitamin C", unit: "mg" }]
            }
        });
        assert.equal(plan.status, "ready");
        const key = "exec-replay-key-same-0001";
        const first = await call(runtime, "execute", {
            expectedRevision: plan.revision,
            idempotencyKey: key,
            planHandle: plan.planHandle
        });
        assert.equal(first.paymentStatus, "unpaid");
        await simulatePayment({
            config: runtime.config,
            now: new Date().toISOString(),
            orderHandle: String(first.orderHandle),
            scenario: "success",
            scope: runtime.scope,
            store: runtime.store
        });
        const replay = await call(runtime, "execute", {
            expectedRevision: plan.revision,
            idempotencyKey: key,
            planHandle: plan.planHandle
        });
        assert.equal(replay.ok, true);
        assert.equal(replay.orderHandle, first.orderHandle);
        assert.equal(replay.paymentStatus, first.paymentStatus);
        const polled = await call(runtime, "order", { orderHandle: first.orderHandle });
        assert.equal(polled.paymentStatus, "paid");
        assert.equal(polled.orderStatus, "completed");
        const capability = await resolveCapability({ action: "order.read", config: runtime.config, handle: String(first.orderHandle),
            now: new Date().toISOString(), resourceType: "order", scope: runtime.scope, store: runtime.store });
        assert.ok(capability);
        const order = await runtime.store.getOrder(capability.resourceId);
        assert.ok(order && order.stateVersion >= 2);
    });
    it("does not mint a second chargeable order after pay", async () => {
        const runtime = runtimeFor();
        const plan = await purchasePlan(runtime, {
            idempotencyKey: "exec-dup-plan-0000000001",
            ...{
                destinationCountry: "TH",
                locale: "en",
                scoring: { profile: "balanced" },
                profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
                requirements: {},
                targets: [{ amount: 500, name: "Vitamin C", unit: "mg" }]
            }
        });
        assert.equal(plan.status, "ready");
        const first = await call(runtime, "execute", {
            expectedRevision: plan.revision,
            idempotencyKey: "exec-dup-key-a-0000001",
            planHandle: plan.planHandle
        });
        await simulatePayment({
            config: runtime.config,
            now: new Date().toISOString(),
            orderHandle: String(first.orderHandle),
            scenario: "success",
            scope: runtime.scope,
            store: runtime.store
        });
        const second = await call(runtime, "execute", {
            expectedRevision: plan.revision,
            idempotencyKey: "exec-dup-key-b-0000001",
            planHandle: plan.planHandle
        });
        const secondOk = second.ok === true && second.orderHandle === first.orderHandle;
        const secondConflict = second.ok === false &&
            (second.error as {
                reasonCode?: string;
            } | undefined)?.reasonCode === "revision_conflict";
        assert.ok(secondOk || secondConflict);
        const polled = await call(runtime, "order", { orderHandle: first.orderHandle });
        assert.equal(polled.paymentStatus, "paid");
        assert.equal(polled.orderStatus, "completed");
    });
});
