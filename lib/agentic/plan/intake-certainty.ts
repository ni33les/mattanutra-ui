import type { CanonicalPlanState } from "@/lib/agentic/plan/types";

/** An empty observation list says nothing about dietary intake; only a supplied
 * known measurement (including explicit zero) can establish that part of exposure. */
export function intakeCertaintyFor(state: CanonicalPlanState, subjectId: string): "known" | "estimated" | "unknown" {
  const observations = (state.intake ?? []).filter(item => !item.supplementId || item.supplementId === subjectId);
  const diet = observations.filter(item => item.source === "diet" && item.supplementId === subjectId);
  const continuedReported = state.originalRequest?.currentSupplements != null ||
    observations.some(item => item.source === "current_supplement" && item.supplementId === subjectId);
  if (!diet.length || !continuedReported || observations.some(item => item.certainty === "unknown") ||
      state.leftovers.some(item => item.source === "current_supplement")) return "unknown";
  return observations.some(item => item.certainty === "estimated") ? "estimated" : "known";
}
