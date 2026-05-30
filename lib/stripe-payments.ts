import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import {
  upsertCommunicationChannel
} from "@/lib/communications";
import { getSql } from "@/lib/db";
import {
  FINANCE_ACCOUNT_IDS,
  recordFinanceTransaction
} from "@/lib/finance-ledger";
import { isLocale, type Locale } from "@/lib/i18n";
import { nutritionQuizPath, nutritionRevealPath } from "@/lib/nutrition-paths";
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
  thbUsdRate,
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

type PaymentRow = Readonly<{
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
  stripeClient = new Stripe(config.secretKey);

  return stripeClient;
}

async function sqlOrThrow() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database connection is not configured");
  }

  return sql;
}

async function recordPaymentVersion(
  sql: Db,
  input: Readonly<{
    action: string;
    actor: string;
    metadata?: Record<string, unknown>;
    paymentId: string;
    reason: string;
    source: string;
  }>
) {
  await sql`
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
      payments.id,
      coalesce((
        select max(version)
        from public.payment_versions
        where payment_id = payments.id
      ), 0) + 1,
      ${input.action},
      ${input.actor},
      ${input.reason},
      ${input.source},
      payments.plan_id,
      to_jsonb(payments.*),
      ${sql.json(toJsonValue(input.metadata ?? {}))}::jsonb,
      now()
    from public.payments payments
    where payments.id = ${input.paymentId}::uuid
  `;
}

function mapPayment(row: PaymentRow) {
  return {
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

async function updatePaymentState(
  sql: Db,
  input: PaymentStatePatch
) {
  const metadata = input.metadata ?? {};
  const rows = await sql<PaymentRow[]>`
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
    returning *
  `;
  const payment = rows[0] ?? null;

  if (payment) {
    await recordPaymentVersion(sql, {
      action: input.action,
      actor: input.actor ?? "system",
      metadata,
      paymentId: input.paymentId,
      reason: input.reason,
      source: "stripe_payments"
    });
  }

  return payment;
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
  const rows = await sql<PaymentRow[]>`
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
  `;

  await recordPaymentVersion(sql, {
    action: "payment_created",
    actor: "visitor",
    metadata: {
      mattanutraEnv: input.config.env,
      sourceSurface: input.sourceSurface
    },
    paymentId: input.paymentId,
    reason: "checkout_requested",
    source: "stripe_payments"
  });

  if (rows[0]) {
    await recordStripePaymentNominalRevenue(sql, rows[0], {
      accountingBasis: "payment_created",
      mattanutraEnv: input.config.env,
      sourceSurface: input.sourceSurface,
      stripeMode: input.config.mode
    });
  }

  return rows[0];
}

function paymentCustomerLedgerAccount(payment: PaymentRow) {
  return payment.plan_id
    ? `plan:${payment.plan_id}:customer`
    : `payment:${payment.id}:unbound-customer`;
}

async function recordStripePaymentNominalRevenue(
  sql: Db,
  payment: PaymentRow,
  metadata: Record<string, unknown> = {}
) {
  return recordFinanceTransaction({
    amount: payment.amount,
    category: "revenue",
    currency: payment.currency,
    description: `Nominal Stripe ${payment.selected_plan} payment`,
    entryType: "nominal",
    from: paymentCustomerLedgerAccount(payment),
    metadata: {
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
    sourceRef: `stripe:payment:${payment.id}:nominal-revenue`,
    sql,
    to: "mattanutra:revenue",
    toAccountId: FINANCE_ACCOUNT_IDS.mattanutraRevenue,
    usdRate: thbUsdRate()
  });
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

async function recordStripePaymentAccounting(
  sql: Db,
  payment: PaymentRow,
  session: Stripe.Checkout.Session | null
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
    await recordStripePaymentNominalRevenue(sql, payment, {
      accountingBasis: "payment_confirmed",
      amountMicros,
      stripeCheckoutSessionId: checkoutSessionId,
      stripeCustomerId: customerId,
      stripePaymentIntentId: paymentIntentId
    });

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
      await recordFinanceTransaction({
        amount: feeMicros,
        category: "payment_fee",
        currency: payment.currency,
        description: `Stripe fee for ${payment.selected_plan} payment`,
        entryType: "actual",
        from: "mattanutra:stripe-clearing",
        fromAccountId: FINANCE_ACCOUNT_IDS.stripeClearing,
        metadata: {
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
        usdRate: thbUsdRate()
      });
    }

    await writePaymentBpmEvent({
      actorType: "system",
      eventName: "payment_accounting_recorded",
      eventStatus: "accounting_recorded",
      locale: payment.locale,
      paymentId: payment.id,
      planId: payment.plan_id,
      properties: {
        amountMicros,
        feeMicros,
        sourceSurface: payment.source_surface
      },
      selectedPlan: payment.selected_plan,
      sql,
      stripeSessionId: checkoutSessionId,
      valueAmount: amountMicros / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: payment.currency
    });
  } catch (error) {
    await writePaymentBpmEvent({
      actorType: "system",
      errorCode: "stripe_accounting_failed",
      errorMessage:
        error instanceof Error ? error.message : "Unable to record Stripe accounting",
      eventName: "payment_accounting_failed",
      eventStatus: "accounting_failed",
      locale: payment.locale,
      paymentId: payment.id,
      planId: payment.plan_id,
      properties: {
        sourceSurface: payment.source_surface
      },
      selectedPlan: payment.selected_plan,
      severity: "high",
      sql,
      stripeSessionId: checkoutSessionId,
      valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: payment.currency
    });
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

  await recordFinanceTransaction({
    amount: amountMicros,
    category: "payout",
    currency,
    description: `Stripe payout ${payout.id}`,
    entryType: "actual",
    from: `stripe:payout:${payout.id}`,
    fromAccountId: FINANCE_ACCOUNT_IDS.stripeClearing,
    metadata: {
      accountingBasis: "stripe_payout",
      arrivalDate: payout.arrival_date ?? null,
      balanceTransactionId: stringId(payout.balance_transaction),
      mattanutraEnv: input.config.env,
      stripeMode: input.config.mode,
      stripePayoutId: payout.id,
      stripePayoutStatus: payout.status
    },
    occurredAt: payout.arrival_date
      ? new Date(payout.arrival_date * 1000)
      : new Date(),
    provider: "stripe",
    source: "stripe",
    sourceRef: `stripe:payout:${payout.id}:net`,
    sql,
    to: "mattanutra:bank",
    toAccountId: FINANCE_ACCOUNT_IDS.mattanutraBank,
    usdRate: thbUsdRate()
  });

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

async function storeStripeEmail(
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

async function startPaidAssessmentPlan(input: Readonly<{
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

  await writeBpmEvent({
    actorType: "visitor",
    emittedBy: "stripe_payment_flow",
    eventName: "plan_selected",
    eventType: "plan",
    locale: input.locale,
    planId: input.planId,
    properties: {
      paymentId: input.paymentId,
      paymentRequired: true
    },
    selectedPlan: input.selectedPlan,
    sql: input.sql
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
  const paymentId = randomUUID();

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

  const payment = await insertPayment(sql, {
    config,
    locale: input.locale,
    paymentId,
    planId: input.planId,
    selectedPlan: input.selectedPlan,
    sourceSurface: input.sourceSurface
  });

  await writePaymentBpmEvent({
    actorType: "visitor",
    eventName: "payment_checkout_requested",
    eventStatus: "requested",
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
  });

  if (config.mode === "mock") {
    const mockSessionId = `mock_cs_${paymentId}`;

    await updatePaymentState(sql, {
      action: "mock_checkout_session_created",
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

    await writePaymentBpmEvent({
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
    });

    return {
      clientSecret: null,
      mock: true,
      paymentId,
      publishableKey: "",
      returnUrl: paymentReturnDestination(input.locale, mapPayment(payment))
    };
  }

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
  });

  if (!session.client_secret) {
    throw new Error("Stripe did not return an embedded Checkout client secret");
  }

  await updatePaymentState(sql, {
    action: "checkout_session_created",
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

  await writePaymentBpmEvent({
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
  });

  return {
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

  if (payment.status === "checkout_session_created") {
    currentPayment = await updatePaymentState(sql, {
      action: "checkout_opened",
      actor: "visitor",
      paymentId: input.paymentId,
      reason: "embedded_checkout_opened",
      status: "checkout_opened"
    }) ?? payment;
  }

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

  if (
    currentPayment.plan_id &&
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

  return mapPayment((await getPaymentRowById(sql, input.paymentId)) ?? currentPayment);
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

  return mapPayment(await updatePaymentState(sql, {
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

  const payment = await getPaymentRowById(sql, input.paymentId);

  if (!payment) {
    return null;
  }

  const updated =
    payment.status === "paid" || payment.status === "bound"
      ? payment
      : await updatePaymentState(sql, {
          action: "payment_cancelled",
          actor: "visitor",
          metadata: {
            source: "checkout_cancel_action"
          },
          paymentId: input.paymentId,
          reason: "visitor_cancelled_checkout",
          status: "cancelled"
        });
  await recordStripePaymentNominalRevenue(sql, updated ?? payment, {
    accountingBasis: "payment_cancelled"
  });

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

  return mapPayment(updated);
}

export async function completeMockPayment(input: Readonly<{
  paymentId: string;
  request?: Request;
}>) {
  if (!isUuid(input.paymentId)) {
    return null;
  }

  const sql = await sqlOrThrow();

  await assertPaymentSchema(sql);

  const config = stripePaymentConfig(input.request);

  if (config.mode !== "mock") {
    throw new Error("Mock payment completion is only available in dev mock mode");
  }

  const payment = await getPaymentRowById(sql, input.paymentId);

  if (!payment || payment.stripe_mode !== "mock") {
    return null;
  }

  const mockWebhook = await recordMockStripeWebhookLifecycle(sql, {
    config,
    payment,
    request: input.request
  });
  const paid =
    payment.status === "paid" || payment.status === "bound"
      ? payment
      : await updatePaymentState(sql, {
          action: "mock_payment_paid",
          actor: "system",
          metadata: {
            mock: true,
            source: "local_dev"
          },
          paymentId: input.paymentId,
          reason: "local_mock_payment_confirmed",
          status: "paid",
          stripeCustomerId: "mock_customer",
          stripePaymentIntentId: `mock_pi_${input.paymentId}`
        });
  const currentPayment = paid ?? payment;

  await recordStripePaymentAccounting(sql, currentPayment, null);

  await writePaymentBpmEvent({
    actorType: "system",
    eventName: "payment_succeeded",
    eventStatus: "paid",
    locale: currentPayment.locale,
    paymentId: currentPayment.id,
    planId: currentPayment.plan_id,
    properties: {
      mock: true,
      source: "local_dev",
      sourceSurface: currentPayment.source_surface
    },
    request: input.request,
    selectedPlan: currentPayment.selected_plan,
    sql,
    stripeSessionId: currentPayment.stripe_checkout_session_id,
    valueAmount: currentPayment.amount / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: currentPayment.currency
  });

  if (currentPayment.plan_id) {
    await startPaidAssessmentPlan({
      locale: currentPayment.locale,
      paymentId: currentPayment.id,
      planId: currentPayment.plan_id,
      selectedPlan: currentPayment.selected_plan,
      sql
    });
  }

  await writePaymentBpmEvent({
    actorType: "system",
    eventName: "payment_fulfillment_succeeded",
    eventStatus: "paid",
    locale: currentPayment.locale,
    paymentId: currentPayment.id,
    planId: currentPayment.plan_id,
    properties: {
      mock: true,
      source: "local_dev",
      sourceSurface: currentPayment.source_surface
    },
    selectedPlan: currentPayment.selected_plan,
    sql,
    stripeSessionId: currentPayment.stripe_checkout_session_id,
    valueAmount: currentPayment.amount / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: currentPayment.currency
  });

  await markWebhookEventStatus(sql, {
    paymentId: currentPayment.id,
    sessionId: mockWebhook.sessionId,
    status: "processed",
    stripeEventId: mockWebhook.fatEventId
  });
  await recordMockStripePayoutLifecycle(sql, {
    config,
    payment: currentPayment,
    request: input.request
  });

  return {
    destination: paymentReturnDestination(
      currentPayment.locale,
      mapPayment(currentPayment)
    ),
    payment: mapPayment(currentPayment)
  };
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
    on conflict (stripe_event_id) do nothing
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

  return payment ? mapPayment(payment) : null;
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

  return rows[0] ? mapPayment(rows[0]) : null;
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
    on conflict (stripe_event_id) do nothing
    returning id::text
  `;

  return Boolean(rows[0]);
}

function sessionFromEvent(event: Stripe.Event) {
  return event.data.object as Stripe.Checkout.Session;
}

export async function fulfillCheckoutSession(
  sessionId: string,
  input: Readonly<{
    request?: Request;
    source: "return_page" | "webhook";
    stripeEventId?: string | null;
  }>
) {
  const sql = await sqlOrThrow();

  await assertPaymentSchema(sql);

  const config = stripePaymentConfig(input.request);
  const stripe = stripeClientForConfig(config);
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: [
      "line_items.data.price",
      "payment_intent.latest_charge.balance_transaction"
    ]
  });
  const payment =
    (session.metadata?.paymentId && isUuid(session.metadata.paymentId)
      ? await getPaymentRowById(sql, session.metadata.paymentId)
      : null) ?? (await getPaymentRowBySessionId(sql, session.id));

  if (!payment) {
    throw new Error("Payment record not found for Stripe session");
  }

  try {
    if (
      input.source === "return_page" &&
      !(await paymentBpmEventExists(sql, {
        eventName: "payment_checkout_returned",
        paymentId: payment.id,
        stripeSessionId: session.id
      }))
    ) {
      await writePaymentBpmEvent({
        actorType: "visitor",
        eventName: "payment_checkout_returned",
        eventStatus: "received",
        locale: payment.locale,
        paymentId: payment.id,
        planId: payment.plan_id,
        properties: {
          sourceSurface: payment.source_surface
        },
        request: input.request,
        selectedPlan: payment.selected_plan,
        sql,
        stripeEventId: input.stripeEventId,
        stripeSessionId: session.id,
        valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
        valueCurrency: payment.currency
      });
    }

    assertSessionMatchesPayment(session, payment, config);

    const customerId = stringId(session.customer);
    const paymentIntentId = stringId(session.payment_intent);
    const email = sessionCustomerEmail(session);

    if (session.status === "expired") {
      if (payment.status === "expired") {
        return {
          payment: mapPayment(payment),
          status: "expired" as const
        };
      }

      const expired = await updatePaymentState(sql, {
        action: "checkout_expired",
        actor: "stripe",
        metadata: {
          source: input.source
        },
        paymentId: payment.id,
        reason: "stripe_checkout_expired",
        status: "expired",
        stripeCustomerId: customerId,
        stripePaymentIntentId: paymentIntentId
      });

      await writePaymentBpmEvent({
        actorType: "system",
        eventName: "payment_expired",
        eventStatus: "expired",
        locale: payment.locale,
        paymentId: payment.id,
        planId: payment.plan_id,
        properties: {
          source: input.source,
          sourceSurface: payment.source_surface
        },
        selectedPlan: payment.selected_plan,
        sql,
        stripeEventId: input.stripeEventId,
        stripeSessionId: session.id,
        valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
        valueCurrency: payment.currency
      });

      return {
        payment: expired ? mapPayment(expired) : mapPayment(payment),
        status: "expired" as const
      };
    }

    if (session.payment_status !== "paid") {
      if (payment.status === "processing") {
        return {
          payment: mapPayment(payment),
          status: "processing" as const
        };
      }

      const processing = await updatePaymentState(sql, {
        action: "payment_processing",
        actor: "stripe",
        metadata: {
          paymentStatus: session.payment_status,
          source: input.source
        },
        paymentId: payment.id,
        reason: "stripe_checkout_not_paid",
        status: "processing",
        stripeCustomerId: customerId,
        stripePaymentIntentId: paymentIntentId
      });

      await writePaymentBpmEvent({
        actorType: "system",
        eventName: "payment_processing",
        eventStatus: "processing",
        locale: payment.locale,
        paymentId: payment.id,
        planId: payment.plan_id,
        properties: {
          paymentStatus: session.payment_status,
          source: input.source,
          sourceSurface: payment.source_surface
        },
        selectedPlan: payment.selected_plan,
        sql,
        stripeEventId: input.stripeEventId,
        stripeSessionId: session.id,
        valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
        valueCurrency: payment.currency
      });

      return {
        payment: processing ? mapPayment(processing) : mapPayment(payment),
        status: "processing" as const
      };
    }

    if (payment.status === "paid" || payment.status === "bound") {
      return {
        payment: mapPayment(payment),
        status: payment.plan_id ? "paid_with_plan" as const : "paid_reservation" as const
      };
    }

    await writePaymentBpmEvent({
      actorType: "system",
      eventName: "payment_fulfillment_started",
      eventStatus: "fulfillment_started",
      locale: payment.locale,
      paymentId: payment.id,
      planId: payment.plan_id,
      properties: {
        source: input.source,
        sourceSurface: payment.source_surface
      },
      request: input.request,
      selectedPlan: payment.selected_plan,
      severity: "low",
      sql,
      stripeEventId: input.stripeEventId,
      stripeSessionId: session.id,
      valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: payment.currency
    });

    const paid =
      await updatePaymentState(sql, {
        action: "payment_paid",
        actor: "stripe",
        customerEmail: email || null,
        metadata: {
          source: input.source,
          stripePaymentStatus: session.payment_status
        },
        paymentId: payment.id,
        reason: "stripe_payment_confirmed",
        status: "paid",
        stripeCustomerId: customerId,
        stripePaymentIntentId: paymentIntentId
      });
    const currentPayment = paid ?? payment;

    await storeStripeEmail(sql, currentPayment, email);
    await recordStripePaymentAccounting(sql, currentPayment, session);

    await writePaymentBpmEvent({
      actorType: "system",
      eventName: "payment_succeeded",
      eventStatus: "paid",
      locale: payment.locale,
      paymentId: payment.id,
      planId: payment.plan_id,
      properties: {
        source: input.source,
        sourceSurface: payment.source_surface
      },
      selectedPlan: payment.selected_plan,
      sql,
      stripeEventId: input.stripeEventId,
      stripeSessionId: session.id,
      valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: payment.currency
    });

    if (currentPayment.plan_id && currentPayment.status !== "bound") {
      await startPaidAssessmentPlan({
        locale: currentPayment.locale,
        paymentId: currentPayment.id,
        planId: currentPayment.plan_id,
        selectedPlan: currentPayment.selected_plan,
        sql
      });
    }

    await writePaymentBpmEvent({
      actorType: "system",
      eventName: "payment_fulfillment_succeeded",
      eventStatus: "paid",
      locale: payment.locale,
      paymentId: payment.id,
      planId: payment.plan_id,
      properties: {
        source: input.source,
        sourceSurface: payment.source_surface
      },
      selectedPlan: payment.selected_plan,
      sql,
      stripeEventId: input.stripeEventId,
      stripeSessionId: session.id,
      valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: payment.currency
    });

    return {
      payment: mapPayment(currentPayment),
      status: currentPayment.plan_id ? "paid_with_plan" as const : "paid_reservation" as const
    };
  } catch (error) {
    await updatePaymentState(sql, {
      action: "fulfillment_failed",
      actor: "system",
      metadata: {
        errorMessage:
          error instanceof Error ? error.message : "Payment fulfillment failed",
        source: input.source
      },
      paymentId: payment.id,
      reason: "fulfillment_failed",
      status: "fulfillment_failed"
    });
    await writePaymentBpmEvent({
      actorType: "system",
      errorCode: "payment_fulfillment_failed",
      errorMessage:
        error instanceof Error ? error.message : "Payment fulfillment failed",
      eventName: "payment_fulfillment_failed",
      eventStatus: "fulfillment_failed",
      locale: payment.locale,
      paymentId: payment.id,
      planId: payment.plan_id,
      properties: {
        source: input.source,
        sourceSurface: payment.source_surface
      },
      selectedPlan: payment.selected_plan,
      severity: "high",
      sql,
      stripeEventId: input.stripeEventId,
      stripeSessionId: session.id,
      valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
      valueCurrency: payment.currency
    });
    throw error;
  }
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

  const payment = await getPaymentRowById(sql, input.paymentId);

  if (!payment || payment.plan_id || payment.locale !== input.locale) {
    await writePaymentBpmEvent({
      actorType: "system",
      errorCode: "payment_reservation_bind_failed",
      errorMessage: "Paid reservation could not be bound to assessment",
      eventName: "payment_reservation_bind_failed",
      eventStatus: "failed",
      locale: input.locale,
      paymentId: input.paymentId,
      planId: input.planId,
      severity: "high",
      sql
    });
    return null;
  }

  if (payment.status !== "paid") {
    await writePaymentBpmEvent({
      actorType: "system",
      errorCode: "payment_reservation_not_paid",
      errorMessage: "Payment reservation is not paid",
      eventName: "payment_reservation_bind_failed",
      eventStatus: "failed",
      locale: input.locale,
      paymentId: input.paymentId,
      planId: input.planId,
      selectedPlan: payment.selected_plan,
      severity: "high",
      sql
    });
    return null;
  }

  const bound = await updatePaymentState(sql, {
    action: "payment_reservation_bound",
    actor: "system",
    metadata: {
      source: "assessment_capture"
    },
    paymentId: input.paymentId,
    planId: input.planId,
    reason: "paid_reservation_bound_to_assessment",
    status: "bound"
  });
  const nextPayment = bound ?? payment;

  await recordStripePaymentNominalRevenue(sql, nextPayment, {
    accountingBasis: "reservation_bound"
  });
  await storeStripeEmail(sql, nextPayment, payment.customer_email);
  await startPaidAssessmentPlan({
    locale: input.locale,
    paymentId: input.paymentId,
    planId: input.planId,
    selectedPlan: payment.selected_plan,
    sql
  });

  await writePaymentBpmEvent({
    actorType: "system",
    eventName: "payment_reservation_bound",
    eventStatus: "bound",
    locale: input.locale,
    paymentId: input.paymentId,
    planId: input.planId,
    selectedPlan: payment.selected_plan,
    sql,
    stripeSessionId: payment.stripe_checkout_session_id,
    valueAmount: payment.amount / AMOUNT_MICROS_PER_UNIT,
    valueCurrency: payment.currency
  });

  return mapPayment(nextPayment);
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
  await recordStripePaymentNominalRevenue(sql, updated ?? payment, {
    accountingBasis: input.eventStatus === "expired" ? "payment_expired" : "payment_failed",
    failureReason: input.reason,
    stripeEventId: input.stripeEventId
  });

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

  return updated ? mapPayment(updated) : mapPayment(payment);
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
    return { duplicate: true, ok: true };
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
