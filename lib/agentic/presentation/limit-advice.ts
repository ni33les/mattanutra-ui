import { formatNutrientAmount } from "@/lib/agentic/presentation/amount";
import type { StackOption } from "@/lib/agentic/plan/types";

export const LIMIT_ADVICE_POLICY = "Advice reports only quantified exposure above MattaNutra recommended limits. Equal, below-limit and unknown exposure produce no advice. Medication/condition codes are accepted inputs, not interaction coverage. Absence of advice is not medical clearance. Limits remain advisory, including at weight zero.";

/** MCP presentation only: preserve the full internal findings and web behaviour. */
export function recommendedLimitFindings(option: Pick<StackOption, "safety" | "doseFit">) {
  return (option.safety?.guidance ?? []).flatMap(row => {
    if (row.code !== "dose_review_required" || row.ruleId.startsWith("ul:missing:") ||
      (row.comparator != null && row.comparator !== "gt" && row.comparator !== "gte") ||
      row.threshold == null || !Number.isFinite(row.threshold) || row.threshold <= 0 || !row.unit) return [];
    let exposure = row.exposure;
    const estimatedEndpoint = row.uncertaintyCodes?.includes("upper_endpoint_of_estimate");
    if (estimatedEndpoint) {
      const reference = option.doseFit?.perLimit.find(limit => row.supplementIds.includes(limit.subjectId) &&
        limit.sourceScope === row.sourceScope && limit.unit === row.unit && limit.limit === row.threshold);
      exposure = reference?.exposureMinimum ?? null;
    }
    if (exposure == null || !Number.isFinite(exposure) || exposure <= row.threshold) return [];
    return [{ ...row, exposure, ...(estimatedEndpoint ? { uncertainty: "lower_bound" } : {}) }];
  });
}

export function recommendedLimitMessage(limit: number, unit: string, locale: string, requested?: number | null) {
  const amount = formatNutrientAmount(limit, unit, requested), label = unit === "mcg" || unit === "ug" ? "µg" : unit;
  if (locale === "th") return `ปริมาณนี้เกินขีดจำกัดที่ MattaNutra แนะนำที่ ${amount} ${label}/วัน`;
  if (locale === "zh-CN" || locale === "zh") return `此剂量超过 MattaNutra 建议的每日上限 ${amount} ${label}。`;
  return `This dose exceeds the MattaNutra recommended limit of ${amount} ${label}/day.`;
}
