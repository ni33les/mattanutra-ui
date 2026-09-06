import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { closeSqlPool, getSql, getWorkerSql, withDatabaseTransaction } from "../lib/db.ts";
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
import { completeHealthScoreFixture } from "./fixtures/healthscore.ts";
import { setTimeout as delay } from "node:timers/promises";

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
      values ('en', 'English', 'English', 'en'), ('th', 'Thai', 'ไทย', 'th') on conflict (code) do nothing`;
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
        await sql`delete from public.assessment_healthscore_results where plan_id = ${id}::uuid`;
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
    await assert.rejects(withDatabaseTransaction(getSql()!, async tx => {
      assert.equal(getSql(), tx);
      assert.equal(getWorkerSql(), tx);
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

  it("reuses one active analysis under six concurrent submissions", async () => {
    const id = newPlan();
    await capture(id);
    const ids = await Promise.all(Array.from({ length: 6 }, () => enqueueHealthScoreAnalysisTask({ planId: id })));
    assert.ok(ids.every(Boolean));
    assert.equal(new Set(ids).size, 1);
    const [row] = await getSql()!`select count(*)::int as n from public.tasks where plan_id = ${id}::uuid and task_type = 'analyze_healthscore'`;
    assert.equal(row.n, 1);
  });

  it("serializes overlapping localized completions on the assessment and preserves both results", async () => {
    const id = newPlan();
    await capture(id);
    const enId = (await enqueueHealthScoreAnalysisTask({ planId: id, locale: "en" }))!;
    const thId = (await enqueueHealthScoreAnalysisTask({ planId: id, locale: "th" }))!;
    assert.notEqual(enId, thId);
    const en = (await getTaskBundle({ taskId: enId })).task;
    const th = (await getTaskBundle({ taskId: thId })).task;
    const sql = getSql()!;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let firstWritten!: () => void;
    const entered = new Promise<void>(resolve => { firstWritten = resolve; });
    const first = withDatabaseTransaction(sql, async tx => {
      assert.equal(getSql(), tx);
      assert.equal(getWorkerSql(), tx);
      await applyTaskCompletionResult({ task: en, taskId: enId, sql: tx,
        afterCommit: () => {}, resultPayload: { healthScore: completeHealthScoreFixture("en") } });
      firstWritten();
      await gate;
    });
    await Promise.race([entered, first.then(() => { throw new Error("first completion exited before its barrier"); })]);
    let secondPid!: (pid: number) => void;
    const pidReady = new Promise<number>(resolve => { secondPid = resolve; });
    const second = withDatabaseTransaction(sql, async tx => {
      const [row] = await tx`select pg_backend_pid() as pid`;
      secondPid(row.pid);
      await applyTaskCompletionResult({ task: th, taskId: thId, sql: tx,
        afterCommit: () => {}, resultPayload: { healthScore: completeHealthScoreFixture("th") } });
    });
    try {
      const pid = await Promise.race([pidReady, second.then(() => { throw new Error("second completion exited before acquiring its connection"); })]);
      let blocked = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const [row] = await sql`select cardinality(pg_blocking_pids(${pid})) > 0 as blocked`;
        if (row.blocked) { blocked = true; break; }
        await delay(20);
      }
      assert.equal(blocked, true, "the second completion must wait for the assessment row lock");
      assert.equal((await sql`select count(*)::int as n from public.assessment_healthscore_results where plan_id = ${id}::uuid`)[0].n, 0,
        "uncommitted advice must not be visible to another connection");
    } finally {
      release();
      await Promise.all([first, second]);
    }
    const results = await sql`select locale, revision from public.assessment_healthscore_results where plan_id = ${id}::uuid order by locale`;
    assert.deepEqual(results.map(row => [row.locale, Number(row.revision)]), [["en", 1], ["th", 1]]);
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
