"use client";

import { useCallback, useEffect, useRef } from "react";
import { trackBpmEvent } from "@/lib/bpm-client";
import { QuestionDisplayTracker } from "@/lib/questionnaire/telemetry";
import type { QuestionnaireState, TurnDef } from "@/lib/questionnaire/types";
import type { Locale } from "@/lib/i18n";

export function useQuestionnaireTelemetry(input: {
  state: QuestionnaireState | null; turn: TurnDef | null; visible: boolean;
  locale: Locale; review: boolean; planId?: string;
}) {
  const tracker = useRef(new QuestionDisplayTracker());
  const { state, turn, visible, locale, review, planId } = input;
  useEffect(() => {
    if (!visible || !state || !turn) return;
    const emit = () => {
      if (document.visibilityState !== "visible") return;
      const properties = tracker.current.show(state, turn.k, turn.sec, review);
      if (properties) trackBpmEvent("chat_question_viewed", { eventType: "funnel", locale, planId, properties });
    };
    // The question and composer must have painted, not merely entered engine state.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(emit); });
    document.addEventListener("visibilitychange", emit);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", emit); };
  }, [state, turn, visible, locale, review, planId]);

  const activity = useCallback(() => {
    if (!visible || document.visibilityState !== "visible") return;
    const properties = tracker.current.activity();
    if (properties) trackBpmEvent("chat_question_activity", { eventType: "funnel", locale, planId, properties });
  }, [visible, locale, planId]);
  const display = useCallback(() => tracker.current.display, []);
  const stamp = useCallback(() => tracker.current.stamp(), []);
  const close = useCallback(() => tracker.current.close(), []);
  return { display, stamp, close, activity };
}
