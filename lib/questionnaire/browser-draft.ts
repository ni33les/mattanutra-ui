import { createInitialState, deserializeState, startQuestionnaire } from "@/lib/questionnaire/engine";
import { toAssessmentAnswers } from "@/lib/questionnaire/normalize";
import type { QuestionnaireState } from "@/lib/questionnaire/types";
import type { Locale } from "@/lib/i18n";

export type ChatCaptureReceipt = { planId: string; revision: number; inputHash?: string };
export type ChatDraft = {
  version: 1;
  state: QuestionnaireState;
  revision: number;
  captured: ChatCaptureReceipt | null;
  contactEmail: string | null;
  paymentId: string | null;
  updatedAt: number;
};
export type ServerChatDraft = {
  answers?: unknown;
  questionnaireState?: unknown;
  planId?: string | null;
  revision: number;
  contactEmail?: string | null;
  paymentId?: string | null;
  updatedAt?: string;
  captured: boolean;
};
export const chatDraftStorageKey = (sessionId: string) => `mn-questionnaire:v1:${sessionId}`;

export function parseChatDraft(raw: string | null): ChatDraft | null {
  try {
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Number.isFinite(value.revision) || !Number.isFinite(value.updatedAt)) return null;
    const state = deserializeState(JSON.stringify(value.state));
    if (!state) return null;
    if (value.captured && (value.captured.planId !== state.planId || value.captured.revision !== value.revision)) return null;
    return { ...value, state };
  } catch { return null; }
}

/** Converts legacy/classic saved answers into chat keys, preserving unanswered questions. */
export function chatAnswersFromAssessment(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const answers = value as Record<string, unknown>;
  const raw: Record<string, unknown> = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== "" && v !== null && v !== undefined && (!Array.isArray(v) || v.length > 0)));
  if (answers.heightCm && answers.weightKg) raw.hw = { h: answers.heightCm, w: answers.weightKg };
  if (answers.vo2 || answers.hrv) raw.fitness = { vo2: answers.vo2 ?? "", hrv: answers.hrv ?? "" };
  const skin = ["I", "II", "III", "IV", "V", "VI"].indexOf(String(answers.skin));
  if (skin >= 0) raw.skin = String(skin + 1);
  for (const [key, v] of Object.entries((answers.foodFrequency ?? {}) as object)) if (v !== "") raw[`f_${key}`] = v;
  for (const [key, v] of Object.entries((answers.labs ?? {}) as object)) if (v !== "") raw[`lab_${key}`] = v;
  for (const [key, v] of Object.entries((answers.labUnits ?? {}) as object)) raw[`unit_${key}`] = v;
  if (answers.disclosure === true) raw.consentSafety = true;
  return raw;
}

export function resolveChatDraft(input: { locale: Locale; sessionId: string; server?: ServerChatDraft | null; local?: ChatDraft | null }): ChatDraft {
  const { locale, sessionId, server, local } = input;
  const persisted = server?.questionnaireState ? deserializeState(JSON.stringify(server.questionnaireState)) : null;
  const authoritativeSession = persisted?.sessionId ?? sessionId;
  const matchingLocal = local?.state.sessionId === authoritativeSession
    && (!server || (local.revision === server.revision && (!local.state.planId || local.state.planId === server.planId)))
    && (!server?.updatedAt || local.updatedAt > Date.parse(server.updatedAt));
  if (matchingLocal && local) return { ...local, state: { ...local.state, locale } };
  let state = persisted ? { ...persisted, locale, planId: server?.planId ?? persisted.planId }
    : createInitialState({ locale, sessionId: authoritativeSession, planId: server?.planId });
  if (server && !persisted) {
    state = { ...state, answers: chatAnswersFromAssessment(server.answers) };
    if (Object.keys(state.answers).length) state = startQuestionnaire(state).state;
  }
  if (server?.captured) state = { ...state, phase: "complete", planId: server.planId! };
  return { version: 1, state, revision: server?.revision ?? 0,
    captured: server?.captured && server.planId ? { planId: server.planId, revision: server.revision } : null,
    contactEmail: server?.contactEmail ?? null, paymentId: server?.paymentId ?? null,
    updatedAt: server?.updatedAt ? Date.parse(server.updatedAt) : Date.now() };
}

export function updateChatDraft(draft: ChatDraft, state: QuestionnaireState): ChatDraft {
  const changed = JSON.stringify(toAssessmentAnswers(draft.state.answers)) !== JSON.stringify(toAssessmentAnswers(state.answers));
  return { ...draft, state, captured: changed ? null : draft.captured, updatedAt: Date.now() };
}
