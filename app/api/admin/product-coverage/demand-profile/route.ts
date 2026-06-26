import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  legacyAdminContext,
  resolveAdminSession
} from "@/lib/admin-access";
import { generateAdminPlanCoverageDemandProfile } from "@/lib/admin-plan-demand-generation";
import { adminViewAllowed } from "@/lib/admin-rbac";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !adminViewAllowed(
      context,
      "plan-coverage-simulator",
      context.effectiveOrganisation.type
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const profile = await generateAdminPlanCoverageDemandProfile({
      archetypes: Array.isArray(body.archetypes) ? body.archetypes : null,
      countryCode: text(body.countryCode) || null,
      locale: isLocale(body.locale) ? body.locale : "en",
      sampleIndex: Number(body.sampleIndex),
      seed: text(body.seed) || null
    });

    return NextResponse.json(
      { profile },
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
