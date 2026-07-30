import { NextResponse } from "next/server";
import {
  createInitialState,
  deserializeState,
  getDefinition,
  computePrecision,
  serializeState,
  startQuestionnaire
} from "@/lib/questionnaire/engine";
import { QuestionnaireAgentCoordinator } from "@/lib/questionnaire/agents";
import { isLocale } from "@/lib/i18n";
import { bpmContextFromBody, writeBpmEvent } from "@/lib/bpm";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import type { QuestionnaireChannel } from "@/lib/questionnaire/types";

export const runtime = "nodejs";

const log = createLogger("api.questionnaire.session");

/**
 * Lightweight session bootstrap + tool invoke for multi-channel use.
 * Web primarily runs the engine client-side and POSTs checkpoints here.
 *
 * POST body:
 *  - action: "create" | "invoke" | "checkpoint"
 *  - locale, channel, state?, tool?, args?
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(
    request,
    publicRateLimits.assessmentPost
  );

  if (limited) {
    return limited;
  }

  let body: {
    action?: string;
    locale?: string;
    channel?: QuestionnaireChannel;
    state?: string | object;
    tool?: string;
    args?: Record<string, unknown>;
    sectionIndex?: number;
    planId?: string;
    bpm?: unknown;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const action = body.action || "create";
  const locale = isLocale(body.locale) ? body.locale : "en";
  const channel: QuestionnaireChannel = body.channel || "web";
  const bpm = bpmContextFromBody(body);

  try {
    if (action === "create") {
      let state = createInitialState({ locale, channel, planId: body.planId });
      const started = startQuestionnaire(state);
      state = started.state;

      for (const event of started.events) {
        await writeBpmEvent({
          actorType: "visitor",
          attribution: bpm.attribution,
          eventName: event.type,
          eventType: "funnel",
          locale,
          planId: body.planId,
          properties: {
            channel,
            questionnaireVersion: "v6-conversational",
            sessionId: state.sessionId
          },
          ray: typeof bpm.ray === "string" ? bpm.ray : null
        }).catch((err) => log.warn("bpm event failed", { err }));
      }

      return NextResponse.json({
        sessionId: state.sessionId,
        state,
        serialized: serializeState(state),
        precision: computePrecision(getDefinition(state), state)
      });
    }

    if (action === "checkpoint") {
      const raw =
        typeof body.state === "string"
          ? body.state
          : body.state
            ? JSON.stringify(body.state)
            : "";
      const state = deserializeState(raw);

      if (!state) {
        return NextResponse.json(
          { message: "Invalid questionnaire state" },
          { status: 400 }
        );
      }

      const sectionIndex =
        typeof body.sectionIndex === "number" ? body.sectionIndex : -1;

      await writeBpmEvent({
        actorType: "visitor",
        attribution: bpm.attribution,
        eventName: "chat_part_checkpoint",
        eventType: "funnel",
        locale,
        planId: body.planId || state.planId || undefined,
        properties: {
          channel: state.channel,
          questionnaireVersion: "v6-conversational",
          sessionId: state.sessionId,
          sectionIndex,
          part: sectionIndex + 1,
          precision: computePrecision(getDefinition(state), state),
          turnIndex: state.turnIndex,
          answerKeys: Object.keys(state.answers)
        },
        ray: typeof bpm.ray === "string" ? bpm.ray : null
      }).catch((err) => log.warn("checkpoint bpm failed", { err }));

      return NextResponse.json({
        ok: true,
        sessionId: state.sessionId,
        sectionIndex
      });
    }

    if (action === "invoke") {
      const tool = body.tool;
      if (!tool) {
        return NextResponse.json(
          { message: "tool is required" },
          { status: 400 }
        );
      }

      let coordinator: QuestionnaireAgentCoordinator | null = null;

      if (typeof body.state === "string") {
        coordinator = QuestionnaireAgentCoordinator.fromSerialized(body.state, {
          locale,
          channel,
          planId: body.planId
        });
      } else if (body.state && typeof body.state === "object") {
        coordinator = QuestionnaireAgentCoordinator.fromSerialized(
          JSON.stringify(body.state),
          { locale, channel, planId: body.planId }
        );
      }

      if (!coordinator) {
        coordinator = new QuestionnaireAgentCoordinator({
          locale,
          channel,
          planId: body.planId
        });
      }

      const result = await coordinator.invoke({
        name: tool as "start_session",
        args: body.args
      });

      return NextResponse.json({
        result,
        state: coordinator.state,
        serialized: coordinator.serialize()
      });
    }

    return NextResponse.json({ message: "Unknown action" }, { status: 400 });
  } catch (error) {
    log.error("questionnaire session error", { error });
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Questionnaire session error"
      },
      { status: 500 }
    );
  }
}
