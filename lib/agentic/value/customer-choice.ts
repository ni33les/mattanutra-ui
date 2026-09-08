import type { CoverageRow, StackOption } from "@/lib/agentic/plan/types";
import { requestedTargetCoverage } from "@/lib/agentic/value/coverage-summary";

export function continuedIntakeCoversTargets(rows: readonly Partial<Pick<CoverageRow, "unresolved" | "intakeCertainty" | "requestedAmount" | "currentAmount" | "remainingGap">>[]) {
  // currentAmount contains quantified known contributions. Unknown additional
  // diet cannot undo already covered targets; its safety uncertainty remains.
  return rows.length > 0 && rows.every(row => !row.unresolved &&
    row.requestedAmount != null && row.currentAmount != null && row.requestedAmount > 0 && row.currentAmount >= row.requestedAmount &&
    row.remainingGap === 0);
}
function vector(option: StackOption) {
  return option.basket.map(item => `${item.productId}:${item.servingsPerDay}`).sort().join("|");
}
function pills(option: StackOption) {
  return option.basket.every(item => item.pillCountKnown !== false && item.dailyPills != null && Number.isFinite(item.dailyPills) && item.dailyPills >= 0)
    ? option.basket.reduce((sum, item) => sum + item.dailyPills, 0) : null;
}
function goodsPrice(option: StackOption, currency: string) {
  return option.basket.every(item => !item.incompleteCommercialFacts && item.currency === currency && Number.isSafeInteger(item.lineTotalMinor) && item.lineTotalMinor >= 0)
    ? option.basket.reduce((sum, item) => sum + item.lineTotalMinor, 0) : null;
}
function knownFirst(a: number | null, b: number | null) { return a == null ? b == null ? 0 : 1 : b == null ? -1 : a - b; }

/** A pointer into already evaluated choices. No search, substitution, new
 * basket, reordering of options, or recurring-savings inference occurs here. */
export function highlightedAlternativeOptionId(selected: StackOption | null, alternatives: readonly StackOption[], noPurchaseNeeded = false) {
  if (noPurchaseNeeded) return null;
  const selectedVector = selected ? vector(selected) : null;
  const currency = selected?.basket[0]?.currency ?? alternatives.flatMap(option => option.basket).map(item => item.currency).sort()[0] ?? "THB";
  const eligible = alternatives.filter(option => option.purchaseEligible !== false && option.basket.length > 0 &&
    vector(option) !== selectedVector && requestedTargetCoverage(option.coverage).coveragePercent > 0);
  eligible.sort((a, b) => {
    const left = requestedTargetCoverage(a.coverage), right = requestedTargetCoverage(b.coverage);
    return right.coveredCount - left.coveredCount || right.coveragePercent - left.coveragePercent || knownFirst(pills(a), pills(b)) ||
      a.basket.length - b.basket.length || knownFirst(goodsPrice(a, currency), goodsPrice(b, currency)) || vector(a).localeCompare(vector(b));
  });
  return eligible[0]?.optionId ?? null;
}
