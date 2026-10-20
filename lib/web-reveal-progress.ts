import type { NutritionJourneySnapshot } from "./nutrition-journey-read";

/** Available results take priority over independent HealthScore preparation. */
export function webRevealProgress({
  ready, failed, formulaReady, snapshot,
}: {
  ready: boolean;
  failed: boolean;
  formulaReady: boolean;
  snapshot: Pick<NutritionJourneySnapshot, "copyReady" | "copyFailed"> | null;
}): "ready" | "failed" | "matching" | "preparing" | "calculating" {
  if (ready) return "ready";
  if (failed) return "failed";
  if (formulaReady) return "matching";
  if (snapshot && !snapshot.copyReady && !snapshot.copyFailed) return "calculating";
  return "preparing";
}
