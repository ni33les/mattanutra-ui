import { writeBpmEvent, type BpmEventInput, type BpmEventType } from "@/lib/bpm";

/**
 * Fulfillment-specific BPM event types.
 * These provide complete observability for the Dream Pharmacy order lifecycle.
 */
export type FulfillmentBpmEventName =
  | "fulfillment_order_created"
  | "fulfillment_order_state_transition"
  | "pharmacist_task_claimed"
  | "pharmacist_task_completed"
  | "pharmacist_task_failed"
  | "stock_movement_recorded"
  | "invoice_generated"
  | "tracking_number_added"
  | "order_shipped"
  | "order_delivered"
  | "order_issue_reported"
  | "pharmacist_payout_recorded"
  | "supplier_invoice_received"
  | "supplier_payment_made"
  | "tax_calculated"
  | "fulfillment_order_cancelled"
  | "fulfillment_order_returned";

/**
 * Status values used in fulfillment BPM events.
 */
export type FulfillmentBpmStatus =
  | "received"
  | "sourcing"
  | "stock_confirmed"
  | "packed"
  | "shipped"
  | "delivered"
  | "issue_reported"
  | "returned"
  | "cancelled"
  | "task_claimed"
  | "task_completed"
  | "invoice_english"
  | "invoice_thai"
  | "tax_vat_7"
  | "tax_other";

export type FulfillmentBpmActor = "pharmacist" | "system" | "admin" | "customer";

type BaseFulfillmentInput = Omit<
  BpmEventInput,
  "eventName" | "eventStatus" | "eventType" | "emittedBy" | "actorType"
> &
  Readonly<{
    fulfillmentOrderId: string;
    paymentId?: string | null;
    planId?: string | null;
    pharmacistId?: string | null;
    properties?: Record<string, unknown>;
  }>;

export async function writeFulfillmentBpmEvent({
  eventName,
  eventStatus,
  fulfillmentOrderId,
  paymentId,
  planId,
  pharmacistId,
  properties = {},
  severity,
  ...rest
}: BaseFulfillmentInput & {
  eventName: FulfillmentBpmEventName | string;
  eventStatus: FulfillmentBpmStatus | string;
}) {
  const isError =
    eventName.endsWith("_failed") ||
    eventName.endsWith("_error") ||
    eventStatus.includes("failed") ||
    eventStatus.includes("issue");

  await writeBpmEvent({
    ...rest,
    actorType: pharmacistId ? "worker" : "system",
    emittedBy: "dream_pharmacy_fulfillment",
    eventName,
    eventStatus,
    eventType: "fulfillment" as BpmEventType,
    planId: planId ?? null,
    properties: {
      ...properties,
      fulfillmentOrderId,
      paymentId: paymentId ?? null,
      pharmacistId: pharmacistId ?? null,
    },
    severity: severity ?? (isError ? "high" : "low"),
  });
}

/**
 * Convenience helpers for the most common fulfillment steps.
 * These should be called from order state machine transitions and task handlers.
 */

export async function writeFulfillmentOrderCreated(input: BaseFulfillmentInput) {
  await writeFulfillmentBpmEvent({
    ...input,
    eventName: "fulfillment_order_created",
    eventStatus: "received",
  });
}

export async function writeFulfillmentStateTransition(
  input: BaseFulfillmentInput & {
    fromStatus: string;
    toStatus: string;
  }
) {
  await writeFulfillmentBpmEvent({
    ...input,
    eventName: "fulfillment_order_state_transition",
    eventStatus: input.toStatus as FulfillmentBpmStatus,
    properties: {
      ...input.properties,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
    },
  });
}

export async function writePharmacistTaskEvent(
  input: BaseFulfillmentInput & {
    taskId: string;
    taskType: string;
    action: "claimed" | "completed" | "failed";
  }
) {
  const eventName =
    input.action === "claimed"
      ? "pharmacist_task_claimed"
      : input.action === "completed"
        ? "pharmacist_task_completed"
        : "pharmacist_task_failed";

  await writeFulfillmentBpmEvent({
    ...input,
    eventName,
    eventStatus: input.action === "claimed" ? "task_claimed" : "task_completed",
    properties: {
      ...input.properties,
      taskId: input.taskId,
      taskType: input.taskType,
    },
  });
}

export async function writeInvoiceGenerated(
  input: BaseFulfillmentInput & {
    language: "en" | "th" | string;
    invoiceId?: string | null;
    totalWithTax?: number | null;
    currency?: string | null;
  }
) {
  const status = input.language === "th" ? "invoice_thai" : "invoice_english";

  await writeFulfillmentBpmEvent({
    ...input,
    eventName: "invoice_generated",
    eventStatus: status,
    properties: {
      ...input.properties,
      invoiceLanguage: input.language,
      invoiceId: input.invoiceId ?? null,
      totalWithTax: input.totalWithTax ?? null,
      currency: input.currency ?? "THB",
    },
  });
}

export async function writeTaxCalculated(
  input: BaseFulfillmentInput & {
    taxType: "vat" | "wht" | string;
    rate: number;
    taxableAmount: number;
    taxAmount: number;
    currency: string;
  }
) {
  await writeFulfillmentBpmEvent({
    ...input,
    eventName: "tax_calculated",
    eventStatus: input.taxType === "vat" ? "tax_vat_7" : "tax_other",
    properties: {
      ...input.properties,
      taxType: input.taxType,
      taxRate: input.rate,
      taxableAmount: input.taxableAmount,
      taxAmount: input.taxAmount,
      currency: input.currency,
    },
  });
}

export async function writeTrackingAdded(
  input: BaseFulfillmentInput & {
    trackingNumber: string;
    carrier?: string | null;
  }
) {
  await writeFulfillmentBpmEvent({
    ...input,
    eventName: "tracking_number_added",
    eventStatus: "shipped",
    properties: {
      ...input.properties,
      trackingNumber: input.trackingNumber,
      carrier: input.carrier ?? null,
    },
  });
}
