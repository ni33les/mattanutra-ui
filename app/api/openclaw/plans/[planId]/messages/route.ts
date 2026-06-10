import {
  openClawJson,
  requireOpenClawAccess,
  taskApiError
} from "@/lib/openclaw-api";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import {
  appendPlanChatMessage,
  loadPlanChatMessages
} from "@/lib/plan-concierge";
import { enqueueNutritionPlanChatReplyTask } from "@/lib/task-worker";

export const runtime = "nodejs";

type OpenClawPlanRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request, { params }: OpenClawPlanRouteProps) {
  const { unauthorized } = await requireOpenClawAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { planId } = await params;

  try {
    const sql = getSql();

    if (!sql || !isUuid(planId)) {
      return openClawJson({ message: "Plan not found" }, { status: 404 });
    }

    return openClawJson({
      messages: await loadPlanChatMessages(sql, planId),
      planId
    });
  } catch (error) {
    return taskApiError(error, "Unable to load OpenClaw plan messages");
  }
}

export async function POST(request: Request, { params }: OpenClawPlanRouteProps) {
  const { unauthorized } = await requireOpenClawAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { planId } = await params;

  try {
    const sql = getSql();
    const body = objectValue(await request.json().catch(() => ({})));
    const role = body.role === "assistant" ? "assistant" : "user";

    if (!sql || !isUuid(planId)) {
      return openClawJson({ message: "Plan not found" }, { status: 404 });
    }

    const message = await appendPlanChatMessage(sql, {
      body: text(body.body),
      channel: "unknown",
      externalMessageId: text(body.externalMessageId) || null,
      feedback: body.feedback,
      metadata: {
        source: "openclaw"
      },
      planId,
      replyToMessageId: isUuid(text(body.replyToMessageId))
        ? text(body.replyToMessageId)
        : null,
      role,
      source: "openclaw",
      status: role === "user" ? "queued" : "ready"
    });
    const taskId =
      role === "user"
        ? await enqueueNutritionPlanChatReplyTask({
            messageId: message.messageId,
            planId
          })
        : null;

    return openClawJson(
      {
        messageId: message.messageId,
        planId,
        taskId
      },
      { status: 202 }
    );
  } catch (error) {
    return taskApiError(error, "Unable to append OpenClaw plan message");
  }
}
