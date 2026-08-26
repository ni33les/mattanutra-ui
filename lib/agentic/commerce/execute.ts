import { randomUUID } from "node:crypto";
import type { AgenticConfig } from "@/lib/agentic/config";
import { AGENTIC_POLL_AFTER_SECONDS } from "@/lib/agentic/config";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { humanOrderReference } from "@/lib/agentic/contract/ids";
import {
  hashCapability,
  issueCapability,
  resolveCapability,
  type CapabilityScope
} from "@/lib/agentic/capabilities";
import { beginIdempotency, commitIdempotency } from "@/lib/agentic/idempotency";
import type { PaymentPort } from "@/lib/agentic/commerce/payment";
import type { AgenticStore } from "@/lib/agentic/store/types";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import type { Locale } from "@/lib/i18n";
import { publicFrozenItems } from "@/lib/agentic/public-mapper";
import type { PlanResult } from "@/lib/agentic/plan/types";
import { ensureCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import {
  DEFAULT_SHIPPING_MINOR,
  DEFAULT_TAX_MINOR,
  payableSnapshot
} from "@/lib/agentic/money";

function executeError(
  locale: Locale,
  reasonCode:
    | "availability_changed"
    | "not_found"
    | "plan_not_ready"
    | "revision_conflict",
  fieldPath?: string
) {
  return businessError({
    fieldPath,
    message: agenticMessage(locale, `mcp.errors.${reasonCode}`),
    reasonCode
  });
}

export type ExecuteSuccess = Readonly<{
  checkoutExpiresAt: string;
  checkoutUrl: string;
  feedbackInvitation: Readonly<{ prompt: string; promptKey: string }>;
  frozenPlan: unknown;
  ok: true;
  orderHandle: string;
  orderReference: string;
  orderStatus: "open";
  paymentStatus: "unpaid";
  pollAfterSeconds: number;
  stateVersion: 1;
  successUrl: string;
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
    return executeError("en", "revision_conflict", "expectedRevision");
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
      return executeError("en", "revision_conflict", "expectedRevision");
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

    const openOrder = await store.getOpenOrderForPlanRevision(
      plan.id,
      plan.currentRevision
    );

    if (
      openOrder &&
      openOrder.orderStatus === "open" &&
      openOrder.paymentStatus === "unpaid" &&
      !openOrder.cancelledAt &&
      !openOrder.expiredAt &&
      (!openOrder.checkoutExpiresAt || openOrder.checkoutExpiresAt > input.now)
    ) {
      const prior = await store.getExecuteResponseForOrder(openOrder.id);
      const reused =
        prior && typeof prior === "object"
          ? (prior as ExecuteSuccess)
          : null;

      if (reused?.ok === true && reused.orderHandle && reused.checkoutUrl) {
        await commitIdempotency({
          key: input.idempotencyKey,
          now: input.now,
          operation: "execute",
          ownerScope,
          payload,
          resourceIds: { orderId: openOrder.id },
          response: reused,
          store
        });
        return reused;
      }
    }

    const payable = payableSnapshot({
      shippingMinor: DEFAULT_SHIPPING_MINOR,
      subtotalMinor: selected.totalPriceMinor,
      taxMinor: DEFAULT_TAX_MINOR
    });
    const orderId = randomUUID();
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
        coveragePercent: selected.coveragePercent,
        currency: result.requestSnapshot.currency,
        dailyPills: selected.dailyPills,
        items: publicFrozenItems(selected.basket),
        planRevision: plan.currentRevision,
        safetyGuidanceIds: result.safetyGuidance.map((item) => item.guidanceId),
        shippingMinor: payable.shippingMinor,
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
        id: randomUUID(),
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
    const checkoutUrl = `${input.config.siteUrl}/en/mcp/checkout/${checkoutIssued.handle}`;
    const successUrl = `${input.config.siteUrl}/en/order/track`;
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
      id: randomUUID(),
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
      stateVersion: 1,
      successUrl
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
