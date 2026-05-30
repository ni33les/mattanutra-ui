import { NextResponse, type NextRequest } from "next/server";
import {
  adminCookieOptions,
  adminCsrfCookieName,
  adminSessionCookieName,
  clientAdminSessionContext,
  getAdminSettingsData,
  resolveAdminSession,
  signAdminSessionContext,
  updateEffectiveOrganisationSettings,
  updateOwnPerson
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";
import { hasAdminPermission } from "@/lib/admin-rbac";
import { isLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function localeValue(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

async function refreshSessionCookie(
  request: NextRequest,
  response: NextResponse
) {
  const refreshed = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });
  const signed = refreshed ? signAdminSessionContext(refreshed) : null;

  if (refreshed && signed) {
    response.cookies.set(
      adminSessionCookieName,
      signed,
      adminCookieOptions(new Date(refreshed.expiresAt))
    );
  }
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const context = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  if (!context || !hasAdminPermission(context, "settings.read")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const action = text(body.action);

    if (action === "update_self") {
      const displayName = text(body.displayName);

      if (!displayName) {
        return NextResponse.json({ error: "Person name is required" }, { status: 400 });
      }

      const updatedContext = await updateOwnPerson({
        context,
        displayName,
        preferredLocale: localeValue(body.preferredLocale)
      });

      if (!updatedContext) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
      }

      const response = NextResponse.json({
        session: clientAdminSessionContext(updatedContext),
        settingsData: await getAdminSettingsData(updatedContext),
        updated: true
      });

      await refreshSessionCookie(request, response);

      return response;
    }

    if (action === "update_organisation") {
      const name = text(body.name);

      if (!name) {
        return NextResponse.json({ error: "Organisation name is required" }, { status: 400 });
      }

      const updatedContext = await updateEffectiveOrganisationSettings({
        context,
        defaultLocale: localeValue(body.defaultLocale),
        name
      });
      const response = NextResponse.json({
        session: clientAdminSessionContext(updatedContext),
        settingsData: await getAdminSettingsData(updatedContext),
        updated: true
      });

      await refreshSessionCookie(request, response);

      return response;
    }

    return NextResponse.json({ error: "Unknown settings action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Admin settings update failed" },
      { status: 400 }
    );
  }
}
