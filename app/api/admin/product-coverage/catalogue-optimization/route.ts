import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  legacyAdminContext,
  resolveAdminSession
} from "@/lib/admin-access";
import {
  runAdminCatalogueOptimization,
  type AdminPlanCoverageSimulationData
} from "@/lib/admin-product-coverage";
import { adminViewAllowed } from "@/lib/admin-rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store"
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function accessTokenFromRequest(request: NextRequest, body: Record<string, unknown>) {
  const url = new URL(request.url);

  return (
    text(request.headers.get("x-admin-dashboard-token")) ||
    text(body.accessToken) ||
    text(url.searchParams.get("access_token")) ||
    null
  );
}

async function adminContext(
  request: NextRequest,
  body: Record<string, unknown>
) {
  const session = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  return session ?? legacyAdminContext(accessTokenFromRequest(request, body));
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const context = await adminContext(request, body);

  if (!context) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { headers: noStoreHeaders, status: 401 }
    );
  }

  if (
    !adminViewAllowed(
      context,
      "plan-coverage-simulator",
      context.effectiveOrganisation.type
    )
  ) {
    return NextResponse.json(
      { error: "Forbidden" },
      { headers: noStoreHeaders, status: 403 }
    );
  }

  const simulationData = body.simulationData as
    | AdminPlanCoverageSimulationData
    | undefined;

  if (!simulationData || typeof simulationData !== "object") {
    return NextResponse.json(
      { error: "Missing simulation data" },
      { headers: noStoreHeaders, status: 400 }
    );
  }

  try {
    return NextResponse.json(
      {
        optimization: runAdminCatalogueOptimization({
          reviewPriorityProducts: Array.isArray(body.reviewPriorityProducts)
            ? body.reviewPriorityProducts
            : null,
          simulationData
        })
      },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error("Unable to calculate catalogue optimization", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to calculate minimum catalogue"
      },
      { headers: noStoreHeaders, status: 500 }
    );
  }
}
