"use client";
import { useCallback, useEffect, useState } from "react";
import { useFormulationPolling } from "@/components/nutrition-flow/use-formulation-polling";
import { PharmacyDeepDive } from "./deep-dive";
import { PharmacyProgressView } from "@/components/pharmacy/progress";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { pollFunnelStatus, fetchFunnelJson } from "@/lib/funnel-polling";
import type { FormulationResult } from "@/lib/formulation-types";
import type { HealthScoreResult } from "@/lib/health-score/v4-types";
import type { PharmacyOrderReceipt } from "@/lib/pharmacy-orders";
import type { Locale } from "@/lib/i18n";

export function PharmacyResults({ locale, sourceLocale = locale, slug, pharmacyName, planId, revision, initialResult = null, receipt = null }: {
  locale: Locale; sourceLocale?: Locale; slug: string; pharmacyName: string; planId: string; revision: number;
  initialResult?: FormulationResult | null; receipt?: PharmacyOrderReceipt | null;
}) {
  const complete = useCallback(() => {}, []);
  const polling = useFormulationPolling(planId, sourceLocale, initialResult, null, complete);
  // Orders keep the original formula even when a newer assessment exists.
  const result = receipt && initialResult ? initialResult : polling.result;
  const c = pharmacyCopy[locale];
  const [health, setHealth] = useState<HealthScoreResult | null>(null);
  const [healthFailed, setHealthFailed] = useState(false), [healthAttempt, setHealthAttempt] = useState(0);
  const [healthRetryAllowed, setHealthRetryAllowed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function observe() {
      if (healthAttempt) await fetchFunnelJson(`/api/assessment/${planId}/healthscore/retry`, { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: sourceLocale }) });
      const outcome = await pollFunnelStatus<{ generationStatus: string; healthScore?: HealthScoreResult; revision: number; retryAllowed: boolean }>({
        signal: controller.signal, read: async signal => (await fetchFunnelJson<{ generationStatus: string; healthScore?: HealthScoreResult; revision: number; retryAllowed: boolean }>(
          `/api/retail/orders?${new URLSearchParams({ view: "analysis", plan: planId, pharmacy: slug, ...(receipt ? { order: receipt.id } : {}) })}`, { signal })).data,
        ready: value => value.generationStatus === "ready", failed: value => value.generationStatus === "failed",
        onValue: value => { setHealthRetryAllowed(value.retryAllowed); if (value.revision === revision && value.generationStatus === "ready") setHealth(value.healthScore ?? null); }
      });
      if (outcome.status !== "ready") setHealthFailed(true);
    }
    void observe().catch(() => { if (!controller.signal.aborted) setHealthFailed(true); });
    return () => controller.abort();
  }, [healthAttempt, planId, revision, sourceLocale, slug, receipt]);
  if (!result) return <PharmacyProgressView locale={locale} stage={1} failed={polling.failed} onRetry={polling.retry} />;
  // Food guidance may finish after the order. Reuse it only for the frozen
  // recommendation; its formula, purchased products and prices stay unchanged.
  const current = polling.result;
  const sameRecommendation = current?.assessmentRevision === revision && current.selectionRevision === result.selectionRevision
    && Boolean(result.productRecommendations?.runId) && current.productRecommendations?.runId === result.productRecommendations?.runId;
  const food = (sameRecommendation ? current?.foodGapSupport ?? result.foodGapSupport : result.foodGapSupport)?.variants.balanced;
  const analysisNotice = !health && <div className="notice" role="status">{healthFailed ? c.error : c.explanationPending}
    {healthFailed && healthRetryAllowed && <button className="link-button" onClick={() => { setHealthFailed(false); setHealthAttempt(n => n + 1); }}>{c.retry}</button>}</div>;
  return <PharmacyDeepDive locale={locale} slug={slug} pharmacyName={pharmacyName} planId={planId}
    result={result} health={health} receipt={receipt} food={food} analysisNotice={analysisNotice}
    retryFood={() => { void polling.refresh(); }} />;
}
