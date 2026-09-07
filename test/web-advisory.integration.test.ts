import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { getSql, closeSqlPool, withDatabaseTransaction } from "../lib/db.ts";
import { persistAssessmentSubmission } from "../lib/assessment-store.ts";
import { createAssessmentSnapshot } from "../lib/assessment-snapshot.ts";
import { computeHealthScore } from "../lib/health-score.ts";
import { createTask } from "../lib/task-service.ts";
import { FUNNEL_GENERATOR_VERSION, generationInput, loadGenerationInput } from "../lib/assessment-revisions.ts";
import { applyTaskCompletionResult } from "../lib/task-result-applier.ts";
import { buildTaskWorkItem } from "../lib/task-work-items.ts";
import { getAssessmentProductPreferences } from "../lib/assessment-product-preferences.ts";
import { getFunnelReadiness } from "../lib/funnel-readiness.ts";
import { insertFormulationVersion } from "../lib/plan-version-writes.ts";
import { completeHealthScoreFixture } from "./fixtures/healthscore.ts";
import { GET as getFormulation } from "../app/api/assessment/[planId]/formulation/route.ts";
import { POST as replanProducts } from "../app/api/assessment/[planId]/product-recommendations/route.ts";
import { enqueueProductRecommendationsTask } from "../lib/task-worker.ts";
import { ACTIVE_PRODUCT_RECOMMENDATION_ALGORITHM_VERSION, ACTIVE_PRODUCT_RECOMMENDATION_IMPLEMENTATION_VERSION } from "../lib/product-recommendations.ts";

const databaseUrl = process.env.TEST_DB_URL;
describe("web advisory revisions on PostgreSQL", { skip: !databaseUrl }, () => {
  const plans: string[] = [];
  const answers = { firstName: "Advisory fixture", sex: "female", age: "36-45", goals: ["energy"] };
  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
    await getSql()!`insert into public.organisations (slug, name, organisation_type)
      values ('mattanutra', 'MattaNutra', 'platform') on conflict do nothing`;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async tx => {
      await tx`set local session_replication_role = replica`;
      for (const table of ["task_events", "task_comments"]) await tx.unsafe(`delete from public.${table} where task_id in (select id from public.tasks where plan_id = any($1::uuid[]))`, [plans]);
      for (const table of ["tasks", "formulations", "product_recommendation_runs", "assessment_product_preferences", "assessment_healthscore_results", "assessment_inputs", "assessment_versions", "assessment_version_counters", "assessments"]) {
        await tx.unsafe(`delete from public.${table} where plan_id = any($1::uuid[])`, [plans]);
      }
    });
    await closeSqlPool();
  });
  async function seed() {
    const planId = randomUUID(); plans.push(planId);
    await persistAssessmentSubmission({ answers, locale: "en", status: "captured", selectedPlan: "precision",
      snapshot: createAssessmentSnapshot({ planId, healthScore: computeHealthScore(answers, "en") }) });
    return planId;
  }
  it("creates current-version work beside a completed historical deterministic task and reuses the current task", async () => {
    const planId = await seed();
    const generation = (await loadGenerationInput(getSql()!, planId))!;
    const input = { id: randomUUID(), planId, title: "Version regression", taskType: "generate_supplement_guidance",
      idempotencyKey: `version-regression:${planId}`, idempotencyScope: "successful" as const };
    const legacy = await createTask({ ...input, payload: { generation: { ...generation, generatorVersion: "web-funnel-v1" } } });
    await getSql()!`update public.tasks set status = 'completed' where id = ${legacy.task.id}::uuid`;
    const current = await createTask(input);
    assert.notEqual(current.task.id, legacy.task.id);
    assert.equal(generationInput(current.task.payload)?.generatorVersion, FUNNEL_GENERATOR_VERSION);
    assert.equal((await createTask(input)).task.id, current.task.id);
    assert.equal((await getSql()!`select count(*)::int as n from public.tasks where plan_id = ${planId}::uuid`)[0].n, 2);
    assert.deepEqual(await withDatabaseTransaction(getSql()!, sql => applyTaskCompletionResult({ task: legacy.task, taskId: legacy.task.id, sql, resultPayload: {} })),
      { superseded: true, message: "Assessment inputs changed; old result was not applied" });
  });
  it("reuses an active current product refresh when the request is retried", async () => {
    const planId = await seed();
    const { task } = await createTask({ planId, title: "Current product refresh", taskType: "generate_product_recommendations", payload: {
      productPreferences: { revision: 0, excludedProductIds: [] }, stackPreference: "balanced",
      matcherAlgorithmVersion: ACTIVE_PRODUCT_RECOMMENDATION_ALGORITHM_VERSION,
      matcherImplementationVersion: ACTIVE_PRODUCT_RECOMMENDATION_IMPLEMENTATION_VERSION
    } });
    assert.equal(await enqueueProductRecommendationsTask({ planId, forceNew: true }), task.id);
    assert.equal(await enqueueProductRecommendationsTask({ planId, forceNew: true }), task.id);
    assert.equal((await getSql()!`select count(*)::int as n from public.tasks where plan_id = ${planId}::uuid`)[0].n, 1);
  });
  it("supersedes old product and food-gap work after exclusions without changing answers or HealthScore revision", async () => {
    const planId = await seed();
    const tasks = [];
    for (const taskType of ["generate_product_recommendations", "generate_food_gap_guidance"]) {
      tasks.push((await createTask({ planId, title: "Product preference regression", taskType, payload: { productPreferences: { revision: 0, excludedProductIds: [] } } })).task);
    }
    await withDatabaseTransaction(getSql()!, async tx => {
      await tx`select plan_id from public.assessments where plan_id = ${planId}::uuid for no key update`;
      await getAssessmentProductPreferences(tx, planId, true);
      await tx`update public.assessment_product_preferences set revision = 1, excluded_product_ids = ${[randomUUID()]}::uuid[] where plan_id = ${planId}::uuid`;
    });
    for (const task of tasks) {
      assert.equal((await buildTaskWorkItem(task)).taskType, "superseded_generation");
      assert.deepEqual(await withDatabaseTransaction(getSql()!, sql => applyTaskCompletionResult({ task, taskId: task.id, sql, resultPayload: {} })),
        { superseded: true, message: "Product preferences changed; old result was not applied" });
    }
    const [row] = await getSql()!`select input_revision, answers from public.assessments where plan_id = ${planId}::uuid`;
    assert.equal(Number(row.input_revision), 1); assert.deepEqual(row.answers, answers);
    assert.equal((await getSql()!`select count(*)::int as n from public.product_recommendation_runs where plan_id = ${planId}::uuid`)[0].n, 0);
  });
  it("replans in the viewed locale while fencing old options across locales and preserving HealthScore", async () => {
    const planId = await seed();
    const sql = getSql()!;
    for (const locale of ["en", "th"] as const) {
      const generation = (await loadGenerationInput(sql, planId, locale))!;
      await insertFormulationVersion(sql, { planId, generation, modelVersion: "locale-replan-fixture", formulation: {
        supplementBreakdown: [{ id: "magnesium", supplement: "Magnesium", dailyDose: "300 mg", effectivenessRank: 1 }],
        sectionStatuses: { supplements: "pending" }
      } });
      await sql`insert into public.assessment_healthscore_results (plan_id, revision, locale, generator_version, result)
        values (${planId}::uuid, 1, ${locale}, ${FUNNEL_GENERATOR_VERSION}, ${sql.json(completeHealthScoreFixture(locale))})`;
      await sql`insert into public.product_recommendation_runs (plan_id, assessment_revision, generation_locale, generator_version, selection_revision)
        values (${planId}::uuid, 1, ${locale}, ${FUNNEL_GENERATOR_VERSION}, 0)`;
      assert.equal((await getFunnelReadiness(planId, locale))?.readyForReveal, true);
    }
    const excludeProductIds = [randomUUID()];
    const request = (locale: string, selectionRevision: number) => replanProducts(new Request(
      `http://127.0.0.1:3100/api/assessment/${planId}/product-recommendations`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": planId },
        body: JSON.stringify({ locale, assessmentRevision: 1, selectionRevision, excludeProductIds })
      }), { params: Promise.resolve({ planId }) });
    assert.equal((await request("invalid", 0)).status, 400);
    assert.equal((await getAssessmentProductPreferences(sql, planId)).revision, 0);
    const response = await request("th", 0);
    assert.equal(response.status, 200, await response.clone().text());
    const receipt = await response.json();
    assert.equal(receipt.selectionRevision, 1);
    const tasks = await sql`select task_type, payload from public.tasks where plan_id = ${planId}::uuid`;
    assert.deepEqual(tasks.map(task => task.task_type).sort(), ["generate_food_gap_guidance", "generate_product_recommendations"]);
    for (const task of tasks) {
      assert.equal(generationInput(task.payload)?.locale, "th");
      assert.equal(generationInput(task.payload)?.revision, 1);
      assert.deepEqual(task.payload.productPreferences, { revision: 1, excludedProductIds: excludeProductIds });
    }
    assert.equal((await getFunnelReadiness(planId, "th"))?.readyForReveal, false);
    assert.equal((await getFunnelReadiness(planId, "en"))?.readyForReveal, false);
    assert.equal((await request("th", 0)).status, 409);
    const retry = await request("th", 1);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).taskId, receipt.taskId);
    await sql`insert into public.product_recommendation_runs (plan_id, assessment_revision, generation_locale, generator_version, selection_revision)
      values (${planId}::uuid, 1, 'th', ${FUNNEL_GENERATOR_VERSION}, 1)`;
    assert.equal((await getFunnelReadiness(planId, "th"))?.readyForReveal, true);
    assert.equal((await getFunnelReadiness(planId, "en"))?.readyForReveal, false);
    const [stored] = await sql`select locale, input_revision, answers from public.assessments where plan_id = ${planId}::uuid`;
    assert.equal(stored.locale, "en"); assert.equal(Number(stored.input_revision), 1); assert.deepEqual(stored.answers, answers);
    assert.equal((await sql`select count(*)::int as n from public.assessment_healthscore_results where plan_id = ${planId}::uuid`)[0].n, 2);
    assert.equal((await sql`select count(*)::int as n from public.tasks where plan_id = ${planId}::uuid and task_type = 'analyze_healthscore'`)[0].n, 0);
  });
  it("serializes exclusion changes with simultaneous product and food-gap completion", async () => {
    for (const taskType of ["generate_product_recommendations", "generate_food_gap_guidance"]) {
      const planId = await seed();
      const { task } = await createTask({ planId, title: "Concurrent preference regression", taskType, payload: { productPreferences: { revision: 0, excludedProductIds: [] } } });
      let lockHeld!: () => void;
      let releaseWriter!: () => void;
      let completionStarted!: () => void;
      const locked = new Promise<void>(resolve => { lockHeld = resolve; });
      const proceed = new Promise<void>(resolve => { releaseWriter = resolve; });
      const started = new Promise<void>(resolve => { completionStarted = resolve; });
      const writer = withDatabaseTransaction(getSql()!, async tx => {
        await tx`select plan_id from public.assessments where plan_id = ${planId}::uuid for no key update`;
        await getAssessmentProductPreferences(tx, planId, true);
        lockHeld();
        await proceed;
        await tx`update public.assessment_product_preferences set revision = 1, excluded_product_ids = ${[randomUUID()]}::uuid[] where plan_id = ${planId}::uuid`;
      });
      await locked;
      const completion = withDatabaseTransaction(getSql()!, tx => {
        completionStarted();
        return applyTaskCompletionResult({ task, taskId: task.id, sql: tx, resultPayload: {} });
      });
      await started;
      releaseWriter();
      await writer;
      assert.deepEqual(await completion, { superseded: true, message: "Product preferences changed; old result was not applied" });
      assert.equal((await getSql()!`select count(*)::int as n from public.product_recommendation_runs where plan_id = ${planId}::uuid`)[0].n, 0);
    }
  });
  it("keeps completed no-purchase results terminal and starts one current copy task for a legacy HealthScore", async () => {
    const planId = await seed(); const generation = (await loadGenerationInput(getSql()!, planId))!;
    await insertFormulationVersion(getSql()!, { planId, generation, modelVersion: "advisory-fixture", formulation: { supplementBreakdown: [], sectionStatuses: { supplements: "ready" } } });
    await getSql()!`insert into public.assessment_healthscore_results (plan_id, revision, locale, generator_version, result)
      values (${planId}::uuid, 1, 'en', 'web-funnel-v1', ${getSql()!.json(completeHealthScoreFixture("en"))})`;
    assert.equal((await getFunnelReadiness(planId))?.copyReady, false);
    await getFunnelReadiness(planId);
    assert.equal((await getSql()!`select count(*)::int as n from public.tasks where plan_id = ${planId}::uuid and task_type = 'analyze_healthscore'`)[0].n, 1);
    await getSql()!`insert into public.assessment_healthscore_results (plan_id, revision, locale, generator_version, result)
      values (${planId}::uuid, 1, 'en', ${FUNNEL_GENERATOR_VERSION}, ${getSql()!.json(completeHealthScoreFixture("en"))})`;
    const readiness = await getFunnelReadiness(planId);
    assert.equal(readiness?.readyForReveal, true); assert.equal(readiness?.status, "formulation_ready");
    for (const products of ["0", "1"]) {
      const response = await getFormulation(new Request(`http://127.0.0.1/api/assessment/${planId}/formulation?locale=en&products=${products}`), { params: Promise.resolve({ planId }) });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.deepEqual(result.supplementBreakdown, []);
      assert.equal(result.generationStatus, "ready");
    }
  });
});
