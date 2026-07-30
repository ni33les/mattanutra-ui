/**
 * Deterministic chat questionnaire types (v6-conversational).
 * Headless: shared by web UI, LINE adapters, and AI chat tool calls.
 * Master: files/c-q.zip (q-v6-en/th.html + IT HANDOFF).
 */

export type QuestionnaireLocale = "en" | "th" | "zh-CN";

export type TurnKind =
  | "multi"
  | "single"
  | "text"
  | "confirm"
  | "gate"
  | "sliders"
  | "swatch"
  | "fitness"
  | "labs";

export type TurnCondition =
  | "female"
  | "femaleCycle"
  | "medsYes"
  | "medOther"
  | "suppOther"
  | "trackerOther";

export type TurnOption = Readonly<{
  l: string;
  v: string;
}>;

export type TurnDef = Readonly<{
  btn?: string;
  cond?: TurnCondition | string;
  excl?: readonly string[];
  finish?: number | boolean;
  k: string;
  kind: TurnKind;
  max?: number;
  /** Skip section intro card for this turn (v6 firstName). */
  nosec?: number | boolean;
  opt?: number | boolean;
  optional?: boolean;
  opts?: readonly TurnOption[];
  ph?: string;
  pose?: string;
  pts?: number;
  q: string;
  req?: number;
  sec: number;
  why?: string;
}>;

export type SectionDef = Readonly<{
  desc: string;
  eyebrow: string;
  pose?: string;
  title: string;
}>;

export type ReactLine = readonly [pose: string, text: string];

export type QuestionnaireUi = Readonly<Record<string, string>>;

export type LabDef = Readonly<{
  k: string;
  n: string;
  u: readonly string[];
}>;

export type AcksDef = Readonly<{
  pool: readonly string[];
  spec: Readonly<Record<string, Readonly<Record<string, string>>>>;
}>;

export type QuestionnaireMeta = Readonly<{
  autofill: Readonly<Record<string, string>>;
  eventsKey: string;
  height: Readonly<{ default: number; max: number; min: number }>;
  labs: readonly LabDef[];
  skinColors: readonly string[];
  skinValues: readonly string[];
  storageKey: string;
  weight: Readonly<{ default: number; max: number; min: number }>;
}>;

export type QuestionnaireDefinition = Readonly<{
  acks: AcksDef;
  halfway: string;
  lang: string;
  meetLine: string;
  meta: QuestionnaireMeta;
  nameFmt: string;
  nameSuffix: string;
  react: Readonly<Record<string, ReactLine | readonly string[]>>;
  sections: readonly SectionDef[];
  turns: readonly TurnDef[];
  ui: QuestionnaireUi;
  veganSkip: string;
  version: string;
}>;

/** Raw answers as collected by the chat engine (flat keys). */
export type QuestionnaireAnswers = Record<string, unknown>;

export type LogMessage =
  | Readonly<{
      kind: "intro";
      pose: string;
      text: string;
      hint?: string;
    }>
  | Readonly<{
      kind: "section";
      sectionIndex: number;
      eyebrow: string;
      title: string;
      desc: string;
      /** e.g. "In this section we…" — product lead-in before desc */
      leadIn: string;
      pose: string;
    }>
  | Readonly<{
      kind: "bot";
      turnKey: string;
      turnIndex: number;
      pose: string;
      question: string;
      why?: string;
      remainingHint?: string;
    }>
  | Readonly<{
      kind: "user";
      turnKey: string;
      turnIndex: number;
      label: string;
    }>
  | Readonly<{
      kind: "react";
      pose: string;
      text: string;
      id: string;
    }>
  | Readonly<{
      kind: "ack";
      pose: string;
      text: string;
      id: string;
    }>
  | Readonly<{
      kind: "system";
      text: string;
    }>;

export type QuestionnairePhase =
  | "intro"
  | "resume_prompt"
  | "active"
  | "completing"
  | "complete"
  | "failed";

export type QuestionnaireState = Readonly<{
  answers: QuestionnaireAnswers;
  /** Keys auto-filled by vegan diet path (cleared if diet changes). */
  autoFilled: readonly string[];
  channel: QuestionnaireChannel;
  completedAt: number | null;
  /** Points earned per turn key (or lab_*) for precision vial. */
  earned: Readonly<Record<string, number>>;
  /** Reaction / halfway ids already shown. */
  fired: Readonly<Record<string, number>>;
  halfwayDone: boolean;
  locale: QuestionnaireLocale;
  log: readonly LogMessage[];
  phase: QuestionnairePhase;
  planId: string | null;
  /** Precision gate: go | skip | unset */
  precisionGate: "go" | "skip" | null;
  sessionId: string;
  /** Answers since last ack (for pool rotation). */
  sinceAck: number;
  startedAt: number | null;
  /** Index of current open turn, or -1 before start / after complete. */
  turnIndex: number;
  version: string;
}>;

export type QuestionnaireChannel = "web" | "line" | "agent" | "api";

export type ApplyAnswerResult =
  | Readonly<{
      ok: true;
      state: QuestionnaireState;
      events: readonly QuestionnaireEvent[];
    }>
  | Readonly<{
      ok: false;
      error: string;
      state: QuestionnaireState;
    }>;

export type QuestionnaireEvent =
  | Readonly<{ type: "chat_view"; channel: QuestionnaireChannel }>
  | Readonly<{ type: "chat_start"; sessionId: string }>
  | Readonly<{ type: "chat_answer"; turnKey: string; value: unknown }>
  | Readonly<{ type: "chat_skip"; turnKey: string }>
  | Readonly<{ type: "chat_section_done"; sectionIndex: number }>
  | Readonly<{ type: "chat_precision_skip" }>
  | Readonly<{ type: "chat_complete"; precision: number }>
  | Readonly<{ type: "chat_part_break"; sectionIndex: number }>
  | Readonly<{ type: "chat_capture_failed"; message: string }>
  | Readonly<{ type: "chat_ack"; text: string }>
  | Readonly<{ type: "chat_autofill"; diet: string }>;

/** Tool-facing prompt for the current turn (AI chat / LINE). */
export type NextPrompt = Readonly<{
  complete: boolean;
  phase: QuestionnairePhase;
  precision: number;
  section: SectionDef | null;
  sectionIndex: number | null;
  turn: TurnDef | null;
  turnIndex: number;
  remainingInSection: number;
  remainingHint: string;
  reaction: { pose: string; text: string } | null;
}>;

export type QuestionnaireToolName =
  | "start_session"
  | "resume_session"
  | "get_next_prompt"
  | "submit_answer"
  | "skip_turn"
  | "get_progress"
  | "get_state_snapshot"
  | "finalize_assessment";

export type QuestionnaireToolCall = Readonly<{
  name: QuestionnaireToolName;
  args?: Readonly<Record<string, unknown>>;
}>;

export type QuestionnaireToolResult = Readonly<{
  ok: boolean;
  name: QuestionnaireToolName;
  data?: unknown;
  error?: string;
  events?: readonly QuestionnaireEvent[];
}>;
