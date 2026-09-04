import { AGENTIC_POLL_AFTER_SECONDS } from "@/lib/agentic/config";
import { nextTestUuid } from "@/lib/agentic/capabilities";
import { businessError } from "@/lib/agentic/contract/errors";
import type {
  AgenticStore,
  FulfilmentEventRecord,
  OrderRecord
} from "@/lib/agentic/store/types";
import type { VerifiedPaymentEvent } from "@/lib/agentic/commerce/payment";
import { publicFrozenOrder } from "@/lib/agentic/public-mapper";
import { publicFulfilmentStatus } from "@/lib/agentic/commerce/timeline";
import { commitFunnelEvent } from "@/lib/agentic/funnel/ledger";

export type PaymentApplyResult = Readonly<{
  applied: boolean;
  order: OrderRecord;
}>;

export function paymentApplyKey(event: VerifiedPaymentEvent) {
  const family =
    event.status === "succeeded"
      ? "succeeded"
      : event.status === "declined" || event.status === "unavailable"
        ? "declined"
        : event.status;
  return `${event.providerSessionId}:${family}`;
}

function paymentProviderOf(event: VerifiedPaymentEvent) {
  if (
    event.providerSessionId.startsWith("cs_") ||
    event.providerEventId.startsWith("return:") ||
    event.providerEventId.startsWith("evt_")
  ) {
    return "stripe" as const;
  }
  return "mock" as const;
}

function isDuplicateProviderEvent(error: unknown) {
  const record = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (record.code === "23505") {
    return true;
  }
  return /provider_event_duplicate|agentic_provider_events/i.test(
    `${record.constraint ?? ""} ${record.message ?? error}`
  );
}

async function existingProviderEvent(
  store: AgenticStore,
  event: VerifiedPaymentEvent,
  applyKey: string
) {
  return (
    (await store.getProviderEvent("mock", applyKey)) ??
    (await store.getProviderEvent("mock", event.providerEventId)) ??
    (await store.getProviderEvent("stripe", applyKey)) ??
    (await store.getProviderEvent("stripe", event.providerEventId))
  );
}

async function recordPaymentFunnel(input: Readonly<{
  eventId: string;
  eventType: "payment_declined" | "payment_succeeded";
  now: string;
  planId: string;
}>) {
  await commitFunnelEvent({
    attribution: "agent_connector",
    correlationId: input.planId,
    createdAt: input.now,
    eventId: input.eventId,
    eventType: input.eventType,
    payload: { locale: "en" }
  });
}

export async function applyVerifiedPaymentEvent(input: Readonly<{
  event: VerifiedPaymentEvent;
  now: string;
  store: AgenticStore;
}>): Promise<PaymentApplyResult | null> {
  const applyKey = paymentApplyKey(input.event);
  const existing = await existingProviderEvent(input.store, input.event, applyKey);

  if (existing) {
    const order = await input.store.getOrder(existing.orderId);
    return order ? { applied: false, order } : null;
  }

  const order = await input.store.getOrderByProviderSessionId(input.event.providerSessionId);

  if (!order) {
    return null;
  }

  const terminal =
    order.paymentStatus === "paid" ||
    order.orderStatus === "expired" ||
    order.orderStatus === "cancelled";
  if (
    terminal &&
    input.event.status !== "refunded" &&
    input.event.status !== "partially_refunded"
  ) {
    return { applied: false, order };
  }

  try {
    await input.store.insertProviderEvent({
      createdAt: input.now,
      id: nextTestUuid(),
      orderId: order.id,
      payload: input.event,
      provider: paymentProviderOf(input.event),
      providerEventId: applyKey
    });
  } catch (error) {
    if (!isDuplicateProviderEvent(error)) {
      throw error;
    }
    const raced = await existingProviderEvent(input.store, input.event, applyKey);
    const latest =
      (raced ? await input.store.getOrder(raced.orderId) : null) ??
      (await input.store.getOrder(order.id));
    return latest ? { applied: false, order: latest } : null;
  }

  await input.store.insertPaymentAttempt({
    createdAt: input.now,
    id: nextTestUuid(),
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

  if (input.event.status === "declined" && input.event.reason === "three_ds_cancelled") {
    const next: OrderRecord = {
      ...order,
      cancelledAt: input.now,
      checkoutUrl: null,
      latestPaymentAttempt: "cancelled",
      latestPaymentReason: "three_ds_cancelled",
      orderStatus: "cancelled",
      paymentStatus: "unpaid",
      updatedAt: input.now
    };
    await input.store.updateOrder(next);
    await input.store.insertPaymentAudit({
      createdAt: input.now,
      id: nextTestUuid(),
      orderId: order.id,
      type: "payment_cancelled"
    });
    return { applied: true, order: next };
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
      id: nextTestUuid(),
      orderId: order.id,
      type: input.event.status === "unavailable" ? "payment_unavailable" : "payment_declined"
    });
    await recordPaymentFunnel({
      eventId: `pay-no:${order.id}`,
      eventType: "payment_declined",
      now: input.now,
      planId: order.planId
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
    const next = await expireUnpaidOrder({ now: input.now, order, store: input.store });
    return { applied: true, order: next };
  }

  if (input.event.status === "refunded" || input.event.status === "partially_refunded") {
    const next: OrderRecord = {
      ...order,
      fulfilmentStatus: "cancelled",
      latestPaymentAttempt: input.event.status,
      latestPaymentReason: null,
      paymentStatus: input.event.status,
      updatedAt: input.now
    };
    await input.store.updateOrder(next);
    try {
      const { getSql } = await import("@/lib/db");
      const {
        cancelRetailCustomerOrderForAgenticRefund,
        getRetailOrderByAgenticOrderId
      } = await import("@/lib/retail-product-checkout");
      const { voidPendingRetailOrderSettlement } = await import(
        "@/lib/admin-retail-financials"
      );
      const sql = getSql();
      const retail = await getRetailOrderByAgenticOrderId(order.id);

      if (sql && retail?.orderId) {
        await voidPendingRetailOrderSettlement(sql, {
          orderId: retail.orderId,
          reason: "mcp_refund"
        });
      }
      await cancelRetailCustomerOrderForAgenticRefund(order.id);
    } catch {
      // Settlement void is best-effort; paymentStatus is already refunded.
    }
    return { applied: true, order: next };
  }

  if (order.paymentStatus === "paid" || order.orderStatus === "expired") {
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
    id: nextTestUuid(),
    orderId: order.id,
    type: "payment_confirmed"
  });
  await input.store.insertOutbox({
    createdAt: input.now,
    id: nextTestUuid(),
    orderId: order.id,
    payload: { orderId: order.id },
    processedAt: null,
    type: "OMS_SUBMIT"
  });
  await recordPaymentFunnel({
    eventId: `pay-ok:${order.id}`,
    eventType: "payment_succeeded",
    now: input.now,
    planId: order.planId
  });

  return { applied: true, order: next };
}

async function expireUnpaidOrder(input: Readonly<{
  now: string;
  order: OrderRecord;
  store: AgenticStore;
}>): Promise<OrderRecord> {
  if (input.order.orderStatus === "expired") {
    return input.order;
  }

  const next: OrderRecord = {
    ...input.order,
    checkoutUrl: null,
    expiredAt: input.now,
    latestPaymentAttempt: "expired",
    latestPaymentReason: "expired",
    orderStatus: "expired",
    paymentStatus: "unpaid",
    stateVersion: input.order.stateVersion === 1 ? 2 : input.order.stateVersion,
    updatedAt: input.now
  };
  await input.store.updateOrder(next);
  return next;
}

export async function expireCheckoutIfDue(input: Readonly<{
  now: string;
  order: OrderRecord | null;
  store: AgenticStore;
}>): Promise<OrderRecord | null> {
  const order = input.order;
  if (!order) {
    return null;
  }
  if (order.orderStatus !== "open" || order.paymentStatus !== "unpaid") {
    return order;
  }
  if (!order.checkoutExpiresAt || Date.parse(input.now) < Date.parse(order.checkoutExpiresAt)) {
    return order;
  }
  return expireUnpaidOrder({ now: input.now, order, store: input.store });
}

function fulfilmentTracking(
  retail: Readonly<{ orderNumber: string; trackingUrl: string }> | null | undefined,
  events: readonly FulfilmentEventRecord[]
) {
  if (retail) {
    return [{ number: retail.orderNumber, url: retail.trackingUrl }];
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const payload = events[index]?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      continue;
    }
    const record = payload as Record<string, unknown>;
    const number =
      typeof record.tracking === "string"
        ? record.tracking
        : typeof record.number === "string"
          ? record.number
          : null;
    const url = typeof record.url === "string" ? record.url : null;
    if (number) {
      return [{ number, url: url ?? `https://track.th-mock.test/${number}` }];
    }
  }

  return [];
}

function fulfilmentReason(events: readonly FulfilmentEventRecord[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.status !== "exception") {
      continue;
    }
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : {};
    return typeof payload.reasonCode === "string" ? payload.reasonCode : "fulfilment_exception";
  }
  return null;
}

export function orderPollView(input: Readonly<{
  checkoutUrl: string | null;
  found: boolean;
  fulfilmentEvents?: readonly FulfilmentEventRecord[];
  localeMessage: (key: string) => string;
  order: OrderRecord | null;
  retail?: Readonly<{
    contributionMargin?: Readonly<{
      currency: string;
      grossCustomerAmount: number;
      mattanutraMarginAmount: number;
      retailerPayableAmount: number;
      status: string | null;
    }> | null;
    orderId: string;
    orderNumber: string;
    orderStatus: string;
    trackingUrl: string;
  }> | null;
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
  const events = input.fulfilmentEvents ?? [];
  const paid = order.paymentStatus === "paid";
  const declined = order.latestPaymentAttempt === "declined";
  const processing = order.paymentStatus === "processing";
  const expired = order.orderStatus === "expired";
  const cancelled = order.orderStatus === "cancelled";
  const refunded =
    order.paymentStatus === "refunded" || order.paymentStatus === "partially_refunded";
  const exception = order.fulfilmentStatus === "exception";
  const delivered = order.fulfilmentStatus === "delivered";
  const reasonCode = fulfilmentReason(events);
  const terminal = delivered || expired || refunded || cancelled;
  const messageKey = cancelled
    ? "order.cancelled"
    : expired
      ? "order.expired"
      : exception
        ? "order.fulfilment_exception"
        : declined
          ? "order.payment_declined_retry"
          : paid
            ? "order.paid"
            : processing
              ? "order.processing"
              : refunded
                ? "order.refunded"
                : "order.open_unpaid";
  const nextAction = exception
    ? "contact_support"
    : terminal
      ? "none"
      : declined || order.paymentStatus === "unpaid"
        ? "open_checkout"
        : "poll";

  const frozenOrder = publicFrozenOrder(order.frozenPlan);
  const frozenRecord =
    frozenOrder && typeof frozenOrder === "object"
      ? (frozenOrder as Record<string, unknown>)
      : {};
  const channel =
    frozenRecord.channel === "agentic" || frozenRecord.channel === "web"
      ? frozenRecord.channel
      : String(order.checkoutUrl ?? "").includes("mode=agentic")
        ? "agentic"
        : "web";

  return {
    channel,
    checkoutExpiresAt: order.checkoutExpiresAt,
    checkoutUrl: input.checkoutUrl,
    frozenOrder,
    fulfilment: {
      deliveryWindow: null,
      reasonCode,
      status: publicFulfilmentStatus(order.fulfilmentStatus),
      tracking: fulfilmentTracking(input.retail, events)
    },
    latestPaymentAttempt: order.latestPaymentAttempt,
    latestPaymentReason: order.latestPaymentReason,
    lookupStatus: "found",
    message: input.localeMessage(messageKey),
    messageKey,
    nextAction,
    ok: true as const,
    orderReference: order.reference,
    ...(input.retail
      ? {
          retailCustomerOrder: {
            orderId: input.retail.orderId,
            orderNumber: input.retail.orderNumber,
            orderStatus: input.retail.orderStatus,
            trackingUrl: input.retail.trackingUrl,
            ...(input.retail.contributionMargin
              ? { contributionMargin: input.retail.contributionMargin }
              : {})
          }
        }
      : {}),
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    ...(terminal
      ? { pollAfterSeconds: 0, terminal: true as const }
      : { pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS, terminal: false as const }),
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
