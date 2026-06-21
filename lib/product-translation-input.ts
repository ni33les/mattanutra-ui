import type {
  AdminProductTranslationStatus,
  ProductTranslationInput
} from "@/lib/admin-product-types";

export type ProductTranslationWarning = Readonly<{
  code: "legacy_translation_fields";
  fields: string[];
  message: string;
}>;

type LegacyTranslationField =
  | "titleEn"
  | "titleTh"
  | "titleZhCn"
  | "descriptionEn"
  | "descriptionTh"
  | "descriptionZhCn";

const localePattern = /^[a-z]{2}(?:-[A-Z0-9]{2,8})?$/;

const legacyTranslationFields: ReadonlyArray<Readonly<{
  field: LegacyTranslationField;
  key: "description" | "title";
  locale: string;
  maxLength: number;
}>> = [
  { field: "titleEn", key: "title", locale: "en", maxLength: 500 },
  { field: "descriptionEn", key: "description", locale: "en", maxLength: 4000 },
  { field: "titleTh", key: "title", locale: "th", maxLength: 500 },
  { field: "descriptionTh", key: "description", locale: "th", maxLength: 4000 },
  { field: "titleZhCn", key: "title", locale: "zh-CN", maxLength: 500 },
  { field: "descriptionZhCn", key: "description", locale: "zh-CN", maxLength: 4000 }
];

function cleanNullableText(value: unknown, maxLength: number) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function translationStatus(value: unknown): AdminProductTranslationStatus | undefined {
  return value === "complete" || value === "draft" || value === "missing"
    ? value
    : undefined;
}

function inferredStatus(input: Readonly<{
  description?: string | null;
  status?: AdminProductTranslationStatus;
  title?: string | null;
}>) {
  if (input.status) {
    return input.status;
  }

  return input.title && input.description
    ? "complete"
    : input.title || input.description
      ? "draft"
      : "missing";
}

export function normalizeProductTranslationsPayload(
  value: unknown
): Record<string, ProductTranslationInput> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .flatMap(([locale, item]) => {
        if (!localePattern.test(locale)) {
          return [];
        }

        const record = item && typeof item === "object" && !Array.isArray(item)
          ? item as Record<string, unknown>
          : {};
        const title = cleanNullableText(record.title, 500);
        const description = cleanNullableText(record.description, 4000);
        const status = translationStatus(record.status);
        const translation: ProductTranslationInput = {
          ...(description !== undefined ? { description } : {}),
          status: inferredStatus({
            description: description === undefined ? null : description,
            status,
            title: title === undefined ? null : title
          }),
          ...(title !== undefined ? { title } : {})
        };

        return [[locale, translation] as const];
      })
  );
}

export function normalizeProductTranslationRequest(input: Readonly<{
  body: Record<string, unknown>;
  translations?: unknown;
}>) {
  const translations = new Map<string, ProductTranslationInput>(
    Object.entries(normalizeProductTranslationsPayload(input.translations) ?? {})
  );
  const legacyFields = legacyTranslationFields
    .filter(({ field }) => input.body[field] !== undefined)
    .map(({ field }) => field);

  for (const legacy of legacyTranslationFields) {
    const value = cleanNullableText(input.body[legacy.field], legacy.maxLength);

    if (value === undefined) {
      continue;
    }

    const current = translations.get(legacy.locale) ?? {};

    if (current[legacy.key] !== undefined && current[legacy.key] !== null) {
      continue;
    }

    const next = {
      ...current,
      [legacy.key]: value
    };

    translations.set(legacy.locale, {
      ...next,
      status: inferredStatus(next)
    });
  }

  return {
    translations: input.translations === undefined && legacyFields.length < 1
      ? undefined
      : Object.fromEntries(translations),
    warnings: legacyFields.length > 0
      ? [{
          code: "legacy_translation_fields" as const,
          fields: legacyFields,
          message: "Deprecated fixed-locale translation fields were normalized into translations."
        }]
      : []
  };
}

export function normalizeLegacyProductTranslationFields(input: Readonly<{
  englishDescription?: string | null;
  englishTitle?: string | null;
  thaiDescription?: string | null;
  thaiTitle?: string | null;
  translations?: unknown;
}>) {
  return normalizeProductTranslationRequest({
    body: {
      ...(input.englishDescription !== undefined
        ? { descriptionEn: input.englishDescription }
        : {}),
      ...(input.englishTitle !== undefined ? { titleEn: input.englishTitle } : {}),
      ...(input.thaiDescription !== undefined
        ? { descriptionTh: input.thaiDescription }
        : {}),
      ...(input.thaiTitle !== undefined ? { titleTh: input.thaiTitle } : {})
    },
    translations: input.translations
  });
}
