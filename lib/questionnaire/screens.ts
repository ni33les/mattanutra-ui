import en from "@/content/questionnaire/v15-5/en.json" with { type: "json" };
import th from "@/content/questionnaire/v15-5/th.json" with { type: "json" };
import { getQuestionnaireDefinition } from "@/lib/questionnaire/definition";
import { isTurnVisible } from "@/lib/questionnaire/reactions";
import type { QuestionnaireAnswers, QuestionnaireLocale, QuestionnaireState, TurnDef } from "@/lib/questionnaire/types";

export const SCREEN_QUESTIONNAIRE_VERSION = "v15.5-screens";
export type QuestionnaireScreen = Readonly<{ id: string; sec: number; nong?: string; blocks: readonly string[] }>;
const removedKeys = ["budget", "maxPills", "form", "tracker", "otherTracker", "fitness", "vo2", "hrv", "protein", "precisionGate"];
export const questionnaireScreens: readonly QuestionnaireScreen[] = en.screens;
export function screenCopy(locale: string) { return locale === "th" ? th : en; }
export function screenDefinition(state: QuestionnaireState) { return getQuestionnaireDefinition(state.locale, SCREEN_QUESTIONNAIRE_VERSION); }
export function screenTurns(state: QuestionnaireState, screen: QuestionnaireScreen, includeInferred = false): TurnDef[] {
  const definition = screenDefinition(state);
  return screen.blocks.flatMap(key => {
    const turn = definition.turns.find(item => item.k === key);
    return turn && isTurnVisible(turn, state.answers) && (includeInferred || state.screenEdit || !state.autoFilled.includes(key)) ? [turn] : [];
  });
}
export function visibleScreens(state: QuestionnaireState): QuestionnaireScreen[] {
  return questionnaireScreens.filter(screen => screenTurns(state, screen).length > 0);
}
function positive(value: unknown) { return (typeof value === "number" || typeof value === "string" && value.trim() !== "") && Number.isFinite(Number(value)) && Number(value) > 0; }
export function measurementAnswered(answers: QuestionnaireAnswers, key: "height" | "weight") {
  return answers[`${key}Status`] === "unknown" || answers[`${key}Status`] === "known" && positive(answers[key]);
}
export function labsValid(state: QuestionnaireState, today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })) {
  if (state.answers.labsHave !== "yes") return ["no", "notnow"].includes(String(state.answers.labsHave));
  const validValues = screenDefinition(state).meta.labs.every(lab => {
    const value = state.answers[lab.k];
    return value === undefined || value === "" || value === null || positive(value) && lab.u.includes(String(state.answers[`unit_${lab.k.slice(4)}`] ?? lab.u[0]));
  });
  const date = state.answers.labDate;
  const validDate = !date || typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date && date <= today;
  return validValues && validDate;
}
export function screenAnswerValid(state: QuestionnaireState, turn: TurnDef): boolean {
  const value = state.answers[turn.k];
  if (turn.kind === "text") return value === undefined || value === null ? !turn.req : typeof value === "string" && (!turn.req || value.trim().length > 0);
  if (turn.kind === "measurements") return measurementAnswered(state.answers, "height") && measurementAnswered(state.answers, "weight");
  if (turn.kind === "labs") return labsValid(state);
  if (turn.kind === "confirm") return value === true;
  if (turn.kind === "swatch") return screenDefinition(state).meta.skinValues.includes(String(value));
  if (turn.kind === "multi") {
    if (!Array.isArray(value) || !value.length || turn.max && value.length > turn.max || new Set(value).size !== value.length) return false;
    return value.every(item => turn.opts?.some(option => option.v === item)) && (!value.some(item => turn.excl?.includes(item)) || value.length === 1);
  }
  return Boolean(turn.opts?.some(option => option.v === value));
}
export function screenComplete(state: QuestionnaireState, screen: QuestionnaireScreen) {
  return screenTurns(state, screen, true).every(turn => {
    const value = state.answers[turn.k];
    return !turn.req && (value === undefined || value === null || value === "") || screenAnswerValid(state, turn);
  });
}
export function firstMissingScreen(state: QuestionnaireState) {
  return questionnaireScreens.find(screen => !screenComplete(state, screen));
}
export function screenQuestionnaireComplete(state: QuestionnaireState) {
  return !firstMissingScreen(state) && state.answers.disclosure === true;
}
export function screenProgress(state: QuestionnaireState): number {
  const screens = visibleScreens(state);
  const complete = screens.filter(screen => state.completedScreens?.includes(screen.id) && screenComplete(state, screen)).length;
  return state.screenReview && !firstMissingScreen(state) ? 100 : Math.round(100 * complete / Math.max(1, screens.length));
}

/** Keep valid earlier answers and discard only answers made inapplicable by a branch. */
export function updateScreenAnswer(state: QuestionnaireState, key: string, value: unknown): QuestionnaireState {
  const answers: QuestionnaireAnswers = { ...state.answers, [key]: value, questionnaireVersion: SCREEN_QUESTIONNAIRE_VERSION };
  if (key !== "disclosure") answers.disclosure = false;
  let autoFilled = state.autoFilled.filter(item => item !== key);
  const definition = screenDefinition(state);
  if (key === "diet") {
    if (value !== "vegan") {
      for (const inferred of autoFilled) delete answers[inferred];
      autoFilled = [];
    } else {
      for (const [inferred, assumed] of Object.entries(definition.meta.autofill)) {
        if (answers[inferred] === undefined || answers[inferred] === null || answers[inferred] === "") {
          answers[inferred] = assumed;
          autoFilled.push(inferred);
        }
      }
    }
  }
  for (const turn of definition.turns) if (turn.cond && !isTurnVisible(turn, answers)) delete answers[turn.k];
  if (key === "labsHave" && value !== "yes") {
    for (const lab of definition.meta.labs) { delete answers[lab.k]; delete answers[`unit_${lab.k.slice(4)}`]; }
    delete answers.labs; delete answers.labUnits; delete answers.labDate;
  }
  if (key === "height" || key === "weight") answers[`${key}Status`] = value === "" || value === null ? "unanswered" : "known";
  if (key === "heightStatus" && value !== "known") answers.height = null;
  if (key === "weightStatus" && value !== "known") answers.weight = null;
  answers.hw = { h: answers.heightStatus === "known" ? answers.height : null, w: answers.weightStatus === "known" ? answers.weight : null };
  return { ...state, answers, autoFilled, phase: "active", completedAt: null };
}
export function toggleScreenChoice(state: QuestionnaireState, turn: TurnDef, value: string): QuestionnaireState {
  const selected = Array.isArray(state.answers[turn.k]) ? state.answers[turn.k] as string[] : [];
  const values = selected.includes(value) ? selected.filter(item => item !== value)
    : turn.excl?.includes(value) ? [value] : [...selected.filter(item => !turn.excl?.includes(item)), value];
  return turn.max && values.length > turn.max ? state : updateScreenAnswer(state, turn.k, values);
}
export function openScreen(state: QuestionnaireState, id: string, editing = false): QuestionnaireState {
  const screen = questionnaireScreens.find(item => item.id === id) ?? questionnaireScreens[0];
  const turns = screenTurns({ ...state, screenEdit: editing }, screen);
  return { ...state, phase: "active", screenReview: false, screenEdit: editing, screenId: screen.id,
    turnIndex: screenDefinition(state).turns.findIndex(turn => turn.k === turns[0]?.k) };
}
export function advanceScreen(state: QuestionnaireState): QuestionnaireState {
  const screens = visibleScreens(state);
  const index = screens.findIndex(screen => screen.id === state.screenId);
  const screen = screens[index];
  if (!screen || !screenComplete(state, screen)) return state;
  const next = { ...state, completedScreens: [...new Set([...(state.completedScreens ?? []), screen.id])] };
  if (state.screenEdit || index === screens.length - 1) {
    const missing = firstMissingScreen(next);
    return missing ? openScreen(next, missing.id) : { ...next, screenReview: true, screenEdit: false };
  }
  return openScreen(next, screens[index + 1].id);
}
export function previousScreen(state: QuestionnaireState): QuestionnaireState {
  if (state.screenEdit) return { ...state, screenReview: true, screenEdit: false };
  const screens = visibleScreens(state);
  const index = state.screenReview ? screens.length : screens.findIndex(screen => screen.id === state.screenId);
  return openScreen(state, screens[Math.max(0, index - 1)].id);
}

/** Migration is explicit: old default measurements must have been answered to be trusted. */
export function migrateScreenState(source: QuestionnaireState): QuestionnaireState {
  const wasCurrent = source.version === SCREEN_QUESTIONNAIRE_VERSION;
  const answers: QuestionnaireAnswers = { ...source.answers, questionnaireVersion: SCREEN_QUESTIONNAIRE_VERSION };
  for (const key of removedKeys) delete answers[key];
  const hw = answers.hw && typeof answers.hw === "object" ? answers.hw as Record<string, unknown> : {};
  for (const key of ["height", "weight"] as const) {
    if (!answers[`${key}Status`]) {
      const value = answers[key] ?? hw[key === "height" ? "h" : "w"];
      answers[key] = positive(value) ? value : null;
      answers[`${key}Status`] = positive(value) ? "known" : "unanswered";
    }
  }
  if (!answers.labsHave && answers.labs !== undefined) answers.labsHave = answers.labs && Object.keys(answers.labs as object).length ? "yes" : "notnow";
  if (!wasCurrent) answers.disclosure = false;
  let next: QuestionnaireState = { ...source, version: SCREEN_QUESTIONNAIRE_VERSION, answers,
    autoFilled: source.autoFilled.filter(key => answers[key] === screenDefinition(source).meta.autofill[key]),
    completedScreens: wasCurrent ? source.completedScreens ?? [] : questionnaireScreens.filter(screen => screenComplete({ ...source, answers }, screen) && screen.blocks.some(key => source.answers[key] !== undefined)).map(screen => screen.id),
    screenId: wasCurrent ? source.screenId ?? "name" : "name", screenReview: wasCurrent && source.screenReview,
    log: [], precisionGate: null };
  if (!wasCurrent && Object.keys(source.answers).length) next = openScreen(next, firstMissingScreen(next)?.id ?? "name");
  if (!visibleScreens(next).some(screen => screen.id === next.screenId)) next = openScreen(next, firstMissingScreen(next)?.id ?? "name");
  return next;
}
export function createScreenState(locale: QuestionnaireLocale, sessionId: string): QuestionnaireState {
  return migrateScreenState({ answers: {}, autoFilled: [], channel: "web", completedAt: null, earned: {}, fired: {}, halfwayDone: false,
    locale, log: [], phase: "intro", planId: null, precisionGate: null, sessionId, sinceAck: 0, startedAt: null, turnIndex: -1, version: SCREEN_QUESTIONNAIRE_VERSION });
}

export function fastForwardScreens(state: QuestionnaireState): QuestionnaireState {
  let next: QuestionnaireState = { ...state, phase: "active", startedAt: state.startedAt ?? Date.now() };
  for (const turn of screenDefinition(next).turns) {
    if (!isTurnVisible(turn, next.answers)) continue;
    if (turn.kind === "measurements") { next = updateScreenAnswer(next, "height", "175"); next = updateScreenAnswer(next, "weight", "72"); }
    else if (turn.kind === "labs") next = updateScreenAnswer(next, "labsHave", "no");
    else if (turn.kind === "text") next = updateScreenAnswer(next, turn.k, turn.k === "firstName" ? "Alex" : "");
    else if (turn.kind === "confirm") next = updateScreenAnswer(next, turn.k, true);
    else if (turn.kind === "swatch") next = updateScreenAnswer(next, turn.k, "3");
    else { const value = turn.opts?.find(option => ["none", "normal", "no", "great"].includes(option.v))?.v ?? turn.opts?.[0]?.v;
      next = updateScreenAnswer(next, turn.k, turn.kind === "multi" ? [value] : value); }
  }
  return { ...next, screenReview: true, completedScreens: questionnaireScreens.map(screen => screen.id), answers: { ...next.answers, disclosure: false } };
}
