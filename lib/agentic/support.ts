import { randomUUID } from "node:crypto";
import type { AgenticConfig } from "@/lib/agentic/config";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { humanCaseReference } from "@/lib/agentic/contract/ids";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import {
  issueCapability,
  resolveCapability,
  type CapabilityScope
} from "@/lib/agentic/capabilities";
import { beginIdempotency, commitIdempotency } from "@/lib/agentic/idempotency";
import { lookupRetailOrderForAgentic } from "@/lib/agentic/commerce/retail-join";
import type { AgenticStore } from "@/lib/agentic/store/types";

export type SupportSuccess = Readonly<{
  caseReference: string;
  createdAt: string;
  feedbackInvitation: Readonly<{ prompt: string; promptKey: string }>;
  messageId: string;
  ok: true;
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

  const messageId = randomUUID();
  await input.store.insertSupportMessage({
    author: "client",
    body: input.message,
    caseId,
    createdAt: input.now,
    id: messageId
  });

  const supportCase = await input.store.getSupportCase(caseId);
  const retail = await lookupRetailOrderForAgentic(orderCapability.resourceId);

  const response: SupportSuccess = {
    caseReference: supportCase?.caseReference ?? humanCaseReference(caseId),
    createdAt: input.now,
    feedbackInvitation: {
      prompt: agenticMessage(locale, "feedback.invitation"),
      promptKey: "feedback.invitation"
    },
    messageId,
    ok: true,
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
    supportHandle: supportHandle!
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
