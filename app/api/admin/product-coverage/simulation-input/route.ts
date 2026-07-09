import { NextResponse, type NextRequest } from "next/server";
import { normalizeAdminDashboardRange } from "@/lib/admin-dashboard-data";
import { getAdminPlanCoverageSimulationData } from "@/lib/admin-product-coverage";
import { requireAdminRouteAccess } from "@/lib/admin-route-auth";
import { adminViewAllowed } from "@/lib/admin-rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store"
};

async function adminContext(request: NextRequest) {
  return requireAdminRouteAccess(request, null);
}

export async function GET(request: NextRequest) {
  const { context, unauthorized } = await adminContext(request);

  if (unauthorized || !context) {
    return unauthorized ?? NextResponse.json(
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
