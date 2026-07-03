import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession
} from "@/lib/admin-access";
import { getOrGenerateCachedAdminPlanCoverageDemandProfile } from "@/lib/admin-plan-demand-generation";
import { adminViewAllowed } from "@/lib/admin-rbac";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function adminContext(request: NextRequest) {
  return resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const context = await adminContext(request);

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const result = await getOrGenerateCachedAdminPlanCoverageDemandProfile({
      archetypes: Array.isArray(body.archetypes) ? body.archetypes : null,
      countryCode: text(body.countryCode) || null,
      locale: isLocale(body.locale) ? body.locale : "en",
      sampleIndex: Number(body.sampleIndex),
      seed: text(body.seed) || null,
      supplementGovernanceHash: text(body.supplementGovernanceHash) || null,
      supplements: Array.isArray(body.supplements) ? body.supplements : null
    });

    return NextResponse.json(
      result,
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Unable to generate product coverage demand profile", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate demand profile"
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
