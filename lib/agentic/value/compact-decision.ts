import { RESEARCH_VERSION } from "@/lib/agentic/discovery/versions";
import {
  planLevelSupplementNames,
  selectApplicableClaims
} from "@/lib/agentic/claims/select";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { mergeBySemanticKey } from "@/lib/agentic/plan/merge";
import type { PlanResult, SafetyGuidance, StackOption } from "@/lib/agentic/plan/types";
import { operationalActionText, operationalDecision, type OperationalDecision } from "@/lib/agentic/value/operational-decision";
import { canonicalJson } from "@/lib/agentic/value/canonical";
import { requestedTargetCoverage } from "@/lib/agentic/value/coverage-summary";

const COMPACT_LIMIT_BYTES = 4 * 1024;

export type CompactDecision = Readonly<{
  advice: readonly Readonly<{
    guidanceId: string;
    severity: SafetyGuidance["severity"];
    message: string;
    nutrientName: string | null;
    exposure: number | null;
    threshold: number | null;
    unit: string | null;
    contributors: readonly Readonly<{ productName: string; amount: number; unit: string }>[];
    ruleId: string;
    rulesVersion: string;
    sourceScope: SafetyGuidance["sourceScope"];
    comparator: SafetyGuidance["comparator"];
    authorityUrl: string | null;
    evidence: readonly string[];
    uncertainty: string;
    uncertaintyCodes: readonly string[];
    referenceBasis?: "continued_dose";
  }>[];
  nextAction: string;
  operationalDecision: OperationalDecision;
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
  safetyGuidance?: readonly SafetyGuidance[];
  questions?: readonly unknown[];
  coverage?: readonly Readonly<{
    deliveredAmount?: number;
    currentAmount?: number;
    remainingGap?: number;
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
  alternatives?: readonly StackOption[];
  selected: StackOption | null;
  status: PlanResult["status"];
}>;

export function compactDecisionBytes(decision: CompactDecision) {
  return Buffer.byteLength(JSON.stringify(decision), "utf8");
}

export function buildCompactDecision(result: CompactPlanView, resolvedDecision?: OperationalDecision): CompactDecision {
  const selected = result.selected;
  const locale = negotiateLocale(result.requestSnapshot?.locale);
  const durationUnknown = Boolean(result.horizon?.durationUnknown);
  const decision = resolvedDecision ?? operationalDecision({ status: result.status, hasSelectedOption: Boolean(selected?.basket.length),
    hasPurchaseOptions: result.alternatives?.some(option => option.basket.length > 0 && option.purchaseEligible !== false),
    hasQuestions: result.questions ? result.questions.length > 0 : undefined,
    purchaseRequiredNow: result.horizon?.purchaseRequiredNow,
    replenishesLater: (result.horizon?.nextReplenishmentDay ?? 0) > 0 });
  if (decision.status !== result.status) result = { ...result, status: decision.status };
  // Plan and option evaluation can produce the same finding. Keep distinct
  // details for a shared rule ID; only identical complete rows are duplicates.
  const guidanceByContent = new Map<string, SafetyGuidance>();
  for (const finding of [...(result.safetyGuidance ?? []), ...(selected?.safety?.guidance ?? [])]) {
    guidanceByContent.set(canonicalJson(finding), finding);
  }
  const advice = [...guidanceByContent.entries()].sort(([leftKey, left], [rightKey, right]) =>
    left.guidanceId.localeCompare(right.guidanceId) || leftKey.localeCompare(rightKey)
  ).map(([, finding]) => ({ guidanceId: finding.guidanceId, severity: finding.severity,
    message: finding.message, nutrientName: finding.nutrientName, exposure: finding.exposure,
    threshold: finding.threshold, unit: finding.unit,
    contributors: finding.contributors.map(({ productName, amount, unit }) => ({ productName, amount, unit })),
    ruleId: finding.ruleId, rulesVersion: finding.rulesVersion, sourceScope: finding.sourceScope,
    comparator: finding.comparator ?? null,
    uncertaintyCodes: finding.uncertaintyCodes ?? [], referenceBasis: finding.referenceBasis,
    authorityUrl: finding.authorityUrl ?? null, evidence: finding.evidence ?? [],
    uncertainty: finding.uncertainty ?? "Guidance uses the reported inputs and available evidence; it is not medical approval." }));
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
    advice,
    nextAction: operationalActionText(decision, locale),
    operationalDecision: decision,
    cost: {
      cash30DayMinor: selected?.economics?.cash30DayMinor ?? null,
      cash90DayMinor: selected?.economics?.cash90DayMinor ?? selected?.cash90DayMinor ?? null,
      currency: "THB",
      firstOrderMinor: selected?.economics?.cashTotalMinor ?? selected?.totalPriceMinor ?? null
    },
    optionId: selected?.optionId ?? null,
    status: result.status,
    what,
    when: decision.nextAction === "review_options" || (!decision.purchaseEligible && result.status !== "no_purchase")
      ? operationalActionText(decision, locale)
      : durationUnknown
      ? agenticMessage(locale, "plan.compact.when.unknown")
      : result.horizon?.purchaseRequiredNow
        ? agenticMessage(locale, "plan.compact.when.buy_now")
        : result.status === "no_purchase"
          ? agenticMessage(locale, "plan.compact.when.no_purchase")
          : agenticMessage(locale, "plan.compact.when.follow_schedule"),
    why: decision.nextAction === "review_options"
      ? [agenticMessage(locale, "plan.summary.review_options"),
          ...(durationUnknown ? [agenticMessage(locale, "plan.compact.why.duration_unknown")] : [])].join(" ")
      : whyFor(result, locale)
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
        current: row.currentAmount ?? 0,
        total: (row.currentAmount ?? 0) + (row.deliveredAmount ?? 0),
        gap: row.remainingGap ?? Math.max(0, row.requestedAmount - (row.currentAmount ?? 0) - (row.deliveredAmount ?? 0)),
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
  locale: ReturnType<typeof negotiateLocale>
) {
  if (result.status !== "ready" && result.status !== "no_purchase") {
    return agenticMessage(locale, "plan.compact.why.status", { status: result.status });
  }
  if (result.status === "no_purchase") {
    return [agenticMessage(locale, "plan.summary.no_purchase"),
      ...(result.horizon?.durationUnknown ? [agenticMessage(locale, "plan.compact.why.duration_unknown")] : [])].join(" ");
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
    const counts = requestedTargetCoverage(result.selected.coverage);
    return agenticMessage(locale, "plan.compact.why.selected", {
      ...counts,
      gapCount: counts.requestedCount - counts.coveredCount
    });
  }

  return agenticMessage(locale, "plan.compact.why.status", { status: result.status });
}
