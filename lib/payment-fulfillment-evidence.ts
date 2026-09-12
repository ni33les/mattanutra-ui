import type postgres from "postgres";
import type { PaymentRow } from "@/lib/stripe-payments";

type Db = postgres.Sql | postgres.TransactionSql;
export type FulfillmentPayment = Pick<PaymentRow, "id" | "plan_id" | "selected_plan" | "status" | "fulfillment_status" |
  "paid_at" | "bound_at" | "created_at" | "currency" | "stripe_checkout_session_id" | "stripe_payment_intent_id"> & { amount: number | string };
export type PaymentFulfillmentEvidence = Readonly<{
  status: PaymentRow["fulfillment_status"];
  accountingRecorded: boolean;
  planStarted: boolean;
  historicalComplete: boolean;
}>;

/** Historical completion is evidence, never a maintenance write or a generator-freshness claim. */
export async function paymentFulfillmentEvidence(sql: Db, payment: FulfillmentPayment): Promise<PaymentFulfillmentEvidence> {
  if (payment.fulfillment_status === "complete") return { status: "complete", accountingRecorded: true, planStarted: Boolean(payment.plan_id), historicalComplete: false };
  if (!["paid", "bound"].includes(payment.status)) return { status: payment.fulfillment_status, accountingRecorded: false, planStarted: false, historicalComplete: false };
  const [facts] = await sql`select
    exists (select 1 from public.finance_transactions f
      where f.source='stripe' and f.source_ref=${`stripe:payment:${payment.id}:nominal-revenue`}
        and f.amount=${String(payment.amount)}::bigint and f.amount_unit='micros' and f.currency=${payment.currency}
        and f.category='revenue' and f.entry_type='nominal' and f.provider='stripe'
        and (f.metadata->>'paymentId' is null or f.metadata->>'paymentId'=${payment.id})
        and (f.metadata->>'stripeCheckoutSessionId' is null or ${payment.stripe_checkout_session_id}::text is null or f.metadata->>'stripeCheckoutSessionId'=${payment.stripe_checkout_session_id})
        and (f.metadata->>'stripePaymentIntentId' is null or ${payment.stripe_payment_intent_id}::text is null or f.metadata->>'stripePaymentIntentId'=${payment.stripe_payment_intent_id})) as accounting,
    exists (select 1 from public.bpm b where b.properties->>'paymentId'=${payment.id}
      and b.event_name='payment_fulfillment_succeeded' and b.event_status='paid'
      and b.plan_id is not distinct from ${payment.plan_id}::uuid and b.selected_plan=${payment.selected_plan}::public.assessment_plan
      and b.occurred_at >= greatest(${payment.paid_at}::timestamptz,${payment.bound_at}::timestamptz,${payment.created_at}::timestamptz)) as completed_receipt,
    exists (select 1 from public.assessments a join public.assessment_versions v on v.plan_id=a.plan_id
      where a.plan_id=${payment.plan_id}::uuid and a.selected_plan=${payment.selected_plan}::public.assessment_plan
        and v.action='plan_selection_projection_update' and v.source='task_worker'
        and v.snapshot #>> '{projectionPatch,selectedPlan}'=${payment.selected_plan}
        and v.created_at >= greatest(${payment.paid_at}::timestamptz,${payment.bound_at}::timestamptz,${payment.created_at}::timestamptz)
        and ((v.metadata->>'formulationReady'='true' and exists (
          select 1 from public.formulations f where f.plan_id=a.plan_id and f.generated_at <= v.created_at
            and (f.model_version is null or f.model_version not like '%:example')))
          or exists (select 1 from public.tasks t where t.id::text=v.metadata->>'formulationTaskId'
            and t.plan_id=a.plan_id and t.task_type='generate_supplement_guidance' and t.created_at <= v.created_at))) as plan_started`;
  const accountingRecorded = facts?.accounting === true;
  const planStarted = facts?.plan_started === true;
  const historicalComplete = accountingRecorded && facts?.completed_receipt === true && (!payment.plan_id || planStarted);
  return { status: historicalComplete ? "complete" : payment.fulfillment_status, accountingRecorded, planStarted, historicalComplete };
}

export async function effectivePayment(sql: Db, payment: PaymentRow): Promise<PaymentRow> {
  const evidence = await paymentFulfillmentEvidence(sql, payment);
  return evidence.status === "complete" && payment.fulfillment_status !== "complete"
    ? { ...payment, fulfillment_status: "complete", fulfillment_error: null }
    : payment;
}
