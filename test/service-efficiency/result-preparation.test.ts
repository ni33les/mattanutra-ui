import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import * as completion from "../../lib/task-result-applier.ts";
import type { TaskRecord, TaskServiceDb } from "../../lib/task-service.ts";
import { FUNNEL_GENERATOR_VERSION } from "../../lib/assessment-revisions.ts";
import { completeHealthScoreFixture } from "../fixtures/healthscore.ts";
import { healthScoreReadProjection } from "../../lib/healthscore-readiness.ts";

const task = (taskType: string) => ({ id: "44a8958e-1da5-47e8-98dd-e2cc7a275cb2", planId: "68e06c22-93a5-4c11-850b-a18125df02de", taskType,
  payload: { generation: { revision: 1, locale: "th", inputHash: "frozen", generatorVersion: FUNNEL_GENERATOR_VERSION, answers: { country: "TH" } } } }) as TaskRecord;

test("LOCK-PREP-01 product rows, legacy presentation and decision facts are frozen before publication", async () => {
  const payload = { recommendations: [{ product: { id: "e1dc61db-170f-4e17-806d-b2597208ea20", title: "Fixture", translations: { th: { title: "สินค้า" } }, priceAmount: 123.45, currency: "THB", platform: "manual" },
    rank: 1, score: 9, productCoveragePercent: 75, stackContributionPercent: 75, servingMultiplier: 2, coveredNeeds: [{ sourceId: "d3" }], why: "Frozen advice", url: "https://fixture.invalid", unknownAtRecommendation: false }],
    stackCoveragePercent: 75, diagnostics: { stackPreference: "balanced", trace: {} } };
  const prepared = await completion.prepareTaskCompletionResult({ task: task("generate_product_recommendations"), resultPayload: payload });
  assert.ok(prepared?.products); const product = prepared.products;
  assert.equal(product.variants.length, 1);
  const stored = JSON.parse(product.variants[0].itemsJson);
  assert.equal(stored[0].serving_multiplier, 2); assert.equal(stored[0].price_amount, 123.45);
  assert.equal(JSON.parse(product.legacyJson)[0].name, "สินค้า");
  assert.equal(JSON.parse(product.legacyJson)[0].recommendationRunId, product.variants[0].runId);
  assert.equal(product.variants[0].decisions[0].productCoveragePercent, 75);
  payload.recommendations[0].why = "Changed after preparation";
  assert.equal(JSON.parse(product.legacyJson)[0].description, "Frozen advice");
});

test("LOCK-PREP-02 HealthScore hash and localized gates are prepared from the exact saved copy", async () => {
  const healthScore = completeHealthScoreFixture("th"), original = structuredClone(healthScore);
  const prepared = await completion.prepareTaskCompletionResult({ task: task("analyze_healthscore"), resultPayload: { healthScore } });
  assert.ok(prepared?.healthScore);
  assert.deepEqual(JSON.parse(prepared.healthScore.json), original);
  assert.deepEqual(prepared.healthScore.projection, healthScoreReadProjection(original));
  assert.equal(prepared.healthScore.locale, "th");
});

test("LOCK-PREP-03 external worker completion invokes preparation before the transaction callback", () => {
  const route = readFileSync(new URL("../../app/api/tasks/[id]/complete/route.ts", import.meta.url), "utf8");
  assert.match(route, /prepareResult:\s*prepareTaskCompletionResult/);
  assert.match(route, /preparedResult:\s*context.preparedResult/);
});

test("LOCK-PREP-04 formulation and food advice are prepared before publication and audit effects remain deferred",async()=>{
  const reads:string[]=[];
  const sql=(async(parts:TemplateStringsArray)=>{
    const query=parts.join("?");reads.push(query);assert.match(query.trim(),/^select/i);assert.doesNotMatch(query,/for (?:update|share)|pg_advisory/i);
    if(query.includes("public.assessments"))return[{answers:{country:"TH"},locale:"th",selected_plan:"precision"}];
    return[];
  }) as unknown as TaskServiceDb;
  for(const locale of ["en","th","zh-CN"] as const){
    const formulationTask=task("generate_supplement_guidance"),foodTask=task("generate_food_guidance");
    (formulationTask.payload as {generation:{locale:string}}).generation.locale=locale;
    (foodTask.payload as {generation:{locale:string}}).generation.locale=locale;
    const formulation={supplementBreakdown:[{id:"unknown-label",supplement:"Unknown label",dailyDose:"200 mg",status:"add",effectivenessRank:1}]};
    const foodGuidance={foodGuidance:[{id:"unknown-food",food:"Unknown food",serving:"100 g",frequency:"daily",status:"add",effectivenessRank:1}]};
    const formula=await completion.prepareTaskCompletionResult({task:formulationTask,resultPayload:{analysis:{formulation}},sql});
    const food=await completion.prepareTaskCompletionResult({task:foodTask,resultPayload:{analysis:{foodGuidance}},sql});
    assert.ok(formula.formulation);assert.ok(food.food);
    assert.equal(formula.formulation.value.supplementBreakdown[0].dailyDose,"200 mg");
    assert.equal(formula.formulation.value.supplementBreakdown[0].safety?.action,"advisory");
    assert.equal(food.food.value.foodGuidance[0].serving,"100 g");
    assert.equal(formula.formulation.locale,locale);assert.equal(food.food.locale,locale);
    assert.deepEqual(JSON.parse(formula.formulation.json),formula.formulation.value);
    assert.deepEqual(JSON.parse(food.food.json),food.food.value);
    assert.ok(formula.formulation.afterCommit.length>0 && food.food.afterCommit.length>0,"audit effects are retained for successful publication");
    assert.ok(reads.length>0);
  }
});

test("LOCK-BOUNDARY-PUBLISH-01 run and product lines publish together without a second protected round trip", async () => {
  const productTask = task("generate_product_recommendations");
  const reference = { runtimeRevision: 99, fingerprint: "a".repeat(64) };
  Object.assign(productTask.payload, { catalogueRevision: 99, safetyReferenceIdentity: reference });
  const payload = { catalogueRevision: 99, safetyReferenceIdentity: reference,
    recommendations: [{ product: { id: "e1dc61db-170f-4e17-806d-b2597208ea20", title: "Fixture", priceAmount: 123.45, currency: "THB", platform: "manual" },
      rank: 1, score: 9, productCoveragePercent: 75, stackContributionPercent: 75, servingMultiplier: 2, coveredNeeds: [], why: "Frozen advice", url: "https://fixture.invalid", unknownAtRecommendation: false }],
    stackCoveragePercent: 75, diagnostics: { stackPreference: "balanced", trace: {} } };
  const statements: string[] = [];
  let runId = "";
  const sql = Object.assign(async (parts: TemplateStringsArray) => {
    const query = parts.join("?"); statements.push(query);
    if (query.includes("from public.assessments")) return [{ input_revision: 1, input_hash: "frozen" }];
    if (/insert into public.product_recommendation_runs/.test(query)) return [{ id: runId }];
    if (query.includes("to_regclass")) return [{ table_name: "public.product_recommendation_decisions" }];
    return [];
  }, { json: (value: unknown) => value }) as unknown as TaskServiceDb;
  const prepared = await completion.prepareTaskCompletionResult({ task: productTask, resultPayload: payload, sql });
  assert.ok(prepared.products?.selected); runId = prepared.products.selected.runId;
  statements.length = 0;
  const result = await completion.applyTaskCompletionResult({ task: productTask, taskId: productTask.id, resultPayload: payload, preparedResult: prepared, sql, afterCommit: () => {} }) as { recommendationRunId: string };
  assert.equal(result.recommendationRunId, runId);
  const storage = statements.filter(q => /insert into public.product_recommendation_(runs|items)/.test(q));
  assert.equal(storage.length, 1);
  assert.match(storage[0], /insert into public.product_recommendation_runs[\s\S]*insert into public.product_recommendation_items/);
  assert.equal(JSON.parse(prepared.products.selected.itemsJson)[0].price_amount, 123.45);
  assert.equal(statements.filter(q => q.includes("to_regclass")).length, 0, "Schema discovery belongs before publication");
});
