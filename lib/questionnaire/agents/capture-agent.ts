/**
 * Capture agent — normalizes chat answers and persists via /api/assessment.
 * Channel-agnostic: web UI, LINE, or AI chat all call finalize the same way.
 */

import { toAssessmentAnswers, extraChatFields } from "@/lib/questionnaire/normalize";
import { computePrecision, getDefinition } from "@/lib/questionnaire/engine";
import type {
  QuestionnaireEvent,
  QuestionnaireState,
  QuestionnaireToolResult
} from "@/lib/questionnaire/types";
import type { Answers } from "@/components/assessment-flow-state";

export const CAPTURE_AGENT_ID = "questionnaire.capture";
export const CAPTURE_AGENT_CAPABILITIES = [
  "questionnaire.normalize",
  "questionnaire.finalize",
  "assessment.capture"
] as const;

export type CaptureFinalizeInput = Readonly<{
  state: QuestionnaireState;
  contactEmail?: string | null;
  paymentId?: string | null;
  pharmacyId?: string | null;
  planId?: string | null;
  resumeToken?: string | null;
  /** Absolute or relative assessment API base; default same-origin. */
  assessmentUrl?: string;
  bpm?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}>;

export type CaptureFinalizeResult = Readonly<{
  ok: boolean;
  planId?: string;
  healthScore?: unknown;
  status?: string;
  answers?: Answers;
  error?: string;
  events: readonly QuestionnaireEvent[];
}>;

export function buildCapturePayload(state: QuestionnaireState) {
  const definition = getDefinition(state);
  const answers = toAssessmentAnswers(state.answers);
  const precision = computePrecision(definition, state);

  return {
    version: state.version,
    lang: state.locale,
    precision,
    answers,
    chatAnswers: state.answers,
    extra: extraChatFields(state.answers),
    startedAt: state.startedAt,
    completedAt: state.completedAt ?? Date.now(),
    sessionId: state.sessionId,
    channel: state.channel
  };
}

/**
 * Finalize: normalize + POST/PATCH assessment capture.
 * Uses fetch so it works from browser or server (pass fetchImpl on server if needed).
 */
export async function finalizeAssessmentCapture(
  input: CaptureFinalizeInput
): Promise<CaptureFinalizeResult> {
  const events: QuestionnaireEvent[] = [];
  const payload = buildCapturePayload(input.state);
  const fetchFn = input.fetchImpl ?? fetch;
  const planId = input.planId || input.state.planId || null;

  const body = {
    answers: payload.answers,
    contactEmail: input.contactEmail || undefined,
    intent: "capture" as const,
    locale: input.state.locale === "zh-CN" ? "zh-CN" : input.state.locale,
    paymentId: input.paymentId || undefined,
    pharmacyId: input.pharmacyId || undefined,
    resumeToken: input.resumeToken || undefined,
    bpm: {
      ...(input.bpm || {}),
      properties: {
        ...((input.bpm?.properties as object) || {}),
        channel: input.state.channel,
        questionnaireVersion: input.state.version,
        precision: payload.precision,
        sessionId: input.state.sessionId,
        chatExtra: payload.extra
      }
    }
  };

  try {
    const url = planId
      ? `/api/assessment/${encodeURIComponent(planId)}`
      : "/api/assessment";
    const method = planId ? "PATCH" : "POST";

    const response = await fetchFn(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    if (!response.ok) {
      const message = `Assessment capture failed (${response.status})`;
      events.push({ type: "chat_capture_failed", message });
      return {
        ok: false,
        error: message,
        answers: payload.answers,
        events
      };
    }

    const status = (await response.json()) as {
      planId?: string;
      status?: string;
      healthScore?: unknown;
    };

    return {
      ok: true,
      planId: status.planId,
      healthScore: status.healthScore,
      status: status.status,
      answers: payload.answers,
      events
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    events.push({ type: "chat_capture_failed", message });
    return {
      ok: false,
      error: message,
      answers: payload.answers,
      events
    };
  }
}

export function captureToolSpecs() {
  return [
    {
      name: "finalize_assessment" as const,
      description:
        "Normalize answers and create/update an assessment plan, then Health Score can be loaded. Call only when the questionnaire is complete.",
      parameters: {
        type: "object",
        properties: {
          contactEmail: { type: "string" },
          planId: { type: "string" },
          paymentId: { type: "string" },
          resumeToken: { type: "string" }
        }
      }
    }
  ];
}

export async function runCaptureTool(
  state: QuestionnaireState,
  args: Record<string, unknown> = {},
  options?: Omit<CaptureFinalizeInput, "state">
): Promise<{ state: QuestionnaireState; result: QuestionnaireToolResult }> {
  if (state.phase !== "complete" && state.phase !== "completing") {
    return {
      state,
      result: {
        ok: false,
        name: "finalize_assessment",
        error: "Questionnaire is not complete"
      }
    };
  }

  const completing: QuestionnaireState = {
    ...state,
    phase: "completing"
  };

  const captured = await finalizeAssessmentCapture({
    state: completing,
    contactEmail:
      typeof args.contactEmail === "string" ? args.contactEmail : options?.contactEmail,
    paymentId:
      typeof args.paymentId === "string" ? args.paymentId : options?.paymentId,
    planId: typeof args.planId === "string" ? args.planId : options?.planId,
    resumeToken:
      typeof args.resumeToken === "string" ? args.resumeToken : options?.resumeToken,
    bpm: options?.bpm,
    fetchImpl: options?.fetchImpl
  });

  if (!captured.ok) {
    return {
      state: { ...completing, phase: "failed" },
      result: {
        ok: false,
        name: "finalize_assessment",
        error: captured.error,
        events: captured.events
      }
    };
  }

  return {
    state: {
      ...completing,
      phase: "complete",
      planId: captured.planId ?? completing.planId
    },
    result: {
      ok: true,
      name: "finalize_assessment",
      data: {
        planId: captured.planId,
        status: captured.status,
        healthScore: captured.healthScore
      },
      events: captured.events
    }
  };
}
