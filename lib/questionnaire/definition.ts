import en from "@/content/questionnaire/v6/en.json" with { type: "json" };
import th from "@/content/questionnaire/v6/th.json" with { type: "json" };
import type {
  QuestionnaireDefinition,
  QuestionnaireLocale
} from "@/lib/questionnaire/types";

const DEFINITIONS: Record<"en" | "th", QuestionnaireDefinition> = {
  en: en as QuestionnaireDefinition,
  th: th as QuestionnaireDefinition
};

/**
 * Resolve definition for a locale. zh-CN falls back to EN copy until a
 * dedicated file exists (same turn keys / values).
 */
export function getQuestionnaireDefinition(
  locale: QuestionnaireLocale | string
): QuestionnaireDefinition {
  if (locale === "th") {
    return DEFINITIONS.th;
  }

  return DEFINITIONS.en;
}

export function questionnaireLocalesWithChatV6(): readonly QuestionnaireLocale[] {
  return ["en", "th", "zh-CN"];
}

/** @deprecated Use questionnaireLocalesWithChatV6 */
export function questionnaireLocalesWithChatV5(): readonly QuestionnaireLocale[] {
  return questionnaireLocalesWithChatV6();
}

export function isChatQuestionnaireLocale(
  locale: string
): locale is QuestionnaireLocale {
  return locale === "en" || locale === "th" || locale === "zh-CN";
}
