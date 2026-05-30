import { NextResponse, type NextRequest } from "next/server";
import {
  adminCookieOptions,
  adminCsrfCookieName,
  adminSessionCookieName,
  clientAdminSessionContext,
  createAdminInvitation,
  createOrganisation,
  getAdminAccessData,
  legacyAdminContext,
  resolveAdminSession,
  signAdminSessionContext,
  stopAdminImpersonation,
  updateOrganisation,
  updateMembershipRole,
  updateOwnPerson,
  updatePerson,
  assumeAdminIdentity,
  type AdminSessionContext
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";
import { hasAdminPermission, isAdminRole } from "@/lib/admin-rbac";
import { isLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function accessTokenFromRequest(request: NextRequest, body?: Record<string, unknown>) {
  return (
    text(body?.accessToken) ||
    text(request.headers.get("x-admin-dashboard-token")) ||
    text(new URL(request.url).searchParams.get("access_token")) ||
    null
  );
}

async function adminContext(
  request: NextRequest,
  body?: Record<string, unknown>
) {
  const session = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  return session ?? legacyAdminContext(accessTokenFromRequest(request, body));
}

function localeValue(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

function normalSlug(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function accessPayload(context: AdminSessionContext) {
  return {
    data: await getAdminAccessData(context),
    session: clientAdminSessionContext(context)
  };
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

async function accessResponse(
  request: NextRequest,
  context: AdminSessionContext,
  extra: Record<string, unknown> = {}
) {
  const response = NextResponse.json({
    ...(await accessPayload(context)),
    ...extra
  });

  await refreshSessionCookie(request, response);

  return response;
}

export async function GET(request: NextRequest) {
  const context = await adminContext(request);

  if (!context || !hasAdminPermission(context, "access.read")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await accessPayload(context));
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

  const context = await adminContext(request, body);

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const action = text(body.action);

    if (action === "update_self") {
      if (context.isLegacy) {
        return NextResponse.json(
          { error: "A passkey session is required to update settings" },
          { status: 400 }
        );
      }

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
        updated: true
      });

      await refreshSessionCookie(request, response);

      return response;
    }

    if (action === "create_organisation") {
      if (!hasAdminPermission(context, "access.write")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (context.effectiveOrganisation.type !== "platform") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const slug = normalSlug(body.slug);
      const name = text(body.name);

      if (!slug || !name) {
        return NextResponse.json(
          { error: "Organisation name and slug are required" },
          { status: 400 }
        );
      }

      await createOrganisation({
        defaultLocale: localeValue(body.defaultLocale),
        name,
        slug,
        type: "tenant"
      });

      return accessResponse(request, context);
    }

    if (action === "update_organisation") {
      if (!hasAdminPermission(context, "access.write")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (context.effectiveOrganisation.type !== "platform") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const slug = normalSlug(body.slug);
      const name = text(body.name);
      const status = text(body.status);

      if (!slug || !name) {
        return NextResponse.json(
          { error: "Organisation name and slug are required" },
          { status: 400 }
        );
      }

      if (status !== "active" && status !== "archived" && status !== "disabled") {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      await updateOrganisation({
        defaultLocale: localeValue(body.defaultLocale),
        id: text(body.organisationId),
        name,
        slug,
        status
      });

      return accessResponse(request, context);
    }

    if (action === "update_person") {
      if (!hasAdminPermission(context, "access.write")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const displayName = text(body.displayName);
      const status = text(body.status);

      if (!displayName) {
        return NextResponse.json({ error: "Person name is required" }, { status: 400 });
      }

      if (status !== "active" && status !== "disabled" && status !== "invited") {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      await updatePerson({
        actor: context,
        displayName,
        id: text(body.personId),
        preferredLocale: localeValue(body.preferredLocale),
        status
      });

      return accessResponse(request, context);
    }

    if (action === "invite_person") {
      if (!hasAdminPermission(context, "access.write")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const role = text(body.role);

      if (!isAdminRole(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      const invitationResult = await createAdminInvitation({
        actor: context,
        email: text(body.email),
        organisationId: text(body.organisationId),
        preferredLocale: localeValue(body.preferredLocale),
        role
      });

      return accessResponse(request, context, invitationResult);
    }

    if (action === "update_membership") {
      if (!hasAdminPermission(context, "access.write")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const role = text(body.role);
      const status = text(body.status);

      if (!isAdminRole(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      if (status !== "active" && status !== "disabled" && status !== "invited") {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      await updateMembershipRole({
        actor: context,
        membershipId: text(body.membershipId),
        role,
        status
      });

      return accessResponse(request, context);
    }

    if (action === "assume_identity") {
      if (!hasAdminPermission(context, "impersonation.write")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await assumeAdminIdentity({
        actor: context,
        membershipId: text(body.membershipId)
      });

      return accessResponse(request, context, { reloaded: true });
    }

    if (action === "stop_impersonation") {
      await stopAdminImpersonation(context);

      return accessResponse(request, context, { reloaded: true });
    }

    return NextResponse.json({ error: "Unknown access action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Admin access action failed" },
      { status: 400 }
    );
  }
}
