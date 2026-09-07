import { cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { persistAssessmentSubmission } from "../lib/assessment-store.ts";
import { createAssessmentSnapshot } from "../lib/assessment-snapshot.ts";
import { computeHealthScore } from "../lib/health-score.ts";
import { enqueueWebPaymentFulfillment, fulfillWebPayment } from "../lib/web-payment-fulfillment.ts";
import { bindPaidReservationToAssessment, completeMockPayment, createStripeCheckoutSession, type PaymentRow, updatePaymentState } from "../lib/stripe-payments.ts";

const databaseUrl = process.env.TEST_DB_URL;
describe("durable web payment fulfillment on PostgreSQL", { skip: !databaseUrl }, () => {
  const ids: string[] = [], plans: string[] = [], keys: string[] = [];
  const dependencies = {
    session: async () => null,
    rate: async () => ({ currency: "THB", fallbackUsed: false, fxRateId: null, provider: "fixture", source: "fixture", usdRate: 0.03 })
  };
  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1");
    assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
    process.env.MATTANUTRA_ENV = "dev";
    process.env.STRIPE_PAYMENT_MODE = "mock";
    await getSql()!`insert into public.site_locales (code, label, native_label, html_lang)
      values ('en', 'English', 'English', 'en') on conflict (code) do nothing`;
    await getSql()!`insert into public.organisations (slug, name, organisation_type)
      values ('mattanutra', 'MattaNutra', 'platform') on conflict do nothing`;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async sql => {
      await sql`set local session_replication_role = replica`;
      for (const key of keys) await sql`delete from public.funnel_requests where request_key = ${key}`;
      for (const id of ids) {
        await sql`delete from public.finance_transactions where source_ref = ${`stripe:payment:${id}:nominal-revenue`}`;
        await sql`delete from public.payment_versions where payment_id = ${id}::uuid`;
        await sql`delete from public.payments where id = ${id}::uuid`;
      }
      const tasks = await sql`select id from public.tasks where plan_id = any(${plans}::uuid[]) or payload->>'paymentId' = any(${ids})`;
      const taskIds = tasks.map(t => t.id);
      await cleanupFixtureRelationships(sql, { planIds: plans, taskIds });
      await sql`delete from public.task_events where task_id = any(${taskIds}::uuid[])`;
      await sql`delete from public.task_comments where task_id = any(${taskIds}::uuid[])`;
      await sql`delete from public.tasks where id = any(${taskIds}::uuid[])`;
      for (const id of plans) {
        await sql`delete from public.assessment_inputs where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_versions where plan_id = ${id}::uuid`;
        await sql`delete from public.assessment_version_counters where plan_id = ${id}::uuid`;
        await sql`delete from public.assessments where plan_id = ${id}::uuid`;
      }
    });
    await closeSqlPool();
  });
  async function seedPlan() {
    const planId = randomUUID(); plans.push(planId);
    const answers = { firstName: "Fixture", sex: "male", age: "36-45", goals: ["energy"], activity: "light" };
    await persistAssessmentSubmission({ answers, locale: "en", status: "captured", selectedPlan: null,
      snapshot: createAssessmentSnapshot({ planId, healthScore: computeHealthScore(answers, "en") }) });
    return planId;
  }
  async function seedPayment(planId: string | null = null) {
    const id = randomUUID(); ids.push(id);
    const [row] = await getSql()!<PaymentRow[]>`insert into public.payments (id, plan_id, selected_plan, status, amount, paid_at, stripe_mode)
      values (${id}::uuid, ${planId}::uuid, 'precision', 'paid', 690000000, now(), 'test') returning *`;
    return row;
  }
  function newKey() { const key = randomUUID(); keys.push(key); return key; }

  it("rolls confirmation and required task creation back together", async () => {
    const p = await seedPayment();
    await getSql()!`update public.payments set status = 'processing', paid_at = null where id = ${p.id}::uuid`;
    await assert.rejects(withDatabaseTransaction(getSql()!, async tx => {
      const confirmed = await updatePaymentState(tx, { paymentId: p.id, status: "paid", action: "fixture", reason: "fixture" });
      await enqueueWebPaymentFulfillment(tx, confirmed!);
      throw new Error("interrupted_confirmation");
    }), /interrupted_confirmation/);
    const [row] = await getSql()!`select status, fulfillment_status from public.payments where id = ${p.id}::uuid`;
    assert.deepEqual(row, { status: "processing", fulfillment_status: "not_started" });
    assert.equal((await getSql()!`select count(*)::int as n from public.tasks where payload->>'paymentId' = ${p.id}`)[0].n, 0);
  });

  it("rolls accounting and paid access back if plan scheduling fails, then resumes once", async () => {
    const planId = await seedPlan();
    const payment = await seedPayment(planId);
    await withDatabaseTransaction(getSql()!, tx => enqueueWebPaymentFulfillment(tx, payment));
    const sql = getSql()!;
    await sql.unsafe(`create function public.fixture_interrupt_fulfillment() returns trigger language plpgsql as $$ begin
      if new.plan_id = '${planId}'::uuid and new.task_type = 'generate_supplement_guidance' then raise exception 'interrupted_plan_scheduling'; end if;
      return new; end $$`);
    await sql`create trigger fixture_interrupt_fulfillment before insert on public.tasks for each row execute function public.fixture_interrupt_fulfillment()`;
    try {
      await assert.rejects(fulfillWebPayment(payment.id, dependencies), /interrupted_plan_scheduling/);
      assert.equal((await sql`select selected_plan from public.assessments where plan_id = ${planId}::uuid`)[0].selected_plan, null);
      assert.equal((await sql`select count(*)::int as n from public.finance_transactions where source_ref = ${`stripe:payment:${payment.id}:nominal-revenue`}`)[0].n, 0);
      assert.equal((await sql`select status, fulfillment_status from public.payments where id = ${payment.id}::uuid`)[0].status, "paid");
    } finally {
      await sql`drop trigger fixture_interrupt_fulfillment on public.tasks`;
      await sql`drop function public.fixture_interrupt_fulfillment()`;
    }
    await Promise.all([fulfillWebPayment(payment.id, dependencies), fulfillWebPayment(payment.id, dependencies)]);
    await fulfillWebPayment(payment.id, dependencies);
    assert.equal((await sql`select selected_plan from public.assessments where plan_id = ${planId}::uuid`)[0].selected_plan, "precision");
    assert.equal((await sql`select count(*)::int as n from public.finance_transactions where source_ref = ${`stripe:payment:${payment.id}:nominal-revenue`}`)[0].n, 1);
    assert.equal((await sql`select count(*)::int as n from public.tasks where plan_id = ${planId}::uuid and task_type = 'generate_supplement_guidance'`)[0].n, 1);
    assert.equal((await sql`select fulfillment_status from public.payments where id = ${payment.id}::uuid`)[0].fulfillment_status, "complete");
  });

  it("reuses concurrent checkout attempts, preserves request identity and rejects different input", async () => {
    const planId = await seedPlan();
    const key = newKey();
    const input = { locale: "en" as const, planId, selectedPlan: "precision" as const, sourceSurface: "healthscore" as const, idempotencyKey: key };
    const sessions = await Promise.all([createStripeCheckoutSession(input), createStripeCheckoutSession(input), createStripeCheckoutSession({ ...input, idempotencyKey: newKey() })]);
    ids.push(sessions[0].paymentId);
    assert.equal(new Set(sessions.map(s => s.paymentId)).size, 1);
    await assert.rejects(createStripeCheckoutSession({ ...input, selectedPlan: "pro" }), { code: "idempotency_conflict" });
    const completed = await completeMockPayment({ paymentId: sessions[0].paymentId });
    assert.ok(completed?.destination);
    const replay = await createStripeCheckoutSession({ ...input, locale: "th" });
    assert.equal(replay.paymentId, sessions[0].paymentId);
    assert.match(replay.redirectUrl!, /\/th\/.+progress/);
    assert.equal((await getSql()!`select count(*)::int as n from public.tasks where payload->>'paymentId' = ${sessions[0].paymentId} and task_type = 'fulfill_web_payment'`)[0].n, 1);
  });

  it("queues plan fulfillment when an accounted reservation is bound in another locale", async () => {
    const payment = await seedPayment();
    await fulfillWebPayment(payment.id, dependencies);
    const planId = await seedPlan();
    const binding = await bindPaidReservationToAssessment({ paymentId: payment.id, planId, locale: "th" });
    assert.equal(binding?.planId, planId);
    assert.equal(binding?.fulfillmentStatus, "pending");
    await fulfillWebPayment(payment.id, dependencies);
    assert.equal((await getSql()!`select count(*)::int as n from public.finance_transactions where source_ref = ${`stripe:payment:${payment.id}:nominal-revenue`}`)[0].n, 1);
    const otherPlan = await seedPlan();
    assert.equal(await bindPaidReservationToAssessment({ paymentId: payment.id, planId: otherPlan, locale: "en" }), null);
    assert.equal((await getSql()!`select count(*)::int as n from public.tasks where plan_id = ${otherPlan}::uuid`)[0].n, 0);
  });
});
