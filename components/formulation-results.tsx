"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { getWelcomeCopy } from "@/components/chat-questionnaire/questionnaire-welcome";
import { useFormulationPolling } from "@/components/nutrition-flow/use-formulation-polling";
import { FunnelLoading } from "@/components/nutrition-flow/funnel-loading";
import { formulationResultsCopy } from "@/components/formulation-results-copy";
import {
  defaultProductStackPreferenceForResult,
  planPaywallHref,
  productRecommendationOptionsForResult,
  resultHasPendingProductRecommendations,
  resultHasProductStackRows,
  selectProductRecommendationOption,
  supplementProductCoverageById,
} from "@/components/formulation-results-helpers";
import { PharmacyOrderPanel } from "@/components/pharmacy/order-panel";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import type { PharmacySource } from "@/lib/pharmacy-acquisition";
import type { PharmacyOrderReceipt } from "@/lib/pharmacy-orders";
import { RevealFinalResultsPage } from "@/components/reveal-final-results";
import type {
  FormulationResult,
  ProductStackPreference,
} from "@/lib/formulation-types";
import { localeHtmlLang, type Locale } from "@/lib/i18n";
import type { NutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import { WebPreparationPanel } from "@/components/nutrition-flow/web-preparation-panel";

type FormulationResultsProps = Readonly<{
  initialResult?: FormulationResult | null;
  initialStackPreference?: ProductStackPreference | null;
  locale: Locale;
  planId: string;
  pharmacy?: { source?: PharmacySource; slug: string; name: string; revision: number; sourceLocale: Locale; receipt: PharmacyOrderReceipt | null };
  commerce?: { answers: Record<string, unknown>; initial: NutritionJourneySnapshot | null; bootstrap: boolean };
}>;

export function FormulationResults({
  initialStackPreference = null,
  initialResult = null,
  locale,
  planId,
  pharmacy,
  commerce,
}: FormulationResultsProps) {
  const labels = formulationResultsCopy[locale];
  const effectivePlanId = planId;
  const [selectedProductStackPreference, setSelectedProductStackPreference] =
    useState<ProductStackPreference | null>(() =>
      initialStackPreference ??
      (initialResult
        ? defaultProductStackPreferenceForResult(initialResult)
        : "balanced"),
    );
  const [productPollingPreference, setProductPollingPreference] =
    useState<ProductStackPreference | null>(null);

  const pollingComplete = useCallback(() => setProductPollingPreference(null), []);
  const { result, snapshot, loadState, failed, retry, refresh: refreshFormulationResult } = useFormulationPolling(
    effectivePlanId, pharmacy?.sourceLocale ?? locale, initialResult, productPollingPreference, pollingComplete, !pharmacy?.receipt,
    commerce?.initial, Boolean(commerce), commerce?.bootstrap);
  const startProductStackPolling = useCallback((preference: ProductStackPreference) => {
    setProductPollingPreference(preference);
  }, []);
  const recovery = <button type="button" className="mt-4 rounded-lg px-5 py-3 ring-1 ring-foreground/20"
    data-testid="formulation-retry" onClick={retry}>{getWelcomeCopy(locale).formulaProgress.retry}</button>;

  useEffect(() => {
    if (!result) {
      return;
    }

    const options = productRecommendationOptionsForResult(result);
    const defaultPreference = defaultProductStackPreferenceForResult(result);

    startTransition(() => {
      setSelectedProductStackPreference((current) =>
        current &&
        (options.some((option) => option.id === current) ||
          current === productPollingPreference)
          ? current
          : defaultPreference,
      );
    });
  }, [productPollingPreference, result]);

  const preparation = commerce ? <WebPreparationPanel answers={commerce.answers} failed={failed}
    formulaReady={Boolean(result && result.access !== "preview")} ready={Boolean(snapshot?.readyForReveal && !snapshot.refreshPending && !snapshot.failed && result && !resultHasPendingProductRecommendations(result))}
    locale={locale} planId={planId} retry={retry} /> : null;

  if (loadState === "loading") {
    return preparation ? <>{preparation}</> : <FunnelLoading locale={locale} stage="opening" />;
  }

  if (loadState === "error" || !result) {
    if (preparation) return <>{preparation}</>;
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
        <div className="rounded-lg bg-white p-6 text-center ring-1 ring-foreground/10 sm:p-8">
          <ExclamationTriangleIcon
            aria-hidden={true}
            className="mx-auto size-10 text-amber-500"
          />
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            {labels.error}
          </p>
          {recovery}
        </div>
      </section>
    );
  }

  const orderedIngredients = [...result.supplementBreakdown].sort(
    (first, second) => first.effectivenessRank - second.effectivenessRank,
  );
  const formattedDate = new Intl.DateTimeFormat(localeHtmlLang(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(result.generatedAt));
  const effectiveResultPlanId = result.planId || effectivePlanId;
  const isPreview = !pharmacy && result.access === "preview";
  const unlockHref = planPaywallHref(locale, effectiveResultPlanId);
  const productRecommendationOptions =
    productRecommendationOptionsForResult(result);
  const explicitProductStackPreference = selectedProductStackPreference ?? null;
  const exactSelectedProductRecommendationOption =
    explicitProductStackPreference
      ? productRecommendationOptions.find(
          (option) => option.id === explicitProductStackPreference,
        )
      : undefined;
  const selectedProductRecommendationOption = explicitProductStackPreference
    ? exactSelectedProductRecommendationOption
    : selectProductRecommendationOption(productRecommendationOptions, null);
  const selectedProductStackUnavailable = Boolean(
    explicitProductStackPreference && !exactSelectedProductRecommendationOption,
  );
  const productStackLoading = Boolean(
    orderedIngredients.length > 0 && explicitProductStackPreference &&
      (productPollingPreference === explicitProductStackPreference ||
        selectedProductStackUnavailable) &&
      !resultHasProductStackRows(result, explicitProductStackPreference),
  );
  const productCoveragePending =
    Boolean(commerce && (!snapshot?.readyForReveal || snapshot.refreshPending || snapshot.failed)) || productStackLoading || resultHasPendingProductRecommendations(result);
  const activeProductRecommendations =
    selectedProductStackUnavailable
      ? undefined
      : selectedProductRecommendationOption?.productRecommendations ??
        result.productRecommendations;
  const activeProductRecommendationItems =
    selectedProductStackUnavailable
      ? []
      : selectedProductRecommendationOption?.recommendations ??
        result.recommendations;
  const productCoverageBySupplementId = supplementProductCoverageById(
    activeProductRecommendations,
  );

  return (
    <>
    {preparation}
    {failed && !commerce ? <div role="status" className="mx-auto max-w-6xl px-6">{labels.error} {recovery}</div> : null}
    <RevealFinalResultsPage
      commerce={Boolean(commerce)}
      activeProductRecommendations={activeProductRecommendations}
      formattedDate={formattedDate}
      ingredients={orderedIngredients}
      isPreview={isPreview}
      labels={labels}
      locale={locale}
      onProductStackPreferenceChange={setSelectedProductStackPreference}
      onProductStackPollingStart={startProductStackPolling}
      onProductStackRefresh={refreshFormulationResult}
      planId={effectiveResultPlanId}
      productCoverageBySupplementId={productCoverageBySupplementId}
      productCoveragePending={productCoveragePending}
      productRecommendationOptions={productRecommendationOptions}
      productStackLoading={productStackLoading}
      products={activeProductRecommendationItems}
      result={result}
      selectedProductStackPreference={
        selectedProductRecommendationOption?.id ??
        selectedProductStackPreference
      }
      unlockHref={unlockHref}
      pharmacy={pharmacy ? {
        name: pharmacy.name,
        planHref: pharmacyPath(locale, pharmacy.slug, "plan", { plan: planId, order: pharmacy.receipt?.id }),
        quizHref: pharmacyPath(locale, pharmacy.slug, "quiz", { source: pharmacy.source }),
        orderPanel: <PharmacyOrderPanel key={result.productRecommendations?.runId ?? pharmacy.revision}
          planId={planId} slug={pharmacy.slug} locale={locale} revision={pharmacy.revision}
          pharmacyName={pharmacy.name} initialReceipt={pharmacy.receipt} onRefresh={retry} />
      } : undefined}
    />
    </>
  );
}

export { FinalReportPanel } from "@/components/formulation-results-panels";
