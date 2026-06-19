import type {
  FormulationResult,
  LocalizedText,
  RecommendedProduct,
  RevealPageCopySlot
} from "@/lib/formulation-types";
import { revealPageCopyVersion } from "@/lib/formulation-types";
import { foodTagLabel } from "@/lib/food-tags";
import { publicLocales, resolveLocalizedText, type Locale } from "@/lib/i18n";
import {
  getNamespace,
  isMessageId,
  t,
  type MessageId
} from "@/lib/i18n-messages";

const thaiScriptPattern = /[\u0E00-\u0E7F]/;
const chineseScriptPattern = /[\u3400-\u9FFF]/;
const latinWordPattern = /[A-Za-z]{2,}/;
const englishCountWords = new Map<number, string>([
  [0, "no"],
  [1, "one"],
  [2, "two"],
  [3, "three"],
  [4, "four"],
  [5, "five"],
  [6, "six"],
  [7, "seven"],
  [8, "eight"],
  [9, "nine"],
  [10, "ten"],
  [11, "eleven"],
  [12, "twelve"],
  [13, "thirteen"],
  [14, "fourteen"],
  [15, "fifteen"],
  [16, "sixteen"],
  [17, "seventeen"],
  [18, "eighteen"],
  [19, "nineteen"],
  [20, "twenty"]
]);

const knownInlineTerms: Array<readonly [RegExp, string]> = [
  [/\bSingapore\b/g, "singapore"],
  [/\bThailand\b/g, "thailand"],
  [/\bCurcumin\b/g, "curcumin"],
  [/\bVitamin D3\b/g, "vitaminD3"],
  [/\bVitamin D\b/g, "vitaminD"],
  [/\bCoQ10\b/g, "coQ10"],
  [/\bMagnesium\b/g, "magnesium"],
  [/\bTheanine\b/g, "theanine"],
  [/\bMulti-strain probiotics\b/g, "multiStrainProbiotics"],
  [/\bprobiotics\b/gi, "probiotics"],
  [/\bprobiotic\b/gi, "probiotic"],
  [/\b10 billion CFU\b/gi, "10BillionCFU"]
];

function capitalizeText(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function catalogKey(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+([A-Za-z0-9])?/g, (_, next = "") =>
        String(next).toUpperCase()
      )
      .replace(/^[A-Z]/, (char) => char.toLowerCase()) || "value"
  );
}

function revealLabelId(group: string, value?: string) {
  return value
    ? `customer.revealLabels.${group}.${catalogKey(value)}` as MessageId
    : `customer.revealLabels.${group}` as MessageId;
}

function labelFromCatalog(
  locale: Locale,
  group: string,
  value: string,
  fallback: string
) {
  const id = revealLabelId(group, value);

  return isMessageId(id) ? t(locale, id) : fallback;
}

export function textMatchesLocale(text: string, locale: Locale) {
  if (!text.trim()) {
    return false;
  }

  if (locale === "th") {
    return thaiScriptPattern.test(text) || !latinWordPattern.test(text);
  }

  if (locale === "zh-CN") {
    return chineseScriptPattern.test(text) || !latinWordPattern.test(text);
  }

  return true;
}

export function getLocalizedText(value: LocalizedText, locale: Locale) {
  const text = resolveLocalizedText(value, locale).trim();

  return textMatchesLocale(text, locale) ? text : "";
}

export function localizeKnownInlineTerms(text: string, locale: Locale) {
  return knownInlineTerms.reduce(
    (next, [pattern, key]) =>
      next.replace(pattern, () =>
        t(locale, revealLabelId("knownInlineTerm", key))
      ),
    text
  );
}

export type RevealCopy = Record<string, string>;

export const revealCopy = Object.fromEntries(
  publicLocales.map((locale) => [
    locale,
    getNamespace<RevealCopy>(locale, "customer.revealCopy")
  ])
) as Record<Locale, RevealCopy>;

export const revealFinalCopy = Object.fromEntries(
  publicLocales.map((locale) => [
    locale,
    getNamespace<RevealCopy>(locale, "customer.revealFinalCopy")
  ])
) as Record<Locale, RevealCopy>;

export type RevealPendingCard = Readonly<{
  body: string;
  title: string;
}>;

export const revealProductPendingCards = Object.fromEntries(
  publicLocales.map((locale) => [
    locale,
    getNamespace<RevealPendingCard[]>(locale, "customer.revealProductPendingCards")
  ])
) as Record<Locale, RevealPendingCard[]>;

export const revealFoodSupportPendingCards = Object.fromEntries(
  publicLocales.map((locale) => [
    locale,
    getNamespace<RevealPendingCard[]>(locale, "customer.revealFoodSupportPendingCards")
  ])
) as Record<Locale, RevealPendingCard[]>;

export const revealJoiners = Object.fromEntries(
  publicLocales.map((locale) => [
    locale,
    t(locale, revealLabelId("joiner"))
  ])
) as Record<Locale, string>;

export function localizedCountText(value: number, locale: Locale, capitalize = false) {
  if (locale === "th" || locale === "zh-CN") {
    return String(value);
  }

  const word = englishCountWords.get(value) ?? String(value);

  return capitalize ? capitalizeText(word) : word;
}

export function localizedPlanText(value: unknown, locale: Locale, fallback: string) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const text = typeof record[locale] === "string" ? record[locale].trim() : "";

    if (text) {
      return text;
    }
  }

  if (typeof value === "string" && value.trim()) {
    const text = value.trim();

    if (
      locale === "th"
        ? thaiScriptPattern.test(text)
        : locale === "zh-CN"
          ? chineseScriptPattern.test(text)
          : !thaiScriptPattern.test(text) && !chineseScriptPattern.test(text)
    ) {
      return text;
    }
  }

  return fallback;
}

export function revealSlotCopy(
  result: FormulationResult,
  slot: RevealPageCopySlot,
  locale: Locale,
  fallback: string
) {
  const revealPageCopy = result.nutritionReport?.revealPageCopy;

  if (revealPageCopy?.version !== revealPageCopyVersion) {
    return fallback;
  }

  return localizedPlanText(revealPageCopy[slot], locale, fallback);
}

export function localizedBenefitTagLabel(value: string, locale: Locale) {
  return labelFromCatalog(
    locale,
    "benefitTag",
    value,
    foodTagLabel(value)
  );
}

export function localizedCategoryLabel(value: string, locale: Locale) {
  return labelFromCatalog(locale, "formulaCategory", value, value);
}

export function localizedContextChip(value: string, locale: Locale) {
  return value
    .split(" / ")
    .map((part) =>
      labelFromCatalog(
        locale,
        "contextChip",
        part,
        localizeKnownInlineTerms(part, locale)
      )
    )
    .join(" / ");
}

export function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

export function localizedCoverLabel(
  value: string,
  locale: Locale,
  supplementLabelById: ReadonlyMap<string, string>
) {
  const fallback = foodTagLabel(value.replaceAll("-", "_"));

  return (
    supplementLabelById.get(value) ??
    supplementLabelById.get(value.replace(/^supplement:/, "")) ??
    labelFromCatalog(locale, "formulaCategory", value, fallback)
  );
}

export function localizedMarketplaceName(
  value: RecommendedProduct["marketplace"],
  locale: Locale
) {
  return labelFromCatalog(locale, "marketplace", value, value);
}

export function localizedProductDescription({
  copy,
  locale,
  product,
  supplementLabelById
}: Readonly<{
  copy: RevealCopy;
  locale: Locale;
  product: RecommendedProduct;
  supplementLabelById: ReadonlyMap<string, string>;
}>) {
  const percent = product.stackContributionPercent ?? product.productCoveragePercent ?? 0;
  const covers = product.covers
    .map((cover) => localizedCoverLabel(cover, locale, supplementLabelById))
    .join(revealJoiners[locale]);

  if (product.servingMultiplier && product.servingMultiplier > 1) {
    return formatTemplate(copy.productServingMatchTemplate, {
      covers,
      percent,
      servings: product.servingMultiplier,
      servingUnit:
        product.servingMultiplier === 1
          ? copy.productSingleServingUnit
          : copy.productServingUnit
    });
  }

  return formatTemplate(copy.productMatchTemplate, { covers, percent });
}
