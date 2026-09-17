import type { QuestionnaireChannel } from '@/lib/questionnaire/types';
import { inputProvenance } from '@/lib/assessment-input-provenance';

export const WEB_PURCHASE_QUESTIONS = ['budget', 'maxPills', 'form'] as const;
export const WEB_PREFERENCE_POLICY = 'web-purchase-preferences-omitted-v1';
export const isWebPurchaseQuestion = (key: string) => (WEB_PURCHASE_QUESTIONS as readonly string[]).includes(key);
export function questionnaireChannel(value: unknown): QuestionnaireChannel {
  return value === 'agent' || value === 'line' || value === 'api' ? value : 'web';
}

/** Web preferences are unspecified, including historical provenance. Never mutate saved answers. */
export function effectiveQuestionnaireAnswers(value: unknown, channel: QuestionnaireChannel = 'web'): Record<string, unknown> {
  const answers = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (channel !== 'web') return answers;
  const result = Object.fromEntries(Object.entries(answers).filter(([key]) => !isWebPurchaseQuestion(key)));
  const provenance = inputProvenance(result.inputProvenance);
  if (provenance) result.inputProvenance = { ...provenance,
    knownFields: provenance.knownFields.filter(key => !isWebPurchaseQuestion(key)),
    rawAnswers: Object.fromEntries(Object.entries(provenance.rawAnswers).filter(([key]) => !isWebPurchaseQuestion(key))) };
  return result;
}
