import type { AgenticConfig } from "@/lib/agentic/config";
import { AGENTIC_POLL_AFTER_SECONDS } from "@/lib/agentic/config";
import { RESPONSIBILITY_VERSION } from "@/lib/agentic/discovery/versions";
import { responsibilitySnapshot } from "@/lib/agentic/responsibility/matrix";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { humanOrderReference } from "@/lib/agentic/contract/ids";
import {
  hashCapability,
  issueCapability,
  nextTestUuid,
  resolveCapability,
  type CapabilityScope
} from "@/lib/agentic/capabilities";
import { beginIdempotency, commitIdempotency } from "@/lib/agentic/idempotency";
import type { PaymentPort } from "@/lib/agentic/commerce/payment";
import type { AgenticStore, OrderRecord } from "@/lib/agentic/store/types";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import type { Locale } from "@/lib/i18n";

import { publicFrozenItems } from "@/lib/agentic/public-mapper";

import type { PlanResult } from "@/lib/agentic/plan/types";
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

const executeLocks = new WeakMap<AgenticStore, Map<string, Promise<unknown>>>();

function enqueueExecute<T>(
  store: AgenticStore,
  key: string,
  work: () => Promise<T>
): Promise<T> {
  const locks = executeLocks.get(store) ?? new Map<string, Promise<unknown>>();
  executeLocks.set(store, locks);
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => work());
  locks.set(key, next);
  return next;
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
    return replay.response;
  }

  return enqueueExecute(
    input.store,
    `${ownerScope}:${input.planHandle}:${input.expectedRevision}`,
    () => executeFresh(input, ownerScope, payload)
  );
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
  payload: Readonly<{ expectedRevision: number; planHandle: string }>
) {
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

  if (!peekedRevision || peekedRevision.status !== "ready") {
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
  const snapshot = await ensureCatalogueSnapshot(
    input.config.environment,
    peekedResult.requestSnapshot.destinationCountry
  );

  return input.store.transaction(async (store) => {
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

    const plan = await store.getPlan(capability.resourceId);

    if (!plan) {
      return executeError("en", "not_found");
    }

    if (plan.currentRevision !== input.expectedRevision) {
      return revisionConflict("en", input.expectedRevision, plan.currentRevision);
    }

    const revision = await store.getPlanRevision(plan.id, plan.currentRevision);

    if (!revision || revision.status !== "ready") {
      return executeError("en", "plan_not_ready");
    }

    const result = revision.result as PlanResult;
    const locale = negotiateLocale(result.requestSnapshot.locale);
    const selected = result.selected;
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

    const existingOrder = await store.getActiveOrderForPlanRevision(
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

    const payable = payableSnapshot({
      shippingMinor: DEFAULT_SHIPPING_MINOR,
      subtotalMinor: selected.totalPriceMinor,
      taxMinor: DEFAULT_TAX_MINOR
    });
    bindQaChannel(plan.id, channel);
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
    const checkoutIssued = await issueCapability({
      allowedActions: ["checkout.pay"],
      config: input.config,
      expiresAt: new Date(Date.parse(now) + input.config.checkoutTtlMs).toISOString(),
      now,
      resourceId: orderId,
      resourceType: "checkout",
      scope: input.scope,
      store
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

    await store.insertOrder(draftOrder);
    await store.insertOrderItems(
      selected.basket.map((item) => ({
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
      }))
    );

    const session = await input.payment.createCheckoutSession({
      config: input.config,
      now,
      order: draftOrder
    });
    const orderNumber = reference;
    void `/${locale}/order/track/${encodeURIComponent(orderNumber)}`;
    const checkoutUrl = `${input.config.siteUrl}/${locale}/basket/checkout?mode=agentic&order=${encodeURIComponent(checkoutIssued.handle)}`;
    const order = {
      ...draftOrder,
      checkoutUrl,
      checkoutExpiresAt: session.expiresAt,
      providerSessionId: session.providerSessionId
    };
    await store.updateOrder(order);
    await store.insertCheckout({
      accessHash: order.checkoutAccessHash!,
      createdAt: now,
      encryptedAddress: null,
      expiresAt: session.expiresAt,
      id: nextTestUuid(),
      orderId,
      providerSessionId: session.providerSessionId,
      shippingMinor: payable.shippingMinor,
      taxMinor: payable.taxMinor
    });

    const orderCapability = await issueCapability({
      allowedActions: ["order.read", "support.create"],
      config: input.config,
      now,
      resourceId: orderId,
      resourceType: "order",
      scope: input.scope,
      store
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

    await commitFunnelEvent({
      attribution: "agent_connector",
      correlationId: plan.id,
      createdAt: now,
      eventId: `execute:${orderId}`,
      eventType: "execute_created",
      payload: { locale }
    });
    await commitFunnelEvent({
      attribution: "agent_connector",
      correlationId: plan.id,
      createdAt: now,
      eventId: `checkout:${orderId}`,
      eventType: "checkout_opened",
      payload: { locale }
    });

    return response;
  });
}
