/**
 * Headless conversation engine for the chat questionnaire (v6-conversational).
 * Pure functions — no DOM, no I/O. Safe for web, LINE, agent tools.
 * Master: files/c-q.zip
 */

import { getQuestionnaireDefinition } from "@/lib/questionnaire/definition";
import { isTurnVisible, selectReaction } from "@/lib/questionnaire/reactions";
import type {
  ApplyAnswerResult,
  LogMessage,
  NextPrompt,
  QuestionnaireAnswers,
  QuestionnaireChannel,
  QuestionnaireDefinition,
  QuestionnaireEvent,
  QuestionnaireLocale,
  QuestionnaireState,
  SectionDef,
  TurnDef
} from "@/lib/questionnaire/types";

function newSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneState(state: QuestionnaireState): QuestionnaireState {
  return {
    ...state,
    answers: { ...state.answers },
    autoFilled: [...state.autoFilled],
    earned: { ...state.earned },
    fired: { ...state.fired },
    log: [...state.log]
  };
}

export function createInitialState(input: {
  locale: QuestionnaireLocale | string;
  channel?: QuestionnaireChannel;
  sessionId?: string;
  planId?: string | null;
}): QuestionnaireState {
  const locale =
    input.locale === "th" || input.locale === "zh-CN" || input.locale === "en"
      ? input.locale
      : "en";
  const definition = getQuestionnaireDefinition(locale);

  return {
    answers: {},
    autoFilled: [],
    earned: {},
    fired: {},
    halfwayDone: false,
    locale,
    log: [],
    phase: "intro",
    precisionGate: null,
    turnIndex: -1,
    version: definition.version,
    startedAt: null,
    completedAt: null,
    sessionId: input.sessionId || newSessionId(),
    planId: input.planId ?? null,
    channel: input.channel ?? "web",
    sinceAck: 0
  };
}

export function getDefinition(state: QuestionnaireState): QuestionnaireDefinition {
  return getQuestionnaireDefinition(state.locale);
}

export function getTurn(
  definition: QuestionnaireDefinition,
  index: number
): TurnDef | null {
  if (index < 0 || index >= definition.turns.length) {
    return null;
  }

  return definition.turns[index] ?? null;
}

export function isVisibleTurn(
  definition: QuestionnaireDefinition,
  turn: TurnDef,
  answers: QuestionnaireAnswers
): boolean {
  if (
    answers.precisionGate === "skip" &&
    turn.opt &&
    turn.k !== "precisionGate"
  ) {
    const precisionKeys = new Set([
      "protein",
      "family",
      "tracker",
      "otherTracker",
      "fitness",
      "labs"
    ]);

    if (precisionKeys.has(turn.k)) {
      return false;
    }
  }

  return isTurnVisible(turn, answers);
}

function isAnswered(state: QuestionnaireState, turn: TurnDef): boolean {
  return (
    state.earned[turn.k] !== undefined ||
    (state.answers[turn.k] !== undefined && state.answers[turn.k] !== null)
  );
}

export function nextOpenIndex(
  definition: QuestionnaireDefinition,
  state: QuestionnaireState,
  from: number
): number {
  let j = from;

  while (j < definition.turns.length) {
    const turn = definition.turns[j]!;

    if (isVisibleTurn(definition, turn, state.answers) && !isAnswered(state, turn)) {
      return j;
    }

    j += 1;
  }

  return definition.turns.length;
}

export function computePrecision(
  definition: QuestionnaireDefinition,
  state: QuestionnaireState
): number {
  let essentialPoints = 0;
  let essentialMax = 0;
  let optionalPoints = 0;
  let optionalMax = 0;

  for (const turn of definition.turns) {
    if (!turn.pts || !isVisibleTurn(definition, turn, state.answers)) {
      continue;
    }

    if (turn.k === "labs") {
      for (const lab of definition.meta.labs) {
        const p = 1;
        if (turn.opt) {
          optionalMax += p;
          if (state.earned[lab.k]) {
            optionalPoints += p;
          }
        }
      }
      continue;
    }

    if (turn.opt || turn.optional) {
      optionalMax += turn.pts;
      if (state.earned[turn.k]) {
        optionalPoints += turn.pts;
      }
    } else {
      essentialMax += turn.pts;
      if (state.earned[turn.k]) {
        essentialPoints += turn.pts;
      }
    }
  }

  const raw =
    (essentialMax ? (essentialPoints / essentialMax) * 80 : 0) +
    (optionalMax ? (optionalPoints / optionalMax) * 20 : 0);

  return Math.max(8, Math.round(raw));
}

export function remainingInSection(
  definition: QuestionnaireDefinition,
  state: QuestionnaireState,
  sectionIndex: number,
  fromIdx: number
): number {
  let count = 0;

  for (let i = fromIdx; i < definition.turns.length; i += 1) {
    const turn = definition.turns[i]!;
    if (turn.sec !== sectionIndex) {
      break;
    }

    if (
      isVisibleTurn(definition, turn, state.answers) &&
      !isAnswered(state, turn)
    ) {
      count += 1;
    }
  }

  return count;
}

function remainingHint(
  definition: QuestionnaireDefinition,
  remaining: number
): string {
  const ui = definition.ui;

  if (remaining <= 1) {
    return ui.leftLast || "Last one in this section";
  }

  return (ui.leftMany || "{n} to go in this section").replace(
    "{n}",
    String(remaining)
  );
}

function pruneInvisibleAnswers(
  definition: QuestionnaireDefinition,
  state: QuestionnaireState
): QuestionnaireState {
  const next = cloneState(state);
  const answers = { ...next.answers };
  const earned = { ...next.earned };

  for (const turn of definition.turns) {
    if (
      turn.cond &&
      !isVisibleTurn(definition, turn, answers) &&
      answers[turn.k] !== undefined
    ) {
      delete answers[turn.k];
      delete earned[turn.k];
    }
  }

  return { ...next, answers, earned };
}

function appendLog(
  state: QuestionnaireState,
  messages: readonly LogMessage[]
): QuestionnaireState {
  return { ...state, log: [...state.log, ...messages] };
}

function sectionLeadIn(definition: QuestionnaireDefinition): string {
  return (
    definition.ui.inThisSection ||
    (definition.lang === "th" ? "ในส่วนนี้เราจะ…" : "In this section we…")
  );
}

function sectionMessage(
  definition: QuestionnaireDefinition,
  sectionIndex: number
): LogMessage {
  const section = definition.sections[sectionIndex]!;

  return {
    kind: "section",
    sectionIndex,
    eyebrow: section.eyebrow,
    title: section.title,
    desc: section.desc,
    leadIn: sectionLeadIn(definition),
    pose: section.pose || "open"
  };
}


function botMessage(
  definition: QuestionnaireDefinition,
  state: QuestionnaireState,
  turnIndex: number
): LogMessage {
  const turn = definition.turns[turnIndex]!;
  const remaining = remainingInSection(
    definition,
    state,
    turn.sec,
    turnIndex
  );

  return {
    kind: "bot",
    turnKey: turn.k,
    turnIndex,
    pose: turn.pose || "open",
    question: turn.q,
    why: turn.why,
    remainingHint: turn.nosec ? undefined : remainingHint(definition, remaining)
  };
}

function firstNameToken(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().split(/\s+/)[0]?.slice(0, 20) || "";
}

function applyVeganAutofill(
  definition: QuestionnaireDefinition,
  state: QuestionnaireState,
  dietValue: unknown
): {
  state: QuestionnaireState;
  didAutofill: boolean;
  veganReact: { pose: string; text: string } | null;
} {
  let next = cloneState(state);
  let didAutofill = false;

  if (dietValue === "vegan") {
    const autofill = definition.meta.autofill || {};
    const answers = { ...next.answers };
    const earned = { ...next.earned };
    const autoFilled = new Set(next.autoFilled);

    for (const [key, value] of Object.entries(autofill)) {
      if (answers[key] === undefined) {
        answers[key] = value;
        const turn = definition.turns.find((t) => t.k === key);
        earned[key] = turn?.pts || 2;
        autoFilled.add(key);
        didAutofill = true;
      }
    }

    next = {
      ...next,
      answers,
      earned,
      autoFilled: [...autoFilled]
    };

    if (didAutofill) {
      return {
        state: next,
        didAutofill: true,
        veganReact: {
          pose: definition.react.diet_plant?.[0]
            ? String(definition.react.diet_plant[0])
            : "vegan",
          text: definition.veganSkip || String(definition.react.diet_plant?.[1] || "")
        }
      };
    }
  } else if (next.autoFilled.length > 0) {
    const answers = { ...next.answers };
    const earned = { ...next.earned };

    for (const key of next.autoFilled) {
      delete answers[key];
      delete earned[key];
    }

    next = { ...next, answers, earned, autoFilled: [] };
  }

  return { state: next, didAutofill: false, veganReact: null };
}

function maybeHalfway(
  definition: QuestionnaireDefinition,
  state: QuestionnaireState
): QuestionnaireState {
  if (state.halfwayDone) {
    return state;
  }

  let total = 0;
  let answered = 0;

  for (const turn of definition.turns) {
    if (turn.req && isVisibleTurn(definition, turn, state.answers)) {
      total += 1;
      if (state.answers[turn.k] !== undefined) {
        answered += 1;
      }
    }
  }

  if (!total || answered / total < 0.5) {
    return state;
  }

  const name = firstNameToken(state.answers.firstName);
  const nameBit = name
    ? (definition.nameSuffix || "").replace("{n}", name)
    : "";
  const text = (definition.halfway || "").replace("{n}", nameBit);

  if (!text) {
    return { ...state, halfwayDone: true };
  }

  return appendLog(
    { ...state, halfwayDone: true },
    [
      {
        kind: "ack",
        pose: "celebrate",
        text,
        id: "halfway"
      }
    ]
  );
}

/** Begin the chat after intro (or fresh start). */
export function startQuestionnaire(state: QuestionnaireState): {
  state: QuestionnaireState;
  events: QuestionnaireEvent[];
} {
  const definition = getDefinition(state);
  let next = cloneState(state);
  const events: QuestionnaireEvent[] = [];

  if (next.phase === "intro" || next.phase === "resume_prompt") {
    events.push({ type: "chat_start", sessionId: next.sessionId });
  }

  const introMessage: LogMessage = {
    kind: "intro",
    pose: "ask",
    text: definition.ui.introHi,
    hint: definition.ui.introHint
  };

  next = {
    ...next,
    phase: "active",
    startedAt: next.startedAt ?? Date.now(),
    log: [introMessage]
  };

  const first = nextOpenIndex(definition, next, 0);

  if (first >= definition.turns.length) {
    return completeQuestionnaire(next, events);
  }

  const turn = definition.turns[first]!;

  if (turn.nosec) {
    // Warm-up (firstName) — intro + question only
    next = { ...next, turnIndex: first };
    next = appendLog(next, [botMessage(definition, next, first)]);
  } else {
    events.push({ type: "chat_part_break", sectionIndex: turn.sec });
    next = {
      ...next,
      turnIndex: first,
      log: [
        introMessage,
        sectionMessage(definition, turn.sec),
        botMessage(definition, { ...next, turnIndex: first }, first)
      ]
    };
  }

  return { state: next, events };
}

export function restoreWithResumePrompt(
  state: QuestionnaireState
): QuestionnaireState {
  return { ...cloneState(state), phase: "resume_prompt" };
}

function labelForValue(
  turn: TurnDef,
  value: unknown,
  definition: QuestionnaireDefinition
): string {
  if (turn.kind === "multi" && Array.isArray(value)) {
    const labels = value.map((v) => {
      const opt = turn.opts?.find((o) => o.v === v);
      return opt?.l ?? String(v);
    });

    return labels.join(" · ");
  }

  if (turn.kind === "sliders" && value && typeof value === "object") {
    const body = value as { h?: string; w?: string };
    return `${body.h ?? ""} ${definition.ui.cm} · ${body.w ?? ""} ${definition.ui.kg}`;
  }

  if (turn.kind === "swatch") {
    return (definition.ui.toneLabel || "Tone {n}").replace(
      "{n}",
      String(value)
    );
  }

  if (turn.kind === "confirm") {
    return turn.btn || definition.ui.confirm || "Confirmed";
  }

  if (turn.kind === "gate") {
    return value === "skip"
      ? definition.ui.precisionSkip
      : definition.ui.precisionGo;
  }

  if (turn.kind === "fitness" && value && typeof value === "object") {
    const fit = value as { vo2?: string; hrv?: string };
    const parts: string[] = [];
    if (fit.vo2) {
      parts.push(`VO₂ ${fit.vo2}`);
    }

    if (fit.hrv) {
      parts.push(`HRV ${fit.hrv}`);
    }

    return parts.join(" · ") || "—";
  }

  if (turn.kind === "labs" && value && typeof value === "object") {
    return Object.keys(value as object)
      .filter((k) => !k.startsWith("unit_"))
      .join(" · ") || "—";
  }

  if (turn.opts) {
    const opt = turn.opts.find((o) => o.v === value);
    if (opt) {
      return opt.l;
    }
  }

  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

function validateAnswer(
  turn: TurnDef,
  value: unknown,
  definition: QuestionnaireDefinition
): string | null {
  const ui = definition.ui;

  if (turn.kind === "multi") {
    if (!Array.isArray(value) || value.length === 0) {
      return ui.needAnswer || "Pick an answer first";
    }

    if (turn.max && value.length > turn.max) {
      return ui.pickMax3 || "Too many choices";
    }

    return null;
  }

  if (turn.kind === "single" || turn.kind === "swatch") {
    if (value === undefined || value === null || value === "") {
      return ui.needAnswer || "Pick an answer first";
    }

    return null;
  }

  if (turn.kind === "confirm") {
    if (value !== true && value !== "true" && value !== 1) {
      return ui.needAnswer || "Please confirm";
    }

    return null;
  }

  if (turn.kind === "sliders") {
    if (!value || typeof value !== "object") {
      return ui.needAnswer || "Pick an answer first";
    }

    return null;
  }

  if (turn.kind === "gate") {
    if (value !== "go" && value !== "skip") {
      return ui.needAnswer || "Pick an answer first";
    }

    return null;
  }

  return null;
}

function applyValueToAnswers(
  definition: QuestionnaireDefinition,
  state: QuestionnaireState,
  turn: TurnDef,
  value: unknown
): { answers: QuestionnaireAnswers; earned: Record<string, number> } {
  const answers = { ...state.answers };
  const earned = { ...state.earned };

  if (turn.kind === "sliders" && value && typeof value === "object") {
    const body = value as { h?: unknown; w?: unknown };
    answers.hw = value;
    answers.height = body.h;
    answers.weight = body.w;
    earned[turn.k] = turn.pts ?? 0;
    earned.height = 2;
    earned.weight = 2;
    return { answers, earned };
  }

  if (turn.kind === "fitness" && value && typeof value === "object") {
    const fit = value as { vo2?: unknown; hrv?: unknown };
    answers.fitness = value;
    if (fit.vo2) {
      answers.vo2 = fit.vo2;
    }

    if (fit.hrv) {
      answers.hrv = fit.hrv;
    }

    earned[turn.k] = turn.pts ?? 0;
    return { answers, earned };
  }

  if (turn.kind === "labs" && value && typeof value === "object") {
    const labs = value as Record<string, unknown>;
    const labOnly: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(labs)) {
      if (v === undefined || v === null || v === "") {
        continue;
      }

      answers[k] = v;
      if (k.startsWith("unit_")) {
        continue;
      }

      labOnly[k] = v;
      earned[k] = 1;
    }

    answers.labs = labOnly;
    earned[turn.k] = turn.pts ?? 0;
    return { answers, earned };
  }

  if (turn.kind === "confirm") {
    answers[turn.k] = true;
    earned[turn.k] = turn.pts ?? 0;
    return { answers, earned };
  }

  if (turn.kind === "gate") {
    answers.precisionGate = value;
    answers[turn.k] = value;
    earned[turn.k] = 0;
    return { answers, earned };
  }

  answers[turn.k] = value;
  earned[turn.k] = turn.pts ?? 0;
  return { answers, earned };
}

export function applyAnswer(
  state: QuestionnaireState,
  turnKey: string,
  value: unknown,
  options?: { label?: string }
): ApplyAnswerResult {
  const definition = getDefinition(state);
  let next = cloneState(state);
  const events: QuestionnaireEvent[] = [];

  if (next.phase !== "active") {
    return { ok: false, error: "Questionnaire is not active", state: next };
  }

  const turnIndex =
    next.turnIndex >= 0
      ? next.turnIndex
      : definition.turns.findIndex((t) => t.k === turnKey);
  const turn = turnIndex >= 0 ? definition.turns[turnIndex] : null;

  if (!turn || turn.k !== turnKey) {
    return {
      ok: false,
      error: `Turn mismatch: expected ${turn?.k ?? "none"}, got ${turnKey}`,
      state: next
    };
  }

  const validationError = validateAnswer(turn, value, definition);
  if (validationError) {
    return { ok: false, error: validationError, state: next };
  }

  // Empty optional text → skip (firstName empty still advances)
  if (
    turn.kind === "text" &&
    (value === "" || value === null || value === undefined) &&
    (turn.optional || turn.req === 0)
  ) {
    return skipTurn(next, turnKey);
  }

  const applied = applyValueToAnswers(definition, next, turn, value);
  next = { ...next, answers: applied.answers, earned: applied.earned };
  next = pruneInvisibleAnswers(definition, next);

  const label = options?.label ?? labelForValue(turn, value, definition);

  next = appendLog(next, [
    {
      kind: "user",
      turnKey: turn.k,
      turnIndex,
      label
    }
  ]);

  events.push({ type: "chat_answer", turnKey: turn.k, value });

  let reacted = false;

  // Vegan adaptive autofill
  if (turn.k === "diet") {
    const vegan = applyVeganAutofill(definition, next, value);
    next = vegan.state;
    if (vegan.didAutofill) {
      events.push({ type: "chat_autofill", diet: "vegan" });
      if (vegan.veganReact?.text) {
        next = {
          ...next,
          fired: { ...next.fired, vg: 1 },
          log: [
            ...next.log,
            {
              kind: "react",
              pose: vegan.veganReact.pose,
              text: vegan.veganReact.text,
              id: "vg"
            }
          ]
        };
        reacted = true;
      }
    }
  }

  if (!reacted) {
    const reaction = selectReaction(definition, turn, value, next.fired);
    if (reaction) {
      reacted = true;
      next = {
        ...next,
        fired: { ...next.fired, [reaction.id]: 1 },
        log: [
          ...next.log,
          {
            kind: "react",
            pose: reaction.pose,
            text: reaction.text,
            id: reaction.id
          }
        ]
      };
    }
  }

  // firstName meet line (personalisation — not generic "got it" acks)
  if (turn.k === "firstName") {
    const name = firstNameToken(value);
    if (name && definition.meetLine) {
      const text = definition.meetLine.replace("{n}", name);
      next = appendLog(next, [
        {
          kind: "ack",
          pose: "celebrate",
          text,
          id: "meet"
        }
      ]);
    }
  }

  next = maybeHalfway(definition, next);

  // Precision skip: jump past optional block
  if (turn.kind === "gate" && value === "skip") {
    events.push({ type: "chat_precision_skip" });
    let j = turnIndex + 1;

    while (j < definition.turns.length && definition.turns[j]!.opt) {
      const optTurn = definition.turns[j]!;
      next = {
        ...next,
        answers: { ...next.answers, [optTurn.k]: null },
        earned: { ...next.earned, [optTurn.k]: 0 }
      };
      j += 1;
    }

    return advanceFrom(next, turnIndex, events);
  }

  return advanceFrom(next, turnIndex, events);
}

export function skipTurn(
  state: QuestionnaireState,
  turnKey: string
): ApplyAnswerResult {
  const definition = getDefinition(state);
  let next = cloneState(state);
  const events: QuestionnaireEvent[] = [];

  if (next.phase !== "active") {
    return { ok: false, error: "Questionnaire is not active", state: next };
  }

  const turnIndex = next.turnIndex;
  const turn = turnIndex >= 0 ? definition.turns[turnIndex] : null;

  if (!turn || turn.k !== turnKey) {
    return {
      ok: false,
      error: `Cannot skip turn ${turnKey}`,
      state: next
    };
  }

  if (turn.req === 1 && !turn.optional && !turn.opt) {
    return {
      ok: false,
      error: definition.ui.needAnswer || "This question is required",
      state: next
    };
  }

  next = {
    ...next,
    answers: { ...next.answers, [turn.k]: null },
    earned: { ...next.earned, [turn.k]: 0 },
    log: [
      ...next.log,
      {
        kind: "user",
        turnKey: turn.k,
        turnIndex,
        label: definition.ui.skip || "Skipped"
      }
    ]
  };
  events.push({ type: "chat_skip", turnKey: turn.k });

  return advanceFrom(next, turnIndex, events);
}

function advanceFrom(
  state: QuestionnaireState,
  fromIndex: number,
  events: QuestionnaireEvent[]
): ApplyAnswerResult {
  const definition = getDefinition(state);
  let next = cloneState(state);
  const current = definition.turns[fromIndex]!;
  const nextIdx = nextOpenIndex(definition, next, fromIndex + 1);

  if (nextIdx >= definition.turns.length) {
    const completed = completeQuestionnaire(next, events);
    return { ok: true, state: completed.state, events: completed.events };
  }

  const nextTurn = definition.turns[nextIdx]!;
  const needsSectionIntro =
    !nextTurn.nosec &&
    !next.log.some(
      (m) => m.kind === "section" && m.sectionIndex === nextTurn.sec
    );

  if (nextTurn.sec !== current.sec) {
    events.push({ type: "chat_section_done", sectionIndex: current.sec });
  }

  if (needsSectionIntro) {
    events.push({ type: "chat_part_break", sectionIndex: nextTurn.sec });
    next = appendLog(next, [sectionMessage(definition, nextTurn.sec)]);
  }

  next = { ...next, turnIndex: nextIdx };
  next = appendLog(next, [botMessage(definition, next, nextIdx)]);

  return { ok: true, state: next, events };
}

export function completeQuestionnaire(
  state: QuestionnaireState,
  priorEvents: QuestionnaireEvent[] = []
): { state: QuestionnaireState; events: QuestionnaireEvent[] } {
  const definition = getDefinition(state);
  const precision = computePrecision(definition, state);
  const events: QuestionnaireEvent[] = [
    ...priorEvents,
    { type: "chat_complete", precision }
  ];

  // Optional stageDone line from master UI (copy only — no extra icons)
  let next = cloneState(state);
  if (definition.ui.stageDone) {
    next = appendLog(next, [
      {
        kind: "system",
        text: definition.ui.stageDone
      }
    ]);
  }

  return {
    state: {
      ...next,
      phase: "complete",
      turnIndex: definition.turns.length,
      completedAt: Date.now()
    },
    events
  };
}

export function getNextPrompt(state: QuestionnaireState): NextPrompt {
  const definition = getDefinition(state);
  const precision = computePrecision(definition, state);

  if (state.phase === "complete" || state.phase === "completing") {
    return {
      complete: true,
      phase: state.phase,
      precision,
      section: null,
      sectionIndex: null,
      turn: null,
      turnIndex: state.turnIndex,
      remainingInSection: 0,
      remainingHint: "",
      reaction: null
    };
  }

  if (state.phase !== "active" || state.turnIndex < 0) {
    return {
      complete: false,
      phase: state.phase,
      precision,
      section: null,
      sectionIndex: null,
      turn: null,
      turnIndex: state.turnIndex,
      remainingInSection: 0,
      remainingHint: "",
      reaction: null
    };
  }

  const turn = definition.turns[state.turnIndex]!;
  const section: SectionDef | null = definition.sections[turn.sec] ?? null;
  const remaining = remainingInSection(
    definition,
    state,
    turn.sec,
    state.turnIndex
  );

  const lastReact = [...state.log].reverse().find((m) => m.kind === "react");

  return {
    complete: false,
    phase: state.phase,
    precision,
    section,
    sectionIndex: turn.sec,
    turn,
    turnIndex: state.turnIndex,
    remainingInSection: remaining,
    remainingHint: turn.nosec ? "" : remainingHint(definition, remaining),
    reaction:
      lastReact && lastReact.kind === "react"
        ? { pose: lastReact.pose, text: lastReact.text }
        : null
  };
}

export function isQuestionnaireComplete(state: QuestionnaireState): boolean {
  if (state.phase === "complete") {
    return true;
  }

  const definition = getDefinition(state);

  for (const turn of definition.turns) {
    if (!isVisibleTurn(definition, turn, state.answers)) {
      continue;
    }

    if (turn.req === 1 && !turn.opt && !isAnswered(state, turn)) {
      return false;
    }
  }

  return true;
}

export function serializeState(state: QuestionnaireState): string {
  return JSON.stringify(state);
}

export function deserializeState(raw: string): QuestionnaireState | null {
  try {
    const parsed = JSON.parse(raw) as QuestionnaireState;

    if (!parsed || typeof parsed !== "object" || !parsed.sessionId) {
      return null;
    }

    // Backfill v6 fields if restoring older drafts
    return {
      ...parsed,
      autoFilled: Array.isArray(parsed.autoFilled) ? parsed.autoFilled : [],
      halfwayDone: Boolean(parsed.halfwayDone),
      sinceAck: typeof parsed.sinceAck === "number" ? parsed.sinceAck : 0
    };
  } catch {
    return null;
  }
}
