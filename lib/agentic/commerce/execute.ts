import type { AgenticConfig } from "@/lib/agentic/config";
import { AGENTIC_POLL_AFTER_SECONDS } from "@/lib/agentic/config";
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
import { expireCheckoutIfDue } from "@/lib/agentic/commerce/state";
import { publicFrozenItems } from "@/lib/agentic/public-mapper";
import { getRetailOrderByAgenticOrderId } from "@/lib/retail-product-checkout";
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
  stateVersion: number;
  successUrl?: string;
}>;

async function withLiveOrderState(input: Readonly<{
  config: AgenticConfig;
  now: string;
  scope: CapabilityScope;
  store: AgenticStore;
  stored: ExecuteSuccess;
}>): Promise<ExecuteSuccess> {
  const capability = await resolveCapability({
    action: "order.read",
    config: input.config,
    handle: input.stored.orderHandle,
    now: input.now,
    resourceType: "order",
    scope: input.scope,
    store: input.store
  });

  if (!capability) {
    return input.stored;
  }

  const loaded = await input.store.getOrder(capability.resourceId);

  if (!loaded) {
    return input.stored;
  }

  const order =
    (await expireCheckoutIfDue({
      now: input.now,
      order: loaded,
      store: input.store
    })) ?? loaded;

  const live: ExecuteSuccess = {
    ...input.stored,
    checkoutExpiresAt: order.checkoutExpiresAt ?? input.stored.checkoutExpiresAt,
    checkoutUrl: order.checkoutUrl ?? input.stored.checkoutUrl,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    stateVersion: order.stateVersion
  };

  if (order.paymentStatus === "paid") {
    const retail = await getRetailOrderByAgenticOrderId(order.id);
    const orderNumber = retail?.orderNumber?.trim();
    if (orderNumber) {
      const locale = negotiateLocale(
        typeof order.frozenPlan === "object" &&
          order.frozenPlan &&
          "locale" in order.frozenPlan
          ? String((order.frozenPlan as { locale?: unknown }).locale ?? "en")
          : "en"
      );
      return {
        ...live,
        successUrl: `${input.config.siteUrl}/${locale}/order/track/${encodeURIComponent(orderNumber)}`
      };
    }
  }

  const { successUrl: _omitBareSuccessUrl, ...withoutSuccessUrl } = live;
  return withoutSuccessUrl;
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
    return withLiveOrderState({
      config: input.config,
      now: input.now,
      scope: input.scope,
      store: input.store,
      stored: replay.response
    });
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
      now: input.now,
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

    const existingOrder = await store.getActiveOrderForPlanRevision(
      plan.id,
      plan.currentRevision
    );

    if (existingOrder) {
      const stored = await store.getExecuteResponseForOrder(existingOrder.id);
      if (!isExecuteSuccess(stored)) {
        return executeError(locale, "not_found");
      }
      const recovered = await withLiveOrderState({
        config: input.config,
        now: input.now,
        scope: input.scope,
        store,
        stored
      });

      await commitIdempotency({
        key: input.idempotencyKey,
        now: input.now,
        operation: "execute",
        ownerScope,
        payload,
        resourceIds: { orderId: existingOrder.id },
        response: recovered,
        store
      });
      return recovered;
    }

    const payable = payableSnapshot({
      shippingMinor: DEFAULT_SHIPPING_MINOR,
      subtotalMinor: selected.totalPriceMinor,
      taxMinor: DEFAULT_TAX_MINOR
    });
    const orderId = nextTestUuid();
    const reference = humanOrderReference(orderId);
    const checkoutIssued = await issueCapability({
      allowedActions: ["checkout.pay"],
      config: input.config,
      expiresAt: new Date(Date.parse(input.now) + input.config.checkoutTtlMs).toISOString(),
      now: input.now,
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
      createdAt: input.now,
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
        totalPriceMinor: payable.totalPriceMinor
      },
      fulfilmentStatus: "not_started" as const,
      id: orderId,
      latestPaymentAttempt: null,
      latestPaymentReason: null,
      orderStatus: "open" as const,
      paymentStatus: "unpaid" as const,
      planId: plan.id,
      planRevision: plan.currentRevision,
      principalScope: input.scope.principalScope,
      providerSessionId: null,
      reference,
      stateVersion: 1,
      tenantScope: input.scope.tenantScope,
      totalPriceMinor: payable.totalPriceMinor,
      updatedAt: input.now
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
      now: input.now,
      order: draftOrder
    });
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
      createdAt: input.now,
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
      now: input.now,
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
      stateVersion: 1
    };

    await commitIdempotency({
      key: input.idempotencyKey,
      now: input.now,
      operation: "execute",
      ownerScope,
      payload,
      resourceIds: { orderId },
      response,
      store
    });

    return response;
  });
}
