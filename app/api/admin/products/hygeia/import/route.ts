import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  applyHygeiaImport,
  previewHygeiaImport,
  type HygeiaImportType
} from "@/lib/hygeia-product-files";

export const runtime = "nodejs";

function textOrNull(value: unknown, max = 2_000_000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function hygeiaImportType(value: unknown): HygeiaImportType | null {
  return value === "identity" || value === "stock" || value === "cost"
    ? value
    : null;
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
  const importType = hygeiaImportType(body.importType);

  if (!csvText || !importType) {
    return NextResponse.json(
      { message: "csvText and importType are required" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const result = body.apply === true
      ? await applyHygeiaImport({
          actor: "admin_dashboard",
          csvText,
          importType,
          organisationId: textOrNull(body.organisationId, 80)
        })
      : await previewHygeiaImport({
          csvText,
          importType
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
    console.error("Unable to import Hygeia product file", error);

    return NextResponse.json(
      {
        message: error instanceof Error
          ? error.message
          : "Unable to import Hygeia product file"
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
