import { SCORING_PRESETS, type ScoringPatch, type ScoringSettings } from "@/lib/matcher/scoring-policy";

// MCP's conversational default names the existing balanced policy; arithmetic,
// cache identity and the web resolver retain the same internal coefficients.
export const MCP_SCORING_PROFILES = ["best_match", "balanced", "best_coverage", "fewest_pills", "lowest_cost"] as const;
export const MCP_SCORING_PRESETS = Object.freeze({ best_match: SCORING_PRESETS.balanced,
  best_coverage: SCORING_PRESETS.best_coverage, fewest_pills: SCORING_PRESETS.fewest_pills, lowest_cost: SCORING_PRESETS.lowest_cost });
export function internalScoringPatch(patch: unknown): ScoringPatch | undefined {
  if (patch && typeof patch === "object" && !Array.isArray(patch) && "profile" in patch && patch.profile === "best_match") {
    return { ...patch, profile: "balanced" } as ScoringPatch;
  }
  return patch as ScoringPatch | undefined;
}
export function publicScoring(settings: ScoringSettings) {
  return { ...settings, profile: settings.profile === "balanced" ? "best_match" as const : settings.profile };
}
