export const FUNNEL_EVENT_TYPES = [
  "info_shown",
  "plan_created",
  "plan_ready",
  "execute_created",
  "checkout_opened",
  "payment_declined",
  "payment_succeeded",
  "fulfilment_dispatched",
  "order_delivered"
] as const;

export type FunnelEventType = (typeof FUNNEL_EVENT_TYPES)[number];

export const FUNNEL_ATTRIBUTIONS = ["agent_connector", "qa_campaign"] as const;

export type FunnelAttribution = (typeof FUNNEL_ATTRIBUTIONS)[number] | "unattributed";

const PROHIBITED_FUNNEL_KEYS = [
  "address",
  "body",
  "checkoutToken",
  "health",
  "message",
  "paymentSecret",
  "supportBody"
] as const;

export function isFunnelEventType(value: unknown): value is FunnelEventType {
  return typeof value === "string" && FUNNEL_EVENT_TYPES.includes(value as FunnelEventType);
}

export function attributionOf(value: unknown): FunnelAttribution {
  if (value === "agent_connector" || value === "qa_campaign") {
    return value;
  }
  return "unattributed";
}

export function rejectProhibitedFunnelPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const keys = Object.keys(payload as Record<string, unknown>);
  const hit = keys.find((key) =>
    PROHIBITED_FUNNEL_KEYS.some((needle) => key.toLowerCase().includes(needle.toLowerCase()))
  );
  return hit ?? null;
}

export function contributionMinor(input: Readonly<{
  acquisitionMinor: number;
  paymentFeeMinor: number;
  paymentMinor: number;
  productCostMinor: number;
  shippingSubsidyMinor: number;
}>) {
  return (
    input.paymentMinor -
    input.productCostMinor -
    input.shippingSubsidyMinor -
    input.paymentFeeMinor -
    input.acquisitionMinor
  );
}
