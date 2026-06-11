import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";
import { hasAdminPermission } from "@/lib/admin-rbac";
import { buildLineOfficialAccountMessageUrl } from "@/lib/chat-links";
import { createOrganisationLineConnectToken } from "@/lib/communications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function canAccessEffectiveOrganisation(
  context: NonNullable<Awaited<ReturnType<typeof resolveAdminSession>>>,
  requestedOrganisationId: string
) {
  return requestedOrganisationId === context.effectiveOrganisation.id;
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const context = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  if (!context || !hasAdminPermission(context, "communications.write")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const organisationId = text(body.organisationId) || context.effectiveOrganisation.id;
  const displayName = text(body.displayName);
  const locale = text(body.locale);

  if (!canAccessEffectiveOrganisation(context, organisationId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!displayName) {
    return NextResponse.json({ error: "Enter a contact name" }, { status: 400 });
  }

  const token = await createOrganisationLineConnectToken({
    displayName,
    locale,
    organisationId
  });
  const command = `MN ${token.code}`;

  return NextResponse.json({
    token: {
      ...token,
      command,
      lineUrl: buildLineOfficialAccountMessageUrl(command)
    }
  });
}
