import { nextTestUuid } from "@/lib/agentic/capabilities";
import { canonicalRequestHash } from "@/lib/agentic/idempotency";
import type { CapabilityScope } from "@/lib/agentic/capabilities";
import type { AgenticStore, PlanOperationRecord } from "@/lib/agentic/store/types";

export const PLAN_OPERATION_LEASE_MS = 60_000;
export const PLAN_OPERATION_TASK = "match_agentic_plan";

export async function admitPlanOperation(store: AgenticStore, input: Readonly<{
  planId: string; ownerScope: string; key: string; payload: unknown;
  expectedRevision: number; revision: number; prepared: Record<string, unknown>;
  scope: CapabilityScope; now: string;
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
    const id = nextTestUuid();
    const record: PlanOperationRecord = {
      id, planId: input.planId, ownerScope: input.ownerScope, key: input.key,
      requestHash, expectedRevision: input.expectedRevision, revision: input.revision,
      taskId: nextTestUuid(), status: "queued", version: 1, leaseToken: null, leaseExpiresAt: null,
      createdAt: input.now, updatedAt: input.now,
      command: { payload: structuredClone(input.payload), prepared: structuredClone(input.prepared), scope: input.scope },
      checkpoint: null, catalogueIdentity: null, referenceIdentity: null, response: null, error: null
    };
    await tx.insertPlanOperation(record);
    return record;
  });
}

export async function claimPlanOperation(store: AgenticStore, id: string, leaseToken: string, now: string) {
  return store.transaction(async tx => {
    const current = await tx.getPlanOperation(id);
    if (!current || ["complete", "cancelled", "failed"].includes(current.status)) return null;
    if (current.status === "running" && Date.parse(current.leaseExpiresAt ?? "") > Date.parse(now)) return null;
    const next: PlanOperationRecord = { ...current, status: "running", leaseToken,
      leaseExpiresAt: new Date(Date.parse(now) + PLAN_OPERATION_LEASE_MS).toISOString(), updatedAt: now, version: current.version + 1 };
    return await tx.updatePlanOperation(next, current.version) ? next : null;
  });
}

export async function updateClaimedOperation(store: AgenticStore, claim: PlanOperationRecord,
  changes: Partial<Pick<PlanOperationRecord, "checkpoint" | "catalogueIdentity" | "referenceIdentity" | "status" | "response" | "error">>, now: string) {
  return store.transaction(async tx => {
    const current = await tx.getPlanOperation(claim.id);
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
    const current = await tx.getPlanOperation(id);
    if (!current || ["complete", "cancelled", "failed"].includes(current.status)) return false;
    return tx.updatePlanOperation({ ...current, status: "cancelled", leaseToken: null, leaseExpiresAt: null,
      version: current.version + 1, updatedAt: now }, current.version);
  });
}
