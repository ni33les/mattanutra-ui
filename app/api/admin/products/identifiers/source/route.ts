import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  createTask,
  getTaskBundle
} from "@/lib/task-service";
import { requiredCapabilitiesForWorkTaskType } from "@/lib/system-agents";

export const runtime = "nodejs";

function textOrNull(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function taskResponse(task: Awaited<ReturnType<typeof getTaskBundle>>["task"]) {
  return {
    result: task.resultPayload,
    status: task.status,
    task: {
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      id: task.id,
      status: task.status,
      taskType: task.taskType,
      title: task.title,
      updatedAt: task.updatedAt
    }
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ??
    textOrNull(url.searchParams.get("accessToken"));
  const taskId = textOrNull(url.searchParams.get("taskId"), 80);

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

  if (!taskId) {
    return NextResponse.json(
      { message: "taskId is required" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const bundle = await getTaskBundle({ taskId });

    return NextResponse.json(taskResponse(bundle.task), {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error
          ? error.message
          : "Unable to load identifier sourcing task"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
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

  try {
    const productId = textOrNull(body.productId, 80);
    const limit = Math.max(1, Math.min(2000, Math.round(
      numberOrNull(body.limit) ?? 2000
    )));
    const created = await createTask({
      actorType: "system",
      context: {
        source: "admin_product_identifier_source_task"
      },
      description:
        "Source missing EAN, UPC, and manufacturer SKU identifiers from trusted product evidence.",
      idempotencyKey: `source-product-identifiers:${productId ?? "all"}`,
      idempotencyScope: "active",
      idempotencyScopeKey: "product-identifier-sourcing",
      maxAttempts: 1,
      organisationId: null,
      payload: {
        limit,
        productId
      },
      priorityReason: "Admin requested missing product identifier sourcing.",
      priorityScore: 420,
      requiredCapabilities:
        requiredCapabilitiesForWorkTaskType("source_product_identifiers"),
      retryPolicy: {
        maxRetries: 0
      },
      sourceEntityId: productId,
      sourceEntityType: productId ? "product" : null,
      taskType: "source_product_identifiers",
      title: productId
        ? "Source missing identifiers for product"
        : "Source missing product identifiers"
    });

    return NextResponse.json(
      {
        queued: true,
        reused: !created.created,
        ...taskResponse(created.task)
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Unable to source product identifiers", error);

    return NextResponse.json(
      {
        message: error instanceof Error
          ? error.message
          : "Unable to source product identifiers"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
