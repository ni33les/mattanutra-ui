import type { SafetyGuidance } from "@/lib/agentic/plan/types";
export type AdviceKind = "dose_review" | "interaction" | "overlap" | "incomplete_information" | "product_data" | "other";
const RULE_KINDS: Record<SafetyGuidance["code"], AdviceKind> = {
  dose_review_required: "dose_review", continued_dose_increased: "dose_review",
  medication_interaction: "interaction", condition_review_required: "interaction",
  duplicate_or_overlap: "overlap", incomplete_information: "incomplete_information",
  unverified_product_facts: "product_data", audience_mismatch: "other", pediatric_review_required: "other"
};
/** Classification follows the generating rule; overlapping products alone do
 * not become evidence of a reference breach. Historical unknown rules survive. */
export function adviceKind(row: Pick<SafetyGuidance, "code">): AdviceKind {
  return RULE_KINDS[row.code] ?? "other";
}
