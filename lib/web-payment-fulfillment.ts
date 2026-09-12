import { paymentFulfillmentEvidence, paymentFulfillmentIdentity, type PreparedPaymentFulfillment } from "@/lib/payment-fulfillment-evidence";
import type Stripe from "stripe";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { createTask } from "@/lib/task-service";
import { requiredCapabilitiesForWorkTaskType } from "@/lib/system-agents";
import { resolveUsdRateForCurrency, type ResolvedUsdRate } from "@/lib/finance-fx";
import { writePaymentBpmEvent } from "@/lib/payment-bpm";
import {
  recordStripePaymentAccounting, stripePaymentAccountingNeedsFx, retrievePaidPaymentSession, startPaidAssessmentPlan,
  storeStripeEmail, notifyWebPaymentFulfilled, type PaymentRow
} from "@/lib/stripe-payments";

type Db = NonNullable<ReturnType<typeof getSql>>;
export const WEB_PAYMENT_FULFILLMENT_TASK = "fulfill_web_payment";

/** Must share the confirmation/binding transaction. Existing completed work is replayable. */
export async function enqueueWebPaymentFulfillment(sql: Db, payment: PaymentRow, prepared?: PreparedPaymentFulfillment) {
  if (payment.fulfillment_status === "complete") return null;
  if (!["paid", "bound"].includes(payment.status)) throw new Error("Payment is not confirmed");
  if (prepared && prepared.identity !== paymentFulfillmentIdentity(payment)) throw new Error("Payment changed; retry fulfillment preparation");
  const evidence = prepared?.evidence ?? await paymentFulfillmentEvidence(sql, payment);
  if (evidence.status === "complete") return null;
  const admitted = await sql`update public.payments set fulfillment_status = 'pending', fulfillment_error = null
    where id = ${payment.id}::uuid and status in ('paid','bound') and fulfillment_status <> 'complete'
      and plan_id is not distinct from ${payment.plan_id}::uuid
      and selected_plan=${payment.selected_plan}::public.assessment_plan and amount=${String(payment.amount)}::bigint and currency=${payment.currency}
      and stripe_checkout_session_id is not distinct from ${payment.stripe_checkout_session_id}
      and stripe_payment_intent_id is not distinct from ${payment.stripe_payment_intent_id}
      and date_trunc('milliseconds',paid_at) is not distinct from ${payment.paid_at}::timestamptz
      and date_trunc('milliseconds',bound_at) is not distinct from ${payment.bound_at}::timestamptz
    returning id`;
  if (!admitted.length) {
    const [current] = await sql<PaymentRow[]>`select * from public.payments where id=${payment.id}::uuid`;
    if (current && paymentFulfillmentIdentity(current) === paymentFulfillmentIdentity(payment) && current.fulfillment_status === "complete") return null;
    throw new Error("Payment changed; retry fulfillment preparation");
  }
  const { task } = await createTask({
    actorType: "deterministic", title: "Fulfill confirmed web payment", taskType: WEB_PAYMENT_FULFILLMENT_TASK,
    planId: payment.plan_id, payload: { paymentId: payment.id },
    requiredCapabilities: requiredCapabilitiesForWorkTaskType(WEB_PAYMENT_FULFILLMENT_TASK),
    idempotencyKey: `payment:${payment.id}:plan:${payment.plan_id ?? "reservation"}`,
    idempotencyScopeKey: `web-payment:${payment.id}`, idempotencyScope: "active",
    businessValue: 100, reasoningEffort: "none",
    retryPolicy: { maxRetries: 5, initialDelaySeconds: 5, backoffMultiplier: 2, maxDelaySeconds: 300 }
  }, sql);
  return task.id;
}

type FulfillmentDependencies = Readonly<{
  session?: (payment: PaymentRow) => Promise<Stripe.Checkout.Session | null>;
  rate?: (currency: string) => Promise<ResolvedUsdRate>;
}>;

/** Provider/FX reads precede the short atomic accounting + paid-access transaction. */
export async function fulfillWebPayment(paymentId: string, dependencies: FulfillmentDependencies = {}) {
  const sql = getSql();
  if (!sql) throw new Error("Database is not configured");
  const [payment] = await sql<PaymentRow[]>`select * from public.payments where id = ${paymentId}::uuid`;
  if (!payment || !["paid", "bound"].includes(payment.status)) throw new Error("Payment is not confirmed");
  const evidence = await paymentFulfillmentEvidence(sql, payment);
  if (evidence.status === "complete") return { paymentId, fulfillmentStatus: "complete" };

  void writePaymentBpmEvent({ eventName: "payment_fulfillment_started", eventStatus: "pending", paymentId,
    planId: payment.plan_id, locale: payment.locale }).catch(() => undefined);
  try {
    const session = await (dependencies.session ?? retrievePaidPaymentSession)(payment);
    const fx = await stripePaymentAccountingNeedsFx(sql, payment, session)
      ? await (dependencies.rate ?? resolveUsdRateForCurrency)(payment.currency) : undefined;
    const fulfilled = await withDatabaseTransaction(sql, async tx => {
      const [assessment] = payment.plan_id ? await tx`select locale from public.assessments where plan_id = ${payment.plan_id}::uuid for no key update` : [];
      const [current] = await tx<PaymentRow[]>`select * from public.payments where id = ${paymentId}::uuid for update`;
      if (current.fulfillment_status === "complete") return false;
      if (paymentFulfillmentIdentity(current) !== paymentFulfillmentIdentity(payment)) throw new Error("Payment binding or accounting changed; retry fulfillment");
      if (!["paid", "bound"].includes(current.status)) throw new Error("Payment is no longer confirmed");
      await recordStripePaymentAccounting(tx, current, session, fx);
      await storeStripeEmail(tx, current, current.customer_email);
      if (current.plan_id && !evidence.planStarted) {
        await startPaidAssessmentPlan({ sql: tx, locale: assessment?.locale ?? current.locale, paymentId, planId: current.plan_id, selectedPlan: current.selected_plan });
      }
      await tx`update public.payments set fulfillment_status = 'complete', fulfillment_completed_at = now(),
        fulfillment_error = null, updated_at = now() where id = ${paymentId}::uuid`;
      return true;
    });
    if (fulfilled) {
      void writePaymentBpmEvent({ eventName: "payment_fulfillment_succeeded", eventStatus: "paid", paymentId,
        planId: payment.plan_id, locale: payment.locale }).catch(() => undefined);
      void notifyWebPaymentFulfilled(payment).catch(() => undefined);
    }
    return { paymentId, fulfillmentStatus: "complete" };
  } catch (error) {
    await sql`update public.payments set fulfillment_status = 'failed', fulfillment_error = ${error instanceof Error ? error.message : "Fulfillment failed"},
      updated_at = now() where id = ${paymentId}::uuid and plan_id is not distinct from ${payment.plan_id}::uuid
        and selected_plan=${payment.selected_plan}::public.assessment_plan and amount=${String(payment.amount)}::bigint and currency=${payment.currency}
        and stripe_checkout_session_id is not distinct from ${payment.stripe_checkout_session_id}
        and stripe_payment_intent_id is not distinct from ${payment.stripe_payment_intent_id}
        and date_trunc('milliseconds',bound_at) is not distinct from ${payment.bound_at}::timestamptz
        and status in ('paid','bound') and fulfillment_status <> 'complete'`;
    void writePaymentBpmEvent({ eventName: "payment_fulfillment_failed", eventStatus: "failed", paymentId,
      planId: payment.plan_id, locale: payment.locale, errorCode: "fulfillment_failed",
      errorMessage: error instanceof Error ? error.message : "Fulfillment failed" }).catch(() => undefined);
    throw error;
  }
}
