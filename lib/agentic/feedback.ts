import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { decisionOptions, decisionOptionId } from "@/lib/agentic/presentation/decision";
import { randomUUID } from "node:crypto";
import type { AgenticConfig } from "@/lib/agentic/config";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import { beginIdempotency, commitIdempotency } from "@/lib/agentic/idempotency";
import { persistMcpPlanFeedback } from "@/lib/agentic/commerce/retail-join";
import type { AgenticStore } from "@/lib/agentic/store/types";
import { agenticMessage } from "@/lib/agentic/i18n";
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
  if (result.contractVersion !== AGENTIC_CONTRACT_VERSION) return businessError({ reasonCode: "not_found", message: "Not found." });
  const option = input.optionId ? decisionOptions(result).find(row => (result.requestSnapshot.scoring ? decisionOptionId(input.planHandle, input.expectedRevision, row) : row.optionId) === input.optionId) : result.selected;
  if (input.optionId && !option) return businessError({ reasonCode: "not_found", fieldPath: "optionId", message: "Not found." });
  const optionId = option?.optionId ?? null;

  let inserted = false;
  const response = await input.store.transaction(async (store) => {
    const locked = await store.getPlanForUpdate(plan.id);
    if (!locked || locked.currentRevision !== input.expectedRevision) {
      return businessError({ message: "This plan changed. Reload the plan.", reasonCode: "stale_revision" });
    }
    const claimed = await beginIdempotency<FeedbackSuccess>({
      key: input.idempotencyKey, now: input.now, operation: "feedback", ownerScope, payload, store
    });
    if (claimed.kind === "conflict") return claimed.error;
    if (claimed.kind === "replay") return claimed.response;
    await store.insertFeedback({
      consentConfirmed: true, createdAt: input.now, id: randomUUID(), optionId,
      planId: plan.id, points: input.points ?? [], rating: input.rating ?? null,
      revision: input.expectedRevision, summary: input.summary ?? null
    });
    const success: FeedbackSuccess = { accepted: true, ok: true };
    await commitIdempotency({
      key: input.idempotencyKey, now: input.now, operation: "feedback", ownerScope,
      payload, resourceIds: { planId: plan.id }, response: success, store
    });
    inserted = true;
    return success;
  });
  if (inserted) {
    await persistMcpPlanFeedback({
      optionId, planId: plan.id, rating: input.rating ?? null,
      revision: input.expectedRevision, summary: input.summary ?? null
    });
  }

  return response;
}
