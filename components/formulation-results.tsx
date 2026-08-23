"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { formulationResultsCopy } from "@/components/formulation-results-copy";
import {
  NutritionGuidancePreparingPanel,
  defaultProductStackPreferenceForResult,
  planPaywallHref,
  productRecommendationOptionsForResult,
  resultHasPendingProductRecommendations,
  resultHasProductStackRows,
  selectProductRecommendationOption,
  supplementProductCoverageById,
} from "@/components/formulation-results-helpers";
import { NutritionProgress } from "@/components/nutrition-progress";
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

type LoadState = "loading" | "ready" | "error";

const MAX_MISSING_FORMULA_POLLS = 30;
const MISSING_FORMULA_POLL_INTERVAL_MS = 3_000;

function hasRenderableFormula(result: FormulationResult | null) {
  return Boolean(result && result.supplementBreakdown.length > 0);
}

export function FormulationResults({
  initialStackPreference = null,
  initialResult = null,
  locale,
  planId,
}: FormulationResultsProps) {
  const labels = formulationResultsCopy[locale];
  const effectivePlanId = planId;
  const [loadState, setLoadState] = useState<LoadState>(
    initialResult ? "ready" : "loading",
  );
  const [result, setResult] = useState<FormulationResult | null>(initialResult);
  const [selectedProductStackPreference, setSelectedProductStackPreference] =
    useState<ProductStackPreference | null>(() =>
      initialStackPreference ??
      (initialResult
        ? defaultProductStackPreferenceForResult(initialResult)
        : "balanced"),
    );
  const [productPollingPreference, setProductPollingPreference] =
    useState<ProductStackPreference | null>(null);

  const refreshFormulationResult = useCallback(async () => {
    const response = await fetch(
      `/api/assessment/${encodeURIComponent(effectivePlanId)}/formulation?locale=${locale}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as FormulationResult;

    setResult(payload);
    setLoadState("ready");

    return true;
  }, [effectivePlanId, locale]);

  const startProductStackPolling = useCallback(
    (preference: ProductStackPreference) => {
      setProductPollingPreference(preference);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let inFlight = false;
    let missingAttempts = 0;

    async function fetchFormulation(mode: "until-formula" | "once") {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;

      try {
        const response = await fetch(
          `/api/assessment/${encodeURIComponent(effectivePlanId)}/formulation?locale=${locale}`,
          { cache: "no-store" },
        );

        if (cancelled) {
          return;
        }

        if (response.status === 202) {
          if (
            mode === "until-formula" &&
            missingAttempts < MAX_MISSING_FORMULA_POLLS
          ) {
            missingAttempts += 1;
            retryTimer = window.setTimeout(() => {
              void fetchFormulation(mode);
            }, MISSING_FORMULA_POLL_INTERVAL_MS);
          }
          return;
        }

        if (!response.ok) {
          if (!hasRenderableFormula(initialResult)) {
            setLoadState("error");
          }
          return;
        }

        const payload = (await response.json()) as FormulationResult;

        setResult(payload);
        setLoadState("ready");

        if (
          mode === "until-formula" &&
          !hasRenderableFormula(payload) &&
          missingAttempts < MAX_MISSING_FORMULA_POLLS
        ) {
          missingAttempts += 1;
          retryTimer = window.setTimeout(() => {
            void fetchFormulation(mode);
          }, MISSING_FORMULA_POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled && !hasRenderableFormula(initialResult)) {
          setLoadState("error");
        }
      } finally {
        inFlight = false;

        if (productPollingPreference) {
          setProductPollingPreference(null);
        }
      }
    }

    if (!hasRenderableFormula(initialResult)) {
      void fetchFormulation("until-formula");
    } else if (productPollingPreference) {
      void fetchFormulation("once");
    }

    return () => {
      cancelled = true;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [effectivePlanId, initialResult, locale, productPollingPreference]);

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
    return <NutritionGuidancePreparingPanel labels={labels} locale={locale} />;
  }

  if (loadState === "error" || !result) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
        <NutritionProgress className="mb-8" current="reveal" locale={locale} />
        <div className="rounded-lg bg-white p-6 text-center ring-1 ring-foreground/10 sm:p-8">
          <ExclamationTriangleIcon
            aria-hidden={true}
            className="mx-auto size-10 text-amber-500"
          />
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            {labels.error}
          </p>
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
  const nutritionPending = orderedIngredients.length === 0;
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
    explicitProductStackPreference &&
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

  if (nutritionPending) {
    return <NutritionGuidancePreparingPanel labels={labels} locale={locale} />;
  }

  return (
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
  );
}

export { FinalReportPanel } from "@/components/formulation-results-panels";
