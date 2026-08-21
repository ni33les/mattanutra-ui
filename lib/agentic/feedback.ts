import { randomUUID } from "node:crypto";
import type { AgenticConfig } from "@/lib/agentic/config";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import { beginIdempotency, commitIdempotency } from "@/lib/agentic/idempotency";
import { persistMcpPlanFeedback } from "@/lib/agentic/commerce/retail-join";
import type { AgenticStore } from "@/lib/agentic/store/types";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import type { PlanResult } from "@/lib/agentic/plan/types";

const SECRETISH =
  /\b(cap_|ord_|tkt_|sk_live|pk_live|whsec_)\w+|\b\d{13,19}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export type FeedbackSuccess = Readonly<{
  accepted: true;
  ok: true;
}>;

export async function feedbackTool(input: Readonly<{
  config: AgenticConfig;
  consentConfirmed: unknown;
  expectedRevision: number;
  idempotencyKey: string;
  now: string;
  optionId?: string;
  planHandle: string;
  points?: readonly string[];
  rating?: number;
  scope: CapabilityScope;
  store: AgenticStore;
  summary?: string;
}>): Promise<FeedbackSuccess | AgenticErrorResult> {
  if (input.consentConfirmed !== true) {
    return businessError({
      fieldPath: "consentConfirmed",
      message: agenticMessage("en", "mcp.errors.consent_required"),
      reasonCode: "consent_required"
    });
  }

  const text = [input.summary, ...(input.points ?? [])].filter(Boolean).join("\n");

  if (SECRETISH.test(text)) {
    return businessError({
      fieldPath: "summary",
      message: agenticMessage("en", "mcp.errors.unsafe_content"),
      reasonCode: "unsafe_content"
    });
  }

  const ownerScope = `${input.scope.environment}:${input.scope.tenantScope}:${input.scope.principalScope ?? "anon"}`;
  const payload = {
    expectedRevision: input.expectedRevision,
    optionId: input.optionId ?? null,
    planHandle: input.planHandle,
    points: input.points ?? [],
    rating: input.rating ?? null,
    summary: input.summary ?? null
  };
  const replay = await beginIdempotency<FeedbackSuccess>({
    key: input.idempotencyKey,
    now: input.now,
    operation: "feedback",
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

  const capability = await resolveCapability({
    action: "feedback.write",
    config: input.config,
    handle: input.planHandle,
    now: input.now,
    resourceType: "plan",
    scope: input.scope,
    store: input.store
  });

  if (!capability) {
    return businessError({
      message: agenticMessage("en", "mcp.errors.not_found"),
      reasonCode: "not_found"
    });
  }

  const [plan, revision] = await Promise.all([
    input.store.getPlan(capability.resourceId),
    input.store.getPlanRevision(capability.resourceId, input.expectedRevision)
  ]);

  if (!plan || plan.currentRevision !== input.expectedRevision) {
    return businessError({
      message: agenticMessage("en", "mcp.errors.not_found"),
      reasonCode: "not_found"
    });
  }

  if (!revision) {
    return businessError({
      message: agenticMessage("en", "mcp.errors.not_found"),
      reasonCode: "not_found"
    });
  }

  const result = revision.result as PlanResult;
  const locale = negotiateLocale(result.requestSnapshot.locale);
  const optionId = input.optionId ?? result.selected?.optionId ?? null;

  if (
    input.optionId &&
    result.selected?.optionId !== input.optionId &&
    result.alternatives.every((item) => item.optionId !== input.optionId)
  ) {
    return businessError({
      message: agenticMessage(locale, "mcp.errors.not_found"),
      reasonCode: "not_found"
    });
  }

  await input.store.insertFeedback({
    consentConfirmed: true,
    createdAt: input.now,
    id: randomUUID(),
    optionId,
    planId: plan.id,
    points: input.points ?? [],
    rating: input.rating ?? null,
    revision: input.expectedRevision,
    summary: input.summary ?? null
  });

  await persistMcpPlanFeedback({
    optionId,
    planId: plan.id,
    rating: input.rating ?? null,
    revision: input.expectedRevision,
    summary: input.summary ?? null
  });

  const response: FeedbackSuccess = { accepted: true, ok: true };

  await commitIdempotency({
    key: input.idempotencyKey,
    now: input.now,
    operation: "feedback",
    ownerScope,
    payload,
    resourceIds: { planId: plan.id },
    response,
    store: input.store
  });

  return response;
}
