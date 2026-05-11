import { NextResponse } from "next/server";
import {
  adminClawRequestAllowed,
  adminDashboardOrClawRequestAllowed
} from "@/lib/admin-auth";
import { isUuid } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import { kickTaskWorker } from "@/lib/task-worker";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { createGoal, createTask } from "@/lib/task-service";
import { TASK_PRIORITY } from "@/lib/task-service-utils";

export const runtime = "nodejs";

type ContentType = "blog_post" | "testimonial";
type ContentStatus = "archived" | "draft" | "published" | "review";

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, 2000) : null;
}

function contentType(value: unknown): ContentType | null {
  return value === "blog_post" || value === "testimonial" ? value : null;
}

function contentStatus(value: unknown): ContentStatus | null {
  return value === "archived" ||
    value === "draft" ||
    value === "published" ||
    value === "review"
    ? value
    : null;
}

function scheduledDate(value: unknown) {
  const text = textOrNull(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date;
}

function statusVerb(status: ContentStatus) {
  if (status === "published") {
    return "Publish";
  }

  if (status === "review") {
    return "Send to review";
  }

  if (status === "archived") {
    return "Archive";
  }

  return "Move to draft";
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    message: error.message,
    name: error.name
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return NextResponse.json(
      { message: "Not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  const selectedContentType = contentType(body.contentType);
  const targetStatus = contentStatus(body.targetStatus ?? body.status);
  const contentId = textOrNull(body.contentId);
  const publishAt = scheduledDate(body.publishAt ?? body.scheduledFor);

  if (!selectedContentType || !contentId || !isUuid(contentId) || !targetStatus) {
    return NextResponse.json(
      { message: "Content workflow request is incomplete" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const machineRequest = adminClawRequestAllowed(request);
    const scheduledFor =
      targetStatus === "published" && publishAt ? publishAt : new Date();
    const goal = await createGoal({
      context: {
        contentId,
        contentType: selectedContentType,
        publishAt: publishAt?.toISOString() ?? null,
        targetStatus
      },
      priority: TASK_PRIORITY.normal,
      source: "admin_content_workflow",
      title: `${statusVerb(targetStatus)} content`,
      type: "system"
    });
    const { task } = await createTask({
      actorType: "deterministic",
      description: "Apply an approved content status change through the platform API.",
      goalId: goal.id,
      idempotencyKey: `content-status:${selectedContentType}:${contentId}:${targetStatus}:${scheduledFor.toISOString()}`,
      initialComment: {
        authorName: "Admin API",
        authorType: "system",
        body: `${statusVerb(targetStatus)} requested for ${selectedContentType} ${contentId}.`,
        commentType: "instruction",
        visibility: "worker"
      },
      payload: {
        contentId,
        contentType: selectedContentType,
        publishAt: publishAt?.toISOString() ?? null,
        requestedBy: machineRequest ? "machine_api" : "admin_dashboard",
        targetStatus
      },
      reasoningEffort: "none",
      requiredCapabilities: [AGENT_CAPABILITIES.contentPublish],
      scheduledFor,
      taskType: "content_status_change",
      title: `${statusVerb(targetStatus)} content`
    });

    await writeBpmEvent({
      actorType: machineRequest ? "openclaw" : "admin",
      eventName: "content_workflow_requested",
      eventType: "content",
      properties: {
        contentId,
        contentType: selectedContentType,
        goalId: goal.id,
        publishAt: publishAt?.toISOString() ?? null,
        targetStatus,
        taskId: task.id
      }
    });
    void kickTaskWorker();

    return NextResponse.json(
      { goal, task },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Unable to create content workflow", {
      error: errorDetails(error)
    });

    return NextResponse.json(
      { message: "Unable to create content workflow" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
