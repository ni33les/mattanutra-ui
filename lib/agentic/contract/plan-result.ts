export const PLAN_COMPACT_APPLICABLE_STATUSES = ["no_purchase", "ready"] as const;

export type PlanCompactStatus = (typeof PLAN_COMPACT_APPLICABLE_STATUSES)[number];

export const PLAN_COMPACT_CONTRACT = {
  applicableStatuses: PLAN_COMPACT_APPLICABLE_STATUSES,
  forbiddenOnOtherStatuses: ["compactDecision", "evidenceHandle"] as const,
  optionalOnApplicable: ["claimIds", "evidenceHandle"] as const,
  requiredOnApplicable: ["compactDecision", "researchVersion"] as const
} as const;

export function planCompactApplicable(status: unknown): status is PlanCompactStatus {
  return (
    status === "ready" ||
    status === "no_purchase"
  );
}

export function planRespectsCompactContract(plan: Readonly<Record<string, unknown>>) {
  const status = plan.status;
  const hasCompact = Object.hasOwn(plan, "compactDecision");
  const hasEvidence = Object.hasOwn(plan, "evidenceHandle");
  const hasResearch = Object.hasOwn(plan, "researchVersion");

  if (planCompactApplicable(status)) {
    return hasCompact && hasResearch;
  }

  return !hasCompact && !hasEvidence;
}
