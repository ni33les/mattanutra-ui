import type { AgenticRuntime } from "@/lib/agentic/runtime";
import { resolveCapability } from "@/lib/agentic/capabilities";
import { businessError, isAgenticErrorResult } from "@/lib/agentic/contract/errors";
import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import type { PlanResult } from "@/lib/agentic/plan/types";
import { operationForRead, planStatusProjection, projectedResultVersion, type PlanReadState } from "@/lib/agentic/presentation/status-projection";
import { getPinnedCatalogueSnapshot } from "@/lib/agentic/catalogue/pin";
type ReadRuntime = Pick<AgenticRuntime, "config" | "scope" | "store" | "now">;

export async function readPlanState(runtime: ReadRuntime, planHandle: string, requestedRevision?: number, includeResult: boolean | "terminal" = false) {
  const capability = await resolveCapability({ action: "plan.read", config: runtime.config, handle: planHandle,
    now: runtime.now ?? new Date().toISOString(), resourceType: "plan", scope: runtime.scope, store: runtime.store });
  if (!capability) return businessError({ reasonCode: "not_found", message: "Not found." });
  const stored = await runtime.store.getPlanReadState(capability.resourceId, requestedRevision, includeResult);
  if (!stored) return businessError({ reasonCode: "not_found", message: "Plan revision not found." });
  // A current-version record may lack a projection during initial publication.
  // Derive it without writing. Retired records are rejected below.
  const projection = stored.projection ?? planStatusProjection(stored.result);
  if (!projection) return businessError({ reasonCode: "not_found", message: "Plan revision not found." });
  if (projection.contractVersion !== AGENTIC_CONTRACT_VERSION) return businessError({ reasonCode: "not_found", message: "Not found." });
  if (!stored.projection && projection.snapshotId) {
    const snapshot = getPinnedCatalogueSnapshot(projection.snapshotId)?.snapshot ?? await runtime.store.getCatalogueSnapshot(projection.snapshotId);
    projection.catalogueRevision = snapshot?.runtimeRevision ?? null;
  }
  const state = { ...stored, operation: operationForRead(stored.operation) };
  const current = projection.catalogueRevision === null || state.catalogueRevision === projection.catalogueRevision;
  const refreshRequired = !state.frozen && (projection.refreshRequired || !current);
  return { ...state, projection, current, refreshRequired, resultVersion: projectedResultVersion(state, projection, refreshRequired) };
}

/** One coherent, ordinary database read after capability validation. */
export async function readPlanPresentation(runtime: ReadRuntime, planHandle: string, requestedRevision?: number) {
  const state = await readPlanState(runtime, planHandle, requestedRevision, true);
  if (isAgenticErrorResult(state)) return state;
  return planPresentation(state);
}
/** Presentation reuses the already authorised coherent read; no additional I/O. */
export function planPresentation<T extends PlanReadState & { refreshRequired: boolean }>(state: T) {
  const saved = state.result as PlanResult;
  const result: PlanResult = state.refreshRequired ? { ...saved, refreshRequired: true,
    status: "needs_input", questions: [] } : saved;
  return { ...state, revision: { revision: state.revision, result }, result };
}

