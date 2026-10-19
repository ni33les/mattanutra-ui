"use client";
import { useCallback } from "react";
import { PharmacyDeepDive } from "@/components/pharmacy/deep-dive";
import { useFormulationPolling } from "./use-formulation-polling";
import { webProductCopy } from "./web-product-copy";
import { nutritionRevealPath, nutritionHealthScorePath } from "@/lib/nutrition-paths";
import type { FormulationResult } from "@/lib/formulation-types";
import type { HealthScoreResult } from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";

export function WebPlanDetails({ locale, planId, initialResult, initial, health }: {
  locale: Locale; planId: string; initialResult: FormulationResult | null; initial: NutritionJourneySnapshot;
  health: HealthScoreResult | null;
}) {
  const complete = useCallback(() => {}, []);
  const polling = useFormulationPolling(planId, locale, initialResult, null, complete, true, initial, true);
  const c = webProductCopy[locale];
  if (!polling.result) return <div className="mx-auto max-w-3xl px-6 py-12"><p role="status">{polling.failed ? c.failed : c.preparing}</p>
    {polling.failed && <button type="button" onClick={polling.retry}>{c.retry}</button>}<p className="mt-4"><a href={nutritionRevealPath(locale, planId)}>{c.back}</a></p></div>;
  return <PharmacyDeepDive web locale={locale} slug="" pharmacyName="MattaNutra" planId={planId}
    result={polling.result} receipt={null} health={health} food={polling.result.foodGapSupport?.variants.balanced}
    analysisNotice={<p className="notice"><a href={`${nutritionHealthScorePath(locale, planId)}&view=optional`}>{c.health}</a></p>}
    retryFood={() => { void polling.refresh(); }} />;
}
