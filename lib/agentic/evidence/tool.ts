import type { AgenticConfig } from "@/lib/agentic/config";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { claimById } from "@/lib/agentic/claims/corpus";
import { RESEARCH_VERSION } from "@/lib/agentic/discovery/versions";
import { createHash } from "node:crypto";
import {
  hashCapability,
  nextTestUuid,
  resolveCapability,
  type CapabilityScope
} from "@/lib/agentic/capabilities";
import type { AgenticStore } from "@/lib/agentic/store/types";
import type { PlanResult } from "@/lib/agentic/plan/types";

export type EvidenceMode = "sources" | "summary";

export async function issueEvidenceCapability(input: Readonly<{
  config: AgenticConfig;
  now: string;
  planId: string;
  revision: number;
  scope: CapabilityScope;
  store: AgenticStore;
}>) {
  const digest = createHash("sha256")
    .update(`evidence:${input.planId}:${input.revision}:${input.scope.tenantScope}`)
    .digest("base64url")
    .slice(0, 43);
  const handle = `cap_${digest}`;
  const hash = hashCapability(input.config.capabilitySecret, handle);
  const existing = await input.store.getCapabilityByHash(hash);
  if (existing) {
    return handle;
  }

  await input.store.insertCapability({
    allowedActions: ["evidence.read"],
    environment: input.scope.environment,
    expiresAt: null,
    hash,
    id: nextTestUuid(),
    issuedAt: input.now,
    keyVersion: 1,
    principalScope: input.scope.principalScope,
    resourceId: input.planId,
    resourceType: "evidence",
    revokedAt: null,
    tenantScope: input.scope.tenantScope
  });
  return handle;
}

export type EvidenceSuccess = Readonly<{
  claims: readonly Readonly<{
    claimId: string;
    limitation: string;
    reviewDate: string;
    source: string;
    statement: string;
    strength: string;
  }>[];
  mode: EvidenceMode;
  ok: true;
  planRevision: number;
  researchVersion: string;
}>;

export async function evidenceTool(input: Readonly<{
  claimIds?: readonly string[];
  config: AgenticConfig;
  evidenceHandle: string;
  locale?: string;
  mode?: string;
  now: string;
  scope: CapabilityScope;
  store: AgenticStore;
}>): Promise<EvidenceSuccess | AgenticErrorResult> {
  const locale = negotiateLocale(input.locale);

  if (input.mode != null && input.mode !== "summary" && input.mode !== "sources") {
    return businessError({
      fieldPath: "mode",
      message: agenticMessage(locale, "mcp.errors.invalid_request"),
      reasonCode: "invalid_request"
    });
  }

  const capability = await resolveCapability({
    action: "evidence.read",
    config: input.config,
    handle: input.evidenceHandle,
    now: input.now,
    resourceType: "evidence",
    scope: input.scope,
    store: input.store
  });

  if (!capability) {
    const hashed = hashCapability(input.config.capabilitySecret, input.evidenceHandle);
    const existing = await input.store.getCapabilityByHash(hashed);
    if (existing && existing.resourceType !== "evidence") {
      return businessError({
        fieldPath: "evidenceHandle",
        message: agenticMessage(locale, "mcp.errors.not_found"),
        reasonCode: "wrong_purpose"
      });
    }
    return businessError({
      fieldPath: "evidenceHandle",
      message: agenticMessage(locale, "mcp.errors.not_found"),
      reasonCode: "not_found"
    });
  }

  const plan = await input.store.getPlan(capability.resourceId);
  if (!plan) {
    return businessError({
      fieldPath: "evidenceHandle",
      message: agenticMessage(locale, "mcp.errors.not_found"),
      reasonCode: "not_found"
    });
  }

  const revision = await input.store.getPlanRevision(plan.id, plan.currentRevision);
  const result = revision?.result as PlanResult | undefined;
  const attached = result?.claimIds ?? [];
  const requested = input.claimIds ?? attached;

  for (const claimId of requested) {
    if (!attached.includes(claimId)) {
      return businessError({
        fieldPath: "claimIds",
        message: agenticMessage(locale, "mcp.errors.invalid_request"),
        reasonCode: "unreferenced_claim"
      });
    }
  }

  const claims = requested.flatMap((claimId) => {
    const claim = claimById(claimId);
    return claim
      ? [
          {
            claimId: claim.claimId,
            limitation: claim.limitation,
            reviewDate: claim.reviewDate,
            source: claim.source,
            statement: claim.statement,
            strength: claim.strength
          }
        ]
      : [];
  });

  return {
    claims,
    mode: input.mode === "sources" ? "sources" : "summary",
    ok: true,
    planRevision: plan.currentRevision,
    researchVersion: result?.researchVersion ?? RESEARCH_VERSION
  };
}
