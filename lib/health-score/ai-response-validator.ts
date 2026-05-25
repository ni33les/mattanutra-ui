import type {
  HealthScoreAdvice,
  HealthScorePageAiCopy,
  HealthScorePaywallFeature,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import { HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS } from "@/lib/health-score";
import { defaultLocale, type Locale } from "@/lib/i18n";

export type ValidatedHealthScoreAiResponse = Readonly<{
  advice: HealthScoreAdvice;
  pageCopy: HealthScorePageAiCopy;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredLocales(locale: Locale) {
  return [...new Set([defaultLocale, locale])];
}

function readLocalizedTextValue(
  value: unknown,
  path: string,
  errors: string[],
  locales: readonly string[]
): LocalizedHealthScoreText {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object with localized string values`);
    return {};
  }

  const unexpectedKeys = Object.keys(value).filter(
    (key) => !/^[a-z]{2}(?:-[A-Z0-9]{2,8})?$/.test(key)
  );

  if (unexpectedKeys.length > 0) {
    errors.push(`${path} has invalid locale keys: ${unexpectedKeys.join(", ")}`);
  }

  const entries = Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item === "string" && item.trim().length > 0)
      .map(([key, item]) => [key, String(item).trim()])
  );

  for (const locale of locales) {
    if (!entries[locale]) {
      errors.push(`${path}.${locale} is required`);
    }
  }

  return entries;
}

function readLocalizedText(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  locales: readonly string[]
) {
  return readLocalizedTextValue(record[key], `${path}.${key}`, errors, locales);
}

function readLocalizedCards({
  errors,
  expectedLength,
  key,
  locales,
  parent,
  titleKey = "headline"
}: Readonly<{
  errors: string[];
  expectedLength: number;
  key: string;
  locales: readonly string[];
  parent: Record<string, unknown>;
  titleKey?: "headline" | "title";
}>) {
  const value = parent[key];

  if (!Array.isArray(value)) {
    errors.push(`pageCopy.${key} must be an array`);
    return [];
  }

  if (value.length !== expectedLength) {
    errors.push(`pageCopy.${key} must contain exactly ${expectedLength} items`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      errors.push(`pageCopy.${key}[${index}] must be an object`);
      return {
        body: { en: "", th: "" },
        [titleKey]: { en: "", th: "" }
      };
    }

    const allowed = new Set([titleKey, "body"]);
    const unexpected = Object.keys(item).filter((itemKey) => !allowed.has(itemKey));

    if (unexpected.length > 0) {
      errors.push(`pageCopy.${key}[${index}] has unexpected keys: ${unexpected.join(", ")}`);
    }

    return {
      body: readLocalizedTextValue(
        item.body,
        `pageCopy.${key}[${index}].body`,
        errors,
        locales
      ),
      [titleKey]: readLocalizedTextValue(
        item[titleKey],
        `pageCopy.${key}[${index}].${titleKey}`,
        errors,
        locales
      )
    };
  });
}

function readPaywallFeatures(
  record: Record<string, unknown>,
  path: string,
  errors: string[],
  locales: readonly string[]
) {
  const value = record.paywallFeatures;

  if (!Array.isArray(value)) {
    errors.push(`${path}.paywallFeatures must be an array`);
    return [];
  }

  if (value.length !== 3) {
    errors.push(`${path}.paywallFeatures must contain exactly 3 items`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      errors.push(`${path}.paywallFeatures[${index}] must be an object`);

      return {
        description: { en: "", th: "" },
        name: { en: "", th: "" }
      };
    }

    const unexpectedKeys = Object.keys(item).filter(
      (itemKey) => itemKey !== "description" && itemKey !== "name"
    );

    if (unexpectedKeys.length > 0) {
      errors.push(
        `${path}.paywallFeatures[${index}] must only include name and description, found: ${unexpectedKeys.join(", ")}`
      );
    }

    return {
      description: readLocalizedTextValue(
        item.description,
        `${path}.paywallFeatures[${index}].description`,
        errors,
        locales
      ),
      name: readLocalizedTextValue(
        item.name,
        `${path}.paywallFeatures[${index}].name`,
        errors,
        locales
      )
    } satisfies HealthScorePaywallFeature;
  });
}

function walkStrings(value: unknown, visit: (item: string) => void) {
  if (typeof value === "string") {
    visit(value);
  } else if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, visit);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) walkStrings(item, visit);
  }
}

function validateNoForbiddenCopy(value: unknown, errors: string[]) {
  walkStrings(value, (item) => {
    const lower = item.toLowerCase();
    const found = HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS.find((bad) =>
      lower.includes(bad)
    );

    if (found) {
      errors.push(`copy contains forbidden term: ${found}`);
    }

    if (/<\/?[a-z][\s\S]*>/i.test(item)) {
      errors.push("copy must not include HTML tags");
    }
  });
}

export function validateHealthScoreAiResponse({
  healthScore,
  locale,
  value
}: Readonly<{
  healthScore: HealthScoreResult;
  locale: Locale;
  value: unknown;
}>):
  | Readonly<{ errors: string[]; response?: never }>
  | Readonly<{ errors: []; response: ValidatedHealthScoreAiResponse }> {
  const errors: string[] = [];
  const locales = requiredLocales(locale);
  const pageContent = healthScore.pageContent;

  if (!isRecord(value)) {
    return { errors: ["Top-level response must be a JSON object"] };
  }

  const unexpectedTopLevelKeys = Object.keys(value).filter(
    (key) => key !== "advice" && key !== "pageCopy"
  );

  if (unexpectedTopLevelKeys.length > 0) {
    errors.push(
      `Top-level response must only include advice and pageCopy, found: ${unexpectedTopLevelKeys.join(", ")}`
    );
  }

  if (!isRecord(value.advice)) {
    errors.push("advice must be an object");
  }

  if (!isRecord(value.pageCopy)) {
    errors.push("pageCopy must be an object");
  }

  const adviceRecord = isRecord(value.advice) ? value.advice : {};
  const pageCopyRecord = isRecord(value.pageCopy) ? value.pageCopy : {};

  const unexpectedAdviceKeys = Object.keys(adviceRecord).filter(
    (key) =>
      key !== "overview" &&
      key !== "paywallEyebrow" &&
      key !== "paywallFeatures" &&
      key !== "paywallSubtitle" &&
      key !== "paywallTitle"
  );

  if (unexpectedAdviceKeys.length > 0) {
    errors.push(`advice includes unexpected keys: ${unexpectedAdviceKeys.join(", ")}`);
  }

  const unexpectedPageKeys = Object.keys(pageCopyRecord).filter(
    (key) =>
      key !== "bandLine" &&
      key !== "gapTrio" &&
      key !== "heroBody" &&
      key !== "heroTitle" &&
      key !== "findings" &&
      key !== "methodCards" &&
      key !== "methodHeadline" &&
      key !== "overview" &&
      key !== "paywallFeatures" &&
      key !== "paywallSubtitle" &&
      key !== "paywallTitle" &&
      key !== "relativityHeadline" &&
      key !== "relativitySub" &&
      key !== "subtractionBody"
  );

  if (unexpectedPageKeys.length > 0) {
    errors.push(`pageCopy includes unexpected keys: ${unexpectedPageKeys.join(", ")}`);
  }

  const advice = {
    overview: readLocalizedText(adviceRecord, "overview", "advice", errors, locales),
    paywallEyebrow: readLocalizedText(adviceRecord, "paywallEyebrow", "advice", errors, locales),
    paywallFeatures: readPaywallFeatures(adviceRecord, "advice", errors, locales),
    paywallSubtitle: readLocalizedText(adviceRecord, "paywallSubtitle", "advice", errors, locales),
    paywallTitle: readLocalizedText(adviceRecord, "paywallTitle", "advice", errors, locales)
  } satisfies HealthScoreAdvice;

  const pageCopy = {
    bandLine: readLocalizedText(pageCopyRecord, "bandLine", "pageCopy", errors, locales),
    gapTrio: readLocalizedCards({
      errors,
      expectedLength: pageContent?.copySeeds.gapTrio.length ?? 3,
      key: "gapTrio",
      locales,
      parent: pageCopyRecord
    }),
    heroBody: readLocalizedText(pageCopyRecord, "heroBody", "pageCopy", errors, locales),
    heroTitle: readLocalizedText(pageCopyRecord, "heroTitle", "pageCopy", errors, locales),
    findings: readLocalizedCards({
      errors,
      expectedLength: pageContent?.copySeeds.findings.length ?? 3,
      key: "findings",
      locales,
      parent: pageCopyRecord
    }),
    methodCards: readLocalizedCards({
      errors,
      expectedLength: 3,
      key: "methodCards",
      locales,
      parent: pageCopyRecord,
      titleKey: "title"
    }),
    methodHeadline: readLocalizedText(pageCopyRecord, "methodHeadline", "pageCopy", errors, locales),
    overview: readLocalizedText(pageCopyRecord, "overview", "pageCopy", errors, locales),
    paywallFeatures: readPaywallFeatures(pageCopyRecord, "pageCopy", errors, locales),
    paywallSubtitle: readLocalizedText(pageCopyRecord, "paywallSubtitle", "pageCopy", errors, locales),
    paywallTitle: readLocalizedText(pageCopyRecord, "paywallTitle", "pageCopy", errors, locales),
    relativityHeadline: readLocalizedText(pageCopyRecord, "relativityHeadline", "pageCopy", errors, locales),
    relativitySub: readLocalizedText(pageCopyRecord, "relativitySub", "pageCopy", errors, locales),
    subtractionBody: readLocalizedText(pageCopyRecord, "subtractionBody", "pageCopy", errors, locales)
  } satisfies HealthScorePageAiCopy;

  validateNoForbiddenCopy({ advice, pageCopy }, errors);

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        response: {
          advice,
          pageCopy
        }
      };
}
