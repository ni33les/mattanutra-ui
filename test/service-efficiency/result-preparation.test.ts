import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import * as completion from "../../lib/task-result-applier.ts";
import type { TaskRecord } from "../../lib/task-service.ts";
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
