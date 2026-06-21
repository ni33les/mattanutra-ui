import { NextResponse, type NextRequest } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession,
  verifyAdditionalPasskeyRegistration
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const challengeId = text(body.challengeId);
    const response = body.response as RegistrationResponseJSON | undefined;
    const context = await resolveAdminSession({
      csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
      sessionCookie: request.cookies.get(adminSessionCookieName)?.value
    });

    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!challengeId || !response) {
      return NextResponse.json(
        { error: "Registration response is required" },
        { status: 400 }
      );
    }

    await verifyAdditionalPasskeyRegistration({
      challengeId,
      context,
      request,
      response
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify registration" },
      { status: 400 }
    );
  }
}
