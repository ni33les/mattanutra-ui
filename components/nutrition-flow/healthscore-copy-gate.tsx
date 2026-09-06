"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionnaireCalculating, type CalculatingStatus } from "@/components/chat-questionnaire/questionnaire-calculating";
import { requestHealthScoreEmail, retryHealthScoreCopy, waitForHealthScoreCopy } from "@/lib/healthscore-copy-client";
import type { Locale } from "@/lib/i18n";
import "@/components/chat-questionnaire/chat-questionnaire.css";

export function HealthScoreCopyGate({ locale, planId }: Readonly<{ locale: Locale; planId: string }>) {
  const router = useRouter();
  const [status, setStatus] = useState<CalculatingStatus>("building");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        // Explicit, idempotent request also repairs legacy/missing generation work.
        await retryHealthScoreCopy(planId, locale, controller.signal);
        if (!controller.signal.aborted) setStatus("building");
        const result = await waitForHealthScoreCopy(planId, locale, controller.signal);
        if (controller.signal.aborted) return;
        if (result.status === "ready") { setStatus("ready"); router.refresh(); }
        else setStatus("error");
      } catch { if (!controller.signal.aborted) setStatus("error"); }
    })();
    return () => controller.abort();
  }, [planId, locale, router, attempt]);
  return <QuestionnaireCalculating locale={locale} status={status} canOpenResults={false} onSeeResults={() => router.refresh()}
    onRetryAnalysis={() => { setStatus("building"); setAttempt(value => value + 1); }} onEmailSubmit={email => requestHealthScoreEmail(planId, locale, email)} />;
}
