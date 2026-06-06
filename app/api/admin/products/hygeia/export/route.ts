import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { buildRetailHygeiaStockExportCsv } from "@/lib/hygeia-product-files";

export const runtime = "nodejs";

function textOrNull(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ??
    textOrNull(url.searchParams.get("access_token"));

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
    const scope = textOrNull(url.searchParams.get("scope"), 40);
    const organisationId = textOrNull(url.searchParams.get("organisationId"), 80);

    if (scope !== "retail" || !organisationId) {
      return NextResponse.json(
        { message: "Hygeia export is available from Retail Stock only" },
        {
          headers: {
            "Cache-Control": "no-store"
          },
          status: 400
        }
      );
    }

    const csv = await buildRetailHygeiaStockExportCsv({ organisationId });
    const filename = `hygeia-retail-stock-${organisationId}.csv`;

    return new Response(csv, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  } catch (error) {
    console.error("Unable to export Hygeia product file", error);

    return NextResponse.json(
      {
        message: error instanceof Error
          ? error.message
          : "Unable to export Hygeia product file"
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
