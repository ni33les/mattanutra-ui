"use client";

import { useCallback, useEffect, useRef } from "react";
import { trackBpmEvent } from "@/lib/bpm-client";
import { QuestionDisplayTracker } from "@/lib/questionnaire/telemetry";
import { getQuestionnaireDefinition } from "@/lib/questionnaire/definition";
import type { QuestionnaireState, TurnDef } from "@/lib/questionnaire/types";
import type { Locale } from "@/lib/i18n";

export function useQuestionnaireTelemetry(input: {
  state: QuestionnaireState | null; turn?: TurnDef | null; turns?: readonly TurnDef[]; visible: boolean;
  locale: Locale; review: boolean; planId?: string;
}) {
  const trackers = useRef(new Map<string, QuestionDisplayTracker>());
  const clock = useRef(new QuestionDisplayTracker());
  const { state, turn, turns, visible, locale, review, planId } = input;
  useEffect(() => {
    if (!visible || !state) return;
    const shown = turns ?? (turn ? [turn] : []);
    for (const key of trackers.current.keys()) {
      if (!shown.some(item => item.k === key)) trackers.current.delete(key);
    }
    const emit = () => {
      if (document.visibilityState !== "visible") return;
      for (const item of shown) {
        let tracker = trackers.current.get(item.k);
        if (!tracker) { tracker = new QuestionDisplayTracker(); trackers.current.set(item.k, tracker); }
        const turnIndex = getQuestionnaireDefinition(state.locale, state.version).turns.findIndex(candidate => candidate.k === item.k);
        const properties = tracker.show({ ...state, turnIndex }, item.k, item.sec, review);
        if (properties) trackBpmEvent("chat_question_viewed", { eventType: "funnel", locale, planId, properties });
      }
    };
    // The question and composer must have painted, not merely entered engine state.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(emit); });
    document.addEventListener("visibilitychange", emit);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", emit); };
  }, [state, turn, turns, visible, locale, review, planId]);

  const activity = useCallback(() => {
    if (!visible || document.visibilityState !== "visible") return;
    for (const tracker of trackers.current.values()) {
      const properties = tracker.activity();
      if (properties) trackBpmEvent("chat_question_activity", { eventType: "funnel", locale, planId, properties });
    }
  }, [visible, locale, planId]);
  const displayFor = useCallback((key: string) => trackers.current.get(key)?.display ?? null, []);
  const display = useCallback(() => trackers.current.values().next().value?.display ?? null, []);
  const stamp = useCallback(() => clock.current.stamp(), []);
  const close = useCallback((key?: string) => {
    if (key) trackers.current.delete(key);
    else trackers.current.clear();
  }, []);
  return { display, displayFor, stamp, close, activity };
}
