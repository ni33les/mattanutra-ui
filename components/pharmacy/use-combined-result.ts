"use client";
import { useEffect, useState } from "react";
import {
  assessmentPollKey,
  fetchFunnelJson,
  pollFunnelStatus,
} from "@/lib/funnel-polling";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import type { FormulationResult } from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";

/** One status stream; formula and full basket are fetched only at changed ready versions. */
export function useCombinedResult({
  planId,
  locale,
  initial,
  initialResult,
  frozen,
}: {
  planId: string;
  locale: Locale;
  initial: NutritionJourneySnapshot | null;
  initialResult: FormulationResult | null;
  frozen: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initial),
    [result, setResult] = useState(initialResult);
  const [failed, setFailed] = useState(Boolean(initial?.failed)),
    [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(
    frozen || Boolean(initial?.readyForReveal && initialResult),
  );
  useEffect(() => {
    if (frozen || (attempt === 0 && initial?.readyForReveal && initialResult))
      return;
    const controller = new AbortController();
    const root = `/api/assessment/${encodeURIComponent(planId)}`;
    let version = initialResult ? initial?.resultVersion : null,
      revision = initial?.revision,
      complete = false;
    async function observe() {
      if (attempt > 0)
        await fetchFunnelJson(root + "/journey/retry", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale }),
        });
      const outcome = await pollFunnelStatus<NutritionJourneySnapshot>({
        subscriptionKey: assessmentPollKey(planId, locale),
        signal: controller.signal,
        read: async (signal) =>
          (
            await fetchFunnelJson<NutritionJourneySnapshot>(
              `${root}/journey?locale=${locale}`,
              { signal },
            )
          ).data,
        onValue: async (value) => {
          setSnapshot(value);
          if (revision !== value.revision) {
            setResult(null);
            setReady(false);
            version = null;
            complete = false;
            revision = value.revision;
          }
          if (value.formulationStatus !== "ready") return;
          if (
            value.resultVersion !== version ||
            (value.readyForReveal && !complete)
          ) {
            const payload = await fetchFunnelJson<
              FormulationResult & { revision: number; resultVersion: string }
            >(
              `${root}/formulation?locale=${locale}&products=${value.readyForReveal ? 1 : 0}`,
              { signal: controller.signal },
            );
            if (
              payload.status === 202 ||
              payload.data.revision !== value.revision ||
              payload.data.resultVersion !== value.resultVersion
            )
              return;
            controller.signal.throwIfAborted();
            setResult({
              ...payload.data,
              assessmentRevision: payload.data.revision,
            });
            version = value.resultVersion;
            complete = value.readyForReveal;
            setReady(complete);
          }
        },
        ready: (value) => value.readyForReveal && complete,
        failed: (value) =>
          value.failed || value.formulationStatus === "inconsistent",
      });
      if (!controller.signal.aborted && outcome.status !== "ready")
        setFailed(true);
    }
    void observe().catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [attempt, frozen, initial, initialResult, locale, planId]);
  return {
    snapshot,
    result,
    ready: frozen || ready,
    failed,
    retry: () => {
      setFailed(false);
      setReady(false);
      setAttempt((n) => n + 1);
    },
  };
}
