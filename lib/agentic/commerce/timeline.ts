import type {
  FulfilmentEventRecord,
  OrderItemRecord,
  OrderRecord,
  PaymentAttemptRecord
} from "@/lib/agentic/store/types";

export const COMMERCE_TIMELINE = [
  "open",
  "payment_declined",
  "paid",
  "preparing",
  "dispatched",
  "delivered"
] as const;

export type CommerceTimelineStatus = (typeof COMMERCE_TIMELINE)[number];

const RANK: Record<CommerceTimelineStatus, number> = {
  open: 0,
  payment_declined: 1,
  paid: 2,
  preparing: 3,
  dispatched: 4,
  delivered: 5
};

export function publicFulfilmentStatus(status: string) {
  if (status === "packed" || status === "processing") {
    return "preparing";
  }
  if (status === "shipped") {
    return "dispatched";
  }
  return status;
}

export function commerceTimelineStatus(order: OrderRecord): CommerceTimelineStatus {
  if (order.fulfilmentStatus === "delivered") {
    return "delivered";
  }
  if (order.fulfilmentStatus === "shipped") {
    return "dispatched";
  }
  if (order.paymentStatus === "paid") {
    if (order.fulfilmentStatus === "packed") {
      return "preparing";
    }
    return "paid";
  }
  if (order.latestPaymentAttempt === "declined") {
    return "payment_declined";
  }
  return "open";
}

export function canAdvanceTimeline(
  current: CommerceTimelineStatus,
  next: CommerceTimelineStatus
) {
  return RANK[next] >= RANK[current];
}

export function nextStateVersion(
  order: OrderRecord,
  next: CommerceTimelineStatus
) {
  const current = commerceTimelineStatus(order);
  if (RANK[next] > RANK[current]) {
    return order.stateVersion + 1;
  }
  return order.stateVersion;
}

export function orderedEventLedger(input: Readonly<{
  fulfilment: readonly FulfilmentEventRecord[];
  order: OrderRecord;
  paymentAttempts: readonly Readonly<{
    createdAt: string;
    id: string;
    status: string;
  }>[];
}>) {
  const rows: Array<Readonly<{
    createdAt: string;
    id: string;
    kind: "fulfilment" | "order" | "payment";
    status: string;
  }>> = [
    {
      createdAt: input.order.createdAt,
      id: `order:${input.order.id}`,
      kind: "order",
      status: "open"
    },
    ...input.paymentAttempts.map((item) => ({
      createdAt: item.createdAt,
      id: `payment:${item.id}`,
      kind: "payment" as const,
      status: item.status
    })),
    ...input.fulfilment.map((item) => ({
      createdAt: item.createdAt,
      id: `fulfilment:${item.id}`,
      kind: "fulfilment" as const,
      status: publicFulfilmentStatus(item.status)
    }))
  ];

  const kindRank = { order: 0, payment: 1, fulfilment: 2 } as const;
  const statusRank: Record<string, number> = {
    open: 0,
    declined: 1,
    processing: 2,
    succeeded: 3,
    paid: 4,
    preparing: 5,
    dispatched: 6,
    delivered: 7
  };

  return rows.sort((left, right) => {
    const byTime = left.createdAt.localeCompare(right.createdAt);
    if (byTime !== 0) {
      return byTime;
    }
    const byKind = kindRank[left.kind] - kindRank[right.kind];
    if (byKind !== 0) {
      return byKind;
    }
    const byStatus = (statusRank[left.status] ?? 50) - (statusRank[right.status] ?? 50);
    if (byStatus !== 0) {
      return byStatus;
    }
    return left.status.localeCompare(right.status);
  });
}

export function buildOrderProjection(input: Readonly<{
  fulfilment: readonly FulfilmentEventRecord[];
  items: readonly OrderItemRecord[];
  order: OrderRecord;
  paymentAttempts: readonly PaymentAttemptRecord[];
}>) {
  return {
    events: orderedEventLedger({
      fulfilment: input.fulfilment,
      order: input.order,
      paymentAttempts: input.paymentAttempts
    }),
    money: {
      currency: input.order.currency,
      items: input.items.map((item) => ({
        lineTotalMinor: item.lineTotalMinor,
        productId: item.productId,
        quantity: item.quantity
      })),
      totalPriceMinor: input.order.totalPriceMinor
    },
    stateVersion: input.order.stateVersion,
    timeline: commerceTimelineStatus(input.order)
  };
}
