"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, MessageCircle, Printer } from "lucide-react";
import { LandingReveal } from "@/components/landing-reveal";
import { PreviewPaywallPanel } from "@/components/formulation-results-panels";
import {
  productCoveredNeedCount,
  replaceRevealStackUrl,
  revealContextChips,
  revealHeroMetaItems,
  selectedStackCoverage,
  selectProductRecommendationOption,
  type PanelLabels,
} from "@/components/formulation-results-helpers";
import {
  foodSupportFormulaRequirementsForItem,
  formulaIngredientRowNumbers,
  groupedFormulaIngredients,
  joinFoodSupportFormulaRequirementLabels,
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
  visibleSupplementRecommendationCount,
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
  revealFinalCopy,
  revealJoiners,
  revealProductPendingCards,
  revealSlotCopy,
} from "@/components/formulation-reveal-copy";
import { CountUpNumber } from "@/components/formulation-results-motion";
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
import { organisationDispatchCity } from "@/lib/organisation-dispatch";

type RevealFinalResultsPageProps = Readonly<{
  activeProductRecommendations?: FormulationResult["productRecommendations"];
  formattedDate: string;
  ingredients: FormulationIngredient[];
  isPreview: boolean;
  labels: PanelLabels;
  locale: Locale;
  onProductStackPreferenceChange: (preference: ProductStackPreference) => void;
  onProductStackPollingStart: (preference: ProductStackPreference) => void;
  onProductStackRefresh: () => Promise<boolean>;
  planId: string;
  productCoverageBySupplementId: ReadonlyMap<string, number>;
  productCoveragePending: boolean;
  productRecommendationOptions: ProductRecommendationOption[];
  productStackLoading: boolean;
  products: RecommendedProduct[];
  result: FormulationResult;
  selectedProductStackPreference?: ProductStackPreference | null;
  unlockHref: string;
}>;

type PanyaLineConnectState = Readonly<{
  code: string;
  command: string;
  expiresAt: string;
  lineUrl: string;
}> | null;

type RevealRetailerOption = NonNullable<
  ProductRecommendationOption["retailerOptions"]
>[number];

function optionSubtotal(option: RevealRetailerOption) {
  const subtotal = Number(option.subtotalAmount);

  return Number.isFinite(subtotal) ? subtotal : null;
}

function formatRevealAmountParts(
  locale: Locale,
  amount: number,
  currency: string,
) {
  const formatter = new Intl.NumberFormat(localeHtmlLang(locale), {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  });
  const parts = formatter.formatToParts(amount);
  const currencyText =
    parts.find((part) => part.type === "currency")?.value || currency;
  const amountText = parts
    .filter((part) => part.type !== "currency")
    .map((part) => part.value)
    .join("")
    .trim();

  return { amountText, currencyText };
}

function retailerDispatchNote(
  finalCopy: typeof revealFinalCopy.en,
  option: RevealRetailerOption | null | undefined,
) {
  const dispatchCity = organisationDispatchCity({
    metadata: option?.dispatchCity ? { dispatchCity: option.dispatchCity } : {},
    name: option?.organisationName ?? null,
  });

  return dispatchCity
    ? formatTemplate(finalCopy.deliveryNoteTemplate, { dispatchCity })
    : finalCopy.deliveryNote;
}

function optionEtaTime(option: RevealRetailerOption) {
  if (!option.etaDate) {
    return Number.POSITIVE_INFINITY;
  }

  const time = new Date(`${option.etaDate}T00:00:00.000Z`).getTime();

  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function panyaLineModeForPlan(plan: string) {
  const normalized = plan.trim().toLowerCase();

  return normalized === "pro" ||
    normalized === "โปร" ||
    normalized === "专业" ||
    normalized.includes("living protocol")
    ? "living_protocol"
    : "nutrition_plan";
}

function postRevealPanyaLineBpm(input: Readonly<{
  eventName: string;
  locale: Locale;
  planId: string;
}>) {
  void fetch("/api/bpm", {
    body: JSON.stringify({
      eventName: input.eventName,
      eventStatus: "observed",
      eventType: "chat",
      locale: input.locale,
      planId: input.planId,
      properties: {
        source: "reveal_panya_support",
      },
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  }).catch(() => undefined);
}

function safeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function renderTitleWithEmphasis(
  title: string,
  emphasis: string | null | undefined,
) {
  const cleanEmphasis = emphasis?.trim();

  if (!cleanEmphasis) {
    return title;
  }

  const index = title.indexOf(cleanEmphasis);

  if (index < 0) {
    return title;
  }

  const before = title.slice(0, index);
  const after = title.slice(index + cleanEmphasis.length);

  return (
    <>
      {before}
      <em>{cleanEmphasis}</em>
      {after}
    </>
  );
}

function renderRevealHeroHeadline(
  result: FormulationResult,
  locale: Locale,
  copy: typeof revealCopy.en,
) {
  const headline = revealSlotCopy(result, "heroHeadline", locale, copy.heroHeadline);

  if (locale === "en" && headline === copy.heroHeadline) {
    return (
      <>
        A formula built around{" "}
        <em>your body, your goals,</em>
        <br />
        and the way you actually live.
      </>
    );
  }

  return headline;
}

function assessmentGroups(result: FormulationResult, locale: Locale) {
  const visibleIngredients = visibleFormulaIngredients(result.supplementBreakdown);
  const signals = Array.from(
    new Set(
      visibleIngredients
        .flatMap((ingredient) => supplementBenefitTags(ingredient))
        .map((tag) => localizedBenefitTagLabel(tag, locale)),
    ),
  ).slice(0, 5);
  const profile = revealContextChips(result)
    .filter((chip) => chip.kind === "profile")
    .map((chip) => localizedContextChip(chip.value, locale));
  const goals = result.assessmentSummary.goals.map((goal) =>
    localizedContextChip(goal, locale),
  );
  const cautions = result.assessmentSummary.constraints.map((constraint) =>
    localizedContextChip(constraint, locale),
  );

  return { cautions, goals, profile, signals };
}

function renderAssessmentTitle(
  title: string,
  copy: typeof revealCopy.en,
  locale: Locale,
) {
  if (locale !== "en" || title !== copy.personalizationTitle) {
    return renderTitleWithEmphasis(title, copy.personalizationTitleEmphasis);
  }

  return (
    <>
      Everything you told us,
      <br />
      <em>{copy.personalizationTitleEmphasis}</em>.
    </>
  );
}

function renderDistillationTitle({
  copy,
  locale,
  narrative,
  selectedText,
  totalText,
}: Readonly<{
  copy: typeof revealCopy.en;
  locale: Locale;
  narrative: string;
  selectedText: string;
  totalText: string;
}>) {
  if (locale !== "en") {
    return narrative;
  }

  const expected = formatTemplate(copy.distilledTitleTemplate, {
    supplementSelectedText: selectedText,
    supplementTotalText: totalText,
  });

  if (narrative !== expected) {
    return narrative;
  }

  return (
    <>
      We evaluated <em>{totalText}</em> ingredients.
      <br />
      {selectedText} earned a place in your formula.
    </>
  );
}

function renderFormulaTitle({
  copy,
  locale,
  selectedText,
  title,
}: Readonly<{
  copy: typeof revealCopy.en;
  locale: Locale;
  selectedText: string;
  title: string;
}>) {
  const expected = formatTemplate(copy.formulaTitleTemplate, {
    supplementSelectedText: selectedText,
  });

  if (locale !== "en" || title !== expected) {
    return renderTitleWithEmphasis(title, copy.formulaTitleEmphasis);
  }

  return (
    <>
      {selectedText} nutrients.{" "}
      <em>{copy.formulaTitleEmphasis}</em>
    </>
  );
}

function renderProductsTitle({
  allCovered,
  coveredText,
  locale,
  pending,
  productSelectedText,
  selectedTextLower,
  title,
}: Readonly<{
  allCovered: boolean;
  coveredText: string;
  locale: Locale;
  pending: boolean;
  productSelectedText: string;
  selectedTextLower: string;
  title: string;
}>) {
  if (pending || locale !== "en") {
    return title;
  }

  const emphasized = allCovered
    ? `All ${selectedTextLower} nutrients.`
    : `${coveredText} of ${selectedTextLower} nutrients.`;

  return (
    <>
      {productSelectedText} bottles.{" "}
      <em>{emphasized}</em>
    </>
  );
}

function localizedOptionalIngredientText(
  value: FormulationIngredient["whyThis"],
  locale: Locale,
) {
  return value ? getLocalizedText(value, locale) : "";
}

function fallbackForYouCopy(
  locale: Locale,
  supplement: string,
  benefitLabel: string,
  result: FormulationResult,
) {
  const goals = result.assessmentSummary.goals
    .map((goal) => localizedContextChip(goal, locale))
    .filter(Boolean);
  const primaryGoal = goals[0] ?? "";

  if (locale === "th") {
    if (primaryGoal && benefitLabel) {
      return `${supplement} เชื่อมกับเป้าหมาย ${primaryGoal} และสัญญาณด้าน${benefitLabel}ที่พบจากคำตอบของคุณ`;
    }

    return `${supplement} ถูกเก็บไว้เพราะสอดคล้องกับเป้าหมายและบริบทที่คุณให้ไว้`;
  }

  if (locale === "zh-CN") {
    if (primaryGoal && benefitLabel) {
      return `${supplement} 对应你的${primaryGoal}目标，并结合问卷中出现的${benefitLabel}信号。`;
    }

    return `${supplement} 保留下来，是因为它符合你的目标和安全背景。`;
  }

  if (primaryGoal && benefitLabel) {
    return `${supplement} maps to your ${primaryGoal} goal and the ${benefitLabel} signal in your assessment.`;
  }

  return `${supplement} stayed in because it fits the goals, routines, and safety context you shared.`;
}

function fallbackDecisionCopy(
  locale: Locale,
  dailyDose: string,
  benefitLabel: string,
) {
  if (locale === "th") {
    return benefitLabel
      ? `${dailyDose} เพื่อสนับสนุนด้าน${benefitLabel}โดยไม่เพิ่มสิ่งที่ไม่จำเป็น`
      : `${dailyDose} เป็นปริมาณใช้งานจริงที่คงไว้หลังการคัดกรอง`;
  }

  if (locale === "zh-CN") {
    return benefitLabel
      ? `${dailyDose}，用于支持${benefitLabel}，同时避免不必要的添加。`
      : `${dailyDose} 是筛选后保留的实用每日剂量。`;
  }

  return benefitLabel
    ? `${dailyDose} for ${benefitLabel}, without adding unnecessary extras.`
    : `${dailyDose} is the practical daily dose kept after screening.`;
}

export function RevealFinalResultsPage({
  activeProductRecommendations,
  formattedDate,
  ingredients,
  isPreview,
  labels,
  locale,
  onProductStackPreferenceChange,
  onProductStackPollingStart,
  onProductStackRefresh,
  planId,
  productCoverageBySupplementId,
  productCoveragePending,
  productRecommendationOptions,
  productStackLoading,
  products,
  result,
  selectedProductStackPreference,
  unlockHref,
}: RevealFinalResultsPageProps) {
  const copy = revealCopy[locale];
  const finalCopy = revealFinalCopy[locale];
  const visibleIngredients = visibleFormulaIngredients(ingredients);
  const supplementSelectedCount = visibleSupplementRecommendationCount(result);
  const catalogueSupplementCount = Math.max(
    supplementSelectedCount,
    Number(result.catalogueSupplementCount ?? result.totalSupplementCount ?? 0),
  );
  const supplementSelectedText = localizedCountText(
    supplementSelectedCount,
    locale,
    true,
  );
  const heroSub = formatTemplate(
    revealSlotCopy(result, "heroSub", locale, copy.heroSub),
    { supplementSelectedText },
  );
  const heroMeta = revealHeroMetaItems(result, locale);
  const firstName =
    typeof result.firstName === "string" && result.firstName.trim()
      ? result.firstName.trim()
      : "";
  const groups = assessmentGroups(result, locale);
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
  const selectedNeedCoverage =
    productCoveragePending
      ? []
      : activeProductRecommendations?.needCoverage ?? [];

  return (
    <section className="mn-reveal-final mn-reveal-font-body w-full">
      <LandingReveal />

      <section
        aria-label={copy.heroTitle}
        className="relative flex min-h-[calc(100vh-70px)] items-center justify-center overflow-hidden px-5 py-20 pb-32 text-center sm:px-8 lg:px-14"
      >
        <div
          aria-hidden={true}
          className="hero-orb absolute left-1/2 top-1/2 -z-10 size-[min(720px,92vw)] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(220,233,222,.55) 0%, rgba(220,233,222,.25) 35%, transparent 70%)",
          }}
        />
        <svg
          aria-hidden={true}
          className="hero-leaf hero-leaf-d1 absolute left-[14%] top-[18%]"
          fill="none"
          height="42"
          viewBox="0 0 40 40"
          width="42"
        >
          <path
            d="M20 4 C12 12 8 22 8 32 C16 28 24 18 20 4Z"
            fill="#2D8F72"
            opacity=".6"
          />
        </svg>
        <svg
          aria-hidden={true}
          className="hero-leaf hero-leaf-d2 absolute right-[16%] top-[22%]"
          fill="none"
          height="36"
          viewBox="0 0 40 40"
          width="36"
        >
          <path
            d="M20 4 C28 12 32 22 32 32 C24 28 16 18 20 4Z"
            fill="#B8943D"
            opacity=".5"
          />
        </svg>
        <svg
          aria-hidden={true}
          className="hero-leaf hero-leaf-d3 absolute bottom-[24%] left-[20%]"
          fill="none"
          height="32"
          viewBox="0 0 40 40"
          width="32"
        >
          <path
            d="M6 20 C14 12 24 8 34 8 C30 16 20 24 6 20Z"
            fill="#1F6E58"
            opacity=".5"
          />
        </svg>
        <svg
          aria-hidden={true}
          className="hero-leaf hero-leaf-d4 absolute bottom-[18%] right-[22%]"
          fill="none"
          height="38"
          viewBox="0 0 40 40"
          width="38"
        >
          <path
            d="M20 4 C12 12 8 22 8 32 C16 28 24 18 20 4Z"
            fill="#4DB497"
            opacity=".55"
          />
        </svg>

        <div className="relative w-full max-w-[820px]">
          <div className="hero-rise hero-rise-d1 mb-9 mn-reveal-final-label mn-reveal-hero-eyebrow justify-center">
            {copy.heroEyebrow}
          </div>
          {firstName ? (
            <div className="hero-rise hero-rise-d2 mb-3 mn-reveal-font-display text-[clamp(22px,2.4vw,28px)] font-light italic text-[var(--mn-ink-soft)]">
              {copy.heroFor}
            </div>
          ) : null}
          <h1 className="hero-rise hero-rise-d3 mb-8 mn-reveal-font-display mn-reveal-track-hero-title text-[clamp(64px,10vw,132px)] font-normal italic leading-[0.98] text-[var(--mn-teal-deep)]">
            {firstName || copy.heroTitle}
            <span className="text-[var(--mn-gold)]">.</span>
          </h1>
          <p className="hero-rise hero-rise-d4 mx-auto mb-7 max-w-[680px] mn-reveal-font-display mn-reveal-hero-headline mn-reveal-track-hero-copy text-[clamp(28px,3.6vw,44px)] font-normal leading-[1.18] text-[var(--mn-ink)]">
            {renderRevealHeroHeadline(result, locale, copy)}
          </p>
          <p className="hero-rise hero-rise-d5 mx-auto mb-14 max-w-[480px] text-[15px] leading-7 text-[var(--mn-ink-soft)]">
            {heroSub}
          </p>
          <div className="hero-rise hero-rise-d6 mx-auto inline-flex max-w-full flex-wrap items-center justify-center gap-3 rounded-full border border-[var(--mn-line)] bg-white/50 px-[22px] py-3 mn-reveal-font-mono text-[11px] tracking-[0.06em] text-[var(--mn-ink-soft)] backdrop-blur-md">
            {heroMeta.length > 0
              ? heroMeta.map((item, index) => (
                  <span className="inline-flex items-center gap-3" key={`${item}:${index}`}>
                    {index > 0 ? <span className="h-3 w-px bg-[var(--mn-line)]" /> : null}
                    <span>{item}</span>
                  </span>
                ))
              : <span>{result.assessmentSummary.plan}</span>}
          </div>
        </div>
        <a
          className="scroll-cue hero-rise hero-rise-d7 absolute bottom-12 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3.5 mn-reveal-font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--mn-ash)]"
          href="#assessment"
        >
          {copy.begin}
          <span className="scroll-cue-line h-9 w-px bg-[var(--mn-ash)]" />
        </a>
      </section>

      <RevealAssessmentSection
        copy={copy}
        finalCopy={finalCopy}
        groups={groups}
        locale={locale}
        result={result}
      />

      <RevealDistillationSection
        catalogueSupplementCount={catalogueSupplementCount}
        copy={copy}
        locale={locale}
        result={result}
        supplementSelectedCount={supplementSelectedCount}
      />

      {isPreview ? (
        <div className="mn-reveal-final-wrap">
          <PreviewPaywallPanel labels={labels} unlockHref={unlockHref} />
        </div>
      ) : null}

      <RevealFormulaFinalSection
        catalogueSupplementCount={catalogueSupplementCount}
        copy={copy}
        finalCopy={finalCopy}
        formattedDate={formattedDate}
        ingredients={visibleIngredients}
        locale={locale}
        productCoverageBySupplementId={productCoverageBySupplementId}
        productCoveragePending={productCoveragePending}
        result={result}
      />

      <RevealProductsFinalSection
        activeProductRecommendations={activeProductRecommendations}
        copy={copy}
        finalCopy={finalCopy}
        locale={locale}
        onProductStackPreferenceChange={onProductStackPreferenceChange}
        onProductStackPollingStart={onProductStackPollingStart}
        onProductStackRefresh={onProductStackRefresh}
        planId={planId}
        productCoveragePending={productCoveragePending}
        productOptions={productOptions}
        productStackLoading={productStackLoading}
        products={products}
        result={result}
        selectedProductStackPreference={selectedProductStackPreference}
        supplementSelectedCount={supplementSelectedCount}
      />

      <KhunDreamSection finalCopy={finalCopy} />

      <RevealFoodSupportFinalSection
        copy={copy}
        finalCopy={finalCopy}
        locale={locale}
        result={result}
        selectedNeedCoverage={selectedNeedCoverage}
        selectedProductStackPreference={
          selectedProductRecommendationOption?.id ??
          selectedProductStackPreference
        }
      />

      <RevealPanyaFinalSection
        finalCopy={finalCopy}
        locale={locale}
        planId={planId}
        result={result}
      />

      <RevealSafetyFinalSection
        copy={copy}
        labels={labels}
        locale={locale}
        result={result}
      />

      <RevealClosingFinalSection
        copy={copy}
        finalCopy={finalCopy}
        locale={locale}
        planId={planId}
        result={result}
      />
    </section>
  );
}

function RevealAssessmentSection({
  copy,
  finalCopy,
  groups,
  locale,
  result,
}: Readonly<{
  copy: typeof revealCopy.en;
  finalCopy: typeof revealFinalCopy.en;
  groups: ReturnType<typeof assessmentGroups>;
  locale: Locale;
  result: FormulationResult;
}>) {
  const assessmentTitle = revealSlotCopy(
    result,
    "breadcrumbsTitle",
    locale,
    copy.personalizationTitle,
  );
  const cards = [
    { items: groups.goals, label: finalCopy.assessmentGoals, tone: "mint" },
    { items: groups.signals, label: finalCopy.assessmentSymptoms, tone: "paper" },
    { items: groups.profile, label: finalCopy.assessmentProfile, tone: "profile" },
    { items: groups.cautions, label: finalCopy.assessmentCautions, tone: "caution" },
  ];

  return (
    <section
      className="mn-reveal-assessment border-t border-[var(--mn-line)] py-20"
      id="assessment"
    >
      <div className="mn-reveal-final-wrap">
        <div className="mn-reveal-assessment-intro grid gap-10 md:grid-cols-[1fr_1.4fr] md:items-end" data-reveal>
          <div>
            <div className="mn-reveal-final-label">
              <span className="mn-reveal-final-label-number">01</span>
              {copy.personalizationEyebrow}
            </div>
            <h2 className="mn-reveal-final-heading mt-3 text-[clamp(28px,3.4vw,42px)] leading-[1.15]">
              {renderAssessmentTitle(assessmentTitle, copy, locale)}
            </h2>
          </div>
          <p className="max-w-[520px] text-base leading-[1.65] text-[var(--mn-ink-soft)]">
            {revealSlotCopy(
              result,
              "breadcrumbsBody",
              locale,
              copy.personalizationBody,
            )}
          </p>
        </div>
        <div className="mn-reveal-assessment-grid mt-10 grid overflow-hidden rounded-md border border-[var(--mn-line)] bg-[var(--mn-paper)] sm:grid-cols-2" data-reveal>
          {cards.map((card, index) => (
            <div
              className={`mn-reveal-assessment-cell p-6 ${
                index % 2 === 0 ? "sm:border-r" : ""
              } ${index < 2 ? "border-b" : ""} border-[var(--mn-line)]`}
              key={card.label}
            >
              <div className="mn-reveal-assessment-cell-label mb-3 mn-reveal-font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--mn-ash)]">
                {card.label}
              </div>
              <div className="mn-reveal-assessment-pills flex flex-wrap gap-1.5">
                {(card.items.length > 0 ? card.items : [finalCopy.none]).map((item) => (
                  <span
                    className={`mn-reveal-assessment-pill rounded-full px-3 py-[5px] text-xs font-semibold ${
                      card.tone === "caution"
                        ? "mn-reveal-assessment-pill--caution bg-[var(--mn-reveal-caution-bg)] text-[var(--mn-reveal-caution-ink)] ring-1 ring-[var(--mn-reveal-caution-edge)]"
                        : card.tone === "mint"
                          ? "mn-reveal-assessment-pill--mint bg-[var(--mn-mint-deep)] text-[var(--mn-teal-deep)]"
                          : card.tone === "profile"
                            ? "mn-reveal-assessment-pill--profile bg-[var(--mn-cream-deep)] text-[var(--mn-ink)]"
                            : "mn-reveal-assessment-pill--paper bg-[var(--mn-mint)] text-[var(--mn-ink-soft)]"
                    }`}
                    key={item}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RevealDistillationSection({
  catalogueSupplementCount,
  copy,
  locale,
  result,
  supplementSelectedCount,
}: Readonly<{
  catalogueSupplementCount: number;
  copy: typeof revealCopy.en;
  locale: Locale;
  result: FormulationResult;
  supplementSelectedCount: number;
}>) {
  const supplementSelectedText = localizedCountText(
    supplementSelectedCount,
    locale,
    true,
  );
  const supplementTotalText = localizedCountText(catalogueSupplementCount, locale);
  const distillNarrative = formatTemplate(copy.distilledTitleTemplate, {
    supplementSelectedText,
    supplementTotalText,
  });
  const resolvedDistillNarrative = revealSlotCopy(
    result,
    "distillNarrative",
    locale,
    distillNarrative,
  );

  return (
    <section className="mn-reveal-distillation border-t border-[var(--mn-line)] py-24 text-center">
      <div className="mn-reveal-final-wrap">
        <div className="mn-reveal-final-label justify-center" data-reveal>
          <span className="mn-reveal-final-label-number">02</span>
          {copy.distilledEyebrow}
        </div>
        <h2 className="mn-reveal-final-heading mx-auto mt-7 max-w-[720px] text-[clamp(28px,3.6vw,44px)] leading-[1.2]" data-reveal>
          {renderDistillationTitle({
            copy,
            locale,
            narrative: resolvedDistillNarrative,
            selectedText: supplementSelectedText,
            totalText: supplementTotalText,
          })}
        </h2>
        <div className="mn-reveal-distillation-pair mx-auto mb-10 mt-16 flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-[clamp(30px,5vw,80px)]" data-reveal>
          <div className="mn-reveal-distillation-count text-center">
            <div className="mn-reveal-distillation-number mn-reveal-distillation-number--from tabular-nums">
              <CountUpNumber active={true} duration={1100} value={catalogueSupplementCount} />
            </div>
            <p className="mn-reveal-distillation-label mt-3.5 mn-reveal-font-mono text-[11px] uppercase tracking-[0.26em] text-[var(--mn-ash)]">
              {copy.catalogueSupplements}
            </p>
          </div>
          <div className="mn-reveal-distillation-arrow mn-reveal-font-display text-[clamp(40px,6vw,72px)] font-light italic text-[var(--mn-gold)] sm:-translate-y-3" aria-hidden={true}>
            →
          </div>
          <div className="mn-reveal-distillation-count text-center">
            <div className="mn-reveal-distillation-number mn-reveal-distillation-number--to tabular-nums">
              <CountUpNumber active={true} duration={1400} value={supplementSelectedCount} />
            </div>
            <p className="mn-reveal-distillation-label mt-3.5 mn-reveal-font-mono text-[11px] uppercase tracking-[0.26em] text-[var(--mn-ink-soft)]">
              {copy.supplementsRecommended}
            </p>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-[600px] text-sm leading-[1.7] text-[var(--mn-ink-soft)]" data-reveal>
          {revealSlotCopy(result, "distillFoot", locale, copy.distilledFoot)}
        </p>
      </div>
    </section>
  );
}

function RevealFormulaFinalSection({
  catalogueSupplementCount,
  copy,
  finalCopy,
  formattedDate,
  ingredients,
  locale,
  productCoverageBySupplementId,
  productCoveragePending,
  result,
}: Readonly<{
  catalogueSupplementCount: number;
  copy: typeof revealCopy.en;
  finalCopy: typeof revealFinalCopy.en;
  formattedDate: string;
  ingredients: FormulationIngredient[];
  locale: Locale;
  productCoverageBySupplementId: ReadonlyMap<string, number>;
  productCoveragePending: boolean;
  result: FormulationResult;
}>) {
  const ingredientRowNumber = formulaIngredientRowNumbers(ingredients);
  const supplementSelectedText = localizedCountText(
    ingredients.length,
    locale,
    true,
  );
  const formulaTitle = formatTemplate(copy.formulaTitleTemplate, {
    supplementSelectedText,
  });
  const resolvedFormulaTitle = revealSlotCopy(
    result,
    "formulaTitle",
    locale,
    formulaTitle,
  );
  const formulaLead = revealSlotCopy(
    result,
    "formulaLead",
    locale,
    copy.formulaLead,
  );
  const formulaFocus =
    result.assessmentSummary.goals.length > 0
      ? result.assessmentSummary.goals
          .map((goal) => localizedContextChip(goal, locale))
          .join(revealJoiners[locale])
      : result.assessmentSummary.plan;
  const signedFor = result.firstName?.trim()
    ? `${copy.formulaSignedPrefix} ${result.firstName.trim()}, ${formattedDate}`
    : `${copy.formulaSignedPrefix} ${formattedDate}`;

  return (
    <section
      className="mn-reveal-formula border-t border-[var(--mn-line)] py-24"
      id="formula"
    >
      <div className="mn-reveal-final-wrap">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-end" data-reveal>
          <div>
            <div className="mn-reveal-final-label">
              <span className="mn-reveal-final-label-number">03</span>
              {copy.formulaEyebrow}
            </div>
            <h2 className="mn-reveal-final-heading mt-4 text-[clamp(36px,4.4vw,56px)] leading-[1.05]">
              {renderFormulaTitle({
                copy,
                locale,
                selectedText: supplementSelectedText,
                title: resolvedFormulaTitle,
              })}
            </h2>
          </div>
          <p className="max-w-[520px] text-base leading-[1.7] text-[var(--mn-ink-soft)]">
            {formulaLead}
            <span className="mn-reveal-formula-hint mt-3 inline-flex items-center gap-2 mn-reveal-font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--mn-teal)]">
              <span aria-hidden={true} className="grid size-[18px] place-items-center rounded-full border border-[var(--mn-teal)] text-[11px] leading-none">
                +
              </span>
              {finalCopy.formulaHint}
            </span>
          </p>
        </div>

        <div className="mn-reveal-final-card mn-reveal-formula-card mt-14 px-5 py-8 sm:px-8 lg:px-12" data-reveal>
          <div className="mn-reveal-formula-meta mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mn-line)] pb-6 mn-reveal-font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--mn-ash)]">
            <span>{copy.formulaMetaTier}</span>
            <span className="mn-reveal-font-display text-[15px] font-medium italic normal-case tracking-normal text-[var(--mn-teal-deep)]">
              {copy.formulaMetaFocus}: {formulaFocus}
            </span>
            <span>
              {catalogueSupplementCount} {copy.formulaMetaEvaluatedCount} ·{" "}
              {ingredients.length} {copy.formulaMetaSelected}
            </span>
          </div>

          {groupedFormulaIngredients(ingredients).map(([category, group]) => (
            <div key={category}>
              <div className="mt-8 flex items-center gap-3 border-b border-dashed border-[var(--mn-line)] pb-3 mn-reveal-font-display text-sm italic text-[var(--mn-gold)]">
                <span className="size-1.5 rounded-full bg-[var(--mn-gold)]" />
                {localizedCategoryLabel(category, locale)}
                <span className="ml-auto mn-reveal-font-mono text-[11px] not-italic uppercase tracking-[0.2em] text-[var(--mn-ash)]">
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
                const coverage = productCoveragePending
                  ? null
                  : productCoverageBySupplementId.get(ingredient.id) ?? 0;
                const benefit = supplementBenefitTags(ingredient)[0];
                const benefitLabel = benefit
                  ? localizedBenefitTagLabel(benefit, locale)
                  : "";
                const legacyForYouCopy =
                  localizedOptionalIngredientText(ingredient.forYou, locale) ||
                  fallbackForYouCopy(
                    locale,
                    supplement,
                    benefitLabel,
                    result,
                  );
                const legacyWhyThisCopy =
                  localizedOptionalIngredientText(ingredient.whyThis, locale) ||
                  rationale;
                const whyThisCopy =
                  localizedOptionalIngredientText(
                    ingredient.whyThisIsForYou,
                    locale,
                  ) ||
                  (legacyWhyThisCopy === legacyForYouCopy
                    ? legacyWhyThisCopy
                    : `${legacyWhyThisCopy} ${legacyForYouCopy}`);
                const decisionCopy =
                  localizedOptionalIngredientText(ingredient.decision, locale) ||
                  fallbackDecisionCopy(locale, dailyDose, benefitLabel);
                const toggleId = `nutrient-${safeKey(ingredient.id)}-${rowNumber}`;
                const safetyCopy =
                  ingredient.safety?.message
                    ? getLocalizedText(ingredient.safety.message, locale)
                    : ingredient.cautions?.[0]?.body
                      ? getLocalizedText(ingredient.cautions[0].body, locale)
                      : copy.wellnessOnly;

                return (
                  <article
                    className="nutrient-card relative border-b border-[var(--mn-line)] last:border-b-0"
                    key={ingredient.id}
                  >
                    <input
                      aria-label={`${supplement} ${finalCopy.nutrientWhy}`}
                      className="nutrient-toggle"
                      id={toggleId}
                      type="checkbox"
                    />
                    <label
                      className="nutrient-header mn-reveal-nutrient-header relative grid cursor-pointer select-none grid-cols-[32px_minmax(0,1fr)_36px] items-center gap-3.5 rounded py-5 transition-colors hover:bg-[var(--mn-cream)] md:grid-cols-[36px_minmax(160px,1.25fr)_minmax(260px,2.2fr)_minmax(96px,auto)_minmax(72px,auto)_36px] md:gap-5 md:pr-2"
                      htmlFor={toggleId}
                    >
                      <span className="mn-reveal-font-display text-2xl italic text-[var(--mn-gold)]">
                        {String(rowNumber).padStart(2, "0")}
                      </span>
                      <span>
                        <span className="block mn-reveal-font-display text-xl font-medium leading-tight text-[var(--mn-ink)]">
                          {supplement}
                        </span>
                        <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--mn-ash)]">
                          {localizedCategoryLabel(ingredient.category, locale)}
                        </span>
                      </span>
                      <span className="mn-reveal-nutrient-rationale hidden text-sm leading-[1.6] text-[var(--mn-ink-soft)] md:block">
                        {rationale}
                        {benefit ? (
                          <span className="mt-2 block w-max max-w-full rounded-full bg-[var(--mn-mint)] px-3 py-1 text-xs font-semibold text-[var(--mn-teal-deep)]">
                            {benefitLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="nutrient-dose hidden whitespace-nowrap text-right mn-reveal-font-mono text-sm font-semibold text-[var(--mn-ink)] md:block">
                        {dailyDose}
                      </span>
                      <span className="nutrient-coverage hidden whitespace-nowrap text-right mn-reveal-font-mono text-sm font-semibold text-[var(--mn-teal-deep)] md:block">
                        {coverage === null ? copy.productsPendingBadge : `${coverage}%`}
                      </span>
                      <span aria-hidden={true} className="expand-icon" />
                    </label>
                    <div className="nutrient-body">
                      <div className="mn-reveal-nutrient-drawer grid gap-6 pb-7 pl-[46px] pr-2 pt-4 md:grid-cols-2 md:gap-10 md:pl-[56px]">
                        <div className="mn-reveal-nutrient-detail">
                          <h5 className="mn-reveal-nutrient-detail-label mn-reveal-font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
                            {finalCopy.nutrientWhy}
                          </h5>
                          <p className="mt-2.5 text-sm leading-[1.65] text-[var(--mn-ink)]">
                            {whyThisCopy}
                          </p>
                        </div>
                        <div className="mn-reveal-nutrient-detail">
                          <h5 className="mn-reveal-nutrient-detail-label mn-reveal-font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
                            {finalCopy.nutrientDecision}
                          </h5>
                          <p className="mt-2.5 text-sm leading-[1.65] text-[var(--mn-ink)]">
                            {decisionCopy}
                          </p>
                        </div>
                        <div className="mn-reveal-nutrient-safety flex gap-3.5 rounded-r-md border-l-[3px] border-[var(--mn-gold)] bg-[var(--mn-cream)] px-[18px] py-3.5 text-[13px] leading-[1.6] text-[var(--mn-ink-soft)] md:col-span-2">
                          <span className="shrink-0 whitespace-nowrap pt-0.5 mn-reveal-font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--mn-gold)]">
                            {finalCopy.nutrientSafety}
                          </span>
                          <span>{safetyCopy}</span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}

          <div className="mt-9 flex flex-col gap-4 border-t border-[var(--mn-line)] pt-7 mn-reveal-font-mono text-xs uppercase tracking-[0.08em] text-[var(--mn-ash)] sm:flex-row sm:items-center sm:justify-between">
            <span>
              {catalogueSupplementCount} {copy.catalogueSupplements} · {ingredients.length} {copy.formulaMetaSelected} · 0 {copy.formulaMetaNoPadding}
            </span>
            <span className="mn-reveal-font-display text-sm italic normal-case tracking-normal text-[var(--mn-teal-deep)]">
              {signedFor}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevealProductsFinalSection({
  activeProductRecommendations,
  copy,
  finalCopy,
  locale,
  onProductStackPreferenceChange,
  onProductStackPollingStart,
  onProductStackRefresh,
  planId,
  productCoveragePending,
  productOptions,
  productStackLoading,
  products,
  result,
  selectedProductStackPreference,
  supplementSelectedCount,
}: Readonly<{
  activeProductRecommendations?: FormulationResult["productRecommendations"];
  copy: typeof revealCopy.en;
  finalCopy: typeof revealFinalCopy.en;
  locale: Locale;
  onProductStackPreferenceChange: (preference: ProductStackPreference) => void;
  onProductStackPollingStart: (preference: ProductStackPreference) => void;
  onProductStackRefresh: () => Promise<boolean>;
  planId: string;
  productCoveragePending: boolean;
  productOptions: ProductRecommendationOption[];
  productStackLoading: boolean;
  products: RecommendedProduct[];
  result: FormulationResult;
  selectedProductStackPreference?: ProductStackPreference | null;
  supplementSelectedCount: number;
}>) {
  const labels = productRecommendationCopy[locale];
  const selectedCoverage = selectedStackCoverage(
    activeProductRecommendations,
    products,
  );
  const productNeedCount = productCoveredNeedCount(products);
  const supplementLabelById = new Map(
    visibleFormulaIngredients(result.supplementBreakdown).map((ingredient) => [
      ingredient.id,
      localizedSupplementName(ingredient.supplement, ingredient.id, locale),
    ]),
  );
  const [pendingStackPreference, setPendingStackPreference] =
    useState<ProductStackPreference | null>(null);
  const [retailerSelection, setRetailerSelection] = useState<{
    organisationId: string | null;
    optionsKey: string;
  }>({ organisationId: null, optionsKey: "" });
  const productOptionsById = new Map(
    productOptions.map((option) => [option.id, option]),
  );
  const selectedProductOption = selectedProductStackPreference
    ? productOptionsById.get(selectedProductStackPreference)
    : selectProductRecommendationOption(productOptions, null);
  const retailerOptions = [...(selectedProductOption?.retailerOptions ?? [])]
    .filter((option) => option.organisationId && option.organisationName)
    .sort((left, right) =>
      (right.supplementProductCoveragePercent ?? 0) -
        (left.supplementProductCoveragePercent ?? 0) ||
      (right.totalPlanCoveragePercent ?? 0) -
        (left.totalPlanCoveragePercent ?? 0) ||
      (left.subtotalAmount ?? Number.POSITIVE_INFINITY) -
        (right.subtotalAmount ?? Number.POSITIVE_INFINITY) ||
      (left.etaDate ?? "").localeCompare(right.etaDate ?? ""),
    )
    .slice(0, 3);
  const retailerOptionsKey = retailerOptions
    .map((option) => option.organisationId)
    .join("|");
  const selectedRetailerOrganisationId =
    retailerSelection.optionsKey === retailerOptionsKey &&
    retailerOptions.some(
      (option) => option.organisationId === retailerSelection.organisationId,
    )
      ? retailerSelection.organisationId
      : retailerOptions[0]?.organisationId ?? null;
  const selectedRetailerOption =
    retailerOptions.find(
      (option) => option.organisationId === selectedRetailerOrganisationId,
    ) ?? retailerOptions[0] ?? null;
  const selectedRetailerDispatchNote = retailerDispatchNote(
    finalCopy,
    selectedRetailerOption,
  );
  const bestValueRetailerOrganisationId =
    [...retailerOptions]
      .filter((option) => optionSubtotal(option) !== null)
      .sort(
        (left, right) =>
          (optionSubtotal(left) ?? Number.POSITIVE_INFINITY) -
            (optionSubtotal(right) ?? Number.POSITIVE_INFINITY) ||
          optionEtaTime(left) - optionEtaTime(right),
      )[0]?.organisationId ?? null;
  const fastestRetailerOrganisationId =
    [...retailerOptions]
      .filter((option) => optionEtaTime(option) !== Number.POSITIVE_INFINITY)
      .sort(
        (left, right) =>
          optionEtaTime(left) - optionEtaTime(right) ||
          (optionSubtotal(left) ?? Number.POSITIVE_INFINITY) -
            (optionSubtotal(right) ?? Number.POSITIVE_INFINITY),
      )[0]?.organisationId ?? null;
  const controlPreferences =
    productOptions.length > 0 || result.productRecommendations
      ? productStackPreferenceOrder
      : [];
  const productIds = useMemo(
    () => products.map((product) => product.productId ?? product.id),
    [products],
  );
  const productIdsKey = productIds.join("|");
  const [basketSelection, setBasketSelection] = useState<{
    ids: Set<string>;
    productIdsKey: string;
  }>(() => ({
    ids: new Set(productIds),
    productIdsKey,
  }));
  const selectedBasketIds =
    basketSelection.productIdsKey === productIdsKey
      ? basketSelection.ids
      : new Set(productIds);
  const updateSelectedBasketIds = useCallback(
    (update: (current: Set<string>) => Set<string>) => {
      setBasketSelection((current) => {
        const base =
          current.productIdsKey === productIdsKey
            ? current.ids
            : new Set(productIds);

        return {
          ids: update(base),
          productIdsKey,
        };
      });
    },
    [productIds, productIdsKey],
  );
  const selectedBasketProducts = products.filter((product) =>
    selectedBasketIds.has(product.productId ?? product.id),
  );
  const removedBasketProducts = products.filter(
    (product) => !selectedBasketIds.has(product.productId ?? product.id),
  );
  const selectedRetailerSubtotal = Number(selectedRetailerOption?.subtotalAmount);
  const selectedBasketSubtotal =
    selectedRetailerOption &&
    removedBasketProducts.length === 0 &&
    selectedBasketProducts.length === products.length &&
    Number.isFinite(selectedRetailerSubtotal)
      ? selectedRetailerSubtotal
      : selectedBasketProducts.reduce(
          (total, product) =>
            total + (product.price?.amount ?? product.retailer?.unitPriceAmount ?? 0),
          0,
        );
  const selectedBasketCurrency =
    selectedRetailerOption?.currency ??
    selectedBasketProducts.find((product) => product.price?.currency)?.price
      ?.currency ??
    selectedBasketProducts[0]?.price?.currency ??
    "THB";
  const selectedBasketCoverage = Math.min(
    100,
    Math.max(
      0,
      selectedBasketProducts.length === products.length
        ? selectedCoverage
        : selectedBasketProducts.reduce(
            (total, product) => total + (product.stackContributionPercent ?? 0),
            0,
          ) || (selectedBasketProducts.length > 0 ? selectedCoverage : 0),
    ),
  );
  const selectedBasketIdList = selectedBasketProducts.map(
    (product) => product.productId ?? product.id,
  );
  const removedBasketIdList = removedBasketProducts.map(
    (product) => product.productId ?? product.id,
  );
  const basketCheckoutHref =
    selectedBasketIdList.length > 0
      ? (() => {
          const params = new URLSearchParams({
            plan: planId,
            selected: selectedBasketIdList.join(","),
            removed: removedBasketIdList.join(","),
          });

          if (selectedRetailerOrganisationId) {
            params.set("retailer", selectedRetailerOrganisationId);
          }

          return `/${locale}/basket/checkout?${params.toString()}`;
        })()
      : "";
  const basketAmountText = new Intl.NumberFormat(localeHtmlLang(locale), {
    currency: selectedBasketCurrency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(selectedBasketSubtotal);
  const productMatchingPending =
    products.length < 1 &&
    (productCoveragePending ||
      productStackLoading ||
      result.productRecommendations?.status === "pending" ||
      productOptions.some((option) => option.productRecommendations.status === "pending"));
  const coveredProductNeedCount = Math.min(
    Math.max(0, productNeedCount),
    Math.max(0, supplementSelectedCount),
  );
  const productSelectedText = localizedCountText(products.length, locale, true);
  const coveredProductNeedText = localizedCountText(
    coveredProductNeedCount,
    locale,
    true,
  );
  const supplementSelectedTextLower = localizedCountText(
    supplementSelectedCount,
    locale,
  );
  const productsTitle = productMatchingPending
    ? copy.productsPendingTitle
    : formatTemplate(
        coveredProductNeedCount >= supplementSelectedCount
          ? copy.productsAllTitleTemplate
          : copy.productsPartialTitleTemplate,
        {
          coveredProductNeedText,
          productSelectedText,
          supplementSelectedText: localizedCountText(
            supplementSelectedCount,
            locale,
            true,
          ),
          supplementSelectedTextLower: localizedCountText(
            supplementSelectedCount,
            locale,
          ),
        },
      );

  async function requestProductStackPreference(
    preference: ProductStackPreference,
  ) {
    const existingOption = productOptionsById.get(preference);

    if (existingOption) {
      onProductStackPreferenceChange(preference);
      replaceRevealStackUrl(locale, planId, preference);

      if (existingOption.recommendations.length < 1) {
        onProductStackPollingStart(preference);
      }

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
        onProductStackPreferenceChange(preference);
        onProductStackPollingStart(preference);
        replaceRevealStackUrl(locale, planId, preference);
        void onProductStackRefresh();
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
    <section
      className="mn-reveal-products border-t border-[var(--mn-line)] py-24"
      id="products"
    >
      <div className="mn-reveal-final-wrap">
        <div className="mx-auto max-w-[760px] text-center" data-reveal>
          <div className="mn-reveal-final-label justify-center">
            <span className="mn-reveal-final-label-number">04</span>
            {copy.productsEyebrow}
          </div>
          <h2 className="mn-reveal-final-heading mx-auto mt-4 max-w-[760px] text-[clamp(34px,4.2vw,54px)]">
            {renderProductsTitle({
              allCovered: coveredProductNeedCount >= supplementSelectedCount,
              coveredText: coveredProductNeedText,
              locale,
              pending: productMatchingPending,
              productSelectedText,
              selectedTextLower: supplementSelectedTextLower,
              title: productsTitle,
            })}
          </h2>
          <p className="mx-auto mt-4 max-w-[580px] text-[15px] leading-[1.7] text-[var(--mn-ink-soft)]">
            {productMatchingPending
              ? copy.productsPending
              : revealSlotCopy(result, "productsLead", locale, copy.productsLead)}
          </p>
        </div>

        <div className="mn-reveal-concierge-banner mx-auto my-10 grid max-w-[880px] grid-cols-[auto_minmax(0,1fr)] items-center gap-5 rounded-2xl bg-[var(--mn-teal-deep)] px-7 py-6 text-[var(--mn-cream)]" data-reveal>
          <div className="grid size-12 shrink-0 place-items-center rounded-full bg-white/10 text-[var(--mn-gold-soft)]">
            <Check aria-hidden={true} className="size-5" />
          </div>
          <div>
            <h3 className="mn-reveal-font-display text-lg font-medium italic leading-tight text-[var(--mn-gold-soft)]">
              {finalCopy.pharmacyTitle}
            </h3>
            <p className="mt-1 text-[13px] leading-[1.6] text-[var(--mn-cream)]/82">
              {finalCopy.pharmacyBody}{" "}
              <strong className="font-semibold text-[var(--mn-cream)]">
                {selectedRetailerDispatchNote}
              </strong>
            </p>
          </div>
        </div>

        {controlPreferences.length > 1 ? (
          <div className="basket-tabs-wrap my-10 flex items-center justify-center gap-3 text-center" data-reveal>
            <div className="inline-flex rounded-full border border-[var(--mn-line)] bg-[var(--mn-paper)] p-1">
              {controlPreferences.map((preference) => {
                const option = productOptionsById.get(preference);
                const available = Boolean(
                  option && option.recommendations.length > 0,
                );
                const pending =
                  pendingStackPreference === preference ||
                  (productStackLoading &&
                    preference === selectedProductStackPreference);
                const selected = preference === selectedProductStackPreference;
                const label = pending
                  ? labels.preferenceUpdating
                  : preference === "compact"
                    ? labels.preferenceCompact
                    : labels.preferenceBalanced;

                return (
                  <button
                    aria-pressed={selected}
                    className={`rounded-full px-[22px] py-2.5 mn-reveal-font-mono text-[11px] font-semibold uppercase tracking-[0.16em] transition ${
                      selected
                        ? "bg-[var(--mn-teal-deep)] text-[var(--mn-gold-soft)]"
                        : "text-[var(--mn-ink-soft)] hover:bg-[var(--mn-mint)]"
                    } disabled:cursor-wait disabled:opacity-70`}
                    disabled={pending}
                    key={preference}
                    onClick={() => {
                      if (available) {
                        onProductStackPreferenceChange(preference);
                        replaceRevealStackUrl(locale, planId, preference);
                        return;
                      }

                      void requestProductStackPreference(preference);
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <span
              className="group relative grid size-5 cursor-help place-items-center rounded-full border border-[var(--mn-ash)] bg-[var(--mn-paper)] text-[11px] text-[var(--mn-ash)]"
              tabIndex={0}
            >
              i
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md bg-[var(--mn-ink)] px-3 py-2 text-left text-[11px] normal-case leading-[1.5] tracking-normal text-[var(--mn-cream)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {finalCopy.compactInfo}
              </span>
            </span>
          </div>
        ) : null}

        {retailerOptions.length > 0 ? (
          <div className="mn-reveal-retailer-choices mx-auto mb-11 flex max-w-[860px] flex-col justify-center gap-3.5 sm:flex-row sm:flex-wrap" data-reveal>
            {retailerOptions.map((option) => {
              const selected =
                option.organisationId === selectedRetailerOrganisationId;
              const isBestValue =
                option.organisationId === bestValueRetailerOrganisationId;
              const isFastest =
                option.organisationId === fastestRetailerOrganisationId;
              const subtotal = optionSubtotal(option);
              const amountParts = subtotal !== null
                ? formatRevealAmountParts(locale, subtotal, option.currency || "THB")
                : null;
              const dispatchNote = retailerDispatchNote(finalCopy, option);
              return (
                <button
                  aria-pressed={selected}
                  className={`mn-reveal-pharmacy-card ${
                    selected
                      ? "mn-reveal-selected-pharmacy"
                      : "mn-reveal-alternate-pharmacy"
                  } w-full overflow-hidden rounded-xl border border-[var(--mn-line)] bg-[var(--mn-paper)] text-left text-[var(--mn-ink)] shadow-[var(--mn-shadow-soft)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mn-teal-light)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mn-cream)] sm:w-[360px]`}
                  key={option.organisationId ?? option.organisationName}
                  onClick={() => {
                    setRetailerSelection({
                      organisationId: option.organisationId ?? null,
                      optionsKey: retailerOptionsKey,
                    });
                  }}
                  type="button"
                >
                  <div
                    className={`px-6 py-6 ${
                      selected
                        ? "border-l-4 border-[var(--mn-teal-deep)]"
                        : "border-l-4 border-transparent"
                    }`}
                  >
                    <div className="mb-3.5 flex items-start justify-between gap-3">
                      <p className="mn-reveal-font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--mn-teal)]">
                        {selected
                          ? finalCopy.selectedPharmacy
                          : finalCopy.alternatePharmacy}
                      </p>

                      {isBestValue || isFastest ? (
                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                          {isBestValue ? (
                            <span className="rounded-full bg-[var(--mn-reveal-caution-bg)] px-2.5 py-1 mn-reveal-font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--mn-reveal-caution-ink)]">
                              {finalCopy.bestValue}
                            </span>
                          ) : null}
                          {isFastest ? (
                            <span className="rounded-full bg-[var(--mn-gold-soft)] px-2.5 py-1 mn-reveal-font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--mn-ink)]">
                              {finalCopy.fastest}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <h3 className="mb-2 mn-reveal-font-display text-2xl font-medium italic leading-[1.2] text-[var(--mn-ink)]">
                      {option.organisationName}
                    </h3>

                    <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-[var(--mn-line)] pt-3.5">
                      <p className="mn-reveal-font-mono text-[11px] leading-5 tracking-[0.04em] text-[var(--mn-ink-soft)]">
                        {dispatchNote}
                      </p>
                      {amountParts ? (
                        <p className="shrink-0 whitespace-nowrap mn-reveal-font-display text-lg font-medium italic leading-none text-[var(--mn-teal-deep)]">
                          <span className="mr-0.5 mn-reveal-font-mono text-[10px] not-italic tracking-[0.08em] text-[var(--mn-teal)]">
                            {amountParts.currencyText}
                          </span>
                          {amountParts.amountText}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {productMatchingPending ? (
          <div className="products-grid grid gap-6 sm:grid-cols-2 xl:grid-cols-3" data-reveal>
            {revealProductPendingCards[locale].map((card) => (
              <article
                className="product-card rounded-xl border border-[var(--mn-line)] bg-[var(--mn-paper)] p-6"
                key={card.title}
              >
                <p className="mn-reveal-font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--mn-teal-deep)]">
                  {copy.productsPendingBadge}
                </p>
                <h3 className="mt-3 mn-reveal-font-display text-2xl font-medium leading-tight text-[var(--mn-ink)]">
                  {card.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[var(--mn-ink-soft)]">
                  {card.body}
                </p>
              </article>
            ))}
          </div>
        ) : products.length < 1 ? (
          <div className="rounded-xl border border-[var(--mn-line)] bg-[var(--mn-paper)] p-8 text-center text-[var(--mn-ink-soft)]" data-reveal>
            {copy.productsEmpty}
          </div>
        ) : (
          <div className="products-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]" data-reveal>
            {products.map((product, index) => {
              const productId = product.productId ?? product.id;
              const selected = selectedBasketIds.has(productId);

              return (
                <article
                  className={`product-card relative flex min-h-full flex-col rounded-xl border px-5 py-6 transition ${
                    selected
                      ? "border-[var(--mn-line)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-soft)] hover:-translate-y-1 hover:shadow-[var(--mn-shadow-card)]"
                      : "border-[var(--mn-line)] bg-[var(--mn-paper)] opacity-70"
                  }`}
                  key={`${product.recommendationRunId ?? "product"}:${product.id}`}
                >
                  <span className="absolute left-5 top-4 z-10 mn-reveal-font-display text-[22px] italic leading-none text-[var(--mn-gold)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="absolute right-5 top-4 z-10 rounded-full bg-[var(--mn-mint-deep)] px-2.5 py-1 text-[10px] font-semibold tracking-[0.04em] text-[var(--mn-teal-deep)]">
                    {selected ? copy.productVerified : finalCopy.productRemoved}
                  </span>
                  <div className="mt-11 mb-5 flex h-[130px] w-[110px] self-center">
                    {product.imageUrl ? (
                      <Image
                        alt={product.name}
                        className="h-full w-full object-contain"
                        height={260}
                        loading="eager"
                        src={product.imageUrl}
                        unoptimized={
                          product.imageUrl.startsWith("http://") ||
                          product.imageUrl.startsWith("https://")
                        }
                        width={220}
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center rounded bg-[var(--mn-mint-deep)] px-2 text-center mn-reveal-font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--mn-teal-deep)]">
                        Product photo
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <p className="mn-reveal-font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--mn-ash)]">
                      {localizedMarketplaceName(product.marketplace, locale)}
                    </p>
                    <h3 className="mt-2 min-h-[60px] mn-reveal-font-display text-base font-medium leading-[1.25] text-[var(--mn-ink)]">
                      {product.name}
                    </h3>
                    <div className="mt-5 flex flex-wrap gap-1.5">
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
                    <p className="mt-5 flex-1 text-xs leading-[1.55] text-[var(--mn-ink-soft)]">
                      {localizedProductDescription({
                        copy,
                        locale,
                        product,
                        supplementLabelById,
                      })}
                    </p>
                    <button
                      className="product-remove-btn mt-6 w-fit rounded-full border border-[var(--mn-line)] bg-transparent px-3.5 py-1.5 mn-reveal-font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--mn-ink-soft)] transition hover:border-[var(--mn-reveal-caution-edge)] hover:bg-[var(--mn-reveal-caution-bg)] hover:text-[var(--mn-reveal-caution-ink)]"
                      onClick={() => {
                        updateSelectedBasketIds((current) => {
                          const next = new Set(current);
                          if (selected) {
                            next.delete(productId);
                          } else {
                            next.add(productId);
                          }
                          return next;
                        });
                      }}
                      type="button"
                    >
                      {selected ? finalCopy.remove : finalCopy.addBack}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="summary-card mt-9 rounded-2xl border border-[var(--mn-line)] bg-[var(--mn-paper)] px-8 py-8 text-[var(--mn-ink)]" data-reveal>
          <div className="mb-7 h-1.5 overflow-hidden rounded-full bg-[var(--mn-line)]/40">
            <div
              className="h-full rounded-full bg-linear-to-r from-[var(--mn-teal)] to-[var(--mn-teal-deep)] transition-[width] duration-1000"
              style={{
                width: `${Math.min(100, Math.max(0, selectedBasketCoverage))}%`,
              }}
            />
          </div>
          <div className="grid gap-6 md:grid-cols-[1.4fr_repeat(3,1fr)] md:items-center">
            <div>
              <h3 className="mn-reveal-font-display text-[22px] font-medium leading-[1.25]">
                {productMatchingPending
                  ? copy.productsPendingTitle
                  : formatTemplate(copy.coveragePartialHeadlineTemplate, {
                      coveredText: localizedCountText(coveredProductNeedCount, locale),
                      supplementSelectedText: localizedCountText(supplementSelectedCount, locale),
                    })}
              </h3>
              <p className="mt-2 text-xs leading-[1.5] text-[var(--mn-ink-soft)]">
                {copy.coverageSub}
              </p>
            </div>
            <div className="text-center">
              <p className="mn-reveal-font-display text-[32px] font-medium italic leading-none text-[var(--mn-teal-deep)]">
                <CountUpNumber active={true} value={selectedBasketProducts.length} />
              </p>
              <p className="mt-2 mn-reveal-font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mn-ash)]">
                {finalCopy.basketSelected}
              </p>
            </div>
            <div className="text-center">
              <p className="mn-reveal-font-display text-[32px] font-medium italic leading-none text-[var(--mn-teal-deep)]">
                <CountUpNumber active={true} value={coveredProductNeedCount} />
                /{Math.max(supplementSelectedCount, productNeedCount)}
              </p>
              <p className="mt-2 mn-reveal-font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mn-ash)]">
                {copy.prioritiesCovered}
              </p>
            </div>
            <div className="group relative text-center">
              <p className="mn-reveal-font-display text-[32px] font-medium italic leading-none text-[var(--mn-teal-deep)]">
                <CountUpNumber active={true} value={selectedBasketCoverage} />%
              </p>
              <p className="mt-2 inline-flex items-center gap-1 mn-reveal-font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mn-ash)]">
                {finalCopy.formulaMatch}
                <span className="grid size-3 place-items-center rounded-full border border-[var(--mn-ash)] text-[8px]">
                  i
                </span>
              </p>
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md bg-[var(--mn-ink)] px-3 py-2 text-left text-[11px] leading-[1.5] text-[var(--mn-cream)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                {finalCopy.formulaMatchTooltip}
              </span>
            </div>
          </div>
        </div>

        <div className="checkout-card mt-7 grid gap-7 rounded-2xl border border-[var(--mn-line)] bg-[var(--mn-paper)] px-8 py-7 md:grid-cols-[1fr_auto] md:items-center" data-reveal>
          <div>
            <div className="mn-reveal-font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--mn-ash)]">
              {finalCopy.subtotal}
            </div>
            <div className="mt-1 mn-reveal-font-display text-[clamp(34px,4vw,52px)] font-normal italic text-[var(--mn-teal-deep)]">
              {basketAmountText}
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--mn-ink-soft)]">
              {selectedRetailerDispatchNote}
            </p>
          </div>
          {selectedBasketIdList.length > 0 ? (
            <Link className="mn-reveal-final-button" href={basketCheckoutHref}>
              {finalCopy.checkout}
            </Link>
          ) : (
            <button
              aria-disabled="true"
              className="mn-reveal-final-button"
              disabled={true}
              type="button"
            >
              {finalCopy.basketEmpty}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function KhunDreamSection({
  finalCopy,
}: Readonly<{
  finalCopy: typeof revealFinalCopy.en;
}>) {
  return (
    <section className="ink-section mn-reveal-pharmacist border-t border-[#123857] py-20">
      <div className="mn-reveal-final-wrap">
        <div className="grid gap-12 md:grid-cols-[280px_1fr] md:items-center" data-reveal>
          <div className="pharmacist-portrait relative mx-auto size-[220px] shrink-0 overflow-hidden rounded-full border-[3px] border-[var(--mn-gold-soft)] bg-[#cbb8e4] shadow-[var(--mn-shadow-card)] md:size-[280px]">
            <Image
              alt={finalCopy.khunAlt}
              className="object-cover"
              fill={true}
              loading="eager"
              sizes="(min-width: 768px) 280px, 220px"
              src="/reveal/khun_dream.webp"
              unoptimized={true}
            />
            <div
              aria-hidden={true}
              className="absolute inset-0 rounded-full ring-1 ring-[var(--mn-cream)]/20"
            />
          </div>
          <div className="text-center md:text-left">
            <div className="mn-reveal-final-label mn-reveal-final-label--rule-start justify-center text-[var(--mn-gold-soft)] md:justify-start">
              {finalCopy.khunEyebrow}
            </div>
            <blockquote className="mx-auto mt-6 max-w-3xl mn-reveal-font-display text-[clamp(22px,2.6vw,32px)] font-light italic leading-[1.35] text-[var(--mn-cream)] md:mx-0">
              &ldquo;{finalCopy.khunQuote}&rdquo;
            </blockquote>
            <div className="mt-7">
              <div className="mn-reveal-font-display text-[22px] font-medium italic leading-tight text-[var(--mn-gold-soft)]">
                {finalCopy.khunName}
              </div>
              <div className="mt-1 mn-reveal-font-mono text-[11px] uppercase text-[var(--mn-cream)]/65">
                {finalCopy.khunRole}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-3 md:justify-start">
              {[finalCopy.khunCredentialOne, finalCopy.khunCredentialTwo, finalCopy.khunCredentialThree].map((credential) => (
                <span
                  className="rounded-full border border-[var(--mn-cream)]/20 px-3.5 py-1.5 mn-reveal-font-mono text-[11px] text-[var(--mn-cream)]/75"
                  key={credential}
                >
                  {credential}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevealFoodSupportFinalSection({
  copy,
  finalCopy,
  locale,
  result,
  selectedNeedCoverage,
  selectedProductStackPreference,
}: Readonly<{
  copy: typeof revealCopy.en;
  finalCopy: typeof revealFinalCopy.en;
  locale: Locale;
  result: FormulationResult;
  selectedNeedCoverage: readonly ProductNeedCoverage[];
  selectedProductStackPreference?: ProductStackPreference | null;
}>) {
  const { items: selectedFoodItems } = selectedFoodSupport(
    result,
    selectedNeedCoverage,
    selectedProductStackPreference,
  );
  const visibleIngredients = visibleFormulaIngredients(
    result.supplementBreakdown,
  );
  const items = selectedFoodItems.filter(
    (item) =>
      foodSupportFormulaRequirementsForItem(
        item,
        selectedNeedCoverage,
        visibleIngredients,
        locale,
      ).length > 0,
  );
  const headline = items.length < 1
    ? finalCopy.foodEmptyTitle
    : copy.foodSupportDefaultHeadline;
  const body = items.length < 1
    ? finalCopy.foodEmptyBody
    : copy.foodSupportDefaultBody;
  const foodCards: Array<{
    dailyDose: string;
    foods: Array<{
      imageAlt: string;
      imagePath?: string | null;
      name: string;
      note: string;
    }>;
    id: string;
    label: string;
    rowNumber?: number;
  }> = [];

  for (const item of items) {
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
    const formulaRequirements = foodSupportFormulaRequirementsForItem(
      item,
      selectedNeedCoverage,
      visibleIngredients,
      locale,
    ).slice(0, 3);
    const primaryRequirement = formulaRequirements[0];
    const serving =
      getLocalizedText(item.serving, locale) ||
      (seed ? managedFoodServing[seed.normalizedName]?.[locale] : "") ||
      "";
    const frequency =
      getLocalizedText(item.frequency, locale) ||
      (seed ? managedFoodFrequency[seed.normalizedName]?.[locale] : "") ||
      "";
    const note =
      [serving, frequency].filter(Boolean).join(" · ") ||
      safeFoodSupportCopy(
        item.rationale,
        locale,
        locale === "th"
          ? `${name} ช่วยเสริมจากอาหารสำหรับ${joinFoodSupportFormulaRequirementLabels(
              formulaRequirements,
              "th",
            )}`
          : locale === "zh-CN"
            ? `${name} 可通过食物层面支持 ${joinFoodSupportFormulaRequirementLabels(
                formulaRequirements,
                "zh-CN",
              )}`
            : `${name} gives food-level support around ${joinFoodSupportFormulaRequirementLabels(
                formulaRequirements,
                "en",
              )}.`,
      );
    const cardId = primaryRequirement?.id ?? item.foodId;
    const existing = foodCards.find((card) => card.id === cardId);
    const food = {
      imageAlt,
      imagePath: item.imagePath,
      name,
      note,
    };

    if (existing) {
      existing.foods.push(food);
      continue;
    }

    foodCards.push({
      dailyDose: primaryRequirement?.dailyDose ?? "",
      foods: [food],
      id: cardId,
      label: primaryRequirement?.label ?? name,
      rowNumber: primaryRequirement?.rowNumber ?? undefined,
    });
  }

  return (
    <section className="mn-reveal-food border-t border-[var(--mn-line)] bg-[var(--mn-cream-deep)] py-24">
      <div className="mn-reveal-final-wrap">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end" data-reveal>
          <div>
            <div className="mn-reveal-final-label">
              <span className="mn-reveal-final-label-number">05</span>
              {copy.foodSupportEyebrow}
            </div>
            <h2 className="mn-reveal-final-heading mt-4 text-[clamp(34px,4vw,52px)]">
              {headline}
            </h2>
          </div>
          <p className="max-w-[560px] text-base leading-[1.7] text-[var(--mn-ink-soft)]">
            {body}
          </p>
        </div>

        {foodCards.length > 0 ? (
          <>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]" data-reveal>
              {foodCards.map((card) => (
                <article
                  className="mn-reveal-foodgap-card foodgap-card"
                  key={`${selectedProductStackPreference ?? "food"}:${card.id}`}
                >
                  <div className="mn-reveal-foodgap-card__header">
                    <div className="mn-reveal-foodgap-card__icon">
                      {card.label.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="mn-reveal-font-display text-lg font-medium leading-[1.2] text-[var(--mn-ink)]">
                        {card.label}
                      </h3>
                      <div className="mt-1 mn-reveal-font-mono text-[10px] uppercase text-[var(--mn-teal-deep)]">
                        {card.rowNumber
                          ? `${copy.foodSupportFormulaGapLabel} ${String(card.rowNumber).padStart(2, "0")}`
                          : copy.foodSupportFormulaGapLabel}
                      </div>
                      {card.dailyDose ? (
                        <div className="mt-1 text-xs text-[var(--mn-ash)]">
                          {card.dailyDose}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-5 flex flex-col gap-3">
                    {card.foods.slice(0, 4).map((food) => (
                      <div
                        className="flex items-center gap-3 text-[13px] leading-[1.5] text-[var(--mn-ink-soft)]"
                        key={`${card.id}:${food.name}`}
                      >
                        <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-[var(--mn-mint-deep)]">
                          {food.imagePath ? (
                            <Image
                              alt={food.imageAlt}
                              className="object-cover"
                              fill={true}
                              loading="eager"
                              sizes="28px"
                              src={food.imagePath}
                              unoptimized={food.imagePath.startsWith("/")}
                            />
                          ) : (
                            <span className="grid h-full place-items-center mn-reveal-font-display text-sm italic text-[var(--mn-teal-deep)]">
                              {food.name.slice(0, 1)}
                            </span>
                          )}
                        </span>
                        <span>
                          <strong className="font-semibold text-[var(--mn-ink)]">
                            {food.name}
                          </strong>
                          {food.note ? ` - ${food.note}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <p className="mn-reveal-food-note mt-8 rounded-r-lg border-l-[3px] border-[var(--mn-gold)] bg-[var(--mn-paper)] px-5 py-4 text-[13px] leading-[1.7] text-[var(--mn-ink-soft)]" data-reveal>
              <strong className="font-semibold text-[var(--mn-ink)]">
                {finalCopy.foodCoverageTitle}.
              </strong>{" "}
              {finalCopy.foodNote}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

function RevealPanyaFinalSection({
  finalCopy,
  locale,
  planId,
  result,
}: Readonly<{
  finalCopy: typeof revealFinalCopy.en;
  locale: Locale;
  planId: string;
  result: FormulationResult;
}>) {
  const panyaLineMode = panyaLineModeForPlan(result.assessmentSummary.plan);
  const isLivingProtocol = panyaLineMode === "living_protocol";
  const heading = isLivingProtocol
    ? finalCopy.panyaLivingHeading
    : finalCopy.panyaPlanHeading;
  const body = isLivingProtocol
    ? finalCopy.panyaLivingBody
    : finalCopy.panyaPlanBody;
  const [connect, setConnect] = useState<PanyaLineConnectState>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState("");
  const connectRequestStartedRef = useRef(false);
  const qrUrl = useMemo(
    () =>
      connect?.lineUrl
        ? `/api/qr?data=${encodeURIComponent(connect.lineUrl)}`
        : "",
    [connect?.lineUrl],
  );

  useEffect(() => {
    connectRequestStartedRef.current = false;
    const timeout = window.setTimeout(() => {
      setConnect(null);
      setConnectError("");
      postRevealPanyaLineBpm({
        eventName: "customer_line_cta_viewed",
        locale,
        planId,
      });
      void createConnectCode(false, true);
    }, 0);

    return () => window.clearTimeout(timeout);
    // createConnectCode intentionally reads the latest state; the view event should fire once per plan/locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, planId]);

  async function createConnectCode(trackClick = true, ignoreExisting = false) {
    setConnectError("");

    if (trackClick) {
      postRevealPanyaLineBpm({
        eventName: "customer_line_cta_clicked",
        locale,
        planId,
      });
    }

    if (
      connectRequestStartedRef.current ||
      (!ignoreExisting && connect) ||
      connectLoading
    ) {
      return;
    }

    connectRequestStartedRef.current = true;
    setConnectLoading(true);

    try {
      const response = await fetch(
        `/api/assessment/${encodeURIComponent(planId)}/line-connect`,
        {
          body: JSON.stringify({
            source: "reveal_panya_support",
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.command || !payload?.lineUrl) {
        throw new Error("LINE connect failed");
      }

      setConnect({
        code: String(payload.code ?? ""),
        command: String(payload.command),
        expiresAt: String(payload.expiresAt ?? ""),
        lineUrl: String(payload.lineUrl),
      });
    } catch {
      connectRequestStartedRef.current = false;
      setConnectError(finalCopy.panyaError);
    } finally {
      setConnectLoading(false);
    }
  }

  return (
    <section
      className="mn-reveal-panya border-t border-[var(--mn-line)] py-16 md:py-20"
      data-reveal
      id="panya-support"
    >
      <div className="mn-reveal-final-wrap">
        <div className="mn-reveal-panya-card grid gap-10 rounded-[28px] border border-[var(--mn-line)] bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-soft)] md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] md:items-center md:p-12 lg:gap-[52px]">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--mn-line)] bg-white p-1 shadow-[0_6px_16px_-8px_rgb(22_48_57_/_0.28)]">
                <Image
                  alt=""
                  aria-hidden={true}
                  className="size-full object-contain"
                  height={465}
                  src="/v11/brand-mark.png"
                  unoptimized={true}
                  width={420}
                />
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-xs font-semibold uppercase text-[var(--mn-teal-deep)]">
                  {finalCopy.panyaSection}
                </span>
                <span className="mt-1 text-xs text-[var(--mn-ash)]">
                  {finalCopy.panyaByline}
                </span>
              </span>
            </div>
            <h2 className="mt-6 font-serif text-[clamp(34px,4.4vw,52px)] font-medium leading-[1.04] text-[var(--mn-ink)]">
              {heading}
            </h2>
            <p className="mt-6 max-w-[46ch] text-base leading-8 text-[var(--mn-ink-soft)]">
              {finalCopy.panyaWisdomBody}
            </p>
            <p className="mt-5 max-w-[46ch] text-base font-semibold leading-8 text-[var(--mn-ink-soft)]">
              {body}
            </p>
          </div>
          <div className="mn-reveal-panya-connect rounded-[22px] border border-[var(--mn-line)] bg-white p-5 shadow-[var(--mn-shadow-soft)] sm:p-6">
            <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <a
                aria-label={finalCopy.panyaQrAlt}
                className={`mx-auto grid size-48 place-items-center rounded-2xl bg-white p-3 ring-1 ring-[var(--mn-line)] ${
                  connect?.lineUrl ? "" : "pointer-events-none"
                }`}
                href={connect?.lineUrl ?? "#"}
                rel="noreferrer"
                target="_blank"
              >
                {qrUrl ? (
                  <Image
                    alt={finalCopy.panyaQrAlt}
                    className="size-40"
                    height={160}
                    src={qrUrl}
                    unoptimized={true}
                    width={160}
                  />
                ) : (
                  <span className="px-3 text-center text-xs leading-5 text-[var(--mn-ash)]">
                    {connectLoading ? finalCopy.panyaLoading : finalCopy.panyaQrPlaceholder}
                  </span>
                )}
              </a>
              <div className="flex min-w-0 flex-col">
                <p className="text-sm leading-6 text-[var(--mn-ink-soft)]">
                  {finalCopy.panyaButtonLead}
                </p>
                <div className="mt-4 rounded-[14px] border border-[var(--mn-line)] bg-[var(--mn-cream)] px-4 py-3">
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-[var(--mn-ink-soft)]">
                      MN
                    </span>
                    <span className="mn-reveal-font-mono text-xl font-semibold text-[var(--mn-ink)]">
                      {connect?.code ?? (connectLoading ? finalCopy.panyaLoading : "")}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--mn-ash)]">
                    {connect ? finalCopy.panyaExpires : finalCopy.panyaQrPlaceholder}
                  </p>
                </div>
                {connectError ? (
                  <p className="mt-3 text-sm font-semibold text-[var(--mn-error)]">
                    {connectError}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {connect?.lineUrl ? (
                    <a
                      className="inline-flex items-center gap-2 rounded-full bg-[#06C755] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_-8px_rgb(6_199_85_/_0.6)] hover:bg-[#05B34D]"
                      href={connect.lineUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {finalCopy.panyaOpenLine}
                      <ExternalLink aria-hidden className="size-4" />
                    </a>
                  ) : (
                    <button
                      className="inline-flex items-center gap-2 rounded-full bg-[#06C755] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_-8px_rgb(6_199_85_/_0.6)] transition hover:bg-[#05B34D] disabled:opacity-60"
                      disabled={connectLoading}
                      onClick={() => {
                        void createConnectCode();
                      }}
                      type="button"
                    >
                      <MessageCircle aria-hidden className="size-4" />
                      {connectLoading ? finalCopy.panyaLoading : finalCopy.panyaCreateCode}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevealSafetyFinalSection({
  copy,
  labels,
  locale,
  result,
}: Readonly<{
  copy: typeof revealCopy.en;
  labels: PanelLabels;
  locale: Locale;
  result: FormulationResult;
}>) {
  const cautions = [
    ...(result.cautions ?? []).map((caution) => ({
      body: getLocalizedText(caution.body, locale) || copy.wellnessOnly,
      title: caution.title ? getLocalizedText(caution.title, locale) : "",
    })),
    ...result.supplementBreakdown.flatMap((ingredient) =>
      (ingredient.cautions ?? []).map((caution) => ({
        body: getLocalizedText(caution.body, locale) || copy.wellnessOnly,
        title: caution.title
          ? getLocalizedText(caution.title, locale)
          : localizedSupplementName(
              ingredient.supplement,
              ingredient.id,
              locale,
            ),
      })),
    ),
  ].filter((caution) => caution.body);
  const hasStatinContext = result.assessmentSummary.constraints.some(
    (constraint) => /statin|สแตติน/i.test(constraint),
  );
  const safetyHeadline = hasStatinContext
    ? copy.statinCautionsTitle
    : copy.cautionsTitle;
  const safetyBody = revealSlotCopy(
    result,
    "safetyBody",
    locale,
    copy.wellnessOnly,
  );

  return (
    <section className="ink-section mn-reveal-safety border-t border-[#123857] py-24">
      <div className="mn-reveal-final-wrap max-w-[880px]">
        <div data-reveal>
          <div className="mn-reveal-final-label text-[var(--mn-gold-soft)]">
            <span className="mn-reveal-final-label-number">06</span>
            {labels.safety}
          </div>
          <h2 className="mt-5 mn-reveal-font-display text-[clamp(32px,4vw,48px)] font-normal italic leading-[1.1] text-[var(--mn-gold-soft)]">
            {safetyHeadline}
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-[1.7] text-[var(--mn-cream)]/70">
            {safetyBody}
          </p>
        </div>
        <div className="mt-9 space-y-4" data-reveal>
          {(cautions.length > 0
            ? cautions
            : labels.safetyNotes.map((note, index) => ({
                body: note,
                title:
                  index === 0
                    ? labels.safety
                    : `${labels.safety} ${index + 1}`,
              }))
          ).map((caution, index) => (
            <div
              className="rounded-xl border border-[var(--mn-cream)]/15 border-l-[3px] border-l-[var(--mn-gold-soft)] bg-white/[0.06] px-8 py-6"
              key={`${caution.title}:${index}`}
            >
              <h3 className="flex items-center gap-3 mn-reveal-font-mono text-[11px] uppercase text-[var(--mn-gold-soft)]">
                <span className="size-2 rounded-full bg-[var(--mn-gold-soft)]" />
                {caution.title || labels.safety}
              </h3>
              <p className="mt-3 text-sm leading-[1.7] text-[var(--mn-cream)]/90">
                {caution.body}
              </p>
            </div>
          ))}
          <p className="mt-9 border-t border-[var(--mn-cream)]/15 pt-7 text-[13px] italic leading-[1.7] text-[var(--mn-cream)]/55">
            {copy.wellnessOnly}
          </p>
        </div>
      </div>
    </section>
  );
}

function RevealClosingFinalSection({
  copy,
  finalCopy,
  locale,
  planId,
  result,
}: Readonly<{
  copy: typeof revealCopy.en;
  finalCopy: typeof revealFinalCopy.en;
  locale: Locale;
  planId: string;
  result: FormulationResult;
}>) {
  const closingTitle = revealSlotCopy(
    result,
    "closingTitle",
    locale,
    copy.closingTitle,
  );
  const closingBody = revealSlotCopy(
    result,
    "closingBody",
    locale,
    copy.closingBody,
  );

  return (
    <section className="ink-section mn-reveal-closing border-t border-[#123857] py-24">
      <div className="mn-reveal-final-wrap text-center">
        <div className="mx-auto max-w-[720px]" data-reveal>
          <p className="mn-reveal-font-display text-[clamp(48px,7vw,88px)] font-light italic leading-[1.05] text-[var(--mn-gold-soft)]">
            Mattaññutā
          </p>
          <p className="mt-3 mn-reveal-font-mono text-[11px] uppercase text-[var(--mn-cream)]/50">
            {copy.etymologyLine}
          </p>
          <h2 className="mx-auto mt-9 max-w-3xl mn-reveal-font-display text-[clamp(22px,2.6vw,30px)] font-normal leading-[1.4] text-[var(--mn-cream)]">
            {closingTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-[1.7] text-[var(--mn-cream)]/70">
            {closingBody}
          </p>
          <div className="closing-actions mt-14 flex flex-col justify-center gap-3.5 sm:flex-row">
            <button
              className="inline-flex items-center justify-center gap-2.5 rounded-full bg-[var(--mn-gold-soft)] px-7 py-4 text-sm font-semibold text-[var(--mn-teal-deep)] transition hover:-translate-y-0.5 hover:bg-[#f2ddaa]"
              onClick={() => window.print()}
              type="button"
            >
              <Printer aria-hidden={true} className="size-4" />
              {copy.print}
            </button>
            <Link
              className="inline-flex items-center justify-center rounded-full border border-[var(--mn-cream)]/30 px-7 py-4 text-sm font-semibold text-[var(--mn-cream)] transition hover:border-[var(--mn-gold-soft)] hover:text-[var(--mn-gold-soft)]"
              href={`/${locale}/nutrition/reveal?plan=${encodeURIComponent(planId)}`}
            >
              {copy.save}
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-full border border-[var(--mn-cream)]/30 px-7 py-4 text-sm font-semibold text-[var(--mn-cream)] transition hover:border-[var(--mn-gold-soft)] hover:text-[var(--mn-gold-soft)]"
              href={`/${locale}/nutrition/quiz`}
            >
              {copy.reassess}
            </Link>
          </div>
          <p className="mt-10 mn-reveal-font-mono text-[11px] uppercase text-[var(--mn-cream)]/45">
            {finalCopy.linePlan} {planId} · {finalCopy.lineGenerated} {result.generatedAt}
          </p>
        </div>
      </div>
    </section>
  );
}
