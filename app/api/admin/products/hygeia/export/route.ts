import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  buildHygeiaProductExportCsv,
  buildRetailHygeiaStockExportCsv
} from "@/lib/hygeia-product-files";

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
    const countryCode = textOrNull(url.searchParams.get("country"), 8);
    const scope = textOrNull(url.searchParams.get("scope"), 40);
    const organisationId = textOrNull(url.searchParams.get("organisationId"), 80);
    const csv = scope === "retail"
      ? await buildRetailHygeiaStockExportCsv({
          organisationId: organisationId ?? ""
        })
      : await buildHygeiaProductExportCsv({ countryCode });
    const fileCountry = countryCode?.toUpperCase() ?? "TH";
    const filename = scope === "retail"
      ? `hygeia-retail-stock-${organisationId ?? "retailer"}.csv`
      : `hygeia-products-${fileCountry}.csv`;

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
