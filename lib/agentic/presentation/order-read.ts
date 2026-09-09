import { canonicalHash } from "@/lib/agentic/value/canonical";
import type { FulfilmentEventRecord, OrderRecord } from "@/lib/agentic/store/types";

export type OrderReadProjection = Readonly<{ version: 1; frozenHash: string; presentation: Record<string, unknown> }>;
export function orderReadProjection(frozen: unknown): OrderReadProjection {
  const value = frozen && typeof frozen === "object" ? frozen as Record<string, unknown> : {};
  return { version: 1, frozenHash: canonicalHash(frozen), presentation: Object.fromEntries(
    ["channel", "subtotalMinor", "shippingMinor", "taxMinor"].filter(key => key in value).map(key => [key, value[key]])) };
}
export type OrderReadState = Readonly<{ order: OrderRecord; fulfilmentEvents: readonly FulfilmentEventRecord[] }>;
export function compactFulfilmentEvents(events: readonly FulfilmentEventRecord[]): FulfilmentEventRecord[] {
  let tracking: FulfilmentEventRecord | undefined, exception: FulfilmentEventRecord | undefined;
  for (const event of events) {
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    if (typeof payload.tracking === "string" || typeof payload.number === "string") tracking = event;
    if (event.status === "exception") exception = event;
  }
  return events.filter(event => event === tracking || event === exception).map(event => {
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    return { ...event, payload: Object.fromEntries(["tracking", "number", "url", "reasonCode"].filter(key => key in payload).map(key => [key, payload[key]])) };
  });
}
/** Expiry is presentation on reads. Payment/checkout mutations re-read under lock. */
export function orderForRead(order: OrderRecord | null, now: string): OrderRecord | null {
  if (!order || order.orderStatus !== "open" || order.paymentStatus !== "unpaid" || !order.checkoutExpiresAt ||
      Date.parse(now) < Date.parse(order.checkoutExpiresAt)) return order;
  return { ...order, checkoutUrl: null, expiredAt: order.checkoutExpiresAt, latestPaymentAttempt: "expired",
    latestPaymentReason: "expired", orderStatus: "expired", paymentStatus: "unpaid",
    stateVersion: order.stateVersion === 1 ? 2 : order.stateVersion, updatedAt: order.checkoutExpiresAt };
}
