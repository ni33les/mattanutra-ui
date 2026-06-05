import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { sourceProductIdentifiers } from "@/lib/product-identifiers";

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
    const result = await sourceProductIdentifiers({
      limit: numberOrNull(body.limit) ?? undefined,
      productId: textOrNull(body.productId, 80)
    });

    return NextResponse.json(
      { result },
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
