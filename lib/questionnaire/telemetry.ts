import type { QuestionnaireState } from "./types";

/** Independent of the capture key: a restart may reuse its saved-draft session. */
export function questionnaireAttemptContext(state: QuestionnaireState, review = false) {
  return {
    telemetryVersion: 1,
    questionnaireVersion: state.version,
    sessionId: state.sessionId,
    attemptId: `${state.sessionId}:${state.startedAt ?? "legacy"}`,
    postCompletionReview: review || Boolean(state.completedAt && state.phase === "active")
  };
}

export type QuestionDisplay = ReturnType<typeof questionnaireAttemptContext> & {
  turnKey: string;
  turnIndex: number;
  sectionIndex: number;
  displayId: string;
};

/** One display survives overlays and tab hiding; answering/editing closes it. */
export class QuestionDisplayTracker {
  display: QuestionDisplay | null = null;
  private activityAt = 0;
  private clock = 0;

  stamp(now = Date.now()) {
    this.clock = Math.max(now, this.clock + 1);
    return { clientAt: this.clock, telemetryEventId: globalThis.crypto.randomUUID() };
  }

  show(state: QuestionnaireState, turnKey: string, sectionIndex: number, review = false, now = Date.now()) {
    const context = questionnaireAttemptContext(state, review);
    if (this.display?.attemptId === context.attemptId && this.display.turnKey === turnKey) return null;
    this.display = { ...context, turnKey, turnIndex: state.turnIndex, sectionIndex, displayId: globalThis.crypto.randomUUID() };
    this.activityAt = now;
    return { ...this.display, ...this.stamp(now) };
  }

  activity(now = Date.now()) {
    if (!this.display || now - this.activityAt < 60_000) return null;
    this.activityAt = now;
    return { ...this.display, ...this.stamp(now) };
  }

  close() { this.display = null; }
}

/** Only these metadata fields may cross from a capture request into analytics. */
export function captureQuestionnaireContext(state: unknown) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return {};
  const value = state as QuestionnaireState;
  if (value.version !== "v6-conversational" || typeof value.sessionId !== "string" || !value.sessionId || value.sessionId.length > 200) return {};
  if (value.startedAt !== null && (!Number.isSafeInteger(value.startedAt) || value.startedAt < 0)) return {};
  return questionnaireAttemptContext(value);
}
