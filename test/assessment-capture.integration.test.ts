import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { captureAssessment, updateAssessmentContact, retryAssessmentHealthScore } from "../lib/assessment-capture.ts";
import { createAssessmentResumeDraft, getAssessmentResumeDraft } from "../lib/assessment-resume-store.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { createServerQuestionnaireCoordinator } from "../lib/questionnaire/server.ts";
import { createInitialState, fastForwardQuestionnaire, serializeState } from "../lib/questionnaire/engine.ts";

const databaseUrl = process.env.TEST_DB_URL;
describe("shared assessment capture on PostgreSQL", { skip: !databaseUrl }, () => {
  const plans: string[] = [], payments: string[] = [], keys: string[] = [], drafts: string[] = [];
  const body = { answers: { firstName: "Fixture", age: "36-45", sex: "male", goals: ["energy"] }, locale: "en", intent: "capture" };
  const request = (planId?: string) => { const idempotencyKey = randomUUID(); keys.push(idempotencyKey); return { idempotencyKey, planId }; };
  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
    await getSql()!`insert into public.organisations (slug, name, organisation_type) values ('mattanutra', 'MattaNutra', 'platform') on conflict do nothing`;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async sql => {
      await sql`set local session_replication_role = replica`;
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
  it("server coordinator finalizes without any relative server fetch", async () => {
    const state = fastForwardQuestionnaire(createInitialState({ locale: "en", channel: "agent" })).state;
    const coordinator = createServerQuestionnaireCoordinator({ locale: "en", channel: "agent" }, serializeState(state));
    const result = await coordinator.invoke({ name: "finalize_assessment", args: {} });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(coordinator.state.planId); plans.push(coordinator.state.planId!);
  });
});
