import { canonicalHash } from "@/lib/agentic/value/canonical";
import type { Locale } from "@/lib/i18n";
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const HEALTHSCORE_AI_TEXT_KEYS = [
  "bandLine",
  "findingsHeadline",
  "findingsSub",
  "heroBody",
  "heroTitle",
  "highestLeverageBody",
  "methodHeadline",
  "pillarHeadline",
  "relativityHeadline",
  "relativitySub",
  "strengthNote",
  "subtractionBody"
] as const;

function localizedHealthScoreTextPresent(value: unknown, locale?: Locale) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (locale) return typeof (value as Record<string, unknown>)[locale] === "string" && String((value as Record<string, unknown>)[locale]).trim().length > 0;
    return Object.values(value as Record<string, unknown>).some(
      (item) => typeof item === "string" && item.trim().length > 0
    );
  }

  return false;
}

function healthScoreAiCardPresent(value: unknown, locale?: Locale) {
  const card = asRecord(value);

  return (
    localizedHealthScoreTextPresent(card.body, locale) &&
    (localizedHealthScoreTextPresent(card.headline, locale) ||
      localizedHealthScoreTextPresent(card.title, locale))
  );
}

export function hasHealthScoreAiCopy(value: unknown, locale?: Locale) {
  const aiCopy = asRecord(asRecord(asRecord(value).pageContent).aiCopy);

  if (
    !HEALTHSCORE_AI_TEXT_KEYS.every((key) =>
      localizedHealthScoreTextPresent(aiCopy[key], locale)
    )
  ) {
    return false;
  }

  const gaps = asArray(aiCopy.gapTrio);
  const findings = asArray(aiCopy.findings);
  const methodCards = asArray(aiCopy.methodCards);

  return (
    gaps.length > 0 &&
    gaps.every(card => healthScoreAiCardPresent(card, locale)) &&
    findings.length > 0 &&
    findings.every(card => healthScoreAiCardPresent(card, locale)) &&
    methodCards.length === 3 &&
    methodCards.every(card => healthScoreAiCardPresent(card, locale))
  );
}

/** Written with the result, never inferred from assessment status or contact data. */
export function healthScoreReadProjection(value: unknown) {
  return { version: 1, resultHash: canonicalHash(value), ready: { en: hasHealthScoreAiCopy(value, "en"), th: hasHealthScoreAiCopy(value, "th"), "zh-CN": hasHealthScoreAiCopy(value, "zh-CN") } };
}
