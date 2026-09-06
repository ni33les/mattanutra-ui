import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { getSql, closeSqlPool, withDatabaseTransaction } from "../lib/db.ts";
import { captureAssessment } from "../lib/assessment-capture.ts";
import { requestHealthScoreDelivery, deliverHealthScore, enqueueReadyHealthScoreDeliveries, healthScoreDeliveryEmail } from "../lib/healthscore-delivery.ts";
import { FUNNEL_GENERATOR_VERSION } from "../lib/assessment-revisions.ts";
import { applyTaskCompletionResult } from "../lib/task-result-applier.ts";
import { getTaskBundle } from "../lib/task-service.ts";
import { completeHealthScoreFixture } from "./fixtures/healthscore.ts";

const databaseUrl = process.env.TEST_DB_URL;
describe("durable HealthScore delivery", { skip: !databaseUrl }, () => {
  const plans: string[] = [];
  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async sql => {
      await sql`set local session_replication_role = replica`;
      for (const id of plans) {
        await sql`delete from public.communication_messages where plan_id = ${id}::uuid`;
        await sql`delete from public.task_events where task_id in (select id from public.tasks where plan_id = ${id}::uuid)`;
        await sql`delete from public.task_comments where task_id in (select id from public.tasks where plan_id = ${id}::uuid)`;
        await sql`delete from public.tasks where plan_id = ${id}::uuid`;
        await sql`delete from public.healthscore_delivery_requests where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_healthscore_results where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_inputs where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_versions where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_version_counters where plan_id = ${id}::uuid`;
        await sql`delete from public.funnel_requests where resource_id = ${id}::uuid`;
        await sql`delete from public.assessments where plan_id = ${id}::uuid`;
      }
    });
    await closeSqlPool();
  });
  async function plan(ready = false) {
    const captured = await captureAssessment({ locale: "en", answers: { firstName: "Private fixture", sex: "male", age: "36-45" }, contactEmail: "stored@funnel-fixture.test" }, { idempotencyKey: randomUUID() });
    plans.push(captured.planId);
    if (ready) await getSql()!`insert into public.assessment_healthscore_results (plan_id, revision, locale, generator_version, result)
      values (${captured.planId}::uuid, ${captured.revision}, 'en', ${FUNNEL_GENERATOR_VERSION}, ${getSql()!.json(completeHealthScoreFixture())})`;
    return captured;
  }
  it("creates no historical promise, persists explicit requests once and queues after matching advice completes", async () => {
    const p = await plan(); const sql = getSql()!;
    assert.equal((await sql`select count(*)::int as n from public.healthscore_delivery_requests where plan_id = ${p.planId}::uuid`)[0].n, 0);
    const requests = await Promise.all([requestHealthScoreDelivery(p.planId, { locale: "en", email: "recipient@funnel-fixture.test" }), requestHealthScoreDelivery(p.planId, { locale: "en", email: "RECIPIENT@funnel-fixture.test" })]);
    assert.equal(requests[0].id, requests[1].id); assert.equal(requests[0].status, "waiting");
    await withDatabaseTransaction(sql, tx => enqueueReadyHealthScoreDeliveries(tx, p.planId, p.revision, "th"));
    assert.equal((await sql`select count(*)::int as n from public.tasks where plan_id = ${p.planId}::uuid and task_type = 'send_healthscore_email'`)[0].n, 0);
    const [taskRow] = await sql`select id from public.tasks where plan_id = ${p.planId}::uuid and task_type = 'analyze_healthscore'`;
    const { task } = await getTaskBundle({ taskId: taskRow.id });
    await withDatabaseTransaction(sql, tx => applyTaskCompletionResult({ task, taskId: task.id, sql: tx, resultPayload: { healthScore: completeHealthScoreFixture() } }));
    assert.equal((await sql`select count(*)::int as n from public.tasks where plan_id = ${p.planId}::uuid and task_type = 'send_healthscore_email'`)[0].n, 1);
    let sends = 0;
    const sink = async (input: { to: string; html: string }) => {
      sends++; assert.equal(input.to, "recipient@funnel-fixture.test"); assert.doesNotMatch(input.html, /Private fixture|36-45|male/);
      assert.match(input.html, /nutrition\/healthscore/);
      assert.equal((await sql`select status from public.healthscore_delivery_requests where id = ${requests[0].id}::uuid`)[0].status, "sending");
      return { sent: true, outcome: "accepted" as const, messageId: "sink-1" };
    };
    assert.equal((await deliverHealthScore(requests[0].id, sink)).status, "sent");
    assert.equal((await deliverHealthScore(requests[0].id, sink)).status, "sent"); assert.equal(sends, 1);
    assert.equal((await sql`select count(*)::int as n from public.communication_messages where plan_id = ${p.planId}::uuid and message_type = 'healthscore_ready' and status = 'sent'`)[0].n, 1);
  });
  it("does not claim success after missing plans, invalid recipients or persistence failure", async () => {
    await assert.rejects(requestHealthScoreDelivery(randomUUID(), { locale: "en", email: "ok@fixture.test" }), { code: "assessment_not_found" });
    await assert.rejects(requestHealthScoreDelivery(randomUUID(), { locale: "en", email: "invalid" }), { code: "invalid_email" });
    const p = await plan();
    await assert.rejects(withDatabaseTransaction(getSql()!, async () => {
      await requestHealthScoreDelivery(p.planId, { locale: "en", email: "rollback@fixture.test" });
      throw new Error("interrupted_save");
    }), /interrupted_save/);
    assert.equal((await getSql()!`select count(*)::int as n from public.healthscore_delivery_requests where plan_id = ${p.planId}::uuid`)[0].n, 0);
  });
  it("bounds definite rejection retries and never automatically resends ambiguous acceptance", async () => {
    const p = await plan(true);
    const definite = await requestHealthScoreDelivery(p.planId, { locale: "en", email: "rejected@fixture.test" });
    let rejected = 0;
    const rejecting = async () => { rejected++; return { sent: false, outcome: "rejected" as const, reason: "Mailbox rejected" }; };
    for (let i = 0; i < 3; i++) await assert.rejects(deliverHealthScore(definite.id, rejecting), /Mailbox rejected/);
    assert.equal((await deliverHealthScore(definite.id, rejecting)).status, "failed"); assert.equal(rejected, 3);
    const ambiguous = await requestHealthScoreDelivery(p.planId, { locale: "en", email: "unknown@fixture.test" });
    let sends = 0;
    const uncertain = async () => { sends++; return { sent: false, outcome: "unknown" as const, reason: "Connection lost after DATA" }; };
    assert.equal((await deliverHealthScore(ambiguous.id, uncertain)).status, "unknown");
    assert.equal((await deliverHealthScore(ambiguous.id, uncertain)).status, "unknown"); assert.equal(sends, 1);
    const crashed = await requestHealthScoreDelivery(p.planId, { locale: "en", email: "crashed@fixture.test" });
    await getSql()!`update public.healthscore_delivery_requests set status = 'sending' where id = ${crashed.id}::uuid`;
    assert.equal((await deliverHealthScore(crashed.id, uncertain)).status, "unknown"); assert.equal(sends, 1);
  });
  it("provides localized links and notification text without questionnaire answers", () => {
    for (const locale of ["en", "th", "zh-CN"] as const) {
      const message = healthScoreDeliveryEmail(locale, "fixture-plan");
      assert.match(message.html, new RegExp(`/${locale}/nutrition/healthscore`));
      assert.ok(message.subject); assert.ok(message.body);
    }
    assert.match(healthScoreDeliveryEmail("zh-CN", "fixture-plan").subject, /你的/);
    assert.match(healthScoreDeliveryEmail("th", "fixture-plan").subject, /ของคุณ/);
  });
});
