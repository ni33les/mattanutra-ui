import { nextTestUuid } from "@/lib/agentic/capabilities";
import type { RetailerAdapterId } from "@/lib/agentic/config";
import type { AgenticStore, OrderRecord } from "@/lib/agentic/store/types";
import { nextStateVersion, commerceTimelineStatus } from "@/lib/agentic/commerce/timeline";

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
  if (input.adapter && input.adapter !== "mock_thailand") {
    return;
  }

  const pending = await input.store.getOutboxPending();

  for (const event of pending) {
    if (event.type !== "OMS_SUBMIT" || !event.orderId) {
      continue;
    }

    const existing = await input.store.getRetailLink(event.orderId);

    if (!existing) {
      await input.store.insertRetailLink({
        adapter: "mock_thailand",
        createdAt: input.now,
        orderId: event.orderId,
        retailerReference: `th-mock-${event.orderId.slice(0, 8)}`
      });
    }

    const order = await input.store.getOrder(event.orderId);

    if (order && order.fulfilmentStatus === "not_started" && order.paymentStatus === "paid") {
      await applyFulfilmentEvent({
        now: input.now,
        orderId: order.id,
        status: "processing",
        store: input.store
      });
    }

    await input.store.markOutboxProcessed(event.id, input.now);
  }
}

export async function applyFulfilmentEvent(input: Readonly<{
  now: string;
  orderId: string;
  reasonCode?: string;
  status: FulfilmentAdvanceStatus;
  store: AgenticStore;
}>): Promise<OrderRecord | null> {
  const order = await input.store.getOrder(input.orderId);

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
  await input.store.insertFulfilmentEvent({
    createdAt: input.now,
    id: nextTestUuid(),
    orderId: order.id,
    payload:
      input.status === "shipped"
        ? shippedPayload()
        : input.status === "exception"
          ? {
              nextAction: "contact_support",
              reasonCode: input.reasonCode ?? "delivery_exception",
              status: "exception"
            }
          : { status: input.status },
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
