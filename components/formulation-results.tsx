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
import { RevealFinalResultsPage } from "@/components/reveal-final-results";
import type {
  FormulationResult,
  ProductStackPreference,
} from "@/lib/formulation-types";
import { localeHtmlLang, type Locale } from "@/lib/i18n";

type FormulationResultsProps = Readonly<{
  initialResult?: FormulationResult | null;
  initialStackPreference?: ProductStackPreference | null;
  locale: Locale;
  planId: string;
}>;

export function FormulationResults({
  initialStackPreference = null,
  initialResult = null,
  locale,
  planId,
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
  const { result, loadState, failed, retry, refresh: refreshFormulationResult } = useFormulationPolling(
    effectivePlanId, locale, initialResult, productPollingPreference, pollingComplete);
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

  if (loadState === "loading") {
    return null;
  }

  if (loadState === "error" || !result) {
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
  const isPreview = result.access === "preview";
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
    productStackLoading || resultHasPendingProductRecommendations(result);
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
    {failed ? <div role="status" className="mx-auto max-w-6xl px-6">{labels.error} {recovery}</div> : null}
    <RevealFinalResultsPage
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
    />
    </>
  );
}

export { FinalReportPanel } from "@/components/formulation-results-panels";
