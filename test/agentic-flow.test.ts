import { resolveCapability } from "../lib/agentic/capabilities.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { handleCompletedJsonRpc as handleJsonRpc } from "./helpers/completed-mcp-client.ts";
import { createAgenticRuntime, setAgenticRuntimeForTests, type AgenticRuntime } from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { simulatePayment } from "../lib/agentic/qa/simulate.ts";
function supplementId(name: string) {
    const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);
    assert.ok(found, name);
    return found.supplementId;
}
function j1Request(overrides: Record<string, unknown> = {}) {
    return {
        destinationCountry: "TH",
        locale: "en",
        scoring: { profile: "balanced" },
        profile: {
            ageYears: 38,
            lifeStage: "adult",
            sex: "male"
        },
        requirements: {},
        targets: [
            { amount: 2000, name: "Vitamin D3", ingredientId: supplementId("Vitamin D3"), unit: "IU" },
            { amount: 1000, name: "Omega-3", ingredientId: supplementId("Omega-3"), unit: "mg" },
            { amount: 300, name: "Magnesium", ingredientId: supplementId("Magnesium"), unit: "mg" },
            { amount: 1000, name: "Vitamin B12", ingredientId: supplementId("Vitamin B12"), unit: "mcg" },
            { amount: 1000, name: "Vitamin C", ingredientId: supplementId("Vitamin C"), unit: "mg" }
        ],
        ...overrides
    };
}
function runtimeFor(principal: string | null = null): AgenticRuntime {
    return createAgenticRuntime({
        config: loadAgenticConfig(),
        scope: {
            environment: "dev",
            principalScope: principal,
            tenantScope: "mattanutra"
        },
        store: createMemoryStore()
    });
}
function routine(value: Record<string, unknown>) {
    const choices = value.choices as Array<{optionId: string; roles: string[]; products: Array<{name: string}>; ingredients: Array<{advice?: Array<{kind:string;severity:string;exposure:number;reference:number}>}>}>;
    assert.ok(choices?.length, JSON.stringify(value));
    const result = choices.find(row => row.products.length && row.roles.includes("closest_dose")) ?? choices.find(row => row.products.length); assert.ok(result); return result;
}
async function select(runtime: AgenticRuntime, created: Record<string,unknown>, key: string) {
    const selected = await call(runtime, "plan", {planHandle:created.planHandle,expectedRevision:created.revision,selectedOptionId:routine(created).optionId,idempotencyKey:key});
    assert.equal(selected.ok,true,JSON.stringify(selected));return selected;
}
async function call(runtime: AgenticRuntime, name: string, args: unknown, id = 1) {
    const response = await handleJsonRpc(runtime, {
        id,
        method: "tools/call",
        params: { arguments: args, name }
    });
    assert.ok(response?.result);
    return response.result.structuredContent as Record<string, unknown>;
}
beforeEach(() => {
    installGoldCatalogue();
});
afterEach(() => {
    uninstallGoldCatalogue();
    setAgenticRuntimeForTests(null);
});
describe("agentic DEV flow", () => {
    it("rejects Vitamin D3 in grams before search", async () => {
        const runtime = runtimeFor();
        const result = await call(runtime, "plan", {
            idempotencyKey: "create-d3-grams-0001",
            ...j1Request({
                targets: [
                    { amount: 1, name: "Vitamin D3", ingredientId: supplementId("Vitamin D3"), unit: "g" }
                ]
            })
        });
        assert.equal(result.ok, false);
        assert.equal((result.error as {
            reasonCode: string;
        }).reasonCode, "unsupported_unit");
        assert.equal(result.basket, undefined);
    });
    it("rejects unsupported destination countries before matching", async () => {
        const runtime = runtimeFor();
        const result = await call(runtime, "plan", {
            idempotencyKey: "create-sg-country-0001",
            ...j1Request({ destinationCountry: "SG" })
        });
        assert.equal(result.ok, false);
        assert.equal((result.error as {reasonCode:string}).reasonCode,"unsupported_country");
        assert.equal((result.error as {fieldPath:string}).fieldPath,"destinationCountry");
        assert.match(JSON.stringify(result.error),/Thailand/);
    });
    it("creates a deterministic J1 stack, freezes checkout, mocks payment, then supports and feedback", async () => {
        const runtime = runtimeFor("principal-a");
        let created = await call(runtime, "plan", {
            idempotencyKey: "create-j1-wellness-01",
            ...j1Request()
        });
        assert.equal(created.ok, true);
        assert.equal(created.status, "ready");
        assert.ok(routine(created).products.length >= 4);
        assert.equal(created.selectedOptionId, null);
        assert.equal(typeof created.planHandle, "string");
        assert.ok(String(created.planHandle).length >= 32);
        const replay = await call(runtime, "plan", {
            idempotencyKey: "create-j1-wellness-01",
            ...j1Request()
        });
        assert.equal(replay.planHandle, created.planHandle);
        assert.equal(replay.revision, created.revision);
        const conflict = await call(runtime, "plan", {
            idempotencyKey: "create-j1-wellness-01",
            ...j1Request({ scoring: { profile: "lowest_cost" } })
        });
        assert.equal(conflict.ok, false);
        assert.equal((conflict.error as {
            reasonCode: string;
        }).reasonCode, "idempotency_conflict");
        created = await select(runtime, created, "flow-j1-select-01");
        const executed = await call(runtime, "execute", {
            expectedRevision: created.revision,
            idempotencyKey: "execute-j1-wellness-01",
            planHandle: created.planHandle
        });
        assert.equal(executed.ok, true);
        assert.equal(executed.orderStatus, "open");
        assert.equal(executed.paymentStatus, "unpaid");
        const orderCap=await resolveCapability({action:"order.read",config:runtime.config,handle:String(executed.orderHandle),now:new Date().toISOString(),resourceType:"order",scope:runtime.scope,store:runtime.store});assert.ok(orderCap);
        assert.equal((await runtime.store.getOrder(orderCap.resourceId))?.stateVersion,1);
        assert.match(String(executed.checkoutUrl), /\/basket\/checkout\?mode=agentic/);
        const declined = await simulatePayment({
            config: runtime.config,
            now: new Date().toISOString(),
            orderHandle: String(executed.orderHandle),
            scenario: "decline_insufficient_funds",
            scope: runtime.scope,
            store: runtime.store
        });
        assert.equal((declined as {
            paymentStatus: string;
        }).paymentStatus, "unpaid");
        assert.equal((await runtime.store.getOrder(orderCap.resourceId))?.stateVersion,1);
        assert.equal((declined as {checkoutUrl:string}).checkoutUrl,executed.checkoutUrl);
        const paid = await simulatePayment({
            config: runtime.config,
            now: new Date().toISOString(),
            orderHandle: String(executed.orderHandle),
            scenario: "success",
            scope: runtime.scope,
            store: runtime.store
        });
        assert.equal((paid as {
            paymentStatus: string;
        }).paymentStatus, "paid");
        assert.equal((await runtime.store.getOrder(orderCap.resourceId))?.stateVersion,2);
        assert.equal((paid as {
            orderStatus: string;
        }).orderStatus, "completed");
        assert.equal((paid as {
            fulfilment: {
                status: string;
            };
        }).fulfilment.status, "preparing");
        await simulatePayment({
            config: runtime.config,
            now: new Date().toISOString(),
            orderHandle: String(executed.orderHandle),
            scenario: "duplicate_success",
            scope: runtime.scope,
            store: runtime.store
        });
        assert.equal((await runtime.store.getOrder(orderCap.resourceId))?.stateVersion,2);
        const polled = await call(runtime, "order", { orderHandle: executed.orderHandle });
        assert.equal(polled.paymentStatus, "paid");
        assert.equal(polled.nextAction, "poll");
        const support = await call(runtime, "support", {
            idempotencyKey: "support-j1-00000001",
            message: "When will this ship?",
            orderHandle: executed.orderHandle
        });
        assert.equal(support.ok, true);
        assert.equal(support.status, "open");
        assert.match(String(support.caseReference), /^tkt_/);
        assert.match(String(support.messageId), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "support messageId must persist as a UUID on Postgres");
        const feedback = await call(runtime, "feedback", {
            consentConfirmed: true,
            expectedRevision: created.revision,
            idempotencyKey: "feedback-j1-0000001",
            planHandle: created.planHandle,
            summary: "Clear coverage explanation."
        });
        assert.deepEqual(feedback, { accepted: true, ok: true });
    });
    it("keeps principal B from reading principal A capabilities", async () => {
        const alice = runtimeFor("alice");
        const bob = runtimeFor("bob");
        const created = await call(alice, "plan", {
            idempotencyKey: "alice-plan-00000001",
            ...j1Request()
        });
        const stolen = await call(bob, "plan", {
            expectedRevision: created.revision,
            idempotencyKey: "bob-steal-000000001",
            planHandle: created.planHandle,
            ...j1Request({ scoring: { profile: "lowest_cost" } })
        });
        assert.equal(stolen.ok, false);
        assert.equal((stolen.error as {
            reasonCode: string;
        }).reasonCode, "not_found");
    });
    it("retains CKD context and confirmed checkout with only measured limit-excess advice", async () => {
        const runtime = runtimeFor();
        let created = await call(runtime, "plan", {
            idempotencyKey: "ckd-magnesium-000001",
            ...j1Request({
                conditionCodes: ["ckd"],
                targets: [
                    { amount: 300, name: "Magnesium", ingredientId: supplementId("Magnesium"), unit: "mg" }
                ]
            })
        });
        assert.equal(created.status, "ready");
        const cap = await resolveCapability({ action: "plan.read", config: runtime.config, handle: String(created.planHandle), now: new Date().toISOString(), resourceType: "plan", scope: runtime.scope, store: runtime.store });
        assert.ok(cap);
        const stored = await runtime.store.getPlanRevision(cap.resourceId, Number(created.revision));
        assert.ok(stored?.requestSnapshot.conditionCodes.includes("ckd"));
        for (const finding of routine(created).ingredients.flatMap(row => row.advice ?? [])) {
            assert.equal(finding.kind, "dose_review"); assert.ok(finding.exposure > finding.reference && finding.reference > 0);
        }
        created = await select(runtime, created, "flow-ckd-select-01");
        const executed = await call(runtime, "execute", {
            expectedRevision: created.revision,
            idempotencyKey: "ckd-execute-00000001",
            planHandle: created.planHandle
        });
        assert.equal(executed.ok, true, JSON.stringify(executed));
        assert.ok(executed.orderHandle);
        assert.equal(created.status, "ready");
    });
    it("selects algae omega-3 under a plant-based constraint", async () => {
        const runtime = runtimeFor();
        const created = await call(runtime, "plan", {
            idempotencyKey: "plant-omega-00000001",
            ...j1Request({
                requirements: {
                    dietaryPreference: "plant_based",
                    omega3SourcePreference: "algae_only"
                },
                targets: [
                    { amount: 1000, name: "Omega-3", ingredientId: supplementId("Omega-3"), unit: "mg" }
                ]
            })
        });
        assert.equal(created.ok, true);
        const names = routine(created).products.map(item => item.name);
        assert.ok(names.some((name) => /algae/i.test(name)));
        assert.equal(names.some((name) => /fish/i.test(name)), false);
    });
});
