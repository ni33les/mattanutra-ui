import type {
  HealthScoreAdvice,
  HealthScorePageAiCopy,
  HealthScorePaywallFeature,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import { HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS } from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";

export type ValidatedHealthScoreAiResponse = Readonly<{
  advice: HealthScoreAdvice;
  pageCopy: HealthScorePageAiCopy;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredLocales(locale: Locale) {
  return [locale];
}

function readLocalizedTextValue(
  value: unknown,
  path: string,
  errors: string[],
  locales: readonly string[]
): LocalizedHealthScoreText {
  if (typeof value === "string" && value.trim()) {
    return { [locales[0] ?? "en"]: value.trim() };
  }

  if (!isRecord(value)) {
    errors.push(`${path} must be a string or an object with localized string values`);
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

function readOptionalLocalizedText(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  locales: readonly string[]
) {
  return record[key] === undefined
    ? undefined
    : readLocalizedText(record, key, path, errors, locales);
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
  const ignoredSeedKeys = key === "gapTrio"
    ? new Set(["tag", "value"])
    : key === "findings"
      ? new Set(["code", "icon"])
      : new Set<string>();

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
    const unexpected = Object.keys(item).filter((itemKey) =>
      !allowed.has(itemKey) && !ignoredSeedKeys.has(itemKey)
    );

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

    const localizedCardKeys = Object.keys(item).filter((itemKey) =>
      /^[a-z]{2}(?:-[A-Z0-9]{2,8})?$/.test(itemKey)
    );
    const hasLocalizedCardShape =
      localizedCardKeys.length > 0 &&
      localizedCardKeys.length === Object.keys(item).length &&
      localizedCardKeys.every((localeKey) => isRecord(item[localeKey]));
    const hasLocalizedStringCardShape =
      localizedCardKeys.length > 0 &&
      localizedCardKeys.length === Object.keys(item).length &&
      localizedCardKeys.every((localeKey) => typeof item[localeKey] === "string");

    if (hasLocalizedCardShape) {
      return {
        description: readLocalizedTextValue(
          Object.fromEntries(
            localizedCardKeys.map((localeKey) => [
              localeKey,
              isRecord(item[localeKey])
                ? item[localeKey].description
                : undefined
            ])
          ),
          `${path}.paywallFeatures[${index}].description`,
          errors,
          locales
        ),
        name: readLocalizedTextValue(
          Object.fromEntries(
            localizedCardKeys.map((localeKey) => [
              localeKey,
              isRecord(item[localeKey]) ? item[localeKey].name : undefined
            ])
          ),
          `${path}.paywallFeatures[${index}].name`,
          errors,
          locales
        )
      } satisfies HealthScorePaywallFeature;
    }

    if (hasLocalizedStringCardShape) {
      const localizedCardText = readLocalizedTextValue(
        item,
        `${path}.paywallFeatures[${index}]`,
        errors,
        locales
      );

      return {
        description: localizedCardText,
        name: localizedCardText
      } satisfies HealthScorePaywallFeature;
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

function readOptionalPaywallFeatures(
  record: Record<string, unknown>,
  path: string,
  errors: string[],
  locales: readonly string[]
) {
  return record.paywallFeatures === undefined
    ? undefined
    : readPaywallFeatures(record, path, errors, locales);
}

function fallbackLocalizedText(
  en: string | undefined,
  th: string | undefined = en
): LocalizedHealthScoreText {
  return {
    en: en?.trim() || "Your HealthScore is ready.",
    th: th?.trim() || en?.trim() || "HealthScore ของคุณพร้อมแล้ว"
  };
}

function fallbackPaywallFeatures(
  healthScore: HealthScoreResult,
  pageCopy: HealthScorePageAiCopy
): HealthScorePaywallFeature[] {
  const methodCards = pageCopy.methodCards ?? [];
  const seedCards = healthScore.pageContent?.copySeeds.methodCards ?? [];
  const features = methodCards.slice(0, 3).map((card, index) => {
    const seed = seedCards[index];
    const title = card.title ?? seed?.title ?? card.body;

    return {
      description: card.body,
      name: title
    } satisfies HealthScorePaywallFeature;
  });

  while (features.length < 3) {
    const seed = seedCards[features.length];

    features.push({
      description: fallbackLocalizedText(seed?.body, seed?.body),
      name: fallbackLocalizedText(seed?.title, seed?.title)
    });
  }

  return features.slice(0, 3);
}

function synthesizedAdvice(
  healthScore: HealthScoreResult,
  pageCopy: HealthScorePageAiCopy
): HealthScoreAdvice {
  return {
    overview:
      pageCopy.heroBody ??
      pageCopy.overview ??
      pageCopy.bandLine ??
      fallbackLocalizedText(healthScore.summary),
    paywallEyebrow: fallbackLocalizedText("Your plan is ready"),
    paywallFeatures: fallbackPaywallFeatures(healthScore, pageCopy),
    paywallSubtitle: fallbackLocalizedText(
      "Open the full plan to turn this score into the exact formula and product stack."
    ),
    paywallTitle: pageCopy.heroTitle ?? fallbackLocalizedText("Turn your HealthScore into a plan")
  };
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

function extractIntegerLiterals(text: string): Set<number> {
  return new Set(
    [...text.matchAll(/\b\d+\b/g)].map((match) => Number(match[0]))
  );
}

function onlyAllowedHtml(text: string) {
  const stripped = text.replace(/<\/?em>/gi, "");
  return !/<\/?[a-z][\s\S]*>/i.test(stripped);
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

    // Handoff Stage 6: only <em> tags are allowed in polished prose.
    if (!onlyAllowedHtml(item)) {
      errors.push("copy may only include <em> HTML tags");
    }

    if (/\b1\s+things\b/i.test(item)) {
      errors.push("copy must use singular grammar for 1 thing");
    }
  });
}

/**
 * Handoff §07 §4b/§4e: for each rewritable field, polished text may only use
 * integer literals present in that field's engine seed, and must stay within
 * 0.5x–1.5x of the seed length. Checks are per-field (not global seed allow-list).
 */
function polishedStringsForLocales(
  value: LocalizedHealthScoreText | undefined,
  locales: readonly string[]
): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (!isRecord(value)) {
    return [];
  }

  const matched = locales
    .map((locale) => value[locale])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());

  if (matched.length > 0) {
    return matched;
  }

  // Legacy multi-locale objects without the requested key still get checked.
  return Object.values(value)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function validatePolishedFieldAgainstSeed({
  errors,
  locales,
  path,
  polished,
  seed
}: Readonly<{
  errors: string[];
  locales: readonly string[];
  path: string;
  polished: LocalizedHealthScoreText | undefined;
  seed: string | null | undefined;
}>) {
  if (seed === undefined || seed === null || seed.length === 0) {
    return;
  }

  const seedInts = extractIntegerLiterals(seed);
  const seedLength = seed.length;

  for (const text of polishedStringsForLocales(polished, locales)) {
    for (const value of extractIntegerLiterals(text)) {
      if (!seedInts.has(value)) {
        errors.push(
          `${path} introduced integer literal ${value} not present in that field's engine seed`
        );
      }
    }

    const ratio = text.length / seedLength;
    if (ratio < 0.5 || ratio > 1.5) {
      errors.push(
        `${path} length ${text.length} is outside 0.5x–1.5x of engine seed (${seedLength})`
      );
    }
  }
}

function validatePageCopyAgainstSeeds({
  errors,
  locales,
  pageContent,
  pageCopy
}: Readonly<{
  errors: string[];
  locales: readonly string[];
  pageContent: HealthScoreResult["pageContent"];
  pageCopy: HealthScorePageAiCopy;
}>) {
  const seeds = pageContent?.copySeeds;
  if (!seeds) {
    return;
  }

  const check = (
    path: string,
    polished: LocalizedHealthScoreText | undefined,
    seed: string | null | undefined
  ) =>
    validatePolishedFieldAgainstSeed({
      errors,
      locales,
      path,
      polished,
      seed
    });

  check("pageCopy.bandLine", pageCopy.bandLine, seeds.bandLine);
  check("pageCopy.heroBody", pageCopy.heroBody, seeds.heroBody);
  check("pageCopy.findingsHeadline", pageCopy.findingsHeadline, seeds.findingsHeadline);
  check("pageCopy.findingsSub", pageCopy.findingsSub, seeds.findingsSub);
  check(
    "pageCopy.highestLeverageBody",
    pageCopy.highestLeverageBody,
    seeds.highestLeverage?.text
  );
  check("pageCopy.methodHeadline", pageCopy.methodHeadline, seeds.methodHeadline);
  check("pageCopy.pillarHeadline", pageCopy.pillarHeadline, seeds.pillarHeadline);
  check(
    "pageCopy.relativityHeadline",
    pageCopy.relativityHeadline,
    seeds.relativity.headline
  );
  check("pageCopy.relativitySub", pageCopy.relativitySub, seeds.relativity.sub);
  check("pageCopy.strengthNote", pageCopy.strengthNote, seeds.strengthNote);
  check("pageCopy.subtractionBody", pageCopy.subtractionBody, seeds.subtraction.body);
  // heroTitle / legacy overview+paywall slots have no direct engine seed string.

  const gapTrio = pageCopy.gapTrio ?? [];
  seeds.gapTrio.forEach((seedCard, index) => {
    const polished = gapTrio[index];
    check(`pageCopy.gapTrio[${index}].headline`, polished?.headline, seedCard.headline);
    check(`pageCopy.gapTrio[${index}].body`, polished?.body, seedCard.body);
  });

  const findings = pageCopy.findings ?? [];
  seeds.findings.forEach((seedCard, index) => {
    const polished = findings[index];
    check(`pageCopy.findings[${index}].headline`, polished?.headline, seedCard.headline);
    check(`pageCopy.findings[${index}].body`, polished?.body, seedCard.body);
  });

  const methodCards = pageCopy.methodCards ?? [];
  seeds.methodCards.forEach((seedCard, index) => {
    const polished = methodCards[index];
    check(`pageCopy.methodCards[${index}].title`, polished?.title, seedCard.title);
    check(`pageCopy.methodCards[${index}].body`, polished?.body, seedCard.body);
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

  if (value.advice !== undefined && !isRecord(value.advice)) {
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
      key !== "findingsHeadline" &&
      key !== "findingsSub" &&
      key !== "highestLeverageBody" &&
      key !== "methodCards" &&
      key !== "methodHeadline" &&
      key !== "overview" &&
      key !== "paywallFeatures" &&
      key !== "paywallSubtitle" &&
      key !== "paywallTitle" &&
      key !== "pillarHeadline" &&
      key !== "relativityHeadline" &&
      key !== "relativitySub" &&
      key !== "strengthNote" &&
      key !== "subtractionBody"
  );

  if (unexpectedPageKeys.length > 0) {
    errors.push(`pageCopy includes unexpected keys: ${unexpectedPageKeys.join(", ")}`);
  }

  const legacyOverview = readOptionalLocalizedText(
    pageCopyRecord,
    "overview",
    "pageCopy",
    errors,
    locales
  );
  const legacyPaywallFeatures = readOptionalPaywallFeatures(
    pageCopyRecord,
    "pageCopy",
    errors,
    locales
  );
  const legacyPaywallSubtitle = readOptionalLocalizedText(
    pageCopyRecord,
    "paywallSubtitle",
    "pageCopy",
    errors,
    locales
  );
  const legacyPaywallTitle = readOptionalLocalizedText(
    pageCopyRecord,
    "paywallTitle",
    "pageCopy",
    errors,
    locales
  );

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
    findingsHeadline: readLocalizedText(pageCopyRecord, "findingsHeadline", "pageCopy", errors, locales),
    findingsSub: readLocalizedText(pageCopyRecord, "findingsSub", "pageCopy", errors, locales),
    highestLeverageBody: readLocalizedText(pageCopyRecord, "highestLeverageBody", "pageCopy", errors, locales),
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
    ...(legacyOverview ? { overview: legacyOverview } : {}),
    ...(legacyPaywallFeatures ? { paywallFeatures: legacyPaywallFeatures } : {}),
    ...(legacyPaywallSubtitle ? { paywallSubtitle: legacyPaywallSubtitle } : {}),
    ...(legacyPaywallTitle ? { paywallTitle: legacyPaywallTitle } : {}),
    pillarHeadline: readLocalizedText(pageCopyRecord, "pillarHeadline", "pageCopy", errors, locales),
    relativityHeadline: readLocalizedText(pageCopyRecord, "relativityHeadline", "pageCopy", errors, locales),
    relativitySub: readLocalizedText(pageCopyRecord, "relativitySub", "pageCopy", errors, locales),
    strengthNote: readLocalizedText(pageCopyRecord, "strengthNote", "pageCopy", errors, locales),
    subtractionBody: readLocalizedText(pageCopyRecord, "subtractionBody", "pageCopy", errors, locales)
  } satisfies HealthScorePageAiCopy;
  const advice = value.advice === undefined
    ? synthesizedAdvice(healthScore, pageCopy)
    : {
        overview: readLocalizedText(adviceRecord, "overview", "advice", errors, locales),
        paywallEyebrow: readLocalizedText(adviceRecord, "paywallEyebrow", "advice", errors, locales),
        paywallFeatures: readPaywallFeatures(adviceRecord, "advice", errors, locales),
        paywallSubtitle: readLocalizedText(adviceRecord, "paywallSubtitle", "advice", errors, locales),
        paywallTitle: readLocalizedText(adviceRecord, "paywallTitle", "advice", errors, locales)
      } satisfies HealthScoreAdvice;

  validateNoForbiddenCopy({ advice, pageCopy }, errors);
  // Stage 6 §4b/§4e apply to rewritable pageCopy fields vs engine copySeeds.
  // Legacy advice/paywall slots are not 1:1 with seed strings.
  validatePageCopyAgainstSeeds({
    errors,
    locales,
    pageContent,
    pageCopy
  });

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
