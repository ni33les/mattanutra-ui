import { businessError } from "@/lib/agentic/contract/errors";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import type { AgenticConfig } from "@/lib/agentic/config";
import {
  mockEventForScenario,
  type PaymentEventScenario
} from "@/lib/agentic/commerce/payment";
import { applyVerifiedPaymentEvent } from "@/lib/agentic/commerce/state";
import { processOmsOutbox } from "@/lib/agentic/retail/mock-thailand";
import { orderTool } from "@/lib/agentic/commerce/order";
import type { AgenticStore } from "@/lib/agentic/store/types";

const SCENARIOS: readonly PaymentEventScenario[] = [
  "success",
  "decline_insufficient_funds",
  "processing_then_success",
  "provider_unavailable",
  "amount_mismatch",
  "currency_mismatch",
  "duplicate_success",
  "three_ds_required",
  "three_ds_cancelled",
  "three_ds_failed",
  "three_ds_succeeded",
  "expire",
  "refund",
  "partial_refund"
];

export function isPaymentScenario(value: unknown): value is PaymentEventScenario {
  return typeof value === "string" && SCENARIOS.includes(value as PaymentEventScenario);
}

export async function simulatePayment(input: Readonly<{
  config: AgenticConfig;
  now: string;
  orderHandle: string;
  scenario: PaymentEventScenario;
  scope: CapabilityScope;
  store: AgenticStore;
}>) {
  if (!input.config.internalQaHarness || input.config.environment !== "dev") {
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

  if (input.scenario === "processing_then_success") {
    await applyVerifiedPaymentEvent({ event, now: input.now, store: input.store });
    await applyVerifiedPaymentEvent({
      event: {
        ...event,
        providerEventId: `${event.providerEventId}_success`,
        status: "succeeded"
      },
      now: input.now,
      store: input.store
    });
  } else {
    await applyVerifiedPaymentEvent({ event, now: input.now, store: input.store });
  }

  await processOmsOutbox({ now: input.now, store: input.store });

  return orderTool({
    config: input.config,
    now: input.now,
    orderHandle: input.orderHandle,
    scope: input.scope,
    store: input.store
  });
}
