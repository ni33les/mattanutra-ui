import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  buildProductCatalogueCsv,
  type ProductCatalogueCsvScope
} from "@/lib/product-catalogue-csv";

export const runtime = "nodejs";

function textOrNull(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function csvScope(value: unknown): ProductCatalogueCsvScope {
  return value === "retail" ? "retail" : "platform";
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
    const scope = csvScope(url.searchParams.get("scope"));
    const organisationId = textOrNull(url.searchParams.get("organisationId"), 80);
    const csv = await buildProductCatalogueCsv({
      organisationId,
      scope
    });
    const filename =
      scope === "retail" && organisationId
        ? `retail-product-catalogue-${organisationId}.csv`
        : "platform-product-catalogue.csv";

    return new Response(csv, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  } catch (error) {
    console.error("Unable to export product catalogue CSV", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to export product catalogue CSV"
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
