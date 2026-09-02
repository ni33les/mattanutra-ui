import { businessError, isAgenticErrorResult } from "@/lib/agentic/contract/errors";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import type { AgenticConfig } from "@/lib/agentic/config";
import {
  mockEventForScenario,
  type PaymentEventScenario
} from "@/lib/agentic/commerce/payment";
import { applyVerifiedPaymentEvent } from "@/lib/agentic/commerce/state";
import { processOmsOutbox } from "@/lib/agentic/retail/mock-thailand";
import {
  driveFulfilmentFixture,
  drivePaymentFixture
} from "@/lib/agentic/commerce/fixture-driver";
import { orderTool } from "@/lib/agentic/commerce/order";
import { contributionMinor } from "@/lib/agentic/funnel/events";
import {
  funnelAttribution,
  listFunnelEvents,
  loadPersistedFunnelEvents
} from "@/lib/agentic/funnel/ledger";
import { queryBudgetSnapshot } from "@/lib/agentic/plan/query-budget";
import { bindQaChannel, channelCost, qaSession } from "@/lib/agentic/qa/session";
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

export function scenarioSubmitsOms(scenario: PaymentEventScenario) {
  return (
    scenario === "success" ||
    scenario === "processing_then_success" ||
    scenario === "three_ds_succeeded" ||
    scenario === "duplicate_success"
  );
}

export const FULFILMENT_STATUSES = [
  "processing",
  "packed",
  "shipped",
  "delivered",
  "preparing",
  "dispatched"
] as const;

export type FulfilmentFixtureStatus = (typeof FULFILMENT_STATUSES)[number];

export function isFulfilmentStatus(value: unknown): value is FulfilmentFixtureStatus {
  return typeof value === "string" && (FULFILMENT_STATUSES as readonly string[]).includes(value);
}

export function omsFulfilmentStatus(
  status: FulfilmentFixtureStatus
): "processing" | "packed" | "shipped" | "delivered" {
  if (status === "preparing") {
    return "packed";
  }
  if (status === "dispatched") {
    return "shipped";
  }
  return status;
}

export async function simulatePayment(input: Readonly<{
  config: AgenticConfig;
  now: string;
  orderHandle: string;
  scenario: PaymentEventScenario;
  scope: CapabilityScope;
  store: AgenticStore;
}>) {
  const driven = await drivePaymentFixture(input);
  if (isAgenticErrorResult(driven)) {
    return driven;
  }

  if (input.scenario === "processing_then_success") {
    const capability = await resolveCapability({
      action: "order.read",
      config: input.config,
      handle: input.orderHandle,
      now: input.now,
      resourceType: "order",
      scope: input.scope,
      store: input.store
    });
    const order = capability ? await input.store.getOrder(capability.resourceId) : null;
    if (order?.providerSessionId) {
      const event = mockEventForScenario({
        amountMinor: order.totalPriceMinor,
        currency: order.currency,
        orderId: order.id,
        providerSessionId: order.providerSessionId,
        scenario: "success"
      });
      await applyVerifiedPaymentEvent({
        event: { ...event, providerEventId: `${event.providerEventId}_success` },
        now: input.now,
        store: input.store
      });
    }
  }

  if (scenarioSubmitsOms(input.scenario)) {
    await processOmsOutbox({ now: input.now, store: input.store });
  }

  return orderTool({
    config: input.config,
    now: input.now,
    orderHandle: input.orderHandle,
    scope: input.scope,
    store: input.store
  });
}

export async function simulateFulfilment(input: Readonly<{
  config: AgenticConfig;
  now: string;
  orderHandle: string;
  scope: CapabilityScope;
  status: FulfilmentFixtureStatus;
  store: AgenticStore;
}>) {
  const driven = await driveFulfilmentFixture({
    ...input,
    status: omsFulfilmentStatus(input.status)
  });
  if (isAgenticErrorResult(driven)) {
    return driven;
  }

  return orderTool({
    config: input.config,
    now: input.now,
    orderHandle: input.orderHandle,
    scope: input.scope,
    store: input.store
  });
}

export async function observeQaJourney(input: Readonly<{
  config: AgenticConfig;
  correlationId?: string;
  namespace?: string;
  now: string;
  orderHandle?: string;
  scope: CapabilityScope;
  store: AgenticStore;
}>) {
  const devHarness =
    input.config.internalQaHarness && input.config.environment === "dev";
  if (!devHarness) {
    return businessError({ message: "Not found.", reasonCode: "not_found" });
  }

  let correlationId = input.correlationId ?? "";
  let order = null as Awaited<ReturnType<AgenticStore["getOrder"]>>;

  if (input.orderHandle) {
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
    order = await input.store.getOrder(capability.resourceId);
    correlationId = correlationId || order?.planId || "";
  }

  if (!correlationId) {
    return businessError({
      fieldPath: "orderHandle",
      message: "orderHandle is required.",
      reasonCode: "required"
    });
  }

  await loadPersistedFunnelEvents(correlationId);
  const session = qaSession(input.namespace);
  if (session && correlationId) {
    bindQaChannel(correlationId, session);
  }
  const events = listFunnelEvents(correlationId);
  const cost = channelCost(correlationId, input.namespace);
  const attribution = cost.attribution === "unattributed" ? funnelAttribution(correlationId) : cost.attribution;
  const items = order ? await input.store.getOrderItems(order.id) : [];
  const productCostMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const contribution =
    order && order.paymentStatus === "paid"
      ? contributionMinor({
          acquisitionMinor: cost.acquisitionMinor,
          paymentFeeMinor: 0,
          paymentMinor: order.totalPriceMinor,
          productCostMinor,
          shippingSubsidyMinor: 0
        })
      : null;

  return {
    ok: true as const,
    attribution,
    clock: session?.now ?? input.now,
    contributionMinor: contribution,
    correlationId,
    events: events.map((event) => ({
      attribution: event.attribution,
      createdAt: event.createdAt,
      eventId: event.eventId,
      eventType: event.eventType,
      sequence: event.sequence
    })),
    namespace: input.namespace ?? session?.namespace ?? null,
    queries: queryBudgetSnapshot()
  };
}
