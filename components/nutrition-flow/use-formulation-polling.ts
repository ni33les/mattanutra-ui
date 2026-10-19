"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormulationResult, ProductStackPreference } from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import { assessmentPollKey, fetchFunnelJson, pollFunnelStatus } from "@/lib/funnel-polling";

export function useFormulationPolling(planId: string, locale: Locale, initialResult: FormulationResult | null,
  productPollingPreference: ProductStackPreference | null, onPollingComplete: () => void, enabled = true,
  initialSnapshot: NutritionJourneySnapshot | null = null, commerce = false, bootstrap = false) {
  const [result, setResult] = useState(initialResult);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useRef<Promise<boolean> | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const version = useRef<string | null>(null);
  const hasResult = useRef(Boolean(initialResult));
  const bootstrapped = useRef(false);
  const revision = useRef(initialSnapshot?.revision);
  const root = `/api/assessment/${encodeURIComponent(planId)}`;

  const refresh = useCallback((signal?: AbortSignal, expected?: NutritionJourneySnapshot): Promise<boolean> => {
    if (request.current) return request.current;
    const work = (async () => {
      const response = await fetchFunnelJson<FormulationResult & { revision: number; resultVersion: string }>(`${root}/formulation?locale=${locale}&products=${expected && (!expected.readyForReveal || expected.refreshPending) ? 0 : 1}`,
        { signal: signal ?? lifecycle.current?.signal });
      if (response.status === 202) return false;
      if (!Array.isArray(response.data.supplementBreakdown)) return false;
      if (expected && (response.data.revision !== expected.revision || response.data.resultVersion !== expected.resultVersion)) return false;
      if ((signal ?? lifecycle.current?.signal)?.aborted) return false;
      setResult(response.data);
      hasResult.current = true;
      version.current = response.data.resultVersion;
      return true;
    })();
    request.current = work;
    void work.finally(() => { if (request.current === work) request.current = null; }).catch(() => {});
    return work;
  }, [locale, root]);

  useEffect(() => {
    if (!enabled) return; // Frozen pharmacy receipts never follow a newer recommendation.
    const controller = new AbortController();
    lifecycle.current = controller;
    async function wait() {
      // Opening a saved result is read-only. Only the explicit retry action admits recovery work.
      if (attempt > 0 || (bootstrap && !bootstrapped.current)) {
        await fetchFunnelJson(`${root}/${commerce ? "journey/retry" : "formulation/refresh"}`, { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) });
        bootstrapped.current = true;
      }
      const outcome = await pollFunnelStatus({
        subscriptionKey: assessmentPollKey(planId, locale),
        ...(commerce ? { foregroundWaitMs: 300_000 } : {}),
        read: async signal => (await fetchFunnelJson<NutritionJourneySnapshot>(`${root}/journey?locale=${locale}`, { signal })).data,
        onValue: async snapshot => {
          setSnapshot(snapshot);
          if (revision.current !== undefined && revision.current !== snapshot.revision) {
            setResult(null); hasResult.current = false; version.current = null;
          }
          revision.current = snapshot.revision;
          if (snapshot.formulationStatus === "ready" && snapshot.resultVersion !== version.current) await refresh(controller.signal, snapshot);
        },
        ready: value => value.readyForReveal && !value.refreshPending && hasResult.current && value.resultVersion === version.current,
        failed: value => value.failed || value.formulationStatus === "inconsistent", signal: controller.signal
      });
      if (outcome.status !== "ready") setFailed(true);
      else onPollingComplete();
    }
    void wait().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt, bootstrap, commerce, enabled, locale, onPollingComplete, planId, productPollingPreference, refresh, root]);

  const retry = useCallback(() => { setFailed(false); setAttempt(value => value + 1); }, []);
  return { result, snapshot, failed, retry, refresh: () => refresh(), loadState: result ? "ready" : failed ? "error" : "loading" };
}
