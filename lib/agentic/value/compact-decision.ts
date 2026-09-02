import { RESEARCH_VERSION } from "@/lib/agentic/discovery/versions";
import { selectApplicableClaims } from "@/lib/agentic/claims/select";
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
  coverage?: readonly Readonly<{ name: string; status: string }>[];
  horizon?: Readonly<{
    durationUnknown?: boolean;
    nextReplenishmentDay?: number | null;
    purchaseRequiredNow?: boolean;
  }>;
  requestSnapshot?: Readonly<{
    currentSupplements?: readonly Readonly<{
      daysRemaining?: number;
      name: string;
    }>[];
    locale?: string;
  }>;
  selected: StackOption | null;
  status: PlanResult["status"];
}>;

export function compactDecisionBytes(decision: CompactDecision) {
  return Buffer.byteLength(JSON.stringify(decision), "utf8");
}

export function buildCompactDecision(result: CompactPlanView): CompactDecision {
  const selected = result.selected;
  const durationUnknown = Boolean(result.horizon?.durationUnknown);
  const names = [
    ...(selected?.coverage ?? result.coverage ?? []).map((row) => row.name),
    ...(result.requestSnapshot?.currentSupplements ?? []).map((item) => item.name)
  ];
  const what = mergeBySemanticKey(
    selected
      ? selected.basket.map((item) => `${item.quantity}× ${item.productName}`)
      : (result.requestSnapshot?.currentSupplements ?? []).map((item) => item.name),
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
      ? "current stock duration unknown; do not invent a depletion date"
      : result.horizon?.purchaseRequiredNow
        ? "buy the day-zero basket now"
        : result.status === "no_purchase"
          ? "no purchase required now"
          : "follow the selected option schedule",
    why: whyFor(result, names)
  };
}

export function compactDecisionWithinBudget(decision: CompactDecision) {
  return compactDecisionBytes(decision) <= COMPACT_LIMIT_BYTES;
}

export function planClaimIds(result: CompactPlanView) {
  const names = [
    ...(result.selected?.coverage ?? result.coverage ?? []).map((row) => row.name),
    ...(result.requestSnapshot?.currentSupplements ?? []).map((item) => item.name)
  ];
  return selectApplicableClaims({
    status: result.status,
    supplementNames: names
  });
}

export function planResearchVersion() {
  return RESEARCH_VERSION;
}

function whyFor(result: CompactPlanView, names: readonly string[]) {
  if (result.status === "no_purchase") {
    return `Keep current ${names[0] ?? "stock"}; no purchase is required now.`;
  }

  if (result.horizon?.durationUnknown) {
    return "Current stock is present but days remaining were not given, so depletion and future cash stay unknown.";
  }

  if (result.selected?.role === "minimum_core") {
    return `Cover the core targets with ${result.selected.basket.length} product(s).`;
  }

  if (result.selected) {
    return `Selected ${result.selected.optionId} covers ${names.slice(0, 3).join(", ") || "the agreed targets"}.`;
  }

  return `Plan status is ${result.status}.`;
}
