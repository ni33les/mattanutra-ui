import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  applyProductCatalogueCsvImport,
  type ProductCatalogueCsvScope
} from "@/lib/product-catalogue-csv";

export const runtime = "nodejs";

function textOrNull(value: unknown, max = 2_000_000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function csvScope(value: unknown): ProductCatalogueCsvScope {
  return value === "retail" ? "retail" : "platform";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken, 2000);

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

  const csvText = textOrNull(body.csvText);

  if (!csvText) {
    return NextResponse.json(
      { message: "csvText is required" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const result = await applyProductCatalogueCsvImport({
      csvText,
      organisationId: textOrNull(body.organisationId, 80),
      scope: csvScope(body.scope)
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
    console.error("Unable to import product catalogue CSV", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to import product catalogue CSV"
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
