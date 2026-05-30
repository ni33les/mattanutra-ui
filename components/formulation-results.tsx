"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { LandingReveal } from "@/components/landing-reveal";
import { trackMarketplaceClick } from "@/components/product-click-tracking";
import { formulationResultsCopy } from "@/components/formulation-results-copy";
import {
  NutritionGuidancePreparingPanel,
  RevealDistillationCard,
  planPaywallHref,
  productCoveredNeedCount,
  productRecommendationOptionsForResult,
  replaceRevealStackUrl,
  resultHasPendingProductRecommendations,
  resultHasPendingSections,
  revealContextChips,
  revealHeroMetaItems,
  selectedStackCoverage,
  selectProductRecommendationOption,
  supplementProductCoverageById,
  type PanelLabels,
} from "@/components/formulation-results-helpers";
import {
  foodSupportableGaps,
  foodSupportFormulaGapsForItem,
  foodSupportGaps,
  formulaIngredientRowNumbers,
  groupedFormulaIngredients,
  joinFoodSupportFormulaGapLabels,
  joinFoodSupportNeeds,
  localizedDoseText,
  localizedIngredientRationale,
  localizedSupplementName,
  managedFoodFrequency,
  managedFoodServing,
  managedSeedForFoodSupportItem,
  safeFoodSupportCopy,
  selectedFoodSupport,
  supplementBenefitTags,
  visibleFormulaIngredients,
} from "@/components/formulation-support-helpers";
import {
  formatTemplate,
  getLocalizedText,
  localizedBenefitTagLabel,
  localizedCategoryLabel,
  localizedContextChip,
  localizedCountText,
  localizedCoverLabel,
  localizedMarketplaceName,
  localizedProductDescription,
  revealCopy,
  revealJoiners,
  revealSlotCopy,
} from "@/components/formulation-reveal-copy";
import { CountUpNumber } from "@/components/formulation-results-motion";
import {
  FinalReportPanel,
  PreviewPaywallPanel,
  RevealClosingSection,
} from "@/components/formulation-results-panels";
import { NutritionProgress } from "@/components/nutrition-progress";
import {
  productRecommendationCopy,
  productStackPreferenceOrder,
} from "@/components/product-recommendations-panel-copy";
import type {
  FormulationIngredient,
  FormulationResult,
  ProductNeedCoverage,
  ProductRecommendationOption,
  ProductStackPreference,
  RecommendedProduct,
} from "@/lib/formulation-types";
import { localeHtmlLang, type Locale } from "@/lib/i18n";

type FormulationResultsProps = Readonly<{
  initialResult?: FormulationResult | null;
  initialStackPreference?: ProductStackPreference | null;
  locale: Locale;
  planId: string;
}>;

type LoadState = "loading" | "ready" | "error";

const MAX_PRODUCT_MATCHING_POLLS = 80;
const PENDING_SECTION_POLL_INTERVAL_MS = 1_000;
const PENDING_PRODUCT_MATCHING_POLL_INTERVAL_MS = 750;

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
    useState<ProductStackPreference | null>(() => initialStackPreference);
  const productPollAttemptsRef = useRef(0);

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

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    productPollAttemptsRef.current = 0;

    async function fetchFormulation() {
      try {
        const response = await fetch(
          `/api/assessment/${encodeURIComponent(effectivePlanId)}/formulation?locale=${locale}`,
          { cache: "no-store" },
        );

        if (response.status === 202) {
          retryTimer = window.setTimeout(fetchFormulation, 1000);
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load formulation");
        }

        const payload = (await response.json()) as FormulationResult;

        if (!cancelled) {
          setResult(payload);
          setLoadState("ready");

          const productMatchingPending =
            resultHasPendingProductRecommendations(payload);
          const shouldPollProductMatching =
            productMatchingPending &&
            productPollAttemptsRef.current < MAX_PRODUCT_MATCHING_POLLS;

          if (productMatchingPending) {
            productPollAttemptsRef.current += 1;
          }

          if (resultHasPendingSections(payload) || shouldPollProductMatching) {
            retryTimer = window.setTimeout(
              fetchFormulation,
              shouldPollProductMatching
                ? PENDING_PRODUCT_MATCHING_POLL_INTERVAL_MS
                : PENDING_SECTION_POLL_INTERVAL_MS,
            );
          }
        }
      } catch {
        if (!cancelled) {
          setLoadState("error");
        }
      }
    }

    void fetchFormulation();

    return () => {
      cancelled = true;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [effectivePlanId, locale]);

  useEffect(() => {
    if (!result) {
      return;
    }

    const options = productRecommendationOptionsForResult(result);
    const defaultPreference =
      result.productRecommendations?.stackPreference ??
      options.find((option) => option.id === "balanced")?.id ??
      options[0]?.id ??
      null;

    startTransition(() => {
      setSelectedProductStackPreference((current) =>
        current && options.some((option) => option.id === current)
          ? current
          : defaultPreference,
      );
    });
  }, [result]);

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
  const sectionStatuses = result.sectionStatuses ?? {
    foods: (result.foodGuidance ?? []).length > 0 ? "ready" : "pending",
    supplements: orderedIngredients.length > 0 ? "ready" : "pending",
  };
  const nutritionPending = sectionStatuses.supplements !== "ready";
  const unlockHref = planPaywallHref(locale, effectiveResultPlanId);
  const productRecommendationOptions =
    productRecommendationOptionsForResult(result);
  const selectedProductRecommendationOption = selectProductRecommendationOption(
    productRecommendationOptions,
    selectedProductStackPreference,
  );
  const activeProductRecommendations =
    selectedProductRecommendationOption?.productRecommendations ??
    result.productRecommendations;
  const activeProductRecommendationItems =
    selectedProductRecommendationOption?.recommendations ??
    result.recommendations;
  const productCoverageBySupplementId = supplementProductCoverageById(
    activeProductRecommendations,
  );

  if (nutritionPending) {
    return <NutritionGuidancePreparingPanel labels={labels} locale={locale} />;
  }

  return (
    <RevealResultsPage
      activeProductRecommendations={activeProductRecommendations}
      formattedDate={formattedDate}
      ingredients={orderedIngredients}
      isPreview={isPreview}
      labels={labels}
      locale={locale}
      onProductStackPreferenceChange={setSelectedProductStackPreference}
      onProductStackRefresh={refreshFormulationResult}
      planId={effectiveResultPlanId}
      productCoverageBySupplementId={productCoverageBySupplementId}
      productRecommendationOptions={productRecommendationOptions}
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

function RevealResultsPage({
  activeProductRecommendations,
  formattedDate,
  ingredients,
  isPreview,
  labels,
  locale,
  onProductStackPreferenceChange,
  onProductStackRefresh,
  planId,
  productCoverageBySupplementId,
  productRecommendationOptions,
  products,
  result,
  selectedProductStackPreference,
  unlockHref,
}: Readonly<{
  activeProductRecommendations?: FormulationResult["productRecommendations"];
  formattedDate: string;
  ingredients: FormulationIngredient[];
  isPreview: boolean;
  labels: PanelLabels;
  locale: Locale;
  onProductStackPreferenceChange: (preference: ProductStackPreference) => void;
  onProductStackRefresh: () => Promise<boolean>;
  planId: string;
  productCoverageBySupplementId: ReadonlyMap<string, number>;
  productRecommendationOptions: ProductRecommendationOption[];
  products: RecommendedProduct[];
  result: FormulationResult;
  selectedProductStackPreference?: ProductStackPreference | null;
  unlockHref: string;
}>) {
  const copy = revealCopy[locale];
  const visibleIngredients = visibleFormulaIngredients(ingredients);
  const recommendedSupplementCount = visibleIngredients.length;
  const supplementLabelById = new Map(
    visibleIngredients.map((ingredient) => [
      ingredient.id,
      localizedSupplementName(ingredient.supplement, ingredient.id, locale),
    ]),
  );
  const catalogueSupplementCount = Math.max(
    recommendedSupplementCount,
    Number(result.catalogueSupplementCount ?? result.totalSupplementCount ?? 0),
    recommendedSupplementCount,
  );
  const selectedCoverage = selectedStackCoverage(
    activeProductRecommendations,
    products,
  );
  const productNeedCount = productCoveredNeedCount(products);
  const productOptions = productStackPreferenceOrder.flatMap((preference) => {
    const option = productRecommendationOptions.find(
      (item) => item.id === preference,
    );

    return option ? [option] : [];
  });
  const selectedProductRecommendationOption = selectProductRecommendationOption(
    productOptions,
    selectedProductStackPreference ?? null,
  );
  const displayFirstName =
    typeof result.firstName === "string" && result.firstName.trim()
      ? result.firstName.trim()
      : "";
  const supplementSelectedText = localizedCountText(
    recommendedSupplementCount,
    locale,
    true,
  );
  const heroSub =
    locale === "en"
      ? `No guesswork. No pharmacy aisle confusion. ${supplementSelectedText} ${
          recommendedSupplementCount === 1 ? "nutrient" : "nutrients"
        }, chosen with intention, paired with the exact products to buy.`
      : formatTemplate(copy.heroSub, { supplementSelectedText });
  const breadcrumbsTitle = copy.personalizationTitle;
  const breadcrumbsBody = revealSlotCopy(
    result,
    "breadcrumbsBody",
    locale,
    copy.personalizationBody,
  );
  const distillNarrative = formatTemplate(copy.distilledTitleTemplate, {
    supplementSelectedText,
    supplementTotalText: localizedCountText(catalogueSupplementCount, locale),
  });
  const distillFoot = revealSlotCopy(
    result,
    "distillFoot",
    locale,
    copy.distilledFoot,
  );
  const heroMeta = revealHeroMetaItems(result, locale);

  return (
    <section className="w-full overflow-hidden">
      <LandingReveal />

      <section className="relative isolate flex min-h-[calc(100svh-5rem)] w-full items-center justify-center overflow-hidden px-6 py-24 text-center sm:px-8 lg:py-28">
        <div
          aria-hidden={true}
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_48%,rgba(220,232,224,0.58)_0%,rgba(220,232,224,0.26)_34%,transparent_68%),var(--mn-cream)]"
        />
        <div
          aria-hidden={true}
          className="absolute left-1/2 top-1/2 -z-10 size-[min(46rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(220,232,224,0.48)_0%,rgba(220,232,224,0.22)_38%,transparent_70%)] [animation:mn-hero-breathe_18s_ease-in-out_infinite_alternate] motion-reduce:animate-none"
        />

        <div
          className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center"
          data-reveal
        >
          <p className="mn-mono-label text-xs font-medium uppercase tracking-[0.24em] text-[var(--mn-teal)]">
            {copy.heroEyebrow}
          </p>
          {displayFirstName ? (
            <>
              <p className="mt-9 font-serif text-2xl italic leading-8 text-[var(--mn-ink-soft)] sm:text-[1.75rem]">
                {copy.heroFor}
              </p>
              <h1
                className={`mn-hero-title mt-3 max-w-5xl break-words font-serif text-6xl font-normal italic leading-[0.98] tracking-normal text-[var(--mn-teal-deep)] sm:text-8xl lg:text-[8.25rem] ${
                  locale === "th" ? "leading-[1.22]" : ""
                }`}
              >
                {displayFirstName}
                <span className="text-[var(--mn-gold)]">.</span>
              </h1>
            </>
          ) : (
            <h1
              className={`mn-hero-title mt-10 max-w-4xl break-words font-serif text-5xl font-normal italic leading-[1.02] tracking-normal text-[var(--mn-teal-deep)] sm:text-7xl lg:text-8xl ${
                locale === "th" ? "leading-[1.22]" : "text-balance"
              }`}
            >
              {copy.heroTitle}
            </h1>
          )}
          <p
            className={`mn-hero-subtitle mt-8 max-w-3xl font-serif text-3xl font-normal text-[var(--mn-ink)] sm:text-[2.75rem] ${
              locale === "th"
                ? "break-words leading-[1.45] [overflow-wrap:anywhere]"
                : "leading-[1.18] text-balance"
            }`}
          >
            {locale === "en" ? (
              <>
                A formula built around <em>your body, your goals,</em>
                <br className="hidden sm:block" /> and the way you actually
                live.
              </>
            ) : (
              copy.heroHeadline
            )}
          </p>
          <p
            className={`mt-6 max-w-2xl text-base text-[var(--mn-ink-soft)] ${
              locale === "th" ? "leading-8" : "leading-7"
            }`}
          >
            {heroSub}
          </p>
          <div className="mt-12 flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full bg-[var(--mn-paper)]/65 px-4 py-3 font-[family:var(--mn-font-mono)] text-[0.68rem] tracking-[0.04em] text-[var(--mn-ink-soft)] shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] backdrop-blur-sm sm:gap-3 sm:px-5">
            {heroMeta.map((item, index) => (
              <span
                className="inline-flex min-w-0 items-center gap-1.5"
                key={`${item}:${index}`}
              >
                {index > 0 ? (
                  <span
                    aria-hidden={true}
                    className="mr-1 hidden h-3 w-px bg-[var(--mn-line)] sm:inline-block"
                  />
                ) : null}
                <span className="min-w-0 truncate">{item}</span>
              </span>
            ))}
          </div>
          <a
            className="mn-mono-label mt-12 inline-flex flex-col items-center gap-3 text-[0.65rem] font-medium uppercase tracking-[0.24em] text-[var(--mn-ash)]"
            href="#formula"
          >
            {copy.begin}
            <span aria-hidden={true} className="h-9 w-px bg-[var(--mn-ash)]" />
          </a>
        </div>
      </section>

      <section className="border-y border-[var(--mn-line)] py-16">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div data-reveal>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              01 · {copy.personalizationEyebrow}
            </p>
            <h2
              className={`mt-4 font-serif text-4xl font-medium text-[var(--mn-ink)] ${
                locale === "th"
                  ? "leading-[1.45] break-words [overflow-wrap:anywhere]"
                  : "leading-tight text-balance"
              }`}
            >
              {locale === "en" ? (
                <>
                  Everything you told us, <em>folded into one plan</em>.
                </>
              ) : (
                breadcrumbsTitle
              )}
            </h2>
          </div>
          <p
            className="text-base leading-8 text-[var(--mn-ink-soft)]"
            data-reveal
          >
            {breadcrumbsBody}
          </p>
          <div className="lg:col-span-2" data-reveal>
            <div className="flex flex-wrap gap-2">
              {revealContextChips(result).map((chip) => (
                <span
                  className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ${
                    chip.kind === "goal"
                      ? "bg-white text-[var(--mn-teal-deep)] ring-[var(--mn-teal)]"
                      : chip.kind === "constraint"
                        ? "bg-[var(--mn-gold-tint)] text-[#6d5427] ring-transparent"
                        : "bg-[var(--mn-mint)] text-[var(--mn-ink)] ring-transparent"
                  }`}
                  key={`${chip.kind}:${chip.value}`}
                >
                  {localizedContextChip(chip.value, locale)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 text-center">
        <div className="mx-auto max-w-5xl px-6 sm:px-8">
          <p
            className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]"
            data-reveal
          >
            02 · {copy.distilledEyebrow}
          </p>
          <h2
            className={`mx-auto mt-6 max-w-3xl font-serif text-4xl font-medium text-[var(--mn-ink)] ${
              locale === "th"
                ? "leading-[1.45] break-words [overflow-wrap:anywhere]"
                : "leading-tight text-balance"
            }`}
            data-reveal
          >
            {locale === "en" ? (
              <>
                We evaluated{" "}
                <em>{localizedCountText(catalogueSupplementCount, locale)}</em>{" "}
                ingredients.
                <br />{" "}
                {localizedCountText(
                  recommendedSupplementCount,
                  locale,
                  true,
                )}{" "}
                earned a place in your formula.
              </>
            ) : (
              distillNarrative
            )}
          </h2>
          <div className="mt-12 grid gap-5" data-reveal>
            <RevealDistillationCard
              fromCount={catalogueSupplementCount}
              fromLabel={copy.catalogueSupplements}
              toCount={recommendedSupplementCount}
              toLabel={copy.supplementsRecommended}
            />
          </div>
          <p
            className="mx-auto mt-8 max-w-2xl text-sm leading-7 text-[var(--mn-ink-soft)]"
            data-reveal
          >
            {distillFoot}
          </p>
        </div>
      </section>

      {isPreview ? (
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
          <PreviewPaywallPanel labels={labels} unlockHref={unlockHref} />
        </div>
      ) : null}

      <RevealFormulaSection
        catalogueSupplementCount={catalogueSupplementCount}
        copy={copy}
        formattedDate={formattedDate}
        ingredients={visibleIngredients}
        locale={locale}
        productCoverageBySupplementId={productCoverageBySupplementId}
        result={result}
      />

      <RevealProductsSection
        copy={copy}
        locale={locale}
        onProductStackPreferenceChange={onProductStackPreferenceChange}
        onProductStackRefresh={onProductStackRefresh}
        planId={planId}
        productNeedCount={productNeedCount}
        productOptions={productOptions}
        products={products}
        result={result}
        selectedCoverage={selectedCoverage}
        selectedProductStackPreference={selectedProductStackPreference}
        supplementLabelById={supplementLabelById}
      />

      <RevealFoodSupportSection
        copy={copy}
        locale={locale}
        result={result}
        selectedNeedCoverage={
          selectedProductRecommendationOption?.productRecommendations
            .needCoverage ??
          result.productRecommendations?.needCoverage ??
          []
        }
        selectedProductStackPreference={
          selectedProductRecommendationOption?.id ??
          selectedProductStackPreference
        }
      />

      <RevealClosingSection
        copy={copy}
        labels={labels}
        locale={locale}
        planId={planId}
        result={result}
      />
    </section>
  );
}

function RevealFormulaSection({
  catalogueSupplementCount,
  copy,
  formattedDate,
  ingredients,
  locale,
  productCoverageBySupplementId,
  result,
}: Readonly<{
  catalogueSupplementCount: number;
  copy: typeof revealCopy.en;
  formattedDate: string;
  ingredients: FormulationIngredient[];
  locale: Locale;
  productCoverageBySupplementId: ReadonlyMap<string, number>;
  result: FormulationResult;
}>) {
  const ingredientRowNumber = formulaIngredientRowNumbers(ingredients);
  const supplementSelectedText = localizedCountText(
    ingredients.length,
    locale,
    true,
  );
  const formulaLead = revealSlotCopy(
    result,
    "formulaLead",
    locale,
    copy.formulaLead,
  );
  const formulaTitle = formatTemplate(copy.formulaTitleTemplate, {
    supplementSelectedText,
  });
  const nutrientNoun = ingredients.length === 1 ? "nutrient" : "nutrients";
  const formulaFocus =
    result.assessmentSummary.goals.length > 0
      ? result.assessmentSummary.goals
          .map((goal) => localizedContextChip(goal, locale))
          .join(revealJoiners[locale])
      : result.assessmentSummary.plan;
  const signedFor = result.firstName?.trim()
    ? locale === "en"
      ? `${copy.formulaSignedPrefix} for ${result.firstName.trim()}, ${formattedDate}.`
      : locale === "th"
        ? `${copy.formulaSignedPrefix}สำหรับ ${result.firstName.trim()}, ${formattedDate}`
        : locale === "zh-CN"
          ? `${copy.formulaSignedPrefix} ${result.firstName.trim()}，${formattedDate}`
          : `${copy.formulaSignedPrefix} ${result.firstName.trim()}, ${formattedDate}`
    : locale === "en"
      ? `${copy.formulaSignedPrefix}, ${formattedDate}.`
      : locale === "th"
        ? `${copy.formulaSignedPrefix}เมื่อ ${formattedDate}`
        : locale === "zh-CN"
          ? `${copy.formulaSignedPrefix} ${formattedDate}`
          : `${copy.formulaSignedPrefix} ${formattedDate}`;

  return (
    <section className="border-t border-[var(--mn-line)] py-20" id="formula">
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-end" data-reveal>
          <div>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              03 · {copy.formulaEyebrow}
            </p>
            <h2
              className={`mt-4 font-serif text-5xl font-medium text-[var(--mn-ink)] ${
                locale === "th"
                  ? "leading-[1.4] break-words [overflow-wrap:anywhere]"
                  : "leading-tight text-balance"
              }`}
            >
              {locale === "en" ? (
                <>
                  {supplementSelectedText} {nutrientNoun}.{" "}
                  <em>Exactly enough.</em>
                </>
              ) : (
                formulaTitle
              )}
            </h2>
          </div>
          <p className="text-base leading-8 text-[var(--mn-ink-soft)]">
            {formulaLead}
          </p>
        </div>

        <div
          className="mt-10 rounded-lg bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] sm:p-8"
          data-reveal
        >
          <div className="grid gap-3 border-b border-[var(--mn-line)] pb-5 text-sm sm:grid-cols-3 sm:items-center">
            <p className="mn-mono-label text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--mn-ash)]">
              {copy.formulaMetaTier}
            </p>
            <p className="font-serif text-lg font-medium text-[var(--mn-teal-deep)] sm:text-center">
              {copy.formulaMetaFocus}: {formulaFocus}
            </p>
            <p className="mn-mono-label text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--mn-ash)] sm:text-right">
              {copy.formulaMetaNrv}
            </p>
          </div>

          <div
            className={`hidden grid-cols-[3rem_1.2fr_2fr_0.9fr_0.8fr] gap-5 border-b border-[var(--mn-line)] py-4 text-[0.65rem] font-semibold text-[var(--mn-ash)] lg:grid ${
              locale === "th"
                ? "tracking-normal"
                : "uppercase tracking-[0.18em]"
            }`}
          >
            <div />
            <div>{copy.tableName}</div>
            <div>{copy.tableReason}</div>
            <div>{copy.tableAmount}</div>
            <div className="text-right">{copy.tableCoverage}</div>
          </div>

          {groupedFormulaIngredients(ingredients).map(([category, group]) => (
            <div key={category}>
              <div className="mt-6 flex items-center gap-3 border-b border-dashed border-[var(--mn-line)] pb-3 font-serif text-sm italic text-[var(--mn-gold)]">
                <span className="size-1.5 rounded-full bg-[var(--mn-gold)]" />
                {localizedCategoryLabel(category, locale)}
                <span className="ml-auto font-mono text-[0.65rem] not-italic uppercase tracking-[0.18em] text-[var(--mn-ash)]">
                  {group.length} {copy.selectedSuffix}
                </span>
              </div>
              {group.map((ingredient) => {
                const rowNumber = ingredientRowNumber.get(ingredient.id) ?? 0;
                const supplement = localizedSupplementName(
                  ingredient.supplement,
                  ingredient.id,
                  locale,
                );
                const rationale = localizedIngredientRationale(
                  ingredient,
                  locale,
                );
                const dailyDose = localizedDoseText(
                  ingredient.dailyDose,
                  locale,
                );
                const coverage =
                  productCoverageBySupplementId.get(ingredient.id) ?? 0;
                const benefit = supplementBenefitTags(ingredient)[0];

                return (
                  <article
                    className="grid gap-3 border-b border-[var(--mn-line)] py-5 last:border-b-0 lg:grid-cols-[3rem_1.2fr_2fr_0.9fr_0.8fr] lg:gap-5"
                    data-reveal
                    key={ingredient.id}
                  >
                    <div className="font-serif text-2xl italic text-[var(--mn-gold)]">
                      {String(rowNumber).padStart(2, "0")}
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-medium leading-tight text-[var(--mn-ink)]">
                        {supplement}
                      </h3>
                      <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--mn-ash)]">
                        {localizedCategoryLabel(ingredient.category, locale)}
                      </p>
                    </div>
                    <div className="text-sm leading-6 text-[var(--mn-ink-soft)]">
                      {rationale}
                      {benefit ? (
                        <span className="mt-2 block w-max max-w-full rounded-full bg-[var(--mn-mint)] px-3 py-1 text-xs font-semibold text-[var(--mn-teal-deep)]">
                          {localizedBenefitTagLabel(benefit, locale)}
                        </span>
                      ) : null}
                    </div>
                    <div className="font-mono text-sm font-semibold text-[var(--mn-ink)]">
                      {dailyDose}
                    </div>
                    <div className="font-mono text-sm font-semibold text-[var(--mn-teal-deep)] lg:text-right">
                      {coverage}%
                    </div>
                  </article>
                );
              })}
            </div>
          ))}

          <div className="mt-6 flex flex-col gap-2 border-t border-[var(--mn-line)] pt-5 font-[family:var(--mn-font-mono)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--mn-ash)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              {locale === "en"
                ? `${catalogueSupplementCount} EVALUATED · ${ingredients.length} SELECTED · 0 PADDING`
                : `${catalogueSupplementCount} ${copy.catalogueSupplements} · ${ingredients.length} ${copy.formulaMetaSelected} · 0 ${copy.formulaMetaNoPadding}`}
            </div>
            <div className="normal-case tracking-normal text-[var(--mn-ink-soft)]">
              {signedFor}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevealProductsSection({
  copy,
  locale,
  onProductStackPreferenceChange,
  onProductStackRefresh,
  planId,
  productNeedCount,
  productOptions,
  products,
  result,
  selectedCoverage,
  selectedProductStackPreference,
  supplementLabelById,
}: Readonly<{
  copy: typeof revealCopy.en;
  locale: Locale;
  onProductStackPreferenceChange: (preference: ProductStackPreference) => void;
  onProductStackRefresh: () => Promise<boolean>;
  planId: string;
  productNeedCount: number;
  productOptions: ProductRecommendationOption[];
  products: RecommendedProduct[];
  result: FormulationResult;
  selectedCoverage: number;
  selectedProductStackPreference?: ProductStackPreference | null;
  supplementLabelById: ReadonlyMap<string, string>;
}>) {
  const labels = productRecommendationCopy[locale];
  const [pendingStackPreference, setPendingStackPreference] =
    useState<ProductStackPreference | null>(null);
  const supplementSelectedCount = result.supplementBreakdown.filter(
    (ingredient) => ingredient.safety?.visibility !== "hidden",
  ).length;
  const productSelectedText = localizedCountText(products.length, locale, true);
  const supplementSelectedText = localizedCountText(
    supplementSelectedCount,
    locale,
    true,
  );
  const bottleNoun = products.length === 1 ? "bottle" : "bottles";
  const nutrientNoun = supplementSelectedCount === 1 ? "nutrient" : "nutrients";
  const coveredProductNeedCount = Math.min(
    Math.max(0, productNeedCount),
    Math.max(0, supplementSelectedCount),
  );
  const hasFullProductCoverage =
    supplementSelectedCount > 0 &&
    coveredProductNeedCount >= supplementSelectedCount;
  const fallbackProductsTitle = formatTemplate(
    hasFullProductCoverage
      ? copy.productsAllTitleTemplate
      : copy.productsPartialTitleTemplate,
    {
      coveredText: localizedCountText(coveredProductNeedCount, locale, true),
      productSelectedText,
      supplementSelectedText,
      supplementSelectedTextLower: localizedCountText(
        supplementSelectedCount,
        locale,
      ),
    },
  );
  const productsTitle = fallbackProductsTitle;
  const productsLead = revealSlotCopy(
    result,
    "productsLead",
    locale,
    copy.productsLead,
  );
  const coverageHeadline = hasFullProductCoverage
    ? formatTemplate(copy.coverageHeadlineTemplate, {
        supplementCount: supplementSelectedCount,
      })
    : formatTemplate(copy.coveragePartialHeadlineTemplate, {
        coveredText: localizedCountText(coveredProductNeedCount, locale),
        supplementSelectedText: localizedCountText(
          supplementSelectedCount,
          locale,
        ),
      });
  const productOptionsById = new Map(
    productOptions.map((option) => [option.id, option]),
  );
  const controlPreferences =
    productOptions.length > 0 || result.productRecommendations
      ? productStackPreferenceOrder
      : [];

  async function requestProductStackPreference(
    preference: ProductStackPreference,
  ) {
    const existingOption = productOptionsById.get(preference);

    if (existingOption) {
      onProductStackPreferenceChange(preference);
      return;
    }

    setPendingStackPreference(preference);

    try {
      const response = await fetch(
        `/api/assessment/${encodeURIComponent(planId)}/product-recommendations`,
        {
          body: JSON.stringify({ stackPreference: preference }),
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );

      if (response.ok) {
        window.setTimeout(() => {
          void onProductStackRefresh();
        }, 1000);
        window.setTimeout(() => {
          void onProductStackRefresh();
        }, 3000);
        window.setTimeout(() => {
          void onProductStackRefresh();
        }, 6000);
      }
    } finally {
      window.setTimeout(() => {
        setPendingStackPreference((current) =>
          current === preference ? null : current,
        );
      }, 1200);
    }
  }

  return (
    <section className="border-t border-[var(--mn-line)] bg-[var(--mn-cream-deep)] py-20">
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="mx-auto max-w-3xl text-center" data-reveal>
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
            04 · {copy.productsEyebrow}
          </p>
          <h2
            className={`mt-4 font-serif text-5xl font-medium text-[var(--mn-ink)] ${
              locale === "th"
                ? "leading-[1.4] break-words [overflow-wrap:anywhere]"
                : "leading-tight text-balance"
            }`}
          >
            {locale === "en" ? (
              <>
                {productSelectedText} {bottleNoun}.{" "}
                <em>
                  {hasFullProductCoverage
                    ? `All ${localizedCountText(supplementSelectedCount, locale)} ${nutrientNoun}.`
                    : `${localizedCountText(coveredProductNeedCount, locale, true)} of ${localizedCountText(
                        supplementSelectedCount,
                        locale,
                      )} ${nutrientNoun}.`}
                </em>
              </>
            ) : (
              productsTitle
            )}
          </h2>
          <p className="mt-4 text-base leading-8 text-[var(--mn-ink-soft)]">
            {productsLead}
          </p>
        </div>

        {controlPreferences.length > 1 ? (
          <div className="mt-8 flex justify-center" data-reveal>
            <div className="inline-flex flex-wrap justify-center gap-2 rounded-full bg-[var(--mn-paper)] p-1 ring-1 ring-[var(--mn-line)]">
              {controlPreferences.map((preference) => {
                const available = productOptionsById.has(preference);
                const pending = pendingStackPreference === preference;
                const selected = preference === selectedProductStackPreference;
                const className = `rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition disabled:cursor-wait disabled:opacity-70 ${
                  selected
                    ? "bg-[var(--mn-teal)] text-white"
                    : available
                      ? "text-[var(--mn-ink-soft)] hover:bg-[var(--mn-mint)]"
                      : "text-[var(--mn-ash)] hover:bg-[var(--mn-mint)]"
                }`;
                const label = pending
                  ? labels.preferenceUpdating
                  : preference === "compact"
                    ? labels.preferenceCompact
                    : labels.preferenceBalanced;
                const title = pending
                  ? labels.preferenceUpdating
                  : preference === "compact"
                    ? labels.preferenceCompactHint
                    : labels.preferenceBalancedHint;

                if (available) {
                  return (
                    <button
                      aria-pressed={selected}
                      className={className}
                      key={preference}
                      onClick={() => {
                        onProductStackPreferenceChange(preference);
                        replaceRevealStackUrl(locale, planId, preference);
                      }}
                      title={title}
                      type="button"
                    >
                      {label}
                    </button>
                  );
                }

                return (
                  <button
                    aria-pressed={selected}
                    className={className}
                    disabled={pending}
                    key={preference}
                    onClick={() => {
                      void requestProductStackPreference(preference);
                    }}
                    title={title}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {products.length < 1 ? (
          <div className="mt-10 rounded-lg bg-[var(--mn-paper)] p-8 text-center ring-1 ring-[var(--mn-line)]">
            <p className="text-sm leading-6 text-[var(--mn-ink-soft)]">
              {copy.productsEmpty}
            </p>
          </div>
        ) : (
          <div
            className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
            data-reveal
          >
            {products.map((product, index) => (
              <article
                className="group flex flex-col overflow-hidden rounded-[1.25rem] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] transition hover:-translate-y-1 hover:ring-[var(--mn-teal)] motion-reduce:transition-none"
                key={`${product.recommendationRunId ?? "product"}:${product.id}`}
              >
                <div className="relative flex h-60 items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#fff,var(--mn-mint))]">
                  <span className="absolute left-4 top-4 z-10 font-serif text-3xl italic text-[var(--mn-gold)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="absolute right-4 top-4 z-10 rounded-full bg-white/85 px-3 py-1 text-[0.65rem] font-bold text-[var(--mn-teal-deep)] ring-1 ring-[var(--mn-line)]">
                    {copy.productVerified}
                  </span>
                  <div
                    aria-hidden={true}
                    className="absolute bottom-5 h-5 w-28 rounded-full bg-[color-mix(in_srgb,var(--mn-ink)_14%,transparent)] blur-md transition group-hover:scale-110 motion-reduce:transition-none"
                  />
                  {product.imageUrl ? (
                    <Image
                      alt=""
                      className="relative z-[1] h-full w-full object-contain p-8 transition duration-500 group-hover:-translate-y-1 group-hover:scale-[1.03] motion-reduce:transition-none"
                      height={240}
                      unoptimized={true}
                      src={product.imageUrl}
                      width={320}
                    />
                  ) : (
                    <div className="relative z-[1] grid size-32 place-items-center rounded-[1.5rem] bg-white font-serif text-4xl italic text-[var(--mn-teal-deep)] shadow-sm ring-1 ring-[var(--mn-line)]">
                      MN
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="mn-mono-label text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--mn-ash)]">
                    {localizedMarketplaceName(product.marketplace, locale)}
                  </p>
                  <h3
                    className={`mt-2 min-h-12 font-serif text-xl font-medium text-[var(--mn-ink)] ${
                      locale === "th" ? "leading-8" : "leading-tight"
                    }`}
                  >
                    {product.name}
                  </h3>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {product.covers.slice(0, 4).map((cover) => (
                      <span
                        className="rounded-full bg-[var(--mn-mint)] px-2.5 py-1 text-xs font-semibold text-[var(--mn-teal-deep)]"
                        key={cover}
                      >
                        {localizedCoverLabel(
                          cover,
                          locale,
                          supplementLabelById,
                        )}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-6 text-[var(--mn-ink-soft)]">
                    {localizedProductDescription({
                      copy,
                      locale,
                      product,
                      supplementLabelById,
                    })}
                  </p>
                  <div className="mt-5 rounded-lg bg-[var(--mn-cream)] p-3 text-sm text-[var(--mn-ink-soft)] ring-1 ring-[var(--mn-line)]">
                    <strong className="text-[var(--mn-ink)]">
                      {product.servingMultiplier &&
                      product.servingMultiplier > 1
                        ? `${product.servingMultiplier} ${copy.productServingUnit}`
                        : copy.productDoseRecommended}
                    </strong>
                    <br />
                    {product.stackContributionPercent ??
                      product.productCoveragePercent ??
                      0}
                    % {copy.contributionLabel}
                  </div>
                  <a
                    className="mt-4 inline-flex items-center justify-between rounded-full bg-[var(--mn-teal)] px-4 py-3 text-sm font-bold text-white hover:bg-[var(--mn-teal-deep)]"
                    href={product.url}
                    onClick={() => trackMarketplaceClick(planId, product)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {copy.viewProduct}
                    <span aria-hidden={true}>→</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}

        <div
          className="mt-8 rounded-xl bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]"
          data-reveal
        >
          <div className="grid gap-5 md:grid-cols-[1fr_1.2fr] md:items-center">
            <div>
              <h3 className="font-serif text-3xl font-medium leading-tight text-[var(--mn-ink)]">
                {coverageHeadline}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--mn-ink-soft)]">
                {copy.coverageSub}
              </p>
            </div>
            <div>
              <div className="h-3 overflow-hidden rounded-full bg-[var(--mn-line)]">
                <div
                  className="h-full rounded-full bg-[var(--mn-teal)] transition-[width] duration-1000 motion-reduce:transition-none"
                  style={{
                    width: `${Math.min(100, Math.max(0, selectedCoverage))}%`,
                  }}
                />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="font-serif text-4xl font-medium text-[var(--mn-teal-deep)]">
                    <CountUpNumber
                      active={true}
                      duration={900}
                      value={products.length}
                    />
                  </p>
                  <p className="text-sm text-[var(--mn-ash)]">
                    {copy.selectedProducts}
                  </p>
                </div>
                <div>
                  <p className="font-serif text-4xl font-medium text-[var(--mn-teal-deep)]">
                    <CountUpNumber
                      active={true}
                      duration={1000}
                      value={productNeedCount}
                    />
                    /{Math.max(productNeedCount, supplementSelectedCount)}
                  </p>
                  <p className="text-sm text-[var(--mn-ash)]">
                    {copy.prioritiesCovered}
                  </p>
                </div>
                <div>
                  <p className="font-serif text-4xl font-medium text-[var(--mn-teal-deep)]">
                    <CountUpNumber
                      active={true}
                      duration={1100}
                      value={selectedCoverage}
                    />
                    %
                  </p>
                  <p className="text-sm text-[var(--mn-ash)]">
                    {copy.compactCoverageLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevealFoodSupportSection({
  copy,
  locale,
  result,
  selectedNeedCoverage,
  selectedProductStackPreference,
}: Readonly<{
  copy: typeof revealCopy.en;
  locale: Locale;
  result: FormulationResult;
  selectedNeedCoverage: readonly ProductNeedCoverage[];
  selectedProductStackPreference?: ProductStackPreference | null;
}>) {
  const { fallbackItems, variant } = selectedFoodSupport(
    result,
    selectedNeedCoverage,
    selectedProductStackPreference,
  );
  const visibleIngredients = visibleFormulaIngredients(
    result.supplementBreakdown,
  );
  const items = (variant?.items ?? fallbackItems).filter(
    (item) =>
      foodSupportFormulaGapsForItem(
        item,
        selectedNeedCoverage,
        visibleIngredients,
        locale,
      ).length > 0,
  );
  const fallbackGaps = foodSupportGaps(selectedNeedCoverage);
  const fallbackSupportableGaps = foodSupportableGaps(fallbackGaps);
  const fallbackGapText = joinFoodSupportNeeds(
    fallbackSupportableGaps.length > 0 ? fallbackSupportableGaps : fallbackGaps,
    locale,
  );
  const headline = variant
    ? safeFoodSupportCopy(
        variant.headline,
        locale,
        fallbackGaps.length > 0
          ? formatTemplate(copy.foodSupportGapHeadlineTemplate, {
              gaps: fallbackGapText,
            })
          : copy.foodSupportDefaultHeadline,
      )
    : fallbackGaps.length > 0
      ? formatTemplate(copy.foodSupportGapHeadlineTemplate, {
          gaps: fallbackGapText,
        })
      : copy.foodSupportDefaultHeadline;
  const body = variant
    ? safeFoodSupportCopy(
        variant.body,
        locale,
        fallbackGaps.length > 0
          ? formatTemplate(copy.foodSupportGapBodyTemplate, {
              gaps: fallbackGapText,
            })
          : copy.foodSupportDefaultBody,
      )
    : fallbackGaps.length > 0
      ? formatTemplate(copy.foodSupportGapBodyTemplate, {
          gaps: fallbackGapText,
        })
      : copy.foodSupportDefaultBody;

  if (items.length < 1) {
    return null;
  }

  return (
    <section className="border-t border-[var(--mn-line)] bg-[var(--mn-cream)] py-20">
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div data-reveal>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              05 · {copy.foodSupportEyebrow}
            </p>
            <h2
              className={`mt-4 font-serif text-4xl font-medium text-[var(--mn-ink)] sm:text-5xl ${
                locale === "th"
                  ? "leading-[1.38] break-words [overflow-wrap:anywhere]"
                  : "leading-tight text-balance"
              }`}
            >
              {headline || copy.foodSupportTitle}
            </h2>
          </div>
          <p
            className="text-base leading-8 text-[var(--mn-ink-soft)]"
            data-reveal
          >
            {body}
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const seed = managedSeedForFoodSupportItem(item);
            const name =
              getLocalizedText(item.food, locale) ||
              seed?.name[locale] ||
              seed?.name.en ||
              "";
            const imageAlt =
              getLocalizedText(item.imageAlt, locale) ||
              seed?.imageAlt[locale] ||
              seed?.imageAlt.en ||
              name;
            const category =
              getLocalizedText(item.category, locale) ||
              seed?.category[locale] ||
              seed?.category.en ||
              "";
            const serving =
              getLocalizedText(item.serving, locale) ||
              (seed ? managedFoodServing[seed.normalizedName]?.[locale] : "") ||
              "";
            const frequency =
              getLocalizedText(item.frequency, locale) ||
              (seed
                ? managedFoodFrequency[seed.normalizedName]?.[locale]
                : "") ||
              "";
            const formulaGaps = foodSupportFormulaGapsForItem(
              item,
              selectedNeedCoverage,
              visibleIngredients,
              locale,
            ).slice(0, 3);
            const itemRationale = safeFoodSupportCopy(
              item.rationale,
              locale,
              locale === "th"
                ? `${name} ช่วยเสริมจากอาหารในส่วนของ${joinFoodSupportFormulaGapLabels(
                    formulaGaps,
                    "th",
                  )} โดยไม่เปลี่ยนการคำนวณความครอบคลุมของผลิตภัณฑ์`
                : locale === "zh-CN"
                  ? `${name} 可通过食物层面支持 ${joinFoodSupportFormulaGapLabels(
                      formulaGaps,
                      "zh-CN",
                    )}，同时产品覆盖计算保持独立。`
                  : `${name} ${name.endsWith("s") ? "give" : "gives"} food-level support around ${joinFoodSupportFormulaGapLabels(
                      formulaGaps,
                      "en",
                    )} while product coverage stays separate.`,
            );

            return (
              <article
                className="overflow-hidden rounded-[1.25rem] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]"
                data-reveal
                key={`${selectedProductStackPreference ?? "food"}:${item.foodId}:${item.position}`}
              >
                <div className="relative h-52 overflow-hidden bg-[var(--mn-mint)]">
                  {item.imagePath ? (
                    <Image
                      alt={imageAlt}
                      className="object-cover"
                      fill={true}
                      loading="lazy"
                      src={item.imagePath}
                    />
                  ) : (
                    <div className="grid h-full place-items-center bg-[var(--mn-mint)] font-serif text-5xl italic text-[var(--mn-teal-deep)]">
                      {name.slice(0, 1)}
                    </div>
                  )}
                  <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--mn-teal-deep)] ring-1 ring-[var(--mn-line)]">
                    {String(item.position).padStart(2, "0")}
                  </span>
                </div>
                <div className="p-5">
                  <p className="mn-mono-label text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--mn-ash)]">
                    {category}
                  </p>
                  <h3
                    className={`mt-2 font-serif text-2xl font-medium text-[var(--mn-ink)] ${
                      locale === "th" ? "leading-9" : "leading-tight"
                    }`}
                  >
                    {name}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--mn-ink-soft)]">
                    {itemRationale}
                  </p>

                  {formulaGaps.length > 0 ? (
                    <div className="mt-4 rounded-lg bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]">
                      <p
                        className={`text-xs font-bold text-[var(--mn-ash)] ${
                          locale === "th" ? "" : "uppercase tracking-[0.12em]"
                        }`}
                      >
                        {copy.foodSupportGapLabel}
                      </p>
                      <div className="mt-3 space-y-2">
                        {formulaGaps.map((gap) => (
                          <div
                            className="rounded-md bg-[var(--mn-paper)] p-3 ring-1 ring-[var(--mn-line)]"
                            key={gap.id}
                          >
                            <div className="min-w-0">
                              <p className="text-[0.7rem] font-semibold text-[var(--mn-ash)]">
                                {copy.foodSupportFormulaGapLabel}
                                {gap.rowNumber
                                  ? ` ${String(gap.rowNumber).padStart(2, "0")}`
                                  : ""}
                              </p>
                              <p
                                className={`mt-1 font-serif text-lg font-medium text-[var(--mn-ink)] ${
                                  locale === "th"
                                    ? "leading-7"
                                    : "leading-tight"
                                }`}
                              >
                                {gap.label}
                              </p>
                              {gap.dailyDose ? (
                                <p className="mt-1 text-xs font-semibold text-[var(--mn-ink-soft)]">
                                  {gap.dailyDose}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-3 rounded-lg bg-[var(--mn-cream)] p-4 text-sm ring-1 ring-[var(--mn-line)] sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--mn-ash)]">
                        {copy.foodSupportServing}
                      </p>
                      <p className="mt-1 font-semibold text-[var(--mn-ink)]">
                        {serving}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--mn-ash)]">
                        {copy.foodSupportFrequency}
                      </p>
                      <p className="mt-1 font-semibold text-[var(--mn-ink)]">
                        {frequency}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export { FinalReportPanel };
