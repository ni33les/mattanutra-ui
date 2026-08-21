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
import { agenticMessage } from "@/lib/agentic/i18n";
import { publicFrozenItems } from "@/lib/agentic/public-mapper";
import type { PlanResult } from "@/lib/agentic/plan/types";
import { ensureCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import {
  TH_MOCK_SHIPPING_MINOR,
  TH_MOCK_TAX_MINOR,
  payableSnapshot
} from "@/lib/agentic/money";

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
      return businessError({ message: "Not found.", reasonCode: "not_found" });
    }

    const plan = await store.getPlan(capability.resourceId);

    if (!plan) {
      return businessError({ message: "Not found.", reasonCode: "not_found" });
    }

    if (plan.currentRevision !== input.expectedRevision) {
      return businessError({
        fieldPath: "expectedRevision",
        message: "The plan revision is stale. Reload the latest revision.",
        reasonCode: "revision_conflict"
      });
    }

    const revision = await store.getPlanRevision(plan.id, plan.currentRevision);

    if (!revision || revision.status !== "ready") {
      return businessError({
        message: "This plan is not ready to execute.",
        reasonCode: "plan_not_ready"
      });
    }

    const result = revision.result as PlanResult;
    const selected = result.selected;
    const snapshot = await ensureCatalogueSnapshot(
      input.config.environment,
      result.requestSnapshot.destinationCountry
    );
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
      return businessError({
        message: "Availability changed. Create a new plan revision before checkout.",
        reasonCode: "availability_changed"
      });
    }

    const payable = payableSnapshot({
      shippingMinor: TH_MOCK_SHIPPING_MINOR,
      subtotalMinor: selected.totalPriceMinor,
      taxMinor: TH_MOCK_TAX_MINOR
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
        prompt: agenticMessage("en", "feedback.invitation"),
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
