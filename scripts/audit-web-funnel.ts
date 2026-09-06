import { getSql, closeSqlPool, withDatabaseTransaction } from "@/lib/db";
import { stripePaymentConfig } from "@/lib/stripe-payment-config";
import { fulfillCheckoutSession, retrievePaidPaymentSession, type PaymentRow } from "@/lib/stripe-payments";
import { enqueueWebPaymentFulfillment } from "@/lib/web-payment-fulfillment";

const repair = process.argv.includes("--repair");
const config = stripePaymentConfig();
if (config.env !== "dev") throw new Error("This audit/repair is restricted to DEV");
const sql = getSql();
if (!sql) throw new Error("DEV database is not configured");
try {
  const [database] = await sql`select current_database() as name`;
  if (!["mattanutra-dev", "mn-dev"].includes(database.name)) throw new Error("Refusing a funnel audit/repair outside the verified DEV database");
  const candidates = await sql<Array<PaymentRow & { has_revenue: boolean; has_plan: boolean }>>`
    select p.*, exists (select 1 from public.finance_transactions f where f.source_ref = 'stripe:payment:' || p.id || ':nominal-revenue') as has_revenue,
      exists (select 1 from public.assessments a where a.plan_id = p.plan_id and a.selected_plan = p.selected_plan) as has_plan
    from public.payments p where (p.status in ('paid','bound') or (p.status = 'fulfillment_failed' and p.paid_at is not null))
      and (p.fulfillment_status <> 'complete'
        or not exists (select 1 from public.finance_transactions f where f.source_ref = 'stripe:payment:' || p.id || ':nominal-revenue')
        or (p.plan_id is not null and not exists (select 1 from public.assessments a where a.plan_id = p.plan_id and a.selected_plan = p.selected_plan)))
    order by p.created_at`;
  const results = [];
  for (const payment of candidates) {
    const finding = { paymentId: payment.id, mode: payment.stripe_mode, status: payment.status,
      fulfillmentStatus: payment.fulfillment_status, missingRevenue: !payment.has_revenue,
      missingPlan: Boolean(payment.plan_id && !payment.has_plan), action: "audit_only", error: undefined as string | undefined };
    if (repair) {
      try {
        // Provider retrieval and existing recorded mock-confirmation evidence only; never creates a charge/session.
        if (payment.stripe_mode === "mock" && (!payment.paid_at || payment.stripe_payment_intent_id !== `mock_pi_${payment.id}`)) {
          throw new Error("Recorded mock confirmation evidence is incomplete");
        }
        await retrievePaidPaymentSession(payment);
        if (payment.status === "fulfillment_failed") {
          if (!payment.stripe_checkout_session_id) throw new Error("Missing provider session evidence");
          await fulfillCheckoutSession(payment.stripe_checkout_session_id, { source: "return_page" });
        } else {
          await withDatabaseTransaction(sql, async tx => {
            const [current] = await tx<PaymentRow[]>`select * from public.payments where id = ${payment.id}::uuid for update`;
            if (!["paid", "bound"].includes(current.status)) throw new Error("Payment state changed during audit");
            await tx`update public.payments set fulfillment_status = 'pending', fulfillment_error = null where id = ${payment.id}::uuid`;
            await enqueueWebPaymentFulfillment(tx, { ...current, fulfillment_status: "pending" });
          });
        }
        finding.action = "verified_fulfillment_queued";
      } catch (error) { finding.action = "unverified_or_failed_no_repair"; finding.error = error instanceof Error ? error.message : "Verification failed"; }
    }
    results.push(finding);
  }
  const backlog = await sql`select task_type, status, count(*)::int as count from public.tasks
    where task_type in ('fulfill_web_payment','send_healthscore_email','analyze_healthscore','generate_supplement_guidance','generate_product_recommendations')
      and status not in ('completed','cancelled','skipped') group by task_type, status order by task_type, status`;
  const deliveries = await sql`select status, count(*)::int as count from public.healthscore_delivery_requests group by status order by status`;
  const polling = await sql`select properties->>'outcome' as outcome, count(*)::int as count from public.bpm
    where event_name = 'funnel_poll_recovery' and occurred_at > now() - interval '24 hours'
    group by properties->>'outcome' order by outcome`;
  console.log(JSON.stringify({ environment: config.env, mode: config.mode, repair, candidates: results, backlog, deliveries, pollingLast24Hours: polling }, null, 2));
} finally { await closeSqlPool(); }
