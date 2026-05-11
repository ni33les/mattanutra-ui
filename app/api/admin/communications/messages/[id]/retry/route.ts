import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { retryCommunicationMessage } from "@/lib/communications";
import { readJsonObject, taskApiError, textValue } from "@/lib/openclaw-api";

export const runtime = "nodejs";

type RetryCommunicationRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function unauthorized() {
  return NextResponse.json(
    { message: "Admin communication access is not authorized" },
    {
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="mattanutra-openclaw-api"'
      },
      status: 401
    }
  );
}

export async function POST(
  request: Request,
  { params }: RetryCommunicationRouteProps
) {
  const body = await readJsonObject(request);
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textValue(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return unauthorized();
  }

  const { id } = await params;

  try {
    const retry = await retryCommunicationMessage(id);

    return NextResponse.json(
      { retry },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: retry.message.status === "no_channel" ? 202 : 200
      }
    );
  } catch (error) {
    return taskApiError(error, "Unable to retry communication message");
  }
}
