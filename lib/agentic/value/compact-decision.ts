import { RESEARCH_VERSION } from "@/lib/agentic/discovery/versions";
import {
  planLevelSupplementNames,
  selectApplicableClaims
} from "@/lib/agentic/claims/select";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { mergeBySemanticKey } from "@/lib/agentic/plan/merge";
import type { PlanResult, StackOption } from "@/lib/agentic/plan/types";

const COMPACT_LIMIT_BYTES = 4 * 1024;

export type CompactDecision = Readonly<{
  cost: Readonly<{
    cash30DayMinor: number | null;
    cash90DayMinor: number | null;
    currency: string;
    firstOrderMinor: number | null;
  }>;
  optionId: string | null;
  status: PlanResult["status"];
  what: readonly string[];
  when: string;
  why: string;
}>;

export type CompactPlanView = Readonly<{
  coverage?: readonly Readonly<{
    deliveredAmount?: number;
    name: string;
    requestedAmount?: number;
    status: string;
    unit?: string;
  }>[];
  horizon?: Readonly<{
    durationUnknown?: boolean;
    nextReplenishmentDay?: number | null;
    purchaseRequiredNow?: boolean;
  }>;
  requestSnapshot?: Readonly<{
    currentSupplements?: readonly Readonly<{
      dailyAmount?: number;
      daysRemaining?: number;
      name: string;
      unit?: string;
    }>[];
    locale?: string;
    targets?: readonly Readonly<{
      amount?: number;
      name: string;
      unit?: string;
    }>[];
  }>;
  selected: StackOption | null;
  status: PlanResult["status"];
}>;

export function compactDecisionBytes(decision: CompactDecision) {
  return Buffer.byteLength(JSON.stringify(decision), "utf8");
}

export function buildCompactDecision(result: CompactPlanView): CompactDecision {
  const selected = result.selected;
  const locale = negotiateLocale(result.requestSnapshot?.locale);
  const durationUnknown = Boolean(result.horizon?.durationUnknown);
  const coverage = selected?.coverage ?? result.coverage ?? [];
  const names = [
    ...coverage.map((row) => row.name),
    ...(result.requestSnapshot?.currentSupplements ?? []).map((item) => item.name)
  ];
  const what = mergeBySemanticKey(
    [
      ...doseLines(result, locale),
      ...(selected
        ? selected.basket.map((item) => `${item.quantity}× ${item.productName}`)
        : (result.requestSnapshot?.currentSupplements ?? []).map((item) => item.name))
    ],
    (item) => item
  );

  return {
    cost: {
      cash30DayMinor: selected?.economics?.cash30DayMinor ?? null,
      cash90DayMinor: selected?.economics?.cash90DayMinor ?? selected?.cash90DayMinor ?? null,
      currency: "THB",
      firstOrderMinor: selected?.economics?.cashTotalMinor ?? selected?.totalPriceMinor ?? null
    },
    optionId: selected?.optionId ?? null,
    status: result.status,
    what,
    when: durationUnknown
      ? agenticMessage(locale, "plan.compact.when.unknown")
      : result.horizon?.purchaseRequiredNow
        ? agenticMessage(locale, "plan.compact.when.buy_now")
        : result.status === "no_purchase"
          ? agenticMessage(locale, "plan.compact.when.no_purchase")
          : agenticMessage(locale, "plan.compact.when.follow_schedule"),
    why: whyFor(result, names, locale)
  };
}

export function compactDecisionWithinBudget(decision: CompactDecision) {
  return compactDecisionBytes(decision) <= COMPACT_LIMIT_BYTES;
}

export function planClaimIds(result: CompactPlanView) {
  const names = planLevelSupplementNames(
    result.selected?.coverage ?? result.coverage ?? [],
    result.status === "no_purchase"
      ? (result.requestSnapshot?.currentSupplements ?? []).map((item) => item.name)
      : []
  );
  return selectApplicableClaims({
    status: result.status === "no_purchase" ? "no_purchase" : "ready",
    supplementNames: names
  });
}

export function planResearchVersion() {
  return RESEARCH_VERSION;
}

function doseLines(result: CompactPlanView, locale: ReturnType<typeof negotiateLocale>) {
  const coverage = result.selected?.coverage ?? result.coverage ?? [];
  const fromCoverage = coverage.flatMap((row) => {
    if (row.requestedAmount == null || !row.unit) {
      return [];
    }
    return [
      agenticMessage(locale, "plan.compact.what.dose", {
        amount: row.requestedAmount,
        delivered: row.deliveredAmount ?? 0,
        name: row.name,
        unit: row.unit
      })
    ];
  });
  if (fromCoverage.length > 0) {
    return fromCoverage;
  }

  return (result.requestSnapshot?.targets ?? []).flatMap((target) => {
    if (target.amount == null || !target.unit) {
      return [];
    }
    const coverageRow = coverage.find((row) => row.name === target.name);
    return [
      agenticMessage(locale, "plan.compact.what.dose", {
        amount: target.amount,
        delivered: coverageRow?.deliveredAmount ?? 0,
        name: target.name,
        unit: target.unit
      })
    ];
  });
}

function whyFor(
  result: CompactPlanView,
  names: readonly string[],
  locale: ReturnType<typeof negotiateLocale>
) {
  if (result.status === "no_purchase") {
    return agenticMessage(locale, "plan.compact.why.no_purchase", {
      name: names[0] ?? "stock"
    });
  }

  if (result.horizon?.durationUnknown) {
    return agenticMessage(locale, "plan.compact.why.duration_unknown");
  }

  if (result.selected?.role === "minimum_core") {
    return agenticMessage(locale, "plan.compact.why.minimum_core", {
      count: result.selected.basket.length
    });
  }

  if (result.selected) {
    return agenticMessage(locale, "plan.compact.why.selected", {
      names: names.slice(0, 3).join(", ") || "the agreed targets",
      optionId: result.selected.optionId
    });
  }

  return agenticMessage(locale, "plan.compact.why.status", { status: result.status });
}
