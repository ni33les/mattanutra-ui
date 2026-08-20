import { randomUUID } from "node:crypto";
import { AGENTIC_POLL_AFTER_SECONDS } from "@/lib/agentic/config";
import { businessError } from "@/lib/agentic/contract/errors";
import type { AgenticStore, OrderRecord } from "@/lib/agentic/store/types";
import type { VerifiedPaymentEvent } from "@/lib/agentic/commerce/payment";
import { publicFrozenOrder } from "@/lib/agentic/public-mapper";

export type PaymentApplyResult = Readonly<{
  applied: boolean;
  order: OrderRecord;
}>;

export async function applyVerifiedPaymentEvent(input: Readonly<{
  event: VerifiedPaymentEvent;
  now: string;
  store: AgenticStore;
}>): Promise<PaymentApplyResult | null> {
  const existing = await input.store.getProviderEvent("mock", input.event.providerEventId);

  if (existing) {
    const order = await input.store.getOrder(existing.orderId);
    return order ? { applied: false, order } : null;
  }

  const order = await input.store.getOrderByProviderSessionId(input.event.providerSessionId);

  if (!order) {
    return null;
  }

  await input.store.insertProviderEvent({
    createdAt: input.now,
    id: randomUUID(),
    orderId: order.id,
    payload: input.event,
    provider: "mock",
    providerEventId: input.event.providerEventId
  });

  await input.store.insertPaymentAttempt({
    createdAt: input.now,
    id: randomUUID(),
    orderId: order.id,
    providerEventId: input.event.providerEventId,
    reason: input.event.reason,
    status: input.event.status
  });

  const mismatch =
    input.event.status === "succeeded" &&
    (input.event.amountMinor !== order.totalPriceMinor ||
      input.event.currency !== order.currency);

  if (mismatch) {
    const next: OrderRecord = {
      ...order,
      latestPaymentAttempt: "rejected",
      latestPaymentReason: input.event.reason ?? "mismatch",
      updatedAt: input.now
    };
    await input.store.updateOrder(next);
    return { applied: false, order: next };
  }

  if (input.event.status === "declined" || input.event.status === "unavailable") {
    const next: OrderRecord = {
      ...order,
      latestPaymentAttempt: "declined",
      latestPaymentReason: input.event.reason,
      paymentStatus: "unpaid",
      updatedAt: input.now
    };
    await input.store.updateOrder(next);
    await input.store.insertPaymentAudit({
      createdAt: input.now,
      id: randomUUID(),
      orderId: order.id,
      type: input.event.status === "unavailable" ? "payment_unavailable" : "payment_declined"
    });
    return { applied: true, order: next };
  }

  if (input.event.status === "processing") {
    const next: OrderRecord = {
      ...order,
      latestPaymentAttempt: "processing",
      latestPaymentReason: input.event.reason,
      paymentStatus: "processing",
      updatedAt: input.now
    };
    await input.store.updateOrder(next);
    return { applied: true, order: next };
  }

  if (input.event.status === "expired") {
    const next: OrderRecord = {
      ...order,
      checkoutUrl: null,
      expiredAt: input.now,
      latestPaymentAttempt: "expired",
      latestPaymentReason: "expired",
      orderStatus: "expired",
      paymentStatus: "unpaid",
      updatedAt: input.now
    };
    await input.store.updateOrder(next);
    return { applied: true, order: next };
  }

  if (input.event.status === "refunded" || input.event.status === "partially_refunded") {
    const next: OrderRecord = {
      ...order,
      latestPaymentAttempt: input.event.status,
      latestPaymentReason: null,
      paymentStatus: input.event.status,
      updatedAt: input.now
    };
    await input.store.updateOrder(next);
    return { applied: true, order: next };
  }

  if (order.paymentStatus === "paid") {
    return { applied: false, order };
  }

  const next: OrderRecord = {
    ...order,
    completedAt: input.now,
    latestPaymentAttempt: "succeeded",
    latestPaymentReason: null,
    orderStatus: "completed",
    paymentStatus: "paid",
    stateVersion: order.stateVersion === 1 ? 2 : order.stateVersion,
    updatedAt: input.now
  };

  await input.store.updateOrder(next);
  await input.store.insertPaymentAudit({
    createdAt: input.now,
    id: randomUUID(),
    orderId: order.id,
    type: "payment_confirmed"
  });
  await input.store.insertOutbox({
    createdAt: input.now,
    id: randomUUID(),
    orderId: order.id,
    payload: { orderId: order.id },
    processedAt: null,
    type: "OMS_SUBMIT"
  });

  return { applied: true, order: next };
}

export function orderPollView(input: Readonly<{
  checkoutUrl: string | null;
  found: boolean;
  localeMessage: (key: string) => string;
  order: OrderRecord | null;
}>) {
  if (!input.found || !input.order) {
    return businessError({
      fieldPath: "orderHandle",
      message: input.localeMessage("order.not_found"),
      messageKey: "order.not_found",
      reasonCode: "not_found"
    });
  }

  const order = input.order;
  const paid = order.paymentStatus === "paid";
  const declined = order.latestPaymentAttempt === "declined";
  const processing = order.paymentStatus === "processing";
  const expired = order.orderStatus === "expired";
  const refunded =
    order.paymentStatus === "refunded" || order.paymentStatus === "partially_refunded";
  const terminal = paid || expired || refunded || order.orderStatus === "cancelled";
  const messageKey = declined
    ? "order.payment_declined_retry"
    : paid
      ? "order.paid"
      : processing
        ? "order.processing"
        : expired
          ? "order.expired"
          : refunded
            ? "order.refunded"
            : "order.open_unpaid";

  return {
    checkoutExpiresAt: order.checkoutExpiresAt,
    checkoutUrl: input.checkoutUrl,
    frozenOrder: publicFrozenOrder(order.frozenPlan),
    fulfilment: {
      deliveryWindow: null,
      status: order.fulfilmentStatus,
      tracking: []
    },
    latestPaymentAttempt: order.latestPaymentAttempt,
    latestPaymentReason: order.latestPaymentReason,
    lookupStatus: "found",
    message: input.localeMessage(messageKey),
    messageKey,
    nextAction: terminal ? "none" : declined || order.paymentStatus === "unpaid"
      ? "open_checkout"
      : "poll",
    ok: true as const,
    orderReference: order.reference,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS,
    receipt: paid
      ? {
          currency: order.currency,
          paidAt: order.completedAt,
          totalPriceMinor: order.totalPriceMinor
        }
      : null,
    retryable: !terminal && !processing,
    stateVersion: order.stateVersion
  };
}
