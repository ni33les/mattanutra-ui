import { nextTestUuid } from "@/lib/agentic/capabilities";
import type { RetailerAdapterId } from "@/lib/agentic/config";
import type { AgenticStore, OrderRecord } from "@/lib/agentic/store/types";
import { nextStateVersion, commerceTimelineStatus } from "@/lib/agentic/commerce/timeline";
import { commitFunnelEvent } from "@/lib/agentic/funnel/ledger";

export type FulfilmentAdvanceStatus =
  | "cancelled"
  | "delivered"
  | "exception"
  | "packed"
  | "processing"
  | "shipped";

const RANK: Record<string, number> = {
  not_started: 0,
  processing: 1,
  packed: 2,
  shipped: 3,
  delivered: 4,
  cancelled: 4,
  exception: 2
};

function rankOf(status: string) {
  return RANK[status] ?? 0;
}

function shippedPayload() {
  return {
    carrier: "TH-MOCK",
    number: "TH-QA-TRACK",
    status: "shipped",
    tracking: "TH-QA-TRACK",
    url: "https://track.th-mock.test/TH-QA-TRACK"
  };
}

export async function processOmsOutbox(input: Readonly<{
  adapter?: RetailerAdapterId;
  now: string;
  store: AgenticStore;
}>) {
  if (input.adapter === "thailand_live") {
    return;
  }

  // Each transaction claims one event, so it holds at most one order lock.
  // A bounded pass avoids making a payment callback drain the whole backlog.
  for (let index = 0; index < 25; index++) {
    const processed = await input.store.transaction(async store => {
      const [event] = await store.claimOutboxBatch(1);
      if (!event) return false;
      if (event.orderId) {
        const order = await store.getOrderForUpdate(event.orderId);
        const existing = await store.getRetailLink(event.orderId);
        if (!existing) {
          await store.insertRetailLink({adapter: "mock_thailand", createdAt: input.now, orderId: event.orderId, retailerReference: `th-mock-${event.orderId.slice(0, 8)}`});
        }
        if (order?.fulfilmentStatus === "not_started" && order.paymentStatus === "paid") {
          await applyFulfilmentInTransaction({now: input.now, orderId: order.id, status: "processing", store}, order);
        }
      }
      await store.markOutboxProcessed(event.id, input.now);
      return true;
    });
    if (!processed) break;
  }
}

export async function applyFulfilmentEvent(input: Readonly<{
  now: string;
  orderId: string;
  reasonCode?: string;
  status: FulfilmentAdvanceStatus;
  store: AgenticStore;
}>): Promise<OrderRecord | null> {
  const result = await input.store.transaction(store => applyFulfilmentInTransaction({...input, store}));
  if (result && result.fulfilmentStatus === input.status) {
    if (input.status === "shipped") {
      await commitFunnelEvent({
        attribution: "agent_connector",
        correlationId: result.planId,
        createdAt: input.now,
        eventId: `ship:${result.id}`,
        eventType: "fulfilment_dispatched",
        payload: { locale: "en" }
      });
    }
    if (input.status === "delivered") {
      await commitFunnelEvent({
        attribution: "agent_connector",
        correlationId: result.planId,
        createdAt: input.now,
        eventId: `dlv:${result.id}`,
        eventType: "order_delivered",
        payload: { locale: "en" }
      });
    }
  }
  return result;
}

async function applyFulfilmentInTransaction(input: Readonly<{
  now: string;
  orderId: string;
  reasonCode?: string;
  status: FulfilmentAdvanceStatus;
  store: AgenticStore;
}>, lockedOrder?: OrderRecord): Promise<OrderRecord | null> {
  const order = lockedOrder ?? await input.store.getOrderForUpdate(input.orderId);

  if (!order) {
    return null;
  }

  if (order.paymentStatus !== "paid" && input.status !== "cancelled") {
    return order;
  }

  const current = order.fulfilmentStatus;
  const terminal = current === "delivered" || current === "cancelled";

  if (terminal) {
    return order;
  }

  if (input.status !== "exception" && rankOf(input.status) < rankOf(current)) {
    return order;
  }

  if (input.status !== "exception" && input.status === current) {
    return order;
  }

  const nextStatus =
    input.status === "exception" ? "exception" : input.status;
  const projected: OrderRecord = {
    ...order,
    fulfilmentStatus: nextStatus,
    orderStatus: input.status === "cancelled" ? "cancelled" : order.orderStatus,
    updatedAt: input.now
  };
  const next: OrderRecord = {
    ...projected,
    stateVersion: nextStateVersion(order, commerceTimelineStatus(projected))
  };
  await input.store.updateOrder(next);
  const prior = await input.store.listFulfilmentEvents(order.id);
  const payments = await input.store.listPaymentAttempts(order.id);
  const sequence = 1 + payments.length + prior.length;
  const basePayload =
    input.status === "shipped"
      ? shippedPayload()
      : input.status === "exception"
        ? {
            nextAction: "contact_support",
            reasonCode: input.reasonCode ?? "delivery_exception",
            status: "exception"
          }
        : { status: input.status };
  await input.store.insertFulfilmentEvent({
    createdAt: input.now,
    id: nextTestUuid(),
    orderId: order.id,
    payload: { ...basePayload, sequence },
    status: input.status
  });


  return input.store.getOrder(input.orderId);
}

export async function advanceFulfilment(input: Readonly<{
  now: string;
  status: "processing" | "shipped" | "delivered" | "cancelled";
  store: AgenticStore;
  orderId: string;
}>) {
  return applyFulfilmentEvent(input);
}
