import type { AgenticRuntime } from "@/lib/agentic/runtime";
import { businessError, isAgenticErrorResult } from "@/lib/agentic/contract/errors";
import { readPlanState, readPlanPresentation } from "@/lib/agentic/presentation/plan-read";
import { processingDecision, failedDecision, presentDecision, decisionOptions, decisionOptionId } from "@/lib/agentic/presentation/decision";
import { ensureCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import { prepareSimpleRequest } from "@/lib/agentic/plan/simple-input";
import { canonicalRequestHash } from "@/lib/agentic/idempotency";
import { planTool, commitPlanNoop, type PlanToolInput } from "@/lib/agentic/plan/service";
import type { PlanResult } from "@/lib/agentic/plan/types";
import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";

export async function simplePlanTool(runtime: AgenticRuntime, params: Record<string, unknown>) {
  const now = runtime.now ?? new Date().toISOString();
  const handle = typeof params.planHandle === "string" ? params.planHandle : undefined;
  const kind = !handle ? "create" : "selectedOptionId" in params ? "select" : "answers" in params ? "answer" : Object.keys(params).length === 1 ? "get" : "revise";
  const state = handle ? await readPlanState(runtime, handle) : null;
  if (isAgenticErrorResult(state)) return state;
  if (kind === "get" && state) {
    if (state.operation && ["queued", "running", "retryable"].includes(state.operation.status)) return processingDecision(handle!, state.revision, state.projection.locale);
    if (state.operation && ["failed", "cancelled"].includes(state.operation.status)) return failedDecision(handle!, state.revision, state.projection.locale);
    const complete = await readPlanPresentation(runtime, handle!);
    return isAgenticErrorResult(complete) ? complete : presentDecision(complete.result, handle!, complete.revision.revision);
  }
  const ownerScope = `${runtime.scope.environment}:${runtime.scope.tenantScope}:${runtime.scope.principalScope ?? "anon"}`;
  const key = String(params.idempotencyKey), hash = canonicalRequestHash(params);
  // Receipts precede current-revision validation: a lost successful response is replayable.
  const existing = await runtime.store.getPlanOperationByKey(ownerScope, key);
  const receipt = await runtime.store.getIdempotency("plan", ownerScope, key);
  if (existing && existing.requestHash !== hash || receipt && receipt.requestHash !== hash) return businessError({ reasonCode: "idempotency_conflict", fieldPath: "idempotencyKey", message: "This key belongs to a different input." });
  if (existing || receipt) {
    const internal = existing ? await planTool({ ...runtime, now, payload: existing.command.payload as PlanToolInput }) : JSON.parse(receipt!.responseJson);
    if (isAgenticErrorResult(internal)) return internal;
    if (internal.status === "processing") return processingDecision(internal.planHandle, internal.revision, existing?.command.prepared.locale as string | undefined);
    const complete = await readPlanPresentation(runtime, internal.planHandle, internal.revision);
    return isAgenticErrorResult(complete) ? complete : presentDecision(complete.result, internal.planHandle, internal.revision);
  }
  if (state && state.plan.currentRevision !== params.expectedRevision) return businessError({ reasonCode: "stale_revision", fieldPath: "expectedRevision", currentRevision: state.plan.currentRevision, requestedRevision: Number(params.expectedRevision), message: "Read the current plan and retry this change with its revision." });
  const prior = handle ? await readPlanPresentation(runtime, handle) : null;
  if (isAgenticErrorResult(prior)) return prior;
  const payload: PlanToolInput = { operation: kind, publicInput: params, idempotencyKey: key, ...(handle ? { planHandle: handle, expectedRevision: Number(params.expectedRevision) } : {}) };
  let request;
  if (kind === "create" || kind === "revise") {
    const snapshot = await ensureCatalogueSnapshot(runtime.config.environment, String(params.destinationCountry ?? prior?.result.requestSnapshot.destinationCountry ?? "TH"));
    request = prepareSimpleRequest(params, snapshot, prior?.result.originalRequest ?? prior?.result.requestSnapshot.originalRequest);
    if (isAgenticErrorResult(request)) return request;
    Object.assign(payload, { request, searchEffort: params.searchEffort ?? prior?.result.requestSnapshot.searchEffort ?? "standard" });
    const original = prior?.result.originalRequest ?? prior?.result.requestSnapshot.originalRequest;
    if (prior && !prior.refreshRequired && (!state?.operation || state.operation.status === "complete") && original && canonicalRequestHash(request) === canonicalRequestHash(original) && payload.searchEffort === prior.result.requestSnapshot.searchEffort) {
      const committed = await commitPlanNoop({ ...runtime, now, payload }, prior.result, prior.plan.id, handle!, prior.revision.revision);
      return isAgenticErrorResult(committed) ? committed : presentDecision(prior.result, handle!, prior.revision.revision);
    }
  }
  if (kind === "select" && prior) {
    const option = decisionOptions(prior.result).find(option => decisionOptionId(handle!, prior.revision.revision, option) === params.selectedOptionId);
    if (!option || !option.basket.length || option.purchaseEligible === false) return businessError({ reasonCode: "not_found", fieldPath: "selectedOptionId", message: "Use an eligible option ID returned by the current plan." });
    Object.assign(payload, { selectOptionId: option.optionId });
  }
  if (kind === "answer") Object.assign(payload, { answers: params.answers });
  const completed = await planTool({ ...runtime, now, payload });
  if (isAgenticErrorResult(completed)) return completed;
  if (completed.status === "processing") return processingDecision(completed.planHandle, completed.revision, request?.locale ?? prior?.projection.locale);
  const saved = await readPlanPresentation(runtime, completed.planHandle, completed.revision);
  if (isAgenticErrorResult(saved)) return saved;
  if (saved.result.contractVersion !== AGENTIC_CONTRACT_VERSION) return businessError({ reasonCode: "not_found", message: "Not found." });
  return presentDecision(saved.result as PlanResult, completed.planHandle, completed.revision);
}
