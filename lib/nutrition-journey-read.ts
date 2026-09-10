import { getFunnelReadiness } from "@/lib/funnel-readiness";
export type NutritionJourneySnapshot = NonNullable<Awaited<ReturnType<typeof getFunnelReadiness>>>;
export const getNutritionJourneySnapshot = getFunnelReadiness;
export async function getHealthScoreCopySnapshot(planId: string, locale?: string) {
  const status = await getFunnelReadiness(planId, locale);
  if (!status) return null;
  return { planId, revision: status.revision, locale: status.locale, copyReady: status.copyReady, copyFailed: status.copyFailed,
    readyForHealthScore: status.readyForHealthScore, healthScorePageFailed: status.healthScorePageFailed,
    generationStatus: status.copyReady ? "ready" : status.copyFailed ? "failed" : "pending", resultVersion: status.resultVersion };
}
