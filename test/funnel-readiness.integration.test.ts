import { cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { persistAssessmentSubmission } from "../lib/assessment-store.ts";
import { createAssessmentSnapshot } from "../lib/assessment-snapshot.ts";
import { computeHealthScore } from "../lib/health-score.ts";
import { getFunnelReadiness } from "../lib/funnel-readiness.ts";
import { FUNNEL_GENERATOR_VERSION, loadGenerationInput, withGenerationInput } from "../lib/assessment-revisions.ts";
import { enqueueHealthScoreAnalysisTask, enqueueNutritionPlanTasks } from "../lib/task-worker.ts";
import { insertFormulationVersion } from "../lib/plan-version-writes.ts";
import { completeHealthScoreFixture } from "./fixtures/healthscore.ts";
import { GET } from "../app/api/assessment/[planId]/formulation/route.ts";
import type { Locale } from "../lib/i18n.ts";

const databaseUrl = process.env.TEST_DB_URL;
describe("shared revision and locale readiness", { skip: !databaseUrl }, () => {
  const plans: string[] = [];
  const answers = { firstName: "Fixture", sex: "male", age: "36-45", goals: ["energy"], activity: "light" };
  before(() => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async sql => {
      await sql`set local session_replication_role = replica`;
      await cleanupFixtureRelationships(sql, { planIds: plans });
      for (const table of ["task_events", "task_comments"]) await sql.unsafe(`delete from public.${table} where task_id in (select id from public.tasks where plan_id = any($1::uuid[]))`, [plans]);
      for (const table of ["tasks", "formulations", "product_recommendation_runs", "assessment_healthscore_results", "payments", "assessment_inputs", "assessment_versions", "assessment_version_counters", "assessments"]) {
        await sql.unsafe(`delete from public.${table} where plan_id = any($1::uuid[])`, [plans]);
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
  async function copy(planId: string, locale: Locale) {
    await getSql()!`insert into public.assessment_healthscore_results (plan_id, revision, locale, generator_version, result)
      values (${planId}::uuid, 1, ${locale}, ${FUNNEL_GENERATOR_VERSION}, ${getSql()!.json(completeHealthScoreFixture(locale))})`;
  }
  async function formula(planId: string, locale: Locale) {
    const generation = (await loadGenerationInput(getSql()!, planId, locale))!;
    await insertFormulationVersion(getSql()!, { planId, generation, modelVersion: "fixture", formulation: {
      supplementBreakdown: [{ supplementId: "fixture", supplement: "Fixture", effectivenessRank: 1, safety: { visibility: "visible" } }],
      sectionStatuses: { supplements: "pending" }
    } });
  }
  async function response(planId: string, products: boolean, locale = "en") {
    return GET(new Request(`http://localhost/api/assessment/${planId}/formulation?locale=${locale}&products=${products ? 1 : 0}`), { params: Promise.resolve({ planId }) });
  }
  it("returns 202 for pending work with and without products, including legacy ready status", async () => {
    const id = await seed();
    await getSql()!`update public.assessments set status = 'ready' where plan_id = ${id}::uuid`;
    for (const products of [false, true]) assert.equal((await response(id, products)).status, 202);
    assert.equal((await getFunnelReadiness(id))!.copyReady, false);
  });
  it("gates on complete localized advice and rejects old revisions", async () => {
    const id = await seed(); await formula(id, "en");
    assert.equal((await response(id, false)).status, 202);
    await copy(id, "en");
    assert.equal((await response(id, false)).status, 200);
    assert.equal((await response(id, true)).status, 200);
    assert.equal((await getFunnelReadiness(id))!.status, "product_matching_pending");
    await getSql()!`insert into public.product_recommendation_runs (catalogue_revision, plan_id, assessment_revision, generation_locale, generator_version)
      values ((select revision from public.catalogue_runtime_revision where singleton=true), ${id}::uuid, 1, 'en', ${FUNNEL_GENERATOR_VERSION})`;
    assert.equal((await getFunnelReadiness(id))!.readyForReveal, true);
    assert.equal((await getFunnelReadiness(id, "th"))!.readyForReveal, false);
    assert.equal((await response(id, true, "th")).status, 202);
    await persistAssessmentSubmission({ answers: { ...answers, activity: "active" }, locale: "en", status: "captured", selectedPlan: "precision",
      snapshot: createAssessmentSnapshot({ planId: id, healthScore: computeHealthScore(answers, "en") }) });
    assert.equal((await getFunnelReadiness(id))!.copyReady, false);
    for (const products of [false, true]) assert.equal((await response(id, products)).status, 202);
  });
  it("uses 409 only for a completed current formula task without a valid result and reports failures", async () => {
    const id = await seed(); await copy(id, "en");
    await enqueueNutritionPlanTasks({ planId: id, plan: "precision", answers, locale: "en" });
    await getSql()!`update public.tasks set status = 'completed' where plan_id = ${id}::uuid and task_type = 'generate_supplement_guidance'`;
    for (const products of [false, true]) assert.equal((await response(id, products)).status, 409);
    await getSql()!`update public.tasks set status = 'failed' where plan_id = ${id}::uuid and task_type = 'generate_supplement_guidance'`;
    assert.equal((await getFunnelReadiness(id))!.failed, true);
    for (const products of [false, true]) assert.equal((await response(id, products)).status, 500);
  });
  it("keeps confirmed payment pending until durable fulfillment finishes", async () => {
    const id = await seed(); await copy(id, "en"); await formula(id, "en");
    await getSql()!`insert into public.payments (id, plan_id, selected_plan, status, fulfillment_status, amount, stripe_mode)
      values (${randomUUID()}::uuid, ${id}::uuid, 'precision', 'paid', 'pending', 690000000, 'test')`;
    assert.equal((await getFunnelReadiness(id))!.fulfillmentStatus, "pending");
    assert.equal((await response(id, false)).status, 202);
    await getSql()!`update public.payments set fulfillment_status = 'failed' where plan_id = ${id}::uuid`;
    assert.equal((await getFunnelReadiness(id))!.failed, true);
  });
  it("retains current free-example previews and defaults to the assessment locale", async () => {
    const id = await seed(); await copy(id, "th");
    await getSql()!`update public.assessments set selected_plan = null, locale = 'th' where plan_id = ${id}::uuid`;
    const generation = (await loadGenerationInput(getSql()!, id, "th"))!;
    await insertFormulationVersion(getSql()!, { planId: id, generation, modelVersion: "fixture:example", formulation: {
      supplementBreakdown: [{ id: "fixture", supplement: "Fixture", effectivenessRank: 1 }]
    } });
    for (const products of [0, 1]) {
      const result = await GET(new Request(`http://localhost/api/assessment/${id}/formulation?products=${products}`), { params: Promise.resolve({ planId: id }) });
      assert.equal(result.status, 200);
      assert.equal((await result.json()).access, "preview");
    }
  });
  it("retains originating locale for follow-up tasks and refuses stale follow-ups", async () => {
    const id = await seed();
    const generation = (await loadGenerationInput(getSql()!, id, "th"))!;
    const taskId = await withGenerationInput(id, generation, () => enqueueHealthScoreAnalysisTask({ planId: id }));
    assert.equal((await getSql()!`select payload #>> '{generation,locale}' as locale from public.tasks where id = ${taskId}::uuid`)[0].locale, "th");
    await persistAssessmentSubmission({ answers: { ...answers, activity: "active" }, locale: "en", status: "captured", selectedPlan: "precision",
      snapshot: createAssessmentSnapshot({ planId: id, healthScore: computeHealthScore(answers, "en") }) });
    assert.equal(await withGenerationInput(id, generation, () => enqueueHealthScoreAnalysisTask({ planId: id })), null);
    assert.equal((await getSql()!`select count(*)::int as n from public.tasks where plan_id = ${id}::uuid`)[0].n, 1);
  });
});
