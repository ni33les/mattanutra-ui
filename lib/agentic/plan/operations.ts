import { nextTestUuid } from "@/lib/agentic/capabilities";
import { canonicalRequestHash } from "@/lib/agentic/idempotency";
import type { CapabilityScope } from "@/lib/agentic/capabilities";
import type { AgenticStore, PlanOperationRecord } from "@/lib/agentic/store/types";
import { businessError } from "@/lib/agentic/contract/errors";

export const PLAN_OPERATION_LEASE_MS = 60_000;
export const PLAN_OPERATION_TASK = "match_agentic_plan";
// Includes queueing, retries and worker restarts; leave time for the next poll
// to observe failure inside the published three-minute terminal bound.
export const PLAN_OPERATION_TERMINAL_MS = 175_000;
export function planOperationDeadlineError() {
  return businessError({ reasonCode: "temporarily_unavailable", retryable: false,
    nextActions: ["refresh_plan"], message: "Matching reached its overall deadline. The last committed plan is preserved. Review it and revise with a new idempotency key." });
}
export function operationDeadlineRemaining(operation: PlanOperationRecord, now = Date.now()) {
  return Math.max(0, (operation.deadlineAt ? Date.parse(operation.deadlineAt) : Date.parse(operation.createdAt) + PLAN_OPERATION_TERMINAL_MS) - now);
}
export async function expirePlanOperation(store: AgenticStore, id: string, now: string) {
  if (store.expireOperation) return store.expireOperation(id, now, planOperationDeadlineError());
  return store.transaction(async tx => {
    const current = await tx.getPlanOperation(id, { includeCursor: false });
    if (!current || !["queued", "running", "retryable"].includes(current.status) || operationDeadlineRemaining(current, Date.parse(now)) > 0) return false;
    return tx.updatePlanOperation({ ...current, status: "failed", error: planOperationDeadlineError(),
      leaseToken: null, leaseExpiresAt: null, updatedAt: now, version: current.version + 1 }, current.version);
  });
}

/** Leave 100 ms for response serialization inside the existing 60 s deadline. */
export function planReturnWaitMs(elapsedMs: number) {
  return Math.min(3_000, Math.max(0, 60_000 - elapsedMs - 100));
}

export async function admitPlanOperation(store: AgenticStore, input: Readonly<{
  planId: string; ownerScope: string; key: string; payload: unknown;
  expectedRevision: number; revision: number; prepared: Record<string, unknown>;
  scope: CapabilityScope; now: string; admittedAt?: string;
}>): Promise<PlanOperationRecord> {
  return store.transaction(async tx => {
    const plan = await tx.getPlanForUpdate(input.planId);
    if (!plan) throw new Error("plan_not_found");
    const existing = await tx.getPlanOperationByKey(input.ownerScope, input.key);
    const requestHash = canonicalRequestHash(input.payload);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("idempotency_conflict");
      return existing;
    }
    if (plan.currentRevision !== input.expectedRevision) throw new Error("stale_revision");
    if (await tx.getActivePlanOperation(input.planId)) throw new Error("stale_revision");
    const id = nextTestUuid();
    const record: PlanOperationRecord = {
      id, planId: input.planId, ownerScope: input.ownerScope, key: input.key,
      requestHash, expectedRevision: input.expectedRevision, revision: input.revision,
      taskId: nextTestUuid(), status: "queued", version: 1, leaseToken: null, leaseExpiresAt: null,
      createdAt: input.now, updatedAt: input.now,
      deadlineAt: new Date(Date.parse(input.admittedAt ?? input.now) + PLAN_OPERATION_TERMINAL_MS).toISOString(),
      command: { payload: structuredClone(input.payload), prepared: structuredClone(input.prepared), scope: input.scope },
      checkpoint: null, catalogueIdentity: null, referenceIdentity: null, response: null, error: null
    };
    await tx.insertPlanOperation(record);
    return record;
  });
}

export async function claimPlanOperation(store: AgenticStore, id: string, leaseToken: string, now: string) {
  if (await expirePlanOperation(store, id, now)) return null;
  if (store.claimOperation) return store.claimOperation(id, leaseToken, now, new Date(Date.parse(now) + PLAN_OPERATION_LEASE_MS).toISOString());
  const claimed = await store.transaction(async tx => {
    const current = await tx.getPlanOperation(id, { includeCursor: false });
    if (!current || ["complete", "cancelled", "failed"].includes(current.status)) return null;
    if (current.status === "running" && Date.parse(current.leaseExpiresAt ?? "") > Date.parse(now)) return null;
    const next: PlanOperationRecord = { ...current, status: "running", leaseToken,
      leaseExpiresAt: new Date(Date.parse(now) + PLAN_OPERATION_LEASE_MS).toISOString(), updatedAt: now, version: current.version + 1 };
    return await tx.updatePlanOperation(next, current.version) ? next : null;
  });
  if (!claimed) return null;
  const hydrated = await store.getPlanOperation(id);
  return hydrated?.leaseToken === leaseToken && hydrated.status === "running" ? hydrated : null;
}

export async function updateClaimedOperation(store: AgenticStore, claim: PlanOperationRecord,
  changes: Partial<Pick<PlanOperationRecord, "checkpoint" | "catalogueIdentity" | "referenceIdentity" | "status" | "response" | "error">>, now: string) {
  if (store.patchClaimedOperation) return store.patchClaimedOperation(claim.id, claim.leaseToken!, changes, now,
    !changes.status || changes.status === "running" ? new Date(Date.parse(now) + PLAN_OPERATION_LEASE_MS).toISOString() : null);
  return store.transaction(async tx => {
    const current = await tx.getPlanOperation(claim.id, { includeCursor: false });
    if (!current || current.status !== "running" || current.leaseToken !== claim.leaseToken ||
      Date.parse(current.leaseExpiresAt ?? "") <= Date.parse(now)) return false;
    const status = changes.status ?? current.status;
    return tx.updatePlanOperation({ ...current, ...changes, version: current.version + 1, updatedAt: now,
      leaseExpiresAt: status === "running" ? new Date(Date.parse(now) + PLAN_OPERATION_LEASE_MS).toISOString() : null }, current.version);
  });
}

export function failPlanOperation(store: AgenticStore, claim: PlanOperationRecord, error: unknown, now: string) {
  return updateClaimedOperation(store, claim, { status: "retryable", error }, now);
}

export async function cancelPlanOperation(store: AgenticStore, id: string, now: string) {
  return store.transaction(async tx => {
    const current = await tx.getPlanOperation(id, { includeCursor: false });
    if (!current || ["complete", "cancelled", "failed"].includes(current.status)) return false;
    return tx.updatePlanOperation({ ...current, status: "cancelled", leaseToken: null, leaseExpiresAt: null,
      version: current.version + 1, updatedAt: now }, current.version);
  });
}
