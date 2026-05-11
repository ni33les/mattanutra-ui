import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  getAdminConversionTargets,
  updateAdminConversionTargets
} from "@/lib/admin-flow-data";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store"
} as const;

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, 2000) : null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function unauthorized() {
  return NextResponse.json(
    { message: "Not found" },
    {
      headers: noStoreHeaders,
      status: 404
    }
  );
}

export async function GET(request: Request) {
  if (!adminDashboardOrClawRequestAllowed(request)) {
    return unauthorized();
  }

  const targets = await getAdminConversionTargets();

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), targets },
    { headers: noStoreHeaders }
  );
}

export async function PATCH(request: Request) {
  const body = objectValue(await request.json().catch(() => ({})));
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return unauthorized();
  }

  try {
    const targets = await updateAdminConversionTargets({
      actor: textOrNull(body.actor) ?? "admin_dashboard",
      targets: objectValue(body.targets)
    });

    return NextResponse.json(
      { generatedAt: new Date().toISOString(), targets },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error("Unable to update conversion targets", { error });

    return NextResponse.json(
      { message: "Unable to update conversion targets" },
      {
        headers: noStoreHeaders,
        status: 400
      }
    );
  }
}
