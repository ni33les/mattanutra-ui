/**
 * Questionnaire agent group — single façade for web, LINE, and future AI chats.
 *
 * Agents:
 * - conversation: deterministic turns (no LLM)
 * - capture: normalize + assessment API
 * - progress: BPM / part checkpoints
 *
 * AI chat integration later: register `allQuestionnaireToolSpecs()` on the
 * chat tool router and route calls through `QuestionnaireAgentCoordinator`.
 */

import {
  CONVERSATION_AGENT_CAPABILITIES,
  CONVERSATION_AGENT_ID,
  conversationToolSpecs,
  createConversationSession,
  runConversationTool,
  type ConversationAgentSession
} from "@/lib/questionnaire/agents/conversation-agent";
import {
  CAPTURE_AGENT_CAPABILITIES,
  CAPTURE_AGENT_ID,
  captureToolSpecs,
  runCaptureTool
} from "@/lib/questionnaire/agents/capture-agent";
import {
  PROGRESS_AGENT_CAPABILITIES,
  PROGRESS_AGENT_ID,
  emitQuestionnaireEvents,
  type BpmTrackFn
} from "@/lib/questionnaire/agents/progress-agent";
import {
  deserializeState,
  serializeState
} from "@/lib/questionnaire/engine";
import type {
  QuestionnaireChannel,
  QuestionnaireLocale,
  QuestionnaireState,
  QuestionnaireToolCall,
  QuestionnaireToolResult
} from "@/lib/questionnaire/types";
import type { Locale } from "@/lib/i18n";

export {
  CONVERSATION_AGENT_ID,
  CONVERSATION_AGENT_CAPABILITIES,
  CAPTURE_AGENT_ID,
  CAPTURE_AGENT_CAPABILITIES,
  PROGRESS_AGENT_ID,
  PROGRESS_AGENT_CAPABILITIES
};

export const QUESTIONNAIRE_AGENT_GROUP = {
  id: "questionnaire",
  name: "Deterministic chat questionnaire",
  agents: [
    {
      id: CONVERSATION_AGENT_ID,
      capabilities: CONVERSATION_AGENT_CAPABILITIES
    },
    {
      id: CAPTURE_AGENT_ID,
      capabilities: CAPTURE_AGENT_CAPABILITIES
    },
    {
      id: PROGRESS_AGENT_ID,
      capabilities: PROGRESS_AGENT_CAPABILITIES
    }
  ]
} as const;

export function allQuestionnaireToolSpecs() {
  return [...conversationToolSpecs(), ...captureToolSpecs()];
}

export type CoordinatorOptions = Readonly<{
  locale: QuestionnaireLocale | string;
  channel?: QuestionnaireChannel;
  sessionId?: string;
  planId?: string | null;
  trackBpm?: BpmTrackFn;
  capture?: {
    contactEmail?: string | null;
    paymentId?: string | null;
    resumeToken?: string | null;
    fetchImpl?: typeof fetch;
    bpm?: Record<string, unknown>;
  };
}>;

export class QuestionnaireAgentCoordinator {
  private session: ConversationAgentSession;
  private readonly options: CoordinatorOptions;

  constructor(options: CoordinatorOptions) {
    this.options = options;
    this.session = createConversationSession({
      locale: options.locale,
      channel: options.channel ?? "agent",
      sessionId: options.sessionId,
      planId: options.planId
    });
  }

  static fromSerialized(
    raw: string,
    options: CoordinatorOptions
  ): QuestionnaireAgentCoordinator | null {
    const state = deserializeState(raw);
    if (!state) {
      return null;
    }

    const coord = new QuestionnaireAgentCoordinator({
      ...options,
      locale: state.locale,
      channel: state.channel,
      sessionId: state.sessionId,
      planId: state.planId
    });
    coord.session = { state };
    return coord;
  }

  get state(): QuestionnaireState {
    return this.session.state;
  }

  serialize(): string {
    return serializeState(this.session.state);
  }

  /**
   * Execute one tool call. Safe entry point for AI chat tool routers.
   */
  async invoke(call: QuestionnaireToolCall): Promise<QuestionnaireToolResult> {
    if (call.name === "finalize_assessment") {
      const { state, result } = await runCaptureTool(
        this.session.state,
        call.args ?? {},
        this.options.capture
      );
      this.session = { state };
      await this.emit(result.events ?? []);
      return result;
    }

    if (call.name === "resume_session") {
      const raw = call.args?.state;
      if (typeof raw === "string") {
        const restored = deserializeState(raw);
        if (restored) {
          this.session = { state: restored };
          return {
            ok: true,
            name: "resume_session",
            data: { phase: restored.phase, sessionId: restored.sessionId }
          };
        }
      }

      if (call.args?.state && typeof call.args.state === "object") {
        this.session = { state: call.args.state as QuestionnaireState };
        return {
          ok: true,
          name: "resume_session",
          data: {
            phase: this.session.state.phase,
            sessionId: this.session.state.sessionId
          }
        };
      }

      return {
        ok: false,
        name: "resume_session",
        error: "Missing state to resume"
      };
    }

    const { session, result } = runConversationTool(this.session, call);
    this.session = session;
    await this.emit(result.events ?? []);
    return result;
  }

  private async emit(
    events: readonly import("@/lib/questionnaire/types").QuestionnaireEvent[]
  ) {
    if (!this.options.trackBpm || events.length === 0) {
      return;
    }

    const locale = (
      this.session.state.locale === "zh-CN" ? "zh-CN" : this.session.state.locale
    ) as Locale;

    await emitQuestionnaireEvents(events, this.options.trackBpm, {
      locale,
      planId: this.session.state.planId ?? undefined,
      channel: this.session.state.channel
    });
  }
}

/** OpenAI / Grok-style tool definitions for AI chat registration. */
export function questionnaireToolsForLlm() {
  return allQuestionnaireToolSpecs().map((spec) => ({
    type: "function" as const,
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters
    }
  }));
}
