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
import { contributionFromFrozen, publicContribution } from "@/lib/agentic/funnel/events";
import {
  funnelAttribution,
  listFunnelEvents,
  loadPersistedFunnelEvents
} from "@/lib/agentic/funnel/ledger";
import { queryBudgetSnapshot } from "@/lib/agentic/plan/query-budget";
import {
  hasPersistedQueryCounts,
  persistedQueryCounts
} from "@/lib/agentic/qa/persist";
import {
  bindQaChannel,
  channelCost,
  QA_NAMESPACE_PREFIX,
  qaSession,
  resolveQaSession
} from "@/lib/agentic/qa/session";
import type { AgenticStore } from "@/lib/agentic/store/types";

let commitNowGate: Promise<void> | null = null;
let commitNowEntered: (() => void) | null = null;

export function setCommitNowLatchForTests(
  gate: Promise<void> | null,
  entered: (() => void) | null = null
) {
  commitNowGate = gate;
  commitNowEntered = entered;
}

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

function readObservedQueries(namespace?: string | null) {
  if (namespace) {
    if (hasPersistedQueryCounts(namespace)) {
      return persistedQueryCounts(namespace);
    }
    return queryBudgetSnapshot(namespace);
  }
  return queryBudgetSnapshot(namespace ?? undefined);
}

function frozenDependencyBudget(queries: Record<string, number>) {
  return {
    catalogueSnapshots: queries["catalogue.snapshot.TH"] ?? 0,
    planMatchHits: queries["plan.match.hit"] ?? 0,
    planMatchMisses: queries["plan.match.miss"] ?? 0,
    polling: false as const,
    sleeps: 0 as const
  };
}

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
  "preparing",
  "dispatched",
  "delivered"
] as const;

export type FulfilmentFixtureStatus = (typeof FULFILMENT_STATUSES)[number];

export function isFulfilmentStatus(value: unknown): value is FulfilmentFixtureStatus {
  return typeof value === "string" && (FULFILMENT_STATUSES as readonly string[]).includes(value);
}

export function omsFulfilmentStatus(
  status: FulfilmentFixtureStatus
): "packed" | "shipped" | "delivered" {
  if (status === "preparing") {
    return "packed";
  }
  if (status === "dispatched") {
    return "shipped";
  }
  return "delivered";
}

async function commitNowForOrder(input: Readonly<{
  config: AgenticConfig;
  now: string;
  orderHandle: string;
  scope: CapabilityScope;
  store: AgenticStore;
}>) {
  commitNowEntered?.();
  if (commitNowGate) {
    await commitNowGate;
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
  if (!order) {
    return businessError({ message: "Not found.", reasonCode: "not_found" });
  }
  const namespace = order.principalScope?.startsWith(QA_NAMESPACE_PREFIX)
    ? order.principalScope
    : null;
  if (!namespace) {
    return businessError({
      message: "QA namespace context is missing.",
      reasonCode: "not_found"
    });
  }
  const session = await resolveQaSession(namespace);
  if (!session) {
    return businessError({
      message: "QA namespace context is missing.",
      reasonCode: "not_found"
    });
  }
  return { now: session.now, namespace };
}

export async function simulatePayment(input: Readonly<{
  config: AgenticConfig;
  now: string;
  orderHandle: string;
  scenario: PaymentEventScenario;
  scope: CapabilityScope;
  store: AgenticStore;
}>) {
  const clock = await commitNowForOrder(input);
  if (isAgenticErrorResult(clock)) {
    return clock;
  }
  const driven = await drivePaymentFixture({ ...input, now: clock.now });
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
        now: clock.now,
        store: input.store
      });
    }
  }

  if (scenarioSubmitsOms(input.scenario)) {
    await processOmsOutbox({ now: clock.now, store: input.store });
  }

  return orderTool({
    config: input.config,
    now: clock.now,
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
  const clock = await commitNowForOrder(input);
  if (isAgenticErrorResult(clock)) {
    return clock;
  }
  const driven = await driveFulfilmentFixture({
    ...input,
    now: clock.now,
    status: omsFulfilmentStatus(input.status)
  });
  if (isAgenticErrorResult(driven)) {
    return driven;
  }

  return orderTool({
    config: input.config,
    now: clock.now,
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
  const harnessOn =
    input.config.internalQaHarness && input.config.environment !== "prd";
  if (!harnessOn) {
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

  const namespace =
    input.namespace ||
    (order?.principalScope?.startsWith(QA_NAMESPACE_PREFIX) ? order.principalScope : undefined);
  if (namespace) {
    await resolveQaSession(namespace, { readOnly: true });
  }

  if (!correlationId) {
    return businessError({
      fieldPath: "orderHandle",
      message: "orderHandle is required.",
      reasonCode: "required"
    });
  }

  await loadPersistedFunnelEvents(correlationId);
  const session = qaSession(namespace) ?? qaSession(input.namespace);
  if (session && correlationId && !order) {
    bindQaChannel(correlationId, session);
  }
  const events = listFunnelEvents(correlationId);
  const paid = Boolean(order && order.paymentStatus === "paid");
  const frozen = order ? contributionFromFrozen({ frozen: order.frozenPlan, paid }) : null;
  const cost = channelCost(correlationId, order ? undefined : input.namespace);
  const attribution =
    frozen?.attribution ??
    (cost.attribution === "unattributed" ? funnelAttribution(correlationId) : cost.attribution);
  const items = order ? await input.store.getOrderItems(order.id) : [];
  const productCostMinor = frozen?.productCostMinor ?? items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const paymentMinor = frozen?.paymentMinor ?? order?.totalPriceMinor ?? 0;
  const paymentFeeMinor = frozen?.paymentFeeMinor ?? 0;
  const shippingSubsidyMinor = frozen?.shippingSubsidyMinor ?? 0;
  const acquisitionMinor = frozen?.acquisitionMinor ?? cost.acquisitionMinor;
  const contribution = frozen?.contributionMinor ?? null;
  const queryNs = namespace ?? input.namespace ?? session?.namespace;
  const queries = readObservedQueries(queryNs);

  return {
    ok: true as const,
    acquisitionMinor,
    attribution,
    clock: session?.now ?? input.now,
    contribution: publicContribution({
      acquisitionMinor,
      contributionMinor: contribution,
      paymentFeeMinor,
      paymentMinor: order ? paymentMinor : null,
      productCostMinor: order ? productCostMinor : null,
      shippingSubsidyMinor
    }),
    contributionMinor: contribution,
    correlationId,
    currency: frozen?.currency ?? order?.currency ?? null,
    dependencyBudget: frozenDependencyBudget(queries),
    paymentFeeMinor,
    paymentMinor: order ? paymentMinor : null,
    productCostMinor: order ? productCostMinor : null,
    shippingSubsidyMinor,
    events: events.map((event) => ({
      anonymousCorrelation: event.payload.anonymousCorrelation,
      attribution: event.attribution,
      createdAt: event.createdAt,
      eventId: event.eventId,
      eventType: event.eventType,
      locale: event.payload.locale,
      sequence: event.sequence
    })),
    namespace: queryNs ?? null,
    queries
  };
}
