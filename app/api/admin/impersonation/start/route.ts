import { NextResponse, type NextRequest } from "next/server";
import {
  adminCookieOptions,
  adminCsrfCookieName,
  adminSessionCookieName,
  assumeAdminIdentity,
  resolveAdminSession,
  signAdminSessionContext
} from "@/lib/admin-access";
import { requireAdminRouteAccess } from "@/lib/admin-route-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const { context, unauthorized } = await requireAdminRouteAccess(
    request,
    "impersonation.write"
  );

  if (unauthorized || !context) {
    return unauthorized ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  await assumeAdminIdentity({
    actor: context,
    membershipId: text(body.membershipId)
  });

  const refreshed = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });
  const signed = refreshed ? signAdminSessionContext(refreshed) : null;
  const response = NextResponse.json({ ok: true });

  if (refreshed && signed) {
    response.cookies.set(
      adminSessionCookieName,
      signed,
      adminCookieOptions(new Date(refreshed.expiresAt))
    );
  }

  return response;
}
