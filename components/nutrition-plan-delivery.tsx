"use client";

import { useEffect, useRef, useState } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import {
  FinalReportPanel,
  ProductRecommendationsPanel,
  formulationResultsCopy
} from "@/components/formulation-results";
import { NutritionProgress } from "@/components/nutrition-progress";
import type {
  FormulationResult,
  ProductRecommendationOption,
  ProductStackPreference
} from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";

type NutritionPlanDeliveryProps = Readonly<{
  initialResult?: FormulationResult | null;
  locale: Locale;
  planId: string;
}>;

type DeliveryState = "loading" | "ready" | "error";

const copy = {
  en: {
    error:
      "We could not deliver this plan yet. Please return to refinement and try again.",
    loadingBody:
      "We’re tailoring the final plan from your food guidance, supplements, and refinement notes.",
    loadingTitle: "Delivering your nutrition plan",
    subtitle:
      "A tailored plan built from your assessment, food guidance, supplement guidance, and refinement notes.",
    title: "Your Nutrition Plan"
  },
  th: {
    error:
      "ยังไม่สามารถส่งมอบแผนนี้ได้ โปรดกลับไปหน้าปรับคำแนะนำแล้วลองอีกครั้ง",
    loadingBody:
      "เรากำลังออกแบบแผนสุดท้ายจากคำแนะนำอาหาร อาหารเสริม และบันทึกการปรับแต่งของคุณ",
    loadingTitle: "กำลังส่งมอบแผนโภชนาการของคุณ",
    subtitle:
      "แผนเฉพาะตัวที่สร้างจากแบบประเมิน คำแนะนำอาหาร คำแนะนำอาหารเสริม และบันทึกการปรับแต่งของคุณ",
    title: "แผนโภชนาการของคุณ"
  }
} satisfies Record<
  Locale,
  Record<"error" | "loadingBody" | "loadingTitle" | "subtitle" | "title", string>
>;

function productRecommendationOptionsForResult(result: FormulationResult) {
  if (result.productRecommendationOptions?.length) {
    return result.productRecommendationOptions;
  }

  if (!result.productRecommendations) {
    return [];
  }

  return [{
    id: result.productRecommendations.stackPreference ?? "balanced",
    productRecommendations: result.productRecommendations,
    recommendations: result.recommendations
  }] satisfies ProductRecommendationOption[];
}

function selectProductRecommendationOption(
  options: readonly ProductRecommendationOption[],
  selectedPreference: ProductStackPreference | null
) {
  return (
    options.find((option) => option.id === selectedPreference) ??
    options.find((option) => option.id === "balanced") ??
    options[0]
  );
}

export function NutritionPlanDelivery({
  initialResult = null,
  locale,
  planId
}: NutritionPlanDeliveryProps) {
  const labels = copy[locale];
  const formulationLabels = formulationResultsCopy[locale];
  const [state, setState] = useState<DeliveryState>(
    initialResult?.nutritionReport ? "ready" : "loading"
  );
  const [result, setResult] = useState<FormulationResult | null>(initialResult);
  const [selectedProductStackPreference, setSelectedProductStackPreference] =
    useState<ProductStackPreference | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const finalizationRequestedRef = useRef(false);
  const productPollAttemptsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    finalizationRequestedRef.current = false;
    productPollAttemptsRef.current = 0;

    async function loadPlan() {
      try {
        const response = await fetch(
          `/api/assessment/${encodeURIComponent(planId)}/formulation?locale=${locale}`,
          { cache: "no-store" }
        );

        if (response.status === 202) {
          timer = window.setTimeout(loadPlan, 1500);
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load nutrition plan");
        }

        const payload = (await response.json()) as FormulationResult;
        const reportStatus = payload.sectionStatuses?.report;

        if (payload.nutritionReport) {
          if (!cancelled) {
            setResult(payload);
            setState("ready");
            const productStatus = payload.productRecommendations?.status;
            const productMatchingTerminal =
              productStatus === "ready" ||
              productStatus === "partial" ||
              productStatus === "failed";
            if (
              !productMatchingTerminal &&
              productPollAttemptsRef.current < 80
            ) {
              productPollAttemptsRef.current += 1;
              timer = window.setTimeout(loadPlan, 1500);
            }
          }
          return;
        }

        if (reportStatus === "failed") {
          throw new Error("Nutrition report failed");
        }

        const readyForReport =
          payload.sectionStatuses?.supplements === "ready";

        if (
          readyForReport &&
          reportStatus !== "pending" &&
          !finalizationRequestedRef.current
        ) {
          finalizationRequestedRef.current = true;

          const finalizeResponse = await fetch(
            `/api/assessment/${encodeURIComponent(planId)}/finalize`,
            {
              cache: "no-store",
              method: "POST"
            }
          );

          if (!finalizeResponse.ok) {
            throw new Error("Unable to queue nutrition report");
          }
        }

        if (!cancelled) {
          setResult(payload);
          setState("loading");
          timer = window.setTimeout(loadPlan, 1500);
        }
      } catch {
        if (!cancelled) {
          setState("error");
        }
      }
    }

    loadPlan();

    return () => {
      cancelled = true;

      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [locale, planId, refreshNonce]);

  useEffect(() => {
    if (!result) {
      setSelectedProductStackPreference(null);
      return;
    }

    const options = productRecommendationOptionsForResult(result);
    const defaultPreference =
      result.productRecommendations?.stackPreference ??
      options.find((option) => option.id === "balanced")?.id ??
      options[0]?.id ??
      null;

    setSelectedProductStackPreference((current) =>
      current && options.some((option) => option.id === current)
        ? current
        : defaultPreference
    );
  }, [result]);

  if (state === "error") {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
        <NutritionProgress
          className="mb-8"
          current="plan"
          locale={locale}
        />
        <div className="rounded-lg bg-white p-6 ring-1 ring-foreground/10 sm:p-8">
          <ExclamationTriangleIcon
            aria-hidden={true}
            className="size-6 text-amber-500"
          />
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            {labels.error}
          </p>
        </div>
      </section>
    );
  }

  if (state !== "ready" || !result?.nutritionReport) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
        <NutritionProgress
          className="mb-8"
          current="plan"
          locale={locale}
          pending={true}
        />
        <div
          aria-live="polite"
          className="rounded-lg bg-white p-6 ring-1 ring-foreground/10 transition-colors sm:p-8"
        >
          <h1 className="max-w-2xl text-2xl font-semibold tracking-normal text-[#20343A] sm:text-3xl">
            {labels.loadingTitle}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {labels.loadingBody}
          </p>
        </div>
      </section>
    );
  }

  const productRecommendationOptions = productRecommendationOptionsForResult(result);
  const selectedProductRecommendationOption = selectProductRecommendationOption(
    productRecommendationOptions,
    selectedProductStackPreference
  );
  const activeProductRecommendations =
    selectedProductRecommendationOption?.productRecommendations ??
    result.productRecommendations;
  const activeProductRecommendationItems =
    selectedProductRecommendationOption?.recommendations ?? result.recommendations;

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
      <NutritionProgress
        className="mb-8"
        complete={true}
        current="plan"
        locale={locale}
      />
      <div>
        <h1 className="text-4xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-5xl">
          {labels.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          {labels.subtitle}
        </p>
      </div>

      <FinalReportPanel
        labels={formulationLabels}
        locale={locale}
        report={result.nutritionReport}
      />
      <ProductRecommendationsPanel
        locale={locale}
        onRefreshRequested={() => setRefreshNonce((value) => value + 1)}
        onStackPreferenceChange={setSelectedProductStackPreference}
        planId={planId}
        productRecommendationOptions={productRecommendationOptions}
        productRecommendations={activeProductRecommendations}
        recommendations={activeProductRecommendationItems}
        selectedStackPreference={
          selectedProductRecommendationOption?.id ??
          selectedProductStackPreference
        }
      />
    </section>
  );
}
