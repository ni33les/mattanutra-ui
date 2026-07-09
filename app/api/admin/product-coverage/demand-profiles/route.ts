import { NextResponse, type NextRequest } from "next/server";
import { readCachedAdminPlanCoverageDemandProfiles } from "@/lib/admin-plan-demand-generation";
import { requireAdminRouteAccess } from "@/lib/admin-route-auth";
import { adminViewAllowed } from "@/lib/admin-rbac";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function adminContext(request: NextRequest) {
  return requireAdminRouteAccess(request, null);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { context, unauthorized } = await adminContext(request);

  if (unauthorized || !context) {
    return unauthorized ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await readCachedAdminPlanCoverageDemandProfiles({
      archetypes: Array.isArray(body.archetypes) ? body.archetypes : null,
      countryCode: text(body.countryCode) || null,
      locale: isLocale(body.locale) ? body.locale : "en",
      sampleIndexes: Array.isArray(body.sampleIndexes) ? body.sampleIndexes : null,
      seed: text(body.seed) || null,
      supplementGovernanceHash: text(body.supplementGovernanceHash) || null,
      supplements: Array.isArray(body.supplements) ? body.supplements : null
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Unable to read product coverage demand profile cache", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read demand profile cache"
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
