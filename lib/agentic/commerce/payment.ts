import type { AgenticConfig } from "@/lib/agentic/config";
import type { OrderRecord } from "@/lib/agentic/store/types";

export type PaymentEventScenario =
  | "amount_mismatch"
  | "currency_mismatch"
  | "decline_insufficient_funds"
  | "duplicate_success"
  | "expire"
  | "partial_refund"
  | "processing_then_success"
  | "provider_unavailable"
  | "refund"
  | "success"
  | "three_ds_cancelled"
  | "three_ds_failed"
  | "three_ds_required"
  | "three_ds_succeeded";

export type VerifiedPaymentEvent = Readonly<{
  amountMinor: number;
  currency: string;
  providerEventId: string;
  providerSessionId: string;
  reason: string | null;
  scenario: PaymentEventScenario;
  status:
    | "declined"
    | "expired"
    | "partially_refunded"
    | "processing"
    | "refunded"
    | "succeeded"
    | "unavailable";
}>;

export type CheckoutSessionResult = Readonly<{
  checkoutUrl: string;
  expiresAt: string;
  providerSessionId: string;
}>;

export interface PaymentPort {
  createCheckoutSession(input: Readonly<{
    config: AgenticConfig;
    now: string;
    order: OrderRecord;
  }>): Promise<CheckoutSessionResult>;
}

export function createMockPaymentAdapter(): PaymentPort {
  return {
    async createCheckoutSession(input) {
      const providerSessionId = `mock_cs_${input.order.id.replace(/-/g, "")}`;
      const expiresAt = new Date(
        Date.parse(input.now) + input.config.checkoutTtlMs
      ).toISOString();

      return {
        checkoutUrl: `${input.config.siteUrl}/en/mcp/checkout/pending`,
        expiresAt,
        providerSessionId
      };
    }
  };
}

export function mockEventForScenario(input: Readonly<{
  amountMinor: number;
  currency: string;
  orderId: string;
  providerSessionId: string;
  scenario: PaymentEventScenario;
}>): VerifiedPaymentEvent {
  const base = {
    amountMinor: input.amountMinor,
    currency: input.currency,
    providerEventId: `mock_evt_${input.scenario}_${input.orderId.replace(/-/g, "").slice(0, 12)}`,
    providerSessionId: input.providerSessionId
  };

  switch (input.scenario) {
    case "decline_insufficient_funds":
      return { ...base, reason: "insufficient_funds", scenario: input.scenario, status: "declined" };
    case "processing_then_success":
      return { ...base, reason: null, scenario: input.scenario, status: "processing" };
    case "provider_unavailable":
      return { ...base, reason: "provider_unavailable", scenario: input.scenario, status: "unavailable" };
    case "amount_mismatch":
      return { ...base, amountMinor: input.amountMinor + 1, reason: "amount_mismatch", scenario: input.scenario, status: "succeeded" };
    case "currency_mismatch":
      return { ...base, currency: "USD", reason: "currency_mismatch", scenario: input.scenario, status: "succeeded" };
    case "three_ds_required":
      return { ...base, reason: "three_ds_required", scenario: input.scenario, status: "processing" };
    case "three_ds_cancelled":
      return { ...base, reason: "three_ds_cancelled", scenario: input.scenario, status: "declined" };
    case "three_ds_failed":
      return { ...base, reason: "three_ds_failed", scenario: input.scenario, status: "declined" };
    case "expire":
      return { ...base, reason: "expired", scenario: input.scenario, status: "expired" };
    case "refund":
      return { ...base, reason: null, scenario: input.scenario, status: "refunded" };
    case "partial_refund":
      return { ...base, reason: null, scenario: input.scenario, status: "partially_refunded" };
    case "duplicate_success":
    case "success":
    case "three_ds_succeeded":
    default:
      return { ...base, reason: null, scenario: input.scenario, status: "succeeded" };
  }
}
