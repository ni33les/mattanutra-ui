import { randomUUID } from "node:crypto";
import type { AgenticConfig } from "@/lib/agentic/config";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { humanCaseReference, supportMessageId } from "@/lib/agentic/contract/ids";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import {
  issueCapability,
  resolveCapability,
  type CapabilityScope
} from "@/lib/agentic/capabilities";
import { beginIdempotency, commitIdempotency, isIdempotencyRace } from "@/lib/agentic/idempotency";
import type { AgenticStore } from "@/lib/agentic/store/types";
import { commerceTimelineStatus, publicFulfilmentStatus } from "@/lib/agentic/commerce/timeline";

function systemAckBody(timeline: string) {
  if (timeline === "dispatched") {
    return "It is dispatched.";
  }
  if (timeline === "preparing") {
    return "It is being prepared.";
  }
  if (timeline === "delivered") {
    return "It is delivered.";
  }
  if (timeline === "paid") {
    return "Payment is confirmed.";
  }
  if (timeline === "payment_declined") {
    return "Payment was declined.";
  }
  return "The order is open.";
}

const CANNED_ACKS = new Set([
  "It is dispatched.",
  "It is being prepared.",
  "It is delivered.",
  "Payment is confirmed.",
  "Payment was declined.",
  "The order is open."
]);

function publicAuthor(author: "client" | "support" | "system"): "client" | "support" {
  return author === "client" ? "client" : "support";
}

export type SupportSuccess = Readonly<{
  caseReference: string;
  createdAt: string;
  feedbackInvitation: Readonly<{ prompt: string; promptKey: string }>;
  messageId: string;
  ok: true;
  orderContext: Readonly<{
    fulfilmentStatus: string;
    nextAction: string;
    orderStatus: string;
    paymentStatus: string;
    stateVersion: number;
    timeline: string;
  }> | null;
  responseExpectation: string;
  responseExpectationKey: "support.acknowledgement";
  retailCustomerOrder?: Readonly<{
    orderId: string;
    orderNumber: string;
    orderStatus: string;
    trackingUrl: string;
  }>;
  status: "open";
  supportHandle: string;
  thread: readonly Readonly<{
    author: "client" | "support";
    body: string;
    createdAt: string;
    id: string;
    sequence: number;
  }>[];
}>;

export async function supportTool(input: Readonly<{
  config: AgenticConfig;
  idempotencyKey: string;
  locale?: string;
  message: string;
  now: string;
  orderHandle: string;
  scope: CapabilityScope;
  store: AgenticStore;
  supportHandle?: string;
}>): Promise<SupportSuccess | AgenticErrorResult> {
  const capability = await resolveCapability({action: "support.create", config: input.config, handle: input.orderHandle, now: input.now, resourceType: "order", scope: input.scope, store: input.store});
  if (!capability) return businessError({message: agenticMessage(negotiateLocale(input.locale), "mcp.errors.not_found"), reasonCode: "not_found"});
  const { getRetailOrderByAgenticOrderId } = await import("@/lib/retail-product-checkout");
  const retail = await getRetailOrderByAgenticOrderId(capability.resourceId);
  try {
    return await input.store.transaction(async store => {
      // The order exists before its case, so this also serializes case creation.
      const order = await store.getOrderForUpdate(capability.resourceId);
      if (!order) return businessError({message: agenticMessage(negotiateLocale(input.locale), "mcp.errors.not_found"), reasonCode: "not_found"});
      return supportInTransaction({...input, store}, retail);
    });
  } catch (error) {
    if (!isIdempotencyRace(error)) throw error;
    const replay = await beginIdempotency<SupportSuccess>({
      key: input.idempotencyKey, now: input.now,
      operation: input.supportHandle ? "support.reply" : "support.create",
      ownerScope: `${input.scope.environment}:${input.scope.tenantScope}:${input.scope.principalScope ?? "anon"}`,
      payload: {message: input.message, orderHandle: input.orderHandle, supportHandle: input.supportHandle ?? null},
      store: input.store
    });
    if (replay.kind === "replay") return replay.response;
    if (replay.kind === "conflict") return replay.error;
    throw error;
  }
}

async function supportInTransaction(
  input: Parameters<typeof supportTool>[0],
  retail: Awaited<ReturnType<typeof import("@/lib/retail-product-checkout").getRetailOrderByAgenticOrderId>>
): Promise<SupportSuccess | AgenticErrorResult> {
  const ownerScope = `${input.scope.environment}:${input.scope.tenantScope}:${input.scope.principalScope ?? "anon"}`;
  const operation = input.supportHandle ? "support.reply" : "support.create";
  const payload = {
    message: input.message,
    orderHandle: input.orderHandle,
    supportHandle: input.supportHandle ?? null
  };
  const replay = await beginIdempotency<SupportSuccess>({
    key: input.idempotencyKey,
    now: input.now,
    operation,
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

  const orderCapability = await resolveCapability({
    action: "support.create",
    config: input.config,
    handle: input.orderHandle,
    now: input.now,
    resourceType: "order",
    scope: input.scope,
    store: input.store
  });

  const locale = negotiateLocale(input.locale);

  if (!orderCapability) {
    return businessError({
      message: agenticMessage(locale, "mcp.errors.not_found"),
      reasonCode: "not_found"
    });
  }

  let supportHandle = input.supportHandle;
  let caseId: string;

  if (supportHandle) {
    const supportCapability = await resolveCapability({
      action: "support.reply",
      config: input.config,
      handle: supportHandle,
      now: input.now,
      resourceType: "support",
      scope: input.scope,
      store: input.store
    });

    if (!supportCapability || supportCapability.resourceId !== orderCapability.resourceId) {
      return businessError({
        message: agenticMessage(locale, "mcp.errors.not_found"),
        reasonCode: "not_found"
      });
    }

    const existing = await input.store.getSupportCaseByOrderId(orderCapability.resourceId);

    if (!existing) {
      return businessError({
        message: agenticMessage(locale, "mcp.errors.not_found"),
        reasonCode: "not_found"
      });
    }

    caseId = existing.id;
  } else {
    const existing = await input.store.getSupportCaseByOrderId(orderCapability.resourceId);

    if (existing) {
      caseId = existing.id;
      // Reuse existing case on create without handle; still requires new message.
    } else {
      caseId = randomUUID();
      await input.store.insertSupportCase({
        caseReference: humanCaseReference(caseId),
        createdAt: input.now,
        id: caseId,
        orderId: orderCapability.resourceId,
        status: "open",
        updatedAt: input.now
      });
    }

    const issued = await issueCapability({
      allowedActions: ["support.reply", "support.read"],
      config: input.config,
      now: input.now,
      resourceId: orderCapability.resourceId,
      resourceType: "support",
      scope: input.scope,
      store: input.store
    });
    supportHandle = issued.handle;
  }

  const prior = await input.store.getSupportMessages(caseId);
  const orderForAck = await input.store.getOrder(orderCapability.resourceId);
  const timelineForAck = orderForAck ? commerceTimelineStatus(orderForAck) : "open";
  const ackBody = systemAckBody(timelineForAck);
  const canned = CANNED_ACKS.has(input.message.trim());
  const alreadyAcked = prior.some(
    (item) => publicAuthor(item.author) === "support" && item.body === ackBody
  );

  const nextSequence = 1 + Math.max(0, ...prior.map(message => message.sequence));
  let messageId = supportMessageId(caseId, nextSequence);
  const store = input.store;
  {
    if (canned) {
      const existing = prior.find(
        (item) => publicAuthor(item.author) === "support" && item.body === input.message.trim()
      );
      if (!existing) {
        const sequence = nextSequence;
        messageId = supportMessageId(caseId, sequence);
        await store.insertSupportMessage({
          author: "support",
          body: input.message.trim(),
          caseId,
          createdAt: input.now,
          id: messageId,
          sequence
        });
      } else {
        messageId = existing.id;
      }
    } else {
      const sequence = nextSequence;
      messageId = supportMessageId(caseId, sequence);
      await store.insertSupportMessage({
        author: "client",
        body: input.message,
        caseId,
        createdAt: input.now,
        id: messageId,
        sequence
      });
      if (!alreadyAcked) {
        await store.insertSupportMessage({
          author: "support",
          body: ackBody,
          caseId,
          createdAt: input.now,
          id: supportMessageId(caseId, sequence + 1),
          sequence: sequence + 1
        });
      }
    }
  }

  const supportCase = await input.store.getSupportCase(caseId);
  const order = await input.store.getOrder(orderCapability.resourceId);
  const messages = [...(await input.store.getSupportMessages(caseId))].sort((left, right) => {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
    return left.id.localeCompare(right.id);
  });
  const timeline = order ? commerceTimelineStatus(order) : "open";

  const response: SupportSuccess = {
    caseReference: supportCase?.caseReference ?? humanCaseReference(caseId),
    createdAt: input.now,
    feedbackInvitation: {
      prompt: agenticMessage(locale, "feedback.invitation"),
      promptKey: "feedback.invitation"
    },
    messageId,
    ok: true,
    orderContext: order
      ? {
          fulfilmentStatus: publicFulfilmentStatus(order.fulfilmentStatus),
          nextAction: timeline === "delivered" ? "none" : "poll",
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          stateVersion: order.stateVersion,
          timeline
        }
      : null,
    responseExpectation: agenticMessage(locale, "support.acknowledgement"),
    responseExpectationKey: "support.acknowledgement",
    ...(retail
      ? {
          retailCustomerOrder: {
            orderId: retail.orderId,
            orderNumber: retail.orderNumber,
            orderStatus: retail.orderStatus,
            trackingUrl: `/${locale}/order/track/${encodeURIComponent(retail.orderNumber)}`
          }
        }
      : {}),
    status: "open",
    supportHandle: supportHandle!,
    thread: messages.map((item) => ({
      author: publicAuthor(item.author),
      body: item.body,
      createdAt: item.createdAt,
      id: item.id,
      sequence: item.sequence
    }))
  };

  await commitIdempotency({
    key: input.idempotencyKey,
    now: input.now,
    operation,
    ownerScope,
    payload,
    resourceIds: { caseId },
    response,
    store: input.store
  });

  return response;
}
