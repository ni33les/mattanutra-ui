import { writeBpmEvent, type BpmEventInput } from "@/lib/bpm";

export type PaymentBpmStatus =
  | "bound"
  | "cancelled"
  | "checkout_opened"
  | "checkout_session_created"
  | "config_error"
  | "expired"
  | "failed"
  | "fulfillment_failed"
  | "fulfillment_started"
  | "paid"
  | "processing"
  | "received"
  | "requested";

type SkippedPaymentSuccessInput = Omit<
  BpmEventInput,
  "actorType" | "emittedBy" | "eventName" | "eventStatus" | "eventType"
>;

export async function writePaymentBpmEvent({
  errorCode,
  errorMessage,
  eventName,
  eventStatus,
  paymentId,
  properties,
  severity,
  stripeEventId,
  stripeSessionId,
  ...input
}: Omit<BpmEventInput, "eventName" | "eventStatus" | "eventType" | "properties"> &
  Readonly<{
    eventName: string;
    eventStatus: PaymentBpmStatus | "accounting_failed" | "accounting_recorded" | string;
    paymentId?: string | null;
    properties?: Record<string, unknown>;
    stripeEventId?: string | null;
    stripeSessionId?: string | null;
  }>) {
  const isError =
    Boolean(errorCode || errorMessage) ||
    eventName.endsWith("_failed") ||
    eventName.endsWith("_error") ||
    eventName.includes("signature_failed");

  await writeBpmEvent({
    ...input,
    actorType: input.actorType ?? (isError ? "system" : "visitor"),
    emittedBy: input.emittedBy ?? "stripe_payment_flow",
    errorCode,
    errorMessage,
    eventName,
    eventStatus,
    eventType: isError ? "error" : "payment",
    properties: {
      ...properties,
      paymentId: paymentId ?? null,
      stripeEventId: stripeEventId ?? null,
      stripeSessionId: stripeSessionId ?? null
    },
    severity: severity ?? (isError ? "high" : "low")
  });
}

export async function writeSkippedPaymentSuccessEvent({
  properties,
  ...input
}: SkippedPaymentSuccessInput) {
  await writeBpmEvent({
    ...input,
    actorType: "system",
    emittedBy: "payment_skip_mock",
    eventName: "plan_paid",
    eventStatus: "paid",
    eventType: "payment",
    properties: {
      ...properties,
      mocked: true,
      paymentSkipped: true,
      reason: "payments_not_live"
    }
  });
}
