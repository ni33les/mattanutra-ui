"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormulationResult, ProductStackPreference } from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import { fetchFunnelJson, pollFunnelStatus } from "@/lib/funnel-polling";

export function useFormulationPolling(planId: string, locale: Locale, initialResult: FormulationResult | null,
  productPollingPreference: ProductStackPreference | null, onPollingComplete: () => void) {
  const [result, setResult] = useState(initialResult);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useRef<Promise<boolean> | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const version = useRef<string | null>(null);
  const hasResult = useRef(Boolean(initialResult));
  const root = `/api/assessment/${encodeURIComponent(planId)}`;

  const refresh = useCallback((signal?: AbortSignal): Promise<boolean> => {
    if (request.current) return request.current;
    const work = (async () => {
      const response = await fetchFunnelJson<FormulationResult & { resultVersion: string }>(`${root}/formulation?locale=${locale}&products=1`,
        { signal: signal ?? lifecycle.current?.signal });
      if (response.status === 202) return false;
      if (!Array.isArray(response.data.supplementBreakdown)) return false;
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
    const controller = new AbortController();
    lifecycle.current = controller;
    async function wait() {
      await fetchFunnelJson(`${root}/formulation/refresh`, { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) });
      const outcome = await pollFunnelStatus({
        read: async signal => {
          const snapshot = (await fetchFunnelJson<NutritionJourneySnapshot>(`${root}/journey?locale=${locale}`, { signal })).data;
          if (snapshot.formulationStatus === "ready" && snapshot.resultVersion !== version.current) await refresh(signal);
          return snapshot;
        },
        ready: value => value.readyForReveal && !value.refreshPending && hasResult.current,
        failed: value => value.failed || value.formulationStatus === "inconsistent", signal: controller.signal
      });
      if (outcome.status !== "ready") setFailed(true);
      else onPollingComplete();
    }
    void wait().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt, locale, onPollingComplete, productPollingPreference, refresh, root]);

  const retry = useCallback(() => { setFailed(false); setAttempt(value => value + 1); }, []);
  return { result, failed, retry, refresh: () => refresh(), loadState: result ? "ready" : failed ? "error" : "loading" };
}
