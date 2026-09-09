import type { AgenticRuntime } from "@/lib/agentic/runtime";
import { resolveCapability } from "@/lib/agentic/capabilities";
import { businessError, isAgenticErrorResult } from "@/lib/agentic/contract/errors";
import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { originalRequestFor } from "@/lib/agentic/plan/request-patch";
import type { PlanResult } from "@/lib/agentic/plan/types";
import type { PlanStatusWire } from "@/lib/agentic/contract/outputs";
import { planContractCompatible } from "@/lib/agentic/presentation/compatibility";
import { operationForRead, planStatusProjection, projectedResultVersion } from "@/lib/agentic/presentation/status-projection";
import { getPinnedCatalogueSnapshot } from "@/lib/agentic/catalogue/pin";
type ReadRuntime = Pick<AgenticRuntime, "config" | "scope" | "store" | "now">;

async function readState(runtime: ReadRuntime, planHandle: string, requestedRevision?: number, includeResult = false) {
  const capability = await resolveCapability({ action: "plan.read", config: runtime.config, handle: planHandle,
    now: runtime.now ?? new Date().toISOString(), resourceType: "plan", scope: runtime.scope, store: runtime.store });
  if (!capability) return businessError({ reasonCode: "not_found", message: "Not found." });
  const stored = await runtime.store.getPlanReadState(capability.resourceId, requestedRevision, includeResult);
  if (!stored) return businessError({ reasonCode: "not_found", message: "Plan revision not found." });
  // Legacy fallback is read-only. The bounded backfill persists the projection.
  const projection = stored.projection ?? planStatusProjection(stored.result);
  if (!projection) return businessError({ reasonCode: "not_found", message: "Plan revision not found." });
  if (!stored.projection && projection.snapshotId) {
    const snapshot = getPinnedCatalogueSnapshot(projection.snapshotId)?.snapshot ?? await runtime.store.getCatalogueSnapshot(projection.snapshotId);
    projection.catalogueRevision = snapshot?.runtimeRevision ?? null;
  }
  const state = { ...stored, operation: operationForRead(stored.operation) };
  const current = projection.catalogueRevision === null || state.catalogueRevision === projection.catalogueRevision;
  const refreshRequired = !state.frozen && (projection.refreshRequired || !planContractCompatible(projection.contractVersion) || !current);
  return { ...state, projection, current, refreshRequired, resultVersion: projectedResultVersion(state, projection, refreshRequired) };
}

/** One coherent, ordinary database read after capability validation. */
export async function readPlanPresentation(runtime: ReadRuntime, planHandle: string, requestedRevision?: number) {
  const state = await readState(runtime, planHandle, requestedRevision, true);
  if (isAgenticErrorResult(state)) return state;
  const saved = state.result as PlanResult;
  const result: PlanResult = state.refreshRequired ? { ...saved, refreshRequired: true,
    sourceContractVersion: saved.contractVersion ?? "3.0.0", status: "needs_input", questions: [] } : saved;
  return { ...state, revision: { revision: state.revision, result }, result, originalRequest: () => originalRequestFor(result) };
}

export async function readPlanStatus(runtime: AgenticRuntime, planHandle: string, knownResultVersion?: string): Promise<PlanStatusWire | ReturnType<typeof businessError>> {
  const state = await readState(runtime, planHandle);
  if (isAgenticErrorResult(state)) return state;
  const { projection, revision, operation, resultVersion, refreshRequired } = state;
  const active = operation && ["queued", "running", "retryable"].includes(operation.status);
  const error = operation && isAgenticErrorResult(operation.error) ? operation.error.error : undefined;
  return { ok: true, responseView: "status", planHandle, revision, resultVersion,
    contractVersion: AGENTIC_CONTRACT_VERSION, locale: projection.locale,
    status: active ? "processing" : refreshRequired ? "needs_input" : projection.decision.status, unchanged: knownResultVersion === resultVersion,
    pendingRevision: operation?.revision ?? null, operationStatus: operation?.status ?? null,
    nextActions: error || operation?.status === "cancelled" ? ["refresh_plan"] : active ? ["poll_plan"] : refreshRequired ? ["change_request"] : [projection.decision.nextAction],
    pollAfterSeconds: active ? 2 : 0, refreshRequired, ...(error ? { error: JSON.parse(JSON.stringify(error)) as PlanStatusWire["error"] } : {}) };
}
