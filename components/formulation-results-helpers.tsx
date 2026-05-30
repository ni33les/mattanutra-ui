"use client";

import { formulationResultsCopy } from "@/components/formulation-results-copy";
import { localizedContextChip } from "@/components/formulation-reveal-copy";
import {
  CountUpNumber,
  useInViewOnce,
} from "@/components/formulation-results-motion";
import { NutritionProgress } from "@/components/nutrition-progress";
import type {
  FormulationResult,
  ProductRecommendationOption,
  ProductStackPreference,
  RecommendedProduct,
} from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";
import {
  nutritionHealthScorePath,
  nutritionRevealPath,
} from "@/lib/nutrition-paths";
export {
  resultHasPendingProductRecommendations,
  resultHasTransientEmptyProductRecommendations,
} from "@/lib/product-recommendation-readiness";

export function planRevealHref(locale: Locale, planId: string) {
  return nutritionRevealPath(locale, planId);
}

export function planRevealStackHref(
  locale: Locale,
  planId: string,
  stackPreference: ProductStackPreference,
) {
  const params = new URLSearchParams({
    plan: planId,
    stack: stackPreference,
  });

  return `/${locale}/nutrition/reveal?${params.toString()}`;
}

export function replaceRevealStackUrl(
  locale: Locale,
  planId: string,
  stackPreference: ProductStackPreference,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(
    window.history.state,
    "",
    planRevealStackHref(locale, planId, stackPreference),
  );
}

export function planPaywallHref(locale: Locale, planId: string) {
  return nutritionHealthScorePath(locale, planId);
}

export function resultHasPendingSections(result: FormulationResult) {
  const statuses = result.sectionStatuses;

  return Boolean(
    statuses &&
    (statuses.foodSupport === "pending" ||
      statuses.foods === "pending" ||
      statuses.supplements === "pending" ||
      statuses.report === "pending"),
  );
}

export function supplementProductCoverageById(
  productRecommendations:
    | FormulationResult["productRecommendations"]
    | undefined,
) {
  const coverage = new Map<string, number>();

  for (const item of productRecommendations?.needCoverage ?? []) {
    if (item.itemType !== "supplement") {
      continue;
    }

    const supplementId = item.id.startsWith("supplement:")
      ? item.id.slice("supplement:".length)
      : item.id;

    coverage.set(
      supplementId,
      Math.min(100, Math.max(0, Math.round(item.coveragePercent))),
    );
  }

  return coverage;
}

export function productRecommendationOptionsForResult(
  result: FormulationResult,
) {
  if (result.productRecommendationOptions?.length) {
    return result.productRecommendationOptions;
  }

  if (!result.productRecommendations) {
    return [];
  }

  return [
    {
      id: result.productRecommendations.stackPreference ?? "balanced",
      productRecommendations: result.productRecommendations,
      recommendations: result.recommendations,
    },
  ] satisfies ProductRecommendationOption[];
}

export function selectProductRecommendationOption(
  options: readonly ProductRecommendationOption[],
  selectedPreference: ProductStackPreference | null,
) {
  return (
    options.find((option) => option.id === selectedPreference) ??
    options.find((option) => option.id === "balanced") ??
    options[0]
  );
}

export type PanelLabels = (typeof formulationResultsCopy)["en"];

export function NutritionGuidancePreparingPanel({
  labels,
  locale,
}: Readonly<{
  labels: PanelLabels;
  locale: Locale;
}>) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
      <NutritionProgress
        className="mb-8"
        current="reveal"
        locale={locale}
        pending={true}
      />
      <div
        aria-live="polite"
        className="rounded-lg bg-white p-6 ring-1 ring-foreground/10 transition-colors sm:p-8"
      >
        <h1 className="mn-hero-title max-w-2xl text-2xl font-semibold tracking-normal text-[var(--mn-ink)] sm:text-3xl">
          {labels.nutritionProgressTitle}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {labels.nutritionProgressBody}
        </p>
      </div>
    </section>
  );
}

export function revealContextChips(result: FormulationResult) {
  return [
    { kind: "profile", value: result.assessmentSummary.profile },
    { kind: "profile", value: result.assessmentSummary.region },
    { kind: "profile", value: result.assessmentSummary.plan },
    ...result.assessmentSummary.goals.map((value) => ({ kind: "goal", value })),
    ...result.assessmentSummary.constraints.map((value) => ({
      kind: "constraint",
      value,
    })),
  ].filter((chip) => chip.value);
}

export function revealHeroMetaItems(result: FormulationResult, locale: Locale) {
  const profileParts = result.assessmentSummary.profile
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && !/not shown|ไม่ระบุ/i.test(part));
  const values = [...profileParts, result.assessmentSummary.region].filter(
    Boolean,
  );

  return values.map((value) =>
    locale === "en" ? value.toUpperCase() : localizedContextChip(value, locale),
  );
}

export function productCoveredNeedCount(products: RecommendedProduct[]) {
  return new Set(products.flatMap((product) => product.covers)).size;
}

export function RevealDistillationCard({
  fromCount,
  fromLabel,
  toCount,
  toLabel,
  variant = "card",
}: Readonly<{
  fromCount: number;
  fromLabel: string;
  toCount: number;
  toLabel: string;
  variant?: "card" | "plain";
}>) {
  const { ref, visible } = useInViewOnce<HTMLDivElement>();

  return (
    <div
      className={
        variant === "card"
          ? "rounded-[var(--mn-radius-xl)] border border-[var(--mn-line)] bg-[var(--mn-paper)] px-6 py-8 shadow-[var(--mn-shadow-soft)]"
          : ""
      }
      ref={ref}
    >
      <div className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-14">
        <div>
          <div className="font-serif text-7xl font-light leading-none text-[var(--mn-ash-soft)] sm:text-8xl">
            <CountUpNumber active={visible} duration={1100} value={fromCount} />
          </div>
          <p className="mn-mono-label mt-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-ash)] max-sm:leading-[1.35]">
            {fromLabel}
          </p>
        </div>
        <div className="font-serif text-5xl italic text-[var(--mn-gold)] max-sm:rotate-90">
          →
        </div>
        <div>
          <div className="font-serif text-7xl font-light leading-none text-[var(--mn-teal-deep)] sm:text-8xl">
            <CountUpNumber active={visible} duration={1400} value={toCount} />
          </div>
          <p className="mn-mono-label mt-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-ink-soft)] max-sm:leading-[1.35]">
            {toLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

export function selectedStackCoverage(
  productRecommendations:
    | FormulationResult["productRecommendations"]
    | undefined,
  products: RecommendedProduct[],
) {
  return Math.max(
    0,
    Math.round(
      productRecommendations?.stackCoveragePercent ??
        Math.max(
          0,
          ...products.map((product) => product.stackCoveragePercent ?? 0),
        ),
    ),
  );
}
