/** Independent Slice 5 oracles. Do not import production explanation, economics, or matching. */

import { canonicalHash } from "../../../lib/agentic/value/canonical.ts";

export type OraclePublishedOption = Readonly<{
  stackSummary?: Readonly<{ totalDailyPills: number; productCount: number; totalPriceMinor: number }>;
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
  basket?: readonly Readonly<{
    productId: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }>[];
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
  basket: OraclePublishedPlan["basket"];
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
    pills: input.option.stackSummary?.totalDailyPills ?? 0,
    productCount: input.option.stackSummary?.productCount ?? input.basket?.length ?? 0,
    purchases: (input.basket ?? []).map(({ productId }) => ({ productId })),
    recommendedOptionId: input.option.optionId,
    retainedCurrent: input.option.retainedCurrent ?? [],
    safetyState: input.safetyState,
    savings90DayMinor: input.option.economics?.savings90DayMinor ?? null
  };
}

export function oracleCanonicalValue(published: OraclePublishedPlan) {
  const options = [...(published.options ?? [])]
    .map((option) => ({
      stackSummary: option.stackSummary ?? null,
      cash90DayMinor: option.economics?.cash90DayMinor ?? option.cash90DayMinor ?? null,
      optionId: option.optionId,
      recommended: Boolean(option.recommended),
      role: option.role ?? null,
      deferredTargetIds: [...(option.deferredTargetIds ?? [])].sort(),
      omittedTargetIds: [...(option.omittedTargetIds ?? [])].sort(),
      savings90DayMinor: option.economics?.savings90DayMinor ?? null
    }))
    .sort((left, right) => left.optionId.localeCompare(right.optionId));

  return {
    basket: [...(published.basket ?? [])].map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor: line.lineTotalMinor
    })).sort((a, b) => a.productId.localeCompare(b.productId)),
    coverage: published.coverage ?? [],
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
