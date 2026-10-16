"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { assessmentPollKey, fetchFunnelJson, pollFunnelStatus } from "@/lib/funnel-polling";
import type { Locale } from "@/lib/i18n";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";

/** Observe the already-running formula without holding up the report or checkout. */
export function useHealthScoreShortlist({ planId, revision, locale, initialCount }: {
  planId?: string;
  revision?: number;
  locale: Locale;
  initialCount: number | null;
}) {
  const router = useRouter();
  const key = JSON.stringify([planId, revision, locale]);
  const [observed, setObserved] = useState<{ key: string; count: number | null; failed: boolean } | null>(null);
  const current = observed?.key === key ? observed : null;

  useEffect(() => {
    if (!planId || revision === undefined || initialCount !== null) return;
    const controller = new AbortController();
    const changed = (value: NutritionJourneySnapshot) => value.revision !== revision || value.locale !== locale;
    const hasCount = (value: NutritionJourneySnapshot) => Number.isInteger(value.preparedNutrientCount) && (value.preparedNutrientCount ?? -1) >= 0;
    void (async () => {
      // A slow formula may outlive one foreground polling window. Leaving the
      // page cancels observation only; durable generation continues independently.
      while (!controller.signal.aborted) {
        const outcome = await pollFunnelStatus<NutritionJourneySnapshot>({
          subscriptionKey: assessmentPollKey(planId, locale, revision),
          signal: controller.signal,
          intervalMs: 3_000,
          read: async signal => (await fetchFunnelJson<NutritionJourneySnapshot>(
            `/api/assessment/${encodeURIComponent(planId)}/journey?locale=${encodeURIComponent(locale)}`, { signal }
          )).data,
          onValue: value => {
            if (changed(value)) { router.refresh(); return; }
            if (hasCount(value) || value.preparedFormulaFailed) {
              setObserved({ key, count: hasCount(value) ? value.preparedNutrientCount : null, failed: value.preparedFormulaFailed });
            }
          },
          ready: value => changed(value) || hasCount(value),
          failed: value => value.preparedFormulaFailed,
        });
        if (outcome.status !== "timeout") {
          if (outcome.status === "failed" && !controller.signal.aborted) setObserved({ key, count: null, failed: true });
          return;
        }
      }
    })().catch(() => {
      if (!controller.signal.aborted) setObserved({ key, count: null, failed: true });
    });
    return () => controller.abort();
  }, [initialCount, key, locale, planId, revision, router]);

  return { count: initialCount ?? current?.count ?? null, failed: current?.failed ?? false };
}
