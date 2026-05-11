import { NextResponse } from "next/server";
import {
  isAdminAlertSource,
  recordAdminAlertAction
} from "@/lib/admin-alert-actions";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";

export const runtime = "nodejs";

type AdminAlertRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, 2000) : null;
}

export async function POST(request: Request, { params }: AdminAlertRouteProps) {
  const [{ id }, body] = await Promise.all([
    params,
    request.json().catch(() => ({})) as Promise<Record<string, unknown>>
  ]);
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return NextResponse.json(
      { message: "Not found" },
      { headers: { "Cache-Control": "no-store" }, status: 404 }
    );
  }

  if (!isAdminAlertSource(body.source)) {
    return NextResponse.json(
      { message: "Alert source is required" },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }

  try {
    const acknowledgement = await recordAdminAlertAction({
      action: "acknowledged",
      actor: textOrNull(body.actor) ?? "admin_api",
      note: textOrNull(body.note),
      source: body.source,
      sourceId: id
    });

    return NextResponse.json(
      { acknowledgement },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Unable to acknowledge admin alert", { error, id });

    return NextResponse.json(
      { message: "Unable to acknowledge alert" },
      { headers: { "Cache-Control": "no-store" }, status: 500 }
    );
  }
}
