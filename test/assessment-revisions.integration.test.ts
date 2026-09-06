import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { persistAssessmentSubmission } from "../lib/assessment-store.ts";
import { createAssessmentSnapshot } from "../lib/assessment-snapshot.ts";
import { computeHealthScore } from "../lib/health-score.ts";
import { enqueueHealthScoreAnalysisTask } from "../lib/task-worker.ts";
import { getTaskBundle } from "../lib/task-service.ts";
import { generationInput } from "../lib/assessment-revisions.ts";
import { buildTaskWorkItem } from "../lib/task-work-items.ts";
import { applyTaskCompletionResult, applyTaskFailureResult } from "../lib/task-result-applier.ts";
import { insertFormulationVersion } from "../lib/plan-version-writes.ts";
import { claimFunnelRequest, completeFunnelRequest } from "../lib/funnel-idempotency.ts";

const databaseUrl = process.env.TEST_DB_URL;
describe("assessment revisions and atomic generation", { skip: !databaseUrl }, () => {
  const plans: string[] = [];
  const requestScopes: string[] = [];
  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1");
    assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
    await getSql()!`insert into public.site_locales (code, label, native_label, html_lang)
      values ('en', 'English', 'English', 'en') on conflict (code) do nothing`;
    await getSql()!`insert into public.organisations (slug, name, organisation_type)
      values ('mattanutra', 'MattaNutra', 'platform') on conflict do nothing`;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async sql => {
      await sql`set local session_replication_role = replica`;
      for (const scope of requestScopes) await sql`delete from public.funnel_requests where scope = ${scope}`;
      for (const id of plans) {
        await sql`delete from public.task_events where task_id in (select id from public.tasks where plan_id = ${id}::uuid)`;
        await sql`delete from public.task_comments where task_id in (select id from public.tasks where plan_id = ${id}::uuid)`;
        await sql`delete from public.tasks where plan_id = ${id}::uuid`;
        await sql`delete from public.formulations where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_inputs where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_versions where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_version_counters where plan_id = ${id}::uuid`;
        await sql`delete from public.assessments where plan_id = ${id}::uuid`;
      }
    });
    await closeSqlPool();
  });
  function newPlan() { const id = randomUUID(); plans.push(id); return id; }
  const profile = { firstName: "Fixture", sex: "male", age: "36-45", goals: ["energy"], activity: "light" };
  async function capture(planId: string, answers = profile) {
    return persistAssessmentSubmission({ answers, locale: "en", status: "captured", selectedPlan: null,
      snapshot: createAssessmentSnapshot({ planId, healthScore: computeHealthScore(answers, "en") }) });
  }

  it("rolls capture, revision history and queued work back together", async () => {
    const id = newPlan();
    await assert.rejects(withDatabaseTransaction(getSql()!, async () => {
      await capture(id);
      assert.ok(await enqueueHealthScoreAnalysisTask({ planId: id }));
      throw new Error("injected_failure");
    }), /injected_failure/);
    assert.equal((await getSql()!`select count(*)::int as n from public.assessments where plan_id = ${id}::uuid`)[0].n, 0);
    assert.equal((await getSql()!`select count(*)::int as n from public.tasks where plan_id = ${id}::uuid`)[0].n, 0);
  });

  it("reuses active analysis, increments only changed answers, and fences stale success and failure", async () => {
    const id = newPlan();
    assert.equal((await capture(id)).revision, 1);
    const taskId = await enqueueHealthScoreAnalysisTask({ planId: id });
    assert.ok(taskId);
    assert.equal(await enqueueHealthScoreAnalysisTask({ planId: id }), taskId);
    const { task } = await getTaskBundle({ taskId });
    assert.equal(generationInput(task.payload)?.revision, 1);
    assert.equal((await capture(id)).revision, 1);
    assert.equal((await capture(id, { ...profile, activity: "active" })).revision, 2);
    assert.equal((await buildTaskWorkItem(task)).taskType, "superseded_generation");
    await withDatabaseTransaction(getSql()!, async sql => {
      assert.deepEqual(await applyTaskCompletionResult({ task, taskId, sql, resultPayload: {} }), {
        superseded: true, message: "Assessment inputs changed; old result was not applied"
      });
      assert.deepEqual(await applyTaskFailureResult({ task, taskId, sql, resultPayload: {}, errorMessage: "old failure" }), { superseded: true });
    });
    const [row] = await getSql()!`select status, answers from public.assessments where plan_id = ${id}::uuid`;
    assert.equal(row.status, "captured");
    assert.equal(row.answers.activity, "active");
    assert.notEqual(await enqueueHealthScoreAnalysisTask({ planId: id }), taskId);
  });

  it("can retry an ended task with missing advice without reusing its terminal ID", async () => {
    const id = newPlan();
    await capture(id);
    const taskId = await enqueueHealthScoreAnalysisTask({ planId: id });
    await getSql()!`update public.tasks set status = 'completed' where id = ${taskId}::uuid`;
    const retry = await enqueueHealthScoreAnalysisTask({ planId: id });
    assert.ok(retry);
    assert.notEqual(retry, taskId);
  });

  it("records the assessment revision on generated formulation versions", async () => {
    const id = newPlan();
    await capture(id);
    await insertFormulationVersion(getSql()!, { planId: id, formulation: { supplementBreakdown: [] }, modelVersion: "fixture" });
    assert.equal(Number((await getSql()!`select assessment_revision from public.formulations where plan_id = ${id}::uuid`)[0].assessment_revision), 1);
  });

  it("serializes duplicate requests and rejects a reused key with different input", async () => {
    const scope = `fixture:${randomUUID()}`;
    requestScopes.push(scope);
    let executions = 0;
    const submit = () => withDatabaseTransaction(getSql()!, async sql => {
      const receipt = await claimFunnelRequest(sql, scope, "attempt-1", profile);
      if (receipt.response) return receipt.response;
      executions += 1;
      const response = { planId: receipt.resourceId };
      await completeFunnelRequest(sql, scope, "attempt-1", response);
      return response;
    });
    const [a, b] = await Promise.all([submit(), submit()]);
    assert.deepEqual(a, b);
    assert.equal(executions, 1);
    await assert.rejects(withDatabaseTransaction(getSql()!, sql =>
      claimFunnelRequest(sql, scope, "attempt-1", { ...profile, age: "46-55" })
    ), /different input/);
  });
});
