import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { resolveAccessPrincipal } from "@/lib/access-principal";
import { isUuid } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { createTask } from "@/lib/task-service";

export const runtime = "nodejs";

type ContentType = "blog_post" | "testimonial";
type ContentWorkflowStatus = "deleted" | "draft" | "published" | "scheduled";
type ContentStorageStatus = "archived" | "draft" | "published";

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

function contentStatus(value: unknown): ContentWorkflowStatus | null {
  return value === "archived" || value === "deleted"
    ? "deleted"
    : value === "draft" || value === "published" || value === "scheduled"
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

function storageStatus(status: ContentWorkflowStatus): ContentStorageStatus {
  return status === "deleted"
    ? "archived"
    : status === "scheduled"
      ? "published"
      : status;
}

function statusVerb(status: ContentWorkflowStatus) {
  if (status === "scheduled") {
    return "Schedule";
  }

  if (status === "published") {
    return "Publish";
  }

  if (status === "deleted") {
    return "Delete";
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
  const principal = await resolveAccessPrincipal(request, {
    allowAgent: true,
    allowLegacy: "admin_claw",
    allowSession: true,
    requiredPermission: "content.write"
  });

  if (!principal && !adminDashboardOrClawRequestAllowed(request, accessToken)) {
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
  const requestedStatus = contentStatus(body.targetStatus ?? body.status);
  const contentId = textOrNull(body.contentId);
  const publishAt = scheduledDate(body.publishAt ?? body.scheduledFor);

  if (!selectedContentType || !contentId || !isUuid(contentId) || !requestedStatus) {
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

  if (requestedStatus === "scheduled" && (!publishAt || publishAt <= new Date())) {
    return NextResponse.json(
      { message: "Scheduled content needs a future publish date" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const machineRequest =
      principal?.type === "agent" ||
      (principal?.type === "legacy_token" && principal.source === "admin_claw");
    const targetStatus = storageStatus(requestedStatus);
    const scheduledFor =
      requestedStatus === "scheduled" && publishAt ? publishAt : new Date();
    const { task } = await createTask({
      actorType: "deterministic",
      businessValue: 250,
      context: {
        contentId,
        contentType: selectedContentType,
        publishAt: publishAt?.toISOString() ?? null,
        requestedStatus,
        targetStatus
      },
      description: "Apply an approved content status change through the platform API.",
      groupLabel: `${statusVerb(requestedStatus)} content`,
      idempotencyKey: `content-status:${selectedContentType}:${contentId}:${requestedStatus}:${scheduledFor.toISOString()}`,
      idempotencyScopeKey: `content:${selectedContentType}:${contentId}`,
      initialComment: {
        authorName: "Admin API",
        authorType: "system",
        body: `${statusVerb(requestedStatus)} requested for ${selectedContentType} ${contentId}.`,
        commentType: "instruction",
        visibility: "worker"
      },
      organisationId:
        principal?.type === "agent" ? principal.organisation.id : undefined,
      payload: {
        contentId,
        contentType: selectedContentType,
        publishAt: publishAt?.toISOString() ?? null,
        requestedStatus,
        requestedBy:
          principal?.type === "agent" ? principal.agentName : machineRequest ? "machine_api" : "admin_dashboard",
        targetStatus
      },
      reasoningEffort: "none",
      requiredCapabilities: [AGENT_CAPABILITIES.contentPublish],
      scheduledFor,
      taskType: "content_status_change",
      title: `${statusVerb(requestedStatus)} content`
    });

    await writeBpmEvent({
      actorType: machineRequest ? "openclaw" : "admin",
      eventName: "content_workflow_requested",
      eventType: "content",
      properties: {
        contentId,
        contentType: selectedContentType,
        publishAt: publishAt?.toISOString() ?? null,
        requestedStatus,
        targetStatus,
        taskId: task.id
      }
    });

    return NextResponse.json(
      { task },
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
