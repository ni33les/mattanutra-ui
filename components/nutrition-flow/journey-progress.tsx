"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalculatingWait } from "@/components/chat-questionnaire/calculating-wait";
import { getWelcomeCopy } from "@/components/chat-questionnaire/questionnaire-welcome";
import "@/components/chat-questionnaire/chat-questionnaire.css";
import type { Locale } from "@/lib/i18n";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import { assessmentPollKey, fetchFunnelJson, pollFunnelStatus } from "@/lib/funnel-polling";

type JourneyProgressProps = Readonly<{
  initial: NutritionJourneySnapshot;
  locale: Locale;
  planId: string;
}>;

export function JourneyProgress({ initial, locale, planId }: JourneyProgressProps) {
  const router = useRouter();
  const support = getWelcomeCopy(locale);
  const [current, setCurrent] = useState(initial);
  const labels = current.formulationStatus === "ready" ? support.productProgress : support.formulaProgress;
  const [retryCount, setRetryCount] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const root = `/api/assessment/${encodeURIComponent(planId)}/journey`;
    async function recoverAndWait() {
      if (initial.readyForReveal && retryCount === 0) {
        router.replace(nutritionRevealPath(locale, planId));
        return;
      }
      // Explicit, idempotent recovery also repairs interrupted fulfillment and legacy projections.
      await fetchFunnelJson(root + "/retry", { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) });
      const outcome = await pollFunnelStatus({
        subscriptionKey: assessmentPollKey(planId, locale),
        read: async signal => {
          const value = (await fetchFunnelJson<NutritionJourneySnapshot>(`${root}?locale=${locale}`, { signal })).data;
          if (!controller.signal.aborted) setCurrent(value);
          return value;
        },
        ready: value => value.readyForReveal, failed: value => value.failed, signal: controller.signal
      });
      if (outcome.status === "ready") router.replace(nutritionRevealPath(locale, planId));
      else setFailed(true);
    }
    void recoverAndWait().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [initial.readyForReveal, locale, planId, retryCount, router]);

  return (
    <CalculatingWait copy={{ body: labels.body, disclaimer: support.calcDisclaimer,
      kicker: labels.kicker, line: support.calcLine, note: failed ? null : labels.note,
      status: failed ? labels.error : labels.building, title: labels.title }}
      spinning={!failed} testId="journey-progress">
      {failed ? <button type="button" className="mn-quiz-calc__ready-btn" data-testid="journey-progress-retry"
        onClick={() => { setFailed(false); setRetryCount(value => value + 1); }}>{labels.retry}</button> : null}
    </CalculatingWait>
  );
}
