import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession,
} from "@/lib/admin-access";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { canAccessRetailOrganisation } from "@/lib/admin-retail-stock-access";
import { hasAdminPermission } from "@/lib/admin-rbac";
import { isUuidValue } from "@/lib/admin-product-helpers";
import {
  buildPlatformProductCatalogueJson,
  buildRetailProductCatalogueJson,
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

async function resolveRetailExport(request: NextRequest, organisationId: string | null) {
  if (!organisationId || !isUuidValue(organisationId)) {
    return {
      error: NextResponse.json(
        { message: "Retail organisation is required for product catalogue export" },
        {
          headers: {
            "Cache-Control": "no-store"
          },
          status: 400
        }
      )
    };
  }

  const context = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  if (!context || !hasAdminPermission(context, "stock.read")) {
    return {
      error: NextResponse.json(
        { message: "Unauthorized" },
        {
          headers: {
            "Cache-Control": "no-store"
          },
          status: 401
        }
      )
    };
  }

  if (!canAccessRetailOrganisation(context, organisationId)) {
    return {
      error: NextResponse.json(
        { message: "Forbidden" },
        {
          headers: {
            "Cache-Control": "no-store"
          },
          status: 403
        }
      )
    };
  }

  return { error: null };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ??
    textOrNull(url.searchParams.get("access_token"));

  try {
    const scope = csvScope(url.searchParams.get("scope"));
    const organisationId = textOrNull(url.searchParams.get("organisationId"), 80);

    if (scope === "platform") {
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

      const payload = await buildPlatformProductCatalogueJson();

      return new Response(JSON.stringify(payload, null, 2) + "\n", {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": 'attachment; filename="platform-product-catalogue.json"',
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    }

    const retailExport = await resolveRetailExport(request, organisationId);

    if (retailExport.error) {
      return retailExport.error;
    }

    const payload = await buildRetailProductCatalogueJson({ organisationId });
    const filename = `retail-product-catalogue-${organisationId}.json`;

    return new Response(JSON.stringify(payload, null, 2) + "\n", {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/json; charset=utf-8"
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
