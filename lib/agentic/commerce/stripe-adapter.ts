import Stripe from "stripe";
import { stripeLocale, stripePaymentConfig } from "@/lib/stripe-payment-config";
import { applyVerifiedPaymentEvent } from "@/lib/agentic/commerce/state";
import { processOmsOutbox } from "@/lib/agentic/retail/mock-thailand";
import { joinMcpPaidOrderToRetail } from "@/lib/agentic/commerce/retail-join";
import type { PaymentPort } from "@/lib/agentic/commerce/payment";
import { nowIso, type AgenticRuntime } from "@/lib/agentic/runtime";
import { asMinor } from "@/lib/agentic/money";
import { isLocale, type Locale } from "@/lib/i18n";
import type { OrderRecord } from "@/lib/agentic/store/types";

const AGENTIC_STRIPE_SOURCE = "agentic_mcp";

function testModeStripe() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim() ?? "";

  if (!secret.startsWith("sk_test_")) {
    throw new Error("Stripe Test Mode secret key is required for UAT agentic checkout.");
  }

  return new Stripe(secret);
}

export function createStripePaymentAdapter(): PaymentPort {
  return {
    async createCheckoutSession(input) {
      return {
        checkoutUrl: `${input.config.siteUrl}/en/mcp/checkout/pending`,
        expiresAt: new Date(Date.parse(input.now) + input.config.checkoutTtlMs).toISOString(),
        providerSessionId: `stripe_pending_${input.order.id.replace(/-/g, "")}`
      };
    }
  };
}

export async function createAgenticStripeCheckoutSession(input: Readonly<{
  checkoutAccess: string;
  customerEmail: string;
  customerName: string;
  locale: string;
  orderId: string;
  runtime: AgenticRuntime;
  totalPriceMinor: number;
}>) {
  const config = stripePaymentConfig();

  if (config.mode !== "test" || config.env === "prd") {
    throw new Error("Agentic Stripe checkout is Test Mode only.");
  }

  const stripe = testModeStripe();
  const order = await input.runtime.store.getOrder(input.orderId);
  const items = await input.runtime.store.getOrderItems(input.orderId);
  const locale: Locale = isLocale(input.locale) ? input.locale : "en";

  if (!order) {
    throw new Error("Order not found.");
  }

  const returnUrl =
    `${input.runtime.config.siteUrl}/${locale}/mcp/checkout/${encodeURIComponent(input.checkoutAccess)}/return` +
    "?session_id={CHECKOUT_SESSION_ID}";
  const session = await stripe.checkout.sessions.create({
    customer_email: input.customerEmail,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    line_items: [
      {
        price_data: {
          currency: order.currency.toLowerCase(),
          product_data: {
            name: items[0]?.productName
              ? `MattaNutra (${items.length} products)`
              : "MattaNutra order"
          },
          unit_amount: asMinor(input.totalPriceMinor)
        },
        quantity: 1
      }
    ],
    locale: stripeLocale(locale),
    metadata: {
      agenticOrderId: order.id,
      customerName: input.customerName.slice(0, 40),
      mattanutraEnv: input.runtime.config.environment,
      source: AGENTIC_STRIPE_SOURCE
    },
    mode: "payment",
    payment_intent_data: {
      metadata: {
        agenticOrderId: order.id,
        mattanutraEnv: input.runtime.config.environment,
        source: AGENTIC_STRIPE_SOURCE
      }
    },
    return_url: returnUrl,
    ui_mode: "embedded_page"
  });

  if (session.livemode) {
    throw new Error("Refusing live Stripe session in UAT.");
  }

  if (!session.client_secret) {
    throw new Error("Stripe did not return an embedded Checkout client secret");
  }

  await input.runtime.store.updateOrder({
    ...order,
    providerSessionId: session.id,
    updatedAt: nowIso()
  });

  return {
    clientSecret: session.client_secret,
    sessionId: session.id
  };
}

export async function applyPaidAgenticStripeSession(input: Readonly<{
  order: OrderRecord;
  runtime: AgenticRuntime;
  sessionId: string;
}>): Promise<OrderRecord | null> {
  const stripe = testModeStripe();
  const session = await stripe.checkout.sessions.retrieve(input.sessionId);
  const paid =
    session.payment_status === "paid" ||
    session.status === "complete";

  if (!paid) {
    return input.order;
  }

  if (input.order.paymentStatus === "paid") {
    return input.order;
  }

  let order = input.order;

  if (order.providerSessionId !== session.id) {
    order = {
      ...order,
      providerSessionId: session.id,
      updatedAt: nowIso()
    };
    await input.runtime.store.updateOrder(order);
  }

  const applied = await applyVerifiedPaymentEvent({
    event: {
      amountMinor: asMinor(session.amount_total ?? order.totalPriceMinor),
      currency: (session.currency ?? order.currency).toUpperCase(),
      providerEventId: `return:${session.id}`,
      providerSessionId: session.id,
      reason: null,
      scenario: "success",
      status: "succeeded"
    },
    now: nowIso(),
    store: input.runtime.store
  });

  return applied?.order ?? order;
}

function metadataRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

export async function tryApplyAgenticStripeEvent(input: Readonly<{
  event: Stripe.Event;
  runtime: AgenticRuntime;
}>) {
  if (input.runtime.config.paymentProvider === "mock") {
    return null;
  }

  if (input.event.livemode && input.runtime.config.environment !== "prd") {
    return { ignored: true, ok: true, reason: "livemode_rejected" };
  }

  const object = input.event.data.object as {
    amount_total?: number;
    currency?: string;
    id?: string;
    last_payment_error?: { decline_code?: string | null; code?: string | null };
    metadata?: unknown;
    payment_status?: string;
  };
  const metadata = metadataRecord(object.metadata);
  let order =
    metadata.agenticOrderId
      ? await input.runtime.store.getOrder(metadata.agenticOrderId)
      : null;

  if (!order && object.id) {
    order = await input.runtime.store.getOrderByProviderSessionId(object.id);
  }

  if (!order?.providerSessionId) {
    return null;
  }

  const now = nowIso();
  const amountMinor = asMinor(object.amount_total ?? order.totalPriceMinor);
  const currency = (object.currency ?? order.currency).toUpperCase();
  const declineCode = object.last_payment_error?.decline_code ?? object.last_payment_error?.code;
  let status: "declined" | "expired" | "processing" | "succeeded" = "processing";
  let reason: string | null = null;

  if (
    input.event.type === "checkout.session.completed" ||
    input.event.type === "checkout.session.async_payment_succeeded"
  ) {
    if (object.payment_status && object.payment_status !== "paid") {
      status = "processing";
    } else {
      status = "succeeded";
    }
  } else if (input.event.type === "checkout.session.expired") {
    status = "expired";
    reason = "expired";
  } else if (
    input.event.type === "payment_intent.payment_failed" ||
    input.event.type === "checkout.session.async_payment_failed"
  ) {
    status = "declined";
    reason = declineCode === "insufficient_funds" || declineCode === "card_declined"
      ? "insufficient_funds"
      : declineCode ?? "card_declined";
  } else {
    return { ignored: true, ok: true, reason: "unhandled_agentic_event" };
  }

  const applied = await applyVerifiedPaymentEvent({
    event: {
      amountMinor,
      currency,
      providerEventId: input.event.id,
      providerSessionId: order.providerSessionId,
      reason,
      scenario:
        status === "succeeded"
          ? "success"
          : status === "expired"
            ? "expire"
            : status === "processing"
              ? "processing_then_success"
              : "decline_insufficient_funds",
      status
    },
    now,
    store: input.runtime.store
  });

  if (!applied) {
    return { ignored: true, ok: true, reason: "order_not_found" };
  }

  if (applied.order.paymentStatus === "paid") {
    await joinMcpPaidOrderToRetail({
      now,
      order: applied.order,
      store: input.runtime.store
    });
    await processOmsOutbox({ now, store: input.runtime.store });
  }

  return { applied: applied.applied, ok: true, source: AGENTIC_STRIPE_SOURCE };
}
