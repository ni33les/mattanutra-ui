import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession
} from "@/lib/admin-access";
import { normalizeAdminDashboardRange } from "@/lib/admin-dashboard-data";
import { getAdminPlanCoverageSimulationData } from "@/lib/admin-product-coverage";
import { adminViewAllowed } from "@/lib/admin-rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store"
};

async function adminContext(request: NextRequest) {
  return resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });
}

export async function GET(request: NextRequest) {
  const context = await adminContext(request);

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
    ) &&
    !adminViewAllowed(
      context,
      "product-optimisation",
      context.effectiveOrganisation.type
    )
  ) {
    return NextResponse.json(
      { error: "Forbidden" },
      { headers: noStoreHeaders, status: 403 }
    );
  }

  const url = new URL(request.url);

  return NextResponse.json(
    await getAdminPlanCoverageSimulationData({
      countryCode: url.searchParams.get("country"),
      range: normalizeAdminDashboardRange(url.searchParams.get("range") ?? undefined)
    }),
    { headers: noStoreHeaders }
  );
}
