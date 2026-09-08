import type { StackOption } from "@/lib/agentic/plan/types";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";

/** Describe an already-returned choice. Never alter scoring, eligibility,
 * ordering, or the selected basket to make a simpler routine look complete. */
export function routineTradeoff(selected: StackOption | null | undefined, options: readonly StackOption[], locale: string) {
  if (!selected || selected.basket.length < 2) return "";
  const covered = selected.coverage.filter(row => row.coveragePercent >= 100 && !row.unresolved);
  if (!covered.length) return "";
  const alternative = options.filter(option => option.optionId !== selected.optionId && option.purchaseEligible !== false && option.basket.length > 0 && option.basket.length < selected.basket.length
    && option.coverage.some(row => row.remainingGap > 0)
    && covered.every(target => option.coverage.some(row => row.supplementId === target.supplementId && row.coveragePercent >= 100 && !row.unresolved)))
    .sort((a, b) => a.basket.length - b.basket.length || a.optionId.localeCompare(b.optionId))[0];
  if (!alternative) return "";
  const gaps = alternative.coverage.filter(row => row.remainingGap > 0).map(row => `${row.name} ${Number(row.remainingGap.toPrecision(12))} ${row.unit}`).join(", ");
  return agenticMessage(negotiateLocale(locale), "plan.summary.simpler_partial", {
    count: alternative.basket.length, products: alternative.basket.map(row => row.productName).join(", "),
    covered: alternative.coverage.filter(row => row.coveragePercent >= 100 && !row.unresolved).map(row => row.name).join(", "), gaps
  });
}
