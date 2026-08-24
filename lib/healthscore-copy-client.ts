export const HEALTHSCORE_COPY_POLL_INTERVAL_MS = 1_500;
export const HEALTHSCORE_COPY_WAIT_MS = 90_000;

export type HealthScoreCopyStatus = Readonly<{
  copyFailed: boolean;
  copyReady: boolean;
}>;

export async function fetchHealthScoreCopyStatus(
  planId: string,
  fetchImpl: typeof fetch = fetch
): Promise<HealthScoreCopyStatus> {
  const response = await fetchImpl(
    `/api/assessment/${encodeURIComponent(planId)}/journey?view=copy`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Unable to load HealthScore copy status");
  }

  const payload = (await response.json()) as {
    copyFailed?: boolean;
    copyReady?: boolean;
  };

  return {
    copyFailed: payload.copyFailed === true,
    copyReady: payload.copyReady === true
  };
}
