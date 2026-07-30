/**
 * Progress agent — maps questionnaire events → BPM funnel events.
 * Keeps part-break / answer telemetry consistent across web, LINE, agent.
 */

import type { QuestionnaireEvent } from "@/lib/questionnaire/types";
import type { Locale } from "@/lib/i18n";

export const PROGRESS_AGENT_ID = "questionnaire.progress";
export const PROGRESS_AGENT_CAPABILITIES = [
  "questionnaire.telemetry",
  "bpm.write"
] as const;

export type BpmTrackFn = (
  eventName: string,
  payload?: {
    eventType?: string;
    locale?: Locale;
    planId?: string;
    properties?: Record<string, unknown>;
  }
) => void | Promise<void>;

/** Map internal chat events to BPM event names. */
export function bpmEventName(event: QuestionnaireEvent): string | null {
  switch (event.type) {
    case "chat_view":
      return "chat_view";
    case "chat_start":
      return "chat_start";
    case "chat_answer":
      return "chat_answer";
    case "chat_skip":
      return "chat_skip";
    case "chat_section_done":
      return "chat_section_done";
    case "chat_part_break":
      return "chat_part_break";
    case "chat_precision_skip":
      return "chat_precision_skip";
    case "chat_complete":
      return "chat_complete";
    case "chat_capture_failed":
      return "chat_capture_failed";
    case "chat_ack":
      return "chat_ack";
    case "chat_autofill":
      return "chat_autofill";
    default:
      return null;
  }
}

export function eventProperties(
  event: QuestionnaireEvent
): Record<string, unknown> {
  switch (event.type) {
    case "chat_view":
      return { channel: event.channel };
    case "chat_start":
      return { sessionId: event.sessionId };
    case "chat_answer":
      return {
        turnKey: event.turnKey,
        valueType: Array.isArray(event.value)
          ? "array"
          : typeof event.value
      };
    case "chat_skip":
      return { turnKey: event.turnKey };
    case "chat_section_done":
    case "chat_part_break":
      return { sectionIndex: event.sectionIndex };
    case "chat_complete":
      return { precision: event.precision };
    case "chat_capture_failed":
      return { message: event.message };
    case "chat_precision_skip":
      return {};
    case "chat_ack":
      return { text: event.text };
    case "chat_autofill":
      return { diet: event.diet };
    default:
      return {};
  }
}

export async function emitQuestionnaireEvents(
  events: readonly QuestionnaireEvent[],
  track: BpmTrackFn,
  context: { locale: Locale; planId?: string; channel?: string }
): Promise<void> {
  for (const event of events) {
    const name = bpmEventName(event);
    if (!name) {
      continue;
    }

    await track(name, {
      eventType: "funnel",
      locale: context.locale,
      planId: context.planId,
      properties: {
        channel: context.channel,
        questionnaireVersion: "v6-conversational",
        ...eventProperties(event)
      }
    });
  }
}

/**
 * Per-part save checkpoint payload (server draft).
 * sectionIndex is 0-based part number.
 */
export function partCheckpointPayload(
  sectionIndex: number,
  stateSummary: {
    sessionId: string;
    answers: Record<string, unknown>;
    precision: number;
    turnIndex: number;
  }
) {
  return {
    event: "chat_part_checkpoint",
    sectionIndex,
    part: sectionIndex + 1,
    partsTotal: 6,
    ...stateSummary
  };
}
