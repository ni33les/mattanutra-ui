export const PLAN_REPORTING_FIELDS = ["attribution", "campaign", "channel"] as const;

export function planBusinessView(plan: Readonly<Record<string, unknown>>) {
  return {
    basket: plan.basket ?? null,
    canonical: plan.canonical ?? null,
    claimIds: plan.claimIds ?? [],
    compactDecision: plan.compactDecision ?? null,
    estimatedOrderTotalMinor: plan.estimatedOrderTotalMinor ?? null,
    optionId: plan.optionId ?? null,
    researchVersion: plan.researchVersion ?? null,
    safetyGuidance: plan.safetyGuidance ?? [],
    shippingMinor: plan.shippingMinor ?? null,
    status: plan.status ?? null,
    summaryKey: plan.summaryKey ?? null
  };
}

export function reportingIsolatedFromPlan(input: Readonly<{
  planA: Readonly<Record<string, unknown>>;
  planB: Readonly<Record<string, unknown>>;
  reportA: Readonly<{ attribution: string }>;
  reportB: Readonly<{ attribution: string }>;
}>) {
  const samePlan =
    JSON.stringify(planBusinessView(input.planA)) ===
    JSON.stringify(planBusinessView(input.planB));
  const reportingDiffers = input.reportA.attribution !== input.reportB.attribution;
  return samePlan && reportingDiffers;
}
