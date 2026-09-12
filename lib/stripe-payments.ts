import { effectivePayment } from "@/lib/payment-fulfillment-evidence";
import { claimFunnelRequest } from "@/lib/funnel-idempotency";
import { FunnelError } from "@/lib/funnel-errors";
import { enqueueWebPaymentFulfillment } from "@/lib/web-payment-fulfillment";
import { deferUntilDatabaseCommit } from "@/lib/db";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import {
  queuePlatformAdminCommunication,
  upsertCommunicationChannel
} from "@/lib/communications";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import {
  FINANCE_ACCOUNT_IDS,
  recordFinanceTransaction
} from "@/lib/finance-ledger";
import {
  resolveUsdRateForCurrency,
  type ResolvedUsdRate
} from "@/lib/finance-fx";
import { isLocale, type Locale } from "@/lib/i18n";
import { nutritionProgressPath, nutritionQuizPath, nutritionRevealPath } from "@/lib/nutrition-paths";
import { paymentReturnPath, type PaymentSourceSurface } from "@/lib/payment-paths";
import { writePaymentBpmEvent } from "@/lib/payment-bpm";
import { siteBaseUrl } from "@/lib/site-url";
import { assertPaymentSchema } from "@/lib/stripe-payment-schema";
import {
  AMOUNT_MICROS_PER_UNIT,
  STRIPE_MINOR_UNITS_PER_MAJOR,
  SUPPORTED_STRIPE_WEBHOOK_EVENTS,
  amountMicrosFromStripeAmount,
  isStripePriceId,
  paymentPlan,
  stripeLineItemForPlan,
  stripeLocale,
  stripePaymentConfig,
  type CheckoutSessionInput,
  type PaymentProviderMode,
  type StripePaymentConfig,
  type StripeWebhookPayloadShape
} from "@/lib/stripe-payment-config";
import {
  enqueueNutritionPlanTasks,
  enqueuePaymentCheckoutPregenerationTasks,
  PAYMENT_CHECKOUT_PREGENERATION_SOURCE
} from "@/lib/task-worker";
import { textArray } from "@/lib/sql-arrays";
import { validateLeadEmail } from "@/lib/email-validation";

export {
  normalizePaymentPlan,
  normalizePaymentSourceSurface,
  normalizeStripeWebhookPayloadShape,
  paymentPlan,
  stripePaymentConfig,
  stripePublishableKey
} from "@/lib/stripe-payment-config";
export type { StripeWebhookPayloadShape } from "@/lib/stripe-payment-config";

type Db = NonNullable<ReturnType<typeof getSql>>;

export type PaymentStatus =
  | "bound"
  | "cancelled"
  | "checkout_opened"
  | "checkout_session_created"
  | "created"
  | "expired"
  | "failed"
  | "fulfillment_failed"
  | "paid"
  | "processing";

export type PaymentRow = Readonly<{
  fulfillment_status: "not_started" | "pending" | "complete" | "failed";
  fulfillment_completed_at: Date | string | null;
  fulfillment_error: string | null;
  amount: number;
  bound_at: Date | string | null;
  created_at: Date | string;
  currency: string;
  customer_email: string | null;
  customer_email_opted_in: boolean;
  id: string;
  locale: Locale;
  metadata: Record<string, unknown>;
  paid_at: Date | string | null;
  plan_id: string | null;
  selected_plan: AssessmentPlan;
  source_surface: PaymentSourceSurface;
  status: PaymentStatus;
  stripe_checkout_session_id: string | null;
  stripe_customer_id: string | null;
  stripe_mode: PaymentProviderMode;
  stripe_payment_intent_id: string | null;
  stripe_price_id: string | null;
  updated_at: Date | string;
}>;

type PaymentStatePatch = Readonly<{
  action: string;
  actor?: string;
  customerEmail?: string | null;
  expectedStatuses?: readonly PaymentStatus[];
  metadata?: Record<string, unknown>;
  paymentId: string;
  planId?: string | null;
  reason: string;
  status?: PaymentStatus;
  stripeCheckoutSessionId?: string | null;
  stripeCustomerId?: string | null;
  stripePaymentIntentId?: string | null;
  stripePriceId?: string | null;
}>;

let stripeClient: Stripe | null = null;
let stripeClientKey = "";
function stripeClientForConfig(config: StripePaymentConfig) {
  if (stripeClient && stripeClientKey === config.secretKey) {
    return stripeClient;
  }

  stripeClientKey = config.secretKey;
  stripeClient = new Stripe(config.secretKey, { timeout: 15_000, maxNetworkRetries: 1 });

  return stripeClient;
}

async function sqlOrThrow() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database connection is not configured");
  }

  return sql;
}

async function mapPayment(input: PaymentRow) {
  const row = await effectivePayment((await sqlOrThrow()), input);
  return {
    fulfillmentStatus: row.fulfillment_status,
    fulfillmentError: row.fulfillment_error,
    amount: Number(row.amount),
    boundAt: row.bound_at ? new Date(row.bound_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    currency: row.currency,
    customerEmail: row.customer_email,
    customerEmailOptedIn: row.customer_email_opted_in,
    id: row.id,
    locale: row.locale,
    metadata: row.metadata,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    planId: row.plan_id,
    selectedPlan: row.selected_plan,
    sourceSurface: row.source_surface,
    status: row.status,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeMode: row.stripe_mode,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripePriceId: row.stripe_price_id,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

async function getPaymentRowById(sql: Db, paymentId: string) {
  const rows = await sql<PaymentRow[]>`
    select *
    from public.payments
    where id = ${paymentId}::uuid
    limit 1
  `;

  return rows[0] ?? null;
}

async function getPaymentRowBySessionId(sql: Db, sessionId: string) {
  const rows = await sql<PaymentRow[]>`
    select *
    from public.payments
    where stripe_checkout_session_id = ${sessionId}
    limit 1
  `;

  return rows[0] ?? null;
}

async function paymentBpmEventExists(
  sql: Db,
  input: Readonly<{
    eventName: string;
    paymentId: string;
    stripeSessionId?: string | null;
  }>
) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.bpm
      where event_name = ${input.eventName}
        and properties ->> 'paymentId' = ${input.paymentId}
        and (
          ${input.stripeSessionId ?? null}::text is null
          or properties ->> 'stripeSessionId' = ${input.stripeSessionId ?? null}
        )
    ) as exists
  `;

  return rows[0]?.exists === true;
}

async function fulfillMockCheckoutSession(
  sql: Db,
  sessionId: string,
  input: Readonly<{
    request?: Request;
    source: "return_page" | "webhook";
    stripeEventId?: string | null;
  }>
) {
  const payment = await getPaymentRowBySessionId(sql, sessionId);

  if (!payment || payment.stripe_mode !== "mock") {
    throw new Error("Payment record not found for mock checkout session");
  }

  if (input.source === "return_page") {
    void (async () => {
      if (
        await paymentBpmEventExists(sql, {
          eventName: "payment_checkout_returned",
          paymentId: payment.id,
          stripeSessionId: sessionId
        })
      ) {
        return;
      }

      await writePaymentBpmEvent({
        actorType: "visitor",
        eventName: "payment_checkout_returned",
        eventStatus: "received",
        locale: payment.locale,
        paymentId: payment.id,
        planId: payment.plan_id,
        properties: {
          mock: true,
          sourceSurface: payment.source_surface
        },
        request: input.request,
        selectedPlan: payment.selected_plan,
        sql,
        stripeEventId: input.stripeEventId,
        stripeSessionId: sessionId,
        valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
        valueCurrency: payment.currency
      });
    })().catch((error) => {
      console.warn("Mock payment return follow-up failed", error);
    });
  }

  if (payment.status === "expired") {
    return {
      payment: await mapPayment(payment),
      status: "expired" as const
    };
  }

  if (payment.status !== "paid" && payment.status !== "bound") {
    return {
      payment: await mapPayment(payment),
      status: "processing" as const
    };
  }

  await withDatabaseTransaction(sql, tx => enqueueWebPaymentFulfillment(tx, payment));
  return {
    payment: await mapPayment((await getPaymentRowById(sql, payment.id)) ?? payment),
    status: payment.plan_id
      ? ("paid_with_plan" as const)
      : ("paid_reservation" as const)
  };
}

/** Serializes payment state and its append-only audit under the payment row lock. */
export async function updatePaymentState(sql: Db, input: PaymentStatePatch) {
  return withDatabaseTransaction(sql, async sql => {
    const [current] = await sql<PaymentRow[]>`
      select * from public.payments where id = ${input.paymentId}::uuid for update
    `;
    if (!current) return null;
    if (input.expectedStatuses?.length && !input.expectedStatuses.includes(current.status)) return null;
    if (input.planId && current.plan_id && input.planId !== current.plan_id) return null;
    const confirmed = current.status === "paid" || current.status === "bound" || Boolean(current.paid_at);
    if (confirmed && input.status && input.status !== "paid" && input.status !== "bound") return null;
    if (current.status === "bound" && input.status === "paid") return current;
    const metadata = input.metadata ?? {};
    const rows = await sql<PaymentRow[]>`
      with updated_payment as (
        update public.payments
        set
          plan_id = coalesce(${input.planId ?? null}::uuid, plan_id),
          status = coalesce(${input.status ?? null}, status),
          stripe_checkout_session_id = coalesce(${input.stripeCheckoutSessionId ?? null}, stripe_checkout_session_id),
          stripe_payment_intent_id = coalesce(${input.stripePaymentIntentId ?? null}, stripe_payment_intent_id),
          stripe_customer_id = coalesce(${input.stripeCustomerId ?? null}, stripe_customer_id),
          stripe_price_id = coalesce(${input.stripePriceId ?? null}, stripe_price_id),
          customer_email = coalesce(${input.customerEmail ?? null}, customer_email),
          metadata = metadata || ${sql.json(toJsonValue(metadata))}::jsonb,
          paid_at = case
            when ${input.status ?? null} = 'paid' then coalesce(paid_at, now())
            else paid_at
          end,
          bound_at = case
            when ${input.status ?? null} = 'bound' then coalesce(bound_at, now())
            else bound_at
          end,
          updated_at = now()
        where id = ${input.paymentId}::uuid
          and (
            ${input.expectedStatuses ? input.expectedStatuses.length : 0}::int = 0
            or status = any(${textArray(sql, input.expectedStatuses ?? [])}::text[])
          )
        returning *
      ),
      appended_version as (
        insert into public.payment_versions (
          payment_id,
          version,
          action,
          actor,
          reason,
          source,
          plan_id,
          snapshot,
          metadata,
          created_at
        )
        select
          updated_payment.id,
          coalesce((
            select max(payment_versions.version)
            from public.payment_versions
            where payment_versions.payment_id = updated_payment.id
          ), 0) + 1,
          ${input.action},
          ${input.actor ?? "system"},
          ${input.reason},
          'stripe_payments',
          updated_payment.plan_id,
          to_jsonb(updated_payment.*),
          ${sql.json(toJsonValue(metadata))}::jsonb,
          now()
        from updated_payment
        returning payment_id
      )
      select updated_payment.*
      from updated_payment
      join appended_version on appended_version.payment_id = updated_payment.id
    `;

    return rows[0] ?? null;
  });
}

/** Claims a reservation without performing external I/O; joins a caller transaction. */
export async function claimPaidReservation(sql: Db, paymentId: string, planId: string) {
  return withDatabaseTransaction(sql, async tx => {
    const [payment] = await tx<PaymentRow[]>`
      select * from public.payments where id = ${paymentId}::uuid for update
    `;
    if (!payment) return null;
    if (payment.plan_id === planId && (payment.status === "bound" || payment.status === "paid")) {
      return { payment, replayed: true };
    }
    if (payment.plan_id || payment.status !== "paid") return null;
    const bound = await updatePaymentState(tx, {
      paymentId, planId, status: "bound", expectedStatuses: ["paid"],
      action: "payment_reservation_bound", actor: "system", reason: "paid_reservation_bound_to_assessment",
      metadata: { source: "assessment_capture" }
    });
    return bound ? { payment: bound, replayed: false } : null;
  });
}

async function insertPayment(
  sql: Db,
  input: Readonly<{
    config: StripePaymentConfig;
    locale: Locale;
    paymentId: string;
    planId?: string | null;
    selectedPlan: AssessmentPlan;
    sourceSurface: PaymentSourceSurface;
  }>
) {
  const plan = paymentPlan(input.selectedPlan);
  const metadata = {
    mattanutraEnv: input.config.env,
    sourceSurface: input.sourceSurface
  };
  const rows = await sql<PaymentRow[]>`
    with inserted_payment as (
      insert into public.payments (
        id,
        plan_id,
        selected_plan,
        locale,
        source_surface,
        status,
        amount,
        amount_unit,
        currency,
        stripe_mode,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${input.paymentId}::uuid,
        ${input.planId ?? null}::uuid,
        ${input.selectedPlan}::public.assessment_plan,
        ${input.locale},
        ${input.sourceSurface},
        'created',
        ${plan.amountMicros},
        'micros',
        'THB',
        ${input.config.mode},
        ${sql.json(toJsonValue({ mattanutraEnv: input.config.env }))}::jsonb,
        now(),
        now()
      )
      returning *
    ),
    appended_version as (
      insert into public.payment_versions (
        payment_id,
        version,
        action,
        actor,
        reason,
        source,
        plan_id,
        snapshot,
        metadata,
        created_at
      )
      select
        inserted_payment.id,
        1,
        'payment_created',
        'visitor',
        'checkout_requested',
        'stripe_payments',
        inserted_payment.plan_id,
        to_jsonb(inserted_payment.*),
        ${sql.json(toJsonValue(metadata))}::jsonb,
        now()
      from inserted_payment
      returning payment_id
    )
    select inserted_payment.*
    from inserted_payment
    join appended_version on appended_version.payment_id = inserted_payment.id
  `;

  // Revenue is booked only after checkout completes (paid). Open/created
  // sessions must not post countable nominal revenue.
  return rows[0];
}

function paymentCustomerLedgerAccount(payment: PaymentRow) {
  return payment.plan_id
    ? `plan:${payment.plan_id}:customer`
    : `payment:${payment.id}:unbound-customer`;
}

/**
 * Book completed plan sale as nominal revenue (sales recognition).
 * Only call after payment is paid/confirmed — never on create/expire/cancel.
 */
async function recordStripePaymentCompletedRevenue(
  sql: Db,
  payment: PaymentRow,
  metadata: Record<string, unknown> = {},
  fxOverride?: ResolvedUsdRate
) {
  const fx = fxOverride ?? await resolveUsdRateForCurrency(payment.currency, { sql });

  return recordFinanceTransaction({
    amount: payment.amount,
    category: "revenue",
    currency: payment.currency,
    description: `Stripe ${payment.selected_plan} payment`,
    entryType: "nominal",
    from: paymentCustomerLedgerAccount(payment),
    metadata: {
      ...fxMetadata(fx),
      paymentId: payment.id,
      paymentStatus: payment.status,
      planId: payment.plan_id,
      selectedPlan: payment.selected_plan,
      sourceSurface: payment.source_surface,
      stripeCheckoutSessionId: payment.stripe_checkout_session_id,
      stripeCustomerId: payment.stripe_customer_id,
      stripePaymentIntentId: payment.stripe_payment_intent_id,
      ...metadata
    },
    provider: "stripe",
    source: "stripe",
    // Stable source_ref for historical rows that used :nominal-revenue
    sourceRef: `stripe:payment:${payment.id}:nominal-revenue`,
    sql,
    to: "mattanutra:revenue",
    toAccountId: FINANCE_ACCOUNT_IDS.mattanutraRevenue,
    fxRateId: fx.fxRateId,
    usdRate: fx.usdRate
  });
}

/**
 * Remove any prior revenue booking for an abandoned/failed checkout.
 * Failed/expired payments are not accounted for on the ledger — only
 * completed payments keep a nominal revenue row. No "other"/void rows.
 */
async function removeStripePaymentRevenue(sql: Db, payment: PaymentRow) {
  const sourceRef = `stripe:payment:${payment.id}:nominal-revenue`;
  const rows = await sql<Array<{ id: string }>>`
    delete from public.finance_transactions
    where source = 'stripe'
      and source_ref = ${sourceRef}
    returning id::text
  `;

  return rows[0]?.id ?? null;
}

async function queuePlatformPaymentNotification(input: Readonly<{
  eventKey:
    | "platform_payment_failed"
    | "platform_revenue_received";
  metadata?: Record<string, unknown>;
  payment: PaymentRow;
}>) {
  try {
    await queuePlatformAdminCommunication({
      eventKey: input.eventKey,
      metadata: {
        amountMicros: input.payment.amount,
        currency: input.payment.currency,
        paymentId: input.payment.id,
        paymentStatus: input.payment.status,
        planId: input.payment.plan_id,
        selectedPlan: input.payment.selected_plan,
        sourceSurface: input.payment.source_surface,
        stripeCheckoutSessionId: input.payment.stripe_checkout_session_id,
        stripeMode: input.payment.stripe_mode,
        ...input.metadata
      },
      resourceId: input.payment.id,
      resourceType: "payment"
    });
  } catch (error) {
    console.warn("Unable to queue platform payment notification", error);
  }
}

function fxMetadata(rate: ResolvedUsdRate) {
  return {
    fxFallbackUsed: rate.fallbackUsed,
    fxProvider: rate.provider,
    fxRateId: rate.fxRateId,
    fxSource: rate.source,
    usdRate: rate.usdRate
  };
}

function stringId(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;

    return typeof id === "string" ? id : null;
  }

  return null;
}

function sessionCustomerEmail(session: Stripe.Checkout.Session) {
  return (
    session.customer_details?.email ||
    (typeof session.customer_email === "string" ? session.customer_email : "") ||
    ""
  );
}

function paymentIntentFromSession(session: Stripe.Checkout.Session) {
  return typeof session.payment_intent === "object"
    ? session.payment_intent
    : null;
}

function priceIdFromSession(session: Stripe.Checkout.Session) {
  const lineItems = session.line_items?.data ?? [];
  const first = lineItems[0];
  const price = first?.price;

  return price && typeof price === "object" ? price.id : null;
}

export async function recordStripePaymentAccounting(
  sql: Db,
  payment: PaymentRow,
  session: Stripe.Checkout.Session | null,
  fxOverride?: ResolvedUsdRate
) {
  const amountMicros =
    (session ? amountMicrosFromStripeAmount(session.amount_total) : null) ||
    payment.amount;
  const customerId = (session ? stringId(session.customer) : null) ?? payment.stripe_customer_id;
  const checkoutSessionId = session?.id ?? payment.stripe_checkout_session_id ?? `mock:${payment.id}`;
  const paymentIntentId =
    (session ? stringId(session.payment_intent) : null) ??
    payment.stripe_payment_intent_id;

  try {
    await recordStripePaymentCompletedRevenue(sql, payment, {
      accountingBasis: "payment_confirmed",
      amountMicros,
      stripeCheckoutSessionId: checkoutSessionId,
      stripeCustomerId: customerId,
      stripePaymentIntentId: paymentIntentId
    }, fxOverride);

    const intent = session ? paymentIntentFromSession(session) as unknown as {
      latest_charge?: {
        balance_transaction?: {
          fee?: number | null;
          id?: string | null;
        } | string | null;
      } | string | null;
    } | null : null;
    const balanceTransaction =
      intent?.latest_charge &&
      typeof intent.latest_charge === "object" &&
      intent.latest_charge.balance_transaction &&
      typeof intent.latest_charge.balance_transaction === "object"
        ? intent.latest_charge.balance_transaction
        : null;
    const feeMicros = amountMicrosFromStripeAmount(balanceTransaction?.fee);

    if (balanceTransaction?.id && feeMicros) {
      const fx = fxOverride ?? await resolveUsdRateForCurrency(payment.currency, { sql });

      await recordFinanceTransaction({
        amount: feeMicros,
        category: "payment_fee",
        currency: payment.currency,
        description: `Stripe fee for ${payment.selected_plan} payment`,
        entryType: "actual",
        from: "mattanutra:stripe-clearing",
        fromAccountId: FINANCE_ACCOUNT_IDS.stripeClearing,
        metadata: {
          ...fxMetadata(fx),
          accountingBasis: "cash_fee",
          paymentId: payment.id,
          selectedPlan: payment.selected_plan,
          stripeBalanceTransactionId: balanceTransaction.id,
          stripeCheckoutSessionId: checkoutSessionId
        },
        provider: "stripe",
        source: "stripe",
        sourceRef: `stripe:balance_transaction:${balanceTransaction.id}:fee`,
        sql,
        to: "stripe:fees",
        toAccountId: FINANCE_ACCOUNT_IDS.stripe,
        fxRateId: fx.fxRateId,
        usdRate: fx.usdRate
      });
    }

    deferUntilDatabaseCommit(() => {
      void writePaymentBpmEvent({ eventName: "payment_accounting_recorded", eventStatus: "accounting_recorded", paymentId: payment.id,
        planId: payment.plan_id, locale: payment.locale }).catch(() => undefined);
    });
  } catch (error) {
    // The durable fulfillment status records this failure even if telemetry is unavailable.
    throw error;
  }
}

async function recordStripePayoutAccounting(
  sql: Db,
  payout: Stripe.Payout,
  input: Readonly<{
    config: StripePaymentConfig;
    request?: Request;
    stripeEventId?: string | null;
  }>
) {
  const amountMicros = amountMicrosFromStripeAmount(payout.amount);
  const currency = payout.currency?.toUpperCase() || "THB";

  if (!amountMicros || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Stripe payout amount or currency is invalid");
  }

  // Internal Stripe clearing → bank transfer is not customer revenue and is
  // not posted to the sales ledger (avoids category "other" clutter). BPM only.
  await writePaymentBpmEvent({
    actorType: "system",
    eventName: "payment_payout_recorded",
    eventStatus: "payout_recorded",
    properties: {
      amountMicros,
      currency,
      mattanutraEnv: input.config.env,
      stripeMode: input.config.mode,
      stripePayoutId: payout.id,
      stripePayoutStatus: payout.status
    },
    request: input.request,
    severity: "low",
    sql,
    stripeEventId: input.stripeEventId,
    valueAmount: amountMicros / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: currency
  });
}

export async function storeStripeEmail(
  sql: Db,
  payment: PaymentRow,
  email: string | null | undefined
) {
  const validation = validateLeadEmail(email ?? "");

  if (!validation.ok) {
    return;
  }

  if (payment.customer_email?.trim().toLowerCase() !== validation.email.toLowerCase()) {
    await updatePaymentState(sql, {
      action: "customer_email_captured",
      actor: "system",
      customerEmail: validation.email,
      metadata: {
        customerEmailOptedIn: false,
        emailSource: "stripe_checkout",
        transactionalOnly: true
      },
      paymentId: payment.id,
      reason: "stripe_customer_email"
    });
  }

  if (!payment.plan_id) {
    return;
  }

  await upsertCommunicationChannel({
    actorType: "system",
    address: validation.email,
    channelType: "email",
    displayName: "Email",
    metadata: {
      marketingOptIn: false,
      paymentId: payment.id,
      source: "stripe_checkout",
      transactionalOnly: true
    },
    planId: payment.plan_id,
    preferenceRank: 90,
    status: "active"
  });
}

export async function startPaidAssessmentPlan(input: Readonly<{
  locale: Locale;
  paymentId: string;
  planId: string;
  selectedPlan: AssessmentPlan;
  sql: Db;
}>) {
  const rows = await input.sql<Array<{ answers: unknown }>>`
    select answers
    from public.assessments
    where plan_id = ${input.planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Assessment not found for paid plan");
  }

  deferUntilDatabaseCommit(() => {
    void writeBpmEvent({ actorType: "visitor", eventName: "plan_selected", eventType: "plan", locale: input.locale,
      planId: input.planId, selectedPlan: input.selectedPlan, properties: { paymentId: input.paymentId } }).catch(() => undefined);
  });

  await enqueueNutritionPlanTasks({
    answers: row.answers,
    locale: input.locale,
    paymentId: input.paymentId,
    plan: input.selectedPlan,
    planId: input.planId
  });
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function startPaymentCheckoutPregeneration(input: Readonly<{
  payment: PaymentRow;
  request?: Request;
  sql: Db;
}>) {
  const { payment, sql } = input;

  if (!payment.plan_id) {
    return null;
  }

  const existingTaskIds = stringArray(payment.metadata?.pregenerationTaskIds);

  if (existingTaskIds.length > 0) {
    return {
      alreadyStarted: true,
      formulationTaskId: existingTaskIds[0] ?? null
    };
  }

  const rows = await sql<Array<{ answers: unknown; locale: string | null }>>`
    select answers, locale
    from public.assessments
    where plan_id = ${payment.plan_id}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    await writePaymentBpmEvent({
      actorType: "system",
      errorCode: "assessment_not_found",
      errorMessage: "Assessment not found for checkout pregeneration",
      eventName: "payment_pregeneration_failed",
      eventStatus: "pregeneration_failed",
      locale: payment.locale,
      paymentId: payment.id,
      planId: payment.plan_id,
      request: input.request,
      selectedPlan: payment.selected_plan,
      severity: "medium",
      sql,
      stripeSessionId: payment.stripe_checkout_session_id,
      valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: payment.currency
    });

    return null;
  }

  const queued = await enqueuePaymentCheckoutPregenerationTasks({
    answers: row.answers,
    locale: isLocale(row.locale) ? row.locale : payment.locale,
    paymentId: payment.id,
    plan: payment.selected_plan,
    planId: payment.plan_id
  });
  const taskIds = queued?.formulationTaskId ? [queued.formulationTaskId] : [];

  await updatePaymentState(sql, {
    action: "payment_pregeneration_started",
    actor: "system",
    metadata: {
      pregenerationStartedAt: new Date().toISOString(),
      pregenerationStatus: queued?.formulationTaskId ? "queued" : "not_queued",
      pregenerationTaskIds: taskIds,
      source: PAYMENT_CHECKOUT_PREGENERATION_SOURCE
    },
    paymentId: payment.id,
    reason: "checkout_opened_pregeneration",
    status: undefined
  });

  if (
    !(await paymentBpmEventExists(sql, {
      eventName: "payment_pregeneration_started",
      paymentId: payment.id,
      stripeSessionId: payment.stripe_checkout_session_id
    }))
  ) {
    await writePaymentBpmEvent({
      actorType: "system",
      eventName: "payment_pregeneration_started",
      eventStatus: queued?.formulationTaskId ? "pregeneration_queued" : "pregeneration_not_queued",
      locale: payment.locale,
      paymentId: payment.id,
      planId: payment.plan_id,
      properties: {
        formulationTaskId: queued?.formulationTaskId ?? null,
        source: PAYMENT_CHECKOUT_PREGENERATION_SOURCE,
        taskGroupId: queued?.taskGroupId ?? null
      },
      request: input.request,
      selectedPlan: payment.selected_plan,
      sql,
      stripeSessionId: payment.stripe_checkout_session_id,
      valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: payment.currency
    });
  }

  return {
    alreadyStarted: false,
    formulationTaskId: queued?.formulationTaskId ?? null
  };
}

function assertSessionMatchesPayment(
  session: Stripe.Checkout.Session,
  payment: PaymentRow,
  config: StripePaymentConfig
) {
  const metadata = session.metadata ?? {};
  const expectedPlan = payment.selected_plan;
  const expectedPrice = config.priceIds[expectedPlan];
  const plan = paymentPlan(expectedPlan);
  const amountMicros = amountMicrosFromStripeAmount(session.amount_total);
  const sessionPriceId = priceIdFromSession(session) ?? payment.stripe_price_id;

  if (metadata.mattanutraEnv && metadata.mattanutraEnv !== config.env) {
    throw new Error("Stripe session environment does not match this deployment");
  }

  if (metadata.selectedPlan && metadata.selectedPlan !== expectedPlan) {
    throw new Error("Stripe session selected plan does not match payment");
  }

  if (session.currency?.toUpperCase() !== payment.currency) {
    throw new Error("Stripe session currency does not match payment");
  }

  if (sessionPriceId && isStripePriceId(expectedPrice) && sessionPriceId !== expectedPrice) {
    throw new Error("Stripe session price does not match configured plan price");
  }

  if (amountMicros && amountMicros !== plan.amountMicros) {
    throw new Error("Stripe session amount does not match configured plan amount");
  }
}

export async function createStripeCheckoutSession(input: CheckoutSessionInput) {
  const sql = await sqlOrThrow();
  let paymentId: string = randomUUID();
  const requestKey = input.idempotencyKey ?? input.request?.headers.get("Idempotency-Key") ?? "";

  await assertPaymentSchema(sql);

  let config: StripePaymentConfig;

  try {
    config = stripePaymentConfig(input.request);
  } catch (error) {
    await writePaymentBpmEvent({
      actorType: "system",
      errorCode: "stripe_config_error",
      errorMessage:
        error instanceof Error ? error.message : "Stripe configuration is invalid",
      eventName: "payment_config_error",
      eventStatus: "config_error",
      locale: input.locale,
      paymentId,
      request: input.request,
      selectedPlan: input.selectedPlan,
      severity: "critical",
      valueAmount: paymentPlan(input.selectedPlan).amountMicros / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: "THB"
    });
    throw error;
  }

  if (input.planId && !isUuid(input.planId)) {
    throw new Error("Assessment plan not found");
  }

  if (input.planId) {
    const rows = await sql<Array<{ exists: boolean }>>`
      select exists (
        select 1
        from public.assessments
        where plan_id = ${input.planId}::uuid
      ) as exists
    `;

    if (rows[0]?.exists !== true) {
      throw new Error("Assessment plan not found");
    }
  }

  const requestInput = { planId: input.planId ?? null, selectedPlan: input.selectedPlan, mode: config.mode };
  const receipt = await withDatabaseTransaction(sql, tx => claimFunnelRequest(tx, `checkout:${config.env}`, requestKey, requestInput));
  const original = await getPaymentRowById(sql, receipt.resourceId);
  // Expire a deliberately superseded selection before acquiring database locks.
  if (input.planId && !original) {
    const superseded = await sql<Array<{ id: string }>>`select id from public.payments
      where plan_id = ${input.planId}::uuid and selected_plan <> ${input.selectedPlan}
        and status in ('created', 'checkout_session_created', 'checkout_opened', 'processing') and paid_at is null`;
    for (const previous of superseded) await markPaymentCancelled({ paymentId: previous.id, request: input.request });
  }
  const payment = await withDatabaseTransaction(sql, async tx => {
    const receipt = await claimFunnelRequest(tx, `checkout:${config.env}`, requestKey, requestInput);
    paymentId = receipt.resourceId;
    const replay = await getPaymentRowById(tx, paymentId);
    if (replay) return replay;
    if (input.planId) {
      await tx`select plan_id from public.assessments where plan_id = ${input.planId}::uuid for no key update`;
      const [existing] = await tx<PaymentRow[]>`select * from public.payments where plan_id = ${input.planId}::uuid
        and stripe_mode = ${config.mode} and (
          paid_at is not null or status in ('paid', 'bound') or (selected_plan = ${input.selectedPlan} and status in ('created', 'checkout_session_created', 'checkout_opened', 'processing'))
        ) order by (status in ('paid', 'bound')) desc, created_at desc limit 1`;
      if (existing) {
        paymentId = existing.id;
        await tx`update public.funnel_requests set resource_id = ${paymentId}::uuid where scope = ${`checkout:${config.env}`} and request_key = ${requestKey}`;
        return existing;
      }
      const [conflicting] = await tx`select id from public.payments where plan_id = ${input.planId}::uuid
        and selected_plan <> ${input.selectedPlan} and status in ('created', 'checkout_session_created', 'checkout_opened', 'processing') limit 1`;
      if (conflicting) throw new FunnelError("Another checkout selection is active. Please retry.", 409, "checkout_selection_conflict");
    }
    const existing = await getPaymentRowById(tx, paymentId);
    if (existing) return existing;
    return insertPayment(tx, { config, locale: input.locale, paymentId, planId: input.planId, selectedPlan: input.selectedPlan, sourceSurface: input.sourceSurface });
  });
  if (payment.status === "fulfillment_failed" && payment.paid_at && payment.stripe_checkout_session_id) {
    await fulfillCheckoutSession(payment.stripe_checkout_session_id, { source: "return_page", request: input.request });
    return { paymentId, clientSecret: null, mock: config.mode === "mock", publishableKey: config.publishableKey,
      redirectUrl: paymentReturnPath(input.locale, payment.stripe_checkout_session_id) };
  }
  if (payment.status === "paid" || payment.status === "bound") {
    await withDatabaseTransaction(sql, tx => enqueueWebPaymentFulfillment(tx, payment));
    return { paymentId, clientSecret: null, mock: config.mode === "mock", publishableKey: config.publishableKey,
      redirectUrl: payment.plan_id ? nutritionProgressPath(input.locale, payment.plan_id) : nutritionQuizPath(input.locale, undefined, { payment: payment.id }) };
  }
  if (['cancelled', 'expired', 'failed'].includes(payment.status)) {
    throw new FunnelError("This checkout attempt has ended. Start a new attempt.", 409, "checkout_expired");
  }
  if (payment.stripe_checkout_session_id && config.mode !== "mock") {
    const existing = await stripeClientForConfig(config).checkout.sessions.retrieve(payment.stripe_checkout_session_id);
    if (existing.payment_status === "paid") {
      await fulfillCheckoutSession(existing.id, { source: "return_page", request: input.request });
      return { paymentId, clientSecret: null, mock: false, publishableKey: config.publishableKey, redirectUrl: paymentReturnPath(input.locale, existing.id) };
    }
    if (existing.status === "complete") {
      return { paymentId, clientSecret: null, mock: false, publishableKey: config.publishableKey,
        redirectUrl: paymentReturnPath(input.locale, existing.id) };
    }
    if (existing.status !== "open" || !existing.client_secret) {
      await updatePaymentState(sql, { paymentId, status: "expired", action: "checkout_expired", reason: "provider_session_expired",
        expectedStatuses: ["created", "checkout_session_created", "checkout_opened", "processing"] });
      throw new FunnelError("This checkout attempt has ended. Start a new attempt.", 409, "checkout_expired");
    }
    return { paymentId, clientSecret: existing.client_secret, mock: false, publishableKey: config.publishableKey };
  }
  const checkoutRequestedEvent = {
    actorType: "visitor" as const,
    eventName: "payment_checkout_requested" as const,
    eventStatus: "requested" as const,
    locale: input.locale,
    paymentId,
    planId: input.planId,
    properties: {
      mattanutraEnv: config.env,
      sourceSurface: input.sourceSurface
    },
    request: input.request,
    selectedPlan: input.selectedPlan,
    sql,
    valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: payment.currency
  };

  if (config.mode === "mock") {
    const mockSessionId = `mock_cs_${paymentId}`;

    const created = await updatePaymentState(sql, {
      action: "mock_checkout_session_created",
      expectedStatuses: ["created"],
      actor: "system",
      metadata: {
        mock: true,
        stripeMode: config.mode
      },
      paymentId,
      reason: "local_mock_checkout_session_created",
      status: "checkout_session_created",
      stripeCheckoutSessionId: mockSessionId,
      stripePriceId: config.priceIds[input.selectedPlan]
    });

    if (!created) {
      const current = await getPaymentRowById(sql, paymentId);
      if (current?.stripe_checkout_session_id !== mockSessionId) throw new FunnelError("This checkout attempt has ended. Start a new attempt.", 409, "checkout_expired");
    }

    void Promise.all([
      writePaymentBpmEvent(checkoutRequestedEvent),
      writePaymentBpmEvent({
        actorType: "system",
        eventName: "payment_checkout_session_created",
        eventStatus: "checkout_session_created",
        locale: input.locale,
        paymentId,
        planId: input.planId,
        properties: {
          mattanutraEnv: config.env,
          mock: true,
          sourceSurface: input.sourceSurface
        },
        selectedPlan: input.selectedPlan,
        sql,
        stripeSessionId: mockSessionId,
        valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
        valueCurrency: payment.currency
      })
    ]).catch((error) => {
      console.warn("Mock checkout session follow-up failed", error);
    });

    return {
      clientSecret: null,
      mock: true,
      paymentId,
      publishableKey: "",
      returnUrl: paymentReturnPath(input.locale, mockSessionId)
    };
  }

  void writePaymentBpmEvent(checkoutRequestedEvent).catch(() => undefined);

  const stripe = stripeClientForConfig(config);
  const plan = paymentPlan(input.selectedPlan);
  const session = await stripe.checkout.sessions.create({
    client_reference_id: paymentId,
    line_items: [stripeLineItemForPlan(config, input.selectedPlan, input.locale)],
    locale: stripeLocale(input.locale),
    metadata: {
      locale: input.locale,
      mattanutraEnv: config.env,
      paymentId,
      planId: input.planId ?? "",
      selectedPlan: input.selectedPlan,
      sourceSurface: input.sourceSurface
    },
    mode: "payment",
    payment_intent_data: {
      metadata: {
        locale: input.locale,
        mattanutraEnv: config.env,
        paymentId,
        planId: input.planId ?? "",
        selectedPlan: input.selectedPlan,
        sourceSurface: input.sourceSurface
      }
    },
    return_url: `${siteBaseUrl()}${paymentReturnPath(input.locale)}?session_id={CHECKOUT_SESSION_ID}`,
    ui_mode: "embedded_page"
  }, { idempotencyKey: `web-checkout:${config.env}:${paymentId}` });

  if (!session.client_secret) {
    throw new Error("Stripe did not return an embedded Checkout client secret");
  }

  const created = await updatePaymentState(sql, {
    action: "checkout_session_created",
    expectedStatuses: ["created"],
    actor: "system",
    metadata: {
      productDescription: plan.description[input.locale],
      productName: plan.name[input.locale],
      stripeMode: config.mode
    },
    paymentId,
    reason: "stripe_checkout_session_created",
    status: "checkout_session_created",
    stripeCheckoutSessionId: session.id,
    stripePriceId: config.priceIds[input.selectedPlan]
  });

  if (!created) {
    const current = await getPaymentRowById(sql, paymentId);
    if (current?.stripe_checkout_session_id !== session.id) {
      await stripe.checkout.sessions.expire(session.id).catch(async error => {
        const latest = await stripe.checkout.sessions.retrieve(session.id);
        if (latest.payment_status === "paid") await fulfillCheckoutSession(session.id, { source: "return_page", request: input.request });
        else if (latest.status !== "expired") throw error;
      });
      throw new FunnelError("This checkout attempt has ended. Start a new attempt.", 409, "checkout_expired");
    }
  }

  void writePaymentBpmEvent({
    actorType: "system",
    eventName: "payment_checkout_session_created",
    eventStatus: "checkout_session_created",
    locale: input.locale,
    paymentId,
    planId: input.planId,
    properties: {
      mattanutraEnv: config.env,
      sourceSurface: input.sourceSurface
    },
    selectedPlan: input.selectedPlan,
    sql,
    stripeSessionId: session.id,
    valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: payment.currency
  }).catch(() => undefined);

  return {
    mock: false,
    clientSecret: session.client_secret,
    paymentId,
    publishableKey: config.publishableKey
  };
}

export async function markPaymentCheckoutOpened(input: Readonly<{
  paymentId: string;
  request?: Request;
}>) {
  if (!isUuid(input.paymentId)) {
    return null;
  }

  const sql = await sqlOrThrow();

  await assertPaymentSchema(sql);

  const payment = await getPaymentRowById(sql, input.paymentId);

  if (!payment) {
    return null;
  }

  let currentPayment = payment;
  let checkoutOpenedByThisRequest = false;

  if (payment.status === "checkout_session_created") {
    const openedPayment = await updatePaymentState(sql, {
      action: "checkout_opened",
      actor: "visitor",
      expectedStatuses: ["checkout_session_created"],
      paymentId: input.paymentId,
      reason: "embedded_checkout_opened",
      status: "checkout_opened"
    });

    if (openedPayment) {
      currentPayment = openedPayment;
      checkoutOpenedByThisRequest = true;
    } else {
      currentPayment = (await getPaymentRowById(sql, input.paymentId)) ?? payment;
    }
  }

  if (checkoutOpenedByThisRequest) {
    await writePaymentBpmEvent({
      actorType: "visitor",
      eventName: "payment_checkout_opened",
      eventStatus: "checkout_opened",
      locale: currentPayment.locale,
      paymentId: currentPayment.id,
      planId: currentPayment.plan_id,
      properties: {
        sourceSurface: currentPayment.source_surface
      },
      request: input.request,
      selectedPlan: currentPayment.selected_plan,
      sql,
      stripeSessionId: currentPayment.stripe_checkout_session_id,
      valueAmount: currentPayment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: currentPayment.currency
    });
  }

  if (
    checkoutOpenedByThisRequest &&
    currentPayment.plan_id &&
    currentPayment.stripe_mode !== "mock" &&
    !["paid", "bound", "cancelled", "expired", "failed", "fulfillment_failed"].includes(
      currentPayment.status
    )
  ) {
    await startPaymentCheckoutPregeneration({
      payment: currentPayment,
      request: input.request,
      sql
    });
  }

  return await mapPayment((await getPaymentRowById(sql, input.paymentId)) ?? currentPayment);
}

export async function recordPaymentPregenerationProgress(input: Readonly<{
  metadata?: Record<string, unknown>;
  paymentId: string | null;
  status: string;
  taskId?: string | null;
}>) {
  if (!input.paymentId || !isUuid(input.paymentId)) {
    return null;
  }

  const sql = await sqlOrThrow();

  await assertPaymentSchema(sql);

  const payment = await getPaymentRowById(sql, input.paymentId);

  if (!payment) {
    return null;
  }

  const existingTaskIds = stringArray(payment.metadata?.pregenerationTaskIds);
  const taskIds = input.taskId
    ? [...new Set([...existingTaskIds, input.taskId])]
    : existingTaskIds;
  const timestampKey =
    input.status === "completed"
      ? "pregenerationCompletedAt"
      : `${input.status}At`;

  return await mapPayment(await updatePaymentState(sql, {
    action: "payment_pregeneration_progress",
    actor: "system",
    metadata: {
      ...input.metadata,
      [timestampKey]: new Date().toISOString(),
      pregenerationStatus: input.status,
      pregenerationTaskIds: taskIds,
      source: PAYMENT_CHECKOUT_PREGENERATION_SOURCE
    },
    paymentId: input.paymentId,
    reason: "checkout_pregeneration_progress"
  }) ?? payment);
}

export async function markPaymentCancelled(input: Readonly<{
  paymentId: string;
  request?: Request;
}>) {
  if (!isUuid(input.paymentId)) {
    return null;
  }

  const sql = await sqlOrThrow();

  await assertPaymentSchema(sql);

  const before = await getPaymentRowById(sql, input.paymentId);
  if (!before) return null;
  if (before.status === "paid" || before.status === "bound" || before.paid_at) return await mapPayment(before);
  if (before.stripe_mode !== "mock" && before.stripe_checkout_session_id) {
    const stripe = stripeClientForConfig(stripePaymentConfig(input.request));
    let session = await stripe.checkout.sessions.retrieve(before.stripe_checkout_session_id);
    if (session.payment_status === "paid") return (await fulfillCheckoutSession(session.id, { source: "return_page", request: input.request })).payment;
    if (session.status === "open") {
      try { session = await stripe.checkout.sessions.expire(session.id); }
      catch (error) {
        session = await stripe.checkout.sessions.retrieve(session.id);
        if (session.payment_status === "paid") return (await fulfillCheckoutSession(session.id, { source: "return_page", request: input.request })).payment;
        if (session.status !== "expired") throw error;
      }
    }
    if (session.status !== "expired") throw new FunnelError("Payment is still processing", 409, "payment_processing");
  }
  const updated = await withDatabaseTransaction(sql, async tx => {
    const payment = await updatePaymentState(tx, {
      action: "payment_cancelled", actor: "visitor", paymentId: input.paymentId,
      reason: "visitor_cancelled_checkout", status: "cancelled",
      expectedStatuses: ["created", "checkout_session_created", "checkout_opened", "processing", "failed", "expired"],
      metadata: { source: "checkout_cancel_action" }
    });
    if (payment) await removeStripePaymentRevenue(tx, payment);
    return payment;
  });
  if (!updated) {
    const current = await getPaymentRowById(sql, input.paymentId);
    return current ? await mapPayment(current) : null;
  }
  const payment = updated;

  await writePaymentBpmEvent({
    actorType: "visitor",
    eventName: "payment_cancelled",
    eventStatus: "cancelled",
    locale: payment.locale,
    paymentId: payment.id,
    planId: payment.plan_id,
    properties: {
      sourceSurface: payment.source_surface
    },
    request: input.request,
    selectedPlan: payment.selected_plan,
    sql,
    stripeSessionId: payment.stripe_checkout_session_id,
    valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: payment.currency
  });

  return await mapPayment(updated ?? payment);
}

export async function completeMockPayment(input: Readonly<{ paymentId: string; request?: Request }>) {
  if (!isUuid(input.paymentId)) return null;
  const sql = await sqlOrThrow();
  await assertPaymentSchema(sql);
  if (stripePaymentConfig(input.request).mode !== "mock") throw new Error("Mock payment completion is only available in dev mock mode");
  const payment = await withDatabaseTransaction(sql, async tx => {
    const [current] = await tx<PaymentRow[]>`select * from public.payments where id = ${input.paymentId}::uuid for update`;
    if (!current || current.stripe_mode !== "mock") return null;
    const paid = current.status === "paid" || current.status === "bound" ? current : await updatePaymentState(tx, {
      paymentId: current.id, action: "mock_payment_paid", actor: "system", reason: "local_mock_payment_confirmed", status: "paid",
      stripeCustomerId: "mock_customer", stripePaymentIntentId: `mock_pi_${current.id}`, metadata: { mock: true }
    });
    if (!paid) return null;
    await enqueueWebPaymentFulfillment(tx, paid);
    return (await getPaymentRowById(tx, paid.id))!;
  });
  return payment ? { payment: await mapPayment(payment), destination: paymentReturnPath(payment.locale, payment.stripe_checkout_session_id ?? `mock_cs_${payment.id}`) } : null;
}

/** Optional notification/history work runs after durable fulfillment enables paid access. */
export async function notifyWebPaymentFulfilled(payment: PaymentRow) {
  await queuePlatformPaymentNotification({ eventKey: "platform_revenue_received", metadata: { source: "durable_payment_fulfillment" }, payment });
  if (payment.stripe_mode === "mock") {
    const sql = await sqlOrThrow();
    const config = stripePaymentConfig();
    const mockWebhook = await recordMockStripeWebhookLifecycle(sql, { config, payment });
    await markWebhookEventStatus(sql, { paymentId: payment.id, sessionId: mockWebhook.sessionId, status: "processed", stripeEventId: mockWebhook.fatEventId });
    await recordMockStripePayoutLifecycle(sql, { config, payment });
  }
}

async function recordMockStripeWebhookLifecycle(
  sql: Db,
  input: Readonly<{
    config: StripePaymentConfig;
    payment: PaymentRow;
    request?: Request;
  }>
) {
  const sessionId =
    input.payment.stripe_checkout_session_id || `mock_cs_${input.payment.id}`;
  const fatEventId = `mock_evt_${input.payment.id}_checkout_session_completed`;
  const thinEventId = `mock_evt_${input.payment.id}_thin_checkout_session_completed`;
  const basePayload = {
    api_version: "mock",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: sessionId,
        metadata: {
          paymentId: input.payment.id
        },
        object: "checkout.session",
        payment_status: "paid",
        status: "complete"
      }
    },
    livemode: false,
    object: "event",
    type: "checkout.session.completed"
  };

  const fatInserted = await insertMockStripeWebhookEvent(sql, {
    eventType: "checkout.session.completed",
    eventId: fatEventId,
    payload: {
      ...basePayload,
      id: fatEventId
    },
    payloadShape: "fat",
    payment: input.payment,
    sessionId
  });

  if (fatInserted) {
    await writePaymentBpmEvent({
      actorType: "system",
      eventName: "payment_webhook_received",
      eventStatus: "received",
      locale: input.payment.locale,
      paymentId: input.payment.id,
      planId: input.payment.plan_id,
      properties: {
        eventType: "checkout.session.completed",
        mattanutraEnv: input.config.env,
        mock: true,
        payloadShape: "fat",
        source: "local_dev"
      },
      request: input.request,
      selectedPlan: input.payment.selected_plan,
      severity: "low",
      sql,
      stripeEventId: fatEventId,
      stripeSessionId: sessionId,
      valueAmount: input.payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: input.payment.currency
    });
  }

  const thinInserted = await insertMockStripeWebhookEvent(sql, {
    eventType: "checkout.session.completed",
    eventId: thinEventId,
    payload: {
      ...basePayload,
      id: thinEventId
    },
    payloadShape: "thin",
    payment: input.payment,
    sessionId
  });

  if (thinInserted) {
    await markWebhookEventStatus(sql, {
      paymentId: input.payment.id,
      sessionId,
      status: "ignored",
      stripeEventId: thinEventId
    });
    await writePaymentBpmEvent({
      actorType: "system",
      eventName: "payment_webhook_ignored",
      eventStatus: "ignored",
      locale: input.payment.locale,
      paymentId: input.payment.id,
      planId: input.payment.plan_id,
      properties: {
        eventType: "checkout.session.completed",
        mattanutraEnv: input.config.env,
        mock: true,
        payloadShape: "thin",
        reason: "mock_thin_shadow_mode",
        source: "local_dev"
      },
      request: input.request,
      selectedPlan: input.payment.selected_plan,
      severity: "low",
      sql,
      stripeEventId: thinEventId,
      stripeSessionId: sessionId,
      valueAmount: input.payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: input.payment.currency
    });
  }

  return {
    fatEventId,
    sessionId,
    thinEventId
  };
}

async function recordMockStripePayoutLifecycle(
  sql: Db,
  input: Readonly<{
    config: StripePaymentConfig;
    payment: PaymentRow;
    request?: Request;
  }>
) {
  const payoutId = `mock_po_${input.payment.id}`;
  const fatEventId = `mock_evt_${input.payment.id}_payout_paid`;
  const thinEventId = `mock_evt_${input.payment.id}_thin_payout_paid`;
  const payoutPayload = {
    api_version: "mock",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        amount: Math.round(
          (input.payment.amount / AMOUNT_MICROS_PER_UNIT) *
            STRIPE_MINOR_UNITS_PER_MAJOR
        ),
        arrival_date: Math.floor(Date.now() / 1000),
        balance_transaction: `mock_txn_${input.payment.id}`,
        currency: input.payment.currency.toLowerCase(),
        id: payoutId,
        object: "payout",
        status: "paid"
      }
    },
    livemode: false,
    object: "event",
    type: "payout.paid"
  };
  const fatInserted = await insertMockStripeWebhookEvent(sql, {
    eventId: fatEventId,
    eventType: "payout.paid",
    payload: {
      ...payoutPayload,
      id: fatEventId
    },
    payloadShape: "fat",
    payment: input.payment,
    sessionId: input.payment.stripe_checkout_session_id ?? `mock_cs_${input.payment.id}`
  });

  if (fatInserted) {
    await writePaymentBpmEvent({
      actorType: "system",
      eventName: "payment_webhook_received",
      eventStatus: "received",
      locale: input.payment.locale,
      paymentId: input.payment.id,
      planId: input.payment.plan_id,
      properties: {
        eventType: "payout.paid",
        mattanutraEnv: input.config.env,
        mock: true,
        payloadShape: "fat",
        source: "local_dev"
      },
      request: input.request,
      selectedPlan: input.payment.selected_plan,
      severity: "low",
      sql,
      stripeEventId: fatEventId,
      valueAmount: input.payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: input.payment.currency
    });
    await recordStripePayoutAccounting(
      sql,
      payoutPayload.data.object as unknown as Stripe.Payout,
      {
        config: input.config,
        request: input.request,
        stripeEventId: fatEventId
      }
    );
    await markWebhookEventStatus(sql, {
      paymentId: input.payment.id,
      sessionId: input.payment.stripe_checkout_session_id,
      status: "processed",
      stripeEventId: fatEventId
    });
  }

  const thinInserted = await insertMockStripeWebhookEvent(sql, {
    eventId: thinEventId,
    eventType: "payout.paid",
    payload: {
      ...payoutPayload,
      id: thinEventId
    },
    payloadShape: "thin",
    payment: input.payment,
    sessionId: input.payment.stripe_checkout_session_id ?? `mock_cs_${input.payment.id}`
  });

  if (thinInserted) {
    await markWebhookEventStatus(sql, {
      paymentId: input.payment.id,
      sessionId: input.payment.stripe_checkout_session_id,
      status: "ignored",
      stripeEventId: thinEventId
    });
    await writePaymentBpmEvent({
      actorType: "system",
      eventName: "payment_webhook_ignored",
      eventStatus: "ignored",
      locale: input.payment.locale,
      paymentId: input.payment.id,
      planId: input.payment.plan_id,
      properties: {
        eventType: "payout.paid",
        mattanutraEnv: input.config.env,
        mock: true,
        payloadShape: "thin",
        reason: "mock_thin_shadow_mode",
        source: "local_dev"
      },
      request: input.request,
      selectedPlan: input.payment.selected_plan,
      severity: "low",
      sql,
      stripeEventId: thinEventId,
      valueAmount: input.payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: input.payment.currency
    });
  }
}

async function insertMockStripeWebhookEvent(
  sql: Db,
  input: Readonly<{
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    payloadShape: StripeWebhookPayloadShape;
    payment: PaymentRow;
    sessionId: string;
  }>
) {
  const rows = await sql<Array<{ id: string }>>`
    insert into public.stripe_webhook_events (
      stripe_event_id,
      payload_shape,
      stripe_mode,
      event_type,
      payment_id,
      stripe_checkout_session_id,
      status,
      payload,
      received_at
    )
    values (
      ${input.eventId},
      ${input.payloadShape},
      'mock',
      ${input.eventType},
      ${input.payment.id}::uuid,
      ${input.sessionId},
      'received',
      ${sql.json(toJsonValue(input.payload))}::jsonb,
      now()
    )
    on conflict (stripe_event_id) do update set received_at = now()
      where stripe_webhook_events.status in ('received', 'failed')
    returning id::text
  `;

  return Boolean(rows[0]);
}

export async function getPayment(paymentId: string) {
  if (!isUuid(paymentId)) {
    return null;
  }

  const sql = await sqlOrThrow();

  await assertPaymentSchema(sql);

  const payment = await getPaymentRowById(sql, paymentId);

  return payment ? await mapPayment(payment) : null;
}

export async function getLatestPlanPayment(planId: string) {
  if (!isUuid(planId)) {
    return null;
  }

  const sql = await sqlOrThrow();

  await assertPaymentSchema(sql);

  const rows = await sql<PaymentRow[]>`
    select *
    from public.payments
    where plan_id = ${planId}::uuid
    order by created_at desc
    limit 1
  `;

  return rows[0] ? await mapPayment(rows[0]) : null;
}

async function markWebhookEventStatus(
  sql: Db,
  input: Readonly<{
    errorMessage?: string | null;
    paymentId?: string | null;
    sessionId?: string | null;
    status: "failed" | "ignored" | "processed";
    stripeEventId: string;
  }>
) {
  await sql`
    update public.stripe_webhook_events
    set
      payment_id = coalesce(${input.paymentId ?? null}::uuid, payment_id),
      stripe_checkout_session_id = coalesce(${input.sessionId ?? null}, stripe_checkout_session_id),
      status = ${input.status},
      error_message = ${input.errorMessage ?? null},
      processed_at = now()
    where stripe_event_id = ${input.stripeEventId}
  `;
}

export async function recordStripeWebhookEvent(
  sql: Db,
  input: Readonly<{
    config: StripePaymentConfig;
    event: Stripe.Event;
    payloadShape: StripeWebhookPayloadShape;
    sessionId?: string | null;
  }>
) {
  const rows = await sql<Array<{ id: string }>>`
    insert into public.stripe_webhook_events (
      stripe_event_id,
      payload_shape,
      stripe_mode,
      event_type,
      stripe_checkout_session_id,
      status,
      payload,
      received_at
    )
    values (
      ${input.event.id},
      ${input.payloadShape},
      ${input.config.mode},
      ${input.event.type},
      ${input.sessionId ?? null},
      'received',
      ${sql.json(toJsonValue(input.event))}::jsonb,
      now()
    )
    on conflict (stripe_event_id) do update set received_at = now()
      where stripe_webhook_events.status in ('received', 'failed')
    returning id::text
  `;

  return Boolean(rows[0]);
}

function sessionFromEvent(event: Stripe.Event) {
  return event.data.object as Stripe.Checkout.Session;
}

export async function retrievePaidPaymentSession(payment: PaymentRow): Promise<Stripe.Checkout.Session | null> {
  if (payment.stripe_mode === "mock") {
    if (stripePaymentConfig().mode !== "mock") throw new Error("Mock fulfillment is disabled in this environment");
    return null;
  }
  if (!payment.stripe_checkout_session_id) throw new Error("Payment checkout session is missing");
  const config = stripePaymentConfig();
  const session = await stripeClientForConfig(config).checkout.sessions.retrieve(payment.stripe_checkout_session_id, {
    expand: ["line_items.data.price", "payment_intent.latest_charge.balance_transaction"]
  });
  assertSessionMatchesPayment(session, payment, config);
  if (session.payment_status !== "paid") throw new Error("Stripe has not confirmed this payment");
  return session;
}

export async function fulfillCheckoutSession(
  sessionId: string,
  input: Readonly<{ request?: Request; source: "return_page" | "webhook"; stripeEventId?: string | null }>
) {
  const sql = await sqlOrThrow();
  await assertPaymentSchema(sql);
  const config = stripePaymentConfig(input.request);
  if (sessionId.startsWith("mock_cs_")) return fulfillMockCheckoutSession(sql, sessionId, input);
  const session = await stripeClientForConfig(config).checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price", "payment_intent.latest_charge.balance_transaction"]
  });
  const payment = (session.metadata?.paymentId && isUuid(session.metadata.paymentId)
    ? await getPaymentRowById(sql, session.metadata.paymentId) : null) ?? await getPaymentRowBySessionId(sql, sessionId);
  if (!payment) throw new Error("Payment record not found for Stripe session");
  assertSessionMatchesPayment(session, payment, config);
  if (input.source === "return_page") {
    void writePaymentBpmEvent({ eventName: "payment_checkout_returned", eventStatus: "received", paymentId: payment.id,
      planId: payment.plan_id, locale: payment.locale, stripeSessionId: session.id }).catch(() => undefined);
  }
  const current = await withDatabaseTransaction(sql, async tx => {
    let [row] = await tx<PaymentRow[]>`select * from public.payments where id = ${payment.id}::uuid for update`;
    const confirmed = row.status === "paid" || row.status === "bound" || Boolean(row.paid_at);
    if (session.payment_status === "paid") {
      if (row.status !== "paid" && row.status !== "bound") {
        row = await updatePaymentState(tx, {
          paymentId: row.id, action: "payment_paid", actor: "stripe", reason: "stripe_payment_confirmed", status: "paid",
          customerEmail: sessionCustomerEmail(session) || null, stripeCustomerId: stringId(session.customer),
          stripePaymentIntentId: stringId(session.payment_intent), metadata: { source: input.source }
        }) ?? row;
      }
      await enqueueWebPaymentFulfillment(tx, row);
    } else if (!confirmed) {
      const status = session.status === "expired" ? "expired" : "processing";
      if (row.status !== status) row = await updatePaymentState(tx, {
        paymentId: row.id, action: status === "expired" ? "checkout_expired" : "payment_processing",
        actor: "stripe", reason: "stripe_checkout_status", status,
        expectedStatuses: ["created", "checkout_session_created", "checkout_opened", "processing"]
      }) ?? row;
    }
    return (await getPaymentRowById(tx, row.id))!;
  });
  const paid = current.status === "paid" || current.status === "bound";
  void writePaymentBpmEvent({ eventName: paid ? "payment_succeeded" : current.status === "expired" ? "payment_expired" : "payment_processing",
    eventStatus: current.status, paymentId: current.id, planId: current.plan_id, locale: current.locale,
    stripeSessionId: session.id, stripeEventId: input.stripeEventId }).catch(() => undefined);
  return { payment: await mapPayment(current), status: paid
    ? current.plan_id ? "paid_with_plan" as const : "paid_reservation" as const
    : current.status === "expired" ? "expired" as const : "processing" as const };
}

export async function bindPaidReservationToAssessment(input: Readonly<{
  locale: Locale;
  paymentId?: string | null;
  planId: string;
}>) {
  if (!input.paymentId || !isUuid(input.paymentId) || !isUuid(input.planId)) {
    return null;
  }

  const sql = await sqlOrThrow();

  await assertPaymentSchema(sql);

  return withDatabaseTransaction(sql, async tx => {
    const claim = await claimPaidReservation(tx, input.paymentId!, input.planId);
    if (!claim) {
      deferUntilDatabaseCommit(() => {
        void writePaymentBpmEvent({ eventName: "payment_reservation_bind_failed", eventStatus: "failed", paymentId: input.paymentId,
          planId: input.planId, locale: input.locale }).catch(() => undefined);
      });
      return null;
    }
    if (!claim.replayed) {
      await tx`update public.payments set fulfillment_status = 'pending', fulfillment_completed_at = null where id = ${input.paymentId!}::uuid`;
    }
    const payment = { ...claim.payment, ...(!claim.replayed ? { fulfillment_status: "pending" as const } : {}) };
    await enqueueWebPaymentFulfillment(tx, payment);
    return await mapPayment(payment);
  });
}

export async function markStripePaymentFailure(input: Readonly<{
  eventName: "payment_expired" | "payment_failed";
  eventStatus: "expired" | "failed";
  reason: string;
  session?: Stripe.Checkout.Session | null;
  stripeEventId?: string | null;
  stripePaymentIntentId?: string | null;
}>) {
  const sql = await sqlOrThrow();

  await assertPaymentSchema(sql);

  const sessionPaymentId = input.session?.metadata?.paymentId;
  const sessionId = input.session?.id ?? null;
  const rows = sessionPaymentId && isUuid(sessionPaymentId)
    ? await sql<PaymentRow[]>`
        select *
        from public.payments
        where id = ${sessionPaymentId}::uuid
        limit 1
      `
    : input.stripePaymentIntentId
      ? await sql<PaymentRow[]>`
          select *
          from public.payments
          where stripe_payment_intent_id = ${input.stripePaymentIntentId}
          order by created_at desc
          limit 1
        `
      : sessionId
        ? await sql<PaymentRow[]>`
            select *
            from public.payments
            where stripe_checkout_session_id = ${sessionId}
            limit 1
          `
        : [];
  const payment = rows[0];

  if (!payment) {
    return null;
  }

  const updated = await updatePaymentState(sql, {
    action: input.eventName,
    actor: "stripe",
    metadata: {
      failureReason: input.reason
    },
    paymentId: payment.id,
    reason: input.reason,
    status: input.eventStatus
  });
  if (!updated) {
    const current = await getPaymentRowById(sql, payment.id);
    return current ? await mapPayment(current) : null;
  }

  await writePaymentBpmEvent({
    actorType: "system",
    errorCode: input.eventName,
    errorMessage: input.reason,
    eventName: input.eventName,
    eventStatus: input.eventStatus,
    locale: payment.locale,
    paymentId: payment.id,
    planId: payment.plan_id,
    selectedPlan: payment.selected_plan,
    severity: input.eventStatus === "failed" ? "medium" : "low",
    sql,
    stripeEventId: input.stripeEventId,
    stripeSessionId: sessionId,
    valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: payment.currency
  });

  await queuePlatformPaymentNotification({
    eventKey: "platform_payment_failed",
    metadata: {
      failureReason: input.reason,
      stripeEventId: input.stripeEventId,
      stripeSessionId: sessionId
    },
    payment: updated ?? payment
  });

  return updated ? await mapPayment(updated) : await mapPayment(payment);
}

export async function handleStripeWebhookPayload(input: Readonly<{
  payload: string;
  payloadShape: StripeWebhookPayloadShape;
  request?: Request;
  signature: string | null;
}>) {
  const sql = await sqlOrThrow();

  await assertPaymentSchema(sql);

  let config: StripePaymentConfig;

  try {
    config = stripePaymentConfig(input.request);
  } catch (error) {
    await writePaymentBpmEvent({
      actorType: "system",
      errorCode: "stripe_config_error",
      errorMessage:
        error instanceof Error ? error.message : "Stripe configuration is invalid",
      eventName: "payment_config_error",
      eventStatus: "config_error",
      request: input.request,
      severity: "critical",
      sql
    });
    throw error;
  }

  if (!input.signature) {
    await writePaymentBpmEvent({
      actorType: "system",
      errorCode: "stripe_webhook_signature_missing",
      errorMessage: "Stripe webhook signature is missing",
      eventName: "payment_webhook_signature_failed",
      eventStatus: "failed",
      request: input.request,
      severity: "critical",
      sql
    });
    throw new Error("Stripe webhook signature is missing");
  }

  const stripe = stripeClientForConfig(config);
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      input.payload,
      input.signature,
      config.webhookSecrets[input.payloadShape]
    );
  } catch (error) {
    await writePaymentBpmEvent({
      actorType: "system",
      errorCode: "stripe_webhook_signature_failed",
      errorMessage:
        error instanceof Error ? error.message : "Stripe webhook signature failed",
      eventName: "payment_webhook_signature_failed",
      eventStatus: "failed",
      request: input.request,
      severity: "critical",
      sql
    });
    throw error;
  }

  const session =
    input.payloadShape === "fat" && event.type.startsWith("checkout.session.")
      ? sessionFromEvent(event)
      : null;
  const isFresh = await recordStripeWebhookEvent(sql, {
    config,
    event,
    payloadShape: input.payloadShape,
    sessionId: session?.id ?? null
  });

  if (!isFresh) {
    // A processed event may predate durable fulfillment, or a later repair may be unfinished.
    if (session && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const payment = await getPaymentRowBySessionId(sql, session.id);
      if (payment && payment.fulfillment_status !== "complete") {
        await fulfillCheckoutSession(session.id, { request: input.request, source: "webhook", stripeEventId: event.id });
      }
    }
    return { duplicate: true, ok: true };
  }

  try {
    const { getLiveAgenticRuntime } = await import("@/lib/agentic/live-runtime");
    const { tryApplyAgenticStripeEvent } = await import(
      "@/lib/agentic/commerce/stripe-adapter"
    );
    const agentic = await tryApplyAgenticStripeEvent({
      event,
      runtime: getLiveAgenticRuntime(input.request)
    });

    if (agentic) {
      await markWebhookEventStatus(sql, {
        sessionId: session?.id ?? null,
        status: "processed",
        stripeEventId: event.id
      });
      return { ...agentic, duplicate: false };
    }
  } catch {
    // Fall through to the existing nutrition/retail Stripe path.
  }

  await writePaymentBpmEvent({
    actorType: "system",
    eventName: "payment_webhook_received",
    eventStatus: "received",
    paymentId: session?.metadata?.paymentId ?? null,
    properties: {
      eventType: event.type,
      mattanutraEnv: config.env,
      payloadShape: input.payloadShape
    },
    request: input.request,
    severity: "low",
    sql,
    stripeEventId: event.id,
    stripeSessionId: session?.id ?? null
  });

  try {
    if (input.payloadShape === "thin") {
      await markWebhookEventStatus(sql, {
        sessionId: null,
        status: "ignored",
        stripeEventId: event.id
      });
      await writePaymentBpmEvent({
        actorType: "system",
        eventName: "payment_webhook_ignored",
        eventStatus: "ignored",
        paymentId: null,
        properties: {
          eventType: event.type,
          mattanutraEnv: config.env,
          payloadShape: input.payloadShape,
          reason: "thin_webhook_shadow_mode",
          supportedEvents: [...SUPPORTED_STRIPE_WEBHOOK_EVENTS]
        },
        request: input.request,
        severity: "low",
        sql,
        stripeEventId: event.id,
        stripeSessionId: null
      });

      return { duplicate: false, ignored: true, ok: true, payloadShape: input.payloadShape };
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const result = await fulfillCheckoutSession(sessionFromEvent(event).id, {
        request: input.request,
        source: "webhook",
        stripeEventId: event.id
      });

      await markWebhookEventStatus(sql, {
        paymentId: result.payment.id,
        sessionId: result.payment.stripeCheckoutSessionId,
        status: "processed",
        stripeEventId: event.id
      });

      return { duplicate: false, ok: true };
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const failed = await markStripePaymentFailure({
        eventName: "payment_failed",
        eventStatus: "failed",
        reason: "Stripe async payment failed",
        session: sessionFromEvent(event),
        stripeEventId: event.id
      });

      await markWebhookEventStatus(sql, {
        paymentId: failed?.id ?? null,
        sessionId: failed?.stripeCheckoutSessionId ?? session?.id ?? null,
        status: "processed",
        stripeEventId: event.id
      });

      return { duplicate: false, ok: true };
    }

    if (event.type === "checkout.session.expired") {
      const expired = await markStripePaymentFailure({
        eventName: "payment_expired",
        eventStatus: "expired",
        reason: "Stripe checkout session expired",
        session: sessionFromEvent(event),
        stripeEventId: event.id
      });

      await markWebhookEventStatus(sql, {
        paymentId: expired?.id ?? null,
        sessionId: expired?.stripeCheckoutSessionId ?? session?.id ?? null,
        status: "processed",
        stripeEventId: event.id
      });

      return { duplicate: false, ok: true };
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const failed = await markStripePaymentFailure({
        eventName: "payment_failed",
        eventStatus: "failed",
        reason:
          intent.last_payment_error?.message ||
          "Stripe payment intent failed",
        stripeEventId: event.id,
        stripePaymentIntentId: intent.id
      });

      await markWebhookEventStatus(sql, {
        paymentId: failed?.id ?? null,
        sessionId: failed?.stripeCheckoutSessionId ?? null,
        status: "processed",
        stripeEventId: event.id
      });

      return { duplicate: false, ok: true };
    }

    if (event.type === "payout.paid") {
      const payout = event.data.object as Stripe.Payout;

      await recordStripePayoutAccounting(sql, payout, {
        config,
        request: input.request,
        stripeEventId: event.id
      });

      await markWebhookEventStatus(sql, {
        sessionId: null,
        status: "processed",
        stripeEventId: event.id
      });

      return { duplicate: false, ok: true };
    }

    if (event.type === "payout.failed" || event.type === "payout.canceled") {
      const payout = event.data.object as Stripe.Payout;

      await writePaymentBpmEvent({
        actorType: "system",
        errorCode: event.type,
        errorMessage: `Stripe payout ${payout.status || "failed"}`,
        eventName: "payment_payout_failed",
        eventStatus: "failed",
        properties: {
          eventType: event.type,
          mattanutraEnv: config.env,
          stripeMode: config.mode,
          stripePayoutId: payout.id,
          stripePayoutStatus: payout.status
        },
        request: input.request,
        severity: "high",
        sql,
        stripeEventId: event.id
      });

      try {
        await queuePlatformAdminCommunication({
          eventKey: "platform_payout_failed",
          metadata: {
            eventType: event.type,
            mattanutraEnv: config.env,
            stripeEventId: event.id,
            stripeMode: config.mode,
            stripePayoutId: payout.id,
            stripePayoutStatus: payout.status
          },
          resourceId: payout.id,
          resourceType: "stripe_payout"
        });
      } catch (error) {
        console.warn("Unable to queue platform payout notification", error);
      }

      await markWebhookEventStatus(sql, {
        errorMessage: `Stripe payout ${payout.status || "failed"}`,
        sessionId: null,
        status: "processed",
        stripeEventId: event.id
      });

      return { duplicate: false, ok: true };
    }

    await markWebhookEventStatus(sql, {
      sessionId: session?.id ?? null,
      status: "ignored",
      stripeEventId: event.id
    });
    await writePaymentBpmEvent({
      actorType: "system",
      eventName: "payment_webhook_ignored",
      eventStatus: "ignored",
      paymentId: session?.metadata?.paymentId ?? null,
      properties: {
        eventType: event.type,
        mattanutraEnv: config.env,
        payloadShape: input.payloadShape,
        supportedEvents: [...SUPPORTED_STRIPE_WEBHOOK_EVENTS]
      },
      request: input.request,
      severity: "low",
      sql,
      stripeEventId: event.id,
      stripeSessionId: session?.id ?? null
    });

    return { duplicate: false, ignored: true, ok: true };
  } catch (error) {
    await markWebhookEventStatus(sql, {
      errorMessage:
        error instanceof Error ? error.message : "Stripe webhook processing failed",
      sessionId: session?.id ?? null,
      status: "failed",
      stripeEventId: event.id
    });
    throw error;
  }
}

export function paymentReturnDestination(
  locale: Locale,
  payment: Awaited<ReturnType<typeof getPayment>> | null
) {
  if (!payment) {
    return `/${locale}`;
  }

  if (payment.planId) {
    return nutritionRevealPath(locale, payment.planId);
  }

  return nutritionQuizPath(locale, undefined, { payment: payment.id });
}
