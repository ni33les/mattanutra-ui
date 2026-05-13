import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { readJsonObject, taskApiError, textValue } from "@/lib/openclaw-api";
import { retryFailedTask } from "@/lib/task-service";

export const runtime = "nodejs";

type RetryTaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function unauthorized() {
  return NextResponse.json(
    { message: "Admin task access is not authorized" },
    {
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="mattanutra-openclaw-api"'
      },
      status: 401
    }
  );
}

export async function POST(request: Request, { params }: RetryTaskRouteProps) {
  const body = await readJsonObject(request);
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textValue(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return unauthorized();
  }

  const { id } = await params;

  try {
    const retry = await retryFailedTask({
      taskId: id
    });

    return NextResponse.json(
      { retry },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: retry.created ? 201 : 200
      }
    );
  } catch (error) {
    return taskApiError(error, "Unable to retry task");
  }
}
