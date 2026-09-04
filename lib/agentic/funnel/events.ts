export const FUNNEL_EVENT_TYPES = [
  "connector_viewed",
  "connected",
  "plan_ready",
  "confirmed",
  "checkout_created",
  "payment_declined",
  "paid",
  "dispatched",
  "delivered"
] as const;

export type FunnelEventType = (typeof FUNNEL_EVENT_TYPES)[number];

const INTERNAL_TO_PUBLIC = {
  info_shown: "connector_viewed",
  plan_created: "connected",
  plan_ready: "plan_ready",
  execute_created: "confirmed",
  checkout_opened: "checkout_created",
  payment_declined: "payment_declined",
  payment_succeeded: "paid",
  fulfilment_dispatched: "dispatched",
  order_delivered: "delivered"
} as const;

export function toPublicFunnelEventType(value: string): FunnelEventType | null {
  if ((FUNNEL_EVENT_TYPES as readonly string[]).includes(value)) {
    return value as FunnelEventType;
  }
  const mapped = INTERNAL_TO_PUBLIC[value as keyof typeof INTERNAL_TO_PUBLIC];
  return mapped ?? null;
}

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
  return typeof value === "string" && toPublicFunnelEventType(value) != null;
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

export const CONTRIBUTION_FORMULA_ID = "contrib.payment_minus_costs_v1";

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

export type ContributionSnapshot = Readonly<{
  acquisitionMinor: number;
  attribution: FunnelAttribution;
  contributionMinor: number | null;
  currency: string;
  paymentFeeMinor: number;
  paymentMinor: number;
  productCostMinor: number;
  shippingSubsidyMinor: number;
}>;

export function freezeContributionInputs(input: Readonly<{
  attribution: FunnelAttribution;
  acquisitionMinor: number;
  currency: string;
  paymentFeeMinor?: number;
  paymentMinor: number;
  productCostMinor: number;
  shippingSubsidyMinor?: number;
}>) {
  return {
    acquisitionMinor: Math.max(0, Math.trunc(input.acquisitionMinor)),
    attribution: input.attribution,
    currency: input.currency,
    paymentFeeMinor: Math.max(0, Math.trunc(input.paymentFeeMinor ?? 0)),
    paymentMinor: Math.trunc(input.paymentMinor),
    productCostMinor: Math.trunc(input.productCostMinor),
    shippingSubsidyMinor: Math.max(0, Math.trunc(input.shippingSubsidyMinor ?? 0))
  };
}

export function contributionFromFrozen(input: Readonly<{
  frozen: unknown;
  paid: boolean;
}>): ContributionSnapshot | null {
  if (!input.frozen || typeof input.frozen !== "object" || Array.isArray(input.frozen)) {
    return null;
  }
  const root = input.frozen as Record<string, unknown>;
  const raw =
    root.contribution && typeof root.contribution === "object" && !Array.isArray(root.contribution)
      ? (root.contribution as Record<string, unknown>)
      : root;
  if (typeof raw.acquisitionMinor !== "number" || typeof raw.paymentMinor !== "number") {
    return null;
  }
  const snapshot = freezeContributionInputs({
    acquisitionMinor: raw.acquisitionMinor,
    attribution: attributionOf(raw.attribution),
    currency: typeof raw.currency === "string" ? raw.currency : "THB",
    paymentFeeMinor: typeof raw.paymentFeeMinor === "number" ? raw.paymentFeeMinor : 0,
    paymentMinor: raw.paymentMinor,
    productCostMinor: typeof raw.productCostMinor === "number" ? raw.productCostMinor : 0,
    shippingSubsidyMinor: typeof raw.shippingSubsidyMinor === "number" ? raw.shippingSubsidyMinor : 0
  });
  return {
    ...snapshot,
    contributionMinor: input.paid ? contributionMinor(snapshot) : null
  };
}

export function publicContribution(input: Readonly<{
  acquisitionMinor: number;
  contributionMinor: number | null;
  paymentFeeMinor: number;
  paymentMinor: number | null;
  productCostMinor: number | null;
  shippingSubsidyMinor: number;
}>) {
  return {
    contributionMinor: input.contributionMinor,
    formulaId: CONTRIBUTION_FORMULA_ID,
    inputs: {
      acquisitionCostMinor: input.acquisitionMinor,
      customerPaymentMinor: input.paymentMinor,
      paymentFeeMinor: input.paymentFeeMinor,
      productCostMinor: input.productCostMinor,
      shippingSubsidyMinor: input.shippingSubsidyMinor
    }
  };
}
