import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  buildPlatformProductCatalogueJson,
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

    if (scope === "platform") {
      const payload = await buildPlatformProductCatalogueJson();

      return new Response(JSON.stringify(payload, null, 2) + "\n", {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": 'attachment; filename="platform-product-catalogue.json"',
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    }

    const csv = await buildProductCatalogueCsv({
      organisationId,
      scope
    });
    const filename =
      organisationId
        ? `retail-product-catalogue-${organisationId}.csv`
        : "retail-product-catalogue.csv";

    return new Response(csv, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  } catch (error) {
    console.error("Unable to export product catalogue", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to export product catalogue"
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
