import { qaHarnessAvailable, type AgenticConfig } from "@/lib/agentic/config";
import { businessError } from "@/lib/agentic/contract/errors";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import {
  mockEventForScenario,
  type PaymentEventScenario
} from "@/lib/agentic/commerce/payment";
import { applyVerifiedPaymentEvent } from "@/lib/agentic/commerce/state";
import { applyFulfilmentEvent, processOmsOutbox } from "@/lib/agentic/retail/mock-thailand";
import type { AgenticStore } from "@/lib/agentic/store/types";
import { recordFunnelEvent } from "@/lib/agentic/funnel/ledger";

export async function drivePaymentFixture(input: Readonly<{
  config: AgenticConfig;
  correlationId?: string;
  now: string;
  orderHandle: string;
  scenario: PaymentEventScenario;
  scope: CapabilityScope;
  store: AgenticStore;
}>) {
  if (!qaHarnessAvailable(input.config)) {
    return businessError({
      message: "Not found.",
      reasonCode: "not_found"
    });
  }

  const capability = await resolveCapability({
    action: "order.read",
    config: input.config,
    handle: input.orderHandle,
    now: input.now,
    resourceType: "order",
    scope: input.scope,
    store: input.store
  });

  if (!capability) {
    return businessError({ message: "Not found.", reasonCode: "not_found" });
  }

  const order = await input.store.getOrder(capability.resourceId);
  if (!order?.providerSessionId) {
    return businessError({ message: "Not found.", reasonCode: "not_found" });
  }

  const event = mockEventForScenario({
    amountMinor: order.totalPriceMinor,
    currency: order.currency,
    orderId: order.id,
    providerSessionId: order.providerSessionId,
    scenario: input.scenario
  });

  const applied = await applyVerifiedPaymentEvent({
    event,
    now: input.now,
    store: input.store
  });

  const correlationId = input.correlationId ?? order.planId;
  if (applied?.applied && applied.order.paymentStatus === "paid") {
    await processOmsOutbox({ now: input.now, store: input.store });
    recordFunnelEvent({
      correlationId,
      createdAt: input.now,
      eventId: `pay-ok:${event.providerEventId}`,
      eventType: "payment_succeeded",
      payload: { locale: "en" }
    });
  } else if (applied?.applied && applied.order.latestPaymentAttempt === "declined") {
    recordFunnelEvent({
      correlationId,
      createdAt: input.now,
      eventId: `pay-no:${event.providerEventId}`,
      eventType: "payment_declined",
      payload: { locale: "en" }
    });
  }

  return applied;
}

export async function driveFulfilmentFixture(input: Readonly<{
  config: AgenticConfig;
  correlationId?: string;
  now: string;
  orderHandle: string;
  scope: CapabilityScope;
  status: "processing" | "packed" | "shipped" | "delivered";
  store: AgenticStore;
}>) {
  if (!qaHarnessAvailable(input.config)) {
    return businessError({
      message: "Not found.",
      reasonCode: "not_found"
    });
  }

  const capability = await resolveCapability({
    action: "order.read",
    config: input.config,
    handle: input.orderHandle,
    now: input.now,
    resourceType: "order",
    scope: input.scope,
    store: input.store
  });

  if (!capability) {
    return businessError({ message: "Not found.", reasonCode: "not_found" });
  }

  const order = await input.store.getOrder(capability.resourceId);
  if (order && order.paymentStatus !== "paid") {
    return businessError({
      fieldPath: "status",
      message: "Payment is not paid.",
      reasonCode: "invalid_request"
    });
  }
  const correlationId = input.correlationId ?? order?.planId;
  const updated = await applyFulfilmentEvent({
    now: input.now,
    orderId: capability.resourceId,
    status: input.status,
    store: input.store
  });

  if (correlationId && input.status === "shipped") {
    recordFunnelEvent({
      correlationId,
      createdAt: input.now,
      eventId: `ship:${capability.resourceId}:${input.now}`,
      eventType: "fulfilment_dispatched",
      payload: { locale: "en" }
    });
  }

  if (correlationId && input.status === "delivered") {
    recordFunnelEvent({
      correlationId,
      createdAt: input.now,
      eventId: `dlv:${capability.resourceId}:${input.now}`,
      eventType: "order_delivered",
      payload: { locale: "en" }
    });
  }

  return updated;
}
