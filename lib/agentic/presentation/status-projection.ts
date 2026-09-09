import type { PlanResult } from "@/lib/agentic/plan/types";
import type { PlanRecord, PlanOperationRecord } from "@/lib/agentic/store/types";
import { canonicalHash } from "@/lib/agentic/value/canonical";
import { planOperationalContext, type OperationalDecision } from "@/lib/agentic/value/operational-decision";
import { getPinnedCatalogueSnapshot, pinnedSnapshotIdFromResult } from "@/lib/agentic/catalogue/pin";
import { operationDeadlineRemaining, planOperationDeadlineError } from "@/lib/agentic/plan/operations";
import { PLAN_PRESENTATION_VERSION } from "@/lib/agentic/presentation/version";

export type PlanStatusProjection = {
  version: 1; resultHash: string; contractVersion: string | undefined; locale: PlanResult["requestSnapshot"]["locale"];
  decision: OperationalDecision; snapshotId: string; catalogueRevision: number | null; refreshRequired: boolean;
};
export type PlanOperationRead = Pick<PlanOperationRecord, "id" | "revision" | "status" | "error" | "createdAt" | "deadlineAt">;
export type PlanReadState = {
  plan: PlanRecord; revision: number; projection: PlanStatusProjection | null; result: unknown;
  payment: { orderId: string; paymentStatus: string; fulfilmentStatus: string; orderStatus: string; stateVersion: number } | null;
  operation: PlanOperationRead | null; frozen: boolean; catalogueRevision: number | null;
};

/** Called at write boundaries; search diagnostics never affect public identity. */
export function planStatusProjection(value: unknown): PlanStatusProjection | null {
  const result = value as PlanResult | null;
  if (!result?.requestSnapshot || !result.matcherTelemetry || !Array.isArray(result.alternatives) || !Array.isArray(result.coverage) || !Array.isArray(result.questions)) return null;
  const telemetry = { snapshotId: result.matcherTelemetry.snapshotId, matcherVersion: result.matcherTelemetry.matcherVersion,
    factLedgerHash: result.matcherTelemetry.factLedgerHash };
  const snapshotId = pinnedSnapshotIdFromResult(result);
  return { version: 1, resultHash: canonicalHash({ ...result, matcherTelemetry: telemetry }),
    contractVersion: result.contractVersion, locale: result.requestSnapshot.locale, decision: planOperationalContext(result).decision,
    snapshotId, catalogueRevision: getPinnedCatalogueSnapshot(snapshotId)?.snapshot.runtimeRevision ?? null,
    refreshRequired: Boolean(result.refreshRequired) };
}

export function operationForRead(operation: PlanOperationRead | null, now = Date.now()): PlanOperationRead | null {
  if (!operation || !["queued", "running", "retryable"].includes(operation.status) ||
      operationDeadlineRemaining(operation as PlanOperationRecord, now) > 0) return operation;
  return { ...operation, status: "failed", error: planOperationDeadlineError() };
}
export function projectedResultVersion(state: PlanReadState, projection: PlanStatusProjection, refreshRequired: boolean) {
  const operation = state.operation ? { id: state.operation.id, status: state.operation.status,
    revision: state.operation.revision, error: state.operation.error } : null;
  return canonicalHash({ presentation: PLAN_PRESENTATION_VERSION, revision: state.revision,
    currentRevision: state.plan.currentRevision, resultHash: projection.resultHash, operation, payment: state.payment, refreshRequired });
}
