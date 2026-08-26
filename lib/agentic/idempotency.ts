import { createHash } from "node:crypto";
import { AGENTIC_IDEMPOTENCY_TTL_MS } from "@/lib/agentic/config";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import type { AgenticStore, IdempotencyRecord } from "@/lib/agentic/store/types";

function isPlanHandlePoll(payload: unknown, responseJson: string) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  let previous: { planHandle?: unknown } | null = null;

  try {
    previous = JSON.parse(responseJson) as { planHandle?: unknown };
  } catch {
    return false;
  }

  if (typeof previous?.planHandle !== "string") {
    return false;
  }

  const body = payload as Record<string, unknown>;
  const handle = body.planHandle;

  if (typeof handle !== "string" || handle !== previous.planHandle) {
    return false;
  }

  if (body.request != null || body.selectOptionId != null) {
    return false;
  }

  if (Array.isArray(body.answers) && body.answers.length > 0) {
    return false;
  }

  if (body.safetyAcknowledgement != null) {
    return false;
  }

  return true;
}

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
    if (isPlanHandlePoll(input.payload, existing.responseJson)) {
      return {
        kind: "replay",
        response: JSON.parse(existing.responseJson) as T
      };
    }

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

export function isIdempotencyRace(error: unknown) {
  if (error instanceof Error && error.message === "idempotency_conflict") {
    return true;
  }

  if (!error || typeof error !== "object") {
    return /idempotency_conflict|agentic_idempotency_records_pkey/i.test(
      String(error)
    );
  }

  const record = error as {
    code?: unknown;
    constraint?: unknown;
    constraint_name?: unknown;
    message?: unknown;
  };
  const constraint = String(record.constraint ?? record.constraint_name ?? "");
  const message = String(record.message ?? "");

  if (record.code === "23505" && /agentic_idempotency_records/i.test(constraint)) {
    return true;
  }

  return /idempotency_conflict|agentic_idempotency_records_pkey/i.test(
    `${constraint} ${message}`
  );
}

export async function overwriteIdempotency(input: Readonly<{
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

  await input.store.updateIdempotency(record);
  return record;
}
