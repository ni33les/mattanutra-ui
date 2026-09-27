import { cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { captureAssessment, updateAssessmentContact, retryAssessmentHealthScore } from "../lib/assessment-capture.ts";
import { createAssessmentResumeDraft, getAssessmentResumeDraft } from "../lib/assessment-resume-store.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { createServerQuestionnaireCoordinator } from "../lib/questionnaire/server.ts";
import { createInitialState, fastForwardQuestionnaire, serializeState } from "../lib/questionnaire/engine.ts";
import { whileWriterHeld } from "./helpers/held-writer.ts";

const databaseUrl = process.env.TEST_DB_URL;
assert.ok(databaseUrl, "Assessment capture tests require isolated PostgreSQL");
describe("shared assessment capture on PostgreSQL", () => {
  const plans: string[] = [], payments: string[] = [], keys: string[] = [], drafts: string[] = [];
  const body = { answers: { firstName: "Fixture", age: "36-45", sex: "male", goals: ["energy"] }, locale: "en", intent: "capture" };
  const request = (planId?: string) => { const idempotencyKey = randomUUID(); keys.push(idempotencyKey); return { idempotencyKey, planId }; };
  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
    for (const locale of ["en", "th", "zh-CN"]) await getSql()!`insert into public.site_locales (code, label, native_label, html_lang)
      values (${locale}, ${locale}, ${locale}, ${locale}) on conflict (code) do nothing`;
    await getSql()!`insert into public.organisations (slug, name, organisation_type) values ('mattanutra', 'MattaNutra', 'platform') on conflict do nothing`;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async sql => {
      await sql`set local session_replication_role = replica`;
      await cleanupFixtureRelationships(sql, { planIds: plans });
      for (const id of drafts) await sql`delete from public.assessment_resume_drafts where id = ${id}::uuid`;
      for (const key of keys) await sql`delete from public.funnel_requests where request_key = ${key}`;
      for (const id of payments) {
        await sql`delete from public.payment_versions where payment_id = ${id}::uuid`;
        await sql`delete from public.payments where id = ${id}::uuid`;
      }
      for (const id of plans) {
        await sql`delete from public.task_events where task_id in (select id from public.tasks where plan_id = ${id}::uuid)`;
        await sql`delete from public.task_comments where task_id in (select id from public.tasks where plan_id = ${id}::uuid)`;
        await sql`delete from public.tasks where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_inputs where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_versions where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_version_counters where plan_id = ${id}::uuid`;
        await sql`delete from public.funnel_requests where resource_id = ${id}::uuid`;
        await sql`delete from public.assessments where plan_id = ${id}::uuid`;
      }
    });
    await closeSqlPool();
  });
  it("returns the original capture on replay and contact updates preserve advice, status and tasks", async () => {
    const options = request();
    const first = await captureAssessment(body, options); plans.push(first.planId);
    assert.equal(first.revision, 1);
    assert.deepEqual(await captureAssessment(body, options), first);
    const sql = getSql()!;
    await sql`update public.assessments set status = 'ready', health_score = '{"score":78,"fixtureAdvice":"keep"}' where plan_id = ${first.planId}::uuid`;
    const [before] = await sql`select answers, health_score, status, input_revision from public.assessments where plan_id = ${first.planId}::uuid`;
    const [tasksBefore] = await sql`select count(*)::int as n from public.tasks where plan_id = ${first.planId}::uuid`;
    await updateAssessmentContact(first.planId, "visitor@funnel-fixture.test");
    assert.deepEqual((await sql`select answers, health_score, status, input_revision from public.assessments where plan_id = ${first.planId}::uuid`)[0], before);
    assert.deepEqual((await sql`select count(*)::int as n from public.tasks where plan_id = ${first.planId}::uuid`)[0], tasksBefore);
    await assert.rejects(captureAssessment({ ...body, answers: { ...body.answers, sex: "female" } }, options), { code: "idempotency_conflict" });
    const retry = await retryAssessmentHealthScore(first.planId, "en");
    assert.ok(retry.taskId);
    assert.equal((await retryAssessmentHealthScore(first.planId, "en")).taskId, retry.taskId);
  });
  it("rejects malformed answers, unknown updates and stale edits", async () => {
    await assert.rejects(captureAssessment({ ...body, answers: [] }, request()), { code: "invalid_capture" });
    await assert.rejects(captureAssessment({ ...body, answers: { goals: "energy" } }, request()), { code: "invalid_answers" });
    await assert.rejects(captureAssessment(body, request(randomUUID())), { code: "assessment_not_found" });
    await assert.rejects(updateAssessmentContact(randomUUID(), "visitor@funnel-fixture.test"), { code: "assessment_not_found" });
    await assert.rejects(updateAssessmentContact(randomUUID(), "invalid"), { code: "invalid_email" });
    const first = await captureAssessment(body, request()); plans.push(first.planId);
    await assert.rejects(captureAssessment({ ...body, expectedRevision: 0 }, request(first.planId)), { code: "assessment_changed" });
  });
  it("LOCK-REDUNDANT-03 completed capture replays without locking its receipt or session", async () => {
    const options = request(), first = await captureAssessment(body, options); plans.push(first.planId);
    const result = await whileWriterHeld(getSql()!, tx => tx`select request_key from funnel_requests
      where scope='assessment-capture' and request_key=${options.idempotencyKey} for update`,
    () => captureAssessment(body, options));
    assert.deepEqual(result, first);
    await assert.rejects(captureAssessment({ ...body, answers: { ...body.answers, goals: ["sleep"] } }, options), { code: "idempotency_conflict" });
  });
  it("LOCK-REDUNDANT-05 generation retry uses its immutable revision without an assessment read lock", async () => {
    const first = await captureAssessment(body, request()); plans.push(first.planId);
    const result = await whileWriterHeld(getSql()!, tx => tx`select plan_id from assessments where plan_id=${first.planId} for no key update`,
      () => retryAssessmentHealthScore(first.planId, "en"));
    assert.equal(result.revision, first.revision); assert.ok(result.taskId);
    assert.equal((await retryAssessmentHealthScore(first.planId, "en")).taskId, result.taskId);
  });
  it("LOCK-REDUNDANT-05B recovery cannot overwrite a newer assessment after preparing tasks", async () => {
    const { enqueueNutritionPlanTasks } = await import("../lib/task-worker.ts");
    const first = await captureAssessment(body, request()); plans.push(first.planId);
    const sql = getSql()!;
    await sql`update tasks set status='failed' where plan_id=${first.planId}`;
    await sql.unsafe(`create function public.lock_fixture_newer_assessment() returns trigger language plpgsql as $$ begin
      if new.plan_id='${first.planId}'::uuid and new.task_type='generate_food_gap_guidance' then
        update public.assessments set input_revision=input_revision+1,input_hash='newer-recovery-input',status='ready' where plan_id=new.plan_id;
      end if; return new; end $$`);
    await sql`create trigger lock_fixture_newer_assessment after insert on tasks for each row execute function public.lock_fixture_newer_assessment()`;
    try {
      await assert.rejects(enqueueNutritionPlanTasks({planId:first.planId,plan:"precision",answers:body.answers,locale:"en"}), /Assessment changed during task preparation/);
      const [current] = await sql`select input_revision,status from assessments where plan_id=${first.planId}`;
      assert.equal(Number(current.input_revision),first.revision+1); assert.equal(current.status,"ready");
      assert.equal((await sql`select count(*)::int as n from assessment_versions where plan_id=${first.planId} and reason='plan_selected_tasks_queued'`)[0].n,0);
    } finally { await sql`drop trigger lock_fixture_newer_assessment on tasks`; await sql`drop function public.lock_fixture_newer_assessment()`; }
  });
  it("LOCK-REDUNDANT-05C recovery audit retains the pre-publication snapshot", async () => {
    const { enqueueNutritionPlanTasks } = await import("../lib/task-worker.ts");
    const first = await captureAssessment(body, request()); plans.push(first.planId);
    await enqueueNutritionPlanTasks({planId:first.planId,plan:"precision",answers:body.answers,locale:"en"});
    const [version] = await getSql()!`select snapshot from assessment_versions where plan_id=${first.planId} and reason='plan_selected_tasks_queued' order by version desc limit 1`;
    assert.ok(version); assert.equal(version.snapshot.projectionBefore.status,"captured");
    assert.equal(version.snapshot.projectionPatch.status,"queued");
  });
  it("LOCK-REDUNDANT-05D recovery preserves a plan selected after its input was read", async () => {
    const { enqueueNutritionPlanTasks } = await import("../lib/task-worker.ts");
    const { loadGenerationInput } = await import("../lib/assessment-revisions.ts");
    const first = await captureAssessment(body, request()); plans.push(first.planId);
    const sql = getSql()!, recovery = await loadGenerationInput(sql, first.planId, "en");
    assert.ok(recovery);
    await sql`update assessments set selected_plan='pro' where plan_id=${first.planId}`;
    const before = await sql`select id from tasks where plan_id=${first.planId} order by id`;
    await assert.rejects(enqueueNutritionPlanTasks({planId:first.planId,plan:"precision",answers:body.answers,locale:"en",recovery}), { name:"FunnelError",status:409,code:"assessment_changed" });
    assert.equal((await sql`select selected_plan from assessments where plan_id=${first.planId}`)[0].selected_plan,"pro");
    assert.deepEqual(await sql`select id from tasks where plan_id=${first.planId} order by id`,before);
  });
  it("LOCK-REDUNDANT-05E a changed generation cannot be admitted as an unversioned task", async () => {
    const { loadGenerationInput, withGenerationInput } = await import("../lib/assessment-revisions.ts");
    const { createTask } = await import("../lib/task-service.ts");
    const first = await captureAssessment(body, request()); plans.push(first.planId);
    const sql = getSql()!, generation = await loadGenerationInput(sql, first.planId, "en");
    assert.ok(generation);
    await sql`update assessments set input_revision=input_revision+1,input_hash='new-input' where plan_id=${first.planId}`;
    const before = await sql`select id from tasks where plan_id=${first.planId} order by id`;
    await assert.rejects(withGenerationInput(first.planId,generation,() => createTask({
      planId:first.planId,taskType:"generate_supplement_guidance",title:"Stale recovery",payload:{locale:"en"}
    })), { name:"FunnelError",status:409,code:"assessment_changed" });
    assert.deepEqual(await sql`select id from tasks where plan_id=${first.planId} order by id`,before);
  });
  it("creates only the ID reserved by a valid resume token and preserves payment context", async () => {
    const paymentId = randomUUID(); payments.push(paymentId);
    await getSql()!`insert into public.payments (id, selected_plan, status, amount, paid_at) values (${paymentId}::uuid, 'precision', 'paid', 690000000, now())`;
    const draft = await createAssessmentResumeDraft({ answers: body.answers, contactEmail: "resume@funnel-fixture.test", paymentId, locale: "en" });
    drafts.push(draft.draftId); plans.push(draft.planId);
    assert.equal((await getAssessmentResumeDraft(draft.token))?.paymentId, paymentId);
    const first = await captureAssessment({ ...body, resumeToken: draft.token }, request(draft.planId));
    assert.equal(first.planId, draft.planId);
    assert.equal(first.paymentId, paymentId);
    assert.equal((await getAssessmentResumeDraft(draft.token))?.planId, first.planId, "finalized URLs remain usable");
    const [count] = await getSql()!`select count(*)::int as n from public.assessments`;
    await assert.rejects(captureAssessment({ ...body, paymentId }, request()), { code: "reservation_conflict" });
    assert.equal((await getSql()!`select count(*)::int as n from public.assessments`)[0].n, count.n, "failed binding rolls capture back");
  });
  it("keeps a single assessment if language changes before the capture receipt arrives", async () => {
    const sessionId = randomUUID();
    const a = await captureAssessment({ ...body, sessionId }, request()); plans.push(a.planId);
    const b = await captureAssessment({ ...body, locale: "th", sessionId }, request());
    assert.equal(a.planId, b.planId); assert.equal(a.revision, b.revision);
    await getSql()!`delete from public.funnel_requests where scope = 'assessment-session' and request_key = ${sessionId}`;
  });

  it("server coordinator finalizes without any relative server fetch", async () => {
    const state = fastForwardQuestionnaire(createInitialState({ locale: "en", channel: "agent" })).state;
    const coordinator = createServerQuestionnaireCoordinator({ locale: "en", channel: "agent" }, serializeState(state));
    const result = await coordinator.invoke({ name: "finalize_assessment", args: {} });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(coordinator.state.planId); plans.push(coordinator.state.planId!);
  });
});
