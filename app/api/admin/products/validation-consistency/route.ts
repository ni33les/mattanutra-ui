import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  checkProductValidationConsistency,
  repairProductValidationConsistency
} from "@/lib/admin-products";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

function textOrNull(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function positiveIntegerOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function optionsFromRequest(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  const productId =
    textOrNull(body?.productId, 80) ?? textOrNull(url.searchParams.get("productId"), 80);
  const limit =
    positiveIntegerOrNull(body?.limit) ??
    positiveIntegerOrNull(url.searchParams.get("limit"));

  if (productId && !isUuid(productId)) {
    throw new Error("Product not found");
  }

  return {
    limit,
    productId
  };
}

function accessTokenFromRequest(request: Request, body?: Record<string, unknown>) {
  return request.headers.get("x-admin-dashboard-token") ??
    textOrNull(body?.accessToken) ??
    new URL(request.url).searchParams.get("access_token");
}

export async function GET(request: Request) {
  const accessToken = accessTokenFromRequest(request);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return NextResponse.json(
      { message: "Not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  try {
    const report = await checkProductValidationConsistency(
      optionsFromRequest(request)
    );

    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error
          ? error.message
          : "Unable to check product validation consistency"
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 400
      }
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = accessTokenFromRequest(request, body);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return NextResponse.json(
      { message: "Not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  try {
    const report = await repairProductValidationConsistency({
      actor: "admin_dashboard",
      ...optionsFromRequest(request, body)
    });

    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error
          ? error.message
          : "Unable to repair product validation consistency"
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 400
      }
    );
  }
}
