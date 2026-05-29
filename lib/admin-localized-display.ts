import type { AdminFoodRow } from "@/lib/admin-foods";
import type { AdminProductRow } from "@/lib/admin-products";
import type { AdminSupplementRow } from "@/lib/admin-supplements";
import type { Locale } from "@/lib/i18n";

export type AdminLocalizedText = Readonly<{
  canonicalValue: string | null;
  fallbackUsed: boolean;
  sourceLocale: string | null;
  value: string;
}>;

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function localizedText(
  locale: Locale,
  values: Readonly<Record<string, string | null | undefined>>,
  canonicalValue: string | null | undefined
): AdminLocalizedText {
  const exact = cleanText(values[locale]);

  if (exact) {
    return {
      canonicalValue: cleanText(canonicalValue),
      fallbackUsed: false,
      sourceLocale: locale,
      value: exact
    };
  }

  const english = cleanText(values.en);

  if (english) {
    return {
      canonicalValue: cleanText(canonicalValue),
      fallbackUsed: locale !== "en",
      sourceLocale: "en",
      value: english
    };
  }

  const canonical = cleanText(canonicalValue);

  if (canonical) {
    return {
      canonicalValue: canonical,
      fallbackUsed: locale !== "en",
      sourceLocale: "canonical",
      value: canonical
    };
  }

  for (const [sourceLocale, value] of Object.entries(values)) {
    const fallback = cleanText(value);

    if (fallback) {
      return {
        canonicalValue: canonical,
        fallbackUsed: sourceLocale !== locale,
        sourceLocale,
        value: fallback
      };
    }
  }

  return {
    canonicalValue: canonical,
    fallbackUsed: true,
    sourceLocale: null,
    value: ""
  };
}

export function adminLocalizedProductText(row: AdminProductRow, locale: Locale) {
  const titleValues = Object.fromEntries(
    Object.entries(row.translations ?? {}).map(([code, translation]) => [
      code,
      translation.title
    ])
  );
  const descriptionValues = Object.fromEntries(
    Object.entries(row.translations ?? {}).map(([code, translation]) => [
      code,
      translation.description
    ])
  );

  return {
    description: localizedText(locale, descriptionValues, row.description),
    title: localizedText(locale, titleValues, row.title)
  };
}

export function adminLocalizedSupplementText(
  row: AdminSupplementRow,
  locale: Locale
) {
  const translations = row.translations ?? {};
  const fieldValues = <K extends "categoryLabel" | "name" | "primaryUseCase" | "safetyNotes">(
    key: K
  ) =>
    Object.fromEntries(
      Object.entries(translations).map(([code, translation]) => [
        code,
        translation?.[key] ?? null
      ])
    );
  const aliases = translations[locale]?.aliases?.length
    ? translations[locale]?.aliases ?? []
    : translations.en?.aliases?.length
      ? translations.en.aliases
      : row.aliases.map((alias) => alias.name);

  return {
    aliases,
    category: localizedText(locale, fieldValues("categoryLabel"), row.category),
    name: localizedText(locale, fieldValues("name"), row.name),
    primaryUseCase: localizedText(
      locale,
      fieldValues("primaryUseCase"),
      row.primaryUseCase
    ),
    safetyNotes: localizedText(locale, fieldValues("safetyNotes"), row.safetyNotes)
  };
}

export function adminLocalizedFoodText(row: AdminFoodRow, locale: Locale) {
  const translations = row.translations ?? {};
  const fieldValues = <K extends "category" | "imageAlt" | "name" | "primaryUseCase">(
    key: K
  ) =>
    Object.fromEntries(
      Object.entries(translations).map(([code, translation]) => [
        code,
        translation?.[key] ?? null
      ])
    );

  return {
    category: localizedText(locale, fieldValues("category"), row.category),
    imageAlt: localizedText(locale, fieldValues("imageAlt"), row.name),
    name: localizedText(locale, fieldValues("name"), row.name),
    primaryUseCase: localizedText(
      locale,
      fieldValues("primaryUseCase"),
      row.primaryUseCase
    )
  };
}

export function adminLocalizedFallbackLabel(
  text: AdminLocalizedText,
  locale: Locale
) {
  if (!text.fallbackUsed) {
    return null;
  }

  if (locale === "zh-CN") {
    return "缺少翻译";
  }

  if (locale === "th") {
    return "ขาดคำแปล";
  }

  return "Missing translation";
}
