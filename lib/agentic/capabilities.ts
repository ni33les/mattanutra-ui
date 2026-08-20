import { createHmac, randomBytes } from "node:crypto";
import type { AgenticConfig, AgenticEnvironment } from "@/lib/agentic/config";
import type { AgenticStore, CapabilityRecord, ResourceType } from "@/lib/agentic/store/types";

const HANDLE_BYTES = 32;

export type IssuedCapability = Readonly<{
  handle: string;
  record: CapabilityRecord;
}>;

export type CapabilityScope = Readonly<{
  environment: AgenticEnvironment;
  principalScope: string | null;
  tenantScope: string;
}>;

export function hashCapability(secret: string, handle: string) {
  return createHmac("sha256", secret).update(handle).digest("hex");
}

export function issueHandle() {
  return `cap_${randomBytes(HANDLE_BYTES).toString("base64url")}`;
}

export async function issueCapability(input: Readonly<{
  allowedActions: readonly string[];
  config: AgenticConfig;
  expiresAt?: string | null;
  now: string;
  resourceId: string;
  resourceType: ResourceType;
  revokedAt?: string | null;
  scope: CapabilityScope;
  store: AgenticStore;
}>): Promise<IssuedCapability> {
  const handle = issueHandle();
  const record: CapabilityRecord = {
    allowedActions: input.allowedActions,
    environment: input.scope.environment,
    expiresAt: input.expiresAt ?? null,
    hash: hashCapability(input.config.capabilitySecret, handle),
    id: crypto.randomUUID(),
    issuedAt: input.now,
    keyVersion: 1,
    principalScope: input.scope.principalScope,
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    revokedAt: input.revokedAt ?? null,
    tenantScope: input.scope.tenantScope
  };

  await input.store.insertCapability(record);
  return { handle, record };
}

export async function resolveCapability(input: Readonly<{
  action: string;
  config: AgenticConfig;
  handle: string;
  now: string;
  resourceType: ResourceType;
  scope: CapabilityScope;
  store: AgenticStore;
}>): Promise<CapabilityRecord | null> {
  if (typeof input.handle !== "string" || input.handle.length < 32) {
    return null;
  }

  const record = await input.store.getCapabilityByHash(
    hashCapability(input.config.capabilitySecret, input.handle)
  );

  if (!record) {
    return null;
  }

  if (record.environment !== input.scope.environment) {
    return null;
  }

  if (record.resourceType !== input.resourceType) {
    return null;
  }

  if (record.tenantScope !== input.scope.tenantScope) {
    return null;
  }

  if (
    record.principalScope &&
    input.scope.principalScope &&
    record.principalScope !== input.scope.principalScope
  ) {
    return null;
  }

  if (!record.allowedActions.includes(input.action)) {
    return null;
  }

  if (record.revokedAt) {
    return null;
  }

  if (record.expiresAt && record.expiresAt <= input.now) {
    return null;
  }

  return record;
}
