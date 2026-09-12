import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSql, withDatabaseTransaction } from "../../lib/db.ts";
import { recordStripePaymentAccounting, type PaymentRow } from "../../lib/stripe-payments.ts";
import { appendAssessmentVersion } from "../../lib/domain-versions.ts";
export const fx = { currency: "THB", usdRate: 0.031, fxRateId: null, fallbackUsed: false, provider: "fixture", source: "fixture" };
export const rollback = new Error("isolated fixture rollback");
export async function isolated(work: (sql: NonNullable<ReturnType<typeof getSql>>) => Promise<void>) {
  const uri = new URL(process.env.TEST_DB_URL!); assert.equal(uri.hostname, "127.0.0.1"); assert.match(uri.pathname, /^\/mattanutra_lock_review_ax_/);
  await assert.rejects(withDatabaseTransaction(getSql()!, async tx => { await work(tx); throw rollback; }), e => e === rollback);
}
export async function paidFixture(sql: NonNullable<ReturnType<typeof getSql>>, { plan = true, adoption = true, receipt = true, accounting = true } = {}) {
  const id = randomUUID(), planId = plan ? randomUUID() : null;
  if (planId) await sql`insert into assessments(plan_id,locale,status,selected_plan,answers,answer_summary)
    values (${planId}::uuid,'en','ready','precision','{}','{}')`;
  const [p] = await sql<PaymentRow[]>`insert into payments(id,plan_id,selected_plan,status,amount,stripe_mode,stripe_checkout_session_id,paid_at)
    values (${id}::uuid,${planId}::uuid,'precision','paid',690000000,'mock',${`mock_cs_${id}`},now()) returning *`;
  if (accounting) await recordStripePaymentAccounting(sql, p, null, fx);
  if (planId && adoption) {
    await sql`insert into formulations(plan_id,version,formulation,model_version) values (${planId}::uuid,1,'{"supplementBreakdown":[]}','fixture:historical')`;
    await appendAssessmentVersion(sql, { planId, eventType: "plan_selection_projection_update", source: "task_worker", changeReason: "plan_selected_existing_outputs_adopted",
      afterPayload: { selectedPlan: "precision", status: "ready" }, eventPayload: { formulationReady: true } });
  }
  if (receipt) await sql`insert into bpm(event_name,event_type,event_status,emitted_by,plan_id,selected_plan,properties)
    values ('payment_fulfillment_succeeded','payment','paid','stripe_payment_flow',${planId}::uuid,'precision',${sql.json({ paymentId: id })})`;
  return p;
}
