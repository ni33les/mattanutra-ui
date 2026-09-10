import { planContractCompatible } from "@/lib/agentic/presentation/compatibility";
import { catalogueSnapshotId } from "@/lib/agentic/catalogue/freeze";
import type { AgenticConfig } from "@/lib/agentic/config";
import { AGENTIC_POLL_AFTER_SECONDS } from "@/lib/agentic/config";
import { RESPONSIBILITY_VERSION } from "@/lib/agentic/discovery/versions";
import { responsibilitySnapshot } from "@/lib/agentic/responsibility/matrix";
import { businessError, isAgenticErrorResult, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { humanOrderReference } from "@/lib/agentic/contract/ids";
import {
  hashCapability,
  prepareCapability,
  nextTestUuid,
  resolveCapability,
  type CapabilityScope
} from "@/lib/agentic/capabilities";
import { beginIdempotency, commitIdempotency } from "@/lib/agentic/idempotency";
import type { PaymentPort } from "@/lib/agentic/commerce/payment";
import type { AgenticStore, OrderRecord, PlanRecord } from "@/lib/agentic/store/types";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import type { Locale } from "@/lib/i18n";

import { publicFrozenItems } from "@/lib/agentic/public-mapper";

import type { PlanResult } from "@/lib/agentic/plan/types";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { ensureCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import {
  ACTIVE_MARKET_COUNTRY,
  ACTIVE_RETAILER_ID,
  ACTIVE_RETAILER_NAME
} from "@/lib/agentic/catalogue/market";
import {
  DEFAULT_SHIPPING_MINOR,
  DEFAULT_TAX_MINOR,
  payableSnapshot
} from "@/lib/agentic/money";
import { commitFunnelEvent } from "@/lib/agentic/funnel/ledger";
import { freezeContributionInputs } from "@/lib/agentic/funnel/events";
import {
  bindQaChannel,
  channelForScope,
  QA_NAMESPACE_PREFIX,
  resolveQaSession
} from "@/lib/agentic/qa/session";
import {
  recordRequestStage,
  runObservedRequest,
  throwIfAborted
} from "@/lib/agentic/qa/request-trace";

let executeRequestSeq = 0;
// Historical QA snapshots remain readable; no process queue owns checkout execution.
export function captureExecuteLockState() { return new Map<string, Promise<unknown>>(); }
export function restoreExecuteLockState(snapshot: Map<string, Promise<unknown>>) { void snapshot; }
export function emptyExecuteLockState() { return new Map<string, Promise<unknown>>(); }
export function resetExecuteLockState() {
  executeFreshGate = null;
  executeFreshEntered = null;
  executeFollowerEntered = null;
  executeSerializeGate = null;
  executeSerializeEntered = null;
  executeFailAt = null;
  executeRequestSeq = 0;
}

let executeFreshGate: Promise<void> | null = null;
let executeFreshEntered: (() => void) | null = null;
let executeFollowerEntered: (() => void) | null = null;
let executeSerializeGate: Promise<void> | null = null;
let executeSerializeEntered: (() => void) | null = null;
let executeFailAt: "before_commit" | "at_commit" | "after_commit" | null = null;

export function setExecuteFreshGateForTests(gate: Promise<void> | null) {
  executeFreshGate = gate;
}

export function setExecuteFreshEnteredForTests(notify: (() => void) | null) {
  executeFreshEntered = notify;
}

export function setExecuteFollowerEnteredForTests(notify: (() => void) | null) {
  executeFollowerEntered = notify;
}

export function setExecuteSerializeGateForTests(gate: Promise<void> | null) {
  executeSerializeGate = gate;
}

export function setExecuteSerializeEnteredForTests(notify: (() => void) | null) {
  executeSerializeEntered = notify;
}

export function setExecuteFailAtForTests(
  at: "before_commit" | "at_commit" | "after_commit" | null
) {
  executeFailAt = at;
}

function executeError(
  locale: Locale,
  reasonCode:
    | "availability_changed"
    | "not_found"
    | "plan_not_ready",
  fieldPath?: string
) {
  return businessError({
    fieldPath,
    message: agenticMessage(locale, `mcp.errors.${reasonCode}`),
    reasonCode
  });
}

function revisionConflict(
  locale: Locale,
  requestedRevision: number,
  currentRevision: number
) {
  return businessError({
    currentRevision,
    fieldPath: "expectedRevision",
    message: agenticMessage(locale, "mcp.errors.revision_conflict"),
    nextAction: "reload_plan",
    nextActions: ["reload_plan"],
    reasonCode: "revision_conflict",
    requestedRevision,
    retryable: true
  });
}

function isExecuteSuccess(value: unknown): value is ExecuteSuccess {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === true &&
      typeof (value as { orderHandle?: unknown }).orderHandle === "string"
  );
}

export type ExecuteSuccess = Readonly<{
  checkoutExpiresAt: string;
  checkoutUrl: string;
  feedbackInvitation: Readonly<{ prompt: string; promptKey: string }>;
  frozenPlan: unknown;
  ok: true;
  orderHandle: string;
  orderReference: string;
  orderStatus: OrderRecord["orderStatus"];
  paymentStatus: OrderRecord["paymentStatus"];
  pollAfterSeconds: number;
  responsibility: ReturnType<typeof responsibilitySnapshot>;
  responsibilityVersion: string;
  stateVersion: number;
  successUrl?: string;
}>;

async function prepareCheckout(input: Parameters<typeof executeTool>[0], plan: PlanRecord, result: PlanResult,
  snapshot: CatalogueSnapshot, now: string, channel: ReturnType<typeof channelForScope>, namespace: string | null) {
  const selected = result.selected!;
  const locale = negotiateLocale(result.requestSnapshot.locale);
  const payable = payableSnapshot({
    shippingMinor: DEFAULT_SHIPPING_MINOR,
    // Freeze the purchased pack lines, including for older saved v4 results.
    subtotalMinor: selected.basket.reduce((sum, item) => sum + item.lineTotalMinor, 0),
    taxMinor: DEFAULT_TAX_MINOR
  });
  const contribution = freezeContributionInputs({
    acquisitionMinor: channel.acquisitionMinor,
    attribution: channel.attribution,
    currency: result.requestSnapshot.currency,
    paymentFeeMinor: 0,
    paymentMinor: payable.totalPriceMinor,
    productCostMinor: selected.basket.reduce((sum, item) => sum + item.lineTotalMinor, 0),
    shippingSubsidyMinor: 0
  });
  const orderId = nextTestUuid();
  const reference = humanOrderReference(orderId);
  const checkoutIssued = prepareCapability({
    allowedActions: ["checkout.pay"],
    config: input.config,
    expiresAt: new Date(Date.parse(now) + input.config.checkoutTtlMs).toISOString(),
    now,
    resourceId: orderId,
    resourceType: "checkout",
    scope: input.scope,
  });
  const draftOrder = {
    cancelledAt: null,
    checkoutAccessHash: hashCapability(input.config.capabilitySecret, checkoutIssued.handle),
    checkoutExpiresAt: checkoutIssued.record.expiresAt,
    checkoutUrl: null,
    completedAt: null,
    createdAt: now,
    currency: result.requestSnapshot.currency,
    destinationCountry: result.requestSnapshot.destinationCountry,
    environment: input.scope.environment,
    expiredAt: null,
    frozenPlan: {
      catalogueVersion: snapshot.catalogueVersion,
      channel: "agentic",
      countryCode: result.requestSnapshot.destinationCountry || ACTIVE_MARKET_COUNTRY,
      coveragePercent: selected.coveragePercent,
      currency: result.requestSnapshot.currency,
      dailyPills: selected.dailyPills,
      items: publicFrozenItems(selected.basket),
      market: {
        countryCode: result.requestSnapshot.destinationCountry || ACTIVE_MARKET_COUNTRY,
        retailerId: ACTIVE_RETAILER_ID,
        retailerName: ACTIVE_RETAILER_NAME
      },
      planRevision: plan.currentRevision,
      safetyGuidanceIds: result.safetyGuidance.map((item) => item.guidanceId),
      selectedOptionId: selected.optionId,
      shippingMinor: payable.shippingMinor,
      snapshotId: selected.snapshotId,
      subtotalMinor: payable.subtotalMinor,
      taxMinor: payable.taxMinor,
      totalPriceMinor: payable.totalPriceMinor,
      contribution
    },
    fulfilmentStatus: "not_started" as const,
    id: orderId,
    latestPaymentAttempt: null,
    latestPaymentReason: null,
    orderStatus: "open" as const,
    paymentStatus: "unpaid" as const,
    planId: plan.id,
    planRevision: plan.currentRevision,
    principalScope: namespace ?? input.scope.principalScope,
    providerSessionId: null,
    reference,
    stateVersion: 1,
    tenantScope: input.scope.tenantScope,
    totalPriceMinor: payable.totalPriceMinor,
    updatedAt: now
  };

  const items = selected.basket.map((item) => ({
      currency: item.currency || result.requestSnapshot.currency,
      dailyPills: item.dailyPills,
      form: item.form,
      id: nextTestUuid(),
      lineTotalMinor: item.lineTotalMinor,
      orderId,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      retailerSku: item.retailerSku,
      sellerId: item.sellerId,
      sellerName: item.sellerName,
      unitPriceMinor: item.unitPriceMinor
    }));
  const session = await input.payment.createCheckoutSession({
    config: input.config,
    now,
    order: draftOrder
  });
  const checkoutUrl = `${input.config.siteUrl}/${locale}/basket/checkout?mode=agentic&order=${encodeURIComponent(checkoutIssued.handle)}`;
  const order = {
    ...draftOrder,
    checkoutUrl,
    checkoutExpiresAt: session.expiresAt,
    providerSessionId: session.providerSessionId
  };
  const checkout = {
    accessHash: order.checkoutAccessHash!,
    createdAt: now,
    encryptedAddress: null,
    expiresAt: session.expiresAt,
    id: nextTestUuid(),
    orderId,
    providerSessionId: session.providerSessionId,
    shippingMinor: payable.shippingMinor,
    taxMinor: payable.taxMinor
  };

  const orderCapability = prepareCapability({
    allowedActions: ["order.read", "support.create"],
    config: input.config,
    now,
    resourceId: orderId,
    resourceType: "order",
    scope: input.scope,
  });

  const response: ExecuteSuccess = {
    checkoutExpiresAt: session.expiresAt,
    checkoutUrl,
    feedbackInvitation: {
      prompt: agenticMessage(locale, "feedback.invitation"),
      promptKey: "feedback.invitation"
    },
    frozenPlan: order.frozenPlan,
    ok: true,
    orderHandle: orderCapability.handle,
    orderReference: reference,
    orderStatus: "open",
    paymentStatus: "unpaid",
    pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS,
    responsibility: responsibilitySnapshot(locale),
    responsibilityVersion: RESPONSIBILITY_VERSION,
    stateVersion: 1
  };

  return { order, items, checkout, response, capabilities: [checkoutIssued.record, orderCapability.record] };
}

export async function executeTool(input: Readonly<{
  config: AgenticConfig;
  expectedRevision: number;
  idempotencyKey: string;
  now: string;
  payment: PaymentPort;
  planHandle: string;
  scope: CapabilityScope;
  store: AgenticStore;
}>): Promise<ExecuteSuccess | AgenticErrorResult> {
  const correlation = `execute:${input.idempotencyKey}:${++executeRequestSeq}`;
  return await runObservedRequest(correlation, () => executeToolBody(input, correlation)) as ExecuteSuccess | AgenticErrorResult;
}

async function executeToolBody(
  input: Readonly<{
    config: AgenticConfig;
    expectedRevision: number;
    idempotencyKey: string;
    now: string;
    payment: PaymentPort;
    planHandle: string;
    scope: CapabilityScope;
    store: AgenticStore;
  }>,
  correlation: string
): Promise<ExecuteSuccess | AgenticErrorResult> {
  await recordRequestStage(correlation, "ingress_accepted");
  await recordRequestStage(correlation, "handler_admitted");
  const ownerScope = `${input.scope.environment}:${input.scope.tenantScope}:${input.scope.principalScope ?? "anon"}`;
  const payload = {
    expectedRevision: input.expectedRevision,
    planHandle: input.planHandle
  };
  const replay = await beginIdempotency<ExecuteSuccess>({
    key: input.idempotencyKey,
    now: input.now,
    operation: "execute",
    ownerScope,
    payload,
    store: input.store
  });

  if (replay.kind === "conflict") {
    return replay.error;
  }

  if (replay.kind === "replay") {
    executeFollowerEntered?.();
    await recordRequestStage(correlation, "durable_committed");
    await recordRequestStage(correlation, "serialization_completed");
    await recordRequestStage(correlation, "response_handed_to_transport");
    await recordRequestStage(correlation, "request_released");
    return replay.response;
  }

  await recordRequestStage(correlation, "durable_started");
  try {
    const value = await executeFresh(input, ownerScope, payload, correlation);
    if (!isAgenticErrorResult(value)) {
      await recordRequestStage(correlation, "durable_committed");
      await recordRequestStage(correlation, "serialization_completed");
      await recordRequestStage(correlation, "response_handed_to_transport");
      await recordRequestStage(correlation, "request_released");
    }
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("execute_fail_")) {
      return businessError({
        correlationId: correlation,
        message: agenticMessage("en", "mcp.errors.temporarily_unavailable"),
        reasonCode: "temporarily_unavailable",
        retryable: true
      });
    }
    throw error;
  }
}

async function executeFresh(
  input: Readonly<{
    config: AgenticConfig;
    expectedRevision: number;
    idempotencyKey: string;
    now: string;
    payment: PaymentPort;
    planHandle: string;
    scope: CapabilityScope;
    store: AgenticStore;
  }>,
  ownerScope: string,
  payload: Readonly<{ expectedRevision: number; planHandle: string }>,
  correlation = `execute:${input.idempotencyKey}`
) {
  executeFreshEntered?.();
  if (executeFreshGate) {
    await executeFreshGate;
  }
  const peeked = await resolveCapability({
    action: "plan.execute",
    config: input.config,
    handle: input.planHandle,
    now: input.now,
    resourceType: "plan",
    scope: input.scope,
    store: input.store
  });

  if (!peeked) {
    return executeError("en", "not_found");
  }

  const peekedPlan = await input.store.getPlan(peeked.resourceId);

  if (!peekedPlan) {
    return executeError("en", "not_found");
  }

  if (peekedPlan.currentRevision !== input.expectedRevision) {
    return revisionConflict("en", input.expectedRevision, peekedPlan.currentRevision);
  }

  const peekedRevision = await input.store.getPlanRevision(
    peekedPlan.id,
    peekedPlan.currentRevision
  );

  if (!peekedRevision) {
    return executeError("en", "plan_not_ready");
  }

  const namespace =
    peekedPlan.principalScope?.startsWith(QA_NAMESPACE_PREFIX)
      ? peekedPlan.principalScope
      : input.scope.principalScope?.startsWith(QA_NAMESPACE_PREFIX)
        ? input.scope.principalScope
        : null;
  let now = input.now;
  let channel = channelForScope({
    principalScope: namespace ?? input.scope.principalScope
  });
  if (namespace) {
    const session = await resolveQaSession(namespace);
    if (!session) {
      return businessError({
        message: "QA namespace context is missing.",
        reasonCode: "not_found"
      });
    }
    now = session.now;
    channel = {
      acquisitionMinor: session.acquisitionMinor,
      attribution: session.attribution
    };
  }

  const peekedResult = peekedRevision.result as PlanResult;
  // Existing frozen checkout work must remain resumable even when old plan
  // policy or current catalogue availability differs.
  const peekedOrder = await input.store.getActiveOrderForPlanRevision(peekedPlan.id, peekedPlan.currentRevision);
  const snapshot = !peekedOrder && planContractCompatible(peekedResult.contractVersion) && peekedRevision.status === "ready"
    ? await ensureCatalogueSnapshot(input.config.environment, peekedResult.requestSnapshot.destinationCountry)
    : null;

  const prepared = snapshot && peekedResult.selected?.basket.length
    ? await prepareCheckout(input, peekedPlan, peekedResult, snapshot, now, channel, namespace) : null;

  const created: Array<{ locale: Locale; orderId: string; planId: string }> = [];
  const outcome = await input.store.transaction(async (store) => {
    throwIfAborted(correlation);
    const capability = await resolveCapability({
      action: "plan.execute",
      config: input.config,
      handle: input.planHandle,
      now,
      resourceType: "plan",
      scope: input.scope,
      store
    });

    if (!capability) {
      return executeError("en", "not_found");
    }

    const plan = await store.getPlanForUpdate(capability.resourceId);

    if (!plan) {
      return executeError("en", "not_found");
    }

    if (plan.currentRevision !== input.expectedRevision) {
      return revisionConflict("en", input.expectedRevision, plan.currentRevision);
    }

    const revision = await store.getPlanRevision(plan.id, plan.currentRevision);

    if (!revision) {
      return executeError("en", "plan_not_ready");
    }

    const result = revision.result as PlanResult;
    const locale = negotiateLocale(result.requestSnapshot.locale);
    const raced = await beginIdempotency<ExecuteSuccess>({
      key: input.idempotencyKey, now, operation: "execute", ownerScope, payload, store
    });
    if (raced.kind === "replay") return raced.response;
    if (raced.kind === "conflict") return raced.error;

    const existingOrder = await store.getActiveOrderForPlanRevisionForUpdate(
      plan.id,
      plan.currentRevision
    );

    if (existingOrder) {
      const stored = await store.getExecuteResponseForOrder(existingOrder.id);
      if (!isExecuteSuccess(stored)) {
        return executeError(locale, "not_found");
      }
      await commitIdempotency({
        key: input.idempotencyKey,
        now,
        operation: "execute",
        ownerScope,
        payload,
        resourceIds: { orderId: existingOrder.id },
        response: stored,
        store
      });
      return stored;
    }

    if (!planContractCompatible(result.contractVersion)) return businessError({ reasonCode: "not_found", message: "Not found.", fieldPath: "planHandle" });
    if (result.requestSnapshot.scoring && !result.requestSnapshot.pinnedOptionId) return businessError({ reasonCode: "plan_not_ready", fieldPath: "planHandle", message: "Select a returned option with the current revision before checkout." });
    if (revision.status !== "ready" || !snapshot) return executeError(locale, "plan_not_ready");

    const selected = result.selected;
    if (selected?.snapshotId && selected.snapshotId !== catalogueSnapshotId(snapshot)) return businessError({ fieldPath: "expectedRevision", reasonCode: "availability_changed", message: "Catalogue facts changed after this plan was evaluated. Refresh with scoring:{} and the current revision, then review and select before checkout.", nextActions: ["refresh_plan"] });
    const unavailable = Boolean(
      selected?.basket.some((item) => {
        const product = snapshot.products.find((row) => row.productId === item.productId);
        return (
          item.incompleteCommercialFacts ||
          !product ||
          !product.orderable ||
          product.incompleteCommercialFacts
        );
      })
    );

    if (!selected || unavailable) {
      return executeError(locale, "availability_changed");
    }

    if (selected.basket.length === 0) {
      return businessError({
        message:
          "Nothing needs to be bought now. Current stock covers today; replenish later in the requested horizon.",
        nextAction: "none",
        reasonCode: "invalid_request"
      });
    }

    if (!prepared || prepared.order.frozenPlan.selectedOptionId !== selected.optionId) return executeError(locale, "plan_not_ready");
    if (snapshot.runtimeRevision !== undefined && (!store.isCatalogueRevisionCurrent || !await store.isCatalogueRevisionCurrent(snapshot.runtimeRevision))) {
      return businessError({ fieldPath: "expectedRevision", reasonCode: "availability_changed", message: "Catalogue facts changed while checkout was prepared. Refresh the unexecuted plan before creating checkout.", nextActions: ["refresh_plan"] });
    }
    if (executeFailAt === "before_commit") throw new Error("execute_fail_before_commit");
    const { order, items, checkout, response, capabilities } = prepared;
    const orderId = order.id;
    for (const capability of capabilities) await store.insertCapability(capability);
    await store.insertOrder(order);
    await store.insertOrderItems(items);
    await store.insertCheckout(checkout);

    await commitIdempotency({
      key: input.idempotencyKey,
      now,
      operation: "execute",
      ownerScope,
      payload,
      resourceIds: { orderId },
      response,
      store
    });
    if (executeFailAt === "at_commit") {
      throw new Error("execute_fail_at_commit");
    }
    if (!response) {
      throw new Error("execute_fail_at_commit");
    }
    throwIfAborted(correlation);
    created.push({ locale, orderId, planId: plan.id });
    return response;
  });

  if (!isExecuteSuccess(outcome)) {
    return outcome;
  }

  executeSerializeEntered?.();
  if (executeSerializeGate) {
    await executeSerializeGate;
  }

  const funnel = created[0];
  if (funnel) {
    bindQaChannel(funnel.planId, channel);
    await commitFunnelEvent({
      attribution: "agent_connector",
      correlationId: funnel.planId,
      createdAt: now,
      eventId: `execute:${funnel.orderId}`,
      eventType: "execute_created",
      payload: { locale: funnel.locale }
    });
    await commitFunnelEvent({
      attribution: "agent_connector",
      correlationId: funnel.planId,
      createdAt: now,
      eventId: `checkout:${funnel.orderId}`,
      eventType: "checkout_opened",
      payload: { locale: funnel.locale }
    });
  }
  if (executeFailAt === "after_commit") {
    throw new Error("execute_fail_after_commit");
  }

  return outcome;
}
