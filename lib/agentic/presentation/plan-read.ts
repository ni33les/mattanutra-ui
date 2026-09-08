import type { AgenticRuntime } from "@/lib/agentic/runtime";
import { resolveCapability } from "@/lib/agentic/capabilities";
import { businessError, isAgenticErrorResult } from "@/lib/agentic/contract/errors";
import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { canonicalHash } from "@/lib/agentic/value/canonical";
import { pinnedSnapshotIdFromResult, getPinnedCatalogueSnapshot } from "@/lib/agentic/catalogue/pin";
import { originalRequestFor } from "@/lib/agentic/plan/request-patch";
import type { PlanResult } from "@/lib/agentic/plan/types";
import type { PlanStatusWire } from "@/lib/agentic/contract/outputs";
import { planContractCompatible } from "@/lib/agentic/presentation/compatibility";

/** Reads committed data and the admitted operation without building baskets,
 * advice or schedules. No matching, network calls or shared customer cache. */
export async function readPlanPresentation(runtime: AgenticRuntime, planHandle: string, requestedRevision?: number) {
  const capability = await resolveCapability({ action: "plan.read", config: runtime.config, handle: planHandle,
    now: runtime.now ?? new Date().toISOString(), resourceType: "plan", scope: runtime.scope, store: runtime.store });
  if (!capability) return businessError({ reasonCode: "not_found", message: "Not found." });
  const state = await runtime.store.transaction(async store => {
    const plan = await store.getPlan(capability.resourceId);
    if (!plan) return null;
    const revision = await store.getPlanRevision(plan.id, requestedRevision ?? plan.currentRevision);
    const active = await store.getActivePlanOperation(plan.id);
    const operation = active ?? await store.getFailedPlanOperation(plan.id, plan.currentRevision);
    const order = await store.getActiveOrderForPlanRevision(plan.id, requestedRevision ?? plan.currentRevision);
    const snapshotId = revision ? pinnedSnapshotIdFromResult(revision.result as PlanResult) : "";
    const snapshot = snapshotId ? getPinnedCatalogueSnapshot(snapshotId)?.snapshot ?? await store.getCatalogueSnapshot(snapshotId) : null;
    const current = snapshot?.runtimeRevision === undefined || !store.isCatalogueRevisionCurrent
      ? true : await store.isCatalogueRevisionCurrent(snapshot.runtimeRevision);
    return { plan, revision, operation, frozen: Boolean(order), current };
  });
  if (!state?.revision) return businessError({ reasonCode: "not_found", message: "Plan revision not found." });
  const result = state.revision.result as PlanResult;
  const refreshRequired = !state.frozen && (Boolean(result.refreshRequired) || !planContractCompatible(result.contractVersion) || !state.current);
  const operation = state.operation;
  const operationState = operation ? { id: operation.id, status: operation.status, revision: operation.revision, error: operation.error } : null;
  // Search diagnostics and archives are not customer-visible identity inputs.
  // The returned options, quantities, advice, request and searchSummary remain
  // below; content fingerprints fence the underlying catalogue facts.
  const telemetry = { snapshotId: result.matcherTelemetry.snapshotId, matcherVersion: result.matcherTelemetry.matcherVersion,
    factLedgerHash: result.matcherTelemetry.factLedgerHash };
  const resultVersion = canonicalHash({ presentation: AGENTIC_CONTRACT_VERSION, revision: state.revision.revision,
    currentRevision: state.plan.currentRevision, result: { ...result, matcherTelemetry: telemetry }, operation: operationState, refreshRequired });
  return { ...state, revision: state.revision, result, resultVersion, refreshRequired, originalRequest: () => originalRequestFor(result) };
}

export async function readPlanStatus(runtime: AgenticRuntime, planHandle: string, knownResultVersion?: string): Promise<PlanStatusWire | ReturnType<typeof businessError>> {
  const state = await readPlanPresentation(runtime, planHandle);
  if (isAgenticErrorResult(state)) return state;
  const { result, revision, operation, resultVersion, refreshRequired } = state;
  const active = operation && ["queued", "running", "retryable"].includes(operation.status);
  const error = operation && isAgenticErrorResult(operation.error) ? operation.error.error : undefined;
  return { ok: true, responseView: "status", planHandle, revision: revision.revision, resultVersion,
    contractVersion: AGENTIC_CONTRACT_VERSION, locale: result.requestSnapshot.locale,
    status: active ? "processing" : result.status, unchanged: knownResultVersion === resultVersion,
    pendingRevision: operation?.revision ?? null, operationStatus: operation?.status ?? null,
    nextActions: error || operation?.status === "cancelled" || refreshRequired ? ["refresh_plan"] : active ? ["poll_plan"] : ["get_conversation"],
    pollAfterSeconds: active ? 2 : 0, refreshRequired, ...(error ? { error: JSON.parse(JSON.stringify(error)) as PlanStatusWire["error"] } : {}) };
}
