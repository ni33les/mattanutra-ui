import { createHash } from "node:crypto";
import { AGENTIC_IDEMPOTENCY_TTL_MS } from "@/lib/agentic/config";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import type { AgenticStore, IdempotencyRecord } from "@/lib/agentic/store/types";

export function canonicalRequestHash(payload: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stable(payload)))
    .digest("hex");
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stable);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)])
    );
  }

  return value;
}

export type IdempotencyOutcome<T> =
  | { kind: "conflict"; error: AgenticErrorResult }
  | { kind: "fresh" }
  | { kind: "replay"; response: T };

export async function beginIdempotency<T>(input: Readonly<{
  key: string;
  now: string;
  operation: string;
  ownerScope: string;
  payload: unknown;
  store: AgenticStore;
}>): Promise<IdempotencyOutcome<T>> {
  const requestHash = canonicalRequestHash(input.payload);
  const existing = await input.store.getIdempotency(
    input.operation,
    input.ownerScope,
    input.key
  );

  if (!existing) {
    return { kind: "fresh" };
  }

  if (existing.requestHash !== requestHash) {
    return {
      error: businessError({
        fieldPath: "idempotencyKey",
        message: "This idempotency key was already used with a different payload.",
        reasonCode: "idempotency_conflict"
      }),
      kind: "conflict"
    };
  }

  return {
    kind: "replay",
    response: JSON.parse(existing.responseJson) as T
  };
}

export async function commitIdempotency(input: Readonly<{
  key: string;
  now: string;
  operation: string;
  ownerScope: string;
  payload: unknown;
  resourceIds: Readonly<Record<string, string>>;
  response: unknown;
  store: AgenticStore;
}>): Promise<IdempotencyRecord> {
  const record: IdempotencyRecord = {
    createdAt: input.now,
    expiresAt: new Date(
      Date.parse(input.now) + AGENTIC_IDEMPOTENCY_TTL_MS
    ).toISOString(),
    key: input.key,
    operation: input.operation,
    ownerScope: input.ownerScope,
    requestHash: canonicalRequestHash(input.payload),
    resourceIds: input.resourceIds,
    responseJson: JSON.stringify(input.response)
  };

  await input.store.insertIdempotency(record);
  return record;
}
