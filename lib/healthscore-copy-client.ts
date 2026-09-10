import { assessmentPollKey, fetchFunnelJson, pollFunnelStatus } from "@/lib/funnel-polling";
import type { Locale } from "@/lib/i18n";
export const HEALTHSCORE_COPY_POLL_INTERVAL_MS = 1_500;
export const HEALTHSCORE_COPY_WAIT_MS = 300_000;
export type HealthScoreCopyStatus = Readonly<{ copyFailed: boolean; copyReady: boolean; readyForHealthScore?: boolean; healthScorePageFailed?: boolean; revision?: number; resultVersion?: string }>;

export async function fetchHealthScoreCopyStatus(planId: string, fetchImpl: typeof fetch = fetch, locale?: Locale): Promise<HealthScoreCopyStatus> {
  const response = await fetchImpl(`/api/assessment/${encodeURIComponent(planId)}/journey?view=copy${locale ? `&locale=${locale}` : ""}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load HealthScore copy status");
  return response.json();
}

export async function waitForHealthScoreCopy(planId: string, locale: Locale, signal: AbortSignal) {
  // A foreground wait window is not a generation failure. Continue observing
  // admitted work until it finishes, fails, or navigation cancels the wait.
  for (;;) {
    signal.throwIfAborted();
    const result = await pollFunnelStatus({ subscriptionKey: assessmentPollKey(planId, locale), signal,
      foregroundWaitMs: HEALTHSCORE_COPY_WAIT_MS, read: async signal => (await fetchFunnelJson<HealthScoreCopyStatus>(
        `/api/assessment/${encodeURIComponent(planId)}/journey?locale=${encodeURIComponent(locale)}`, { signal })).data,
      ready: status => status.readyForHealthScore === true, failed: status => status.copyFailed || status.healthScorePageFailed === true });
    if (result.status !== "timeout") return result;
  }
}
export async function retryHealthScoreCopy(planId: string, locale: Locale, signal?: AbortSignal) {
  return fetchFunnelJson(`/api/assessment/${encodeURIComponent(planId)}/healthscore/retry`, {
    method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ locale }) });
}
export async function requestHealthScoreEmail(planId: string, locale: Locale, email: string) {
  return (await fetchFunnelJson<{ id: string; status: string }>(`/api/assessment/${encodeURIComponent(planId)}/healthscore-delivery`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale, email }) })).data;
}
