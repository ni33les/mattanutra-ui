import type { AgenticRuntime } from "@/lib/agentic/runtime";

export type RedactedOrderCounts = Readonly<{
  alertP0Count: number;
  fulfilmentStatus: string | null;
  omsChildOrderCount: number;
  omsSubmitCount: number;
  outboxPendingCount: number;
  paymentAttemptCount: number;
  paymentConfirmedCount: number;
  paymentDeclinedCount: number;
  paymentStatus: string | null;
  providerEventCount: number;
  stateVersion: number | null;
}>;

export async function redactedOrderCounts(input: Readonly<{
  orderId: string;
  runtime: AgenticRuntime;
}>): Promise<RedactedOrderCounts> {
  const [order, audits, attempts, pending, retail] = await Promise.all([
    input.runtime.store.getOrder(input.orderId),
    input.runtime.store.listPaymentAudits(input.orderId),
    input.runtime.store.listPaymentAttempts(input.orderId),
    input.runtime.store.getOutboxPending(),
    input.runtime.store.getRetailLink(input.orderId)
  ]);
  const outboxPendingCount = pending.filter((item) => item.orderId === input.orderId).length;
  const rejected = order?.latestPaymentAttempt === "rejected";

  return {
    alertP0Count: rejected ? 1 : 0,
    fulfilmentStatus: order?.fulfilmentStatus ?? null,
    omsChildOrderCount: retail ? 1 : 0,
    omsSubmitCount: retail ? 1 : 0,
    outboxPendingCount,
    paymentAttemptCount: attempts.length,
    paymentConfirmedCount: audits.filter((item) => item.type === "payment_confirmed").length,
    paymentDeclinedCount: audits.filter((item) => item.type === "payment_declined").length,
    paymentStatus: order?.paymentStatus ?? null,
    providerEventCount: attempts.length,
    stateVersion: order?.stateVersion ?? null
  };
}
