"use client";
import { useCallback, useEffect, useState } from "react";
import { useFormulationPolling } from "@/components/nutrition-flow/use-formulation-polling";
import { partitionWebMatchingAdvice } from "@/lib/web-health-advice";
import { getLocalizedText } from "@/components/formulation-reveal-copy";
import { PharmacyProgressView } from "@/components/pharmacy/progress";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { pollFunnelStatus, fetchFunnelJson } from "@/lib/funnel-polling";
import type { FormulationResult, LocalizedText } from "@/lib/formulation-types";
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
  const text = (value: LocalizedText | undefined) => value ? getLocalizedText(value, locale) : "";
  if (!result) return <PharmacyProgressView locale={locale} stage={1} failed={polling.failed} onRetry={polling.retry} />;
  const ingredients = [...result.supplementBreakdown].sort((a, b) => a.effectivenessRank - b.effectivenessRank);
  const copy = health?.pageContent?.aiCopy;
  // Food guidance may finish after the order. Reuse it only for the frozen
  // recommendation; its formula, purchased products and prices stay unchanged.
  const current = polling.result;
  const sameRecommendation = current?.assessmentRevision === revision && current.selectionRevision === result.selectionRevision
    && Boolean(result.productRecommendations?.runId) && current.productRecommendations?.runId === result.productRecommendations?.runId;
  const food = (sameRecommendation ? current?.foodGapSupport ?? result.foodGapSupport : result.foodGapSupport)?.variants.balanced;
  const matching = result.productRecommendations?.matching;
  const advice = matching?.options.find(option => option.candidateKey === matching.selectedCandidateKey)?.advice
    ?? ingredients.flatMap(i => i.safety?.advice ?? []);
  const distinctAdvice = partitionWebMatchingAdvice(advice).medical;
  return <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8">
    <p className="text-sm font-semibold uppercase tracking-widest text-[var(--mn-teal-deep)]">{pharmacyName}</p>
    <h1 className="mt-3 font-serif text-4xl sm:text-5xl">{c.details}</h1>
    <p className="mt-5 max-w-3xl text-lg text-[var(--mn-ink-soft)]">{result.firstName || result.assessmentSummary.firstName ? `${result.firstName || result.assessmentSummary.firstName} — ` : ""}{c.introResults}</p>
    {<>
      <a className="mt-5 inline-block underline" href={pharmacyPath(locale, slug, "reveal", { plan: planId, order: receipt?.id })}>{c.back}</a>
      <section className="mt-10"><h2 className="font-serif text-3xl">{c.picture}</h2><p className="mt-3 leading-8">{result.assessmentSummary.profile}</p><p>{result.assessmentSummary.goals.join(" · ")}</p>
        {health && <p className="mt-4">{c.score}: <strong>{health.score}</strong> · {health.summary}</p>}
      </section>
      {!health && <div className="mt-5 rounded-xl bg-[var(--mn-cream)] p-5" role="status">{healthFailed ? c.error : c.explanationPending}
        {healthFailed && healthRetryAllowed && <button className="ml-3 underline" onClick={() => { setHealthFailed(false); setHealthAttempt(n => n + 1); }}>{c.retry}</button>}</div>}
      <section className="mt-10"><h2 className="font-serif text-3xl">{c.noticed}</h2>{copy?.findings?.map((card, index) => <article className="mt-5" key={index}><h3 className="font-semibold">{text(card.title ?? card.headline)}</h3><p className="mt-2 leading-7">{text(card.body)}</p></article>)}</section>
      <section className="mt-10"><h2 className="font-serif text-3xl">{c.thinking}</h2>{copy?.methodCards?.map((card, index) => <article className="mt-5" key={index}><h3 className="font-semibold">{text(card.title ?? card.headline)}</h3><p className="mt-2 leading-7">{text(card.body)}</p></article>)}</section>
    </>}
    <section className="mt-10"><h2 className="font-serif text-3xl">{c.ingredients} <span className="text-[var(--mn-ink-soft)]">({ingredients.length})</span></h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{ingredients.map(i => {
        const coverage = result.productRecommendations?.needCoverage?.find(row => row.id === `supplement:${i.id}`)?.coveragePercent;
        return <article key={i.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[var(--mn-line)]"><h3 className="font-semibold">{text(i.supplement)}</h3><p className="mt-1">{text(i.dailyDose)}</p>
          <p className="mt-2 text-sm text-[var(--mn-ink-soft)]">{c.coverage}: {coverage == null ? c.unknown : `${Math.ceil(coverage)}%`}</p>
          <p className="mt-3 leading-7">{text(i.forYou ?? i.rationale)}</p></article>;
      })}</div>
    </section>
    {<>
      <section className="mt-10"><h2 className="font-serif text-3xl">{receipt ? c.ordered : c.products}</h2>
        {(receipt ? result.recommendations.filter(p => receipt.lines.some(line => line.productId === (p.productId ?? p.id))) : result.recommendations).map(p => <article className="mt-5" key={p.id}><h3 className="font-semibold">{p.name}</h3><p>{p.description}</p><p className="mt-2 text-sm">{c.servings}: {p.servingMultiplier ?? c.unknown}</p></article>)}
      </section>
      <section className="mt-10"><h2 className="font-serif text-3xl">{c.foods}</h2>{food ? <><p className="mt-3">{text(food.body)}</p>{food.items.map(f => <article className="mt-5" key={f.foodId}><h3 className="font-semibold">{text(f.food)}</h3><p>{text(f.serving)} · {text(f.frequency)}</p><p className="mt-2">{text(f.rationale)}</p></article>)}</> : <p className="mt-3">{c.foodPending} <button className="underline" onClick={() => { void polling.refresh(); }}>{c.retry}</button></p>}</section>
      <section className="mt-10"><h2 className="font-serif text-3xl">{c.safety}</h2>{distinctAdvice.length ? distinctAdvice.map(a => <p key={`${a.code}:${a.ingredient}`} className="mt-4 leading-7">{text(a.message)}</p>) : <p className="mt-3">{c.adviceEmpty}</p>}</section>
    </>}
  </div>;
}
