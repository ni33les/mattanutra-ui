import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { sourceProductFdaApprovalNumbers } from "@/lib/product-fda-sourcing";
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

function booleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function fdaSourcePayload(body: Record<string, unknown>) {
  return {
    includeManufacturerEvidence:
      booleanOrNull(body.includeManufacturerEvidence) ?? false,
    limit: numberOrNull(body.limit) ?? 120,
    maxRunMs: numberOrNull(body.maxRunMs) ?? 180_000,
    productId: textOrNull(body.productId, 80)
  };
}

function backgroundFdaSourcePayload(body: Record<string, unknown>) {
  const payload = fdaSourcePayload(body);

  return {
    ...payload,
    limit: Math.max(payload.limit, 500),
    maxRunMs: Math.max(payload.maxRunMs, 600_000)
  };
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
          : "Unable to load FDA sourcing task"
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
    const mode = textOrNull(body.mode, 40);
    const payload = mode === "sync"
      ? fdaSourcePayload(body)
      : backgroundFdaSourcePayload(body);

    if (mode === "sync") {
      const result = await sourceProductFdaApprovalNumbers(payload);

      return NextResponse.json(
        { result },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const created = await createTask({
      actorType: "system",
      context: {
        source: "admin_product_fda_source_button"
      },
      description:
        "Source missing FDA approval numbers from product identifiers and product names.",
      idempotencyKey: `source-product-fda-approvals:${payload.productId ?? "all"}`,
      idempotencyScope: "active",
      idempotencyScopeKey: "product-regulatory-sourcing",
      maxAttempts: 1,
      organisationId: null,
      payload,
      priorityReason: "Admin requested missing FDA sourcing.",
      priorityScore: 420,
      requiredCapabilities:
        requiredCapabilitiesForWorkTaskType("generate_product_recommendations"),
      retryPolicy: {
        maxRetries: 0
      },
      sourceEntityId: payload.productId,
      sourceEntityType: payload.productId ? "product" : null,
      taskType: "source_product_fda_approvals",
      title: payload.productId
        ? "Source missing FDA for product"
        : "Source missing FDA approvals"
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
    console.error("Unable to source product FDA approval numbers", error);

    return NextResponse.json(
      {
        message: error instanceof Error
          ? error.message
          : "Unable to source product FDA approval numbers"
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
