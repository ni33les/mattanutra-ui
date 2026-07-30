/**
 * Conversation agent — owns the deterministic turn machine.
 * No LLM. AI chats later call the same tools without inventing keys/values.
 */

import {
  applyAnswer,
  computePrecision,
  createInitialState,
  getDefinition,
  getNextPrompt,
  skipTurn,
  startQuestionnaire
} from "@/lib/questionnaire/engine";
import type {
  QuestionnaireChannel,
  QuestionnaireEvent,
  QuestionnaireLocale,
  QuestionnaireState,
  QuestionnaireToolCall,
  QuestionnaireToolResult
} from "@/lib/questionnaire/types";

export const CONVERSATION_AGENT_ID = "questionnaire.conversation";
export const CONVERSATION_AGENT_CAPABILITIES = [
  "questionnaire.turn",
  "questionnaire.progress",
  "questionnaire.session"
] as const;

export type ConversationAgentSession = {
  state: QuestionnaireState;
};

export function createConversationSession(input: {
  locale: QuestionnaireLocale | string;
  channel?: QuestionnaireChannel;
  sessionId?: string;
  planId?: string | null;
}): ConversationAgentSession {
  return {
    state: createInitialState(input)
  };
}

export function conversationToolSpecs() {
  return [
    {
      name: "start_session" as const,
      description:
        "Start or restart the deterministic health questionnaire. Does not invent questions — uses the fixed v6-conversational turn list.",
      parameters: {
        type: "object",
        properties: {
          locale: { type: "string", enum: ["en", "th", "zh-CN"] },
          channel: {
            type: "string",
            enum: ["web", "line", "agent", "api"]
          },
          forceRestart: { type: "boolean" }
        }
      }
    },
    {
      name: "get_next_prompt" as const,
      description:
        "Return the current question, options, pose, and precision. Read-only.",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "submit_answer" as const,
      description:
        "Submit an answer for the current turn. Value must match an option value or structured field for special kinds. Never invent new field keys.",
      parameters: {
        type: "object",
        properties: {
          turnKey: { type: "string" },
          value: {},
          label: { type: "string" }
        },
        required: ["turnKey", "value"]
      }
    },
    {
      name: "skip_turn" as const,
      description: "Skip the current optional turn.",
      parameters: {
        type: "object",
        properties: { turnKey: { type: "string" } },
        required: ["turnKey"]
      }
    },
    {
      name: "get_progress" as const,
      description: "Return precision percent and phase.",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "get_state_snapshot" as const,
      description:
        "Return serializable state for handoff to another channel or AI chat.",
      parameters: { type: "object", properties: {} }
    }
  ];
}

export function runConversationTool(
  session: ConversationAgentSession,
  call: QuestionnaireToolCall
): { session: ConversationAgentSession; result: QuestionnaireToolResult } {
  const { name, args = {} } = call;
  let state = session.state;

  try {
    switch (name) {
      case "start_session": {
        const locale =
          (typeof args.locale === "string" ? args.locale : state.locale) ||
          "en";
        const channel =
          (typeof args.channel === "string"
            ? (args.channel as QuestionnaireChannel)
            : state.channel) || "agent";

        if (args.forceRestart || state.phase === "intro") {
          state = createInitialState({
            locale,
            channel,
            sessionId: state.sessionId,
            planId: state.planId
          });
        }

        const started = startQuestionnaire(state);
        state = started.state;
        const events: QuestionnaireEvent[] = [...started.events];

        return {
          session: { state },
          result: {
            ok: true,
            name,
            data: {
              prompt: getNextPrompt(state),
              sessionId: state.sessionId
            },
            events
          }
        };
      }

      case "get_next_prompt":
        return {
          session: { state },
          result: {
            ok: true,
            name,
            data: getNextPrompt(state)
          }
        };

      case "submit_answer": {
        const turnKey = String(args.turnKey ?? "");
        const applied = applyAnswer(state, turnKey, args.value, {
          label: typeof args.label === "string" ? args.label : undefined
        });

        if (!applied.ok) {
          return {
            session: { state },
            result: {
              ok: false,
              name,
              error: applied.error,
              data: { prompt: getNextPrompt(state) }
            }
          };
        }

        return {
          session: { state: applied.state },
          result: {
            ok: true,
            name,
            data: {
              prompt: getNextPrompt(applied.state),
              complete: applied.state.phase === "complete"
            },
            events: applied.events
          }
        };
      }

      case "skip_turn": {
        const turnKey = String(args.turnKey ?? "");
        const applied = skipTurn(state, turnKey);

        if (!applied.ok) {
          return {
            session: { state },
            result: { ok: false, name, error: applied.error }
          };
        }

        return {
          session: { state: applied.state },
          result: {
            ok: true,
            name,
            data: {
              prompt: getNextPrompt(applied.state),
              complete: applied.state.phase === "complete"
            },
            events: applied.events
          }
        };
      }

      case "get_progress": {
        const definition = getDefinition(state);
        return {
          session: { state },
          result: {
            ok: true,
            name,
            data: {
              precision: computePrecision(definition, state),
              phase: state.phase,
              turnIndex: state.turnIndex,
              turnCount: definition.turns.length,
              sessionId: state.sessionId,
              planId: state.planId
            }
          }
        };
      }

      case "get_state_snapshot":
        return {
          session: { state },
          result: {
            ok: true,
            name,
            data: { state }
          }
        };

      case "resume_session":
      case "finalize_assessment":
        return {
          session: { state },
          result: {
            ok: false,
            name,
            error: `Tool ${name} is handled by the coordinator / capture agent`
          }
        };

      default:
        return {
          session: { state },
          result: { ok: false, name, error: `Unknown tool: ${name}` }
        };
    }
  } catch (error) {
    return {
      session: { state },
      result: {
        ok: false,
        name,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
