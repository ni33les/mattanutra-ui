/** Independent Slice 5 oracles. Do not import production explanation, economics, or matching. */

import { canonicalHash } from "../../../lib/agentic/value/canonical.ts";

export type OraclePublishedOption = Readonly<{
  burden?: Readonly<{
    administrationEvents?: number;
    administrations?: number;
    pills?: number;
    productCount?: number;
  }>;
  cash90DayMinor?: number;
  coverage?: readonly Readonly<{
    nextAction?: string;
    reasonCode?: string;
    status: string;
    supplementId: string;
  }>[];
  deferredTargetIds?: readonly string[];
  economics?: Readonly<{
    cash30DayMinor?: number;
    cash90DayMinor?: number;
    cashTotalMinor?: number;
    firstOrderSubtotalMinor?: number;
    savings90DayMinor?: number;
  }>;
  omittedTargetIds?: readonly string[];
  optionId: string;
  productIds?: readonly string[];
  recommended?: boolean;
  retainedCurrent?: readonly Readonly<{
    name: string;
    productId?: string;
    supplementId: string;
  }>[];
  role?: string;
  safety?: Readonly<{
    assessedConditionCodes?: readonly string[];
    assessedMedicationCodes?: readonly string[];
    guidance?: readonly Readonly<{
      action: string;
      code: string;
      ruleId?: string;
      rulesVersion?: string;
    }>[];
  }>;
}>;

export type OraclePublishedPlan = Readonly<{
  acknowledgementStatus?: string;
  assessedConditionCodes?: readonly string[];
  assessedMedicationCodes?: readonly string[];
  canonical?: Readonly<Record<string, unknown>>;
  coverage?: readonly Readonly<{
    deliveredAmount?: number;
    nextAction?: string;
    reasonCode?: string;
    status: string;
    supplementId: string;
    totalExposureAmount?: number;
  }>[];
  explanation?: Readonly<Record<string, unknown>>;
  leftovers?: readonly unknown[];
  nextActions?: readonly string[];
  options?: readonly OraclePublishedOption[];
  safetyGuidance?: readonly Readonly<{
    action: string;
    code: string;
    guidanceId?: string;
    ruleId?: string;
    rulesVersion?: string;
  }>[];
  status?: string;
}>;

export function oracleExplanation(input: Readonly<{
  coverage: OraclePublishedPlan["coverage"];
  nextActions: readonly string[];
  option: OraclePublishedOption;
  safetyState: string;
}>) {
  const coverage = input.coverage ?? [];
  const omitted = coverage.filter((row) => row.status === "optional_omitted");
  const deferred = coverage.filter((row) => row.status === "conditional_deferred");
  const nextAction =
    deferred.find((row) => row.nextAction)?.nextAction ?? input.nextActions[0] ?? "";

  return {
    administrations: input.option.burden?.administrations ?? 0,
    cash30DayMinor: input.option.economics?.cash30DayMinor ?? null,
    cash90DayMinor:
      input.option.economics?.cash90DayMinor ?? input.option.cash90DayMinor ?? null,
    conditionalDeferrals: deferred.map((row) => ({
      nextAction: row.nextAction ?? null,
      reasonCode: row.reasonCode ?? null,
      status: row.status,
      supplementId: row.supplementId
    })),
    firstOrderCashMinor: input.option.economics?.cashTotalMinor ?? null,
    nextAction,
    optionalOmissions: omitted.map((row) => ({
      status: row.status,
      supplementId: row.supplementId
    })),
    pills: input.option.burden?.pills ?? 0,
    productCount: input.option.burden?.productCount ?? input.option.productIds?.length ?? 0,
    purchases: (input.option.productIds ?? []).map((productId) => ({ productId })),
    recommendedOptionId: input.option.optionId,
    retainedCurrent: input.option.retainedCurrent ?? [],
    safetyState: input.safetyState,
    savings90DayMinor: input.option.economics?.savings90DayMinor ?? null
  };
}

export function oracleCanonicalValue(published: OraclePublishedPlan) {
  const options = [...(published.options ?? [])]
    .map((option) => ({
      burden: {
        administrations: option.burden?.administrations ?? 0,
        pills: option.burden?.pills ?? 0,
        productCount: option.burden?.productCount ?? 0
      },
      cash90DayMinor: option.economics?.cash90DayMinor ?? option.cash90DayMinor ?? null,
      coverage: [...(option.coverage ?? [])]
        .map((row) => ({
          status: row.status,
          supplementId: row.supplementId
        }))
        .sort((left, right) => left.supplementId.localeCompare(right.supplementId)),
      optionId: option.optionId,
      productIds: [...(option.productIds ?? [])].sort(),
      recommended: Boolean(option.recommended),
      role: option.role ?? null,
      safetyCodes: [...(option.safety?.guidance ?? [])]
        .map((row) => row.code)
        .slice()
        .sort(),
      savings90DayMinor: option.economics?.savings90DayMinor ?? null
    }))
    .sort((left, right) => left.optionId.localeCompare(right.optionId));

  return {
    leftovers: published.leftovers ?? [],
    options,
    safety: [...(published.safetyGuidance ?? [])]
      .map((row) => ({ action: row.action, code: row.code }))
      .sort((left, right) => left.code.localeCompare(right.code) || left.action.localeCompare(right.action)),
    status: published.status ?? null
  };
}

export function oracleCanonicalHash(published: OraclePublishedPlan) {
  return canonicalHash(oracleCanonicalValue(published));
}
