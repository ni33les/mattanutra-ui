import { createHash } from "node:crypto";

import { AGENTIC_CONTRACT_VERSION } from "../../../lib/agentic/config.ts";
import { AGENTIC_SCHEMA_CHECKSUM } from "../../../lib/agentic/info.ts";
import { MATCHER_VERSION } from "../../../lib/matcher/config.ts";
import { canonicalHash, canonicalJson } from "../../../lib/agentic/value/canonical.ts";
import { CUSTOMER_VALUE_PACK_VERSION } from "../../../lib/agentic/value/canonical-plan.ts";

export const CV_IMPL_ENDPOINT = "https://dev.mattanutra.com/api/mcp";
export const CV_IMPL_ENVIRONMENT = "dev";

export type IdempotencyMode = "fresh-key" | "same-key";

export type AssertionRecord = Readonly<{
  expected: unknown;
  id: string;
  observed: unknown;
  pass: boolean;
}>;

export type EvidenceEnvelope = Readonly<{
  assertions: readonly AssertionRecord[];
  buildId: string;
  canonicalResponseHash: string;
  contractVersion: string;
  endpoint: string;
  environment: string;
  idempotencyMode: IdempotencyMode;
  matcherVersion: string;
  packVersion: string;
  rawResponseHash: string;
  requestHash: string;
  runIndex: number;
  safetyLedgerVersion: string;
  schemaChecksum: string;
  snapshotId: string;
}>;

const FRESH_KEY_DROP = new Set(["idempotencyKey", "planHandle"]);

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function assertEq(
  id: string,
  expected: unknown,
  observed: unknown
): AssertionRecord {
  return {
    expected,
    id,
    observed,
    pass: Object.is(expected, observed) || canonicalJson(expected) === canonicalJson(observed)
  };
}

export function assertTrue(id: string, observed: boolean, expected = true): AssertionRecord {
  return { expected, id, observed, pass: observed === expected };
}

export function failedIds(assertions: readonly AssertionRecord[]): string[] {
  return assertions.filter((item) => !item.pass).map((item) => item.id);
}

export function significantCvEvidence(evidence: unknown) {
  const record = asRecord(evidence);
  const assertions = Array.isArray(record.assertions)
    ? record.assertions.map((item) => {
        const row = asRecord(item);
        return { id: row.id ?? null, pass: row.pass === true };
      })
    : undefined;
  return {
    ...(Array.isArray(record.failed) ? { failed: record.failed } : {}),
    ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    ...(assertions ? { assertions } : {})
  };
}

export function requestHash(request: unknown): string {
  return canonicalHash(request);
}

export function rawResponseHash(response: unknown): string {
  return createHash("sha256").update(JSON.stringify(response)).digest("hex");
}

export function freshKeyCanonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(freshKeyCanonical);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key) => !FRESH_KEY_DROP.has(key))
      .sort()
      .map((key) => [key, freshKeyCanonical(record[key])])
  );
}

export function freshKeyHash(response: unknown): string {
  return canonicalHash(freshKeyCanonical(response));
}

export function buildEvidence(input: Readonly<{
  assertions: readonly AssertionRecord[];
  buildId: string;
  idempotencyMode: IdempotencyMode;
  request: unknown;
  response: unknown;
  runIndex: number;
  safetyLedgerVersion: string;
  snapshotId: string;
}>): EvidenceEnvelope {
  return {
    assertions: input.assertions,
    buildId: input.buildId,
    canonicalResponseHash:
      input.idempotencyMode === "fresh-key"
        ? freshKeyHash(input.response)
        : canonicalHash(input.response),
    contractVersion: AGENTIC_CONTRACT_VERSION,
    endpoint: CV_IMPL_ENDPOINT,
    environment: CV_IMPL_ENVIRONMENT,
    idempotencyMode: input.idempotencyMode,
    matcherVersion: MATCHER_VERSION,
    packVersion: CUSTOMER_VALUE_PACK_VERSION,
    rawResponseHash:
      input.idempotencyMode === "fresh-key"
        ? freshKeyHash(input.response)
        : rawResponseHash(input.response),
    requestHash: requestHash(input.request),
    runIndex: input.runIndex,
    safetyLedgerVersion: input.safetyLedgerVersion,
    schemaChecksum: AGENTIC_SCHEMA_CHECKSUM,
    snapshotId: input.snapshotId
  };
}
