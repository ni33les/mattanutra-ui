"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { LandingReveal } from "@/components/landing-reveal";
import { formulationResultsCopy } from "@/components/formulation-results-copy";
import {
  NutritionGuidancePreparingPanel,
  RevealDistillationCard,
  defaultProductStackPreferenceForResult,
  planPaywallHref,
  productCoveredNeedCount,
  productRecommendationOptionsForResult,
  replaceRevealStackUrl,
  resultHasPendingProductRecommendations,
  resultHasProductStackRows,
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
  revealFoodSupportPendingCards,
  revealJoiners,
  revealProductPendingCards,
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

type PanyaLineConnectState = Readonly<{
  code: string;
  command: string;
  expiresAt: string;
  lineUrl: string;
}> | null;

const MAX_PRODUCT_MATCHING_POLLS = 240;
const PENDING_SECTION_POLL_INTERVAL_MS = 1_000;
const PENDING_PRODUCT_MATCHING_POLL_INTERVAL_MS = 1_000;

function formatRevealEta(locale: Locale, etaDate: string | null | undefined) {
  if (!etaDate) {
    return null;
  }

  const date = new Date(`${etaDate}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatted = new Intl.DateTimeFormat(localeHtmlLang(locale), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);

  if (locale === "th") {
    return `คาดว่า ${formatted}`;
  }

  if (locale === "zh-CN") {
    return `预计 ${formatted}`;
  }

  return `ETA ${formatted}`;
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

const panyaRevealSectionCopy = {
  en: {
    buttonLead:
      "Connect on LINE with a one-time code. Panya will recognise this plan when you start the chat.",
    copied: "Copied",
    copyCode: "Copy code",
    createCode: "Create LINE code",
    eyebrow: "Panya support",
    error: "Could not create a LINE code. Please try again.",
    expires: "Code expires soon",
    livingBody:
      "Your plan is not meant to sit still. Use LINE to keep the conversation going as sleep, stress, travel, food, or symptoms change.",
    livingHeading: "Ongoing nutrition support, connected to this plan.",
    loading: "Creating code...",
    openLine: "Open LINE",
    planBody:
      "Use LINE to ask about your formula, why each nutrient was selected, and how to move from this plan into your daily routine.",
    planHeading: "Talk through your nutrition plan with Panya.",
    qrAlt: "MattaNutra LINE QR code",
    qrPlaceholder: "Create a code to show your LINE QR.",
  },
  th: {
    buttonLead:
      "เชื่อมต่อผ่าน LINE ด้วยรหัสครั้งเดียว Panya จะรู้ว่าแชทนี้เกี่ยวข้องกับแผนนี้",
    copied: "คัดลอกแล้ว",
    copyCode: "คัดลอกรหัส",
    createCode: "สร้างรหัส LINE",
    eyebrow: "Panya support",
    error: "ไม่สามารถสร้างรหัส LINE ได้ โปรดลองอีกครั้ง",
    expires: "รหัสจะหมดอายุเร็ว ๆ นี้",
    livingBody:
      "แผนของคุณไม่ควรหยุดนิ่ง ใช้ LINE เพื่อคุยต่อเมื่อการนอน ความเครียด การเดินทาง อาหาร หรืออาการเปลี่ยนไป",
    livingHeading: "การดูแลโภชนาการต่อเนื่อง ที่เชื่อมกับแผนนี้",
    loading: "กำลังสร้างรหัส...",
    openLine: "เปิด LINE",
    planBody:
      "ใช้ LINE เพื่อถามเรื่องสูตรของคุณ เหตุผลที่เลือกสารอาหารแต่ละตัว และวิธีนำแผนนี้ไปใช้ในชีวิตประจำวัน",
    planHeading: "คุยเรื่องแผนโภชนาการของคุณกับ Panya",
    qrAlt: "คิวอาร์โค้ด LINE ของ MattaNutra",
    qrPlaceholder: "สร้างรหัสเพื่อแสดงคิวอาร์ LINE ของคุณ",
  },
  "zh-CN": {
    buttonLead:
      "使用一次性代码在 LINE 上连接。开始聊天后，Panya 会识别这份方案。",
    copied: "已复制",
    copyCode: "复制代码",
    createCode: "创建 LINE 代码",
    eyebrow: "Panya 支持",
    error: "无法创建 LINE 代码，请重试。",
    expires: "代码即将过期",
    livingBody:
      "你的方案不应该停在页面上。当睡眠、压力、旅行、饮食或症状变化时，可通过 LINE 持续沟通。",
    livingHeading: "与这份方案相连的持续营养支持。",
    loading: "正在创建代码...",
    openLine: "打开 LINE",
    planBody:
      "通过 LINE 询问你的配方、每种营养素被选择的原因，以及如何把这份方案融入日常生活。",
    planHeading: "和 Panya 一起讨论你的营养方案。",
    qrAlt: "MattaNutra LINE 二维码",
    qrPlaceholder: "创建代码后显示你的 LINE 二维码。",
  },
} satisfies Record<Locale, {
  buttonLead: string;
  copied: string;
  copyCode: string;
  createCode: string;
  eyebrow: string;
  error: string;
  expires: string;
  livingBody: string;
  livingHeading: string;
  loading: string;
  openLine: string;
  planBody: string;
  planHeading: string;
  qrAlt: string;
  qrPlaceholder: string;
}>;

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

type RevealRetailerOption = NonNullable<
  ProductRecommendationOption["retailerOptions"]
>[number];

function optionSubtotal(option: RevealRetailerOption) {
  const subtotal = Number(option.subtotalAmount);

  return Number.isFinite(subtotal) ? subtotal : null;
}

function optionEtaTime(option: RevealRetailerOption) {
  if (!option.etaDate) {
    return Number.POSITIVE_INFINITY;
  }

  const time = new Date(`${option.etaDate}T00:00:00.000Z`).getTime();

  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
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

  const startProductStackPolling = useCallback(
    (preference: ProductStackPreference) => {
      productPollAttemptsRef.current = 0;
      setProductPollingPreference(preference);
    },
    [],
  );

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
            resultHasPendingProductRecommendations(payload) ||
            Boolean(
              productPollingPreference &&
                !resultHasProductStackRows(payload, productPollingPreference),
            );
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
          } else if (productPollingPreference) {
            setProductPollingPreference(null);
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
  }, [effectivePlanId, locale, productPollingPreference]);

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
  const sectionStatuses = result.sectionStatuses ?? {
    foods: (result.foodGuidance ?? []).length > 0 ? "ready" : "pending",
    supplements: orderedIngredients.length > 0 ? "ready" : "pending",
  };
  const nutritionPending = sectionStatuses.supplements !== "ready";
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
    <RevealResultsPage
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

function RevealResultsPage({
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
}: Readonly<{
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
        productCoveragePending={productCoveragePending}
        result={result}
      />

      <RevealProductsSection
        copy={copy}
        locale={locale}
        onProductStackPreferenceChange={onProductStackPreferenceChange}
        onProductStackPollingStart={onProductStackPollingStart}
        onProductStackRefresh={onProductStackRefresh}
        planId={planId}
        productNeedCount={productNeedCount}
        productOptions={productOptions}
        productStackLoading={productStackLoading}
        products={products}
        result={result}
        selectedCoverage={selectedCoverage}
        selectedProductStackPreference={selectedProductStackPreference}
        supplementLabelById={supplementLabelById}
      />

      <RevealPanyaLineSupportSection
        locale={locale}
        planId={planId}
        result={result}
      />

      <RevealFoodSupportSection
        copy={copy}
        locale={locale}
        productCoveragePending={productCoveragePending}
        result={result}
        selectedNeedCoverage={
          productCoveragePending
            ? []
            : activeProductRecommendations?.needCoverage ?? []
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
  productCoveragePending,
  result,
}: Readonly<{
  catalogueSupplementCount: number;
  copy: typeof revealCopy.en;
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
              {productCoveragePending
                ? copy.formulaMetaProductFitPending
                : copy.formulaMetaNrv}
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
            <div className="text-right">
              {productCoveragePending ? copy.productsPendingBadge : copy.tableCoverage}
            </div>
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
                const coverage = productCoveragePending
                  ? null
                  : productCoverageBySupplementId.get(ingredient.id) ?? 0;
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
                      {coverage === null ? copy.productsPendingBadge : `${coverage}%`}
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
  onProductStackPollingStart,
  onProductStackRefresh,
  planId,
  productNeedCount,
  productOptions,
  productStackLoading,
  products,
  result,
  selectedCoverage,
  selectedProductStackPreference,
  supplementLabelById,
}: Readonly<{
  copy: typeof revealCopy.en;
  locale: Locale;
  onProductStackPreferenceChange: (preference: ProductStackPreference) => void;
  onProductStackPollingStart: (preference: ProductStackPreference) => void;
  onProductStackRefresh: () => Promise<boolean>;
  planId: string;
  productNeedCount: number;
  productOptions: ProductRecommendationOption[];
  productStackLoading: boolean;
  products: RecommendedProduct[];
  result: FormulationResult;
  selectedCoverage: number;
  selectedProductStackPreference?: ProductStackPreference | null;
  supplementLabelById: ReadonlyMap<string, string>;
}>) {
  const labels = productRecommendationCopy[locale];
  const pendingBadgeClass =
    locale === "en"
      ? "text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--mn-ash)]"
      : "text-[0.7rem] font-bold tracking-normal text-[var(--mn-ash)]";
  const [pendingStackPreference, setPendingStackPreference] =
    useState<ProductStackPreference | null>(null);
  const [retailerSelection, setRetailerSelection] = useState<{
    organisationId: string | null;
    optionsKey: string;
  }>({ organisationId: null, optionsKey: "" });
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
  const productMatchingPending =
    products.length < 1 &&
    (productStackLoading || resultHasPendingProductRecommendations(result));
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
  const productsTitle = productMatchingPending
    ? copy.productsPendingTitle
    : fallbackProductsTitle;
  const productsLead = productMatchingPending
    ? copy.productsPending
    : revealSlotCopy(result, "productsLead", locale, copy.productsLead);
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
  const basketAmountText = new Intl.NumberFormat(locale, {
    currency: selectedBasketCurrency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(selectedBasketSubtotal);
  const basketLabels =
    locale === "th"
      ? {
          addBack: "เพิ่มกลับ",
          checkout: "ชำระเงิน",
          empty: "เลือกสินค้าอย่างน้อยหนึ่งรายการเพื่อดำเนินการต่อ",
          removed: "นำออกแล้ว",
          remove: "นำออก",
          selected: "สินค้าในตะกร้า",
          subtotal: "ยอดรวม",
        }
      : locale === "zh-CN"
        ? {
            addBack: "加回",
            checkout: "结账",
            empty: "请至少选择一件产品继续",
            removed: "已移除",
            remove: "移除",
            selected: "购物篮商品",
            subtotal: "小计",
          }
        : {
            addBack: "Add back",
            checkout: "Checkout basket",
            empty: "Select at least one product to continue",
            removed: "Removed",
            remove: "Remove",
            selected: "Basket items",
            subtotal: "Subtotal",
          };

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
            {productMatchingPending ? (
              productsTitle
            ) : locale === "en" ? (
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
                const option = productOptionsById.get(preference);
                const available = Boolean(
                  option && option.recommendations.length > 0,
                );
                const pending =
                  pendingStackPreference === preference ||
                  (productStackLoading &&
                    preference === selectedProductStackPreference);
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

        {products.length < 1 && productMatchingPending ? (
          <div
            aria-live="polite"
            className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
            data-reveal
          >
            {revealProductPendingCards[locale].map((card, index) => (
              <article
                className="overflow-hidden rounded-[1.25rem] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]"
                key={card.title}
              >
                <div className="relative flex h-60 items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#fff,var(--mn-mint))]">
                  <span className="absolute left-4 top-4 z-10 font-serif text-3xl italic text-[var(--mn-gold)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="absolute right-4 top-4 z-10 rounded-full bg-white/85 px-3 py-1 text-[0.65rem] font-bold text-[var(--mn-teal-deep)] ring-1 ring-[var(--mn-line)]">
                    {copy.productsPendingBadge}
                  </span>
                  <div className="h-28 w-28 rounded-full bg-white/70 ring-1 ring-[var(--mn-line)] motion-safe:animate-pulse" />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className={pendingBadgeClass}>
                    {copy.productsPendingBadge}
                  </p>
                  <h3 className="mt-2 font-serif text-2xl font-medium leading-tight text-[var(--mn-ink)]">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--mn-ink-soft)]">
                    {card.body}
                  </p>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--mn-mint)]">
                    <div className="h-full w-1/2 rounded-full bg-[var(--mn-teal)] motion-safe:animate-pulse" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : products.length < 1 ? (
          <div className="mt-10 rounded-lg bg-[var(--mn-paper)] p-8 text-center ring-1 ring-[var(--mn-line)]">
            <p className="text-sm leading-6 text-[var(--mn-ink-soft)]">
              {copy.productsEmpty}
            </p>
          </div>
        ) : (
          <>
            {retailerOptions.length > 1 ? (
              <div
                className="mt-10 grid gap-3 rounded-xl bg-[var(--mn-paper)] p-4 ring-1 ring-[var(--mn-line)] md:grid-cols-3"
                data-reveal
              >
                {retailerOptions.map((option) => {
                  const subtotal = Number(option.subtotalAmount);
                  const currency = option.currency || "THB";
                  const selected =
                    option.organisationId === selectedRetailerOrganisationId;
                  const isBestValue =
                    option.organisationId === bestValueRetailerOrganisationId;
                  const isFastest =
                    option.organisationId === fastestRetailerOrganisationId;
                  const amountText = Number.isFinite(subtotal)
                    ? new Intl.NumberFormat(locale, {
                        currency,
                        maximumFractionDigits: 0,
                        style: "currency",
                      }).format(subtotal)
                    : null;
                  const etaText = formatRevealEta(locale, option.etaDate);

                  return (
                    <button
                      aria-pressed={selected}
                      className={`rounded-lg p-3 text-left ring-1 transition hover:-translate-y-0.5 hover:ring-[var(--mn-teal)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mn-teal)] motion-reduce:transition-none ${
                        selected
                          ? "bg-[var(--mn-mint)] ring-[var(--mn-teal)]"
                          : "bg-[var(--mn-cream)] ring-[var(--mn-line)]"
                      }`}
                      key={option.organisationId ?? option.organisationName}
                      onClick={() => {
                        setRetailerSelection({
                          organisationId: option.organisationId ?? null,
                          optionsKey: retailerOptionsKey,
                        });
                      }}
                      type="button"
                    >
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--mn-teal-deep)]">
                        {selected ? "Selected pharmacy" : "Alternative"}
                      </p>
                      {isBestValue || isFastest ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {isBestValue ? (
                            <span className="rounded-full bg-[var(--mn-teal)] px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-white">
                              Best Value
                            </span>
                          ) : null}
                          {isFastest ? (
                            <span className="rounded-full bg-[var(--mn-gold)] px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--mn-ink)]">
                              Fastest
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <p className="mt-1 font-serif text-xl font-medium leading-tight text-[var(--mn-ink)]">
                        {option.organisationName}
                      </p>
                      {amountText || etaText ? (
                        <p className="mt-2 text-xs leading-5 text-[var(--mn-ink-soft)]">
                          {[amountText, etaText].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div
              className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
              data-reveal
            >
              {products.map((product, index) => {
                const productId = product.productId ?? product.id;
                const selected = selectedBasketIds.has(productId);

                if (!selected) {
                  return (
                    <article
                      className="flex items-center gap-4 rounded-xl bg-[var(--mn-paper)] p-4 opacity-75 ring-1 ring-[var(--mn-line)]"
                      key={`${product.recommendationRunId ?? "product"}:${product.id}`}
                    >
                      {product.imageUrl ? (
                        <Image
                          alt={product.name}
                          className="size-16 rounded-lg object-contain"
                          height={64}
                          loading="eager"
                          unoptimized={true}
                          src={product.imageUrl}
                          width={64}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--mn-ash)]">
                          {basketLabels.removed}
                        </p>
                        <h3 className="mt-1 truncate font-serif text-lg font-medium text-[var(--mn-ink)]">
                          {product.name}
                        </h3>
                      </div>
                      <button
                        className="rounded-full bg-[var(--mn-mint)] px-3 py-1 text-xs font-bold text-[var(--mn-teal-deep)]"
                        onClick={() => {
                          updateSelectedBasketIds((current) => {
                            const next = new Set(current);
                            next.add(productId);
                            return next;
                          });
                        }}
                        type="button"
                      >
                        {basketLabels.addBack}
                      </button>
                    </article>
                  );
                }

                return (
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
                          alt={product.name}
                          className="relative z-[1] h-full w-full object-contain p-8 transition duration-500 group-hover:-translate-y-1 group-hover:scale-[1.03] motion-reduce:transition-none"
                          height={240}
                          loading="eager"
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
                      <button
                        className="mt-5 w-fit rounded-full border border-[var(--mn-line)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--mn-ash)] transition hover:border-[var(--mn-teal)] hover:text-[var(--mn-teal-deep)]"
                        onClick={() => {
                          updateSelectedBasketIds((current) => {
                            const next = new Set(current);
                            next.delete(productId);
                            return next;
                          });
                        }}
                        type="button"
                      >
                        {basketLabels.remove}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        <div
          className="mt-8 rounded-xl bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]"
          data-reveal
        >
          {productMatchingPending ? (
            <div
              aria-live="polite"
              className="grid gap-5 md:grid-cols-[1fr_1.2fr] md:items-center"
            >
              <div>
                <p className={pendingBadgeClass}>
                  {copy.productsPendingBadge}
                </p>
                <h3 className="mt-2 font-serif text-3xl font-medium leading-tight text-[var(--mn-ink)]">
                  {copy.productsPendingTitle}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--mn-ink-soft)]">
                  {copy.productsPending}
                </p>
              </div>
              <div>
                <div className="h-3 overflow-hidden rounded-full bg-[var(--mn-line)]">
                  <div className="h-full w-1/2 rounded-full bg-[var(--mn-teal)] motion-safe:animate-pulse" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {revealProductPendingCards[locale].map((card) => (
                    <div
                      className="rounded-lg bg-[var(--mn-cream)] p-3 ring-1 ring-[var(--mn-line)]"
                      key={`summary-${card.title}`}
                    >
                      <p className="font-serif text-lg font-medium leading-tight text-[var(--mn-teal-deep)]">
                        {card.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--mn-ash)]">
                        {card.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
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
                        value={selectedBasketProducts.length}
                      />
                    </p>
                    <p className="text-sm text-[var(--mn-ash)]">
                      {basketLabels.selected}
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
                        value={selectedBasketCoverage}
                      />
                      %
                    </p>
                    <p className="text-sm text-[var(--mn-ash)]">
                      {copy.compactCoverageLabel}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--mn-ash)]">
                      {basketLabels.subtotal}
                    </p>
                    <p className="mt-1 font-serif text-3xl font-medium text-[var(--mn-ink)]">
                      {basketAmountText}
                    </p>
                  </div>
                  {selectedBasketIdList.length > 0 ? (
                    <Link className="mn-primary-button w-fit" href={basketCheckoutHref}>
                      {basketLabels.checkout}
                    </Link>
                  ) : (
                    <button className="mn-primary-button w-fit opacity-50" disabled type="button">
                      {basketLabels.empty}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RevealPanyaLineSupportSection({
  locale,
  planId,
  result,
}: Readonly<{
  locale: Locale;
  planId: string;
  result: FormulationResult;
}>) {
  const panyaLineMode = panyaLineModeForPlan(result.assessmentSummary.plan);
  const labels = panyaRevealSectionCopy[locale];
  const isLivingProtocol = panyaLineMode === "living_protocol";
  const heading = isLivingProtocol ? labels.livingHeading : labels.planHeading;
  const body = isLivingProtocol ? labels.livingBody : labels.planBody;
  const [connect, setConnect] = useState<PanyaLineConnectState>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [copied, setCopied] = useState(false);
  const qrUrl = useMemo(
    () =>
      connect?.lineUrl
        ? `/api/qr?data=${encodeURIComponent(connect.lineUrl)}`
        : "",
    [connect?.lineUrl],
  );

  useEffect(() => {
    postRevealPanyaLineBpm({
      eventName: "customer_line_cta_viewed",
      locale,
      planId,
    });
  }, [locale, planId]);

  async function createConnectCode() {
    setConnectError("");
    postRevealPanyaLineBpm({
      eventName: "customer_line_cta_clicked",
      locale,
      planId,
    });

    if (connect || connectLoading) {
      return;
    }

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
      setConnectError(labels.error);
    } finally {
      setConnectLoading(false);
    }
  }

  async function copyConnectCode() {
    if (!connect?.command) {
      return;
    }

    await navigator.clipboard?.writeText(connect.command).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section
      className="border-t border-[var(--mn-line)] bg-[var(--mn-cream)] py-20"
      data-reveal
      id="panya-support"
    >
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div data-reveal>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              05 · {labels.eyebrow}
            </p>
            <h2
              className={`mt-4 font-serif text-4xl font-medium text-[var(--mn-ink)] sm:text-5xl ${
                locale === "th" || locale === "zh-CN"
                  ? "leading-[1.38] break-words [overflow-wrap:anywhere]"
                  : "leading-tight text-balance"
              }`}
            >
              {heading}
            </h2>
          </div>
          <div className="space-y-5" data-reveal>
            <p className="text-base leading-8 text-[var(--mn-ink-soft)]">
              {body}
            </p>
            <div className="rounded-xl bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]">
              <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
                <a
                  className={`grid size-40 place-items-center rounded-xl bg-white p-2 ring-1 ring-[var(--mn-line)] ${
                    connect?.lineUrl ? "" : "pointer-events-none"
                  }`}
                  href={connect?.lineUrl ?? "#"}
                  rel="noreferrer"
                  target="_blank"
                >
                  {qrUrl ? (
                    <img
                      alt={labels.qrAlt}
                      className="size-36"
                      height={144}
                      src={qrUrl}
                      width={144}
                    />
                  ) : (
                    <span className="px-3 text-center text-xs leading-5 text-[var(--mn-ash)]">
                      {connectLoading ? labels.loading : labels.qrPlaceholder}
                    </span>
                  )}
                </a>
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-[var(--mn-ink-soft)]">
                    {labels.buttonLead}
                  </p>
                  <div className="mt-3 rounded-xl bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]">
                    <p className="break-all font-mono text-lg font-bold text-[var(--mn-ink)]">
                      {connect?.command ?? (connectLoading ? labels.loading : "MN PLAN")}
                    </p>
                    <p className="mt-2 text-xs text-[var(--mn-ash)]">
                      {connect ? labels.expires : labels.qrPlaceholder}
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
                        className="inline-flex items-center gap-2 rounded-full bg-[#06C755] px-4 py-2 text-sm font-bold text-white hover:bg-[#05B34D]"
                        href={connect.lineUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {labels.openLine}
                        <ExternalLink aria-hidden className="size-4" />
                      </a>
                    ) : (
                      <button
                        className="inline-flex items-center gap-2 rounded-full bg-[#06C755] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#05B34D] disabled:opacity-60"
                        disabled={connectLoading}
                        onClick={createConnectCode}
                        type="button"
                      >
                        <MessageCircle aria-hidden className="size-4" />
                        {connectLoading ? labels.loading : labels.createCode}
                      </button>
                    )}
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--mn-line)] px-4 py-2 text-sm font-bold text-[var(--mn-ink)] hover:bg-[var(--mn-cream)] disabled:opacity-50"
                      disabled={!connect?.command}
                      onClick={copyConnectCode}
                      type="button"
                    >
                      {copied ? (
                        <Check aria-hidden className="size-4" />
                      ) : (
                        <Copy aria-hidden className="size-4" />
                      )}
                      {copied ? labels.copied : labels.copyCode}
                    </button>
                  </div>
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
  productCoveragePending,
  result,
  selectedNeedCoverage,
  selectedProductStackPreference,
}: Readonly<{
  copy: typeof revealCopy.en;
  locale: Locale;
  productCoveragePending: boolean;
  result: FormulationResult;
  selectedNeedCoverage: readonly ProductNeedCoverage[];
  selectedProductStackPreference?: ProductStackPreference | null;
}>) {
  const { items: selectedFoodItems, variant } = selectedFoodSupport(
    result,
    selectedNeedCoverage,
    selectedProductStackPreference,
  );
  const visibleIngredients = visibleFormulaIngredients(
    result.supplementBreakdown,
  );
  const fallbackGaps = foodSupportGaps(selectedNeedCoverage);
  const fallbackSupportableGaps = foodSupportableGaps(fallbackGaps);
  const items = productCoveragePending
    ? []
    : selectedFoodItems.filter(
        (item) =>
          foodSupportFormulaGapsForItem(
            item,
            selectedNeedCoverage,
            visibleIngredients,
            locale,
          ).length > 0,
      );
  const fallbackGapText = joinFoodSupportNeeds(
    fallbackSupportableGaps.length > 0 ? fallbackSupportableGaps : fallbackGaps,
    locale,
  );
  const variantHeadline = variant
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
  const variantBody = variant
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
  const headline = productCoveragePending
    ? copy.foodSupportPendingHeadline
    : items.length < 1
      ? copy.foodSupportNoGapsHeadline
      : variantHeadline;
  const body = productCoveragePending
    ? copy.foodSupportPendingBody
    : items.length < 1
      ? copy.foodSupportNoGapsBody
      : variantBody;

  return (
    <section className="border-t border-[var(--mn-line)] bg-[var(--mn-cream-deep)] py-20">
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div data-reveal>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              06 · {copy.foodSupportEyebrow}
            </p>
            <h2
              className={`mt-4 font-serif text-4xl font-medium text-[var(--mn-ink)] sm:text-5xl ${
                locale === "th" || locale === "zh-CN"
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

        {productCoveragePending ? (
          <div
            aria-live="polite"
            className="mt-10 overflow-hidden rounded-xl bg-[var(--mn-paper)] shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]"
            data-reveal
          >
            <div className="grid gap-0 md:grid-cols-[0.8fr_1.2fr]">
              <div className="bg-[var(--mn-cream)] p-6">
                <p
                  className={`text-xs font-bold text-[var(--mn-teal-deep)] ${
                    locale === "en" ? "uppercase tracking-[0.14em]" : ""
                  }`}
                >
                  {copy.productsPendingBadge}
                </p>
                <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/70">
                  <div className="h-full w-1/2 rounded-full bg-[var(--mn-teal)] motion-safe:animate-pulse" />
                </div>
              </div>
              <div className="grid gap-3 p-6 sm:grid-cols-3">
                {revealFoodSupportPendingCards[locale].map((card) => (
                  <div
                    className="rounded-lg bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]"
                    key={`food-support-${card.title}`}
                  >
                    <p className="font-serif text-lg font-medium leading-tight text-[var(--mn-ink)]">
                      {card.title}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[var(--mn-ink-soft)]">
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : items.length < 1 ? (
          <div
            className="mt-10 rounded-xl bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] sm:p-8"
            data-reveal
          >
            <p className="max-w-2xl text-sm leading-7 text-[var(--mn-ink-soft)]">
              {copy.foodSupportEmpty}
            </p>
          </div>
        ) : (
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
                (seed
                  ? managedFoodServing[seed.normalizedName]?.[locale]
                  : "") ||
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
                        loading="eager"
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
                    <p
                      className={`text-[0.65rem] font-bold text-[var(--mn-ash)] ${
                        locale === "en"
                          ? "mn-mono-label uppercase tracking-[0.16em]"
                          : "tracking-normal"
                      }`}
                    >
                      {category}
                    </p>
                    <h3
                      className={`mt-2 font-serif text-2xl font-medium text-[var(--mn-ink)] ${
                        locale === "th" || locale === "zh-CN"
                          ? "leading-9"
                          : "leading-tight"
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
                            locale === "en"
                              ? "uppercase tracking-[0.12em]"
                              : "tracking-normal"
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
                                    locale === "th" || locale === "zh-CN"
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
                        <p
                          className={`text-xs font-bold text-[var(--mn-ash)] ${
                            locale === "en"
                              ? "uppercase tracking-[0.12em]"
                              : "tracking-normal"
                          }`}
                        >
                          {copy.foodSupportServing}
                        </p>
                        <p className="mt-1 font-semibold text-[var(--mn-ink)]">
                          {serving}
                        </p>
                      </div>
                      <div>
                        <p
                          className={`text-xs font-bold text-[var(--mn-ash)] ${
                            locale === "en"
                              ? "uppercase tracking-[0.12em]"
                              : "tracking-normal"
                          }`}
                        >
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
        )}
      </div>
    </section>
  );
}

export { FinalReportPanel };
