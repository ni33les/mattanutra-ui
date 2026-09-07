import type Stripe from "stripe";
import type postgres from "postgres";
import { FunnelError } from "@/lib/funnel-errors";
import { AMOUNT_MICROS_PER_UNIT, STRIPE_MINOR_UNITS_PER_MAJOR } from "@/lib/stripe-payment-config";

type Db = postgres.Sql | postgres.TransactionSql;
// Stripe may prune idempotency keys after 24 hours; leave an hour of margin.
// https://docs.stripe.com/api/idempotent_requests
const SAFE_PROVIDER_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export type RetailSessionPayment = Readonly<{
  id: string;
  status: string;
  amount: number | string;
  currency: string;
  metadata: unknown;
  paid_at: Date | string | null;
  fulfilled_at: Date | string | null;
  stripe_checkout_session_id: string | null;
}>;
export type RetailSessionProvider = Readonly<{
  create(parameters: Stripe.Checkout.SessionCreateParams, options: { idempotencyKey: string }): Promise<Stripe.Checkout.Session>;
  retrieve(id: string): Promise<Stripe.Checkout.Session>;
}>;

export function retailPaymentConfirmed(payment: RetailSessionPayment) {
  return Boolean(payment.paid_at || payment.fulfilled_at || ["paid", "fulfilled"].includes(payment.status));
}

/** Project provider evidence without allowing a late unpaid response to undo confirmation. */
export async function recordRetailProviderSession<T extends RetailSessionPayment>(
  sql: Db, payment: T, session: Stripe.Checkout.Session
): Promise<T> {
  if (session.metadata?.paymentId && session.metadata.paymentId !== payment.id) {
    throw new FunnelError("Checkout session does not belong to this payment", 409, "payment_session_mismatch");
  }
  if (session.payment_status === "paid" && (
    session.amount_total !== Math.round(Number(payment.amount) / AMOUNT_MICROS_PER_UNIT * STRIPE_MINOR_UNITS_PER_MAJOR) ||
    session.currency?.toUpperCase() !== payment.currency.toUpperCase()
  )) {
    throw new FunnelError("Checkout payment amount does not match the saved quote", 409, "payment_amount_mismatch");
  }
  const [updated] = await sql<T[]>`update public.retail_checkout_payments
    set status = case
        when paid_at is not null or fulfilled_at is not null or status in ('paid', 'fulfilled') then status
        when ${session.payment_status} = 'paid' then 'paid'
        when status in ('failed', 'cancelled', 'expired') then status
        when ${session.status} = 'expired' then 'expired'
        when ${session.status} = 'complete' then 'processing'
        when status in ('checkout_opened', 'processing') then status
        else 'checkout_session_created' end,
      stripe_checkout_session_id = coalesce(stripe_checkout_session_id, ${session.id}),
      stripe_customer_id = coalesce(stripe_customer_id, ${typeof session.customer === "string" ? session.customer : null}),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, ${typeof session.payment_intent === "string" ? session.payment_intent : null}),
      paid_at = case when ${session.payment_status} = 'paid' then coalesce(paid_at, now()) else paid_at end,
      metadata = metadata || '{"stripeSessionAttemptState":"resolved"}'::jsonb,
      updated_at = now()
    where id = ${payment.id}::uuid and (stripe_checkout_session_id is null or stripe_checkout_session_id = ${session.id})
    returning *`;
  if (!updated) throw new FunnelError("Checkout session changed. Resume the current payment.", 409, "payment_session_mismatch");
  return updated;
}

/** Provider I/O is outside transactions. The provider key and parameters survive interruption/replay. */
export async function ensureRetailProviderSession<T extends RetailSessionPayment>(input: Readonly<{
  sql: Db;
  payment: T;
  provider: RetailSessionProvider;
  parameters: Stripe.Checkout.SessionCreateParams;
}>) {
  const { sql, provider } = input;
  const [current] = await sql<T[]>`select * from public.retail_checkout_payments where id = ${input.payment.id}::uuid`;
  if (!current) throw new FunnelError("Payment not found", 404, "payment_not_found");
  if (retailPaymentConfirmed(current)) return { payment: current, session: null };
  let session: Stripe.Checkout.Session;
  if (current.stripe_checkout_session_id) {
    session = await provider.retrieve(current.stripe_checkout_session_id);
  } else {
    // Freeze even presentation fields: retries after locale/config changes must use identical provider parameters.
    const [frozen] = await sql<Array<T & { provider_attempt_clock_ms: number | string }>>`update public.retail_checkout_payments
      set metadata = metadata || jsonb_build_object(
        'stripeSessionParameters', coalesce(metadata->'stripeSessionParameters', ${sql.json(JSON.parse(JSON.stringify(input.parameters)))}::jsonb),
        'stripeSessionFirstAttemptAtMs', case
          when metadata ? 'stripeSessionFirstAttemptAtMs' then metadata->'stripeSessionFirstAttemptAtMs'
          when metadata->>'stripeSessionAttemptState' = 'not_started' and not (metadata ? 'stripeSessionParameters')
            then to_jsonb(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)
          else 'null'::jsonb end,
        'stripeSessionAttemptState', case when metadata->>'stripeSessionAttemptState' = 'reconciliation_required'
          then 'reconciliation_required' else 'started' end), updated_at = now()
      where id = ${current.id}::uuid and paid_at is null and fulfilled_at is null
        and status in ('created', 'checkout_session_created', 'checkout_opened', 'processing')
      returning *, floor(extract(epoch from clock_timestamp()) * 1000)::bigint as provider_attempt_clock_ms`;
    if (!frozen) {
      const [latest] = await sql<T[]>`select * from public.retail_checkout_payments where id = ${current.id}::uuid`;
      if (latest && retailPaymentConfirmed(latest)) return { payment: latest, session: null };
      throw new FunnelError("Checkout expired or was cancelled. Start checkout again.", 409, "checkout_inactive");
    }
    const attempt = frozen.metadata as { stripeSessionParameters: Stripe.Checkout.SessionCreateParams; stripeSessionFirstAttemptAtMs?: unknown };
    const firstAttemptAt = attempt.stripeSessionFirstAttemptAtMs;
    const ageMs = typeof firstAttemptAt === "number" ? Number(frozen.provider_attempt_clock_ms) - firstAttemptAt : Number.NaN;
    if (!Number.isSafeInteger(firstAttemptAt) || !Number.isFinite(ageMs) || ageMs < 0 || ageMs >= SAFE_PROVIDER_RETRY_WINDOW_MS) {
      await sql`update public.retail_checkout_payments
        set metadata = metadata || '{"stripeSessionAttemptState":"reconciliation_required"}'::jsonb, updated_at = now()
        where id = ${current.id}::uuid and stripe_checkout_session_id is null and paid_at is null and fulfilled_at is null`;
      throw new FunnelError(`Payment verification is required before checkout can continue. Contact support with payment reference ${current.id}.`, 409, "checkout_reconciliation_required");
    }
    const parameters = attempt.stripeSessionParameters;
    session = await provider.create(parameters, { idempotencyKey: `retail-checkout:${current.id}:v1` });
  }
  const payment = await recordRetailProviderSession(sql, current, session);
  if (!retailPaymentConfirmed(payment) && ["failed", "cancelled", "expired"].includes(payment.status)) {
    throw new FunnelError("Checkout expired or was cancelled. Start checkout again.", 409, "checkout_inactive");
  }
  return { payment, session };
}
