import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { handleCompletedJsonRpc as handleJsonRpc } from "./helpers/completed-mcp-client.ts";
import { createAgenticRuntime, setAgenticRuntimeForTests, type AgenticRuntime } from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { engineeringInfo } from "../lib/agentic/info.ts";
import type { PlanResult } from "../lib/agentic/plan/types.ts";
import { agenticToolDescriptions } from "../lib/agentic/contract/index.ts";
import { AGENTIC_SERVER_INSTRUCTIONS } from "../lib/agentic/contract/instructions.ts";
import { mcpTestBatches, mcpTestFiles } from "../scripts/agentic-qa-pack.mjs";
import { everyLineHasHttpImage, exactToolNames, isFixtureLine, isFixtureShapedId, isHttpUrl, unpaidA9EnvGate, hasOrderTrackDestination } from "../scripts/agentic-qa-pack-helpers.mjs";
function runtimeFor(): AgenticRuntime {
    return createAgenticRuntime({
        config: loadAgenticConfig(),
        scope: {
            environment: "dev",
            principalScope: "agentic-qa",
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
function eightTargets() {
    return [
        { amount: 2000, name: "Vitamin D3", unit: "IU" },
        { amount: 1000, name: "Algae omega-3", unit: "mg" },
        { amount: 300, name: "Magnesium", unit: "mg" },
        { amount: 1000, name: "Vitamin B12", unit: "mcg" },
        { amount: 1000, name: "Vitamin C", unit: "mg" },
        { amount: 25, name: "Zinc", unit: "mg" },
        { amount: 10, name: "Iron", unit: "mg" },
        { amount: 100, name: "CoQ10", unit: "mg" }
    ];
}
function baseRequest(overrides: Record<string, unknown> = {}) {
    return {
        destinationCountry: "TH",
        locale: "en",
        scoring: { profile: "balanced" },
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: eightTargets(),
        ...overrides
    };
}
function choices(plan: Record<string,unknown>) {
    assert.equal(plan.ok,true,JSON.stringify(plan)); const rows=plan.choices as Array<{candidateKey:string;roles:string[];summary:{goodsPrice:number|null;coveragePercent:number|null};products:Array<{name:string;productId:string;imageUrl:string}>;ingredients:Array<{ingredientId:string;name:string;requested:number|null;supplied:number|null}>}>;assert.ok(rows.length);return rows;
}
function namesInBasket(plan: Record<string,unknown>) { return choices(plan).flatMap(row=>row.products.map(item=>item.name)); }
async function saved(runtime:AgenticRuntime,plan:Record<string,unknown>) { const [id]=await runtime.store.listPlanIdsByPrincipal("agentic-qa");assert.ok(id);const row=await runtime.store.getPlanRevision(id,Number(plan.revision));assert.ok(row);return row; }
async function domain(runtime:AgenticRuntime,plan:Record<string,unknown>){return (await saved(runtime,plan)).result as PlanResult;}
beforeEach(() => {
    installGoldCatalogue();
});
afterEach(() => {
    uninstallGoldCatalogue();
    setAgenticRuntimeForTests(null);
});
describe("Repository MattaNutra Agentic QA coverage", () => {
    it("A1 info lists names and codes; Algae omega-3 does not 400", async () => {
        const runtime = runtimeFor();
        const info = await call(runtime, "info", { locale: "en" });
        const engineering = await engineeringInfo({ config: runtime.config, locale: "en" });
        const names = (engineering.recognisedNames as string[]) ?? [];
        assert.ok(names.includes("Algae omega-3"));
        assert.ok(names.includes("Vitamin K2"));
        assert.ok(names.includes("MK-7"));
        assert.ok(names.includes("Folate"));
        assert.ok(((info.medicationCodes as string[]) ?? []).includes("apixaban"));
        assert.ok(((info.conditionCodes as string[]) ?? []).includes("ckd"));
        const plan = await call(runtime, "plan", {
            idempotencyKey: "qa-a1-algae-k2-00001",
            ...baseRequest({
                targets: [
                    { amount: 1000, name: "Algae omega-3", unit: "mg" },
                    { amount: 100, name: "Vitamin K2", unit: "mcg" }
                ]
            })
        });
        assert.equal(plan.ok, true);
        assert.notEqual((plan.error as {
            reasonCode?: string;
        } | undefined)?.reasonCode, "unknown_supplement");
        const k2=choices(plan).flatMap(row=>row.ingredients).find(row=>row.name==="Vitamin K2");assert.ok(k2);assert.match(k2.ingredientId,/^sup_/);assert.equal(k2.requested,100);

    });
    it("A2 answering a returned question preserves targets and medication context", async () => {
        const runtime=runtimeFor(), created=await call(runtime,"plan",{...baseRequest({medicationCodes:["apixaban"],requirements:{maxProductCount:8}}),idempotencyKey:"qa-a2-create-0000001"});
        const row=await saved(runtime,created), result=row.result as PlanResult, iron=result.requestSnapshot.targets.find(t=>t.name==="Iron");assert.ok(iron);
        const question={questionId:"q_controlled_gap",prompt:"Keep the requested iron target while reviewing its gap?",promptKey:"controlled.gap",choices:[{choice:`accept_gap:${iron.supplementId}`,label:"Keep target",effect:"Retain target"}]};
        await runtime.store.updatePlanRevision({...row,result:{...result,questions:[question]}});
        const offered=await call(runtime,"plan",{planHandle:created.planHandle});assert.equal((offered.questions as Array<{questionId:string}>)[0].questionId,question.questionId);
        const patched=await call(runtime,"plan",{planHandle:created.planHandle,expectedRevision:created.revision,idempotencyKey:"qa-a2-patch-00000001",answers:[{questionId:question.questionId,choice:question.choices[0].choice}]});
        assert.equal(patched.ok,true,JSON.stringify(patched));const stored=await domain(runtime,patched);
        assert.deepEqual(stored.originalRequest?.medicationCodes,["apixaban"]);assert.equal(stored.originalRequest?.requirements?.maxProductCount,8);
        assert.deepEqual(stored.originalRequest?.targets.map(({name,amount,unit})=>({name,amount,unit})),eightTargets());
        assert.ok(stored.requestSnapshot.acceptedGaps.some(row=>row.supplementId===iron.supplementId));
        const option=choices(patched).find(row=>row.products.length);assert.ok(option);
        const selected=await call(runtime,"plan",{planHandle:patched.planHandle,expectedRevision:patched.revision,idempotencyKey:"qa-a2-select-0000001"});
        assert.equal(selected.ok,true);assert.deepEqual(choices(selected).map(row=>row.products),choices(patched).map(row=>row.products));
    });
    it("A3 recommendation stays stable until targets change", async () => {
        const runtime = runtimeFor();
        const created = await call(runtime, "plan", {
            idempotencyKey: "qa-a3-create-0000001",
            ...baseRequest()
        });
        const sticky = await call(runtime, "plan", {
            planHandle: created.planHandle
        });
        assert.equal(sticky.ok, true);
        assert.deepEqual(choices(sticky), choices(created));
        const changed = await call(runtime, "plan", {
            expectedRevision: sticky.revision,
            idempotencyKey: "qa-a3-change-0000001",
            planHandle: created.planHandle,
            targets: [{ingredientId:choices(created).flatMap(row=>row.ingredients).find(row=>row.name==="Vitamin D3")!.ingredientId,amount:2100}]
        });
        assert.equal(changed.ok, true);
        assert.notDeepEqual(choices(changed).map(row=>row.ingredients),choices(created).map(row=>row.ingredients));
    });
    it("A4 clinical advice uses stable family IDs and stale selection revisions fail", async () => {
        const runtime = runtimeFor();
        const created = await call(runtime, "plan", {
            idempotencyKey: "qa-a4-create-0000001",
            ...baseRequest({
                medicationCodes: ["apixaban"],
                targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
            })
        });
        const ids = (await domain(runtime,created)).safetyGuidance.map(row=>row.guidanceId);
        assert.ok(ids.some((id) => id === "gdn:medication_interaction:omega3+anticoagulant"));
        assert.equal(ids.some((id) => /prd_/.test(id)), false);
        assert.equal(((created.questions as Array<{
            questionId: string;
        }>) ?? []).some((question) => question.questionId === "q_safety_ack"), false);
        const stale = await call(runtime, "plan", {
            expectedRevision: 99,
            idempotencyKey: "qa-a4-stale-00000001",
            planHandle: created.planHandle
        });
        assert.equal(stale.ok, false);
        assert.equal((stale.error as {
            reasonCode: string;
        }).reasonCode, "stale_revision");
    });
    it("A5 defaults to best_match and reconciles goods prices after lower-cost refinement", async () => {
        const runtime=runtimeFor(),plan=await call(runtime,"plan",{...baseRequest(),idempotencyKey:"qa-a5-coverage-00001"});
        assert.equal((plan.scoring as {profile:string}).profile,"best_match");
        const options=choices(plan);assert.equal(options.length,1);assert.ok(options[0].products.length);
        for(const option of options)assert.equal(option.summary.goodsPrice,option.products.reduce((sum,item)=>sum+(item as {lineTotal:number}).lineTotal,0));
        const refined = await call(runtime,"plan",{planHandle:plan.planHandle,expectedRevision:plan.revision,idempotencyKey:"qa-a5-cost-refine-01",scoring:{profile:"lowest_cost"}});
        assert.equal(refined.ok,true); assert.equal((refined.scoring as {profile:string}).profile,"lowest_cost");
        const routine=choices(refined)[0];assert.ok(routine);assert.equal(routine.summary.goodsPrice,routine.products.reduce((sum,item)=>sum+(item as {lineTotal:number}).lineTotal,0));
    });
    it("A6 Vitamin K2 is recognised, not INVALID_ARGUMENT", async () => {
        const runtime = runtimeFor();
        const plan = await call(runtime, "plan", {
            idempotencyKey: "qa-a6-k2-leftover-001",
            ...baseRequest({
                targets: [
                    ...eightTargets(),
                    { amount: 100, name: "Vitamin K2", unit: "mcg" }
                ]
            })
        });
        assert.equal(plan.ok, true);
        assert.equal(plan.error, undefined);
        const k2=choices(plan).flatMap(row=>row.ingredients).find(row=>row.name==="Vitamin K2");assert.ok(k2);assert.match(k2.ingredientId,/^sup_/);assert.equal(k2.requested,100);

    });
    it("A7 DEV fixtures are explicitly marked fixture", async () => {
        const runtime = runtimeFor();
        const plan = await call(runtime, "plan", {
            idempotencyKey: "qa-a7-fixture-0000001",
            ...baseRequest({
                targets: [{ amount: 5, name: "Creatine", unit: "g" }]
            })
        });
        const item = (await domain(runtime,plan)).selected?.basket[0] ?? (await domain(runtime,plan)).alternatives.find(row=>row.basket.length)?.basket[0];
        assert.ok(item);
        assert.equal(item.fixture, true);
        assert.equal(item.source, "fixture");
        assert.match(String(item.productName), /Creatine Monohydrate 5 g/);
        assert.match(String(item.productId), /^prd_b{8}/i);
    });
    it("A8 plan option lines include http(s) imageUrl", async () => {
        assert.equal(isHttpUrl("https://example.test/x.jpg"), true);
        assert.equal(everyLineHasHttpImage([{ imageUrl: "https://example.test/x.jpg" }]), true);
        assert.equal(everyLineHasHttpImage([{ imageUrl: "" }]), false);
        const runtime = runtimeFor();
        const plan = await call(runtime, "plan", {
            idempotencyKey: "qa-a8-images-0000001",
            ...baseRequest()
        });
        const lines = choices(plan).flatMap(row=>row.products);
        assert.ok(lines.length > 0);
        assert.equal(everyLineHasHttpImage(lines), true);
    });
    it("A9 unpaid execute is env-gated on uat and dev", () => {
        assert.equal(hasOrderTrackDestination("https://uat.mattanutra.com/en/order/track"), true);
        assert.equal(hasOrderTrackDestination("https://example.test/mcp/checkout/x"), false);
        const uat = unpaidA9EnvGate("uat");
        assert.equal(uat.pass, true);
        assert.match(uat.detail, /UAT env-gated: unpaid execute never hits \/order\/track/);
        assert.match(uat.detail, /POST pay forbidden/);
        const dev = unpaidA9EnvGate("dev");
        assert.equal(dev.pass, true);
        assert.match(dev.detail, /DEV env-gated/);
        assert.equal(unpaidA9EnvGate("prd").pass, false);
    });
    it("A10 DEV fixtures are explicitly marked", async () => {
        const runtime = runtimeFor();
        const plan = await call(runtime, "plan", {
            idempotencyKey: "qa-a10-fixture-000001",
            ...baseRequest({
                targets: [{ amount: 5, name: "Creatine", unit: "g" }]
            })
        });
        const stored=await domain(runtime,plan);const lines=[stored.selected,...stored.alternatives].flatMap(row=>row?.basket??[]);
        assert.ok(lines.length > 0);
        for (const line of lines as Array<Record<string, unknown>>) {
            if (isFixtureShapedId(line.productId)) {
                assert.equal(isFixtureLine(line), true);
            }
        }
    });
    it("A11 sex not sexAtBirth", async () => {
        const runtime = runtimeFor();
        const listed = await handleJsonRpc(runtime, { id: 2, method: "tools/list" });
        const blob = JSON.stringify(listed?.result ?? {});
        assert.equal(/sexAtBirth/i.test(blob), false);
        assert.match(blob, /"sex"/);
        const rejected = await call(runtime, "plan", {
            idempotencyKey: "qa-a11-sexatbirth-001",
            ...{
                ...baseRequest(),
                profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" }
            }
        });
        assert.equal(rejected.ok, false);
        assert.equal((rejected.error as {
            reasonCode?: string;
        } | undefined)?.reasonCode, "unexpected_property");
    });
    it("A12 Folate is not the Creatine fixture", async () => {
        const runtime = runtimeFor();
        const plan = await call(runtime, "plan", {
            idempotencyKey: "qa-a12-folate-000001",
            ...baseRequest({
                targets: [{ amount: 400, name: "Folate", unit: "mcg" }]
            })
        });
        assert.equal(plan.ok, true);
        const item = (await domain(runtime,plan)).selected?.basket[0] ?? (await domain(runtime,plan)).alternatives.find(row=>row.basket.length)?.basket[0];
        assert.ok(item);
        assert.notEqual(item.productName, "Creatine Monohydrate 5 g");
    });
    it("A15 algae_only omega line is algae not fish", async () => {
        const runtime = runtimeFor();
        const plan = await call(runtime, "plan", {
            idempotencyKey: "qa-a15-algae-0000001",
            ...baseRequest({
                requirements: { omega3SourcePreference: "algae_only" },
                targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
            })
        });
        const names = namesInBasket(plan);
        assert.equal(plan.ok, true);
        assert.ok(names.some((name) => /algae/i.test(name)));
        assert.equal(names.some((name) => /fish oil|3-6-9|lecithin|krill/i.test(name) && !/algae/i.test(name)), false);
    });
    it("A16 male age 52 is not mapped to prenatal SKUs", async () => {
        const runtime = runtimeFor();
        const plan = await call(runtime, "plan", {
            idempotencyKey: "qa-a16-male52-000001",
            ...baseRequest({
                profile: { ageYears: 52, lifeStage: "adult", sex: "male" }
            })
        });
        assert.equal(plan.ok, true);
        assert.equal(namesInBasket(plan).some((name) => /conceive|prenatal|pregnancy|fertility/i.test(name)), false);
    });
    it("A13 tools/list is exactly the six public tools", async () => {
        const runtime = runtimeFor();
        const listed = await handleJsonRpc(runtime, { id: 3, method: "tools/list" });
        const names = ((listed?.result?.tools as Array<{
            name: string;
        }>) ?? []).map((item) => item.name);
        assert.equal(exactToolNames(names), true);
    });
    it("A2 repository entrypoint includes live timing, commerce, and nested value coverage", () => {
        const files = mcpTestFiles();
        for (const file of [
            "test/agentic-dev-preheader-lat.test.ts", "test/agentic-v13-lat.test.ts",
            "test/agentic-v16-plan90.test.ts", "test/agentic-live-com-e2e.test.ts",
            "test/agentic-live-r4-regression.test.ts", "test/commerce-transactions.integration.test.ts",
            "test/agentic/value/slice5-agent.test.ts", "test/matcher/qa-safety.test.ts",
            "test/admin-product-facts.test.ts", "test/assessment-revisions.integration.test.ts",
            "test/funnel-readiness.integration.test.ts"
        ])
            assert.ok(files.includes(file), file);
        assert.equal(new Set(files).size, files.length);
        const [remote, local] = mcpTestBatches({
            DB_URL: "postgresql://catalogue/dev",
            TEST_DB_URL: "postgresql://127.0.0.1/mattanutra_lock_review_qa"
        });
        assert.deepEqual([...remote.files, ...local.files].sort(), files);
        assert.equal(remote.env.DB_URL, "postgresql://catalogue/dev");
        assert.equal(remote.env.DB_POOL_MAX, "1");
        assert.equal(remote.env.DB_WORKER_POOL_MAX, "1");
        assert.equal(local.env.DB_URL, "postgresql://127.0.0.1/mattanutra_lock_review_qa");
        assert.equal(local.env.DB_POOL_MAX, "6");
        assert.equal(local.env.DB_WORKER_POOL_MAX, "6");
        assert.ok(local.files.includes("test/commerce-transactions.integration.test.ts"));
        assert.ok(local.files.every(file => file.endsWith(".integration.test.ts")));
    });
    it("repository entrypoint lists coverage without credentials and rejects incomplete or unsafe setup", () => {
        const script = fileURLToPath(new URL("../scripts/agentic-qa-pack.mjs", import.meta.url));
        const run = (args: string[], env: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8" });
        const listed = run(["--list"]);
        assert.equal(listed.status, 0, listed.stderr);
        assert.deepEqual(listed.stdout.trim().split("\n"), mcpTestFiles());
        const missing = run([]);
        assert.equal(missing.status, 2);
        assert.match(missing.stderr, /requires DB_URL/);
        const unsafe = run([], { DB_URL: "postgresql://localhost/catalogue", TEST_DB_URL: "postgresql://remote/uat" });
        assert.equal(unsafe.status, 2);
        assert.match(unsafe.stderr, /isolated localhost/);
        const uat = run([], { MATTANUTRA_ENV: "uat" });
        assert.equal(uat.status, 2);
        assert.match(uat.stderr, /MATTANUTRA_ENV=dev/);
    });
    it("T3 published tool instructions invite only optional consented feedback", () => {
        assert.match(agenticToolDescriptions("dev", "en").feedback, /optional/i);
        assert.match(agenticToolDescriptions("dev", "en").feedback, /consentConfirmed=true/);
        assert.equal(/A1–A13 = 13\/13/.test(AGENTIC_SERVER_INSTRUCTIONS), false);
        const schema = readFileSync(new URL("../scripts/apply-agentic-commerce-schema.ts", import.meta.url), "utf8");
        assert.match(schema, /agentic_matcher_events/);
        assert.match(schema, /agentic_catalogue_gaps/);
    });
});
